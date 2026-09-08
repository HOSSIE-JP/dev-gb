#include "music.h"

volatile uint8_t ce_music_test[16];

static void ticks(uint16_t count) {
    while (count--) ce_music_tick(1);
}

void main(void) {
    uint8_t i, ch1, noise, sweep, mixer;
    NR52_REG = 0x80; NR50_REG = 0x77; NR51_REG = 0xff;
    NR10_REG = 0x16; NR11_REG = 0x80; NR12_REG = 0x62;
    NR41_REG = 0; NR42_REG = 0x53; NR43_REG = 0x35;
    ch1 = NR12_REG; noise = NR42_REG; sweep = NR10_REG; mixer = NR51_REG;

    ce_music_play(CE_MUSIC_GAMEOVER);
    ticks(80);
    ce_music_play(CE_MUSIC_GAMEOVER); /* Same ID must preserve the clock. */
    ticks(159);
    ce_music_test[1] = ce_music_track == CE_MUSIC_GAMEOVER;
    ce_music_tick(1);
    ce_music_test[2] = !ce_music_track && !NR22_REG && !(NR30_REG & 0x80u);

    ce_music_play(CE_MUSIC_GAMEOVER);
    ticks(59);
    ce_music_pause(1);
    ce_music_test[3] = !NR22_REG && !(NR30_REG & 0x80u);
    ticks(1000);
    ce_music_pause(0);
    ce_music_test[4] = ce_music_track == CE_MUSIC_GAMEOVER && NR22_REG && (NR30_REG & 0x80u);
    ticks(180);
    ce_music_test[5] = ce_music_track == CE_MUSIC_GAMEOVER;
    ce_music_tick(1);
    ce_music_test[6] = !ce_music_track;

    ce_music_play(CE_MUSIC_GAMEOVER);
    ce_music_tick(255); /* Catch-up is exactly three rows, bounded work. */
    ticks(194);
    ce_music_test[7] = ce_music_track == CE_MUSIC_GAMEOVER;
    ce_music_tick(1);
    ce_music_test[8] = !ce_music_track;

    ce_music_test[9] = 1;
    for (i = CE_MUSIC_TITLE; i <= CE_MUSIC_BOSS; ++i) {
        ce_music_play(i);
        ticks(4096); /* Beyond the longest track's two complete loops. */
        if (ce_music_track != i) ce_music_test[9] = 0;
    }
    ce_music_play(CE_MUSIC_CLEAR);
    ticks(383);
    ce_music_test[10] = ce_music_track == CE_MUSIC_CLEAR;
    ce_music_tick(1);
    ce_music_test[11] = !ce_music_track;
    ce_music_play(CE_MUSIC_TITLE);
    ce_music_play(255);
    ce_music_test[12] = !ce_music_track && !NR22_REG && !(NR30_REG & 0x80u);
    ce_music_test[13] = NR12_REG == ch1 && NR42_REG == noise && NR10_REG == sweep && NR51_REG == mixer;
    ce_music_test[14] = NR43_REG == 0x35;

    /* Idle PCM is music alone, with effect DACs explicitly silenced. */
    NR12_REG = 0; NR42_REG = 0;
    ce_music_play(CE_MUSIC_TITLE);
    ce_music_test[0] = 0x4d;
    for (;;) { vsync(); ce_music_tick(1); }
}
