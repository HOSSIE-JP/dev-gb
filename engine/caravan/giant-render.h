/* Included in bg-bullets.c: this mode owns its otherwise idle DMA workspace. */
void ce_giant_hud(uint8_t x, uint8_t y, uint8_t count, const uint8_t *data) BANKED {
    uint16_t address = 24u * 32u + (uint16_t)y * 32u + x;
    while (count--) {
        set_vram_byte((uint8_t *)(0x9800u + address), *data);
        set_vram_byte((uint8_t *)(0x9c00u + address++), *data++);
    }
}
void ce_giant_setup(void) CE_BG_ENTRY {
    uint8_t i, row, page; uint16_t address;
    ce_get_giant(&giant); ce_get_screen(&screen, 4);
    hud_tiles = screen.tile_count; giant_first = hud_tiles + giant.count;
    top = ce_hud_bottom ? 0 : ce_hud_height; bottom = ce_hud_bottom ? 144u - ce_hud_height : 144u;
    for (i = 0; i != hud_tiles; ++i) {
        ce_copy(tile_buffer, &screen.tiles, (uint16_t)i * 16u, 16); set_bkg_data(i, 1, tile_buffer);
    }
    for (i = 0; i != giant.count; ++i) {
        ce_copy(tile_buffer, &giant.tiles, (uint16_t)i * 16u, 16); set_bkg_data(hud_tiles + i, 1, tile_buffer);
    }
    for (page = 0; page != 2u; ++page) for (row = 0; row != 32u; ++row) {
        address = (page ? 0x9c00u : 0x9800u) + (uint16_t)row * 32u;
        ce_copy(map, &giant.map, (uint16_t)row * 32u, 32);
        for (i = 0; i != 32u; ++i) set_vram_byte((uint8_t *)(address + i), map[i]);
        if (ce_is_cgb) {
            VBK_REG = 1;
            for (i = 0; i != 32u; ++i) set_vram_byte((uint8_t *)(address + i), row >= 24u && row < 26u ? screen.palette : giant.palette);
            VBK_REG = 0;
        }
    }
    ce_copy(hud, &screen.map, 0, ce_hud_height / 8u * 20u);
    for (row = 0; row != ce_hud_height / 8u; ++row) ce_giant_hud(0, row, 20, hud + row * 20u);
    giant_frames[0] = giant_frames[1] = giant_frame = 0;
    giant_counts[0] = giant_counts[1] = ce_bg_map_front = 0;
    ce_giant_x = ce_giant_y = giant_next_x = giant_next_y = 0;
    ce_bg_tile_drops = 0; ce_bg_peak_tiles = giant_first; HIDE_WIN;
    LCDC_REG &= ~8u; ce_bg_begin();
}
void ce_giant_position(CE_Entity *e) BANKED {
    int16_t x = (int16_t)giant.ox * 16, y = (int16_t)giant.oy * 16;
    /* Keep the HUD's two reserved map rows outside the scrolling playfield,
     * and prevent the 256px torus from exposing a duplicate of the boss. */
    if (e->x < x - 1024) e->x = x - 1024;
    if (e->x > x + 1024) e->x = x + 1024;
    if (e->y < y - 512) e->y = y - 512;
    if (e->y > y + 512) e->y = y + 512;
}
void ce_giant_flush(void) CE_BG_ENTRY {
    uint8_t back = ce_bg_map_front ^ 1u, count = 0, i, j, x, y, base, tile, row, bits;
    uint16_t address = back ? 0x9c00u : 0x9800u, cell, mask, offset = (uint16_t)back * 32u;
#if CE_CGB_ONLY
    uint8_t saved=SVBK_REG;SVBK_REG=1;
#endif
    for (i = 0; i != ce_used; ++i) if (CE_ENTITY(i).kind == CE_BOSS) {
        giant_frame = (CE_ENTITY(i).age >> giant.frame_shift) % giant.frames;
        giant_next_x = giant.ox - CE_ENTITY(i).x / 16;
        giant_next_y = giant.oy - CE_ENTITY(i).y / 16; break;
    }
#if CE_CGB_ONLY
    SVBK_REG=saved;
#endif
    /* Restore the hidden page's previous patches, never the visible page. */
    for (i = 0; i != giant_counts[back]; ++i)
        set_vram_byte((uint8_t *)(address + GIANT_OLD[offset + i]), GIANT_BASE[offset + i]);
    /* Only changed map cells are transferred; image tiles stay resident in VRAM. */
    if (giant_frames[back] != giant_frame) {
        for (i = 0; i != giant.change_count; ++i) {
            ce_copy(tile_buffer, &giant.changes, (uint16_t)i * 2u, 2);
            cell = tile_buffer[0] | ((uint16_t)tile_buffer[1] << 8);
            set_vram_byte((uint8_t *)(address + cell), ce_read(&giant.map, (uint16_t)giant_frame * 1024u + cell));
        }
        giant_frames[back] = giant_frame;
    }
    for (i = 0; i != ce_bg_limit; ++i) if (ce_bg_life[i]) {
        x = ((uint16_t)ce_bg_x[i] >> 8) + giant_next_x;
        y = ((uint16_t)ce_bg_y[i] >> 8) + giant_next_y;
        cell = (uint16_t)(y >> 3) * 32u + (x >> 3);
        mask = 1u << (((y & 6u) << 1) | ((x & 6u) >> 1));
        for (j = 0; j != count && GIANT_CELLS[j] != cell; ++j) {}
        if (j == count) { GIANT_CELLS[count] = cell; GIANT_MASKS[count++] = 0; }
        GIANT_MASKS[j] |= mask;
    }
    for (i = 0; i != count; ++i) {
        cell = GIANT_CELLS[i]; base = ce_read(&giant.map, (uint16_t)giant_frame * 1024u + cell);
        ce_copy(tile_buffer, &giant.tiles, (uint16_t)(base - hud_tiles) * 16u, 16);
        mask = GIANT_MASKS[i];
        for (row = 0; row != 16u; row += 4u) {
            bits = expand[mask & 15u]; mask >>= 4;
            tile_buffer[row] |= bits; tile_buffer[row + 1u] |= bits;
            tile_buffer[row + 2u] |= bits; tile_buffer[row + 3u] |= bits;
        }
        tile = giant_first + offset + i; set_bkg_data(tile, 1, tile_buffer);
        set_vram_byte((uint8_t *)(address + cell), tile);
        GIANT_OLD[offset + i] = cell; GIANT_BASE[offset + i] = base;
    }
    giant_counts[back] = count;
    if (giant_first + 32u + count > ce_bg_peak_tiles) ce_bg_peak_tiles = giant_first + 32u + count;
}
void ce_giant_publish(void) CE_BG_ENTRY {
    ce_giant_x = giant_next_x; ce_giant_y = giant_next_y; ce_bg_map_front ^= 1u;
    if (ce_bg_map_front) LCDC_REG |= 8u; else LCDC_REG &= ~8u;
    move_bkg(ce_hud_bottom ? ce_giant_x : 0, ce_hud_bottom ? ce_giant_y : 192u);
}
