#ifndef CE_MUSIC_H
#define CE_MUSIC_H
#include <gb/gb.h>
#include <stdint.h>

/* Stable authoring IDs. Channel 1 and noise remain available to ce_sound(). */
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
#define CE_MUSIC_MAX 34u

/* A streamed bar is 3 instrument bytes + 16 lead + 16 accompaniment steps.
 * Its ROM bank is switched only once per bar; effects keep channels 1 and 4. */
typedef struct { uint8_t bank; const uint8_t *data; uint16_t rows; uint8_t speed, loop; } CE_MusicScore;
extern const CE_MusicScore ce_music_scores[];

extern uint8_t ce_music_track;
extern uint16_t ce_music_row;
void ce_music_play(uint8_t track) BANKED;
void ce_music_pause(uint8_t paused) BANKED;
/* Call from the main loop with elapsed VBlanks, never from an interrupt.
 * At most three note boundaries are processed after a stalled frame. */
void ce_music_tick(uint8_t elapsed) BANKED;
#endif
