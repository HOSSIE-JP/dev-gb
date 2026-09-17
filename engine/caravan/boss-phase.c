#pragma bank 255
#include "caravan.h"
#include "mainloop.h"
extern void release(uint8_t slot);
extern void explode(int16_t x,int16_t y);
extern uint8_t defeated_asset;
extern int16_t defeated_x,defeated_y;

/* Resolve after player shots and the bomb sweep, so a hit on update 3600 wins.
 * phase_age is the existing gameplay clock; cut-ins and pause never advance it. */
void ce_finish_boss_modes(void) BANKED {
    uint8_t i, defeated;
    CE_Entity *e; const CE_Actor *actor; const CE_Phase *p;
    for(i=0;i!=ce_used;++i) {
        e=&ce_entities[i]; if(e->kind!=CE_BOSS)continue;
        actor=&ce_bosses[e->ref];p=&actor->phase[e->phase];
        if(!p->until || (!p->time_limit && p->score==65535u))return;
        defeated=!e->hp;
        if(!defeated && (!p->time_limit || e->phase_age<p->time_limit))return;
        if(defeated && p->score!=65535u)ce_add_score(p->score);
        ce_clear_combat(0);ce_boss_invulnerable=1;ce_bomb_left=0;
        if(ce_bomb_image){ce_bomb_image=0;ce_load_stage();}
        if(e->phase+1u<actor->phases)ce_change_phase(e,defeated?1u:2u);
        else {
            if(defeated && p->score==65535u)ce_add_score(actor->score);
            ce_state.boss_defeated=1;
            defeated_asset=e->asset;defeated_x=e->x;defeated_y=e->y;
            if(defeated){ce_sound(1);explode(e->x,e->y);ce_spawn_item(actor->drop_item,e->x,e->y);}
            release(i);
        }
        return;
    }
}

/* 65535 = no active HP mode. Packed phase count avoids new persistent RAM. */
uint16_t ce_boss_status(uint8_t kind) BANKED {
    uint8_t i,j,current=0,total=0; CE_Entity *e; const CE_Actor *actor; const CE_Phase *p;
    if(!ce_pool_counts[CE_BOSS])return 65535u;
    for(i=0;i!=ce_used;++i) {
        e=&ce_entities[i];if(e->kind!=CE_BOSS)continue;
        actor=&ce_bosses[e->ref];p=&actor->phase[e->phase];
        if(!p->until || !p->hp)return 65535u;
        if(kind==4u)return e->hp;
        if(kind==10u)return p->time_limit?(e->phase_age>=p->time_limit?0u:(p->time_limit-e->phase_age+59u)/60u):65535u;
        for(j=0;j!=actor->phases;++j)if(actor->phase[j].until && actor->phase[j].hp){++total;if(j<=e->phase)++current;}
        return (uint16_t)current*256u+total;
    }
    return 65535u;
}

void ce_trace_build(void) BANKED {
    uint8_t i, count = 0, hp = 0, phase = 0; CE_Entity *e = ce_entities;
    ce_trace[22] = 1; /* Diagnostic seqlock: host ignores an incomplete snapshot. */
    for (i = ce_used; i; --i, ++e) { if (e->kind) ++count; if (e->kind == CE_BOSS) { hp = e->hp; phase = e->phase; } }
    ce_trace[0] = 'C'; ce_trace[1] = 'E'; ce_trace[2] = ce_state.tick; ce_trace[3] = ce_state.tick >> 8;
    ce_trace[4] = ce_state.stage; ce_trace[5] = ce_state.score; ce_trace[6] = ce_state.score >> 8;
    ce_trace[7] = ce_state.lives; ce_trace[8] = ce_state.player_x; ce_trace[9] = ce_state.player_x >> 8;
    ce_trace[10] = ce_state.player_y; ce_trace[11] = ce_state.player_y >> 8; ce_trace[12] = hp;
    ce_trace[13] = count; ce_trace[14] = ce_state.dropped; ce_trace[15] = ce_state.dropped >> 8;
    ce_trace[16] = ce_state.result; ce_trace[17] = ce_scene; ce_trace[18] = ce_state.stage_tick; ce_trace[19] = ce_state.stage_tick >> 8;
    ce_trace[20] = phase; ce_trace[21] = ce_bg_count; ce_trace[23] = ce_battle_mode;
}

void ce_fade(uint8_t out) BANKED {
    uint8_t frame;
    if (!ce_stage_fade) return;
    for (frame = 0; frame != 24u; ++frame) {
        vsync();
        if (!(frame % 6u)) {
            ce_fade_level = out ? 1u + frame / 6u : 3u - frame / 6u;
            ce_set_fade(ce_fade_level);
        }
        ce_audio_sync();
    }
}
