static void dma_transfer(uint16_t source,uint16_t dest,uint8_t blocks);
static void cgb_begin(void) {
    uint8_t n;uint16_t index;
    for(n=0;n!=ce_cgb_cells_count;++n) {
        index=ce_cgb_cells[n];CGB_MAP[index]=0;CGB_ATTRS[index]=8u;
    }
    ce_cgb_cells_count=ce_cgb_compounds_count=0;
}
static void cgb_flush(void) {
    uint8_t row, first=ce_hud_bottom?18u-ce_hud_height/8u:0u;
    ce_cgb_resolve();
    if(CGB_STATIC_TILES+ce_cgb_dynamic_count>ce_bg_peak_tiles)
        ce_bg_peak_tiles=CGB_STATIC_TILES+ce_cgb_dynamic_count;
    for(row=0;row!=ce_hud_height/8u;++row)
        memcpy(CGB_MAP+(uint16_t)(first+row)*32u,hud+row*20u,20u);
}
static void cgb_publish(void) {
    uint8_t n=ce_cgb_dynamic_count;
    uint16_t first=CGB_STATIC_TILES+(ce_bg_map_front?0u:CGB_DYNAMIC_TILES);
    uint16_t dest=ce_bg_map_front?0x9800u:0x9c00u;
    /* Upload only to the hidden tile page. Native CGB timing cannot fit all
     * 96 blocks after GBDK's VBlank handler. Allow a second VBlank for the
     * maps rather than letting a large compound field run into visible LCD. */
    if(n) {
        if(LY_REG<144u||LY_REG>146u)vsync();
        CRITICAL {
            VBK_REG=1;
            dma_transfer((uint16_t)CGB_TILES,0x8000u+first*16u,n);
            VBK_REG=0;
        }
    }
    /* The 72 map/attribute blocks fit from line 146. Flip only after both
     * maps are complete; the old field stays intact during a split upload. */
    if(LY_REG<144u||LY_REG>146u)vsync();
    CRITICAL {
        VBK_REG=1;
        dma_transfer((uint16_t)CGB_ATTRS,dest,36u);
        VBK_REG=0;dma_transfer((uint16_t)CGB_MAP,dest,36u);
        ce_bg_map_front^=1u;
        if(ce_bg_map_front)LCDC_REG|=8u;else LCDC_REG&=~8u;
        ce_bg_dma_end_ly=LY_REG;
    }
}
static void cgb_setup(void) {
    uint8_t t,y,row,first;
    ce_get_screen(&screen,4);hud_tiles=screen.tile_count;
    ce_bg_plane=0;ce_bg_map_front=0;ce_bg_tile_drops=0;ce_bg_peak_tiles=CGB_STATIC_TILES;
    ce_cgb_cells_count=ce_cgb_compounds_count=ce_cgb_dynamic_count=0;
    top=ce_hud_bottom?0u:ce_hud_height;bottom=ce_hud_bottom?144u-ce_hud_height:144u;
    VBK_REG=0;
    for(t=0;t!=hud_tiles;++t) {
        ce_copy(tile_buffer,&screen.tiles,(uint16_t)t*16u,16u);
        for(y=0;y!=16u;y+=2u)tile_buffer[y]=tile_buffer[y+1u]=tile_buffer[y]|tile_buffer[y+1u];
        set_bkg_data(t,1u,tile_buffer);
    }
    VBK_REG=1;
    for(t=0;t!=CGB_STATIC_TILES;++t) {
        ce_copy(tile_buffer,&ce_cgb_dictionary,(uint16_t)t*16u,16u);
        set_bkg_data(t,1u,tile_buffer);
    }
    VBK_REG=0;
    memset(CGB_MAP,0,576u);memset(CGB_ATTRS,8,576u);
    first=ce_hud_bottom?18u-ce_hud_height/8u:0u;
    for(row=0;row!=ce_hud_height/8u;++row)memset(CGB_ATTRS+(uint16_t)(first+row)*32u,0,32u);
    ce_copy(hud,&screen.map,0,ce_hud_height/8u*20u);
    HIDE_WIN;move_bkg(0,0);LCDC_REG&=~8u;
    cgb_flush();vsync();cgb_publish();vsync();cgb_publish();ce_bg_begin();
}
