#pragma bank 1
#include "caravan.h"
#include "music.h"
#include "mainloop.h"

static void record_score(void) {
    uint8_t i, j; for (i = 0; i != 5u; ++i) if (ce_state.score > ce_scores[i]) {
        for (j = 4; j > i; --j) ce_scores[j] = ce_scores[j - 1u]; ce_scores[i] = ce_state.score; ce_save_scores(); break;
    }
}
void ce_mainloop(void) BANKED {
    uint8_t input, pressed, previous = 0;
    uint16_t now;
    ce_is_cgb = _cpu == CGB_TYPE;
    if (ce_is_cgb) cpu_fast();
    NR52_REG = 0x80; NR50_REG = 0x77; NR51_REG = 0xff;
    add_VBL(ce_count_frame);
    add_LCD(ce_hud_scanline); add_LCD(nowait_int_handler);
    LYC_REG = ce_hud_height; STAT_REG = STATF_LYC;
    set_interrupts(VBL_IFLAG | LCD_IFLAG);
    ce_save_load();
    ce_scene = 0; ce_load_screen(0); ce_music_play(ce_music_title);
    CRITICAL { ce_music_time = sys_time; }
    for (;;) {
        /* If work already crossed VBlank, do not throw away another frame.
         * No queued catch-up steps: input and rendering accompany every tick. */
        CRITICAL { now = sys_time; }
        if (now == ce_music_time) vsync();
        input = joypad(); pressed = input & ~previous; previous = input;
        ce_audio_sync();
        if (ce_scene == 1u) {
            if (pressed & J_START) { ce_pause = !ce_pause; ce_music_pause(ce_pause); }
            if (!ce_pause) {
                /* Drop overdue work instead of a four-update catch-up spiral.
                 * Under load the game slows gracefully while every update is drawn. */
                ce_step(input);
                ce_render();
            }
            if (ce_state.result) {
                record_score(); ce_scene = ce_state.result == 1u ? 2u : 3u; ce_load_screen(ce_scene - 1u);
                ce_music_play(ce_state.result == 1u ? ce_music_gameover : ce_music_clear);
            }
        } else if (ce_scene == 0u) {
            if (pressed & (J_START | J_A)) { ce_fade(1); ce_reset(ce_campaign ? 0u : ce_start_stage, 1); ce_scene = 1; ce_pause = 0; ce_load_stage(); ce_fade(0); }
            else if (pressed & J_SELECT) { ce_scene = 4; ce_load_screen(3); }
        } else if (pressed & (J_START | J_A | J_B | J_SELECT)) { ce_scene = 0; ce_load_screen(0); ce_music_play(ce_music_title); }
        ce_trace_write();
    }
}
