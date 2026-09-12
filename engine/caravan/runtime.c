#include "caravan.h"
#include "music.h"
#include "mainloop.h"
#include <string.h>
#include <stddef.h>

/* The SM83 kernels below consume these byte offsets (GBDK/SDCC, no padding). */
typedef char ce_entity_layout_check[(sizeof(CE_Entity) == 25u && offsetof(CE_Entity, x) == 12u && offsetof(CE_Entity, vx) == 20u) ? 1 : -1];
typedef char ce_hitbox_layout_check[(sizeof(CE_Hitbox) == 4u && sizeof(CE_Box) == 8u) ? 1 : -1];
typedef char ce_shot_layout_check[(CE_MAX_ENTITIES <= 64u && sizeof(OAM_item_t) == 4u) ? 1 : -1];

CE_Entity ce_entities[CE_MAX_ENTITIES];
CE_State ce_state;
/* Title-screen time bindings are legal before the first gameplay reset. */
const CE_Stage *ce_stage = ce_stages;
int16_t ce_shot_x[CE_MAX_ENTITIES], ce_shot_y[CE_MAX_ENTITIES];
int16_t ce_shot_vx[CE_MAX_ENTITIES], ce_shot_vy[CE_MAX_ENTITIES];
uint16_t ce_shot_age[CE_MAX_ENTITIES], ce_shot_lifetime[CE_MAX_ENTITIES];
int16_t ce_shot_px[CE_MAX_ENTITIES], ce_shot_py[CE_MAX_ENTITIES];
OAM_item_t ce_shot_oam[CE_MAX_ENTITIES];
uint8_t ce_shot_simple[CE_MAX_ENTITIES];
static uint8_t shot_ox[CE_MAX_ENTITIES], shot_oy[CE_MAX_ENTITIES];
static uint8_t shot_range_index[CE_MAX_ENTITIES];
static uint8_t shot_frames[CE_MAX_ENTITIES], shot_frame[CE_MAX_ENTITIES], shot_left[CE_MAX_ENTITIES];
static uint8_t shot_top, shot_bottom;
uint8_t ce_is_cgb, ce_scene, ce_pause, ce_active_screen;
uint8_t ce_used;
uint8_t ce_pool_counts[7], ce_pool_oam;
static uint8_t free_slots[CE_FREE_GROUPS];
uint16_t ce_scores[5], ce_respawn;
uint8_t ce_character, ce_player_asset, ce_player_weapon, ce_player_speed, ce_player_focus_weapon, ce_player_focus_speed;
uint8_t ce_bombs, ce_bomb_latch, ce_bomb_left;
uint16_t ce_music_time;
static uint8_t hit_sound_wait;
volatile uint8_t ce_trace[24];
uint16_t event_cursor;
CE_Event next_event;
static uint8_t active[CE_MAX_ENTITIES];
static uint16_t next_attack[CE_MAX_ENTITIES * 4u];
uint8_t ce_victory_frame;
uint8_t defeated_asset;
int16_t defeated_x, defeated_y;
static CE_Entity *targets[CE_MAX_ENEMIES + 1u];
static CE_Box *target_boxes[CE_MAX_ENEMIES + 1u];
static uint8_t target_count, target_slots[CE_MAX_ENEMIES + 1u];
static CE_Box boxes[CE_MAX_ENTITIES], player_box;
static CE_Entity player_collision_pose;
static CE_Box *box_a, *box_b;
/* Up to 64 source assets; the compiler emits only sprite assets here.
 * A bullet/player test needs only its center and these precomputed intervals,
 * not four freshly constructed 16-bit edges for every moving bullet. */
static uint8_t player_ranges[64u * 4u];
static int16_t player_delta_x, player_delta_y;
static void prepare_player_ranges(void) {
    uint8_t i; uint8_t *out = player_ranges;
    const CE_Hitbox *p = &ce_hitboxes[ce_player_asset], *b = ce_hitboxes;
    for (i = 0; i != ce_asset_count; ++i, ++b) {
        *out++ = 129 + p->x - b->x - b->w;
        *out++ = 127 + p->x + p->w - b->x;
        *out++ = 129 + p->y - b->y - b->h;
        *out++ = 127 + p->y + p->h - b->y;
    }
}
static void box(CE_Box *b, const CE_Entity *e);
static void prepare_shot(uint8_t slot);
void ce_init_shot_visual(uint8_t slot) NONBANKED {
    const CE_Asset *a = &ce_assets[ce_entities[slot].asset];
    shot_ox[slot] = 8u - a->ox; shot_oy[slot] = 16u - a->oy;
    ce_shot_oam[slot].tile = a->first_tile;
    ce_shot_oam[slot].prop = ce_is_cgb ? a->palette : 0u;
    ce_shot_simple[slot] = a->tiles == 1u;
    shot_range_index[slot] = ce_entities[slot].asset * 4u;
    shot_frames[slot] = a->tiles == 1u ? a->frames : 1u;
    shot_frame[slot] = 0; shot_left[slot] = a->durations[0];
    prepare_shot(slot);
}
/* Bullet ages advance exactly once; unlike player blink there are no skipped
 * renders to decode. The 16-bit wrap must explicitly restart at frame zero. */
static void advance_shot_animation(uint8_t slot) {
    static uint8_t frame; static const CE_Asset *a;
    if (ce_shot_age[slot]) {
        if (--shot_left[slot]) return;
        frame = shot_frame[slot] + 1u;
        if (frame == shot_frames[slot]) frame = 0;
    } else frame = 0;
    a = &ce_assets[ce_entities[slot].asset];
    shot_frame[slot] = frame; shot_left[slot] = a->durations[frame];
    ce_shot_oam[slot].tile = a->first_tile + frame;
}
void ce_count_frame(void) NONBANKED {
    if ((ce_scene == 1u || ce_scene == 8u) && ce_battle_mode != 2u) SHOW_WIN;
}
/* A top-docked Window otherwise covers the entire playfield. */
void ce_hud_scanline(void) NONBANKED { if ((ce_scene == 1u || ce_scene == 8u) && !ce_hud_bottom) HIDE_WIN; }

void ce_copy(uint8_t *dest, const CE_Data *source, uint16_t offset, uint16_t length) NONBANKED {
    uint8_t bank = CURRENT_BANK, source_bank = source->bank;
    const uint8_t *data = source->data;
    SWITCH_ROM(source_bank);
    memcpy(dest, data + offset, length);
    SWITCH_ROM(bank);
}
uint8_t ce_read(const CE_Data *source, uint16_t offset) NONBANKED {
    uint8_t value, bank = CURRENT_BANK, source_bank = source->bank;
    const uint8_t *data = source->data;
    SWITCH_ROM(source_bank); value = data[offset]; SWITCH_ROM(bank);
    return value;
}
void ce_map_copy(uint8_t *dest, const CE_Data *data, uint16_t offset, uint8_t length) NONBANKED {
    uint8_t n;
    while (length) {
        n = (offset & 4095u) + length > 4096u ? 4096u - (offset & 4095u) : length;
        ce_copy(dest, &data[offset >> 12], offset & 4095u, n);
        dest += n; offset += n; length -= n;
    }
}
uint16_t ce_map_index(uint16_t x, uint16_t y) NONBANKED {
    const CE_Stage *s = ce_stage;
    return s->horizontal ? x * s->height + y : y * s->width + x;
}
void ce_reset(uint8_t stage, uint8_t new_game) NONBANKED {
    if (new_game) { ce_select_player(ce_character); ce_bombs=ce_bomb_stock; ce_bomb_left=0; ce_respawn = 0; memset(&ce_state, 0, sizeof(ce_state)); ce_state.lives = ce_player_lives; }
    ce_bomb_latch=1;
    ce_battle_mode = 0; ce_battle_asset = CE_NONE; ce_boss_invulnerable = 0; ce_transition_state = 0; ce_bg_clear();
    memset(ce_entities, 0, sizeof(ce_entities));
    ce_used = 0; memset(ce_pool_counts, 0, sizeof(ce_pool_counts));
    memset(free_slots, 255, sizeof(free_slots));
    free_slots[CE_FREE_GROUPS - 1u] = (CE_MAX_ENTITIES & 7u) ? (1u << (CE_MAX_ENTITIES & 7u)) - 1u : 255u;
    ce_pool_oam = ce_assets[ce_player_asset].tiles;
    shot_top = ce_hud_bottom ? 9u : ce_hud_height + 9u;
    shot_bottom = ce_hud_bottom ? 160u - ce_hud_height : 160u;
    ce_state.stage = stage; ce_stage = &ce_stages[stage]; ce_state.stage_tick = 0; ce_state.camera = ce_stages[stage].scroll_down ? ce_camera_limit() : 0;
    ce_terrain_reset();
    ce_stage_misses = 0; ce_state.scroll = ce_stages[stage].scroll; ce_state.boss_defeated = 0;
    ce_state.player_x = ce_player_start_x; ce_state.player_y = ce_player_start_y;
    ce_state.invulnerable = ce_respawn ? 0 : ce_player_invulnerability; event_cursor = 0; ce_read_event();
    ce_state.cooldown = ce_patterns[ce_player_weapon].delay; ce_state.player_sequence = 0;
    ce_state.weapon_mode = 0;
    prepare_player_ranges();
    ce_music_play(ce_stages[stage].music);
}
uint8_t allocate(uint8_t kind, uint8_t asset) {
    uint8_t group, bit = 1u, slot, reserve = kind == CE_ITEM ? 0u : ce_entity_limits[CE_ITEM] - ce_pool_counts[CE_ITEM]; CE_Entity *e;
    /* Ordinary one-at-a-time allocation keeps the original short path. The
     * free bitmap enforces entity capacity; only atomic volleys need preflight. */
    if (ce_pool_oam + ce_assets[asset].tiles + reserve > 40u || ce_pool_counts[kind] >= ce_entity_limits[kind]) {
        ++ce_state.dropped; return CE_NONE;
    }
    for (group = 0; group != CE_FREE_GROUPS && !free_slots[group]; ++group) {}
    if (group == CE_FREE_GROUPS) { ++ce_state.dropped; return CE_NONE; }
    slot = group << 3;
    while (!(free_slots[group] & bit)) { bit <<= 1; ++slot; }
    free_slots[group] &= ~bit;
    e = &ce_entities[slot]; memset(e, 0, sizeof(CE_Entity));
    e->kind = kind; e->asset = asset;
    ++ce_pool_counts[kind]; ce_pool_oam += ce_assets[asset].tiles;
    if (slot >= ce_used) ce_used = slot + 1u;
    return slot;
}
void release(uint8_t slot) {
    CE_Entity *e = &ce_entities[slot];
    if (!e->kind) return;
    --ce_pool_counts[e->kind]; ce_pool_oam -= ce_assets[e->asset].tiles;
    e->kind = 0; active[slot] = 0;
    free_slots[slot >> 3] |= 1u << (slot & 7u);
}
void ce_clear_combat(uint8_t all) NONBANKED {
    uint8_t i;
    for (i = 0; i != ce_used; ++i) if (all || ce_entities[i].kind == CE_PSHOT || ce_entities[i].kind == CE_ESHOT) release(i);
    ce_bg_clear();
}
void explode(int16_t x, int16_t y) {
    uint8_t slot; CE_Entity *e;
    if (ce_explosion_asset == CE_NONE) return;
    slot = allocate(CE_FX, ce_explosion_asset); if (slot == CE_NONE) return;
    e = &ce_entities[slot]; e->x = x; e->y = y; e->lifetime = ce_explosion_duration;
}
uint8_t ce_aim(int16_t dx, int16_t dy) NONBANKED {
    uint8_t i, angle, best = 0;
    int16_t ax = dx < 0 ? -dx : dx, ay = dy < 0 ? -dy : dy;
    int16_t maximum = -1;
    static int16_t score[5];
    /* The 16 directions are four mirrored copies of these five candidates.
     * Shift/add coefficients preserve the exact old integer dot products. */
    score[0] = ay << 4;
    score[1] = (ax << 2) + (ax << 1) + (ay << 4) - ay;
    score[2] = ((ax + ay) << 3) + ((ax + ay) << 1) + ax + ay;
    score[3] = (ax << 4) - ax + (ay << 2) + (ay << 1);
    score[4] = ax << 4;
    for (i = 0; i != 5u; ++i) {
        angle = dx < 0 ? (dy > 0 ? 8u + i : (16u - i) & 15u) : (dy > 0 ? 8u - i : i);
        if (score[i] > maximum || (score[i] == maximum && angle < best)) { maximum = score[i]; best = angle; }
    }
    return best;
}
/* Main-loop only. SDCC SM83 call(1): destination DE, entity BC. The signed
 * divide must round towards zero, including negative fractional coordinates.
 * x/y offsets are signed bytes: adding 128 first converts them to 0..255.
 * Keep full 16-bit boxes; 8-bit wrapping would break offscreen collisions. */
static CE_Box *box_out;
static uint16_t box_left, box_top;
static void box(CE_Box *b, const CE_Entity *e) __naked {
    b; e;
    __asm
        push bc
        push de
        push hl
        ld a, e
        ld (_box_out), a
        ld a, d
        ld (_box_out + 1), a
        ld h, b
        ld l, c
        inc hl
        inc hl
        ld a, (hl)
        ld l, a
        ld h, #0
        add hl, hl
        add hl, hl
        ld de, #_ce_hitboxes
        add hl, de
        ld d, h
        ld e, l
        ld hl, #12
        add hl, bc
        call _ce_box_coordinate
        ld a, c
        ld (_box_left), a
        ld a, b
        ld (_box_left + 1), a
        call _ce_box_coordinate
        ld a, c
        ld (_box_top), a
        ld a, b
        ld (_box_top + 1), a
_ce_box_write::
        ld a, (_box_out)
        ld l, a
        ld a, (_box_out + 1)
        ld h, a
        ld a, (_box_left)
        ld (hl+), a
        ld a, (_box_left + 1)
        ld (hl+), a
        ld a, c
        ld (hl+), a
        ld a, b
        ld (hl+), a
        ld a, (de)
        inc de
        ld b, a
        ld a, (_box_left)
        add b
        ld (hl+), a
        ld a, (_box_left + 1)
        adc #0
        ld (hl+), a
        ld a, (de)
        ld b, a
        ld a, (_box_top)
        add b
        ld (hl+), a
        ld a, (_box_top + 1)
        adc #0
        ld (hl), a
        pop hl
        pop de
        pop bc
        ret
_ce_box_coordinate::
        ld a, (hl+)
        ld c, a
        ld a, (hl+)
        ld b, a
        bit 7, b
        jr z, 011$
        ld a, c
        add #15
        ld c, a
        ld a, b
        adc #0
        ld b, a
011$:
        sra b
        rr c
        sra b
        rr c
        sra b
        rr c
        sra b
        rr c
_ce_box_offset::
        ld a, (de)
        inc de
        add #128
        add c
        ld c, a
        ld a, b
        adc #0
        ld b, a
        ret
    __endasm;
}
static uint8_t overlap(void) __naked {
    __asm
        push bc
        push de
        push hl
        ld a, (_box_b)
        ld l, a
        ld a, (_box_b + 1)
        ld h, a
        ld bc, #6
        add hl, bc
        ld d, h
        ld e, l
        ld a, (_box_a)
        ld l, a
        ld a, (_box_a + 1)
        ld h, a
        inc hl
        inc hl
        call 040$
        jr nc, 043$
        ld bc, #4
        add hl, bc
        dec de
        dec de
        dec de
        dec de
        call 041$
        jr nc, 043$
        ld bc, #-6
        add hl, bc
        inc de
        inc de
        call 040$
        jr nc, 043$
        ld bc, #4
        add hl, bc
        dec de
        dec de
        dec de
        dec de
        call 041$
        ld a, #0
        rla
        jr 044$
043$:
        xor a
044$:
        pop hl
        pop de
        pop bc
        ret
040$:
        ld a, (de)
        inc de
        ld c, a
        ld a, (de)
        dec de
        ld b, a
        ld a, (hl+)
        sub c
        ld a, (hl-)
        sbc b
        ret
041$:
        ld a, (hl+)
        ld c, a
        ld a, (hl-)
        ld b, a
        ld a, (de)
        inc de
        sub c
        ld a, (de)
        dec de
        sbc b
        ret
    __endasm;
}
#include "shot-kernels.h"
static void hit_player(void) {
    uint8_t i;
    if (ce_respawn || ce_state.invulnerable || ce_state.result) return;
    explode(ce_state.player_x, ce_state.player_y);
    ce_sound(2); if (ce_stage_misses != 255u) ++ce_stage_misses; --ce_state.lives;
    ce_power_miss();
    if (!ce_state.lives) ce_state.result = 1;
    else {
        ce_bombs=ce_bomb_stock;ce_bomb_latch=1;
        ce_respawn = ce_player_respawn_delay;
        ce_state.invulnerable = ce_respawn ? 0 : ce_player_invulnerability;
        ce_state.player_x = ce_player_start_x; ce_state.player_y = ce_player_start_y;
        if (ce_respawn) {
            ce_state.cooldown = 0; ce_state.player_sequence = 0;
            for (i = 0; i != ce_used; ++i) if (ce_entities[i].kind == CE_PSHOT) release(i);
        }
    }
}
static void move_actor(CE_Entity *e, const CE_Motion *m, uint16_t age) {
    /* Main-loop only; no ISR enters actor update. Avoid SM83 stack spills. */
    static uint16_t t, quarter, part; static uint8_t i, phase;
    static int16_t span, offset; static const CE_Point *p;
    offset = 0;
    if (!m->kind) {
        /* Equivalent to base + velocity * age, including age wrap and phase entry. */
        if (age) { e->x += m->vx; e->y += m->vy; }
        else { e->x = e->base_x; e->y = e->base_y; }
        return;
    }
    if (m->kind == 3u) {
        t = m->points[m->count - 1u].frame;
        /* 256-update authored paths wrap exactly with the low byte. */
        age = m->loop && t ? (t == 256u ? (uint8_t)age : age % t) : (age > t ? t : age);
        i = 0; while (i < m->count - 2u && age >= m->points[i + 1u].frame) ++i;
        p = &m->points[i]; t = age - p->frame;
        e->x = e->base_x + p->x + p->vx * t; e->y = e->base_y + p->y + p->vy * t;
        return;
    }
    if (m->kind == 2u) {
        if (m->period == 128u) {
            /* A sine sample lasts eight updates. Integrate the linear part
             * and add only the sample delta at an edge; age 0 also handles
             * phase entry and the 16-bit wrap. Same Q4 path, fewer multiplies. */
            if (!age) { e->x = e->base_x; e->y = e->base_y; return; }
            e->x += m->vx; e->y += m->vy;
            if (!(age & 7u)) {
                i = (uint8_t)(age & 127u) >> 3;
                if (m->axis) e->y += (int16_t)(ce_sin[i] - ce_sin[(i - 1u) & 15u]) * m->amplitude;
                else e->x += (int16_t)(ce_sin[i] - ce_sin[(i - 1u) & 15u]) * m->amplitude;
            }
            return;
        }
        i = (age % m->period) * 16u / m->period;
        offset = (int16_t)ce_sin[i] * m->amplitude;
        e->x = e->base_x + m->vx * age + (m->axis ? 0 : offset);
        e->y = e->base_y + m->vy * age + (m->axis ? offset : 0); return;
    }
    if (m->kind == 1u) {
        quarter = m->period >> 2; phase = (age % (quarter * 4u)) / quarter; part = age % quarter;
        span = part * m->amplitude / quarter;
        offset = phase == 0u ? span : phase == 1u ? m->amplitude - span : phase == 2u ? -span : -m->amplitude + span;
    }
    e->x = e->base_x + m->vx * age + (m->axis ? 0 : offset * 16); e->y = e->base_y + m->vy * age + (m->axis ? offset * 16 : 0);
}
static void step_player(uint8_t input) {
    uint8_t top = ce_hud_bottom ? 0u : ce_hud_height;
    uint8_t mode = !ce_bomb_button && (input & J_B) && ce_player_focus_weapon != CE_NONE;
    uint8_t pattern = mode ? ce_player_focus_weapon : ce_player_weapon;
    uint8_t speed = mode ? ce_player_focus_speed : ce_player_speed;
    int16_t limit; const CE_Asset *player = &ce_assets[ce_player_asset];
    const CE_Pattern *weapon = &ce_patterns[pattern];
    if (ce_respawn) {
        if (!--ce_respawn) ce_state.invulnerable = ce_player_invulnerability;
        return;
    }
    if (ce_state.weapon_mode != mode) {
        ce_state.weapon_mode = mode; ce_state.cooldown = weapon->delay; ce_state.player_sequence = 0;
    }
    if (input & J_RIGHT) ce_state.player_x += speed;
    if (input & J_LEFT) ce_state.player_x -= speed;
    if (input & J_DOWN) ce_state.player_y += speed;
    if (input & J_UP) ce_state.player_y -= speed;
    limit = (int16_t)player->ox * 16; if (ce_state.player_x < limit) ce_state.player_x = limit;
    limit = (160 - player->width + player->ox) * 16; if (ce_state.player_x > limit) ce_state.player_x = limit;
    limit = (top + player->oy) * 16; if (ce_state.player_y < limit) ce_state.player_y = limit;
    limit = (top + 144u - ce_hud_height - player->height + player->oy) * 16u; if (ce_state.player_y > limit) ce_state.player_y = limit;
    if (!(input & (ce_bomb_button ? J_A : J_A | J_B))) { ce_state.cooldown = weapon->delay; ce_state.player_sequence = 0; }
    else if (ce_state.cooldown) --ce_state.cooldown;
    else if (!weapon->repeats || ce_state.player_sequence < weapon->repeats) {
        ce_shoot(pattern, ce_player_asset, ce_state.player_x, ce_state.player_y, 1, ce_state.player_sequence++);
        ce_state.cooldown = weapon->interval - 1u; ce_sound(0);
    }
    if (ce_state.invulnerable) --ce_state.invulnerable;
}
static void step_actor(CE_Entity *e, uint8_t slot) {
    static uint16_t *schedule;
    static uint8_t k, pattern, primary, layer_count;
    static uint16_t age, sequence; static const uint8_t *layers;
    static const CE_Actor *actor; static const CE_Phase *phase; static const CE_Motion *motion; static const CE_Pattern *shot;
            actor = e->kind == CE_BOSS ? &ce_bosses[e->ref] : &ce_enemies[e->ref];
            motion = actor->motion; pattern = actor->pattern; age = e->age;
            layers = actor->layer; layer_count = actor->layers;
            if (e->kind == CE_BOSS) {
                phase = &actor->phase[e->phase];
                if (e->phase + 1u < actor->phases && (phase->until ? e->hp <= (phase->hp ? 0u : phase->threshold) : e->phase_age >= phase->threshold)) {
                    if (phase->hp || actor->phase[e->phase + 1u].hp) ce_change_phase(e, phase->until);
                    else {
                        ++e->phase; e->phase_age = 0; e->sequence = 0; e->base_x = e->x; e->base_y = e->y;
                        if (actor->phase[e->phase].intro_frames) ce_phase_intro(&actor->phase[e->phase]);
                    }
                }
                phase = &actor->phase[e->phase]; motion = phase->motion; pattern = phase->pattern; age = e->phase_age;
                layers = phase->layer; layer_count = phase->layers;
            }
            move_actor(e, motion, age);
            /* Unarmed formations need neither a deadline lookup nor an attack
             * traversal. Preserve both age counters, including their wrap. */
            if (pattern == CE_NONE && !layer_count) { ++e->age; ++e->phase_age; return; }
            schedule = &next_attack[(uint16_t)slot << 2];
            primary = pattern;
            for (k = 0; k <= layer_count; ++k) {
                pattern = k ? layers[k - 1u] : primary;
                if (pattern == CE_NONE) continue;
                shot = &ce_patterns[pattern];
                /* Phase entry and 16-bit age wrap restart the same authored schedule.
                 * Overflowed deadlines stay below age until that reset. */
                if (!age) schedule[k] = shot->delay;
                if (age >= shot->delay && age == schedule[k]) {
                    schedule[k] += shot->interval;
                    sequence = (age - shot->delay) / shot->interval;
                    if (!shot->repeats || sequence < shot->repeats) ce_shoot(pattern, e->asset, e->x, e->y, 0, sequence);
                }
            }
            ++e->age; ++e->phase_age;
}
static uint8_t step_slot, step_count, step_walls;
static CE_Entity *step_entity;
static void step_nonbullet(uint8_t slot) {
    static CE_Entity *e;
    e = &ce_entities[slot];
    if (e->kind == CE_FX) { ++e->age; if (e->age >= e->lifetime) release(slot); }
    else if (e->kind == CE_ITEM) {
        move_actor(e, ce_items[e->ref].motion, e->age++); box(&boxes[slot], e);
        if (e->age >= e->lifetime) release(slot);
    }
    else { step_actor(e, slot); box(&boxes[slot], e); }
    if ((uint16_t)(e->x + 512) > 3584u || (uint16_t)(e->y + 512) > 3328u) release(slot);
}
static void step_shot_box(uint8_t slot) {
    static CE_Box *b;
    b = &boxes[slot]; box_out = b; shot_box(slot);
    if (step_walls && ce_terrain_collision(b, ce_entities[slot].damage, ce_entities[slot].kind == CE_PSHOT ? 1u : 2u)) release(slot);
}
/* Snapshot eligibility, visit the original global slots in order, then call
 * the actor path only for actors. Register save/restore is once per traversal,
 * not repeated for every bullet and its prepared sprite. */
static void step_entities(void) __naked {
    __asm
        push bc
        push de
        push hl
        ld a, (_ce_used)
        ld (_step_count), a
        or a
        jp z, 106$
        ld b, a
        ld de, #_active
        ld hl, #_ce_entities
100$:
        ld a, (hl)
        ld (de), a
        inc de
        ld a, l
        add #25
        ld l, a
        jr nc, 101$
        inc h
101$:
        dec b
        jr nz, 100$
        ld hl, #_ce_entities
        ld a, l
        ld (_step_entity), a
        ld a, h
        ld (_step_entity + 1), a
        xor a
        ld (_step_slot), a
102$:
        ld a, (_step_slot)
        ld e, a
        ld d, #0
        ld hl, #_active
        add hl, de
        ld a, (hl)
        or a
        jr z, 105$
        ld a, (_step_entity)
        ld l, a
        ld a, (_step_entity + 1)
        ld h, a
        ld a, (hl)
        cp #3
        jr c, 104$
        cp #5
        jr nc, 104$
        ld a, (_step_slot)
        call _ce_step_bullet_body
        or a
        jr z, 103$
        ld a, (_step_slot)
        call _release
        jr 105$
103$:
        ld a, (_step_walls)
        and #1
        jr nz, 107$
        ld a, (_step_entity)
        ld l, a
        ld a, (_step_entity + 1)
        ld h, a
        ld a, (hl)
        cp #3
        jr nz, 105$
107$:
        ld a, (_step_slot)
        call _step_shot_box
        jr 105$
104$:
        ld a, (_step_slot)
        call _step_nonbullet
105$:
        ld a, (_step_entity)
        add #25
        ld (_step_entity), a
        jr nc, 108$
        ld hl, #_step_entity + 1
        inc (hl)
108$:
        ld hl, #_step_slot
        inc (hl)
        ld a, (_step_count)
        cp (hl)
        jp nz, 102$
106$:
        pop hl
        pop de
        pop bc
        ret
    __endasm;
}
static void steer_sprite_shots(void) {
    uint8_t i, angle; const CE_Pattern *p;
    /* One eighth of slots per update; ordinary shots keep the ASM path. */
    for(i=ce_state.tick&7u;i<ce_used;i+=8u)if(ce_entities[i].kind==CE_ESHOT){
        p=&ce_patterns[ce_entities[i].ref];
        if(p->kind!=5u || ce_shot_age[i]>=p->guide_frames || ((ce_state.tick-i)&p->guide_mask))continue;
        angle=ce_home(ce_entities[i].sequence,ce_shot_x[i]/16,ce_shot_y[i]/16);ce_entities[i].sequence=angle;
        ce_shot_vx[i]=p->velocity[angle*2u];ce_shot_vy[i]=p->velocity[angle*2u+1u];
    }
}
static void collide_shots(void) {
    static uint8_t i, j; static CE_Entity *e, *target;
    if (!ce_pool_counts[CE_PSHOT] || !(ce_pool_counts[CE_ENEMY] | ce_pool_counts[CE_BOSS])) return;
    target_count = 0;
    for (i = 0, e = ce_entities; i != ce_used; ++i, ++e) if (e->kind == CE_ENEMY || e->kind == CE_BOSS) { targets[target_count] = e; target_slots[target_count] = i; target_boxes[target_count++] = &boxes[i]; }
    for (i = 0, e = ce_entities; i != ce_used; ++i, ++e) {
        if (e->kind != CE_PSHOT) continue;
        box_a = &boxes[i];
        for (j = 0; j != target_count; ++j) {
            /* Reject spatial misses before following the target entity pointer.
             * A previous hit may have released/reused that slot, so its kind
             * still has to be checked before applying damage. */
            box_b = target_boxes[j]; if (!overlap()) continue;
            target = targets[j]; if (target->kind != CE_ENEMY && target->kind != CE_BOSS) continue;
            if (target->kind == CE_BOSS && ce_boss_invulnerable) continue;
            release(i);
            ce_damage_actor(target_slots[j],e->damage);
            break;
        }
    }
}
static void collide_player(void) {
    static uint8_t i, hit; static CE_Entity *e;
    if (ce_respawn) return;
    player_collision_pose.asset = ce_player_asset; player_collision_pose.x = ce_state.player_x; player_collision_pose.y = ce_state.player_y;
    box(&player_box, &player_collision_pose); box_a = &player_box;
    player_delta_x = 128 - ce_state.player_x / 16;
    player_delta_y = 128 - ce_state.player_y / 16;
    if (!ce_battle_mode && (ce_stage->has_walls || ce_stage->object_count) && ce_terrain_collision(box_a, 0, 0)) hit_player();
    for (i = 0, e = ce_entities; i != ce_used; ++i, ++e) {
        if (!e->kind || e->kind == CE_PSHOT || e->kind == CE_FX) continue;
        if (e->kind == CE_ESHOT) hit = bullet_overlaps(i);
        else { if (e->kind == CE_ITEM) box(&boxes[i], e); box_b = &boxes[i]; hit = overlap(); }
        if (hit) { if (e->kind == CE_ITEM) ce_collect_item(i); else { hit_player(); if (e->kind == CE_ESHOT) release(i); } }
    }
}
void ce_step(uint8_t input) NONBANKED {
    uint8_t finish, bomb_pressed; const CE_Stage *stage = ce_stage;
    if (ce_state.result) return;
    ce_trace[22] = 1; /* Keep entity RAM and the public trace in the same snapshot. */
    if (ce_bomb_button) {
        bomb_pressed = (input & J_B) && !ce_bomb_latch;
        ce_bomb_latch = !!(input & J_B);
    } else {
        if (!(input & (J_A|J_B))) ce_bomb_latch = 0;
        bomb_pressed = (input & (J_A|J_B)) == (J_A|J_B) && !ce_bomb_latch;
    }
    if(bomb_pressed && ce_bombs && !ce_respawn){
        ce_bomb_latch=1;--ce_bombs;
        if(ce_state.invulnerable<90u)ce_state.invulnerable=90u;
        ce_bomb_apply();ce_bomb_effect();return;
    }
    step_walls = ce_battle_mode ? 0 : stage->has_walls | (stage->object_count ? 2u : 0u);
    step_player(input); if (ce_battle_mode == 2u) ce_bg_update();
    finish = ce_stage_events(); step_walls = ce_battle_mode ? 0 : stage->has_walls | (stage->object_count ? 2u : 0u);
    if(ce_pool_counts[CE_ESHOT])steer_sprite_shots();
    step_entities(); collide_shots(); collide_player();
    if (ce_bg_hit) hit_player();
    if (ce_state.boss_defeated && ce_battle_mode && !stage->clear_boss) {
        ce_bg_clear(); ce_battle_mode = 0; ce_battle_asset = CE_NONE; ce_state.scroll = stage->scroll; ce_load_stage();
    }
    while (ce_used && !ce_entities[ce_used - 1u].kind) --ce_used;
    ++ce_state.tick; if (ce_state.stage_tick != 65535u) ++ce_state.stage_tick;
    if (!ce_state.result && stage->require_boss && !ce_state.boss_defeated && (finish || (ce_time_limit && ce_state.stage_tick >= stage->duration)))
        ce_state.result = 1;
    if (!ce_state.result && (finish || (ce_state.boss_defeated && stage->clear_boss) || (ce_time_limit && ce_state.stage_tick >= stage->duration))) {
        if (ce_state.boss_defeated && ce_boss_celebration) ce_celebrate_boss();
        else ce_sound(3);
        if (ce_state.boss_defeated) ce_victory_dialogue();
        ce_stage_complete();
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
    ce_trace[20] = phase; ce_trace[21] = ce_bg_count; ce_trace[23] = ce_battle_mode;
    ce_trace[22] = 0;
}
void ce_sound(uint8_t effect) NONBANKED {
    if (effect == 6u) {
        NR10_REG = 0x16; NR11_REG = 0x80; NR12_REG = 0x92; NR13_REG = 0xa0; NR14_REG = 0x87;
    } else if (effect == 5u) {
        /* Bright pulse plus a noise crash; ~0.9s / ~0.75s hardware decay.
         * BGM retains pulse 2 and wave 3 throughout the announcement. */
        NR10_REG = 0; NR11_REG = 0x40; NR12_REG = 0xf4; NR13_REG = 0x83; NR14_REG = 0x87;
        NR41_REG = 0; NR42_REG = 0xc4; NR43_REG = 0x43; NR44_REG = 0x80;
    } else if (effect == 4u) {
        if (hit_sound_wait) return;
        hit_sound_wait = 4;
        NR41_REG = 0x38; NR42_REG = 0xa1; NR43_REG = 0x19; NR44_REG = 0xc0;
    } else if (!effect) { NR10_REG = 0; NR11_REG = 0x80; NR12_REG = 0x42; NR13_REG = 0xc0; NR14_REG = 0x87; }
    else if (effect == 3u) { NR10_REG = 0x16; NR11_REG = 0x40; NR12_REG = 0xf3; NR13_REG = 0x70; NR14_REG = 0x87; }
    else { NR41_REG = effect == 1u ? 0x08 : 0x00; NR42_REG = effect == 1u ? 0x73 : 0xf4; NR43_REG = effect == 1u ? 0x35 : 0x65; NR44_REG = 0x80; }
}
void ce_audio_sync(void) NONBANKED {
    uint16_t now, elapsed;
    CRITICAL { now = sys_time; }
    elapsed = now - ce_music_time; ce_music_time = now;
    hit_sound_wait = elapsed >= hit_sound_wait ? 0 : hit_sound_wait - elapsed;
    ce_music_tick(elapsed > 255u ? 255u : (uint8_t)elapsed);
}
void ce_run(void) NONBANKED {
    ce_mainloop();
}
