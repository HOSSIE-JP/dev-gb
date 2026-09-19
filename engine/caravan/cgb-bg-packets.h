/* Bank 2: each physical map has its own last published contents. Including
 * cleared cells is essential: absence of a bullet is also a map change. */
static uint8_t __at(0xDA30) cgb_maps[1152];
static uint8_t __at(0xDEB0) cgb_dirty[18];

static uint8_t __at(0xDEC2) cgb_rows[18];
static uint8_t __at(0xDED4) cgb_past_rows[36];
static uint8_t __at(0xDF00) cgb_hud_rows[36];
static uint8_t cgb_dynamic_first;
/* A freshly loaded HUD dirties every row on both maps. One contiguous DMA is
 * cheaper and bounded within VBlank; eighteen per-row setups can overrun it. */
static uint8_t cgb_full_maps;
static uint8_t past_read,hud_read;
static void cgb_pack_map(void) __naked {
    __asm
        push bc
        push de
        push hl
        ld a, (_dma_map)
        ld l, a
        ld a, (_dma_map + 1)
        ld h, a
        ld de, #_map
        ld a, (_ce_bg_map_front)
        or a
        ld a, #0
        jr nz, 009$
        ld a, #18
009$:
        ld (_hud_read), a
        add #<_cgb_past_rows
        ld (_past_read), a
        ld b, #0
001$:
        push hl
        push de
        ld a, b
        add #<_cgb_rows
        ld l, a
        ld h, #>_cgb_rows
        ld d, (hl)
        ld a, (_past_read)
        add b
        ld l, a
        ld a, (hl)
        ld (hl), d
        or d
        ld c, a
        ld a, (_hud_read)
        add b
        ld l, a
        ld h, #>_cgb_hud_rows
        ld a, (hl)
        ld (hl), #0
        add a
        or c
        ld c, a
        ld a, b
        add #<_cgb_dirty
        ld l, a
        ld h, #>_cgb_dirty
        ld (hl), c
        pop de
        pop hl
        ld a, c
        or a
        jr z, 006$
        ; Gameplay rows publish one 16-byte DMA block. Leave the cached HUD
        ; columns alone unless this physical map has a pending HUD update.
        .rept 16
        ld a, (de)
        inc de
        ld (hl+), a
        .endm
        bit 1, c
        jr z, 010$
        .rept 4
        ld a, (de)
        inc de
        ld (hl+), a
        .endm
        jr 007$
010$:
        ld a, e
        add #4
        ld e, a
        jr nc, 011$
        inc d
011$:
        ; Finish the 32-byte destination stride after the first block.
        ld a, l
        add #16
        ld l, a
        jr nc, 002$
        inc h
        jr 002$
006$:
        ld a, e
        add #20
        ld e, a
        jr nc, 008$
        inc d
008$:
        ld a, l
        add #20
        ld l, a
        jr nc, 007$
        inc h
007$:
        ld a, l
        add #12
        ld l, a
        jr nc, 002$
        inc h
002$:
        inc b
        ld a, b
        cp #18
        jp nz, 001$
        pop hl
        pop de
        pop bc
        ret
    __endasm;
}
static void cgb_publish_map(void) __naked {
    __asm
        push bc
        push de
        push hl
        ld a, (_dma_map)
        ld l, a
        ld a, (_dma_map + 1)
        ld h, a
        ld de, #0x9c00
        ld a, (_ce_bg_map_front)
        or a
        jr z, 001$
        ld d, #0x98
001$:
        ld bc, #_cgb_dirty
002$:
        ld a, (bc)
        inc bc
        or a
        jr z, 003$
        push af
        ld a, h
        ldh (#0x51), a
        ld a, l
        ldh (#0x52), a
        ld a, d
        ldh (#0x53), a
        ld a, e
        ldh (#0x54), a
        pop af
        srl a
        ldh (#0x55), a
003$:
        ld a, l
        add #32
        ld l, a
        jr nc, 004$
        inc h
004$:
        ld a, e
        add #32
        ld e, a
        jr nc, 005$
        inc d
005$:
        ld a, c
        cp #<(_cgb_dirty + 18)
        jr nz, 002$
        pop hl
        pop de
        pop bc
        ret
    __endasm;
}
