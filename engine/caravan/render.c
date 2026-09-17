#pragma bank 1
#include "caravan.h"
#include <stddef.h>
#include <string.h>

typedef char ce_sprite_layout_check[(sizeof(CE_Asset) == 16u && offsetof(CE_Asset, first_tile) == 5u && offsetof(CE_Asset, frames) == 7u && offsetof(CE_Entity, age) == 6u && offsetof(CE_Entity, x) == 12u) ? 1 : -1];

static uint8_t buffer[128];
static uint16_t previous_row;
static uint16_t hud_values[32];
static uint8_t hud_valid, parallax_phase, live_flash;
#ifndef CE_DENSE
#define CE_SPRITE_LINKAGE static
#define CE_SPRITE_BANK
#include "sprite-render.h"
#endif
uint8_t ce_fade_level;
static palette_color_t fade_colors[32];
static CE_ColorScreen color_screen_data;
static uint8_t color_screen_index = 255u;
static const CE_ColorScreen *color_screen(uint8_t index) {
    if (color_screen_index != index) {
        ce_get_color_screen(&color_screen_data, index);
        color_screen_index = index;
    }
    return &color_screen_data;
}
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
        if (ce_color_sprites) {
            for (i = 0; i != 28u; ++i) {
                rgb = ce_color_obj_palettes[i];
                fade_colors[i + 4u] = (((rgb & 31u) * factor) >> 2) |
                    (((((rgb >> 5) & 31u) * factor) >> 2) << 5) |
                    (((((rgb >> 10) & 31u) * factor) >> 2) << 10);
            }
            set_sprite_palette(1, 7, fade_colors + 4);
        }
        if ((*color_screen(ce_active_screen)).tile_count || (ce_active_screen == 4u && ce_color_stages[ce_state.stage].attrs)) {
            ce_copy((uint8_t *)(fade_colors + 4), ce_active_screen == 4u ? &ce_color_stages[ce_state.stage].palettes : &(*color_screen(ce_active_screen)).palettes, 0, 56);
            for (i = 4; i != 32u; ++i) {
                rgb = fade_colors[i];
                fade_colors[i] = (((rgb & 31u) * factor) >> 2) |
                    (((((rgb >> 5) & 31u) * factor) >> 2) << 5) |
                    (((((rgb >> 10) & 31u) * factor) >> 2) << 10);
            }
            set_bkg_palette(1, 7, fade_colors + 4);
        }
    }
    if (ce_active_screen == 4u && CE_BG_MONO) ce_bg_palette();
}
void ce_set_fade(uint8_t level) BANKED { ce_fade_level = level; palettes(); }
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
/* The live bomb changes only the BG palette: the scrolling map, sprites,
 * collision, firing and stage clock continue through both flash phases. */
static void live_bomb_palette(void) {
    uint8_t i, flash = ce_bomb_left && ((ce_bomb_frames - ce_bomb_left) / ce_bomb_period & 1u);
    if (!flash) { if (live_flash) palettes(); live_flash = 0; return; }
    live_flash = 1;
    BGP_REG = (CE_BG_MONO ? (ce_bg_plane ? 15u : 51u) : ce_dmg_palette) ^ 255u;
    if (ce_is_cgb) {
        if (CE_BG_MONO) {
            for (i = 0; i != 4u; ++i) fade_colors[i] = i & (1u << ce_bg_plane) ? 0 : RGB(31,31,31);
            set_bkg_palette(0, 1, fade_colors);
        } else {
            for (i = 0; i != ce_palette_count * 4u; ++i) fade_colors[i] = ce_palettes[i] ^ 32767u;
            set_bkg_palette(0, ce_palette_count, fade_colors);
            if (ce_color_stages[ce_state.stage].attrs) {
                ce_copy((uint8_t *)(fade_colors + 4), &ce_color_stages[ce_state.stage].palettes, 0, 56);
                for (i = 4; i != 32u; ++i) fade_colors[i] ^= 32767u;
                set_bkg_palette(1, 7, fade_colors + 4);
            }
        }
    }
}
static void tiles(const CE_Data *data, uint8_t first, uint8_t count, uint8_t sprite) {
    uint8_t n; uint16_t offset = 0;
    while (count) {
        n = count > 8u ? 8u : count; ce_copy(buffer, data, offset, (uint16_t)n * 16u);
        if (sprite) set_sprite_data(first, n, buffer); else set_bkg_data(first, n, buffer);
        first += n; count -= n; offset += (uint16_t)n * 16u;
        if (ce_scene == 12u) ce_logo_skip |= joypad();
    }
}
static void hide_all(void) {
    uint8_t i; ce_reset_sprites(); hud_valid = 0;
    for (i = 0; i != 40u; ++i) hide_sprite(i);
}
static void screen_tiles(uint8_t index) {
    const CE_ColorScreen *c = &(*color_screen(index));
    uint16_t tile = 0; uint8_t n;
    if (!ce_is_cgb || !c->tile_count) { tiles(&ce_screens[index].tiles, 0, ce_screens[index].tile_count, 0); return; }
    while (tile < c->tile_count) {
        /* Live bombs retain the OBJ tiles in bank zero's upper half. */
        if (ce_bomb_live == 2u && ce_bomb_left && tile == 128u) { tile = 256u; continue; }
        n = c->tile_count - tile > 8u ? 8u : c->tile_count - tile;
        ce_copy(buffer, &c->tiles, tile * 16u, (uint16_t)n * 16u);
        VBK_REG = tile >= 256u; set_bkg_data((uint8_t)tile, n, buffer); VBK_REG = 0;
        tile += n;
        if (ce_scene == 12u) ce_logo_skip |= joypad();
    }
}
static void screen_map(uint8_t index, uint8_t window) {
    const CE_Screen *s = &ce_screens[index]; uint8_t row, n, height = window ? ce_hud_height >> 3 : 18u;
    for (row = 0; row != height; ++row) {
        if (ce_scene == 12u) ce_logo_skip |= joypad();
        ce_copy(buffer, ce_is_cgb && (*color_screen(index)).tile_count ? &(*color_screen(index)).map : &s->map, (uint16_t)row * 20u, 20u);
        if (window) set_win_tiles(0, row, 20, 1, buffer); else set_bkg_tiles(0, row, 20, 1, buffer);
        if (ce_is_cgb) {
            ce_copy(buffer, (*color_screen(index)).tile_count ? &(*color_screen(index)).attrs : &s->attrs, (uint16_t)row * 20u, 20u); VBK_REG = 1;
            if (window) set_win_tiles(0, row, 20, 1, buffer); else set_bkg_tiles(0, row, 20, 1, buffer);
            VBK_REG = 0;
        }
    }
    /* Clear the offscreen columns in the window as well. */
    for (n = 0; n != 12u; ++n) buffer[n] = 0;
    if (window) { set_win_tiles(20, 0, 12, 1, buffer); set_win_tiles(20, 1, 12, 1, buffer); }
}
static void map_row(uint16_t row) {
    const CE_Stage *s = ce_stage;
    uint16_t world = row, length = s->horizontal ? s->width : s->height;
    uint8_t i, count = s->horizontal ? s->height : s->width, target = row & 31u;
    if (s->loop) world %= length;
    if (world < length) {
        ce_map_copy(buffer, s->map, world * count, count);
        for (i = 0; i != count; ++i) {
            if (s->object_count) buffer[i] = ce_terrain_tile(s->horizontal ? world : i, s->horizontal ? i : world, buffer[i]);
            if (ce_is_cgb && ce_color_stages[ce_state.stage].attrs) buffer[64u+i] = ce_color_stages[ce_state.stage].attrs[buffer[i]];
            buffer[i] += ce_screens[4].tile_count;
        }
    } else for (i = 0; i != count; ++i) { buffer[i] = 0; buffer[64u+i] = 0; }
    if (s->horizontal) set_bkg_tiles(target, 0, 1, count, buffer);
    else set_bkg_tiles(0, target, count, 1, buffer);
    if (ce_is_cgb) {
        for (i = 0; i != count; ++i) buffer[i] = ce_color_stages[ce_state.stage].attrs ? buffer[64u+i] : s->palette;
        VBK_REG = 1;
        if (s->horizontal) set_bkg_tiles(target, 0, 1, count, buffer);
        else set_bkg_tiles(0, target, count, 1, buffer);
        VBK_REG = 0;
    }
}
static void move_camera(void) {
    if (ce_stage->horizontal) move_bkg(ce_state.camera >> 4, ce_hud_bottom ? 0u : -ce_hud_height);
    else move_bkg(0, (ce_state.camera >> 4) - (ce_hud_bottom ? 0u : ce_hud_height));
}
static void load_screen(uint8_t screen, uint8_t black) {
    ce_trace[22] = 1;
    /* Keep the LCD enabled: LCD-off is visibly white on DMG. Load behind black. */
    ce_active_screen = screen; LCDC_REG &= ~8u;
    ce_fade_level = 4; palettes();
    HIDE_WIN; HIDE_SPRITES; hide_all(); ce_active_screen = screen;
    screen_tiles(screen);
    screen_map(screen, 0); move_bkg(0, 0); ce_hud(); SHOW_BKG; DISPLAY_ON;
    vsync(); ce_fade_level = black ? 4 : 0; palettes();
}
void ce_load_screen(uint8_t screen) BANKED { load_screen(screen, 0); }
void ce_load_logo(uint8_t screen) BANKED { load_screen(screen, 1); }
extern const uint8_t ce_title_tiles[];
void ce_title_draw(void) BANKED {
    if (!ce_title_select) return;
    buffer[0]=ce_title_tiles[!ce_title_choice];set_bkg_tiles(1,14,1,1,buffer);
    buffer[0]=ce_title_tiles[ce_title_choice];set_bkg_tiles(1,16,1,1,buffer);
    buffer[0]=ce_title_tiles[2u+(ce_title_stage+1u)/10u];
    buffer[1]=ce_title_tiles[2u+(ce_title_stage+1u)%10u];set_bkg_tiles(16,16,2,1,buffer);
}
void ce_dialogue_update(uint8_t screen) BANKED {
    uint8_t row;
    /* Compiler shares the complete glyph atlas across this conversation.
     * Portrait tiles and their map never change; only the six text rows do. */
    ce_trace[22] = 1; ce_active_screen = screen;
    for (row = 12; row != 18; ++row) {
        ce_copy(buffer, ce_is_cgb && (*color_screen(screen)).tile_count ? &(*color_screen(screen)).map : &ce_screens[screen].map, (uint16_t)row * 20u, 20u);
        vsync(); set_bkg_tiles(0, row, 20, 1, buffer);
        if (ce_is_cgb) {
            ce_copy(buffer, (*color_screen(screen)).tile_count ? &(*color_screen(screen)).attrs : &ce_screens[screen].attrs, (uint16_t)row * 20u, 20u);
            VBK_REG = 1; set_bkg_tiles(0, row, 20, 1, buffer); VBK_REG = 0;
        }
        ce_audio_sync();
    }
}
void ce_bomb_setup(void) BANKED {
    uint8_t row,screen=ce_bomb_screens[ce_character];const CE_Screen *s=&ce_screens[screen];
    ce_active_screen=screen;ce_fade_level=4;palettes();HIDE_WIN;
    /* The compiler limits this atlas to 128 tiles: sprite art stays intact. */
    for(row=0;row!=32u;++row)buffer[row]=0;
    LCDC_REG&=~8u;
    for(row=0;row!=32u;++row){set_bkg_tiles(0,row,32,1,buffer);if(ce_is_cgb){VBK_REG=1;set_bkg_tiles(0,row,32,1,buffer);VBK_REG=0;}}
    screen_tiles(screen);screen_map(screen,0);
    if(ce_bomb_styles[ce_character]){
        /* Continue the beam through the wrapped top edge when fired near the bottom. */
        ce_copy(buffer,ce_is_cgb&&(*color_screen(screen)).tile_count?&(*color_screen(screen)).map:&s->map,0,20);set_bkg_tiles(0,30,20,1,buffer);set_bkg_tiles(0,31,20,1,buffer);
        if(ce_is_cgb){ce_copy(buffer,(*color_screen(screen)).tile_count?&(*color_screen(screen)).attrs:&s->attrs,0,20);VBK_REG=1;set_bkg_tiles(0,30,20,1,buffer);set_bkg_tiles(0,31,20,1,buffer);VBK_REG=0;}
    }
    LCDC_REG|=8u;
    for(row=0;row!=32u;++row)buffer[row]=0;
    for(row=0;row!=32u;++row){
        set_bkg_tiles(0,row,32,1,buffer);
        if(ce_is_cgb){VBK_REG=1;set_bkg_tiles(0,row,32,1,buffer);VBK_REG=0;}
    }
    move_bkg(ce_bomb_styles[ce_character]?80-ce_state.player_x/16:0,ce_bomb_styles[ce_character]?120-ce_state.player_y/16:0);vsync();ce_fade_level=0;palettes();SHOW_BKG;SHOW_SPRITES;
}
void ce_bomb_draw(uint8_t visible) BANKED {
    if(ce_bomb_styles[ce_character])move_bkg(80-ce_state.player_x/16,120-ce_state.player_y/16);
    if(visible)LCDC_REG&=~8u;else LCDC_REG|=8u;
}
void ce_load_stage(void) BANKED {
    uint8_t row; uint16_t start = ce_state.camera >> 7; const CE_Stage *s = ce_stage;
    if (CE_BG_ACTIVE) {
        #ifdef CE_DENSE
        if(CE_ROAD_BG)ce_bg_limit=ce_stage_bg[ce_state.stage];
#endif
        /* A cut-in replaced only the arena. Reload its HUD/sprites/bullet tiles,
         * without uploading the scrolling stage map that stays invisible. */
        ce_active_screen = 4; hide_all();
#ifdef CE_DENSE
    SPRITES_8x16;
#else
    SPRITES_8x8;
#endif
 ce_battle_setup();
        SHOW_BKG; SHOW_SPRITES; DISPLAY_ON; return;
    }
    /* Preserve an enabled, black LCD during transition loading. Turning it off
     * would flash white on DMG. GBDK VRAM APIs wait for safe access windows. */
    if (!ce_battle_mode && ce_fade_level != 4u) DISPLAY_OFF;
    LCDC_REG &= ~8u; hide_all(); ce_active_screen = 4; palettes();
    tiles(&ce_screens[4].tiles, 0, ce_screens[4].tile_count, 0);
    tiles(ce_is_cgb && ce_color_stages[ce_state.stage].attrs ? &ce_color_stages[ce_state.stage].tiles : &s->tiles, ce_screens[4].tile_count, s->tile_count, 0);
    tiles(ce_is_cgb && ce_color_sprites ? &ce_color_sprite_data : &ce_sprite_data, 128, ce_sprite_tiles, 1);
#ifdef CE_DENSE
    SPRITES_8x16;
#else
    SPRITES_8x8;
#endif

    for (row = 0; row != 32u; ++row) map_row(start + row);
    ce_terrain_clean();
    screen_map(4, 1); move_win(7, ce_hud_bottom ? 144u - ce_hud_height : 0);
    parallax_phase = 255u; previous_row = start; move_camera();
    if (ce_battle_mode) ce_battle_setup(); else if (ce_battle_asset != CE_NONE) ce_load_boss(ce_battle_asset);
    ce_hud(); SHOW_BKG; if (!CE_BG_MONO) SHOW_WIN; SHOW_SPRITES; DISPLAY_ON;
}
static void number(uint8_t x, uint8_t y, uint16_t value, uint8_t digits) {
    uint8_t i = digits; const CE_Screen *s = &ce_screens[ce_active_screen];
    while (i) { --i; buffer[i] = s->digits[value % 10u]; value /= 10u; }
    if (ce_active_screen == 4u && ce_battle_mode == 3u) ce_giant_hud(x, y, digits, buffer);
    else if (ce_active_screen == 4u && CE_BG_MONO) ce_bg_hud(x, y, digits, buffer);
    else if (ce_active_screen == 4u) set_win_tiles(x, y, digits, 1, buffer);
    else set_bkg_tiles(x, y, digits, 1, buffer);
}
void ce_hud(void) BANKED {
    const CE_Screen *s = &ce_screens[ce_active_screen]; const CE_Binding *b; uint8_t i, j;
    uint16_t value;
    for (i = 0; i != s->bindings; ++i) {
        b = &s->binding[i]; value = 0;
        if (b->kind == 5u) { for (j = 0; j != 5u; ++j) { number(b->x, b->y + j * 2u, j + 1u, 1); number(b->x + 3u, b->y + j * 2u, ce_scores[j], 5); } continue; }
        if (b->kind == 1u) value = ce_scene == 6u && i < 4u ? ce_bonus_values[i] : ce_state.score;
        else if (b->kind == 2u) value = ce_state.lives;
        else if (b->kind == 3u) {
            if (ce_scene == 13u) value = (ce_continue_left + 59u) / 60u;
            else if (ce_time_limit && ce_state.stage_tick < ce_stage->duration) value = (ce_stage->duration - ce_state.stage_tick + 59u) / 60u;
        }
        else if (b->kind == 4u) value = ce_boss_hp();
        else if (b->kind == 6u) value = ce_bombs;
        else if (b->kind == 7u) value = ce_shot_level + 1u;
        else if (b->kind == 8u) value = ce_speed_level + 1u;
        else if (b->kind == 9u) value = ce_barrier;
        if (ce_active_screen == 4u) {
            if (hud_valid && hud_values[i] == value) continue;
            hud_values[i] = value;
        }
        number(b->x, b->y, value, b->digits);
    }
    hud_valid = 1;
}
/* Tile-space parallax: compensate the main camera with a cyclic texture offset.
 * At divisor 2 the central motif moves at half the world speed, on DMG and CGB.
 * Tile bytes are prepared in ROM; only up to 128 bytes change at a phase edge. */
static void parallax(void) {
    const CE_Parallax *p = &ce_parallaxes[ce_state.stage];
    uint16_t camera = ce_state.camera >> 4;
    uint8_t phase;
    if (!p->count) return;
    if (!(p->phases & (p->phases - 1u))) phase = ((p->divisor == 2u ? camera >> 1 : camera / p->divisor) - camera) & (p->phases - 1u);
    else phase = (p->phases - (camera - camera / p->divisor) % p->phases) % p->phases;
    if (phase == parallax_phase) return;
    ce_copy(buffer, ce_is_cgb && ce_color_stages[ce_state.stage].attrs ? &ce_color_parallaxes[ce_state.stage] : &p->frames, (uint16_t)phase * p->count * 16u, (uint16_t)p->count * 16u);
    set_bkg_data(ce_screens[4].tile_count + p->first, p->count, buffer);
    parallax_phase = phase;
}
void ce_render(void) BANKED {
    uint8_t i; uint16_t row = ce_state.camera >> 7;
    uint16_t length;
    if (!ce_battle_mode && !CE_ROAD_BG && !ce_bomb_image) {
    if (row != previous_row) {
    length = ce_stage->horizontal ? ce_stage->width : ce_stage->height;
    if (row + 1u == previous_row || (ce_stage->loop && !(length & 31u) && previous_row == 0u && row + 1u == length)) map_row(row);
    else if (ce_stage->loop && !(length & 31u) && row == 0u && previous_row + 1u == length) map_row(31u);
    else if (row != previous_row && row != previous_row + 1u) { DISPLAY_OFF; for (i = 0; i != 32u; ++i) map_row(row + i); DISPLAY_ON; }
    else if (row != previous_row) map_row(row + 31u);
    previous_row = row;
    }
    if (ce_stage->object_count) ce_terrain_flush(ce_screens[4].tile_count);
    }
#ifdef CE_DENSE
    ce_render_sprites();
#else
#include "sprite-frame.h"
#endif
    if (!ce_bomb_image) {
        if (!(ce_state.tick & 7u)) ce_hud();
        if (CE_BG_MONO) ce_bg_flush();
        else if (ce_battle_mode == 3u) ce_giant_flush();
    }
    ENABLE_OAM_DMA;
    /* Publish every completed pose through VBlank DMA before another update
     * can overwrite it. Repeated display frames under load are intentional. */
    vsync();
    if (ce_bomb_image) ce_bomb_draw(((ce_bomb_frames-ce_bomb_left)/ce_bomb_period)&1u);
    else if (CE_BG_MONO) ce_bg_publish();
    else if (ce_battle_mode == 3u) ce_giant_publish();
    else if (!ce_battle_mode) { move_camera(); parallax(); }
    if (ce_bomb_live == 1u) live_bomb_palette();
}

void ce_get_presentation(CE_Presentation *dest, uint8_t stage) BANKED { *dest = ce_presentations[(uint16_t)stage * ce_player_count + ce_character]; }

void ce_get_screen(CE_Screen *dest, uint8_t index) BANKED { *dest = ce_screens[index]; }
void ce_get_giant(CE_Giant *dest) BANKED { *dest = ce_giants[ce_giant_ref]; }
void ce_load_boss(uint8_t asset) BANKED {
    if (ce_battle_mode == 3u) return;
    if (asset == CE_NONE || !ce_boss_graphics[asset].length) return;
    tiles(ce_is_cgb && ce_color_sprites ? &ce_color_boss_graphics[asset] : &ce_boss_graphics[asset], ce_assets[asset].first_tile - (CE_BG_MONO ? 128u : 0u), ce_boss_graphics[asset].length / 16u, 1);
}
void ce_battle_setup(void) BANKED {
    uint8_t i;
    HIDE_SPRITES; HIDE_WIN; ce_fade_level = 4; palettes();
    if (CE_BG_ACTIVE) {
        tiles(ce_is_cgb && ce_color_sprites ? &ce_color_sprite_data : &ce_sprite_data, 0, ce_sprite_tiles, 1); if (ce_battle_mode == 3u) ce_giant_setup(); else ce_bg_setup();
    } else {
        for (i = 0; i != 32u; ++i) buffer[i] = 0;
        for (i = 0; i != 32u; ++i) set_bkg_tiles(0,i,32,1,buffer);
        move_bkg(0,0); SHOW_WIN;
    }
    ce_load_boss(ce_battle_asset); hud_valid = 0; ce_hud();
    vsync(); ce_fade_level = 0; palettes(); SHOW_SPRITES;
}
