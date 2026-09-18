#pragma bank 255
#include "caravan.h"

uint8_t ce_graze_flash, ce_graze_active, ce_graze_pending;
uint8_t ce_graze_x, ce_graze_y, ce_graze_w, ce_graze_h;
static uint8_t eligible(void) {
    return ce_graze_radius && !ce_state.invulnerable && !ce_respawn && !ce_bomb_left && !ce_state.result && !ce_demo;
}
void ce_graze_begin(void) BANKED {
    const CE_Hitbox *p = &ce_hitboxes[ce_player_asset];
    if (ce_graze_flash) --ce_graze_flash;
    ce_graze_pending = 0; ce_graze_active = eligible();
    if (!ce_graze_active) return;
    /* Top-left positions at which a 2px BG dot overlaps the expanded box.
     * Modular differences also handle a box extending beyond a screen edge. */
    ce_graze_x = ce_state.player_x / 16 + p->x - ce_graze_radius - 1;
    ce_graze_y = ce_state.player_y / 16 + p->y - ce_graze_radius - 1;
    ce_graze_w = p->w + 2u * ce_graze_radius + 1u;
    ce_graze_h = p->h + 2u * ce_graze_radius + 1u;
}
void ce_graze_finish(void) BANKED {
    uint16_t points;
    if (!ce_graze_pending || !eligible()) return;
    points = (uint16_t)ce_graze_pending * ce_graze_score;
    ce_state.score = 65535u - ce_state.score < points ? 65535u : ce_state.score + points;
    /* SFX owns its real-time cooldown. Continuous visual flashes must not
     * silence subsequent newly grazed bullets for the whole barrage. */
    ce_sound(8);
    ce_graze_flash = ce_graze_frames;
}

void ce_graze_palette(uint8_t fade) BANKED {
    palette_color_t colors[4];
    uint8_t c=31u*(4u-fade)/4u,i;
    for(i=0;i!=4u;++i)colors[i]=RGB(c,c,c);
    set_sprite_palette(0,1,colors);
}
void ce_graze_oam(uint8_t count) BANKED {
    uint8_t i;
    if(ce_state.invulnerable || ce_bomb_left)return;
    for(i=0;i!=count;++i) {
        if (ce_is_cgb && ce_color_sprites) shadow_OAM[i].prop &= 0xf8u;
        else if (!ce_is_cgb) shadow_OAM[i].prop |= 0x10u;
    }
}
