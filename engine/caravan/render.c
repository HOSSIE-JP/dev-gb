#pragma bank 1
#include "caravan.h"

static uint8_t buffer[128];
static uint16_t previous_row;

static void palettes(void) {
    BGP_REG = OBP0_REG = OBP1_REG = ce_dmg_palette;
    if (ce_is_cgb) { set_bkg_palette(0, ce_palette_count, ce_palettes); set_sprite_palette(0, ce_palette_count, ce_palettes); }
}
static void tiles(const CE_Data *data, uint8_t first, uint8_t count, uint8_t sprite) {
    uint8_t n; uint16_t offset = 0;
    while (count) {
        n = count > 8u ? 8u : count; ce_copy(buffer, data, offset, (uint16_t)n * 16u);
        if (sprite) set_sprite_data(first, n, buffer); else set_bkg_data(first, n, buffer);
        first += n; count -= n; offset += (uint16_t)n * 16u;
    }
}
static void hide_all(void) { uint8_t i; for (i = 0; i != 40u; ++i) hide_sprite(i); }
static void screen_map(uint8_t index, uint8_t window) {
    const CE_Screen *s = &ce_screens[index]; uint8_t row, n, height = window ? 2u : 18u;
    for (row = 0; row != height; ++row) {
        ce_copy(buffer, &s->map, (uint16_t)row * 20u, 20u);
        if (window) set_win_tiles(0, row, 20, 1, buffer); else set_bkg_tiles(0, row, 20, 1, buffer);
        if (ce_is_cgb) {
            ce_copy(buffer, &s->attrs, (uint16_t)row * 20u, 20u); VBK_REG = 1;
            if (window) set_win_tiles(0, row, 20, 1, buffer); else set_bkg_tiles(0, row, 20, 1, buffer);
            VBK_REG = 0;
        }
    }
    /* Clear the offscreen columns in the window as well. */
    for (n = 0; n != 12u; ++n) buffer[n] = 0;
    if (window) { set_win_tiles(20, 0, 12, 1, buffer); set_win_tiles(20, 1, 12, 1, buffer); }
}
static void map_row(uint16_t row) {
    const CE_Stage *s = &ce_stages[ce_state.stage]; uint16_t world = row, offset; uint8_t i, n, target = row & 31u;
    if (s->loop) world %= s->height;
    if (world < s->height) {
        offset = world * 20u;
        n = (offset & 4095u) > 4076u ? 4096u - (offset & 4095u) : 20u;
        ce_copy(buffer, &s->map[offset >> 12], offset & 4095u, n);
        if (n != 20u) ce_copy(buffer + n, &s->map[(offset >> 12) + 1u], 0, 20u - n);
        for (i = 0; i != 20u; ++i) buffer[i] += ce_screens[4].tile_count;
    } else for (i = 0; i != 20u; ++i) buffer[i] = 0;
    set_bkg_tiles(0, target, 20, 1, buffer);
    if (ce_is_cgb) {
        for (i = 0; i != 20u; ++i) buffer[i] = s->palette;
        VBK_REG = 1; set_bkg_tiles(0, target, 20, 1, buffer); VBK_REG = 0;
    }
}
void ce_load_screen(uint8_t screen) BANKED {
    DISPLAY_OFF; HIDE_WIN; HIDE_SPRITES; hide_all(); ce_active_screen = screen;
    palettes(); tiles(&ce_screens[screen].tiles, 0, ce_screens[screen].tile_count, 0);
    screen_map(screen, 0); move_bkg(0, 0); ce_hud(); SHOW_BKG; DISPLAY_ON;
}
void ce_load_stage(void) BANKED {
    uint8_t row; uint16_t start = ce_state.camera >> 7; const CE_Stage *s = &ce_stages[ce_state.stage];
    DISPLAY_OFF; hide_all(); palettes(); ce_active_screen = 4;
    tiles(&ce_screens[4].tiles, 0, ce_screens[4].tile_count, 0);
    tiles(&s->tiles, ce_screens[4].tile_count, s->tile_count, 0);
    tiles(&ce_sprite_data, 128, ce_sprite_tiles, 1); SPRITES_8x8;
    for (row = 0; row != 32u; ++row) map_row(start + row);
    screen_map(4, 1); move_win(7, ce_hud_bottom ? 128 : 0);
    previous_row = start; move_bkg(0, (ce_state.camera >> 4) - (ce_hud_bottom ? 0u : 16u));
    ce_hud(); SHOW_BKG; SHOW_WIN; SHOW_SPRITES; DISPLAY_ON;
}
static void number(uint8_t x, uint8_t y, uint16_t value, uint8_t digits) {
    uint8_t i = digits; const CE_Screen *s = &ce_screens[ce_active_screen];
    while (i) { --i; buffer[i] = s->digits[value % 10u]; value /= 10u; }
    if (ce_active_screen == 4u) set_win_tiles(x, y, digits, 1, buffer);
    else set_bkg_tiles(x, y, digits, 1, buffer);
}
void ce_hud(void) BANKED {
    const CE_Screen *s = &ce_screens[ce_active_screen]; const CE_Binding *b; uint8_t i, j;
    uint16_t value;
    for (i = 0; i != s->bindings; ++i) {
        b = &s->binding[i]; value = 0;
        if (b->kind == 5u) { for (j = 0; j != 5u; ++j) { number(b->x, b->y + j * 2u, j + 1u, 1); number(b->x + 3u, b->y + j * 2u, ce_scores[j], 5); } continue; }
        if (b->kind == 1u) value = ce_state.score;
        if (b->kind == 2u) value = ce_state.lives;
        if (b->kind == 3u) value = (ce_stages[ce_state.stage].duration - ce_state.stage_tick + 59u) / 60u;
        if (b->kind == 4u) value = ce_boss_hp();
        number(b->x, b->y, value, 5);
    }
}
static uint8_t sprite(uint8_t slot, uint8_t asset, int16_t x, int16_t y, uint16_t age) {
    const CE_Asset *a = &ce_assets[asset]; uint16_t duration = 0, time; uint8_t i, frame = 0, tx, ty, tile;
    if (a->frames > 1u) {
        for (i = 0; i != a->frames; ++i) duration += a->durations[i];
        time = age % duration;
        while (frame + 1u < a->frames && time >= a->durations[frame]) { time -= a->durations[frame]; ++frame; }
    }
    tile = a->first_tile + frame * a->tiles; x = x / 16 - a->ox; y = y / 16 - a->oy;
    for (ty = 0; ty < a->height; ty += 8u) for (tx = 0; tx < a->width; tx += 8u) {
        set_sprite_tile(slot, tile++); set_sprite_prop(slot, ce_is_cgb ? a->palette : 0);
        if (x + tx < -7 || x + tx >= 160 || y + ty < (ce_hud_bottom ? -7 : 9) || y + ty >= (ce_hud_bottom ? 128 : 144)) hide_sprite(slot);
        else move_sprite(slot, x + tx + 8, y + ty + 16);
        ++slot;
    }
    return slot;
}
void ce_render(void) BANKED {
    uint8_t i, slot = 0; uint16_t row = ce_state.camera >> 7; CE_Entity *e = ce_entities;
    if (row + 1u == previous_row) map_row(row);
    else if (row != previous_row && row != previous_row + 1u) { DISPLAY_OFF; for (i = 0; i != 32u; ++i) map_row(row + i); DISPLAY_ON; }
    else if (row != previous_row) map_row(row + 31u);
    previous_row = row;
    move_bkg(0, (ce_state.camera >> 4) - (ce_hud_bottom ? 0u : 16u));
    if (!ce_state.invulnerable || !(ce_state.invulnerable & 4u)) slot = sprite(slot, ce_player_asset, ce_state.player_x, ce_state.player_y, ce_state.tick);
    for (i = ce_used; i; --i, ++e) if (e->kind) slot = sprite(slot, e->asset, e->x, e->y, e->age);
    while (slot < 40u) hide_sprite(slot++);
    if (!(ce_state.tick & 7u)) ce_hud();
}
