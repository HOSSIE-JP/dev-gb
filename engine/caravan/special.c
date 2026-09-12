#pragma bank 255
#include "caravan.h"

/* Enemy seekers turn by at most 22.5 degrees per scheduled sample, then coast.
 * Their lower-half direction constraint prevents chasing behind the player. */
uint8_t ce_home(uint8_t angle, int16_t x, int16_t y) BANKED {
    int16_t dx=ce_state.player_x/16-x,dy=ce_state.player_y/16-y;
    uint8_t target=ce_aim(dx,dy);
    if(target<4u || target>12u)target=dx<0?12u:4u;
    if(angle<4u)angle=4u;if(angle>12u)angle=12u;
    if(target>angle)++angle;else if(target<angle)--angle;
    return angle;
}

void ce_bomb_effect(void) BANKED {
    uint8_t frame=0;
    ce_bomb_left=ce_bomb_frames;ce_render();ce_scene=11;ce_bomb_setup();ce_sound(ce_bomb_styles[ce_character]?5u:2u);
    for(ce_bomb_left=ce_bomb_frames;ce_bomb_left;--ce_bomb_left,++frame){
        vsync();ce_bomb_draw((frame/ce_bomb_period)&1u);ce_audio_sync();ce_trace_write();
    }
    ce_load_stage();ce_scene=1;ce_bomb_latch=1;
}

extern uint8_t allocate(uint8_t kind,uint8_t asset);
extern void release(uint8_t slot);
extern void explode(int16_t x,int16_t y);
extern uint8_t defeated_asset;
extern int16_t defeated_x,defeated_y;

void ce_shoot(uint8_t pattern, uint8_t source, int16_t x, int16_t y, uint8_t friendly, uint8_t sequence) BANKED {
    const CE_Pattern *p; const CE_Asset *a; uint8_t emitter, n, base, angle, slot, emitters, origin;
    int16_t px, py; CE_Entity *e;
    if (pattern == CE_NONE) return;
    p = &ce_patterns[pattern]; a = &ce_assets[source];
    origin=friendly?0:p->launch;emitters=origin?(origin==4u?2u:1u):a->emitters;
    for (emitter = 0; emitter != emitters; ++emitter) {
        px = origin ? (int16_t)p->launch_x*16 : x + (int16_t)a->emitter_xy[emitter * 2u] * 16;
        py = origin ? ((int16_t)p->launch_y+(sequence%p->launch_lanes)*p->launch_step)*16 : y + (int16_t)a->emitter_xy[emitter * 2u + 1u] * 16;
        base = p->angle;
        if(origin && origin!=5u){
            uint8_t right=origin==2u||(origin==3u&&(sequence&1u))||(origin==4u&&emitter);
            px=right?2528:16;base=right?12u:4u;
        }
        if (p->kind == 1u) base = p->angle + ce_aim((ce_state.player_x - px) / 16, (ce_state.player_y - py) / 16);
        if (p->kind == 4u) base += sequence * p->rotation;
        for (n = 0; n != p->count; ++n) {
            angle = (base + p->angles[n]) & 15u;
            if (!friendly && ce_battle_mode == 2u) {
                ce_bg_request.x = px; ce_bg_request.y = py;
                ce_bg_request.vx = p->velocity[angle * 2u]; ce_bg_request.vy = p->velocity[angle * 2u + 1u];
                ce_bg_request.life = p->lifetime; ce_bg_request.damage = p->damage;
                ce_bg_request.pattern=p->kind==5u?pattern:CE_NONE;ce_bg_request.angle=angle;ce_bg_spawn(); continue;
            }
            slot = allocate(friendly ? CE_PSHOT : CE_ESHOT, p->asset); if (slot == CE_NONE) continue;
            e = &ce_entities[slot]; e->ref = pattern; e->sequence=angle;
            ce_shot_x[slot] = px; ce_shot_y[slot] = py; ce_shot_age[slot] = 0;
            angle <<= 1;
            ce_shot_vx[slot] = p->velocity[angle]; ce_shot_vy[slot] = p->velocity[angle + 1u];
            e->hp = 1; ce_shot_lifetime[slot] = p->lifetime; e->damage = p->damage;
            ce_init_shot_visual(slot);
            /* Enemy shots collide against cached center intervals, including
             * newly spawned shots that will not move until the next update. */
        }
    }
}

static void add_score(uint16_t value) {
    ce_state.score = 65535u - ce_state.score < value ? 65535u : ce_state.score + value;
}

void ce_damage_actor(uint8_t slot, uint8_t damage) BANKED {
    CE_Entity *target=&ce_entities[slot]; const CE_Actor *actor;
    if(target->kind!=CE_ENEMY && target->kind!=CE_BOSS)return;
    if(target->kind==CE_BOSS && ce_boss_invulnerable)return;
    actor=target->kind==CE_BOSS?&ce_bosses[target->ref]:&ce_enemies[target->ref];
    if(target->kind==CE_BOSS && target->phase+1u<actor->phases){
        const CE_Phase *p=&actor->phase[target->phase];
        if(p->until && (p->hp || actor->phase[target->phase+1u].intro_frames) && target->hp <= (p->hp?0u:p->threshold)+damage){
            target->hp=p->hp?0u:p->threshold;ce_boss_invulnerable=1;ce_clear_combat(0);
            if(ce_battle_mode==2u)ce_bg_begin();ce_hud();return;
        }
    }
    if(target->hp<=damage){
        int16_t x=target->x,y=target->y;
        add_score(actor->score);if(target->kind==CE_BOSS){ce_state.boss_defeated=1;defeated_asset=target->asset;defeated_x=x;defeated_y=y;}
        release(slot);ce_sound(1);explode(x,y);
    }else{target->hp-=damage;if(target->kind==CE_BOSS)ce_sound(4);}
}
void ce_bomb_apply(void) BANKED {
    uint8_t i, n=ce_used; CE_Entity *e;
    ce_clear_combat(0);
    for(i=0;i<n;++i){
        e=&ce_entities[i];
        if((e->kind==CE_ENEMY||e->kind==CE_BOSS)&& e->x>=0 && e->x<2560 && e->y>=0 && e->y<2304)ce_damage_actor(i,ce_bomb_damage);
    }
    if(ce_battle_mode==2u)ce_bg_begin();
}
