/* Private SM83 writers. Only the main loop owns the inactive map/bitplane.
 * Two stores finish within the safe interval following a mode-0/1 poll. */
/* Compose the CGB packet directly from occupancy masks. C's indexed 16-bit
 * temporaries were more expensive than the actual sixteen output stores. */
static void compose_dma_tiles(void) __naked {
    __asm
        push bc
        push de
        push hl
        ld a, (_compound_count)
        or a
        jr z, 004$
        ld (_flush_left), a
        ld hl, #_compound_cells
001$:
        ld a, (hl+)
        ld e, a
        ld a, (hl+)
        ld d, a
        push hl
        ld h, d
        ld l, e
        srl h
        rr l
        ld bc, #_map
        add hl, bc
        ld a, (_next_tile)
        ld (hl), a
        ld hl, #_next_tile
        inc (hl)
        jr nz, 002$
        inc hl
        inc (hl)
002$:
        ld hl, #_cells
        add hl, de
        ld a, (hl+)
        ld e, a
        ld d, (hl)
        ld a, (_dma_cursor)
        ld l, a
        ld a, (_dma_cursor + 1)
        ld h, a
        ld a, e
        and #15
        call 005$
        ld a, e
        swap a
        and #15
        call 005$
        ld a, d
        and #15
        call 005$
        ld a, d
        swap a
        and #15
        call 005$
        ld a, l
        ld (_dma_cursor), a
        ld a, h
        ld (_dma_cursor + 1), a
        pop hl
        ld a, (_flush_left)
        dec a
        ld (_flush_left), a
        jr nz, 001$
004$:
        pop hl
        pop de
        pop bc
        ret
005$:
        push hl
        ld l, a
        ld h, #0
        ld bc, #_expand
        add hl, bc
        ld a, (hl)
        pop hl
        ld (hl+), a
        ld (hl+), a
        ld (hl+), a
        ld (hl+), a
        ret
    __endasm;
}
static void pack_dma_map(void) __naked {
    __asm
        push bc
        push de
        push hl
        ld a, (_dma_map)
        ld l, a
        ld a, (_dma_map + 1)
        ld h, a
        ld de, #_map
        ld b, #18
001$:
        .rept 20
        ld a, (de)
        inc de
        ld (hl+), a
        .endm
        ld a, l
        add #12
        ld l, a
        jr nc, 003$
        inc h
003$:
        dec b
        jr nz, 001$
        pop hl
        pop de
        pop bc
        ret
    __endasm;
}
static void copy_map(void) __naked {
    __asm
        push bc
        push de
        push hl
        ld de, #_map
        ld hl, #0x9c00
        ld a, (_ce_bg_map_front)
        or a
        jr z, 001$
        ld h, #0x98
001$:
        ld b, #18
002$:
        ld c, #10
003$:
        di
004$:
        ldh a, (#0x41)
        and #2
        jr nz, 004$
        ld a, (de)
        ld (hl+), a
        inc de
        ld a, (de)
        ld (hl+), a
        inc de
        ei
        dec c
        jr nz, 003$
        ld a, l
        add #12
        ld l, a
        jr nc, 005$
        inc h
005$:
        dec b
        jr nz, 002$
        pop hl
        pop de
        pop bc
        ret
    __endasm;
}
static void write_composite(void) __naked {
    __asm
        push bc
        push de
        push hl
        ld a, (_next_tile)
        ld b, a
        swap a
        and #0xf0
        ld l, a
        ld a, (_ce_bg_back)
        or l
        ld l, a
        ld a, b
        swap a
        and #15
        bit 7, b
        jr nz, 001$
        add #16
001$:
        add #128
        ld h, a
        ld de, #_tile_buffer
        ld b, #4
002$:
        ld a, (de)
        inc de
        ld c, a
        di
003$:
        ldh a, (#0x41)
        and #2
        jr nz, 003$
        ld a, c
        ld (hl+), a
        inc l
        ld (hl+), a
        inc l
        ei
        dec b
        jr nz, 002$
        pop hl
        pop de
        pop bc
        ret
    __endasm;
}
