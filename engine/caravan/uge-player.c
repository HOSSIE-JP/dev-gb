#include "music.h"
#include "hUGEDriver.h"

#if CE_MUSIC_UGE
/* hUGEDriver and the bank-reference table must remain callable while
 * score banks are mapped. */
#pragma codeseg HOME
static uint8_t uge_tick;
void ce_uge_start(uint8_t track) NONBANKED {
    uint8_t previous = CURRENT_BANK;
    const CE_UgeSongRef *ref = &ce_uge_scores[track - 16u];
    SWITCH_ROM(ref->bank);
    hUGE_init(ref->song);
    uge_tick = 0;
    hUGE_mute_channel(HT_CH1, HT_CH_PLAY);
    hUGE_mute_channel(HT_CH2, HT_CH_PLAY);
    hUGE_mute_channel(HT_CH3, HT_CH_PLAY);
    hUGE_mute_channel(HT_CH4, HT_CH_PLAY);
    SWITCH_ROM(previous);
}
void ce_uge_tick(void) NONBANKED {
    uint8_t previous = CURRENT_BANK;
    uint8_t speed;
    const CE_UgeSongRef *ref = &ce_uge_scores[ce_music_track - 16u];
    SWITCH_ROM(ref->bank);
    speed = (ref->row_ticks[ce_music_row >> 3] & (1u << (ce_music_row & 7u))) ? ref->alternate_speed : ref->speed;
    hUGE_dosound();
    SWITCH_ROM(previous);
    if (++uge_tick == speed) {
        uge_tick = 0;
        if (++ce_music_row == ref->rows) {
            if (ref->loop_row != 65535u) ce_music_row = ref->loop_row;
            else {
                ce_uge_mute(0, 1); ce_uge_mute(1, 1);
                ce_uge_mute(2, 1); ce_uge_mute(3, 1);
                ce_music_track = 0; ce_music_three = 0;
            }
        }
    }
}
void ce_uge_mute(uint8_t channel, uint8_t mute) NONBANKED {
    /* Renewing a lease must not cut the SFX that already owns the channel. */
    if (!!(hUGE_mute_mask & (1u << channel)) != !!mute)
        hUGE_mute_channel((enum hUGE_channel_t)channel,
                          mute ? HT_CH_MUTE : HT_CH_PLAY);
}
#endif
