#pragma bank 255
#include "caravan.h"
#include "music.h"
static CE_Presentation presentation;

/* Presentation runs with gameplay frozen. Only real button edges advance pages. */
uint8_t ce_stage_misses, ce_dialogue_page;
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
void ce_stage_complete(void) BANKED {
    const CE_Presentation *p = &presentation;
    uint8_t i, pressed, complete, timer = 0;
    uint16_t total;
    ce_get_presentation(&presentation, ce_state.stage);
    if (p->clear != 255u) {
        bonus_targets[0] = p->base;
        bonus_targets[1] = p->life * ce_state.lives;
        bonus_targets[2] = ce_stage_misses ? 0 : p->no_miss;
        total = sum_score(sum_score(bonus_targets[0], bonus_targets[1]), bonus_targets[2]);
        ce_state.score = sum_score(ce_state.score, total);
        for (i = 0; i != 4u; ++i) ce_bonus_values[i] = 0;
        ce_fade(1); ce_scene = 6; ce_load_screen(p->clear);
        ce_music_play(ce_music_clear); scene_previous = joypad();
        for (;;) {
            pressed = scene_input(); complete = 1;
            for (i = 0; i != 3u; ++i) if (ce_bonus_values[i] != bonus_targets[i]) { complete = 0; break; }
            if (timer < 12u) ++timer;
            if (complete && timer == 12u && (pressed & (J_A | J_START))) break;
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
