#pragma bank 255
#include "caravan.h"
#include <string.h>
/* 2x2 bullets on a two-pixel grid. Single bullets use sixteen static tiles;
 * composite cells use the hidden colour plane, published with the hidden map. */
uint8_t ce_battle_mode, ce_battle_asset, ce_bg_limit, ce_bg_count, ce_bg_hit;
uint8_t ce_bg_plane, ce_bg_back, ce_bg_map_front;
uint16_t ce_bg_tile_drops, ce_bg_peak_tiles;
int16_t ce_bg_x[128], ce_bg_y[128], ce_bg_vx[128], ce_bg_vy[128];
uint16_t ce_bg_life[128];
static uint8_t damage[128];
static uint16_t cells[360], compound_cells[64];
static uint8_t compound_count;
static uint8_t map[360], hud[40], tile_buffer[16], hud_tiles;
static uint16_t next_tile;
static uint8_t top, bottom, slot, px, py;
static int16_t left, right, player_top, player_bottom;
static CE_Screen screen;
CE_BGSpawn ce_bg_request;
static const uint8_t expand[16]={0,192,48,240,12,204,60,252,3,195,51,243,15,207,63,255};
#include "bg-kernels.h"
void ce_bg_clear(void) BANKED {memset(ce_bg_life,0,sizeof(ce_bg_life));ce_bg_count=0;ce_bg_hit=0;}
void ce_bg_begin(void) BANKED {
    ce_bg_back=ce_bg_plane^1u;next_tile=hud_tiles+16u;compound_count=0;
    memset(cells,0,sizeof(cells));memset(map,0,sizeof(map));
    left=ce_state.player_x/16+ce_hitboxes[ce_player_asset].x-1;right=left+ce_hitboxes[ce_player_asset].w;
    player_top=ce_state.player_y/16+ce_hitboxes[ce_player_asset].y-1;player_bottom=player_top+ce_hitboxes[ce_player_asset].h;
    if(left<0)left=0;if(player_top<0)player_top=0;ce_bg_hit=0;
}
void ce_bg_palette(void) BANKED {
    static palette_color_t colors[4];uint8_t i;
    BGP_REG=ce_fade_level?255u:(ce_bg_plane?15u:51u);
    if(ce_is_cgb){for(i=0;i!=4u;++i)colors[i]=!ce_fade_level&&(i&(1u<<ce_bg_plane))?RGB(31,31,31):0;set_bkg_palette(0,1,colors);}
}
void ce_bg_setup(void) BANKED {
    uint8_t t,y,bit;uint16_t word;
    ce_get_screen(&screen,4);hud_tiles=screen.tile_count;ce_bg_plane=0;ce_bg_map_front=0;ce_bg_tile_drops=0;ce_bg_peak_tiles=0;
    top=ce_hud_bottom?0u:ce_hud_height;bottom=ce_hud_bottom?144u-ce_hud_height:144u;
    for(t=0;t!=hud_tiles;++t){
        ce_copy(tile_buffer,&screen.tiles,(uint16_t)t*16u,16);
        for(y=0;y!=16u;y+=2u)tile_buffer[y]=tile_buffer[y+1u]=tile_buffer[y]|tile_buffer[y+1u];
        set_bkg_data(t,1,tile_buffer);
    }
    for(t=0;t!=16u;++t){word=1u<<t;for(y=0;y!=16u;y+=4u){bit=expand[word&15u];word>>=4;tile_buffer[y]=tile_buffer[y+1u]=tile_buffer[y+2u]=tile_buffer[y+3u]=bit;}set_bkg_data(hud_tiles+t,1,tile_buffer);}
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
    for(slot=0;slot!=ce_bg_limit&&ce_bg_life[slot];++slot){}
    if(slot==ce_bg_limit){++ce_state.dropped;return;}
    ce_bg_x[slot]=(uint16_t)ce_bg_request.x<<4;ce_bg_y[slot]=(uint16_t)ce_bg_request.y<<4;ce_bg_vx[slot]=(uint16_t)ce_bg_request.vx<<4;ce_bg_vy[slot]=(uint16_t)ce_bg_request.vy<<4;
    ce_bg_life[slot]=ce_bg_request.life;damage[slot]=ce_bg_request.damage;++ce_bg_count;draw_shot();
}
void ce_bg_flush(void) BANKED {
    static uint16_t i,word;static uint8_t y,n;
    for(n=0;n!=compound_count;++n){
        i=compound_cells[n]>>1;
        word=cells[i];for(y=0;y!=4u;++y){tile_buffer[y]=expand[word&15u];word>>=4;}
        /* At most 64 composite cells: HUD(<=128)+16+64 <=208 tiles. */
        map[i]=next_tile;write_composite();++next_tile;
    }
    if(next_tile>ce_bg_peak_tiles)ce_bg_peak_tiles=next_tile;
    memcpy(map+(ce_hud_bottom?360u-ce_hud_height/8u*20u:0),hud,ce_hud_height/8u*20u);copy_map();
}
void ce_bg_publish(void) BANKED {
    ce_bg_plane=ce_bg_back;ce_bg_map_front^=1u;
    if(ce_bg_map_front)LCDC_REG|=8u;else LCDC_REG&=~8u;ce_bg_palette();move_bkg(0,0);
}