#pragma bank 255
#include "caravan.h"
#include "music.h"
#include "mainloop.h"

uint8_t ce_title_choice, ce_title_stage;
uint8_t ce_demo, ce_demo_abort, ce_demo_cutin;
static uint16_t attract_clock, demo_clock, boss_clock, attract_rng;
static uint8_t last_demo_stage = 255u, demo_boss_seen;
static uint16_t clock_now(void) {
    uint16_t value; CRITICAL { value = sys_time; } return value;
}
static void title_screen(void) {
    ce_demo=0;ce_demo_abort=0;ce_demo_cutin=0;
    ce_title_choice=0;ce_title_stage=ce_campaign?0u:ce_start_stage;
    ce_scene=0;ce_load_screen(0);ce_title_draw();ce_music_play(ce_music_title);
    attract_clock=clock_now();
}
static uint8_t selected_stage(void) {
    return ce_title_select && ce_title_choice ? ce_title_stage : (ce_campaign?0u:ce_start_stage);
}

static void record_score(void) {
    uint8_t i, j;
    if (ce_demo) return;
    for (i = 0; i != 5u; ++i) if (ce_state.score > ce_scores[i]) {
        for (j = 4; j > i; --j) ce_scores[j] = ce_scores[j - 1u]; ce_scores[i] = ce_state.score; ce_save_scores(); break;
    }
}
static void start_game(uint8_t stage) {
    ce_fade(1);ce_reset(stage,1);ce_scene=1;ce_pause=0;ce_load_stage();ce_fade(0);
}
static void start_demo(void) {
    uint8_t stage;
    /* Own PRNG: gameplay resets its seed, exhibition cycles must not. */
    if (!attract_rng) attract_rng=clock_now() ^ ((uint16_t)DIV_REG << 8) ^ 0xace1u;
    if (!attract_rng) attract_rng=0xace1u;
    attract_rng=(attract_rng>>1)^((attract_rng&1u)?0xb400u:0u);
    stage=attract_rng%ce_stage_count;
    if (ce_stage_count>1u && stage==last_demo_stage) stage=(stage+1u)%ce_stage_count;
    last_demo_stage=stage;
    ce_select_player((attract_rng>>8)%ce_player_count);
    ce_demo=1;ce_demo_abort=0;ce_demo_cutin=0;demo_boss_seen=0;
    start_game(stage);demo_clock=clock_now();
}
static uint8_t demo_input(void) {
    uint8_t i, input=J_A;
    int16_t target=80*16;
    for(i=0;i<ce_used;++i) if(ce_entities[i].kind==CE_BOSS) {target=ce_entities[i].x;break;}
    if(i==ce_used) target=((ce_state.tick/120u)&1u)?104*16:56*16;
    if(ce_state.player_x<target-32) input|=J_RIGHT;
    else if(ce_state.player_x>target+32) input|=J_LEFT;
    if(ce_state.player_y<112*16) input|=J_DOWN;
    else if(ce_state.player_y>116*16) input|=J_UP;
    return input;
}
static void demo_ranking(void) {
    ce_demo=0;ce_fade(1);ce_scene=4;ce_load_screen(3);ce_music_play(ce_music_title);
    attract_clock=clock_now();
}
#ifdef CE_CGB
static void require_color(void) {
    /* Small ROM-resident diagnostic; no banked WRAM or game assets involved. */
    static const uint8_t glyphs[]={
        60,60,66,66,64,64,78,78,66,66,66,66,60,60,0,0,
        124,124,66,66,66,66,124,124,66,66,66,124,124,0,0,
        60,60,66,66,64,64,64,64,64,64,66,66,60,60,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        60,60,66,66,66,66,66,66,66,66,66,66,60,60,0,0,
        66,66,98,98,82,82,74,74,70,70,66,66,66,66,0,0,
        64,64,64,64,64,64,64,64,64,64,64,64,126,126,0,0,
        66,66,66,66,36,36,24,24,24,24,24,24,24,24,0,0};
    static const uint8_t message[]={0,1,2,3,4,5,6,7};
    DISPLAY_OFF;LCDC_REG=0x11;BGP_REG=0xe4;
    set_bkg_data(0,8,glyphs);fill_bkg_rect(0,0,32,32,3);
    set_bkg_tiles(6,8,8,1,message);move_bkg(0,0);DISPLAY_ON;
    for(;;)vsync();
}
#endif
void ce_mainloop(void) BANKED {
    uint8_t input, pressed, previous = 0;
    uint16_t now;
    ce_is_cgb = _cpu == CGB_TYPE;
#ifdef CE_CGB
    if (!ce_is_cgb) require_color();
    SVBK_REG=1u;
#endif
    if (ce_is_cgb) cpu_fast();
    NR52_REG = 0x80; NR50_REG = 0x77; NR51_REG = 0xff;
    add_VBL(ce_count_frame);
    add_LCD(ce_hud_scanline); add_LCD(nowait_int_handler);
    LYC_REG = ce_hud_height; STAT_REG = STATF_LYC;
    set_interrupts(VBL_IFLAG | LCD_IFLAG);
    ce_save_load();
    ce_select_player(0);
    ce_play_logos();
    if (!ce_logo_skip) ce_play_movie();
    title_screen();
    if (ce_logo_count || ce_movie_count) previous = joypad();
    CRITICAL { ce_music_time = sys_time; }
    for (;;) {
        /* If work already crossed VBlank, do not throw away another frame.
         * No queued catch-up steps: input and rendering accompany every tick. */
        CRITICAL { now = sys_time; }
        if (now == ce_music_time) vsync();
        input = joypad(); pressed = input & ~previous; previous = input;
        ce_audio_sync();
        if (ce_demo) {
            if (input || ce_demo_abort) {ce_fade(1);title_screen();previous=joypad();continue;}
            ce_step(demo_input());
            if (!ce_state.result) ce_render();
            now=clock_now();
            if (ce_demo_cutin && !demo_boss_seen) {demo_boss_seen=1;boss_clock=now;}
            if (ce_demo_abort) {ce_fade(1);title_screen();previous=joypad();}
            else if (ce_state.result || (demo_boss_seen && (uint16_t)(now-boss_clock)>=ce_attract_boss_frames) || (uint16_t)(now-demo_clock)>=18000u) demo_ranking();
            ce_trace_write();continue;
        }
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
                        else title_screen();
                    } else {
                        ce_scene=2;ce_load_screen(ce_gameover_screens[ce_character]);ce_music_play(ce_music_gameover);
                    }
                    previous=joypad();
                } else if (ce_ending_score_after) {
                    ce_scene = 4; ce_load_screen(3); ce_music_play(ce_music_clear); attract_clock=clock_now();
                    previous = joypad();
                } else if (ce_ending_counts[ce_character]) {
                    ce_play_ending(); title_screen();
                    previous = joypad();
                } else {
                ce_scene=3;ce_load_screen(2);ce_music_play(ce_music_clear);
                }
            }
        } else if (ce_scene == 0u) {
            if (input) attract_clock=clock_now();
            if (pressed & (J_START | J_A)) {
                if(ce_player_count>1u){ce_scene=10;ce_select_player(0);ce_load_screen(ce_select_first);}
                else start_game(selected_stage());
            }
            else if (pressed & J_SELECT) { ce_scene = 4; ce_load_screen(3); attract_clock=clock_now(); }
            else if (ce_title_select) {
                if (pressed & (J_UP|J_DOWN)) { ce_title_choice=!ce_title_choice;ce_title_draw(); }
                else if (ce_title_choice && (pressed & (J_LEFT|J_RIGHT))) {
                    ce_title_stage=pressed&J_RIGHT?(ce_title_stage+1u==ce_stage_count?0u:ce_title_stage+1u):(ce_title_stage?ce_title_stage-1u:ce_stage_count-1u);
                    ce_title_draw();
                }
            }
            if (ce_scene==0u && ce_attract_title_frames && (uint16_t)(clock_now()-attract_clock)>=ce_attract_title_frames) start_demo();
        } else if (ce_scene == 10u) {
            if(pressed & J_B){ce_scene=0;ce_load_screen(0);ce_title_draw();attract_clock=clock_now();}
            else if(pressed & (J_A|J_START))start_game(selected_stage());
            else if(pressed & (J_LEFT|J_RIGHT)){
                ce_select_player(pressed&J_RIGHT?(ce_character+1u==ce_player_count?0u:ce_character+1u):(ce_character?ce_character-1u:ce_player_count-1u));
                ce_load_screen(ce_select_first+ce_character);
            }
        } else if (pressed & (J_START | J_A | J_B | J_SELECT)) title_screen();
        else if (ce_scene==4u && ce_attract_title_frames && (uint16_t)(clock_now()-attract_clock)>=ce_attract_rank_frames) {
            ce_music_play(0);ce_fade(1);ce_play_logos();if(!ce_logo_skip)ce_play_movie();title_screen();previous=joypad();
        }
        ce_trace_write();
    }
}
