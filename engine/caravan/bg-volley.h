/* Run the complete BG volley in the allocator's ROM bank. Sprite volleys keep
 * their own loop, and accepted bullets do not cross banks one at a time. */
void ce_bg_shoot(uint8_t pattern,uint8_t source,int16_t x,int16_t y,uint8_t sequence) BANKED {
    const CE_Pattern *p=&ce_patterns[pattern];
    const CE_Asset *a=&ce_assets[source];
    const int8_t *offsets;
    uint8_t origin=p->launch,emitters,emitter,n,base,angle;
    int16_t sx,sy;
    emitters=origin?(origin==4u?2u:1u):(p->emitters?p->emitters:a->emitters);
    /* Full pools cannot free a slot during a synchronous volley. Preserve the
     * rejected-attempt counter, including its unsigned 16-bit wrap. */
    if(ce_bg_count>=ce_bg_limit){ce_state.dropped+=(uint16_t)emitters*p->count;return;}
    offsets=p->emitters?p->emitter_xy:a->emitter_xy;
    ce_bg_request.life=p->lifetime;ce_bg_request.damage=p->damage;
    ce_bg_request.pattern=p->kind==5u?pattern:CE_NONE;
    for(emitter=0;emitter!=emitters;++emitter){
        sx=origin?(int16_t)p->launch_x*16:x+(int16_t)offsets[emitter*2u]*16;
        sy=origin?((int16_t)p->launch_y+(sequence%p->launch_lanes)*p->launch_step)*16:y+(int16_t)offsets[emitter*2u+1u]*16;
        base=p->angle;
        if(origin && origin!=5u){
            uint8_t right=origin==2u||(origin==3u&&(sequence&1u))||(origin==4u&&emitter);
            sx=right?(CE_PLAY_WIDTH-2)*16:16;base=right?12u:4u;
        }
        if(p->kind==1u||p->kind==7u||p->kind==9u)base=p->angle+ce_aim((ce_state.player_x-sx)/16,(ce_state.player_y-sy)/16);
        if(p->kind==7u){base&=15u;if(base<4u)base=4u;else if(base>12u)base=12u;}
        if(p->kind==4u)base+=sequence*p->rotation;
        ce_bg_request.x=sx;ce_bg_request.y=sy;
        for(n=0;n!=p->count;++n){
            /* Birth-time collision/culling may immediately free an accepted
             * slot. Do not pre-clamp the volley to its initial free capacity. */
            if(ce_bg_count>=ce_bg_limit){ce_state.dropped+=(uint16_t)(emitters-emitter)*p->count-n;return;}
            angle=(base+p->angles[n])&15u;
            ce_bg_request.vx=p->velocity[angle*2u];ce_bg_request.vy=p->velocity[angle*2u+1u];
            ce_bg_request.angle=angle;spawn_shot();
        }
    }
}
