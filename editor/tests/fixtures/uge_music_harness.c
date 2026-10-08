#include "music.h"
#include "hUGEDriver.h"
#include "caravan.h"
uint8_t ce_bomb_left;
volatile uint8_t ce_uge_test[32];
static void tick(uint16_t count) {
    while (count--) { ce_sfx_tick(1); ce_music_tick(1); }
}
static uint8_t check_track(uint8_t track) {
    const CE_UgeSongRef *ref = &ce_uge_scores[track - 16u];
    uint16_t count = 0, loop_count = 0, early = 0, r;
    uint8_t bank = CURRENT_BANK;
    SWITCH_ROM(ref->bank);
    for (r=0;r<ref->rows;r++) {
        uint8_t speed = (ref->row_ticks[r >> 3] & (1u << (r & 7u))) ? ref->alternate_speed : ref->speed;
        if (count + speed <= 11u) ++early;
        count += speed;
        if (r >= ref->loop_row) loop_count += speed;
    }
    SWITCH_ROM(bank);
    ce_music_play(track);
    if (ce_music_track != track || ce_music_three != 2u) return 0;
    tick(11); ce_music_play(track);
    if (ce_music_row != early) return 0;
    tick(count - 11u);
    if (ref->loop_row == 65535u) return ce_music_track == 0;
    if (ce_music_row != ref->loop_row || ce_music_track != track) return 0;
    tick(loop_count);
    return ce_music_row == ref->loop_row && ce_music_track == track;
}
void main(void) {
    uint8_t i, previous = 0, input;
    uint16_t row;
    NR52_REG=0x80; NR50_REG=0x77; NR51_REG=0xff;
    for (i=0;i<16;i++) ce_uge_test[i+1]=check_track(i+16u);
    ce_music_play(16); tick(30);
    ce_music_ch1_claim(255); NR12_REG=0xa0; ce_music_tick(20);
    ce_uge_test[17]=hUGE_mute_mask==1 && NR12_REG==0xa0;
    ce_music_ch1_claim(0); ce_sfx(0); ce_music_tick(1);
    ce_uge_test[18]=(hUGE_mute_mask & 8u) && NR42_REG==0x31;
    tick(12); ce_uge_test[19]=!(hUGE_mute_mask & 8u);
    ce_bomb_left=1;ce_sfx(7);tick(360);
    ce_uge_test[20]=(hUGE_mute_mask & 9u)==9u && ce_spell_sound_left>0;
    ce_bomb_left=0;tick(1);ce_uge_test[21]=!(hUGE_mute_mask & 9u);
    ce_sfx(7);ce_music_pause(1);row=ce_music_row;ce_music_tick(90);
    ce_uge_test[24]=hUGE_mute_mask;ce_uge_test[25]=NR12_REG;ce_uge_test[26]=NR22_REG;ce_uge_test[27]=NR30_REG;ce_uge_test[28]=NR42_REG;ce_uge_test[29]=(row==ce_music_row);
    ce_uge_test[22]=row==ce_music_row && hUGE_mute_mask==15u && NR12_REG==0 && NR22_REG==0 && !(NR32_REG & 0x60u) && NR42_REG==0;
    ce_spell_sound_left=0;ce_music_ch1_claim(0);ce_music_ch4_claim(0);ce_music_pause(0);ce_music_tick(30);
    ce_uge_test[23]=ce_music_row>row && hUGE_mute_mask==0;
    ce_music_play(0);ce_uge_test[0]=0x55;i=16;
    while(1) {
        vsync();input=joypad();
        if((input & J_A) && !(previous & J_A)){ce_music_play(i);if(++i==32u)i=16;}
        previous=input;ce_sfx_tick(1);ce_music_tick(1);
    }
}
