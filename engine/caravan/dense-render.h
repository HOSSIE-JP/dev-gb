static void dense_draw(void) {
    uint8_t i,end;
    if(!ce_dense_ready)ce_dense_plan();
    for(i=0;i!=ce_used;++i)if(ce_entities[i].kind&&ce_actor_visible[i]){
        pose=&ce_entities[i];animation_slot=i+1u;actor_sprite();
    }
    end=ce_pool_counts[CE_ESHOT]?CE_SHOT_CAPACITY:ce_pool_counts[CE_PSHOT]?CE_MAX_PSHOTS:0u;
    for(i=0;i!=end;++i)if(ce_shot_kind[i]&&ce_shot_visible[i]){
        if(ce_shot_simple[i])shot_sprite(i);
        else {shot_pose.asset=ce_shot_asset[i];shot_pose.x=ce_shot_x[i];shot_pose.y=ce_shot_y[i];shot_pose.age=ce_shot_age[i];
            pose=&shot_pose;animation_slot=CE_MAX_ENTITIES+1u;actor_sprite();}
    }
    ce_dense_ready=0;
}
