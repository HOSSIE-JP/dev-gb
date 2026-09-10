
/* Only appended to the disposable oracle ROM. The expected OAM uses general
 * C arithmetic and duration traversal, independent of the production cache. */
extern volatile uint8_t ce_kernel_status;
void ce_render_kernel_test(void) BANKED {
    static const uint16_t ages[] = {0,1,2,3,9,10,20,21,127,128,129,255,256,65534,65535,0,1,1};
    static const int16_t positions[] = {-513,-17,-16,-15,-1,0,1,15,16,17,1279,2560,3073};
    static CE_Entity candidate;
    static const CE_Asset *asset;
    static uint16_t n,time;
    static uint8_t a,pass,frame,tile,x,y,column,row,index,expected_y;
    ce_is_cgb = _cpu == CGB_TYPE;
    DISABLE_OAM_DMA;
    hide_all();
    emit_top=9; emit_bottom=144;
    for (pass=0; pass!=2u; ++pass) for (a=0; a!=ce_asset_count; ++a) {
        asset=&ce_assets[a]; candidate.asset=a; pose=&candidate;
        /* Reusing one slot for different assets also exercises cache reset. */
        animation_slot=1;
        for (n=0; n!=550u; ++n) {
            candidate.age=n<512u?n:ages[(n-512u)%18u];
            candidate.x=positions[n%13u]; candidate.y=positions[(n/13u)%13u];
            pose_slot=0; sprite();
            frame=0; time=candidate.age%asset->duration;
            while (time>=asset->durations[frame]) {time-=asset->durations[frame]; ++frame;}
            tile=asset->first_tile+frame*asset->tiles; index=0;
            for (row=0; row!=asset->height/8u; ++row) for (column=0; column!=asset->width/8u; ++column) {
                x=candidate.x/16+8-asset->ox+column*8u;
                y=candidate.y/16+16-asset->oy+row*8u;
                expected_y=x>0u && x<168u && y>=9u && y<144u?y:0u;
                if (shadow_OAM[index].x!=x || shadow_OAM[index].y!=expected_y ||
                    shadow_OAM[index].tile!=tile++ || shadow_OAM[index].prop!=(ce_is_cgb?asset->palette:0u)) {
                    ce_kernel_status=6; return;
                }
                ++index;
            }
            if (pose_slot!=asset->tiles) {ce_kernel_status=7; return;}
        }
    }
}
