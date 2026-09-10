/* Allocation/culling/collision for the BG-only shot planes. */
static uint16_t cell_index;
static void draw_shot(void) __naked {
    __asm
        push bc
        push de
        push hl
        ld a, (_slot)
        add a
        ld c, a
        ld b, #0
        ld hl, #_ce_bg_x
        add hl, bc
        inc hl
        ld a, (hl)
        and #0xfe
        cp #160
        jp nc, 030$
        ld (_px), a
        ld hl, #_ce_bg_y
        add hl, bc
        inc hl
        ld a, (hl)
        and #0xfe
        ld d, a
        ld a, (_top)
        cp d
        jr z, 006$
        jp nc, 030$
006$:
        ld a, (_bottom)
        dec a
        cp d
        jp c, 030$
        jp z, 030$
        ld a, d
        ld (_py), a
        ld a, (_ce_respawn)
        ld hl, #_ce_respawn + 1
        or (hl)
        jr nz, 010$
        ld a, (_left)
        ld d, a
        ld a, (_px)
        cp d
        jr c, 010$
        ld d, a
        ld a, (_right)
        cp d
        jr c, 010$
        ld a, (_player_top)
        ld d, a
        ld a, (_py)
        cp d
        jr c, 010$
        ld d, a
        ld a, (_player_bottom)
        cp d
        jr c, 010$
        ld a, (_slot)
        ld l, a
        ld h, #0
        ld de, #_damage
        add hl, de
        ld a, (hl)
        ld (_ce_bg_hit), a
        jp 030$
010$:
        ld a, (_py)
        srl a
        srl a
        srl a
        ld l, a
        ld h, #0
        ld e, a
        ld d, #0
        add hl, hl
        add hl, hl
        add hl, de
        add hl, hl
        add hl, hl
        add hl, hl
        ld a, (_px)
        srl a
        srl a
        srl a
        add a
        ld e, a
        add hl, de
        ld a, l
        ld (_cell_index), a
        ld a, h
        ld (_cell_index + 1), a
        ld bc, #_cells
        add hl, bc
        push hl
        ld a, (_px)
        and #6
        srl a
        ld d, a
        ld a, (_py)
        and #6
        add a
        or d
        ld e, a
        ld l, a
        ld h, #0
        add hl, hl
        ld bc, #050$
        add hl, bc
        ld a, (hl+)
        ld c, a
        ld b, (hl)
        pop hl
        ld a, (hl+)
        ld d, a
        ld a, (hl)
        or d
        jr z, 011$
        ld a, (hl)
        cp b
        jr nz, 012$
        ld a, d
        cp c
        jr nz, 012$
011$:
        ld a, (_hud_tiles)
        add e
        jr 013$
012$:
        ld a, #255
013$:
        push af
        ld a, (hl)
        or b
        ld (hl-), a
        ld a, (hl)
        or c
        ld (hl), a
        ld a, (_cell_index)
        ld l, a
        ld a, (_cell_index + 1)
        ld h, a
        srl h
        rr l
        ld bc, #_map
        add hl, bc
        pop af
        cp #255
        jr nz, 014$
        ld a, (hl)
        cp #255
        jr z, 014$
        push hl
        ld hl, #_compound_count
        ld a, (hl)
        inc (hl)
        add a
        ld c, a
        ld b, #0
        ld hl, #_compound_cells
        add hl, bc
        ld a, (_cell_index)
        ld (hl+), a
        ld a, (_cell_index + 1)
        ld (hl), a
        pop hl
        ld a, #255
014$:
        ld (hl), a
        jr 031$
030$:
        call _retire
031$:
        pop hl
        pop de
        pop bc
        ret
050$:
        .dw 1,2,4,8,16,32,64,128,256,512,1024,2048,4096,8192,16384,32768
    __endasm;
}
