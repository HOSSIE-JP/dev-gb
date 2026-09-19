#pragma bank 1
#include "caravan.h"
#include <stddef.h>


static uint8_t buffer[128];
static uint16_t previous_row;
static uint16_t hud_values[32];
static uint8_t hud_valid, parallax_phase, live_flash;
#if CE_CGB_ONLY && CE_HUD_RIGHT
#include "cgb-road.h"
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
#if CE_CGB_ONLY
    /* Full brightness is the original RGB555 data. In particular, the live
     * boss bomb restores this palette on every flash edge: doing RGB channel
     * extraction and software multiplication here misses the next VBlank. */
    if (!ce_fade_level) {
        BGP_REG = OBP0_REG = OBP1_REG = ce_dmg_palette;
        set_bkg_palette(0, ce_palette_count, ce_palettes);
        set_sprite_palette(0, ce_palette_count, ce_palettes);
        if (ce_color_sprites) {
            set_sprite_palette(1, 7, ce_color_obj_palettes);
#if CE_GRAZE_ENABLED
            ce_graze_palette(0);
#endif
        }
        if ((*color_screen(ce_active_screen)).tile_count || (ce_active_screen == 4u && ce_color_stages[ce_state.stage].attrs)) {
            ce_copy((uint8_t *)(fade_colors + 4), ce_active_screen == 4u ? &ce_color_stages[ce_state.stage].palettes : &(*color_screen(ce_active_screen)).palettes, 0, 56);
            set_bkg_palette(1, 7, fade_colors + 4);
        }
        if (ce_active_screen == 4u && ce_battle_mode == 2u) ce_bg_palette();
        return;
    }
#endif
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
#if CE_GRAZE_ENABLED
            ce_graze_palette(ce_fade_level);
#endif
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
    if (ce_active_screen == 4u && ce_battle_mode == 2u) ce_bg_palette();
}
void ce_set_fade(uint8_t level) BANKED { ce_fade_level = level; palettes(); }
/* The live bomb changes only the BG palette: the scrolling map, sprites,
 * collision, firing and stage clock continue through both flash phases. */
static void live_bomb_palette(void) {
    uint8_t i, flash = ce_bomb_left && ((ce_bomb_frames - ce_bomb_left) / ce_bomb_period & 1u);
    if (!flash) { if (live_flash) palettes(); live_flash = 0; return; }
    live_flash = 1;
    BGP_REG = (ce_battle_mode == 2u ? (ce_bg_plane ? 15u : 51u) : ce_dmg_palette) ^ 255u;
    if (ce_is_cgb) {
        if (ce_battle_mode == 2u) {
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
static void hide_all(void) { hud_valid=0;ce_hide_sprites(); }

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
    const CE_Screen *s = &ce_screens[index]; uint8_t row, n;
#if CE_HUD_RIGHT
    uint8_t height=18u;
#else
    uint8_t height=window?ce_hud_height>>3:18u;
#endif
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
    uint8_t i, stride = s->horizontal ? s->height : s->width;
    uint8_t count = stride, target = row & 31u;
#if CE_HUD_RIGHT
    /* The Window permanently covers columns 15..19 on vertical stages.
     * Preserve the source stride, but do not read/attribute/upload those cells. */
    if(!s->horizontal && count>15u)count=15u;
#endif
    if (s->loop) world %= length;
    if (world < length) {
        ce_map_copy(buffer, s->map, world * stride, count);
        for (i = 0; i != count; ++i) {
            if (s->object_count) buffer[i] = ce_terrain_tile(s->horizontal ? world : i, s->horizontal ? i : world, buffer[i]);
            if (ce_is_cgb && ce_color_stages[ce_state.stage].attrs) buffer[64u+i] = ce_color_stages[ce_state.stage].attrs[buffer[i]];
            buffer[i] += ce_screens[4].tile_count;
        }
    } else for (i = 0; i != count; ++i) { buffer[i] = 0; buffer[64u+i] = 0; }
    #if CE_CGB_ONLY && CE_HUD_RIGHT
    if(cgb_collect_rows && !s->horizontal && count<=15u){cgb_queue_row(target,count);return;}
    #endif
    if (s->horizontal) set_tiles(target, 0, 1, count, (uint8_t *)0x9800, buffer);
    else set_tiles(0, target, count, 1, (uint8_t *)0x9800, buffer);
    if (ce_is_cgb) {
        for (i = 0; i != count; ++i) buffer[i] = ce_color_stages[ce_state.stage].attrs ? buffer[64u+i] : s->palette;
        VBK_REG = 1;
        if (s->horizontal) set_tiles(target, 0, 1, count, (uint8_t *)0x9800, buffer);
        else set_tiles(0, target, count, 1, (uint8_t *)0x9800, buffer);
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
    ce_active_screen = screen; LCDC_REG &= ~24u;
    ce_fade_level = 4; palettes();
    HIDE_WIN; HIDE_SPRITES; hide_all(); ce_active_screen = screen;
    screen_tiles(screen);
    screen_map(screen, 0); move_bkg(0, 0); ce_hud(); SHOW_BKG; DISPLAY_ON;
    vsync(); ce_fade_level = black ? 4 : 0; palettes();
}
void ce_load_screen(uint8_t screen) BANKED { load_screen(screen, 0); }
void ce_load_logo(uint8_t screen) BANKED { load_screen(screen, 1); }
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
#if CE_HUD_RIGHT
    if(ce_bomb_live==2u && !ce_battle_mode){ce_bomb_image=2;return;}
#endif
    ce_active_screen=screen;ce_fade_level=4;palettes();HIDE_WIN;live_flash=255u;
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

#if CE_HUD_RIGHT
        LCDC_REG&=~8u;LCDC_REG|=64u;screen_map(4,1);move_win(127,0);hud_valid=0;ce_hud();
        move_bkg(ce_bomb_styles[ce_character]?60-ce_state.player_x/16:0,ce_bomb_styles[ce_character]?90-ce_state.player_y/16:0);
        vsync();ce_fade_level=0;palettes();SHOW_WIN;SHOW_BKG;SHOW_SPRITES;
#else
    LCDC_REG|=8u;
    for(row=0;row!=32u;++row)buffer[row]=0;
    for(row=0;row!=32u;++row){
        set_bkg_tiles(0,row,32,1,buffer);
        if(ce_is_cgb){VBK_REG=1;set_bkg_tiles(0,row,32,1,buffer);VBK_REG=0;}
    }
    move_bkg(ce_bomb_styles[ce_character]?80-ce_state.player_x/16:0,ce_bomb_styles[ce_character]?120-ce_state.player_y/16:0);vsync();ce_fade_level=0;palettes();SHOW_BKG;SHOW_SPRITES;
#endif
}
void ce_bomb_draw(uint8_t visible) BANKED {
#if CE_HUD_RIGHT
        uint8_t i;
        if(ce_bomb_image==2u){ce_road_bomb_draw(visible);return;}
        if(ce_bomb_styles[ce_character])move_bkg(60-ce_state.player_x/16,90-ce_state.player_y/16);
        if(visible!=live_flash){
            palettes();
            if(!visible){if(ce_is_cgb){for(i=0;i!=28u;++i)fade_colors[i]=0;set_bkg_palette(1,7,fade_colors);}else BGP_REG=ce_dmg_palette^255u;}
            live_flash=visible;
        }
        SHOW_WIN;
#else
    if(ce_bomb_styles[ce_character])move_bkg(80-ce_state.player_x/16,120-ce_state.player_y/16);
    if(visible)LCDC_REG&=~8u;else LCDC_REG|=8u;
#endif
}
void ce_load_stage(void) BANKED {
    uint8_t row; uint16_t start = ce_state.camera >> 7; const CE_Stage *s = ce_stage;
    LCDC_REG&=~16u;
    if (ce_battle_mode >= 2u) {
        /* A cut-in replaced only the arena. Reload its HUD/sprites/bullet tiles,
         * without uploading the scrolling stage map that stays invisible. */
        ce_active_screen = 4; hide_all(); CE_SET_OBJ_SIZE; ce_battle_setup();
        SHOW_BKG; SHOW_SPRITES; DISPLAY_ON; return;
    }
    /* Preserve an enabled, black LCD during transition loading. Turning it off
     * would flash white on DMG. GBDK VRAM APIs wait for safe access windows. */
    if (!ce_battle_mode && ce_fade_level != 4u) DISPLAY_OFF;
    LCDC_REG &= ~8u; hide_all(); ce_active_screen = 4; palettes();
    tiles(&ce_screens[4].tiles, 0, ce_screens[4].tile_count, 0);
    tiles(ce_is_cgb && ce_color_stages[ce_state.stage].attrs ? &ce_color_stages[ce_state.stage].tiles : &s->tiles, ce_screens[4].tile_count, s->tile_count, 0);
    tiles(ce_is_cgb && ce_color_sprites ? &ce_color_sprite_data : &ce_sprite_data, 128, ce_sprite_tiles, 1); CE_SET_OBJ_SIZE;
    #if CE_CGB_ONLY && CE_HUD_RIGHT
    cgb_collect_rows=0;cgb_prepare_road();
    #endif
    for (row = 0; row != 32u; ++row) map_row(start + row);
    ce_terrain_clean();
    screen_map(4, 1); move_win(CE_HUD_RIGHT ? 127 : 7, ce_hud_bottom ? 144u - ce_hud_height : 0);
    parallax_phase = 255u; previous_row = start; move_camera();
    if (ce_battle_mode) ce_battle_setup(); else if (ce_battle_asset != CE_NONE) ce_load_boss(ce_battle_asset);
    ce_hud(); ce_prepare_road_bomb(); SHOW_BKG; if (ce_battle_mode != 2u) SHOW_WIN; SHOW_SPRITES; DISPLAY_ON;
}
static void hud_write(uint8_t x,uint8_t y,uint8_t digits) {
#if CE_HUD_RIGHT
    if(ce_bomb_image){set_win_tiles(x,y,digits,1,buffer);return;}
#endif
    if(ce_active_screen==4u && ce_battle_mode==3u)ce_giant_hud(x,y,digits,buffer);
    else if(ce_active_screen==4u && ce_battle_mode==2u)ce_bg_hud(x,y,digits,buffer);
    else if(ce_active_screen==4u)set_win_tiles(x,y,digits,1,buffer);
    else set_bkg_tiles(x,y,digits,1,buffer);
}
static void number(uint8_t x, uint8_t y, uint16_t value, uint8_t digits) {
    uint8_t i = digits;
#if CE_HUD_RIGHT
    const CE_Screen *s = &ce_screens[ce_bomb_image ? 4 : ce_active_screen];
#else
    const CE_Screen *s = &ce_screens[ce_active_screen];
#endif

    while (i) { --i; buffer[i] = s->digits[value % 10u]; value /= 10u; }
    hud_write(x,y,digits);
}
void ce_hud(void) BANKED {

#if CE_HUD_RIGHT
    const CE_Screen *s = &ce_screens[ce_bomb_image ? 4 : ce_active_screen];
#else
    const CE_Screen *s = &ce_screens[ce_active_screen];
#endif
 const CE_Binding *b; uint8_t i, j;
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
        else if (b->kind == 4u) value = CE_HUD_RIGHT ? ce_boss_status(4) : ce_boss_hp();
        else if (b->kind >= 10u) value = ce_boss_status(b->kind);
        else if (b->kind == 6u) value = ce_bombs;
        else if (b->kind == 7u) value = ce_shot_level + 1u;
        else if (b->kind == 8u) value = ce_speed_level + 1u;
        else if (b->kind == 9u) value = ce_barrier;
        if(b->kind==10u && value<=10u && (ce_state.tick&16u))value=65534u;
        if (ce_active_screen == 4u || (CE_HUD_RIGHT && ce_bomb_image)) {
            if (hud_valid && hud_values[i] == value) continue;
            hud_values[i] = value;
        }
        if ((b->kind==4u && CE_HUD_RIGHT) || b->kind>=10u) {
            if(value>=65534u){
                for(j=0;j!=b->digits;++j)buffer[j]=ce_hud_symbols[value==65534u || j+2u<b->digits?0u:1u];
                hud_write(b->x,b->y,b->digits);continue;
            }
            if(b->kind==11u){buffer[0]=s->digits[value>>8];buffer[1]=ce_hud_symbols[2];buffer[2]=s->digits[value&255u];hud_write(b->x,b->y,3);continue;}
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
#if CE_CGB_ONLY && CE_HUD_RIGHT
    if(cgb_parallax_cached){parallax_phase=phase;cgb_parallax_pending=1;return;}
#endif
    ce_copy(buffer, ce_is_cgb && ce_color_stages[ce_state.stage].attrs ? &ce_color_parallaxes[ce_state.stage] : &p->frames, (uint16_t)phase * p->count * 16u, (uint16_t)p->count * 16u);
    set_tile_data(ce_screens[4].tile_count + p->first, p->count, buffer, 0x90);
    parallax_phase = phase;
}
void ce_render(void) BANKED {
    uint8_t i; uint16_t row = ce_state.camera >> 7;
    uint16_t length;
#if CE_CGB_ONLY && CE_HUD_RIGHT
    cgb_collect_rows=1;
#endif
    if (!ce_battle_mode && (!ce_bomb_image || ce_bomb_image==2u)) {
    if (row != previous_row) {
    length = ce_stage->horizontal ? ce_stage->width : ce_stage->height;
    if (row + 1u == previous_row || (ce_stage->loop && !(length & 31u) && previous_row == 0u && row + 1u == length)) map_row(row);
    else if (ce_stage->loop && !(length & 31u) && row == 0u && previous_row + 1u == length) map_row(31u);
    else if (row != previous_row && row != previous_row + 1u) { DISPLAY_OFF;
#if CE_CGB_ONLY && CE_HUD_RIGHT
        cgb_collect_rows=0;
#endif
        for (i = 0; i != 32u; ++i) map_row(row + i); DISPLAY_ON; }
    else if (row != previous_row) map_row(row + 31u);
    previous_row = row;
    }
    if (ce_stage->object_count) ce_terrain_flush(ce_screens[4].tile_count);
    }
    ce_draw_sprites();
    #if CE_HUD_RIGHT
    if (!(ce_state.tick & 7u)) ce_hud();
#else
    if (!(ce_state.tick & 7u) && !ce_bomb_image) ce_hud();
#endif
    if (!ce_bomb_image) {
        if (ce_battle_mode == 2u) ce_bg_flush();
        else if (ce_battle_mode == 3u) ce_giant_flush();
    }
    #if CE_CGB_ONLY && CE_HUD_RIGHT
    cgb_collect_rows=0;
    if(!ce_battle_mode && (!ce_bomb_image||ce_bomb_image==2u))parallax();
    #else
    if(ce_bomb_image==2u)parallax();
    #endif
    ENABLE_OAM_DMA;
    /* Publish every completed pose through VBlank DMA before another update
     * can overwrite it. Repeated display frames under load are intentional. */
    if(ce_bomb_image==2u){ce_bomb_draw(((ce_bomb_frames-ce_bomb_left)/ce_bomb_period)&1u);
#if CE_CGB_ONLY && CE_HUD_RIGHT
        cgb_publish_road();
#endif
    }
    else {
    vsync();
    if (ce_bomb_image) ce_bomb_draw(((ce_bomb_frames-ce_bomb_left)/ce_bomb_period)&1u);
    else if (ce_battle_mode == 2u) ce_bg_publish();
    else if (ce_battle_mode == 3u) ce_giant_publish();
    else if (!ce_battle_mode) { move_camera();
#if CE_CGB_ONLY && CE_HUD_RIGHT
        cgb_publish_road();
#else
        parallax();
#endif
    }
    }
#if CE_GRAZE_ENABLED
    if (!ce_is_cgb) OBP1_REG = ce_graze_flash && !ce_state.invulnerable ? 0x40u : OBP0_REG;
#endif
    if (ce_bomb_live == 1u) live_bomb_palette();
}

void ce_get_presentation(CE_Presentation *dest, uint8_t stage) BANKED { *dest = ce_presentations[(uint16_t)stage * ce_player_count + ce_character]; }

void ce_get_screen(CE_Screen *dest, uint8_t index) BANKED { *dest = ce_screens[index]; }
void ce_get_road_palette(CE_Data *dest) BANKED { *dest=ce_color_stages[ce_state.stage].palettes; }
void ce_get_giant(CE_Giant *dest) BANKED { *dest = ce_giants[ce_giant_ref]; }
void ce_load_boss(uint8_t asset) BANKED {
    if (ce_battle_mode == 3u) return;
    if (asset == CE_NONE || !ce_boss_graphics[asset].length) return;
    tiles(ce_is_cgb && ce_color_sprites ? &ce_color_boss_graphics[asset] : &ce_boss_graphics[asset], ce_assets[asset].first_tile - (ce_battle_mode == 2u ? 128u : 0u), ce_boss_graphics[asset].length / 16u, 1);
}
void ce_battle_setup(void) BANKED {
    uint8_t i;
    HIDE_SPRITES; HIDE_WIN; ce_fade_level = 4; palettes();
    if (ce_battle_mode >= 2u) {
        tiles(ce_is_cgb && ce_color_sprites ? &ce_color_sprite_data : &ce_sprite_data, 0, ce_sprite_tiles, 1); if (ce_battle_mode == 3u) ce_giant_setup(); else ce_bg_setup();
    } else {
        for (i = 0; i != 32u; ++i) buffer[i] = 0;
        for (i = 0; i != 32u; ++i) set_bkg_tiles(0,i,32,1,buffer);
        move_bkg(0,0); SHOW_WIN;
    }
    ce_load_boss(ce_battle_asset); hud_valid = 0; ce_hud();
    vsync(); ce_fade_level = 0; palettes(); SHOW_SPRITES;
}
