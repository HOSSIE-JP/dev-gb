/* Bank 3 is selected once for preparation/publication, never per tile. */
static uint8_t __at(0xD000) cgb_parallax[2048];
static uint8_t __at(0xD800) cgb_road_row[32];
static uint8_t cgb_parallax_cached, cgb_parallax_pending, cgb_row_pending;
static uint8_t cgb_collect_rows;
uint8_t ce_road_dma_end_ly;
static void cgb_prepare_road(void) {
    const CE_Parallax *p=&ce_parallaxes[ce_state.stage];
    uint16_t size=(uint16_t)p->count*p->phases*16u;
    uint8_t saved=SVBK_REG;
    cgb_parallax_cached=0;cgb_parallax_pending=0;cgb_row_pending=255;
    if(p->count && size<=sizeof(cgb_parallax)){
        SVBK_REG=3;
        ce_copy(cgb_parallax,ce_color_stages[ce_state.stage].attrs?&ce_color_parallaxes[ce_state.stage]:&p->frames,0,size);
        SVBK_REG=saved;cgb_parallax_cached=1;
    }
}
static void cgb_queue_row(uint8_t target,uint8_t count) {
    uint8_t saved=SVBK_REG,i;
    SVBK_REG=3;
    for(i=0;i!=count;++i){cgb_road_row[i]=buffer[i];cgb_road_row[16u+i]=ce_color_stages[ce_state.stage].attrs?buffer[64u+i]:ce_stage->palette;}
    cgb_road_row[15]=cgb_road_row[31]=0;
    SVBK_REG=saved;cgb_row_pending=target;
}
static void cgb_road_dma(uint16_t source,uint16_t dest,uint8_t blocks) {
    HDMA1_REG=source>>8;HDMA2_REG=source;HDMA3_REG=dest>>8;HDMA4_REG=dest;HDMA5_REG=blocks-1u;
}
static void cgb_publish_road(void) {
    uint8_t saved=SVBK_REG;
    const CE_Parallax *p=&ce_parallaxes[ce_state.stage];
    if(!cgb_parallax_pending && cgb_row_pending==255u)return;
    /* One row (two blocks) plus <= eight parallax blocks in this project. */
    if(LY_REG<144u||LY_REG>149u)vsync();
    SVBK_REG=3;
    CRITICAL {
        if(cgb_row_pending!=255u){
            uint16_t dest=0x9800u+(uint16_t)cgb_row_pending*32u;
            cgb_road_dma(0xD800u,dest,1);VBK_REG=1;
            cgb_road_dma(0xD810u,dest,1);VBK_REG=0;cgb_row_pending=255;
        }
        if(cgb_parallax_pending){
            cgb_road_dma(0xD000u+(uint16_t)parallax_phase*p->count*16u,0x9000u+(uint16_t)(ce_screens[4].tile_count+p->first)*16u,p->count);
            cgb_parallax_pending=0;
        }
        ce_road_dma_end_ly=LY_REG;
    }
    SVBK_REG=saved;
}
