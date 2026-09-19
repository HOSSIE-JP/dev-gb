#pragma bank 255
#include "caravan.h"

/* Enemy seekers turn by at most 22.5 degrees per scheduled sample, then coast.
 * Their lower-half direction constraint prevents chasing behind the player. */
uint8_t ce_home(uint8_t angle, int16_t x, int16_t y) BANKED {
    int16_t dx=ce_state.player_x/16-x,dy=ce_state.player_y/16-y;
    uint8_t target=ce_aim(dx,dy);
    if (ce_stage->horizontal) {
        /* Rotate the left-facing semicircle into the legacy ordered 4..12 range. */
        target = (target + 12u) & 15u; angle = (angle + 12u) & 15u;
        if(target<4u || target>12u)target=dy<0?12u:4u;
        if(angle<4u)angle=4u;if(angle>12u)angle=12u;
        if(target>angle)++angle;else if(target<angle)--angle;
        return (angle + 4u) & 15u;
    }
    if(target<4u || target>12u)target=dx<0?12u:4u;
    if(angle<4u)angle=4u;if(angle>12u)angle=12u;
    if(target>angle)++angle;else if(target<angle)--angle;
    return angle;
}

void ce_bomb_effect(void) BANKED {
    uint8_t frame=0;
    if (ce_bomb_live) {
        ce_bomb_left = ce_bomb_frames;
        if (ce_bomb_live == 2u) { ce_render(); ce_bomb_image = 1; ce_bomb_setup(); }
        ce_sound(ce_bomb_styles[ce_character] ? 7u : 2u); return;
    }
    ce_bomb_left=ce_bomb_frames;ce_render();ce_scene=11;ce_bomb_setup();ce_sound(ce_bomb_styles[ce_character]?7u:2u);
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

#if CE_OBJ_16
/* A narrow, penetrating ray. Only actors are scanned, once per damage pulse;
 * no projectile entities, per-pixel search or VRAM collision readback. */
void ce_collide_beam(void) BANKED {
    uint8_t i,damage=ce_patterns[ce_beam_pattern].damage;
    int16_t x=ce_state.player_x/16,y=ce_state.player_y/16-8;
    uint8_t top=ce_hud_bottom?0:ce_hud_height;
    for(i=0;i!=ce_used;++i){
        CE_Entity *e=&CE_ENTITY(i);
#if !CE_CGB_ONLY
        const CE_Hitbox *h;int16_t left,bottom;
#endif
        if(e->kind!=CE_ENEMY && e->kind!=CE_BOSS)continue;
        if(e->kind==CE_BOSS && ce_boss_invulnerable)continue;
#if CE_CGB_ONLY
        {const CE_Box *b=&ce_boxes[i];
        if((int16_t)b->left>=CE_PLAY_WIDTH+128 || (int16_t)b->right<=128 || (int16_t)b->left>=x+129 || (int16_t)b->right<=x+127 || (int16_t)b->bottom<=top+128 || (int16_t)b->top>=y+128)continue;}
#else
        h=&ce_hitboxes[e->asset];left=e->x/16+h->x;bottom=e->y/16+h->y+h->h;
        if(left>=CE_PLAY_WIDTH || left+h->w<=0 || left>=x+1 || left+h->w<=x-1 || bottom<=top || bottom-h->h>=y)continue;
#endif
        ce_damage_actor(i,damage);
        if(ce_beam_pattern==CE_NONE)return;
    }
}
#endif

/* Only this bank's atomic volley path needs the complete admission check. */
static uint8_t ce_can_allocate(uint8_t kind, uint8_t asset, uint8_t count) {
    uint8_t i, total = 0, reserve = kind == CE_ITEM ? 0u : ce_entity_limits[CE_ITEM] - ce_pool_counts[CE_ITEM];
    if ((uint16_t)ce_pool_counts[kind] + count > ce_entity_limits[kind] ||
        (uint16_t)ce_pool_oam + (uint16_t)CE_OAM_COST(asset) * count + reserve > 40u) return 0;
    for (i = 1; i != 7u; ++i) total += ce_pool_counts[i];
    return (uint16_t)total + count + reserve <= CE_MAX_ENTITIES;
}

void ce_shoot(uint8_t pattern, uint8_t source, int16_t x, int16_t y, uint8_t friendly, uint8_t sequence) BANKED {
    const CE_Pattern *p; const CE_Asset *a; const int8_t *offsets; uint8_t emitter, n, base, angle, slot, emitters, origin;
    int16_t px, py; CE_Entity *e;
    if (pattern == CE_NONE || (!friendly && ce_bomb_image)) return;
    if (ce_patterns[pattern].kind==8u) return; /* Held player ray has no entities. */
    if (!friendly && ce_battle_mode >= 2u) { ce_bg_shoot(pattern,source,x,y,sequence); return; }
    p = &ce_patterns[pattern]; a = &ce_assets[source];
    origin=friendly?0:p->launch;emitters=origin?(origin==4u?2u:1u):(p->emitters?p->emitters:a->emitters);
    offsets=p->emitters?p->emitter_xy:a->emitter_xy;
    if (friendly && ce_atomic_volleys && !ce_can_allocate(CE_PSHOT, p->asset, emitters * p->count)) {
        ce_state.dropped += emitters * p->count; return;
    }
    for (emitter = 0; emitter != emitters; ++emitter) {
        px = origin ? (int16_t)p->launch_x*16 : x + (int16_t)offsets[emitter * 2u] * 16;
        py = origin ? ((int16_t)p->launch_y+(sequence%p->launch_lanes)*p->launch_step)*16 : y + (int16_t)offsets[emitter * 2u + 1u] * 16;
        base = p->angle;
        if(origin && origin!=5u){
            uint8_t right=origin==2u||(origin==3u&&(sequence&1u))||(origin==4u&&emitter);
            px=right?(CE_PLAY_WIDTH-2)*16:16;base=right?12u:4u;
        }
        if (p->kind == 1u || p->kind == 7u || p->kind == 9u) base = p->angle + ce_aim((ce_state.player_x - px) / 16, (ce_state.player_y - py) / 16);
        /* Downward aimed shots keep their horizontal boundary when the target
         * moves above the emitter. Ordinary aimed shots retain all directions. */
        if (p->kind == 7u) {
            base &= 15u;
            if (base < 4u) base = 4u;
            else if (base > 12u) base = 12u;
        }
        if (p->kind == 4u) base += sequence * p->rotation;
        for (n = 0; n != p->count; ++n) {
            angle = (base + p->angles[n]) & 15u;
            slot = allocate(friendly ? CE_PSHOT : CE_ESHOT, p->asset); if (slot == CE_NONE) continue;
            e = &CE_ENTITY(slot); e->ref = pattern; e->sequence=angle;
            ce_shot_x[slot] = px; ce_shot_y[slot] = py; ce_shot_age[slot] = 0;
            angle <<= 1;
            ce_shot_vx[slot] = p->velocity[angle]; ce_shot_vy[slot] = p->velocity[angle + 1u];
            e->hp = 1; ce_shot_lifetime[slot] = p->lifetime;
#if CE_CGB_ONLY
            ce_shot_damage[slot] = p->damage;
#else
            e->damage = p->damage;
#endif
            ce_init_shot_visual(slot);
            /* Enemy shots collide against cached center intervals, including
             * newly spawned shots that will not move until the next update. */
        }
    }
}

void ce_add_score(uint16_t value) BANKED {
    ce_state.score = 65535u - ce_state.score < value ? 65535u : ce_state.score + value;
}

void ce_damage_actor(uint8_t slot, uint8_t damage) BANKED {
    CE_Entity *target=&CE_ENTITY(slot); const CE_Actor *actor;
    if(target->kind!=CE_ENEMY && target->kind!=CE_BOSS)return;
    if(target->kind==CE_BOSS && ce_boss_invulnerable)return;
    actor=target->kind==CE_BOSS?&ce_bosses[target->ref]:&ce_enemies[target->ref];
    if(target->kind==CE_BOSS && actor->phase[target->phase].until && (actor->phase[target->phase].time_limit || actor->phase[target->phase].score != 65535u) && target->hp<=damage){
        target->hp=0;ce_boss_invulnerable=1;ce_clear_combat(0);return;
    }
    if(target->kind==CE_BOSS && target->phase+1u<actor->phases){
        const CE_Phase *p=&actor->phase[target->phase];
        if(p->until && (p->hp || actor->phase[target->phase+1u].intro_frames) && target->hp <= (p->hp?0u:p->threshold)+damage){
            target->hp=p->hp?0u:p->threshold;ce_boss_invulnerable=1;ce_clear_combat(0);
            if(ce_battle_mode>=2u)ce_bg_begin();ce_hud();return;
        }
    }
    if(target->hp<=damage){
        int16_t x=target->x,y=target->y;
        ce_add_score(actor->score);if(target->kind==CE_BOSS){ce_state.boss_defeated=1;defeated_asset=target->asset;defeated_x=x;defeated_y=y;}
        release(slot);ce_spawn_item(actor->drop_item,x,y);ce_sound(1);explode(x,y);
    }else{target->hp-=damage;if(target->kind==CE_BOSS)ce_sound(4);}
}
/* One damage packet per target per bomb, including later arrivals. Test the
 * visible sprite extent so entry from any edge responds on its first pixels. */
void ce_bomb_sweep(void) BANKED {
    uint8_t i, bit, n=ce_used; CE_Entity *e; const CE_Asset *a;
    for(i=0;i<n;++i){
        e=&CE_ENTITY(i);
        if(e->kind!=CE_ENEMY && e->kind!=CE_BOSS)continue;
        bit=1u<<(i&7u);
        if(ce_bomb_hits[i>>3]&bit)continue;
        if(e->kind==CE_BOSS && ce_boss_invulnerable)continue;
        a=&ce_assets[e->asset];
        if(e->x+(int16_t)(a->width-a->ox)*16<=0 || e->x-(int16_t)a->ox*16>=(int16_t)CE_PLAY_WIDTH*16 ||
           e->y+(int16_t)(a->height-a->oy)*16<=0 || e->y-(int16_t)a->oy*16>=2304)continue;
        ce_bomb_hits[i>>3]|=bit;
        ce_damage_actor(i,ce_bomb_damage);
    }
}
void ce_bomb_apply(void) BANKED {
    uint8_t i;
    ce_clear_combat(0);
    for(i=0;i!=CE_FREE_GROUPS;++i)ce_bomb_hits[i]=0;
    if (ce_bomb_background && !ce_battle_mode) ce_terrain_bomb();
    ce_bomb_sweep();
    if(ce_battle_mode>=2u)ce_bg_begin();
}
