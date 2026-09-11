#pragma bank 255
#include "caravan.h"
#include "music.h"
static CE_Presentation presentation;
extern uint8_t allocate(uint8_t kind, uint8_t asset);
extern void release(uint8_t slot);
extern void explode(int16_t x, int16_t y);

/* Presentation runs with gameplay frozen. Only real button edges advance pages. */
uint8_t ce_stage_misses, ce_dialogue_page, ce_boss_invulnerable;
uint16_t ce_intro_left, ce_clear_wait_left;
uint16_t ce_bonus_values[4];
static uint16_t bonus_targets[3];
static uint8_t scene_previous;
static uint8_t scene_input(void) {
    uint8_t input, pressed;
    vsync(); ce_audio_sync(); ce_trace_write();
    input = joypad(); pressed = input & ~scene_previous; scene_previous = input;
    return pressed;
}
static uint16_t sum_score(uint16_t a, uint16_t b) {
    return 65535u - a < b ? 65535u : a + b;
}
void ce_dialogue(void) BANKED {
    const CE_Presentation *p = &presentation;
    uint8_t pressed;
    ce_get_presentation(&presentation, ce_state.stage);
    if (!p->count) return;
    ce_fade(1); ce_scene = 5; scene_previous = joypad();
    for (ce_dialogue_page = 0; ce_dialogue_page != p->count; ++ce_dialogue_page) {
        if (!ce_dialogue_page) ce_load_screen(p->first);
        else ce_dialogue_update(p->first + ce_dialogue_page);
        do { pressed = scene_input(); } while (!(pressed & (J_A | J_START)));
        if (pressed & J_START) break;
    }
    while (joypad() & (J_A | J_START)) scene_input();
    ce_fade(1); ce_load_stage(); ce_scene = 1; ce_fade(0);
}
void ce_victory_dialogue(void) BANKED {
    uint8_t pressed;
    ce_get_presentation(&presentation, ce_state.stage);
    if (!presentation.victory_count) return;
    ce_clear_combat(0); ce_fade(1); ce_scene = 9;
    ce_music_play(ce_music_clear); scene_previous = joypad();
    for (ce_dialogue_page = 0; ce_dialogue_page != presentation.victory_count; ++ce_dialogue_page) {
        if (!ce_dialogue_page) ce_load_screen(presentation.victory_first);
        else ce_dialogue_update(presentation.victory_first + ce_dialogue_page);
        do { pressed = scene_input(); } while (!(pressed & (J_A | J_START)));
        if (pressed & J_START) break;
    }
    while (joypad() & (J_A | J_START)) scene_input();
}
void ce_stage_complete(void) BANKED {
    const CE_Presentation *p = &presentation;
    uint8_t i, pressed, complete;
    uint16_t total, wait_clock, now, elapsed;
    ce_get_presentation(&presentation, ce_state.stage);
    if (p->clear != 255u) {
        bonus_targets[0] = p->base;
        bonus_targets[1] = p->life * ce_state.lives;
        bonus_targets[2] = ce_stage_misses ? 0 : p->no_miss;
        total = sum_score(sum_score(bonus_targets[0], bonus_targets[1]), bonus_targets[2]);
        ce_state.score = sum_score(ce_state.score, total);
        for (i = 0; i != 4u; ++i) ce_bonus_values[i] = 0;
        ce_fade(1); ce_scene = 6; ce_load_screen(p->clear);
        ce_music_play(ce_music_clear); scene_previous = joypad(); ce_clear_wait_left = p->clear_wait;
        CRITICAL { wait_clock = sys_time; }
        for (;;) {
            pressed = scene_input(); complete = 1;
            CRITICAL { now = sys_time; }
            elapsed = now - wait_clock; wait_clock = now;
            for (i = 0; i != 3u; ++i) if (ce_bonus_values[i] != bonus_targets[i]) { complete = 0; break; }
            if (complete) {
                if (ce_clear_wait_left) ce_clear_wait_left = elapsed >= ce_clear_wait_left ? 0 : ce_clear_wait_left - elapsed;
                else if (pressed & (J_A | J_START)) break;
            }
            if (pressed & (J_A | J_START)) for (i = 0; i != 3u; ++i) ce_bonus_values[i] = bonus_targets[i];
            else if (!complete) {
                ce_bonus_values[i] += bonus_targets[i] - ce_bonus_values[i] > 50u ? 50u : bonus_targets[i] - ce_bonus_values[i];
                if (!(ce_bonus_values[i] & 3u)) ce_sound(0);
            }
            ce_bonus_values[3] = sum_score(sum_score(ce_bonus_values[0], ce_bonus_values[1]), ce_bonus_values[2]);
            ce_hud();
        }
        while (joypad() & (J_A | J_START)) scene_input();
    } else ce_state.score = sum_score(ce_state.score, ce_clear_bonus);
    if (ce_campaign && ce_state.stage + 1u < ce_stage_count) {
        ce_fade(1); ce_reset(ce_state.stage + 1u, 0); ce_load_stage(); ce_scene = 1; ce_fade(0);
    } else { ce_scene = 1; ce_state.result = 2; }
}

void ce_phase_intro(const CE_Phase *phase) BANKED {
    if (!phase->intro_frames || phase->intro_screen == CE_NONE) return;
    ce_boss_invulnerable = 1; ce_clear_combat(0);
    ce_scene = 7; ce_load_screen(phase->intro_screen); ce_sound(5);
    ce_intro_left = phase->intro_frames;
    while (ce_intro_left) { scene_input(); --ce_intro_left; }
    ce_load_stage(); ce_scene = 1;
    ce_boss_invulnerable = 0;
}

/* Only a phase with its own HP opts into the break / return sequence.
 * These waits use VBlank time, never advance gameplay or issue attacks. */
uint8_t ce_transition_state;
static void transition_frame(void) {
    ce_render(); ce_audio_sync(); ce_trace_write();
}
static uint16_t transition_clock(void) {
    uint16_t now; CRITICAL { now = sys_time; } return now;
}
static void clear_effects(void) {
    uint8_t i; for (i = 0; i != ce_used; ++i) if (ce_entities[i].kind == CE_FX) release(i);
}
static int16_t return_position(int16_t start, int16_t delta, uint8_t elapsed) {
    /* Split the product to stay within signed 16 bits at either screen edge. */
    return start + (delta / 32) * elapsed + (delta % 32) * elapsed / 32;
}
void ce_change_phase(CE_Entity *boss, uint8_t damage) BANKED {
    const CE_Actor *actor = &ce_bosses[boss->ref];
    uint16_t start, elapsed; uint8_t i;
    int16_t x = boss->x, y = boss->y;
    int16_t dx = (int16_t)actor->return_x * 16 - x, dy = (int16_t)actor->return_y * 16 - y;
    ce_boss_invulnerable = 1; ce_clear_combat(0); clear_effects();
    if (ce_battle_mode == 2u) ce_bg_begin();
    ce_scene = 8; ce_hud();
    if (damage) {
        ce_transition_state = 1; explode(x, y); ce_sound(1);
        start = transition_clock(); elapsed = 0;
        do {
            for (i = 0; i != ce_used; ++i) if (ce_entities[i].kind == CE_FX) ce_entities[i].age = elapsed;
            transition_frame(); elapsed = transition_clock() - start;
        } while (elapsed < ce_explosion_duration);
        clear_effects(); ce_transition_state = 2; start = transition_clock(); elapsed = 0;
        for (;;) {
            if (elapsed > 32u) elapsed = 32u;
            boss->x = return_position(x, dx, elapsed); boss->y = return_position(y, dy, elapsed);
            transition_frame(); if (elapsed == 32u) break;
            elapsed = transition_clock() - start;
        }
    }
    boss->x = boss->base_x = (int16_t)actor->return_x * 16;
    boss->y = boss->base_y = (int16_t)actor->return_y * 16;
    ++boss->phase; boss->phase_age = 0; boss->sequence = 0;
    if (actor->phase[boss->phase].hp) boss->hp = actor->phase[boss->phase].hp;
    ce_transition_state = 3; ce_phase_intro(&actor->phase[boss->phase]);
    ce_scene = 1; ce_transition_state = 0;
    ce_boss_invulnerable = actor->phase[boss->phase].hp && !actor->phase[boss->phase].until;
}
extern uint8_t defeated_asset;
extern int16_t defeated_x, defeated_y;
static void victory_effects(void) {
    uint8_t i;
    for (i = 0; i != ce_used; ++i) if (ce_entities[i].kind == CE_FX) {
        if (++ce_entities[i].age >= ce_entities[i].lifetime) release(i);
    }
    while (ce_used && !ce_entities[ce_used - 1u].kind) --ce_used;
    ce_render(); ce_audio_sync();
}
void ce_celebrate_boss(void) BANKED {
    static const int8_t bursts[24] = {-16,-8, 12,6, -8,14, 18,-12, 0,-18, -18,6, 8,16, 16,0, -10,-16, 0,8, 20,12, -20,-2};
    uint8_t i, wreck, burst = 0;
    uint16_t dropped = ce_state.dropped;
    for (i = 0; i != ce_used; ++i) release(i);
    ce_used = 0; ce_bg_clear(); if (ce_battle_mode == 2u) ce_bg_begin();
    wreck = allocate(CE_BOSS, defeated_asset);
    if (wreck != CE_NONE) { ce_entities[wreck].x = defeated_x; ce_entities[wreck].y = defeated_y; }
    ce_music_play(ce_music_victory); ce_hud();
    for (ce_victory_frame = 1; ce_victory_frame <= 144u; ++ce_victory_frame) {
        if ((ce_victory_frame & 7u) == 1u) {
            explode(defeated_x + (int16_t)bursts[burst] * 16, defeated_y + (int16_t)bursts[burst + 1u] * 16);
            burst += 2u; if (burst == 24u) burst = 0;
            ce_sound(1);
        }
        if (ce_victory_frame == 64u) {
            if (wreck != CE_NONE) release(wreck);
            explode(defeated_x, defeated_y); explode(defeated_x - 128, defeated_y + 64); explode(defeated_x + 128, defeated_y - 64);
            ce_sound(2);
        }
        victory_effects();
    }
    /* Let the final fanfare cadence resolve before starting the scene fade. */
    while (ce_music_track && ce_music_track == ce_music_victory) victory_effects();
    for (i = 0; i != ce_used; ++i) release(i);
    ce_used = 0; ce_victory_frame = 0; ce_state.dropped = dropped;
}

extern uint16_t event_cursor;
extern CE_Event next_event;
extern uint8_t ce_pool_counts[6];
void ce_read_event(void) BANKED {
    if (event_cursor < ce_stages[ce_state.stage].event_count)
        ce_copy((uint8_t *)&next_event, &ce_stages[ce_state.stage].events, event_cursor * 9u, 9u);
}
/* Local call stays in this auto-assigned bank. A static BANKED function would
 * bake the placeholder bank 255 into SDCC's call instead of the linker bank. */
static void spawn_actor(uint8_t kind, uint8_t ref, int16_t x, int16_t y) {
    const CE_Actor *actor = kind == CE_BOSS ? &ce_bosses[ref] : &ce_enemies[ref];
    uint8_t slot; CE_Entity *e;
    if (kind == CE_BOSS && ce_pool_counts[CE_BOSS]) return;
    if (kind == CE_BOSS && actor->background) ce_clear_combat(1);
    slot = allocate(kind, actor->asset);
    if (slot == CE_NONE) return;
    e = &ce_entities[slot]; e->ref = ref; e->hp = actor->hp; e->damage = 1;
    e->x = e->base_x = x * 16; e->y = e->base_y = y * 16;
    /* Actors are updated (and boxed) immediately after stage events. */
    if (kind == CE_BOSS) {
        uint8_t track = ce_stages[ce_state.stage].boss_music;
        ce_battle_mode = actor->background; ce_battle_asset = actor->asset; ce_bg_limit = actor->bg_limit;
        if (actor->phase[0].hp) e->hp = actor->phase[0].hp;
        if (ce_battle_mode) { ce_state.scroll = 0; ce_battle_setup(); }
        else ce_load_boss(actor->asset);
        if (actor->phase[0].intro_frames) ce_phase_intro(&actor->phase[0]);
        ce_boss_invulnerable = actor->phase[0].hp && !actor->phase[0].until;
        ce_music_play(track ? track : ce_music_boss);
    }
}
uint8_t ce_stage_events(void) BANKED {
    uint16_t end, before; uint8_t finish = 0;
    const CE_Stage *stage = &ce_stages[ce_state.stage];
    before = ce_state.camera;
    end = stage->height * 128u;
    if (stage->scroll_down) {
        if (before >= ce_state.scroll) ce_state.camera -= ce_state.scroll;
        else ce_state.camera = stage->loop ? end - (ce_state.scroll - before) : 0;
    } else {
        ce_state.camera += ce_state.scroll;
        if (stage->loop) { if (end && ce_state.camera >= end) ce_state.camera -= end; }
        else { end -= (144u - ce_hud_height) * 16u; if (ce_state.camera < before || ce_state.camera > end) ce_state.camera = end; }
    }
    while (event_cursor < stage->event_count && next_event.frame <= ce_state.stage_tick) {
        if (next_event.kind == 2u) ce_dialogue();
        if (next_event.kind <= 2u && (!ce_battle_mode || next_event.kind == 2u)) spawn_actor(next_event.kind, next_event.ref, next_event.x, next_event.y);
        else if (next_event.kind == 3u) { if (!ce_battle_mode) ce_state.scroll = next_event.value; }
        else if (next_event.kind > 3u) finish = 1;
        ++event_cursor; ce_read_event();
    }
    return finish;
}
