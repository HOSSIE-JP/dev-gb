#ifndef CE_MAINLOOP_H
#define CE_MAINLOOP_H
/* Screen/input coordination lives in a switchable bank. Interrupt handlers
 * and the short timing/sound service retain fixed-bank entry points. */
extern uint16_t ce_music_time;
void ce_count_frame(void) NONBANKED;
void ce_hud_scanline(void) NONBANKED;
void ce_mainloop(void) BANKED;
#endif
