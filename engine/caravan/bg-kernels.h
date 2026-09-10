/* Private SM83 writers. Only the main loop owns the inactive map/bitplane.
 * Two stores finish within the safe interval following a mode-0/1 poll. */
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