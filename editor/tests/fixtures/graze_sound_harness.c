#include "caravan.h"
#include "music.h"
/* This legacy two-voice fixture does not link the music player. */
uint8_t ce_music_three;
void ce_music_ch1_claim(uint8_t frames) BANKED { (void)frames; }

/* Isolate the real sound.c and graze.c without modifying production RAM. */
CE_State ce_state;
uint8_t ce_bomb_left, ce_demo, ce_player_asset, ce_is_cgb;
const uint8_t ce_color_sprites=0;
uint16_t ce_respawn;
const uint8_t ce_graze_radius=6, ce_graze_score=1, ce_graze_frames=12;
const CE_Hitbox ce_hitboxes[]={{-2,-2,4,4}};
uint8_t ce_bench_case, ce_bench_sample_id, ce_bench_ready;
void ce_sound(uint8_t effect) NONBANKED { ce_sfx(effect); }
void ce_bench_sample(void) NONBANKED __naked { __asm ret __endasm; }
static void sample(uint8_t n) { ce_bench_sample_id=n; ce_bench_sample(); }
static void reset_sfx(void) {
    ce_bomb_left=0; ce_sfx_tick(255); NR12_REG=0; NR42_REG=0;
}
void main(void) {
    uint8_t i, effect, delay;
    ce_is_cgb=_cpu==CGB_TYPE; if(ce_is_cgb)cpu_fast();
    NR52_REG=0x80; NR50_REG=0x77; NR51_REG=0xff;
    /* Untouched BGM register sentinels. No music channel is triggered. */
    NR22_REG=0x72; NR30_REG=0x80; NR32_REG=0x60;
    reset_sfx(); ce_state.player_x=80*16; ce_state.player_y=120*16;
    ce_bench_ready=0xa7;
    ce_sfx(0);
    for(i=0;i!=36u;++i) {
        ce_graze_begin(); ce_graze_pending=1; ce_graze_finish(); sample(i);
        vsync(); ce_sfx_tick(1);
    }
    for(ce_bench_case=1;ce_bench_case!=4u;++ce_bench_case) {
        reset_sfx(); effect=ce_bench_case==3u?4u:ce_bench_case;
        delay=ce_bench_case==1u?24u:ce_bench_case==2u?60u:4u;
        ce_sfx(effect); ce_sfx(8); sample(0);
        ce_sfx_tick(delay-1u); ce_sfx(8); sample(1);
        ce_sfx_tick(1); sample(2); /* Rejected requests never play later. */
        ce_sfx(8); sample(3);
    }
    for(ce_bench_case=4;ce_bench_case!=7u;++ce_bench_case) {
        reset_sfx(); ce_sfx(8); sample(0);
        ce_sfx(ce_bench_case==6u?4u:ce_bench_case-3u); sample(1);
    }
    ce_bench_case=7; reset_sfx(); ce_sfx(5); ce_sfx(8); sample(0);
    ce_bench_case=8; reset_sfx(); ce_bomb_left=90; ce_sfx(7); ce_sfx(8); sample(0);
    ce_bench_case=9; reset_sfx(); ce_graze_pending=0; ce_graze_finish(); sample(0);
    for(;;)vsync();
}
