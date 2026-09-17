/* Whole-metasprite admission, identical conservative 8-line bands to the
 * preview/dual backend. Fixed temporaries avoid SDCC's repeated 16-bit spills. */
static uint8_t admit_asset, admit_width, admit_height, admit_ox, admit_oy, admit_tiles, admit_first;
static int16_t admit_x, admit_y;
static uint8_t admit_fast(void) __naked {
    __asm
        push bc
        push de
        push hl
        ld a, (_admit_asset)
        ld l, a
        ld h, #0
        add hl, hl
        add hl, hl
        add hl, hl
        add hl, hl
        ld de, #_ce_assets
        add hl, de
        ld a, (hl+)
        ld (_admit_width), a
        ld a, (hl+)
        add #15
        and #240
        ld (_admit_height), a
        ld a, (hl+)
        ld (_admit_ox), a
        ld a, (hl+)
        ld (_admit_oy), a
        inc hl
        inc hl
        ld a, (hl)
        ld (_admit_tiles), a
        ld hl, #_dense_slots
        add (hl)
        cp #41
        jp nc, _admit_reject
        ld a, (_admit_x)
        ld l, a
        ld a, (_admit_x + 1)
        ld h, a
        ld a, (_admit_ox)
        ld c, a
        call _admit_pixel
        ld a, h
        or a
        jr z, _admit_left_positive
        inc a
        jp nz, _admit_reject
        ld a, (_admit_width)
        add l
        jp nc, _admit_reject
        or a
        jp z, _admit_reject
        jr _admit_check_y
_admit_left_positive:
        ld a, l
        cp #160
        jp nc, _admit_reject
_admit_check_y:
        ld a, (_admit_y)
        ld l, a
        ld a, (_admit_y + 1)
        ld h, a
        ld a, (_admit_oy)
        ld c, a
        call _admit_pixel
        ld a, h
        or a
        jr z, _admit_top_positive
        inc a
        jp nz, _admit_reject
        ld a, (_admit_height)
        add l
        jp nc, _admit_reject
        or a
        jp z, _admit_reject
        ld l, a
        xor a
        ld (_admit_first), a
        ld a, l
        jr _admit_bottom
_admit_top_positive:
        ld a, l
        cp #144
        jp nc, _admit_reject
        srl a
        srl a
        srl a
        ld (_admit_first), a
        ld a, (_admit_height)
        add l
        jr nc, _admit_bottom
        ld a, #144
_admit_bottom:
        cp #145
        jr c, _admit_rows
        ld a, #144
_admit_rows:
        add #7
        srl a
        srl a
        srl a
        ld hl, #_admit_first
        sub (hl)
        ld b, a
        ld a, (hl)
        ld e, a
        ld d, #0
        ld hl, #_dense_lines
        add hl, de
        ld a, (_admit_width)
        srl a
        srl a
        srl a
        ld c, a
        push hl
        push bc
_admit_check:
        ld a, (hl+)
        add c
        cp #11
        jr nc, _admit_rows_reject
        dec b
        jr nz, _admit_check
        pop bc
        pop hl
_admit_commit:
        ld a, (hl)
        add c
        ld (hl+), a
        dec b
        jr nz, _admit_commit
        ld a, (_admit_tiles)
        ld hl, #_dense_slots
        add (hl)
        ld (hl), a
        pop hl
        pop de
        pop bc
        ld a, #1
        ret
_admit_rows_reject:
        pop bc
        pop hl
_admit_reject:
        pop hl
        pop de
        pop bc
        xor a
        ret
_admit_pixel:
        ; Signed Q4 truncation toward zero, including off-screen negatives.
        bit 7, h
        jr z, _admit_shift
        ld de, #15
        add hl, de
_admit_shift:
        .rept 4
        sra h
        rr l
        .endm
        ld a, l
        sub c
        ld l, a
        ld a, h
        sbc #0
        ld h, a
        ret
    __endasm;
}
