#include "music.h"
#include "caravan.h"
#include <gb/cgb.h>

uint8_t ce_bomb_left;
volatile uint8_t ce_three_test[16];
uint8_t ce_three_case, ce_three_index;
static const uint8_t tracks[]={32,33,30,31,17,18,19,20,21,22,23,24,25,26};
void ce_three_sample(void) NONBANKED __naked { __asm ret __endasm; }
void ce_three_native_sample(void) NONBANKED __naked { __asm ret __endasm; }
static void ticks(uint16_t count) { while(count--) { ce_sfx_tick(1); ce_music_tick(1); } }
void main(void) {
    uint16_t row, last_row=65535u;
    uint8_t previous=0,input,a,b,i,last_track=255;
    if (_cpu==CGB_TYPE) cpu_fast();
    NR52_REG=0x80; NR50_REG=0x77; NR51_REG=0xff; NR12_REG=0; NR42_REG=0;
    ce_music_play(32); for(i=0;i!=240&&!NR12_REG;++i)ticks(1);
    ce_three_test[1]=ce_music_three&&NR12_REG;
    a=NR12_REG;b=NR22_REG;ce_sfx(0);
    ce_three_test[2]=NR12_REG==a&&NR22_REG==b&&NR42_REG==0x31;
    ce_sfx(6);ticks(19);ce_three_test[3]=NR12_REG==0x92;
    ticks(1);a=NR12_REG;ce_music_pause(1);ce_music_pause(0);
    ce_three_test[4]=NR12_REG==a; /* Lease restored the current held note. */
    ce_music_ch1_claim(255);NR12_REG=0xa0;ce_music_tick(255);
    ce_three_test[5]=NR12_REG==0xa0;ce_music_ch1_claim(0);
    ce_bomb_left=1;ce_sfx(7);ticks(360);
    ce_three_test[6]=NR12_REG==0xa0&&ce_spell_sound_left&&NR42_REG==0xc0;
    ce_bomb_left=0;ticks(1);a=NR12_REG;ce_music_pause(1);ce_music_pause(0);
    ce_three_test[7]=!ce_spell_sound_left&&NR12_REG==a;
    row=ce_music_row;ce_music_pause(1);ticks(200);
    ce_three_test[8]=ce_music_row==row&&!NR12_REG&&!NR22_REG&&!(NR30_REG&0x80);
    ce_music_pause(0);ce_three_test[9]=NR51_REG==0xff;
    ce_music_play(1);ce_three_test[10]=!ce_music_three&&!NR12_REG;
    ce_sfx(0);ce_three_test[11]=NR12_REG==0x42; /* Legacy shot untouched. */
    ce_music_play(0);ticks(16);ce_music_play(32);
    ce_three_case=1;for(i=1;i!=12;++i)if(!ce_three_test[i])ce_three_case=0;
    ce_three_test[0]=0x73;
    for(;;) {
        vsync();input=joypad();
        if((input&J_RIGHT)&&!(previous&J_RIGHT)) {if(++ce_three_index==14)ce_three_index=0;ce_music_play(tracks[ce_three_index]);}
        else ce_music_tick(1);
        ce_three_sample();
        if(ce_music_row!=last_row||ce_music_track!=last_track){ce_three_native_sample();last_row=ce_music_row;last_track=ce_music_track;}
        previous=input;
    }
}
