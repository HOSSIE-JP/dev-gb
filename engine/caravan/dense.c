#pragma bank 255
#include "caravan.h"
#include <string.h>
#ifdef CE_DENSE
/* Admit complete metasprites before collision. Never publish a partial hazard.
 * The conservative row budget includes transparent parts, matching hardware. */
static uint8_t dense_lines[18], dense_slots;
uint8_t ce_dense_ready;
#ifdef CE_CGB
#include "dense-admit-kernel.h"
static uint8_t dense_admit(uint8_t asset,int16_t x,int16_t y) {
    admit_asset=asset;admit_x=x;admit_y=y;return admit_fast();
}
#else
static uint8_t dense_admit(uint8_t asset,int16_t x,int16_t y) {
    static const CE_Asset *a;static int16_t top,bottom,left;static uint8_t row,columns;
    a=&ce_assets[asset];top=y/16-a->oy;bottom=top+((a->height+15u)&240u);left=x/16-a->ox;columns=a->width/8u;
    if(left>=160 || left+a->width<=0 || bottom<=0 || top>=144 || dense_slots+a->tiles>40u)return 0;
    if(top<0)top=0;if(bottom>144)bottom=144;
    top>>=3;bottom=(bottom+7)>>3;
    for(row=top;row<bottom;++row)if(dense_lines[row]+columns>10u)return 0;
    for(row=top;row<bottom;++row)dense_lines[row]+=columns;
    dense_slots+=a->tiles;return 1;
}
#endif
/* The common 8x16 cell already has clipped pixel coordinates in the SoA.
 * Avoid asset lookup and signed Q4 conversion for every small bullet. */
static uint8_t dense_admit_shot(uint8_t slot) {
    uint8_t y=ce_shot_oam[slot].y,first,last,row;
    if(!y || dense_slots==40u)return 0;
    first=y<16u?0u:(y-16u)>>3;
    last=(y-1u)>>3;if(last>17u)last=17u;
    for(row=first;row<=last;++row)if(dense_lines[row]==10u)return 0;
    for(row=first;row<=last;++row)++dense_lines[row];
    ++dense_slots;return 1;
}
void ce_dense_plan(void) BANKED {
    static uint8_t i,end;static CE_Entity *e;
    memset(dense_lines,0,sizeof(dense_lines));dense_slots=0;
    /* Reserve the player even on blink frames: admission must not flicker. */
    dense_admit(ce_barrier&&ce_barrier_asset!=CE_NONE?ce_barrier_asset:ce_player_asset,ce_state.player_x,ce_state.player_y);
    for(i=0,e=ce_entities;i!=ce_used;++i,++e){
        ce_actor_visible[i]=0;
        if(e->kind && e->kind<=CE_BOSS && !(e->kind==CE_BOSS&&(ce_battle_mode==3u||ce_transition_state==1u)))
            ce_actor_visible[i]=dense_admit(e->asset,e->x,e->y);
    }
    if(ce_pool_counts[CE_PSHOT]|ce_pool_counts[CE_ESHOT]){
        end=ce_pool_counts[CE_ESHOT]?CE_SHOT_CAPACITY:CE_MAX_PSHOTS;
        for(i=0;i!=end;++i)ce_shot_visible[i]=ce_shot_kind[i]?(ce_shot_simple[i]?dense_admit_shot(i):dense_admit(ce_shot_asset[i],ce_shot_x[i],ce_shot_y[i])):0;
    }
    /* Effects cannot take the last slots away from a player's volley. */
    for(i=13u;i<ce_used;++i){e=&ce_entities[i];if(e->kind)ce_actor_visible[i]=dense_admit(e->asset,e->x,e->y);}
    ce_pool_oam=dense_slots;ce_dense_ready=1;
}

#endif
