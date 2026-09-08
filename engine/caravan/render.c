#pragma bank 1
#include "caravan.h"

static uint8_t buffer[128];
static uint16_t previous_row;
static uint16_t hud_values[32];
static uint8_t hud_valid, previous_slots;

uint8_t ce_fade_level;
static palette_color_t fade_colors[32];
static void palettes(void) {
    uint8_t i, shade, reg = 0, factor = 4u - ce_fade_level;
    uint16_t rgb;
    for (i = 0; i != 4u; ++i) {
        shade = ((ce_dmg_palette >> (i * 2u)) & 3u) + ce_fade_level;
        if (shade > 3u) shade = 3u;
        reg |= shade << (i * 2u);
    }
    BGP_REG = OBP0_REG = OBP1_REG = reg;
    if (ce_is_cgb) {
        for (i = 0; i != ce_palette_count * 4u; ++i) {
            rgb = ce_palettes[i];
            fade_colors[i] = (((rgb & 31u) * factor) >> 2) |
                (((((rgb >> 5) & 31u) * factor) >> 2) << 5) |
                (((((rgb >> 10) & 31u) * factor) >> 2) << 10);
        }
        set_bkg_palette(0, ce_palette_count, fade_colors);
        set_sprite_palette(0, ce_palette_count, fade_colors);
    }
}
void ce_fade(uint8_t out) BANKED {
    uint8_t frame;
    if (!ce_stage_fade) return;
    for (frame = 0; frame != 24u; ++frame) {
        vsync();
        if (!(frame % 6u)) {
            ce_fade_level = out ? 1u + frame / 6u : 3u - frame / 6u;
            palettes();
        }
        ce_audio_sync();
    }
}
static void tiles(const CE_Data *data, uint8_t first, uint8_t count, uint8_t sprite) {
    uint8_t n; uint16_t offset = 0;
    while (count) {
        n = count > 8u ? 8u : count; ce_copy(buffer, data, offset, (uint16_t)n * 16u);
        if (sprite) set_sprite_data(first, n, buffer); else set_bkg_data(first, n, buffer);
        first += n; count -= n; offset += (uint16_t)n * 16u;
    }
}
static void hide_all(void) { uint8_t i; previous_slots = 0; hud_valid = 0; for (i = 0; i != 40u; ++i) hide_sprite(i); }
static void screen_map(uint8_t index, uint8_t window) {
    const CE_Screen *s = &ce_screens[index]; uint8_t row, n, height = window ? ce_hud_height >> 3 : 18u;
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
    DISPLAY_OFF; HIDE_WIN; HIDE_SPRITES; hide_all(); ce_active_screen = screen; ce_fade_level = 0;
    palettes(); tiles(&ce_screens[screen].tiles, 0, ce_screens[screen].tile_count, 0);
    screen_map(screen, 0); move_bkg(0, 0); ce_hud(); SHOW_BKG; DISPLAY_ON;
}
void ce_load_stage(void) BANKED {
    uint8_t row; uint16_t start = ce_state.camera >> 7; const CE_Stage *s = &ce_stages[ce_state.stage];
    /* Preserve an enabled, black LCD during transition loading. Turning it off
     * would flash white on DMG. GBDK VRAM APIs wait for safe access windows. */
    if (ce_fade_level != 4u) DISPLAY_OFF;
    hide_all(); palettes(); ce_active_screen = 4;
    tiles(&ce_screens[4].tiles, 0, ce_screens[4].tile_count, 0);
    tiles(&s->tiles, ce_screens[4].tile_count, s->tile_count, 0);
    tiles(&ce_sprite_data, 128, ce_sprite_tiles, 1); SPRITES_8x8;
    for (row = 0; row != 32u; ++row) map_row(start + row);
    screen_map(4, 1); move_win(7, ce_hud_bottom ? 144u - ce_hud_height : 0);
    previous_row = start; move_bkg(0, (ce_state.camera >> 4) - (ce_hud_bottom ? 0u : ce_hud_height));
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
        if (ce_active_screen == 4u) {
            if (hud_valid && hud_values[i] == value) continue;
            hud_values[i] = value;
        }
        number(b->x, b->y, value, b->digits);
    }
    hud_valid = 1;
}
/* Non-reentrant: no interrupt calls the renderer. Static scratch avoids
 * repeated stack-relative loads in the per-tile inner loop on SM83. */
static uint8_t sprite(uint8_t slot, uint8_t asset, int16_t x, int16_t y, uint16_t age) {
    static const CE_Asset *a; static uint16_t duration, time;
    a = &ce_assets[asset]; duration = 0;
    static uint8_t i, frame, tx, ty, tile, prop, sx, sy, left, columns, rows, top, bottom;
    frame = 0;
    static volatile OAM_item_t *out;
    out = &shadow_OAM[slot];
    if (a->frames > 1u) {
        for (i = 0; i != a->frames; ++i) duration += a->durations[i];
        time = age % duration;
        while (frame + 1u < a->frames && time >= a->durations[frame]) { time -= a->durations[frame]; ++frame; }
    }
    tile = a->first_tile + frame * a->tiles;
    left = x / 16 - a->ox + 8; sy = y / 16 - a->oy + 16;
    prop = ce_is_cgb ? a->palette : 0;
    columns = a->width >> 3; rows = a->height >> 3;
    top = ce_hud_bottom ? 9u : ce_hud_height + 9u;
    bottom = ce_hud_bottom ? 160u - ce_hud_height : 160u;
    /* OAM coordinates permit byte comparisons even for partly offscreen tiles:
     * wrapped negative coordinates lie outside these short visible ranges. */
    for (ty = rows; ty; --ty, sy += 8u) {
        sx = left;
        for (tx = columns; tx; --tx, sx += 8u) {
            out->tile = tile++; out->prop = prop; out->x = sx;
            out->y = (uint8_t)(sx - 1u) < 167u && sy >= top && sy < bottom ? sy : 0;
            ++slot; ++out;
        }
    }
    return slot;
}
void ce_render(void) BANKED {
    uint8_t i, slot = 0; uint16_t row = ce_state.camera >> 7; CE_Entity *e = ce_entities;
    if (row + 1u == previous_row || (ce_stages[ce_state.stage].loop && !(ce_stages[ce_state.stage].height & 31u) && previous_row == 0u && row + 1u == ce_stages[ce_state.stage].height)) map_row(row);
    else if (ce_stages[ce_state.stage].loop && !(ce_stages[ce_state.stage].height & 31u) && row == 0u && previous_row + 1u == ce_stages[ce_state.stage].height) map_row(31u);
    else if (row != previous_row && row != previous_row + 1u) { DISPLAY_OFF; for (i = 0; i != 32u; ++i) map_row(row + i); DISPLAY_ON; }
    else if (row != previous_row) map_row(row + 31u);
    previous_row = row;
    move_bkg(0, (ce_state.camera >> 4) - (ce_hud_bottom ? 0u : ce_hud_height));
    DISABLE_OAM_DMA;
    if (!ce_respawn && (!ce_state.invulnerable || !(ce_state.invulnerable & 4u))) slot = sprite(slot, ce_player_asset, ce_state.player_x, ce_state.player_y, ce_state.tick);
    for (i = ce_used; i; --i, ++e) if (e->kind) slot = sprite(slot, e->asset, e->x, e->y, e->age);
    /* Do not DMA a partially written metasprite list. */
    i = slot;
    while (slot < previous_slots) shadow_OAM[slot++].y = 0;
    previous_slots = i;
    ENABLE_OAM_DMA;
    if (!(ce_state.tick & 7u)) ce_hud();
}
