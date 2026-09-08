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

extern uint8_t ce_music_track;
void ce_music_play(uint8_t track) BANKED;
void ce_music_pause(uint8_t paused) BANKED;
/* Call from the main loop with elapsed VBlanks, never from an interrupt.
 * At most three note boundaries are processed after a stalled frame. */
void ce_music_tick(uint8_t elapsed) BANKED;
#endif
