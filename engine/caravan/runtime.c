#include "caravan.h"
#include <string.h>

CE_Entity ce_entities[CE_MAX_ENTITIES];
CE_State ce_state;
uint8_t ce_is_cgb, ce_scene, ce_pause, ce_active_screen;
uint8_t ce_used;
uint16_t ce_scores[5];
volatile uint8_t ce_trace[24];
static uint16_t event_cursor;
static CE_Event next_event;
static uint8_t active[CE_MAX_ENTITIES];
static CE_Entity *targets[9];
static CE_Box *target_boxes[9];
static uint8_t target_count;
static CE_Box boxes[CE_MAX_ENTITIES], player_box;
static CE_Box *box_a, *box_b;
static void box(CE_Box *b, uint8_t asset, int16_t x, int16_t y);
static volatile uint8_t frame_due;
static void count_frame(void) NONBANKED {
    if (frame_due != 255u) ++frame_due;
    if (ce_scene == 1u) SHOW_WIN;
}
/* A top-docked Window otherwise covers the entire playfield. Split at line 16. */
static void hud_scanline(void) NONBANKED { if (ce_scene == 1u && !ce_hud_bottom) HIDE_WIN; }

void ce_copy(uint8_t *dest, const CE_Data *source, uint16_t offset, uint16_t length) NONBANKED {
    uint8_t bank = CURRENT_BANK;
    SWITCH_ROM(source->bank);
    memcpy(dest, source->data + offset, length);
    SWITCH_ROM(bank);
}
uint8_t ce_read(const CE_Data *source, uint16_t offset) NONBANKED {
    uint8_t value, bank = CURRENT_BANK;
    SWITCH_ROM(source->bank); value = source->data[offset]; SWITCH_ROM(bank);
    return value;
}
static void read_event(void) {
    if (event_cursor < ce_stages[ce_state.stage].event_count)
        ce_copy((uint8_t *)&next_event, &ce_stages[ce_state.stage].events, event_cursor * 9u, 9u);
}
void ce_reset(uint8_t stage, uint8_t new_game) NONBANKED {
    if (new_game) { memset(&ce_state, 0, sizeof(ce_state)); ce_state.lives = ce_player_lives; }
    memset(ce_entities, 0, sizeof(ce_entities));
    ce_used = 0;
    ce_state.stage = stage; ce_state.stage_tick = 0; ce_state.camera = 0;
    ce_state.scroll = ce_stages[stage].scroll; ce_state.boss_defeated = 0;
    ce_state.player_x = ce_player_start_x; ce_state.player_y = ce_player_start_y;
    ce_state.invulnerable = ce_player_invulnerability; event_cursor = 0; read_event();
    ce_state.cooldown = ce_patterns[ce_player_weapon].delay; ce_state.player_sequence = 0;
}
static uint8_t allocate(uint8_t kind, uint8_t asset) {
    uint8_t i, count = 0, oam = ce_assets[ce_player_asset].tiles, slot = CE_NONE;
    CE_Entity *e = ce_entities;
    for (i = 0; i != ce_used; ++i, ++e) {
        if (!e->kind) { if (slot == CE_NONE) slot = i; }
        else { oam += ce_assets[e->asset].tiles; if (e->kind == kind) ++count; }
    }
    if (slot == CE_NONE && ce_used < CE_MAX_ENTITIES) slot = ce_used;
    if (slot == CE_NONE || oam + ce_assets[asset].tiles > 40u ||
        count >= (kind == CE_ENEMY ? 8u : kind == CE_BOSS ? 1u : kind == CE_PSHOT ? 6u : kind == CE_FX ? 4u : 16u)) {
        ++ce_state.dropped; return CE_NONE;
    }
    memset(&ce_entities[slot], 0, sizeof(CE_Entity));
    ce_entities[slot].kind = kind; ce_entities[slot].asset = asset;
    if (slot == ce_used) ++ce_used;
    return slot;
}
static void explode(int16_t x, int16_t y) {
    uint8_t slot; CE_Entity *e;
    if (ce_explosion_asset == CE_NONE) return;
    slot = allocate(CE_FX, ce_explosion_asset); if (slot == CE_NONE) return;
    e = &ce_entities[slot]; e->x = x; e->y = y; e->lifetime = ce_explosion_duration;
}
static void spawn_actor(uint8_t kind, uint8_t ref, int16_t x, int16_t y) {
    const CE_Actor *actor = kind == CE_BOSS ? &ce_bosses[ref] : &ce_enemies[ref];
    uint8_t slot = allocate(kind, actor->asset); CE_Entity *e;
    if (slot == CE_NONE) return;
    e = &ce_entities[slot]; e->ref = ref; e->hp = actor->hp; e->damage = 1;
    e->x = e->base_x = x * 16; e->y = e->base_y = y * 16;
    box(&boxes[slot], e->asset, e->x, e->y);
}
static uint8_t aim(int16_t dx, int16_t dy) {
    uint8_t i, best = 0; int16_t score, maximum = -32767;
    for (i = 0; i != 16u; ++i) {
        score = dx * ce_sin[i] - dy * ce_cos[i];
        if (score > maximum) { maximum = score; best = i; }
    }
    return best;
}
static void shoot(uint8_t pattern, uint8_t source, int16_t x, int16_t y, uint8_t friendly, uint8_t sequence) {
    const CE_Pattern *p; const CE_Asset *a; uint8_t emitter, n, base, angle, slot;
    int16_t px, py; CE_Entity *e;
    if (pattern == CE_NONE) return;
    p = &ce_patterns[pattern]; a = &ce_assets[source];
    for (emitter = 0; emitter != a->emitters; ++emitter) {
        px = x + (int16_t)a->emitter_xy[emitter * 2u] * 16;
        py = y + (int16_t)a->emitter_xy[emitter * 2u + 1u] * 16;
        base = p->angle;
        if (p->kind == 1u) base += aim((ce_state.player_x - px) / 16, (ce_state.player_y - py) / 16);
        if (p->kind == 4u) base += sequence * p->rotation;
        for (n = 0; n != p->count; ++n) {
            slot = allocate(friendly ? CE_PSHOT : CE_ESHOT, p->asset); if (slot == CE_NONE) continue;
            angle = (base + p->angles[n]) & 15u;
            e = &ce_entities[slot]; e->ref = pattern; e->x = e->base_x = px; e->y = e->base_y = py;
            e->vx = ((int16_t)ce_sin[angle] * p->speed) / 16;
            e->vy = (-(int16_t)ce_cos[angle] * p->speed) / 16;
            e->hp = 1; e->lifetime = p->lifetime; e->damage = p->damage;
            box(&boxes[slot], e->asset, e->x, e->y);
        }
    }
}
static void box(CE_Box *b, uint8_t asset, int16_t x, int16_t y) {
    const CE_Hitbox *a = &ce_hitboxes[asset];
    b->left = x / 16 + 128 + a->x; b->top = y / 16 + 128 + a->y;
    b->right = b->left + a->w; b->bottom = b->top + a->h;
}
static uint8_t overlap(void) {
    return box_a->left < box_b->right && box_a->right > box_b->left &&
        box_a->top < box_b->bottom && box_a->bottom > box_b->top;
}
static uint8_t wall(CE_Box *b) {
    const CE_Stage *s = &ce_stages[ce_state.stage];
    int16_t right = b->right - 129, bottom = b->bottom - 129, bx = b->left - 128, by = b->top - 128;
    uint8_t top = ce_hud_bottom ? 0u : 16u, x, x1, x2;
    uint16_t row, last, world, index, camera = ce_state.camera >> 4;
    if (!s->has_walls || right < 0 || bx >= 160 || bottom < top) return 0;
    x1 = bx < 0 ? 0u : (uint16_t)bx >> 3;
    x2 = right >= 160 ? 19u : (uint16_t)right >> 3;
    row = ((uint16_t)(by < top ? 0 : by - top) + camera) >> 3;
    last = ((uint16_t)(bottom - top) + camera) >> 3;
    for (; row <= last; ++row) {
        world = s->loop && row >= s->height ? row % s->height : row; if (world >= s->height) continue;
        index = world * 20u + x1;
        for (x = x1; x <= x2; ++x, ++index) if (ce_read(&s->walls[index >> 12], index & 4095u)) return 1;
    }
    return 0;
}
static void hit_player(void) {
    if (ce_state.invulnerable || ce_state.result) return;
    explode(ce_state.player_x, ce_state.player_y);
    ce_sound(2); --ce_state.lives;
    if (!ce_state.lives) ce_state.result = 1;
    else { ce_state.invulnerable = ce_player_invulnerability; ce_state.player_x = ce_player_start_x; ce_state.player_y = ce_player_start_y; }
}
static void move_actor(CE_Entity *e, const CE_Motion *m, uint16_t age) {
    uint16_t t, quarter, part; uint8_t i, phase; int16_t span, offset = 0; const CE_Point *p;
    if (m->kind == 3u) {
        t = m->points[m->count - 1u].frame;
        age = m->loop && t ? age % t : (age > t ? t : age);
        i = 0; while (i < m->count - 2u && age >= m->points[i + 1u].frame) ++i;
        p = &m->points[i]; t = age - p->frame;
        e->x = e->base_x + p->x + p->vx * t; e->y = e->base_y + p->y + p->vy * t;
        return;
    }
    if (m->kind == 2u) {
        i = (age % m->period) * 16u / m->period;
        e->x = e->base_x + m->vx * age + (int16_t)ce_sin[i] * m->amplitude;
        e->y = e->base_y + m->vy * age; return;
    }
    if (m->kind == 1u) {
        quarter = m->period >> 2; phase = (age % (quarter * 4u)) / quarter; part = age % quarter;
        span = part * m->amplitude / quarter;
        offset = phase == 0u ? span : phase == 1u ? m->amplitude - span : phase == 2u ? -span : -m->amplitude + span;
    }
    e->x = e->base_x + m->vx * age + offset * 16; e->y = e->base_y + m->vy * age;
}
static void add_score(uint16_t value) {
    ce_state.score = 65535u - ce_state.score < value ? 65535u : ce_state.score + value;
}
static void step_player(uint8_t input) {
    uint8_t top = ce_hud_bottom ? 0u : 16u;
    int16_t limit; const CE_Asset *player = &ce_assets[ce_player_asset];
    const CE_Pattern *weapon = &ce_patterns[ce_player_weapon];
    if (input & J_RIGHT) ce_state.player_x += ce_player_speed;
    if (input & J_LEFT) ce_state.player_x -= ce_player_speed;
    if (input & J_DOWN) ce_state.player_y += ce_player_speed;
    if (input & J_UP) ce_state.player_y -= ce_player_speed;
    limit = (int16_t)player->ox * 16; if (ce_state.player_x < limit) ce_state.player_x = limit;
    limit = (160 - player->width + player->ox) * 16; if (ce_state.player_x > limit) ce_state.player_x = limit;
    limit = (top + player->oy) * 16; if (ce_state.player_y < limit) ce_state.player_y = limit;
    limit = (top + 128u - player->height + player->oy) * 16u; if (ce_state.player_y > limit) ce_state.player_y = limit;
    if (!(input & (J_A | J_B))) { ce_state.cooldown = weapon->delay; ce_state.player_sequence = 0; }
    else if (ce_state.cooldown) --ce_state.cooldown;
    else if (!weapon->repeats || ce_state.player_sequence < weapon->repeats) {
        shoot(ce_player_weapon, ce_player_asset, ce_state.player_x, ce_state.player_y, 1, ce_state.player_sequence++);
        ce_state.cooldown = weapon->interval - 1u; ce_sound(0);
    }
    if (ce_state.invulnerable) --ce_state.invulnerable;
}
static uint8_t stage_events(void) {
    uint16_t end, before; uint8_t finish = 0;
    const CE_Stage *stage = &ce_stages[ce_state.stage];
    before = ce_state.camera; ce_state.camera += ce_state.scroll;
    end = stage->height * 128u;
    if (stage->loop) { if (end && ce_state.camera >= end) ce_state.camera -= end; }
    else { end -= 2048u; if (ce_state.camera < before || ce_state.camera > end) ce_state.camera = end; }
    while (event_cursor < stage->event_count && next_event.frame <= ce_state.stage_tick) {
        if (next_event.kind <= 2u) spawn_actor(next_event.kind, next_event.ref, next_event.x, next_event.y);
        else if (next_event.kind == 3u) ce_state.scroll = next_event.value;
        else finish = 1;
        ++event_cursor; read_event();
    }
    return finish;
}
static void step_actor(CE_Entity *e) {
    uint8_t k, pattern, primary, layer_count;
    uint16_t age, sequence; const uint8_t *layers;
    const CE_Actor *actor; const CE_Phase *phase; const CE_Motion *motion; const CE_Pattern *shot;
            actor = e->kind == CE_BOSS ? &ce_bosses[e->ref] : &ce_enemies[e->ref];
            motion = actor->motion; pattern = actor->pattern; age = e->age;
            layers = actor->layer; layer_count = actor->layers;
            if (e->kind == CE_BOSS) {
                phase = &actor->phase[e->phase];
                if (e->phase + 1u < actor->phases && (phase->until ? e->hp <= phase->threshold : e->phase_age >= phase->threshold)) {
                    ++e->phase; e->phase_age = 0; e->sequence = 0; e->base_x = e->x; e->base_y = e->y;
                }
                phase = &actor->phase[e->phase]; motion = phase->motion; pattern = phase->pattern; age = e->phase_age;
                layers = phase->layer; layer_count = phase->layers;
            }
            move_actor(e, motion, age);
            primary = pattern;
            for (k = 0; k <= layer_count; ++k) {
                pattern = k ? layers[k - 1u] : primary;
                if (pattern == CE_NONE) continue;
                shot = &ce_patterns[pattern];
                if (age >= shot->delay && (age - shot->delay) % shot->interval == 0u) {
                    sequence = (age - shot->delay) / shot->interval;
                    if (!shot->repeats || sequence < shot->repeats) shoot(pattern, e->asset, e->x, e->y, 0, sequence);
                }
            }
            ++e->age; ++e->phase_age;
}
static void step_entities(void) {
    uint8_t i, active_count = ce_used;
    CE_Entity *e; const CE_Stage *stage = &ce_stages[ce_state.stage];
    for (i = 0, e = ce_entities; i != active_count; ++i, ++e) active[i] = e->kind;
    for (i = 0, e = ce_entities; i != active_count; ++i, ++e) {
        if (!active[i]) continue;
        if (e->kind == CE_FX) { ++e->age; if (e->age >= e->lifetime) e->kind = 0; }
        else if (e->kind >= CE_PSHOT) {
            e->x += e->vx; e->y += e->vy; ++e->age;
            box(&boxes[i], e->asset, e->x, e->y);
            if (e->age >= e->lifetime || (stage->has_walls && wall(&boxes[i]))) e->kind = 0;
        } else {
            step_actor(e);
            box(&boxes[i], e->asset, e->x, e->y);
        }
        if ((uint16_t)(e->x + 512) > 3584u || (uint16_t)(e->y + 512) > 3328u) e->kind = 0;
    }
}
static void collide_shots(void) {
    uint8_t i, j; CE_Entity *e, *target; const CE_Actor *actor;
    target_count = 0;
    for (i = 0, e = ce_entities; i != ce_used; ++i, ++e) if (e->kind == CE_ENEMY || e->kind == CE_BOSS) { targets[target_count] = e; target_boxes[target_count++] = &boxes[i]; }
    for (i = 0, e = ce_entities; i != ce_used; ++i, ++e) {
        if (e->kind != CE_PSHOT) continue;
        box_a = &boxes[i];
        for (j = 0; j != target_count; ++j) {
            target = targets[j]; if (target->kind != CE_ENEMY && target->kind != CE_BOSS) continue;
            box_b = target_boxes[j]; if (!overlap()) continue;
            e->kind = 0;
            if (target->hp <= e->damage) {
                actor = target->kind == CE_BOSS ? &ce_bosses[target->ref] : &ce_enemies[target->ref];
                add_score(actor->score); if (target->kind == CE_BOSS) ce_state.boss_defeated = 1;
                target->kind = 0; ce_sound(1);
                explode(target->x, target->y);
            } else target->hp -= e->damage;
            break;
        }
    }
}
static void collide_player(void) {
    uint8_t i; CE_Entity *e;
    box(&player_box, ce_player_asset, ce_state.player_x, ce_state.player_y); box_a = &player_box;
    if (ce_stages[ce_state.stage].has_walls && wall(box_a)) hit_player();
    for (i = 0, e = ce_entities; i != ce_used; ++i, ++e) {
        if (!e->kind || e->kind == CE_PSHOT || e->kind == CE_FX) continue;
        box_b = &boxes[i];
        if (overlap()) { hit_player(); if (e->kind == CE_ESHOT) e->kind = 0; }
    }
}
void ce_step(uint8_t input) NONBANKED {
    uint8_t finish; const CE_Stage *stage = &ce_stages[ce_state.stage];
    if (ce_state.result) return;
    ce_trace[22] = 1; /* Keep entity RAM and the public trace in the same snapshot. */
    step_player(input); finish = stage_events(); step_entities(); collide_shots(); collide_player();
    while (ce_used && !ce_entities[ce_used - 1u].kind) --ce_used;
    ++ce_state.tick; ++ce_state.stage_tick;
    if (!ce_state.result && (finish || (ce_state.boss_defeated && stage->clear_boss) || ce_state.stage_tick >= stage->duration)) {
        add_score(ce_clear_bonus);
        ce_sound(3);
        if (ce_campaign && ce_state.stage + 1u < ce_stage_count) { ce_reset(ce_state.stage + 1u, 0); ce_load_stage(); }
        else ce_state.result = 2;
    }
}
uint8_t ce_boss_hp(void) NONBANKED {
    uint8_t i; CE_Entity *e = ce_entities;
    for (i = ce_used; i; --i, ++e) if (e->kind == CE_BOSS) return e->hp;
    return 0;
}
void ce_trace_write(void) NONBANKED {
    uint8_t i, count = 0, hp = 0, phase = 0; CE_Entity *e = ce_entities;
    ce_trace[22] = 1; /* Diagnostic seqlock: host ignores an incomplete snapshot. */
    for (i = ce_used; i; --i, ++e) { if (e->kind) ++count; if (e->kind == CE_BOSS) { hp = e->hp; phase = e->phase; } }
    ce_trace[0] = 'C'; ce_trace[1] = 'E'; ce_trace[2] = ce_state.tick; ce_trace[3] = ce_state.tick >> 8;
    ce_trace[4] = ce_state.stage; ce_trace[5] = ce_state.score; ce_trace[6] = ce_state.score >> 8;
    ce_trace[7] = ce_state.lives; ce_trace[8] = ce_state.player_x; ce_trace[9] = ce_state.player_x >> 8;
    ce_trace[10] = ce_state.player_y; ce_trace[11] = ce_state.player_y >> 8; ce_trace[12] = hp;
    ce_trace[13] = count; ce_trace[14] = ce_state.dropped; ce_trace[15] = ce_state.dropped >> 8;
    ce_trace[16] = ce_state.result; ce_trace[17] = ce_scene; ce_trace[18] = ce_state.stage_tick; ce_trace[19] = ce_state.stage_tick >> 8;
    ce_trace[20] = phase;
    ce_trace[22] = 0;
}
void ce_sound(uint8_t effect) NONBANKED {
    if (!effect) { NR10_REG = 0; NR11_REG = 0x80; NR12_REG = 0x42; NR13_REG = 0xc0; NR14_REG = 0x87; }
    else if (effect == 3u) { NR10_REG = 0x16; NR11_REG = 0x40; NR12_REG = 0xf3; NR13_REG = 0x70; NR14_REG = 0x87; }
    else { NR41_REG = effect == 1u ? 0x08 : 0x00; NR42_REG = effect == 1u ? 0x73 : 0xf4; NR43_REG = effect == 1u ? 0x35 : 0x65; NR44_REG = 0x80; }
}
static void record_score(void) {
    uint8_t i, j; for (i = 0; i != 5u; ++i) if (ce_state.score > ce_scores[i]) {
        for (j = 4; j > i; --j) ce_scores[j] = ce_scores[j - 1u]; ce_scores[i] = ce_state.score; break;
    }
}
void ce_run(void) NONBANKED {
    uint8_t input, pressed, previous = 0, updates, due;
    ce_is_cgb = _cpu == CGB_TYPE; NR52_REG = 0x80; NR50_REG = 0x77; NR51_REG = 0xff;
    add_VBL(count_frame);
    add_LCD(hud_scanline); add_LCD(nowait_int_handler);
    LYC_REG = 16; STAT_REG = STATF_LYC;
    set_interrupts(VBL_IFLAG | LCD_IFLAG);
    ce_scene = 0; ce_load_screen(0);
    for (;;) {
        vsync(); input = joypad(); pressed = input & ~previous; previous = input;
        if (ce_scene == 1u) {
            if (pressed & J_START) ce_pause = !ce_pause;
            if (!ce_pause) {
                for (updates = 0; updates != 4u && !ce_state.result; ++updates) {
                    CRITICAL { due = frame_due; if (due) --frame_due; }
                    if (!due) break;
                    ce_step(input);
                }
                ce_render();
            } else { CRITICAL { frame_due = 0; } }
            if (ce_state.result) {
                record_score(); ce_scene = ce_state.result == 1u ? 2u : 3u; ce_load_screen(ce_scene - 1u);
            }
        } else if (ce_scene == 0u) {
            if (pressed & (J_START | J_A)) { ce_reset(ce_campaign ? 0u : ce_start_stage, 1); ce_scene = 1; ce_pause = 0; ce_load_stage(); CRITICAL { frame_due = 0; } }
            else if (pressed & J_SELECT) { ce_scene = 4; ce_load_screen(3); }
        } else if (pressed & (J_START | J_A | J_B | J_SELECT)) { ce_scene = 0; ce_load_screen(0); }
        ce_trace_write();
    }
}
