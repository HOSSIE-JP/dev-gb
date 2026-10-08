#ifndef CE_MUSIC_H
#define CE_MUSIC_H
#include <gb/gb.h>
#include <stdint.h>
#ifndef CE_MUSIC_3VOICE
#define CE_MUSIC_3VOICE 0
#endif
#ifndef CE_MUSIC_UGE
#define CE_MUSIC_UGE 0
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

/* Legacy three-voice streamed bars use a compact, banked score table. */
typedef struct { uint8_t bank; const uint8_t *data; uint16_t rows; uint8_t speed, loop, stride; } CE_MusicScore;
extern const CE_MusicScore ce_music_scores[];
extern const uint8_t ce_music_waves[8][16];

#if CE_MUSIC_UGE
struct hUGESong_t;
/* One tempo-selection bit per row keeps a complete song inside a 16 KiB bank. */
typedef struct { uint8_t bank; const struct hUGESong_t *song; const uint8_t *row_ticks; uint16_t rows, loop_row; uint8_t speed, alternate_speed; } CE_UgeSongRef;
extern const CE_UgeSongRef ce_uge_scores[22];
void ce_uge_start(uint8_t track) NONBANKED;
void ce_uge_tick(void) NONBANKED;
void ce_uge_mute(uint8_t channel, uint8_t mute) NONBANKED;
#else
#define ce_uge_mute(channel, mute) ((void)0)
#endif
extern uint8_t ce_music_track;
extern uint16_t ce_music_row;
extern uint8_t ce_music_three;
void ce_music_ch1_claim(uint8_t frames) BANKED;
#if CE_MUSIC_UGE
void ce_music_ch4_claim(uint8_t frames) BANKED;
#else
#define ce_music_ch4_claim(frames) ((void)0)
#endif
void ce_music_play(uint8_t track) BANKED;
void ce_music_pause(uint8_t paused) BANKED;
void ce_music_tick(uint8_t elapsed) BANKED;
#endif
