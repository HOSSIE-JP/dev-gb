#ifndef CE_MUSIC_H
#define CE_MUSIC_H
#include <gb/gb.h>
#include <stdint.h>
#ifndef CE_MUSIC_3VOICE
#define CE_MUSIC_3VOICE 0
#endif

/* Stable authoring IDs. Three-voice songs share CH1 with important SFX. */
#define CE_MUSIC_OFF 0u
#define CE_MUSIC_TITLE 1u
#define CE_MUSIC_ORBIT 2u
#define CE_MUSIC_CARRIER 3u
#define CE_MUSIC_REACTOR 4u
#define CE_MUSIC_BOSS 5u
#define CE_MUSIC_CLEAR 6u
#define CE_MUSIC_GAMEOVER 7u
#define CE_MUSIC_VICTORY 8u
#define CE_MUSIC_GERO_TITLE 9u
#define CE_MUSIC_GERO_CANDY 10u
#define CE_MUSIC_GERO_NEBULA 11u
#define CE_MUSIC_GERO_COSMOS 12u
#define CE_MUSIC_GERO_NINJA 13u
#define CE_MUSIC_GERO_CLEAR 14u
#define CE_MUSIC_GERO_OVER 15u
#define CE_MUSIC_KOUMA_TITLE 16u
#define CE_MUSIC_KOUMA_GATE 17u
#define CE_MUSIC_KOUMA_MEILING 18u
#define CE_MUSIC_KOUMA_LIBRARY 19u
#define CE_MUSIC_KOUMA_PATCHOULI 20u
#define CE_MUSIC_KOUMA_CLOCK 21u
#define CE_MUSIC_KOUMA_SAKUYA 22u
#define CE_MUSIC_KOUMA_ROOF 23u
#define CE_MUSIC_KOUMA_REMILIA 24u
#define CE_MUSIC_KOUMA_BASEMENT 25u
#define CE_MUSIC_KOUMA_FLANDRE 26u
#define CE_MUSIC_KOUMA_CLEAR 27u
#define CE_MUSIC_KOUMA_OVER 28u
#define CE_MUSIC_KOUMA_VICTORY 29u
#define CE_MUSIC_KOUMA_LAKE 30u
#define CE_MUSIC_KOUMA_CIRNO 31u
#define CE_MUSIC_KOUMA_FOREST 32u
#define CE_MUSIC_KOUMA_RUMIA 33u
#define CE_MUSIC_KOUMA_ENDING 34u
#define CE_MUSIC_SIDE_TITLE 35u
#define CE_MUSIC_SIDE_STAGE 36u
#define CE_MUSIC_SIDE_BOSS 37u
#define CE_MUSIC_MAX 37u

/* A legacy streamed bar is 3 instrument bytes + 16 lead + 16 accompaniment steps.
 * Level byte: bits 5-6 = NR32 volume, bits 0-2 = wave ID (default zero).
 * Speed: low six bits = VBlanks per row; bit 7 adds one on odd rows.
 * A 100-byte bar appends CH1 duty, 16 CH1 notes, 16 CH2 envelopes,
 * 16 CH1 envelopes and 16 CH3 levels. CH1 is shared with important SFX;
 * frequent shots use CH4 during three-voice tracks. Bank once per bar. */
/* stride 35: legacy two voices; stride 100: three voices and row expression. */
typedef struct { uint8_t bank; const uint8_t *data; uint16_t rows; uint8_t speed, loop, stride; } CE_MusicScore;
extern const CE_MusicScore ce_music_scores[];
/* Same ROM bank as music.c. Wave zero is the legacy triangle. */
extern const uint8_t ce_music_waves[8][16];

extern uint8_t ce_music_track;
extern uint16_t ce_music_row;
extern uint8_t ce_music_three;
/* SFX owns CH1 for these VBlanks; 255 holds until explicitly released by zero. */
void ce_music_ch1_claim(uint8_t frames) BANKED;
void ce_music_play(uint8_t track) BANKED;
void ce_music_pause(uint8_t paused) BANKED;
/* Call from the main loop with elapsed VBlanks, never from an interrupt.
 * At most three note boundaries are processed after a stalled frame. */
void ce_music_tick(uint8_t elapsed) BANKED;
#endif
