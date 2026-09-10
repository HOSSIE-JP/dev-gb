/* Appended to a disposable runtime translation unit by kernel-runtime.mjs.
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
static void ce_kernel_test(void) {
    static const int16_t coordinates[] = {-32768,-1025,-513,-512,-511,-33,-32,-31,-17,-16,-15,-1,0,1,15,16,17,127,128,255,256,511,512,1023,1024,1535,1536,1919,1920,2047,2048,2559,2560,2815,2816,2817,3071,3072,3073,32767};
    static const int16_t velocities[] = {-128,-17,-1,0,1,17,128};
    static const uint16_t ages[] = {0,1,127,255,256,383,384,65534,65535};
    uint8_t a,x,y,v,n,expected; uint16_t cases = 0;
    ce_kernel_status=1; prepare_player_ranges();
    test_pose.asset=ce_player_asset;test_pose.x=1280;test_pose.y=1024;
    reference_box(&test_player,&test_pose);
    player_delta_x=48;player_delta_y=64;
    for(a=0;a!=ce_asset_count;++a)for(x=0;x!=40u;++x)for(y=0;y!=40u;++y) {
        test_pose.asset=a;test_pose.x=coordinates[x];test_pose.y=coordinates[y];
        reference_box(&test_expected,&test_pose);box(&test_actual,&test_pose);
        if(memcmp(&test_actual,&test_expected,sizeof(CE_Box))) {ce_kernel_status=2;return;}
        box_a=&test_player;box_b=&test_actual;
        expected=reference_overlap(&test_player,&test_expected);
        if(overlap()!=expected) {ce_kernel_status=3;return;}
        if(bullet_overlaps(&test_pose)!=expected) {ce_kernel_status=4;return;}
        ce_kernel_cases=++cases;
    }
    for(x=0;x!=40u;++x)for(y=0;y!=40u;++y)for(v=0;v!=7u;++v)for(n=0;n!=9u;++n) {
        test_pose.x=coordinates[x];test_pose.y=coordinates[y];test_pose.vx=velocities[v];test_pose.vy=-velocities[v];
        test_pose.age=ages[n];test_pose.lifetime=384;
        test_reference=test_pose;
        test_reference.x+=test_reference.vx;test_reference.y+=test_reference.vy;++test_reference.age;
        expected=test_reference.age>=384u || (uint16_t)(test_reference.x+512)>3584u || (uint16_t)(test_reference.y+512)>3328u;
        if(step_bullet(&test_pose)!=expected || memcmp(&test_pose,&test_reference,sizeof(CE_Entity))) {ce_kernel_status=5;return;}
        ce_kernel_cases=++cases;
    }
    ce_render_kernel_test();
    if (ce_kernel_status == 1u) ce_kernel_status=0xa5;
}
