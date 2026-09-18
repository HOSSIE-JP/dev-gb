#pragma bank 255
#include "caravan.h"
#include "music.h"
#include "mainloop.h"
#include <gb/isr.h>
#include <string.h>

/* Scene 15 owns the idle entity pool. No additional persistent WRAM is used.
 * Timer code and ROM copies must stay in ROM0 while switching data banks. */
typedef struct {
    const uint8_t *pcm;
    uint16_t left;
    volatile uint16_t blocks;
    uint16_t start, last;
    uint8_t bank;
    uint16_t frame;
    uint8_t overruns, skipped;
    uint8_t ie, tac, tma, tima;
    palette_color_t palettes[28];
    CE_MovieFrame data;
    uint8_t tiles[640], attributes[40];
    uint8_t lcdc;
    uint8_t pcm_page;
    uint16_t waited;
} MovieWork;
#define MOVIE ((MovieWork *)ce_entities)
typedef char MovieFits[(sizeof(MovieWork) <= sizeof(ce_entities)) ? 1 : -1];

static void movie_pcm(void) NONBANKED {
    uint8_t bank = CURRENT_BANK;
    NR30_REG = 0;
    if (!MOVIE->left) {
        /* Descriptors stay in ROM0, so the ISR never calls banked code.
         * Chunks are multiples of one 16-byte wave refill. */
        const CE_Data *next = &ce_movie_pcm[MOVIE->pcm_page + 1u];
        if (!next->length) return;
        ++MOVIE->pcm_page;
        MOVIE->pcm = next->data;
        MOVIE->bank = next->bank;
        MOVIE->left = next->length;
    }
    SWITCH_ROM(MOVIE->bank);
    /* DAC is off: the complete wave RAM is writable on DMG and CGB.
     * A single assembly memcpy avoids repeated shared-pointer updates. */
    memcpy((void *)0xff30, MOVIE->pcm, 16);
    SWITCH_ROM(bank);
    MOVIE->left -= 16;
    MOVIE->pcm += 16;
    ++MOVIE->blocks;
    NR30_REG = 0x80;
    NR34_REG = 0x87;
}

/* This engine reserves TIM for movie audio. The direct vector avoids the
 * dispatcher's ten-byte handler list and reduces wave refill latency. */
static void movie_timer(void) NONBANKED __critical __interrupt {
    movie_pcm();
}
ISR_VECTOR(VECTOR_TIMER, movie_timer)

static uint8_t movie_wait(void) {
    uint16_t now;
    /* VRAM copies may themselves cross VBlank. Do not wait a second time
     * when that chunk has already consumed its display interval. */
    CRITICAL { now = sys_time; }
    if (now == MOVIE->waited) vsync();
    CRITICAL { MOVIE->waited = sys_time; }
    ce_trace_write();
    if (joypad()) { MOVIE->skipped = 1; return 1; }
    return 0;
}

static void movie_map(uint8_t buffer) {
    uint8_t x, y, w = ce_is_cgb ? 20 : 14, h = ce_is_cgb ? 12 : 8;
    uint8_t blank = ce_is_cgb ? 240 : 224;
    uint8_t *map = (uint8_t *)(buffer ? 0x9c00 : 0x9800);
    uint16_t i;
    VBK_REG = 0;
    for (i = 0; i != 1024; ++i) map[i] = blank;
    for (y = 0; y != h; ++y) for (x = 0; x != w; ++x)
        map[(y + (ce_is_cgb ? 3 : 5)) * 32u + x + (ce_is_cgb ? 0 : 3)] = y * w + x + (ce_is_cgb ? 0 : buffer * 112);
    if (ce_is_cgb) {
        VBK_REG = 1;
        for (i = 0; i != 1024; ++i) map[i] = 0;
        VBK_REG = 0;
    }
}

static void movie_chunk(uint8_t frame, uint8_t chunk) {
    const CE_MovieFrame *f = &MOVIE->data;
    uint8_t buffer = frame & 1, i, first = chunk * (ce_is_cgb ? 40 : 19);
    uint8_t count = ce_is_cgb ? 40 : (chunk == 5 ? 17 : 19);
    uint8_t *map, *attr;
    VBK_REG = ce_is_cgb ? buffer : 0;
    ce_copy(MOVIE->tiles, ce_is_cgb ? &f->cgb : &f->dmg, first * 16u, count * 16u);
    vmemcpy((uint8_t *)(0x8000u + (ce_is_cgb ? first : first + buffer * 112u) * 16u), MOVIE->tiles, count * 16u);
    if (ce_is_cgb) {
        VBK_REG = 1;
        map = (uint8_t *)(buffer ? 0x9c00 : 0x9800) + (3u + chunk * 2u) * 32u;
        ce_copy(MOVIE->attributes, &f->attributes, first, count);
        if (buffer) { attr = MOVIE->attributes; for (i = 0; i != 40; ++i) *attr++ |= 8; }
        set_data(map, MOVIE->attributes, 20);
        set_data(map + 32, MOVIE->attributes + 20, 20);
    }
    VBK_REG = 0;
}

void ce_play_movie(void) BANKED {
    uint8_t chunk;
    uint16_t frame, now;
    if (!ce_movie_count) return;
    ce_music_play(0);
    ce_scene = 15; ce_used = 0;
    memset(MOVIE, 0, sizeof(MovieWork));
    MOVIE->ie = IE_REG; MOVIE->tac = TAC_REG; MOVIE->tma = TMA_REG; MOVIE->tima = TIMA_REG;
    MOVIE->lcdc = LCDC_REG;
    set_interrupts(VBL_IFLAG);
    DISPLAY_OFF;
    HIDE_SPRITES; HIDE_WIN;
    SCX_REG = SCY_REG = 0;
    movie_map(0); movie_map(1);
    VBK_REG = 0;
    memset((void *)(ce_is_cgb ? 0x8f00 : 0x8e00), ce_is_cgb ? 0 : 255, 16);
    if (ce_is_cgb) { palette_color_t black[4] = {0,0,0,0}; set_bkg_palette(0,1,black); }
    BGP_REG = 0xe4;
    ce_get_movie_frame(&MOVIE->data, 0);
    for (chunk = 0; chunk != 6; ++chunk) movie_chunk(0, chunk);
    if (ce_is_cgb) {
        ce_copy((uint8_t *)MOVIE->palettes,&MOVIE->data.palettes,0,56);
        set_bkg_palette(1,7,MOVIE->palettes);
    }
    MOVIE->pcm = ce_movie_pcm[0].data; MOVIE->bank = ce_movie_pcm[0].bank; MOVIE->left = ce_movie_pcm[0].length;
    NR52_REG = 0x80; NR50_REG = 0x77; NR51_REG = 0x44;
    NR31_REG = 0; NR32_REG = 0x20; NR33_REG = 0;
    TAC_REG = 0;
    LCDC_REG = LCDCF_ON | LCDCF_BG8000 | LCDCF_BGON;
    vsync();
    CRITICAL {
        MOVIE->start = MOVIE->last = MOVIE->waited = sys_time;
        movie_pcm();
        TMA_REG = TIMA_REG = ce_is_cgb ? 128 : 192;
        IF_REG &= ~TIM_IFLAG;
        TAC_REG = 7;
    }
    set_interrupts(VBL_IFLAG | TIM_IFLAG);
    for (frame = 1; frame < ce_movie_count; ++frame) {
        ce_get_movie_frame(&MOVIE->data, frame);
        if (ce_is_cgb) ce_copy((uint8_t *)MOVIE->palettes,&MOVIE->data.palettes,0,56);
        for (chunk = 0; chunk != 6; ++chunk) {
            movie_chunk(frame,chunk);
            if (movie_wait()) goto done;
        }
        CRITICAL { now = sys_time; }
        if (now - MOVIE->last > 6) ++MOVIE->overruns;
        MOVIE->last = now; MOVIE->frame = frame;
        if (ce_is_cgb) set_bkg_palette(1,7,MOVIE->palettes);
        LCDC_REG = LCDCF_ON | LCDCF_BG8000 | LCDCF_BGON | ((frame & 1) ? LCDCF_BG9C00 : 0);
    }
    for (chunk = 0; chunk != 6; ++chunk) if (movie_wait()) break;
done:
    set_interrupts(VBL_IFLAG);
    TAC_REG = 0; NR30_REG = 0;
    DISPLAY_OFF;
    /* Movie tiles use unsigned $8000 addressing and both BG maps. Restore
     * the game's signed $8800 tile area and independent Window map before
     * the next screen upload, otherwise BG writes overwrite OBJ/HUD data. */
    LCDC_REG = MOVIE->lcdc & ~LCDCF_ON;
    VBK_REG = 0; SCX_REG = SCY_REG = 0;
    NR50_REG = 0x77; NR51_REG = 0xff;
    TMA_REG = MOVIE->tma; TIMA_REG = MOVIE->tima;
    IF_REG &= ~TIM_IFLAG; TAC_REG = MOVIE->tac;
    set_interrupts(MOVIE->ie);
    CRITICAL { ce_music_time = sys_time; }
    ce_used = 0;
}
