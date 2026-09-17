#pragma bank 255
#include "caravan.h"

static uint8_t hit_sound_wait, sustained_effect;
uint8_t ce_spell_sound_left, ce_spell_sound_step;

static void sustained_sound(void) {
    static const uint16_t pitch[12] = {1650,1783,1849,1890,1915,1949,1943,1915,1890,1849,1783,1849};
    static const uint8_t volume[12] = {2,3,5,7,9,10,8,6,4,3,2,1};
    uint8_t step = (72u - ce_spell_sound_left) / 6u;
    uint16_t frequency;
    if (step == ce_spell_sound_step) return;
    ce_spell_sound_step = step;
    if (sustained_effect == 7u) {
        /* CH1 laser sweep over a sustained CH4 roar. BGM owns CH2/3. */
        frequency = 1500u + (step & 3u) * 110u;
        NR10_REG = 0; NR11_REG = 0x40; NR12_REG = 0xa0;
        NR13_REG = (uint8_t)frequency; NR14_REG = 0x80u | (frequency >> 8);
        NR41_REG = 0; NR42_REG = 0xc0; NR43_REG = 0x35u + (step & 1u); NR44_REG = 0x80;
    } else {
        frequency = pitch[step];
        NR10_REG = 0; NR11_REG = 0x80; NR12_REG = (volume[step] << 4) | 2u;
        NR13_REG = (uint8_t)frequency; NR14_REG = 0x80u | (frequency >> 8);
    }
}
void ce_sfx(uint8_t effect) BANKED {
    /* Shot, graze and impact requests cannot cancel a bomb or spell cue. */
    if (ce_spell_sound_left && effect != 5u && effect != 7u && effect != 3u) return;
    if (ce_spell_sound_left) { ce_spell_sound_left = 0; NR12_REG = 0; NR42_REG = 0; }
    if (effect == 7u || effect == 5u) {
        sustained_effect = effect; ce_spell_sound_left = 72; ce_spell_sound_step = 255; sustained_sound();
        if (effect == 5u) { NR41_REG = 0; NR42_REG = 0x23; NR43_REG = 0x15; NR44_REG = 0x80; }
    } else if (effect == 8u) {
        NR10_REG = 0x12; NR11_REG = 0x80; NR12_REG = 0x51; NR13_REG = 0x50; NR14_REG = 0x87;
    } else if (effect == 6u) {
        NR10_REG = 0x16; NR11_REG = 0x80; NR12_REG = 0x92; NR13_REG = 0xa0; NR14_REG = 0x87;
    } else if (effect == 4u) {
        if (hit_sound_wait) return;
        hit_sound_wait = 4;
        NR41_REG = 0x38; NR42_REG = 0xa1; NR43_REG = 0x19; NR44_REG = 0xc0;
    } else if (!effect) { NR10_REG = 0; NR11_REG = 0x80; NR12_REG = 0x42; NR13_REG = 0xc0; NR14_REG = 0x87; }
    else if (effect == 3u) { NR10_REG = 0x16; NR11_REG = 0x40; NR12_REG = 0xf3; NR13_REG = 0x70; NR14_REG = 0x87; }
    else { NR41_REG = effect == 1u ? 0x08 : 0x00; NR42_REG = effect == 1u ? 0x73 : 0xf4; NR43_REG = effect == 1u ? 0x35 : 0x65; NR44_REG = 0x80; }
}
void ce_sfx_tick(uint8_t elapsed) BANKED {
    hit_sound_wait = elapsed >= hit_sound_wait ? 0 : hit_sound_wait - elapsed;
    if (!ce_spell_sound_left) return;
    if (sustained_effect == 7u && ce_bomb_left) {
        ce_spell_sound_left = elapsed >= ce_spell_sound_left ? 72u : ce_spell_sound_left - elapsed;
        sustained_sound();
    } else if (sustained_effect == 7u || elapsed >= ce_spell_sound_left) {
        ce_spell_sound_left = 0; NR12_REG = 0; NR42_REG = 0;
    } else { ce_spell_sound_left -= elapsed; sustained_sound(); }
}
