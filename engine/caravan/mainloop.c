#pragma bank 255
#include "caravan.h"
#include "music.h"
#include "mainloop.h"

static void record_score(void) {
    uint8_t i, j; for (i = 0; i != 5u; ++i) if (ce_state.score > ce_scores[i]) {
        for (j = 4; j > i; --j) ce_scores[j] = ce_scores[j - 1u]; ce_scores[i] = ce_state.score; ce_save_scores(); break;
    }
}
static void start_game(uint8_t stage) {
    ce_fade(1);ce_reset(stage,1);ce_scene=1;ce_pause=0;ce_load_stage();ce_fade(0);
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
    ce_select_player(0);
    ce_play_logos();
    ce_scene = 0; ce_load_screen(0); ce_music_play(ce_music_title);
    if (ce_logo_count) previous = joypad();
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
                if (!ce_state.result) ce_render();
            }
            if (ce_state.result) {
                record_score();
                if (ce_state.result == 1u) {
                    ce_wait_gameover();
                    if (ce_continue_frames) {
                        if (ce_offer_continue()) start_game(ce_state.stage);
                        else { ce_scene=0;ce_load_screen(0);ce_music_play(ce_music_title); }
                    } else {
                        ce_scene=2;ce_load_screen(ce_gameover_screens[ce_character]);ce_music_play(ce_music_gameover);
                    }
                    previous=joypad();
                } else if (ce_ending_score_after) {
                    ce_scene = 4; ce_load_screen(3); ce_music_play(ce_music_clear);
                    previous = joypad();
                } else if (ce_ending_counts[ce_character]) {
                    ce_play_ending(); ce_scene = 0; ce_load_screen(0); ce_music_play(ce_music_title);
                    previous = joypad();
                } else {
                ce_scene=3;ce_load_screen(2);ce_music_play(ce_music_clear);
                }
            }
        } else if (ce_scene == 0u) {
            if (pressed & (J_START | J_A)) {
                if(ce_player_count>1u){ce_scene=10;ce_select_player(0);ce_load_screen(ce_select_first);}
                else start_game(ce_campaign?0u:ce_start_stage);
            }
            else if (pressed & J_SELECT) { ce_scene = 4; ce_load_screen(3); }
        } else if (ce_scene == 10u) {
            if(pressed & J_B){ce_scene=0;ce_load_screen(0);}
            else if(pressed & (J_A|J_START))start_game(ce_campaign?0u:ce_start_stage);
            else if(pressed & (J_LEFT|J_RIGHT)){
                ce_select_player(pressed&J_RIGHT?(ce_character+1u==ce_player_count?0u:ce_character+1u):(ce_character?ce_character-1u:ce_player_count-1u));
                ce_load_screen(ce_select_first+ce_character);
            }
        } else if (pressed & (J_START | J_A | J_B | J_SELECT)) { ce_scene = 0; ce_load_screen(0); ce_music_play(ce_music_title); }
        ce_trace_write();
    }
}
