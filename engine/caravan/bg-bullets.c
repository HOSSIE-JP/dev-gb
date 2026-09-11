#pragma bank 255
#include "caravan.h"
#include <string.h>
/* 2x2 bullets on a two-pixel grid. DMG uses an inactive bitplane; CGB
 * precomposes RAM packets and publishes them with the hidden map by GDMA. */
uint8_t ce_battle_mode, ce_battle_asset, ce_bg_limit, ce_bg_count, ce_bg_hit;
uint8_t ce_bg_plane, ce_bg_back, ce_bg_map_front;
uint16_t ce_bg_tile_drops, ce_bg_peak_tiles;
int16_t ce_bg_x[CE_MAX_BG_SHOTS], ce_bg_y[CE_MAX_BG_SHOTS], ce_bg_vx[CE_MAX_BG_SHOTS], ce_bg_vy[CE_MAX_BG_SHOTS];
uint16_t ce_bg_life[CE_MAX_BG_SHOTS];
static uint8_t damage[CE_MAX_BG_SHOTS];
static uint16_t cells[360], compound_cells[CE_MAX_BG_SHOTS / 2];
/* CGB uploads at most 32 composite tiles plus 18 full map rows in VBlank.
 * cells is dead after composition and doubles as the aligned DMA map source. */
static uint8_t dma_tile_storage[CE_MAX_BG_SHOTS / 2 * 16 + 15];
static uint8_t *dma_tiles, *dma_map, *dma_cursor;
uint8_t ce_bg_dma_end_ly;
static uint8_t compound_count, flush_left;
static uint8_t map[360], hud[40], tile_buffer[16], hud_tiles, static_tiles;
/* With an ordinary HUD the CGB tile budget also holds every two-dot pattern.
 * Three or more distinct dots still use dynamically composed tiles. */
static uint16_t static_masks[136];
static const uint8_t pair_base[16]={0,14,27,39,50,60,69,77,84,90,95,99,102,104,105,105};
static uint16_t next_tile;
static uint8_t top, bottom, slot, px, py, spawn_next;
static int16_t left, right, player_top, player_bottom;
static uint8_t hit_width, hit_height;
static CE_Screen screen;
CE_BGSpawn ce_bg_request;
static const uint8_t expand[16]={0,192,48,240,12,204,60,252,3,195,51,243,15,207,63,255};
#include "bg-kernels.h"
void ce_bg_clear(void) BANKED {memset(ce_bg_life,0,sizeof(ce_bg_life));ce_bg_count=0;ce_bg_hit=0;spawn_next=0;}
void ce_bg_begin(void) BANKED {
    ce_bg_back=ce_is_cgb?0u:ce_bg_plane^1u;next_tile=hud_tiles+static_tiles;compound_count=0;
    /* Singleton masks are reconstructed on their first overlap. Every compound
     * cell is initialized before use, so only the map needs clearing. */
    memset(map,0,sizeof(map));
    left=ce_state.player_x/16+ce_hitboxes[ce_player_asset].x-1;right=left+ce_hitboxes[ce_player_asset].w;
    player_top=ce_state.player_y/16+ce_hitboxes[ce_player_asset].y-1;player_bottom=player_top+ce_hitboxes[ce_player_asset].h;
    if(left<0)left=0;if(player_top<0)player_top=0;ce_bg_hit=0;
    hit_width=right-left+1;hit_height=player_bottom-player_top+1;
}
void ce_bg_palette(void) BANKED {
    static palette_color_t colors[4];uint8_t i;
    BGP_REG=ce_fade_level?255u:(ce_bg_plane?15u:51u);
    if(ce_is_cgb){for(i=0;i!=4u;++i)colors[i]=!ce_fade_level&&(i&(1u<<ce_bg_plane))?RGB(31,31,31):0;set_bkg_palette(0,1,colors);}
}
void ce_bg_setup(void) BANKED {
    uint8_t t,y,bit,a,b;uint16_t word;
    dma_tiles=(uint8_t *)(((uint16_t)dma_tile_storage+15u)&0xfff0u);
    dma_map=(uint8_t *)(((uint16_t)cells+15u)&0xfff0u);
    ce_get_screen(&screen,4);hud_tiles=screen.tile_count;ce_bg_plane=0;ce_bg_map_front=0;ce_bg_tile_drops=0;ce_bg_peak_tiles=0;
    static_tiles=ce_is_cgb&&hud_tiles<=80u?136u:16u;
    for(t=0;t!=16u;++t)static_masks[t]=1u<<t;
    if(static_tiles==136u)for(a=0;a!=15u;++a)for(b=a+1u;b!=16u;++b)static_masks[t++]=(1u<<a)|(1u<<b);
    top=ce_hud_bottom?0u:ce_hud_height;bottom=ce_hud_bottom?144u-ce_hud_height:144u;
    for(t=0;t!=hud_tiles;++t){
        ce_copy(tile_buffer,&screen.tiles,(uint16_t)t*16u,16);
        for(y=0;y!=16u;y+=2u)tile_buffer[y]=tile_buffer[y+1u]=tile_buffer[y]|tile_buffer[y+1u];
        set_bkg_data(t,1,tile_buffer);
    }
    for(t=0;t!=static_tiles;++t){word=static_masks[t];for(y=0;y!=16u;y+=4u){bit=expand[word&15u];word>>=4;tile_buffer[y]=tile_buffer[y+1u]=tile_buffer[y+2u]=tile_buffer[y+3u]=bit;}set_bkg_data(hud_tiles+t,1,tile_buffer);}
    ce_copy(hud,&screen.map,0,ce_hud_height/8u*20u);memset(map,0,sizeof(map));
    if(ce_is_cgb){VBK_REG=1;ce_bg_map_front=0;copy_map();ce_bg_map_front=1;copy_map();VBK_REG=0;}
    ce_bg_map_front=0;HIDE_WIN;move_bkg(0,0);LCDC_REG&=~8u;
    ce_bg_begin();ce_bg_flush();vsync();ce_bg_publish();ce_bg_begin();
}
void ce_bg_hud(uint8_t x,uint8_t y,uint8_t count,const uint8_t *data) BANKED {memcpy(hud+y*20u+x,data,count);}
static void retire(void){ce_bg_life[slot]=0;--ce_bg_count;}
#include "bg-state-kernels.h"
#include "bg-update-kernel.h"
void ce_bg_update(void) BANKED {ce_bg_begin();update_all();}
void ce_bg_spawn(void) BANKED {
    if(ce_bg_count>=ce_bg_limit){++ce_state.dropped;return;}
    /* Continue after the preceding allocation instead of rescanning the same
     * live prefix for every bullet of a volley. A full pool rejects in O(1). */
    slot=spawn_next;
    while(ce_bg_life[slot]){if(++slot==ce_bg_limit)slot=0;}
    spawn_next=slot+1u;if(spawn_next==ce_bg_limit)spawn_next=0;
    ce_bg_x[slot]=(uint16_t)ce_bg_request.x<<4;ce_bg_y[slot]=(uint16_t)ce_bg_request.y<<4;ce_bg_vx[slot]=(uint16_t)ce_bg_request.vx<<4;ce_bg_vy[slot]=(uint16_t)ce_bg_request.vy<<4;
    ce_bg_life[slot]=ce_bg_request.life;damage[slot]=ce_bg_request.damage;++ce_bg_count;draw_shot();
}
void ce_bg_flush(void) BANKED {
    static uint16_t i;static uint8_t lo,hi,n;
    dma_cursor=dma_tiles;
    if(ce_is_cgb)compose_dma_tiles();
    else for(n=0;n!=compound_count;++n){
        i=compound_cells[n]>>1;
        lo=cells[i];hi=cells[i]>>8;
        tile_buffer[0]=expand[lo&15u];tile_buffer[1]=expand[lo>>4];
        tile_buffer[2]=expand[hi&15u];tile_buffer[3]=expand[hi>>4];
        /* DMG / large-HUD CGB: HUD(<=128)+16+32 <=176 tiles.
         * Pair-cache CGB: HUD(<=80)+136+floor(64/3) <=237 tiles. */
        map[i]=next_tile;
        write_composite();
        ++next_tile;
    }
    if(next_tile>ce_bg_peak_tiles)ce_bg_peak_tiles=next_tile;
    memcpy(map+(ce_hud_bottom?360u-ce_hud_height/8u*20u:0),hud,ce_hud_height/8u*20u);
    if(ce_is_cgb)pack_dma_map();
    else copy_map();
}
static void dma_transfer(uint16_t source,uint16_t dest,uint8_t blocks){
    HDMA1_REG=source>>8;HDMA2_REG=source;HDMA3_REG=dest>>8;HDMA4_REG=dest;HDMA5_REG=blocks-1u;
}
void ce_bg_publish(void) BANKED {
    if(ce_is_cgb){
        uint8_t first=hud_tiles+static_tiles,n=compound_count;
        /* OAM DMA has finished when vsync returns. Keep GDMA wholly in VBlank,
         * including the signed-tile discontinuity at tile 128. */
        if(LY_REG<144u||LY_REG>145u)vsync();
        CRITICAL {
            if(n){
                if(first<128u&&first+n>128u){
                    dma_transfer((uint16_t)dma_tiles,0x9000u+(uint16_t)first*16u,128u-first);
                    dma_transfer((uint16_t)dma_tiles+(uint16_t)(128u-first)*16u,0x8800u,n-(128u-first));
                }else dma_transfer((uint16_t)dma_tiles,(first<128u?0x9000u:0x8000u)+(uint16_t)first*16u,n);
            }
            dma_transfer((uint16_t)dma_map,ce_bg_map_front?0x9800u:0x9c00u,36);
            ce_bg_map_front^=1u;if(ce_bg_map_front)LCDC_REG|=8u;else LCDC_REG&=~8u;
            ce_bg_dma_end_ly=LY_REG;
        }
        return;
    }
    ce_bg_plane=ce_bg_back;ce_bg_map_front^=1u;
    if(ce_bg_map_front)LCDC_REG|=8u;else LCDC_REG&=~8u;ce_bg_palette();move_bkg(0,0);
}
