#include "music.h"
#include <gb/cgb.h>

void main(void) {
    uint8_t previous = 0, input, track = 16;
    if (_cpu == CGB_TYPE) cpu_fast();
    NR52_REG = 0x80; NR50_REG = 0x77; NR51_REG = 0xff;
    NR12_REG = 0; NR42_REG = 0; /* Stop any bootstrap sound before the sentinels. */
    /* Sentinels in effect channels must survive every score and bank switch. */
    NR12_REG = 0x62; NR42_REG = 0x53; NR43_REG = 0x35;
    ce_music_play(track);
    for (;;) {
        vsync();
        input = joypad();
        if ((input & J_RIGHT) && !(previous & J_RIGHT)) {
            if (++track > 34) track = 16;
            ce_music_play(track);
        } else ce_music_tick(1);
        previous = input;
    }
}
