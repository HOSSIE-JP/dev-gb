/* Independent shot pool: no CE_Entity record or actor scheduler per bullet. */
static void dense_shot_wall(uint8_t i) {
    if(!(step_walls&1u)&&ce_shot_kind[i]!=CE_PSHOT)return;
    box_out=&dense_shot_box;shot_box(i);
    if(ce_terrain_collision(&dense_shot_box,ce_shot_damage[i],ce_shot_kind[i]==CE_PSHOT?1u:2u))ce_release_shot(i);
}
static void dense_step_shots(void) __naked {
    __asm
        push bc
        push de
        push hl
        xor a
        ld (_step_slot), a
200$:
        ld a, (_step_count)
        ld b, a
        ld a, (_step_slot)
        cp b
        jr z, 204$
        ld e, a
        ld d, #0
        ld hl, #_shot_active
        add hl, de
        ld a, (hl)
        or a
        jr z, 203$
        ld a, e
        call _ce_step_bullet_body
        or a
        jr z, 201$
        ld a, (_step_slot)
        call _ce_release_shot
        jr 203$
201$:
        ld a, (_step_walls)
        or a
        jr z, 203$
        ld a, (_step_slot)
        call _dense_shot_wall
203$:
        ld hl, #_step_slot
        inc (hl)
        jr 200$
204$:
        pop hl
        pop de
        pop bc
        ret
    __endasm;
}
static void step_entities(void) {
    uint8_t i,end=ce_pool_counts[CE_ESHOT]?CE_SHOT_CAPACITY:ce_pool_counts[CE_PSHOT]?CE_MAX_PSHOTS:0u;
    for(i=0;i!=ce_used;++i)active[i]=ce_entities[i].kind;
    if(end)memcpy(shot_active,ce_shot_kind,end);
    for(i=0;i!=ce_used;++i)if(active[i]&&ce_entities[i].kind)step_nonbullet(i);
    step_count=end;if(end)dense_step_shots();
}
static void steer_sprite_shots(void) {
    uint8_t i,angle;const CE_Pattern *p;
    for(i=ce_state.tick&7u;i<CE_SHOT_CAPACITY;i+=8u)if(ce_shot_kind[i]==CE_ESHOT){
        p=&ce_patterns[ce_shot_ref[i]];
        if(p->kind!=5u||ce_shot_age[i]>=p->guide_frames||((ce_state.tick-i)&p->guide_mask))continue;
        angle=ce_home(ce_shot_sequence[i],ce_shot_x[i]/16,ce_shot_y[i]/16);ce_shot_sequence[i]=angle;
        ce_shot_vx[i]=p->velocity[angle*2u];ce_shot_vy[i]=p->velocity[angle*2u+1u];
    }
}
static void collide_shots(void) {
    static uint8_t i,j,damage,end;
#ifdef CE_CGB
    static CE_Entity *target;
#endif
    if(!ce_pool_counts[CE_PSHOT]||!(ce_pool_counts[CE_ENEMY]|ce_pool_counts[CE_BOSS]))return;
    end=ce_used<CE_ACTOR_SLOTS?ce_used:CE_ACTOR_SLOTS;
#ifdef CE_CGB
    /* Build once, then reject spatial misses before following actor metadata.
     * The fixed actor pool and stable slot order preserve same-tick hit order. */
    target_count=0;
    for(j=0,target=ce_entities;j<end;++j,++target)if(target->kind &&
        (ce_actor_visible[j] || (target->kind==CE_BOSS && ce_battle_mode==3u))) {
        targets[target_count]=target;target_slots[target_count]=j;target_boxes[target_count++]=&boxes[j];
    }
#endif
    for(i=0;i<CE_MAX_PSHOTS;++i)if(ce_shot_kind[i]&&ce_shot_visible[i]){
        box_out=&dense_shot_box;shot_box(i);box_a=&dense_shot_box;
#ifdef CE_CGB
        for(j=0;j!=target_count;++j) {
            box_b=target_boxes[j];if(!overlap())continue;
            target=targets[j];if(target->kind!=CE_ENEMY && target->kind!=CE_BOSS)continue;
            if(target->kind==CE_BOSS && ce_boss_invulnerable)continue;
            damage=ce_shot_damage[i];ce_release_shot(i);ce_damage_actor(target_slots[j],damage);break;
        }
#else
        for(j=0;j<end;++j)if(ce_entities[j].kind){
            if(!ce_actor_visible[j] && !(ce_entities[j].kind==CE_BOSS&&ce_battle_mode==3u))continue;
            if(ce_entities[j].kind==CE_BOSS&&ce_boss_invulnerable)continue;
            box_b=&boxes[j];if(!overlap())continue;
            damage=ce_shot_damage[i];ce_release_shot(i);ce_damage_actor(j,damage);break;
        }
#endif
    }
}
