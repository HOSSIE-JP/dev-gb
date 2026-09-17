#include "caravan.h"
#include "gbc-barrage.h"
uint16_t ce_cgb_cells[CE_MAX_BG_SHOTS];
uint16_t ce_cgb_compounds[CE_MAX_BG_SHOTS/2];
uint8_t ce_cgb_compounds_count;
uint8_t ce_cgb_cells_count, ce_cgb_dynamic_count;
static uint8_t remaining, first_dynamic;
static uint8_t *cursor;
static const uint8_t expand[16]={0,192,48,240,12,204,60,252,3,195,51,243,15,207,63,255};
/* Fixed ROM, fixed stack: neither dictionary switching nor interrupts can
 * evict executing code. One register save for the entire sparse traversal. */
void ce_cgb_resolve(void) NONBANKED __naked {
    __asm
        push bc
        push de
        push hl
        ldh a, (__current_bank)
        push af
        xor a
        ld (_ce_cgb_dynamic_count), a
        ld (_cursor), a
        ld a, #0xde
        ld (_cursor + 1), a
        ld a, (_ce_bg_map_front)
        or a
        ld a, #181
        jr nz, 001$
        add #24
001$:
        ld (_first_dynamic), a
        ld a, (_ce_cgb_compounds_count)
        or a
        jp z, 009$
        ld (_remaining), a
        ld hl, #_ce_cgb_compounds
002$:
        ld a, (hl+)
        ld c, a
        ld b, (hl)
        inc hl
        push hl
        push bc
        ld h, b
        ld l, c
        add hl, hl
        ld bc, #0xd500
        add hl, bc
        ld a, (hl+)
        ld e, a
        ld d, (hl)
        push de
        ld a, d
        swap a
        rrca
        and #7
        ld c, a
        ld b, #0
        ld l, a
        ld h, b
        add hl, hl
        add hl, hl
        add hl, bc
        ld bc, #_ce_cgb_lookup
        add hl, bc
        ld a, (hl+)
        ldh (__current_bank), a
        ld (#0x2000), a
        ld a, (hl+)
        ld c, a
        ld b, (hl)
        ld a, d
        and #31
        ld h, a
        ld l, e
        add hl, hl
        add hl, bc
        ld a, (hl+)
        cp #255
        jr z, 004$
        ld e, a
        ld d, (hl)
        pop hl
        jr 006$
004$:
        pop de
        ld a, (_ce_cgb_dynamic_count)
        cp #24
        jr c, 005$
        ; Guard corrupted/unexpected masks without overwriting front tiles.
        ld hl, #_ce_bg_tile_drops
        inc (hl)
        jr nz, 010$
        inc hl
        inc (hl)
010$:
        ld de, #0x0800
        jr 006$
005$:
        ld a, (_cursor)
        ld l, a
        ld a, (_cursor + 1)
        ld h, a
        ld a, e
        and #15
        call 008$
        ld a, e
        swap a
        and #15
        call 008$
        ld a, d
        and #15
        call 008$
        ld a, d
        swap a
        and #15
        call 008$
        ld a, l
        ld (_cursor), a
        ld a, h
        ld (_cursor + 1), a
        ld hl, #_ce_cgb_dynamic_count
        ld a, (hl)
        inc (hl)
        ld hl, #_first_dynamic
        add (hl)
        ld e, a
        ld d, #8
006$:
        pop bc
        ld hl, #0xd980
        add hl, bc
        ld (hl), e
        ld hl, #0xdbc0
        add hl, bc
        ld (hl), d
        pop hl
        ld a, (_remaining)
        dec a
        ld (_remaining), a
        jp nz, 002$
009$:
        pop af
        ldh (__current_bank), a
        ld (#0x2000), a
        pop hl
        pop de
        pop bc
        ret
008$:
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
