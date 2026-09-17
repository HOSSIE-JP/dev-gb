#pragma bank 255
#include "caravan.h"

#if CE_HUD_RIGHT
/* Road: signed BG tiles at $9000. Bomb: unsigned tiles at $8000.
 * OBJ stays at $8800. Map $9C00 columns 0..4 belong to the Window;
 * columns 5..31 hold the bomb, so neither map nor tile data needs a reload.
 * Scratch is on the reserved stack, not another persistent WRAM framebuffer. */
static uint8_t road_flash;

void ce_prepare_road_bomb(void) BANKED {
    CE_Screen screen; CE_ColorScreen color;
    uint8_t data[128], row, column, start, n, index=ce_bomb_screens[ce_character];
    uint16_t tile=0, count;
    if(ce_bomb_live!=2u || !ce_bomb_stock || ce_battle_mode || CE_BOSS_MODE)return;
    ce_get_screen(&screen,index);ce_get_color_screen(&color,index);
    count=ce_is_cgb&&color.tile_count?color.tile_count:screen.tile_count;
    while(tile<count){
        if(tile==128u){tile=256u;continue;}
        n=count-tile>8u?8u:count-tile;
        ce_copy(data,ce_is_cgb&&color.tile_count?&color.tiles:&screen.tiles,tile*16u,(uint16_t)n*16u);
        VBK_REG=tile>=256u;set_tile_data((uint8_t)tile,n,data,0x80);VBK_REG=0;
        tile+=n;
    }
    for(column=0;column!=27u;++column)data[column]=0;
    for(row=0;row!=32u;++row){
        set_tiles(5,row,27,1,(uint8_t *)0x9c00,data);
        if(ce_is_cgb){VBK_REG=1;set_tiles(5,row,27,1,(uint8_t *)0x9c00,data);VBK_REG=0;}
    }
    for(row=0;row!=(ce_bomb_styles[ce_character]?32u:18u);++row){
        uint16_t offset=row<18u?(uint16_t)row*20u:0;
        /* DMG tile 0 is truly blank, including for the independently indexed
         * color atlas. Copy only nonempty runs after the one-time clear. */
        ce_copy(data,&screen.map,offset,15);
        if(ce_is_cgb){
            ce_copy(data+16,color.tile_count?&color.map:&screen.map,offset,15);
            ce_copy(data+32,color.tile_count?&color.attrs:&screen.attrs,offset,15);
        }
        for(column=0;column<15u;){
            while(column<15u&&!data[column])++column;
            start=column;while(column<15u&&data[column])++column;n=column-start;
            if(n){
                set_tiles(11u+start,row,n,1,(uint8_t *)0x9c00,data+(ce_is_cgb?16u:0u)+start);
                if(ce_is_cgb){VBK_REG=1;set_tiles(11u+start,row,n,1,(uint8_t *)0x9c00,data+32u+start);VBK_REG=0;}
            }
        }
    }
    road_flash=0;
}

void ce_road_bomb_draw(uint8_t visible) BANKED {
    uint8_t x, changed=visible!=road_flash; CE_Data palette; CE_ColorScreen color;
    palette_color_t colors[28];
    /* Resolve banked descriptors/copy ROM before VBlank. Only palette ports,
     * LCDC and scroll registers belong to the short publish window. */
    palette.length=0;
    if(changed && ce_is_cgb){
            if(visible){ce_get_color_screen(&color,ce_bomb_screens[ce_character]);palette=color.palettes;}
            else ce_get_road_palette(&palette);
            if(palette.length)ce_copy((uint8_t *)colors,&palette,0,56);
    }
    x=ce_state.player_x/16;if(x<12u)x=12u;else if(x>108u)x=108u;
    vsync();
    if(changed && ce_is_cgb){
        if(palette.length)set_bkg_palette(1,7,colors);
        else if(ce_palette_count>1u)set_bkg_palette(1,ce_palette_count-1u,ce_palettes+4);
    }
    road_flash=visible;
    if(visible){
        /* A 216px safe strip excludes the Window's first five map columns.
         * Keep the beam four pixels inward at the extreme player positions. */
        LCDC_REG|=24u;
        move_bkg(ce_bomb_styles[ce_character]?148u-x:88u,ce_bomb_styles[ce_character]?90-ce_state.player_y/16:0);
    }else{
        LCDC_REG&=~24u;
        if(ce_stage->horizontal)move_bkg(ce_state.camera>>4,0);else move_bkg(0,ce_state.camera>>4);
    }
    SHOW_WIN;
}
#else
void ce_prepare_road_bomb(void) BANKED {}
void ce_road_bomb_draw(uint8_t visible) BANKED {visible;}
#endif

void ce_bomb_end(void) BANKED {
#if CE_HUD_RIGHT
    if(ce_bomb_image==2u){ce_road_bomb_draw(0);ce_bomb_image=0;return;}
#endif
    ce_bomb_image=0;ce_load_stage();
}
