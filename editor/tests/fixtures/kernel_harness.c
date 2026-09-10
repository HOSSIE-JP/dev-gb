/* Linked in a separate bank of a disposable ROM by kernel-runtime.mjs.
 * Runs the actual private kernels against independent C arithmetic, on SM83.
 * No game RAM modification by the host, and no diagnostic code in releases. */
volatile uint8_t ce_kernel_status;
volatile uint16_t ce_kernel_cases;
static CE_Entity test_pose, test_reference;
static CE_Box test_actual, test_expected, test_player;
void ce_render_kernel_test(void) BANKED;
static void reference_box(CE_Box *b, const CE_Entity *e) {
    const CE_Hitbox *a = &ce_hitboxes[e->asset];
    b->left = e->x / 16 + 128 + a->x; b->top = e->y / 16 + 128 + a->y;
    b->right = b->left + a->w; b->bottom = b->top + a->h;
}
static uint8_t reference_overlap(const CE_Box *a, const CE_Box *b) {
    return a->top < b->bottom && a->bottom > b->top && a->left < b->right && a->right > b->left;
}
static uint8_t test_shot_animation(void) {
    const CE_Asset *asset; uint16_t age,time; uint8_t a,frame,slot;
    ce_is_cgb = _cpu == CGB_TYPE;
    /* Continuous ages through all 65536 values, then wrap, with slot reuse.
     * The expected frame uses duration traversal, independent of the cache. */
    for(a=0;a!=ce_asset_count;++a) {
        asset=&ce_assets[a]; if(asset->tiles!=1u)continue;
        slot=a&1u ? 0u : CE_MAX_ENTITIES-1u;
        ce_entities[slot].asset=a; ce_shot_x[slot]=1279;ce_shot_y[slot]=1023;
        ce_shot_age[slot]=0; init_shot_visual(slot);
        age=0;
        do {
            ce_shot_age[slot]=age;
            if(age && asset->frames>1u)advance_shot_animation(slot);
            frame=0;time=age%asset->duration;
            while(time>=asset->durations[frame]) {time-=asset->durations[frame];++frame;}
            if(ce_shot_oam[slot].tile!=asset->first_tile+frame ||
                ce_shot_oam[slot].prop!=(ce_is_cgb?asset->palette:0u))return 0;
        }while(++age);
        ce_shot_age[slot]=0;advance_shot_animation(slot);
        if(ce_shot_oam[slot].tile!=asset->first_tile || shot_left[slot]!=asset->durations[0])return 0;
        /* Reinitializing the same asset must also clear its previous phase. */
        init_shot_visual(slot);
        if(shot_frame[slot] || shot_left[slot]!=asset->durations[0])return 0;
    }
    return 1;
}
static void ce_kernel_test(void) {
    static const int16_t coordinates[] = {-32768,-1025,-513,-512,-511,-33,-32,-31,-17,-16,-15,-1,0,1,15,16,17,127,128,255,256,511,512,1023,1024,1535,1536,1919,1920,2047,2048,2559,2560,2815,2816,2817,3071,3072,3073,32767};
    static const int16_t velocities[] = {-128,-17,-1,0,1,17,128};
    static const uint16_t ages[] = {0,1,127,255,256,383,384,65534,65535};
    uint8_t a,x,y,v,n,slot,expected; uint16_t cases = 0;
    ce_kernel_status=1; prepare_player_ranges();
    shot_top=9; shot_bottom=144;
    test_pose.asset=ce_player_asset;test_pose.x=1280;test_pose.y=1024;
    reference_box(&test_player,&test_pose);
    player_delta_x=48;player_delta_y=64;
    for(a=0;a!=ce_asset_count;++a)for(x=0;x!=40u;++x)for(y=0;y!=40u;++y) {
        test_pose.asset=a;test_pose.x=coordinates[x];test_pose.y=coordinates[y];
        reference_box(&test_expected,&test_pose);box(&test_actual,&test_pose);
        if(memcmp(&test_actual,&test_expected,sizeof(CE_Box))) {ce_kernel_status=2;return;}
        slot=(x+y+a)%CE_MAX_ENTITIES;
        ce_entities[slot].asset=a;
        shot_range_index[slot]=a*4u;
        ce_shot_x[slot]=test_pose.x; ce_shot_y[slot]=test_pose.y;
        shot_ox[slot]=8u-ce_assets[a].ox; shot_oy[slot]=16u-ce_assets[a].oy;
        prepare_shot(slot);
        if(ce_shot_px[slot]!=test_pose.x/16 || ce_shot_py[slot]!=test_pose.y/16) {ce_kernel_status=8;return;}
        box_out=&test_actual; shot_box(slot);
        if(memcmp(&test_actual,&test_expected,sizeof(CE_Box))) {ce_kernel_status=10;return;}
        box_a=&test_player;box_b=&test_actual;
        expected=reference_overlap(&test_player,&test_expected);
        if(overlap()!=expected) {ce_kernel_status=3;return;}
        if(bullet_overlaps(slot)!=expected) {ce_kernel_status=4;return;}
        ce_kernel_cases=++cases;
    }
    for(x=0;x!=40u;++x)for(y=0;y!=40u;++y)for(v=0;v!=7u;++v)for(n=0;n!=9u;++n) {
        test_pose.x=coordinates[x];test_pose.y=coordinates[y];test_pose.vx=velocities[v];test_pose.vy=-velocities[v];
        test_pose.age=ages[n];test_pose.lifetime=384;
        test_reference=test_pose;
        test_reference.x+=test_reference.vx;test_reference.y+=test_reference.vy;++test_reference.age;
        expected=test_reference.age>=384u || (uint16_t)(test_reference.x+512)>3584u || (uint16_t)(test_reference.y+512)>3328u;
        slot=(x+y+v+n)%CE_MAX_ENTITIES;
        ce_shot_x[slot]=test_pose.x; ce_shot_y[slot]=test_pose.y;
        ce_shot_vx[slot]=test_pose.vx; ce_shot_vy[slot]=test_pose.vy;
        ce_shot_age[slot]=test_pose.age; ce_shot_lifetime[slot]=384;
        if(step_bullet(slot)!=expected || ce_shot_x[slot]!=test_reference.x || ce_shot_y[slot]!=test_reference.y ||
            ce_shot_age[slot]!=test_reference.age || ce_shot_vx[slot]!=test_reference.vx || ce_shot_vy[slot]!=test_reference.vy || ce_shot_lifetime[slot]!=384u) {ce_kernel_status=5;return;}
        if(!expected) {
            uint8_t sx=test_reference.x/16+shot_ox[slot],sy=test_reference.y/16+shot_oy[slot];
            if(ce_shot_oam[slot].x!=sx || ce_shot_oam[slot].y!=(sx && sx<168u && sy>=9u && sy<144u?sy:0u)) {ce_kernel_status=9;return;}
        }
        ce_kernel_cases=++cases;
    }
    if(!test_shot_animation()) {ce_kernel_status=11;return;}
    ce_render_kernel_test();
    if (ce_kernel_status == 1u) ce_kernel_status=0xa5;
}
