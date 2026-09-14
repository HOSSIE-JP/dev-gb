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
        ld (_px), a
        ld hl, #_ce_bg_y
        add hl, bc
        inc hl
        ld a, (hl)
        ld (_py), a
        call _draw_xy
        pop hl
        pop de
        pop bc
        ret
_draw_local_xy:
        ld a, (_px)
        and #0xfe
        cp #160
        jp nc, _bg_xy_030
        ld (_px), a
        ld a, (_py)
        and #0xfe
        ld d, a
        ld a, (_top)
        cp d
        jr z, _bg_xy_106
        jp nc, _bg_xy_030
_bg_xy_106:
        ld a, (_bottom)
        dec a
        cp d
        jp c, _bg_xy_030
        jp z, _bg_xy_030
        ld a, d
        ld (_py), a
        jp _bg_xy_plot
_draw_xy:
        ld a, (_px)
        and #0xfe
        cp #160
        jp nc, _bg_xy_030
        ld (_px), a
        ld a, (_py)
        and #0xfe
        ld d, a
        ld a, (_top)
        cp d
        jr z, _bg_xy_006
        jp nc, _bg_xy_030
_bg_xy_006:
        ld a, (_bottom)
        dec a
        cp d
        jp c, _bg_xy_030
        jp z, _bg_xy_030
        ld a, d
        ld (_py), a
        ld a, (_player_top)
        ld d, a
        ld a, (_py)
        sub d
        ld d, a
        ld a, (_hit_height)
        cp d
        jr c, _bg_xy_010
        jr z, _bg_xy_010
        ld a, (_left)
        ld d, a
        ld a, (_px)
        sub d
        ld d, a
        ld a, (_hit_width)
        cp d
        jr c, _bg_xy_010
        jr z, _bg_xy_010
        ld a, (_ce_respawn)
        ld hl, #_ce_respawn + 1
        or (hl)
        jr nz, _bg_xy_010
        ld a, (_slot)
        ld l, a
        ld h, #0
        ld de, #_damage
        add hl, de
        ld a, (hl)
        ld (_ce_bg_hit), a
        jp _bg_xy_030
_bg_xy_010:
        ld a, (_ce_battle_mode)
        cp #3
        ret z
_bg_xy_plot:
        ld a, (_py)
        and #0xf8
        ld l, a
        ld h, #0
        ld e, a
        ld d, #0
        add hl, hl
        add hl, hl
        add hl, de
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
        ; Empty cells need only a map entry. Defer the occupancy mask until a
        ; second distinct bullet actually touches the same tile.
        srl h
        rr l
        ld bc, #_map
        add hl, bc
        ld a, (_px)
        and #6
        srl a
        ld d, a
        ld a, (_py)
        and #6
        add a
        or d
        ld e, a
        ld a, (hl)
        or a
        jr nz, _bg_xy_007
        ld a, (_hud_tiles)
        add e
        ld (hl), a
        jp _bg_xy_031
_bg_xy_007:
        cp #255
        jr z, _bg_xy_009
        ld d, a
        ld a, (_hud_tiles)
        ld b, a
        ld a, d
        sub b
        cp e
        jp z, _bg_xy_031
        cp #16
        jr nc, _bg_xy_008
        ld d, a
        ld a, (_static_tiles)
        cp #136
        ld a, d
        jr nz, _bg_xy_008
        ; Sorted pair index: 16 + sum(15-k, k<min) + max-min-1.
        ; Every two-position tile is resident on CGB when the HUD permits it.
        cp e
        jr c, _bg_xy_015
        ld a, e
        ld e, d
        ld d, a
_bg_xy_015:
        push hl
        ld l, d
        ld h, #0
        ld bc, #_pair_base
        add hl, bc
        ld a, (hl)
        add e
        add #15
        ld d, a
        ld a, (_hud_tiles)
        add d
        pop hl
        ld (hl), a
        jp _bg_xy_031
_bg_xy_008:
        ; Reconstruct a resident singleton/pair mask on its first composite.
        ld l, a
        ld h, #0
        add hl, hl
        ld bc, #_static_masks
        add hl, bc
        ld a, (hl+)
        ld c, a
        ld b, (hl)
        ld a, (_cell_index)
        ld l, a
        ld a, (_cell_index + 1)
        ld h, a
        ld de, #_cells
        add hl, de
        ld a, c
        ld (hl+), a
        ld (hl), b
_bg_xy_009:
        ld a, (_cell_index)
        ld l, a
        ld a, (_cell_index + 1)
        ld h, a
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
        ld bc, #_bg_xy_050
        add hl, bc
        ld a, (hl+)
        ld c, a
        ld b, (hl)
        pop hl
        ld a, (hl+)
        ld d, a
        ld a, (hl)
        or d
        jr z, _bg_xy_011
        ld a, (hl)
        cp b
        jr nz, _bg_xy_012
        ld a, d
        cp c
        jr nz, _bg_xy_012
_bg_xy_011:
        ld a, (_hud_tiles)
        add e
        jr _bg_xy_013
_bg_xy_012:
        ld a, #255
_bg_xy_013:
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
        jr nz, _bg_xy_014
        ld a, (hl)
        cp #255
        jr z, _bg_xy_014
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
_bg_xy_014:
        ld (hl), a
        jr _bg_xy_031
_bg_xy_030:
        call _retire
_bg_xy_031:
        ret
_bg_xy_050:
        .dw 1,2,4,8,16,32,64,128,256,512,1024,2048,4096,8192,16384,32768
    __endasm;
}
