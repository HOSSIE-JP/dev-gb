#pragma bank 255
#include "caravan.h"
#include <string.h>
/* 2x2 bullets on a two-pixel grid. DMG uses an inactive bitplane; CGB
 * precomposes RAM packets and publishes them with the hidden map by GDMA. */
uint8_t ce_battle_mode, ce_battle_asset, ce_bg_limit, ce_bg_count, ce_bg_hit;
uint8_t ce_bg_plane, ce_bg_back, ce_bg_map_front;
uint16_t ce_bg_tile_drops, ce_bg_peak_tiles;
int16_t CE_WRAM(0xd000) ce_bg_x[CE_MAX_BG_SHOTS];
int16_t CE_WRAM(0xd080) ce_bg_y[CE_MAX_BG_SHOTS];
int16_t CE_WRAM(0xd100) ce_bg_vx[CE_MAX_BG_SHOTS];
int16_t CE_WRAM(0xd180) ce_bg_vy[CE_MAX_BG_SHOTS];
uint16_t CE_WRAM(0xD200) ce_bg_life[CE_MAX_BG_SHOTS];
static uint8_t CE_WRAM(0xD280) damage[CE_MAX_BG_SHOTS];
#if CE_GRAZE_ENABLED
static uint8_t CE_WRAM(0xD2C0) grazed[CE_MAX_BG_SHOTS/8u];
static const uint8_t graze_bits[8]={1,2,4,8,16,32,64,128};
#endif
static uint8_t CE_WRAM(0xD2D0) guide_pattern[CE_MAX_BG_SHOTS];
static uint8_t CE_WRAM(0xD310) guide_angle[CE_MAX_BG_SHOTS];
static uint8_t has_guidance;
static uint16_t CE_WRAM(0xD350) cells[360];
static uint16_t CE_WRAM(0xD620) compound_cells[CE_MAX_BG_SHOTS / 2];
/* CGB uploads at most 32 composite tiles plus 18 full map rows in VBlank.
 * cells is dead after composition and doubles as the aligned DMA map source. */
static uint8_t CE_WRAM(0xD660) dma_tile_storage[CE_MAX_BG_SHOTS / 2 * 16 + 15];
static uint8_t *dma_tiles, *dma_map, *dma_cursor;
uint8_t ce_bg_dma_end_ly;
static uint8_t compound_count, flush_left;
static uint8_t CE_WRAM(0xD880) map[360];
static uint8_t CE_WRAM(0xD9F0) hud[40];
static uint8_t CE_WRAM(0xDA20) tile_buffer[16];
static uint8_t hud_tiles, static_tiles;
/* Right HUD survives clears in the existing map: no extra 90-byte buffer. */
#if CE_HUD_RIGHT
static uint8_t hud_dirty;
static void clear_play_map(void) __naked {
    __asm
        push hl
        push bc
        ld hl, #_map
        ld b, #18
001$:
        xor a
        .rept 15
        ld (hl+), a
        .endm
        ld a, l
        add #5
        ld l, a
        jr nc, 003$
        inc h
003$:
        dec b
        jr nz, 001$
        pop bc
        pop hl
        ret
    __endasm;
}
#endif
/* With an ordinary HUD the CGB tile budget also holds every two-dot pattern.
 * Three or more distinct dots still use dynamically composed tiles. */
/* Immutable mask order is also consumed by the SM83 composition kernel. */
static const uint16_t static_masks[136] = {1u,2u,4u,8u,16u,32u,64u,128u,256u,512u,1024u,2048u,4096u,8192u,16384u,32768u,3u,5u,9u,17u,33u,65u,129u,257u,513u,1025u,2049u,4097u,8193u,16385u,32769u,6u,10u,18u,34u,66u,130u,258u,514u,1026u,2050u,4098u,8194u,16386u,32770u,12u,20u,36u,68u,132u,260u,516u,1028u,2052u,4100u,8196u,16388u,32772u,24u,40u,72u,136u,264u,520u,1032u,2056u,4104u,8200u,16392u,32776u,48u,80u,144u,272u,528u,1040u,2064u,4112u,8208u,16400u,32784u,96u,160u,288u,544u,1056u,2080u,4128u,8224u,16416u,32800u,192u,320u,576u,1088u,2112u,4160u,8256u,16448u,32832u,384u,640u,1152u,2176u,4224u,8320u,16512u,32896u,768u,1280u,2304u,4352u,8448u,16640u,33024u,1536u,2560u,4608u,8704u,16896u,33280u,3072u,5120u,9216u,17408u,33792u,6144u,10240u,18432u,34816u,12288u,20480u,36864u,24576u,40960u,49152u};
static const uint8_t pair_base[16]={0,14,27,39,50,60,69,77,84,90,95,99,102,104,105,105};
static uint16_t next_tile;
static uint8_t top, bottom, slot, px, py, spawn_next;
static int16_t left, right, player_top, player_bottom;
static uint8_t hit_width, hit_height;
/* Newly spawned shots retain their immediate collision/retirement ordering.
 * Moving monochrome shots first build occupancy, then query only nearby cells. */
static uint8_t direct_collision;
static uint8_t query_count;
static uint16_t query_cells[4];
static CE_Screen screen;
CE_BGSpawn ce_bg_request;
static const uint8_t expand[16]={0,192,48,240,12,204,60,252,3,195,51,243,15,207,63,255};
uint8_t ce_giant_ref;
volatile uint8_t ce_giant_x, ce_giant_y;
static CE_Giant giant;
static uint8_t giant_frames[2], giant_frame;
static uint8_t giant_counts[2], giant_next_x, giant_next_y, giant_first;
/* Mutually exclusive with the monochrome renderer: reuse its DMA scratch.
 * No extra tile/map/HP arrays are allocated in scarce WRAM. */
#define GIANT_OLD ((uint16_t *)dma_tile_storage)
#define GIANT_BASE (dma_tile_storage + 128u)
#define GIANT_CELLS ((uint16_t *)(dma_tile_storage + 192u))
#define GIANT_MASKS ((uint16_t *)(dma_tile_storage + 256u))
#if CE_CGB_ONLY
#define CE_BG_ENTRY
static void ce_bg_clear_local(void);
#define ce_bg_clear ce_bg_clear_local
static void ce_bg_begin_local(void);
#define ce_bg_begin ce_bg_begin_local
static void ce_bg_setup_local(void);
#define ce_bg_setup ce_bg_setup_local
static void ce_bg_hud_local(uint8_t x,uint8_t y,uint8_t count,const uint8_t *data);
#define ce_bg_hud ce_bg_hud_local
static void ce_bg_update_local(void);
#define ce_bg_update ce_bg_update_local
static void ce_bg_spawn_local(void);
#define ce_bg_spawn ce_bg_spawn_local
static void ce_bg_shoot_local(uint8_t pattern,uint8_t source,int16_t x,int16_t y,uint8_t sequence);
#define ce_bg_shoot ce_bg_shoot_local
static void ce_bg_flush_local(void);
#define ce_bg_flush ce_bg_flush_local
static void ce_bg_publish_local(void);
#define ce_bg_publish ce_bg_publish_local
static void ce_giant_setup_local(void);
#define ce_giant_setup ce_giant_setup_local
static void ce_giant_flush_local(void);
#define ce_giant_flush ce_giant_flush_local
static void ce_giant_publish_local(void);
#define ce_giant_publish ce_giant_publish_local
#else
#define CE_BG_ENTRY BANKED
#endif
#include "bg-kernels.h"
#if CE_CGB_ONLY && CE_HUD_RIGHT
#include "cgb-bg-packets.h"
#endif
void ce_bg_clear(void) CE_BG_ENTRY {
#if CE_GRAZE_ENABLED
memset(grazed,0,sizeof(grazed));
#endif
memset(ce_bg_life,0,sizeof(ce_bg_life));ce_bg_count=0;ce_bg_hit=0;spawn_next=0;has_guidance=0;}
void ce_bg_begin(void) CE_BG_ENTRY {
    ce_bg_back=ce_is_cgb?0u:ce_bg_plane^1u;next_tile=hud_tiles+static_tiles;compound_count=0;
#if CE_CGB_ONLY && CE_HUD_RIGHT
    memset(cgb_rows,0,sizeof(cgb_rows));
    cgb_dynamic_first=hud_tiles+static_tiles+((ce_bg_map_front^1u)*(static_tiles==136u?21u:32u));
    next_tile=cgb_dynamic_first;
#endif
    /* Singleton masks are reconstructed on their first overlap. Every compound
     * cell is initialized before use, so only the map needs clearing. */
    if (ce_battle_mode != 3u) {
#if CE_HUD_RIGHT
        clear_play_map();
#else
        memset(map,0,sizeof(map));
#endif
    }
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
void ce_bg_setup(void) CE_BG_ENTRY {
    uint8_t t,y,bit;uint16_t word;
    dma_tiles=(uint8_t *)(((uint16_t)dma_tile_storage+15u)&0xfff0u);
    dma_map=(uint8_t *)(((uint16_t)cells+15u)&0xfff0u);
    ce_get_screen(&screen,4);hud_tiles=screen.tile_count;ce_bg_plane=0;ce_bg_map_front=0;ce_bg_tile_drops=0;ce_bg_peak_tiles=0;
    static_tiles=ce_is_cgb&&hud_tiles<=
#if CE_CGB_ONLY && CE_HUD_RIGHT
    77u
#else
    80u
#endif
    ?136u:16u;
#if CE_CGB_ONLY && CE_HUD_RIGHT
    memset(cgb_maps,0,sizeof(cgb_maps));memset(cgb_past_rows,0,sizeof(cgb_past_rows));memset(cgb_hud_rows,1,sizeof(cgb_hud_rows));
    cgb_full_maps=3;
#endif
    top=ce_hud_bottom?0u:ce_hud_height;bottom=ce_hud_bottom?144u-ce_hud_height:144u;
    for(t=0;t!=hud_tiles;++t){
        ce_copy(tile_buffer,&screen.tiles,(uint16_t)t*16u,16);
        for(y=0;y!=16u;y+=2u)tile_buffer[y]=tile_buffer[y+1u]=tile_buffer[y]|tile_buffer[y+1u];
        set_bkg_data(t,1,tile_buffer);
    }
    for(t=0;t!=static_tiles;++t){word=static_masks[t];for(y=0;y!=16u;y+=4u){bit=expand[word&15u];word>>=4;tile_buffer[y]=tile_buffer[y+1u]=tile_buffer[y+2u]=tile_buffer[y+3u]=bit;}set_bkg_data(hud_tiles+t,1,tile_buffer);}
    ce_copy(hud,&screen.map,0,ce_hud_height/8u*20u);memset(map,0,sizeof(map));
    if(ce_is_cgb){VBK_REG=1;ce_bg_map_front=0;copy_map();ce_bg_map_front=1;copy_map();VBK_REG=0;}
    if(CE_HUD_RIGHT)for(y=0;y!=18u;++y)ce_copy(map+(uint16_t)y*20u+15u,&screen.map,(uint16_t)y*20u,5);
#if CE_HUD_RIGHT
    hud_dirty=1;
#endif
    ce_bg_map_front=0;HIDE_WIN;move_bkg(0,0);LCDC_REG&=~8u;
    ce_bg_begin();ce_bg_flush();vsync();ce_bg_publish();ce_bg_begin();
}
void ce_bg_hud(uint8_t x,uint8_t y,uint8_t count,const uint8_t *data) CE_BG_ENTRY {
#if CE_HUD_RIGHT
    memcpy(map+(uint16_t)y*20u+15u+x,data,count);
#if CE_CGB_ONLY
    cgb_hud_rows[y]=cgb_hud_rows[18u+y]=1;
#endif
    hud_dirty=1;
#else
    memcpy(hud+y*20u+x,data,count);
#endif
}
static void retire(void){ce_bg_life[slot]=0;--ce_bg_count;}
#include "bg-state-kernels.h"
#include "bg-update-kernel.h"
static void guide(void) {
    uint8_t s,angle;const CE_Pattern *p;
    for(s=ce_state.tick&7u;s<ce_bg_limit;s+=8u){
        if(!ce_bg_life[s] || guide_pattern[s]==CE_NONE)continue;
        p=&ce_patterns[guide_pattern[s]];
        /* Retire steering metadata once the short homing window expires.
         * Long-lived coasting bullets then skip pattern table lookups. */
        if(p->lifetime-ce_bg_life[s]>=p->guide_frames){guide_pattern[s]=CE_NONE;continue;}
        if((ce_state.tick-s)&p->guide_mask)continue;
        angle=ce_home(guide_angle[s],(uint16_t)ce_bg_x[s]>>8,(uint16_t)ce_bg_y[s]>>8);guide_angle[s]=angle;
        ce_bg_vx[s]=(uint16_t)p->velocity[angle*2u]<<4;ce_bg_vy[s]=(uint16_t)p->velocity[angle*2u+1u]<<4;
    }
}
#include "bg-query-kernel.h"
void ce_bg_update(void) CE_BG_ENTRY {
    uint8_t n,kept,x0,x1,y0,y1;
    if(has_guidance)guide();ce_bg_begin();direct_collision=ce_battle_mode==3u||hit_width!=4u||hit_height!=4u||right>=CE_PLAY_WIDTH||player_bottom>=144;
    if(direct_collision)update_all();else update_all_local();
    if(!direct_collision && occupied_player()){
        /* Rare impact: retire overlapping shots and rebuild without advancing
         * motion/lifetime. Slot order preserves damage and allocation behavior. */
        direct_collision=1;
        /* Only the (at most four) queried tiles need rebuilding. Preserve all
         * other composed cells and avoid redrawing the complete bullet field. */
        for(n=0;n!=query_count;++n)map[query_cells[n]]=0;
        for(n=0,kept=0;n!=compound_count;++n)if(map[compound_cells[n]>>1]==255u)compound_cells[kept++]=compound_cells[n];
        compound_count=kept;x0=(uint8_t)(left+1u)>>3;x1=(uint8_t)right>>3;y0=(uint8_t)(player_top+1u)>>3;y1=(uint8_t)player_bottom>>3;
        for(slot=0;slot<ce_bg_limit;++slot)if(ce_bg_life[slot]){
            n=(uint16_t)ce_bg_x[slot]>>11;if(n<x0||n>x1)continue;
            n=(uint16_t)ce_bg_y[slot]>>11;if(n>=y0&&n<=y1)draw_shot();
        }
    }
    direct_collision=1;
}
static void spawn_shot(void) {
    if(ce_bomb_image)return;
    if(ce_bg_count>=ce_bg_limit){++ce_state.dropped;return;}
    /* Continue after the preceding allocation instead of rescanning the same
     * live prefix for every bullet of a volley. A full pool rejects in O(1). */
    slot=spawn_next;
    while(ce_bg_life[slot]){if(++slot==ce_bg_limit)slot=0;}
    spawn_next=slot+1u;if(spawn_next==ce_bg_limit)spawn_next=0;
    ce_bg_x[slot]=(uint16_t)ce_bg_request.x<<4;ce_bg_y[slot]=(uint16_t)ce_bg_request.y<<4;ce_bg_vx[slot]=(uint16_t)ce_bg_request.vx<<4;ce_bg_vy[slot]=(uint16_t)ce_bg_request.vy<<4;
#if CE_GRAZE_ENABLED
    grazed[slot>>3] &= ~graze_bits[slot&7u];
#endif
    ce_bg_life[slot]=ce_bg_request.life;damage[slot]=ce_bg_request.damage;++ce_bg_count;direct_collision=1;draw_shot();
    guide_pattern[slot]=CE_NONE;
    if(ce_bg_request.pattern!=CE_NONE){
        guide_pattern[slot]=ce_bg_request.pattern;guide_angle[slot]=ce_bg_request.angle;has_guidance=1;
    }
}
void ce_bg_spawn(void) CE_BG_ENTRY { spawn_shot(); }
#include "bg-volley.h"
void ce_bg_flush(void) CE_BG_ENTRY {
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
#if CE_HUD_RIGHT
#if CE_CGB_ONLY
    dma_map=cgb_maps+(ce_bg_map_front?0:576u);cgb_pack_map();hud_dirty=0;
#else
    if(hud_dirty){copy_hud_maps();hud_dirty=0;}
    if(ce_is_cgb)pack_dma_map();else copy_play_map();
#endif
#else
    if(ce_is_cgb)pack_dma_map();else copy_map();
#endif
}
static void dma_transfer(uint16_t source,uint16_t dest,uint8_t blocks){
    HDMA1_REG=source>>8;HDMA2_REG=source;HDMA3_REG=dest>>8;HDMA4_REG=dest;HDMA5_REG=blocks-1u;
}
void ce_bg_publish(void) CE_BG_ENTRY {
    if(ce_is_cgb){
        uint8_t first=
#if CE_CGB_ONLY && CE_HUD_RIGHT
        cgb_dynamic_first,
#else
        hud_tiles+static_tiles,
#endif
        n=compound_count;
        /* OAM DMA has finished when vsync returns. Keep GDMA wholly in VBlank,
         * including the signed-tile discontinuity at tile 128. */
        /* GBDK's OAM DMA + interrupt return + banked call can reach LY 146.
         * Rejecting that still-safe line inserted a whole extra display frame
         * on BGB. The bounded packet completes by LY 153 (native QA gate). */
        if(LY_REG<144u||LY_REG>146u)vsync();
        CRITICAL {
            if(n){
                if(first<128u&&first+n>128u){
                    dma_transfer((uint16_t)dma_tiles,0x9000u+(uint16_t)first*16u,128u-first);
                    dma_transfer((uint16_t)dma_tiles+(uint16_t)(128u-first)*16u,0x8800u,n-(128u-first));
                }else dma_transfer((uint16_t)dma_tiles,(first<128u?0x9000u:0x8000u)+(uint16_t)first*16u,n);
            }
#if CE_HUD_RIGHT
#if CE_CGB_ONLY
            if(cgb_full_maps & (ce_bg_map_front?1u:2u)){
                dma_transfer((uint16_t)dma_map,ce_bg_map_front?0x9800u:0x9c00u,36);
                cgb_full_maps &= ce_bg_map_front?2u:1u;
            } else cgb_publish_map();
#else
            publish_play_rows();
#endif
#else
            dma_transfer((uint16_t)dma_map,ce_bg_map_front?0x9800u:0x9c00u,36);
#endif
            ce_bg_map_front^=1u;if(ce_bg_map_front)LCDC_REG|=8u;else LCDC_REG&=~8u;
            ce_bg_dma_end_ly=LY_REG;
        }
        return;
    }
    ce_bg_plane=ce_bg_back;ce_bg_map_front^=1u;
    if(ce_bg_map_front)LCDC_REG|=8u;else LCDC_REG&=~8u;ce_bg_palette();move_bkg(0,0);
}
#include "giant-render.h"

#if CE_CGB_ONLY
#undef ce_bg_clear
void ce_bg_clear(void) BANKED { uint8_t saved=SVBK_REG;SVBK_REG=2;ce_bg_clear_local();SVBK_REG=saved; }
#undef ce_bg_begin
void ce_bg_begin(void) BANKED { uint8_t saved=SVBK_REG;SVBK_REG=2;ce_bg_begin_local();SVBK_REG=saved; }
#undef ce_bg_setup
void ce_bg_setup(void) BANKED { uint8_t saved=SVBK_REG;SVBK_REG=2;ce_bg_setup_local();SVBK_REG=saved; }
#undef ce_bg_hud
void ce_bg_hud(uint8_t x,uint8_t y,uint8_t count,const uint8_t *data) BANKED { uint8_t saved=SVBK_REG;SVBK_REG=2;ce_bg_hud_local(x,y,count,data);SVBK_REG=saved; }
#undef ce_bg_update
void ce_bg_update(void) BANKED { uint8_t saved=SVBK_REG;SVBK_REG=2;ce_bg_update_local();SVBK_REG=saved; }
#undef ce_bg_spawn
void ce_bg_spawn(void) BANKED { uint8_t saved=SVBK_REG;SVBK_REG=2;ce_bg_spawn_local();SVBK_REG=saved; }
#undef ce_bg_shoot
void ce_bg_shoot(uint8_t pattern,uint8_t source,int16_t x,int16_t y,uint8_t sequence) BANKED { uint8_t saved=SVBK_REG;SVBK_REG=2;ce_bg_shoot_local(pattern,source,x,y,sequence);SVBK_REG=saved; }
#undef ce_bg_flush
void ce_bg_flush(void) BANKED { uint8_t saved=SVBK_REG;SVBK_REG=2;ce_bg_flush_local();SVBK_REG=saved; }
#undef ce_bg_publish
void ce_bg_publish(void) BANKED { uint8_t saved=SVBK_REG;SVBK_REG=2;ce_bg_publish_local();SVBK_REG=saved; }
#undef ce_giant_setup
void ce_giant_setup(void) BANKED { uint8_t saved=SVBK_REG;SVBK_REG=2;ce_giant_setup_local();SVBK_REG=saved; }
#undef ce_giant_flush
void ce_giant_flush(void) BANKED { uint8_t saved=SVBK_REG;SVBK_REG=2;ce_giant_flush_local();SVBK_REG=saved; }
#undef ce_giant_publish
void ce_giant_publish(void) BANKED { uint8_t saved=SVBK_REG;SVBK_REG=2;ce_giant_publish_local();SVBK_REG=saved; }
#endif
