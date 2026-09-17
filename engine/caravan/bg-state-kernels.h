/* Allocation/culling/collision for the BG-only shot planes.
 * Private entry ABI: D=X, E=Y; clobbers AF/BC/DE/HL. The public C wrapper
 * preserves registers. Cell-index RAM is needed only for dynamic composites;
 * singleton/pair cells finish without spilling their index or coordinates. */
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
        ld d, a
        ld hl, #_ce_bg_y
        add hl, bc
        inc hl
        ld a, (hl)
        ld e, a
        call _draw_xy
        pop hl
        pop de
        pop bc
        ret
#if CE_GRAZE_ENABLED
_bg_graze_xy:
        ; D/E remain the displayed, quantized dot coordinates.
        ld a, (_ce_graze_active)
        or a
        ret z
        ld a, (_ce_graze_x)
        ld b, a
        ld a, d
        sub b
        ld b, a
        ld a, (_ce_graze_w)
        cp b
        ret c
        ret z
        ld a, (_ce_graze_y)
        ld c, a
        ld a, e
        sub c
        ld c, a
        ld a, (_ce_graze_h)
        cp c
        ret c
        ret z
        ld a, (_ce_graze_radius)
        ld l, a
        ld a, b
        cp l
        jr c, _bg_graze_near
        ld a, (_ce_graze_w)
        sub l
        cp b
        jr c, _bg_graze_near
        jr z, _bg_graze_near
        ld a, c
        cp l
        jr c, _bg_graze_near
        ld a, (_ce_graze_h)
        sub l
        cp c
        jr z, _bg_graze_near
        ret nc
_bg_graze_near:
        ld a, (_slot)
        and #7
        ld l, a
        ld h, #0
        ld bc, #_graze_bits
        add hl, bc
        ld b, (hl)
        ld a, (_slot)
        srl a
        srl a
        srl a
        ld l, a
        ld h, #0
        ld a, b
        ld bc, #_grazed
        add hl, bc
        ld b, a
        and (hl)
        ret nz
        ld a, b
        or (hl)
        ld (hl), a
        ld hl, #_ce_graze_pending
        inc (hl)
        ret
#endif
_draw_local_xy:
        ld a, d
        and #0xfe
        cp #CE_PLAY_WIDTH
        jp nc, _bg_xy_030
        ld d, a
        ld a, e
        and #0xfe
        ld e, a
        ld a, (_top)
        cp e
        jr z, _bg_xy_106
        jp nc, _bg_xy_030
_bg_xy_106:
        ld a, (_bottom)
        dec a
        cp e
        jp c, _bg_xy_030
        jp z, _bg_xy_030
        jp _bg_xy_plot
_draw_xy:
        ld a, d
        and #0xfe
        cp #CE_PLAY_WIDTH
        jp nc, _bg_xy_030
        ld d, a
        ld a, e
        and #0xfe
        ld e, a
        ld a, (_top)
        cp e
        jr z, _bg_xy_006
        jp nc, _bg_xy_030
_bg_xy_006:
        ld a, (_bottom)
        dec a
        cp e
        jp c, _bg_xy_030
        jp z, _bg_xy_030
        ld a, (_player_top)
        ld c, a
        ld a, e
        sub c
        ld c, a
        ld a, (_hit_height)
        cp c
        jr c, _bg_xy_010
        jr z, _bg_xy_010
        ld a, (_left)
        ld c, a
        ld a, d
        sub c
        ld c, a
        ld a, (_hit_width)
        cp c
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
#if CE_GRAZE_ENABLED
        call _bg_graze_xy
#endif
        ld a, (_ce_battle_mode)
        cp #3
        ret z
        jr _bg_xy_render
_bg_xy_plot:
#if CE_GRAZE_ENABLED
        call _bg_graze_xy
#endif
_bg_xy_render:
        ; Compute the sub-tile position once, while D/E still hold X/Y.
        ld a, d
        and #6
        srl a
        ld c, a
        ld a, e
        and #6
        add a
        or c
        ld c, a
        ld a, d
        srl a
        srl a
        srl a
        ld b, a
        ld a, e
        and #0xf8
        ld l, a
        ld h, #0
        ld e, a
        ld d, #0
        add hl, hl
        add hl, hl
        add hl, de
        ld a, b
        add a
        ld e, a
        add hl, de
        ; Empty cells need only a map entry. Defer the occupancy mask until a
        ; second distinct bullet actually touches the same tile.
        srl h
        rr l
        ld de, #_map
        add hl, de
        ld e, c
        ld a, (hl)
        or a
        jr nz, _bg_xy_007
        ld a, (_hud_tiles)
        add e
        ld (hl), a
        jp _bg_xy_031
_bg_xy_007:
        cp #255
        jp z, _bg_xy_existing
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
        ld d, a
        call _bg_xy_save_cell
        ld l, d
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
        push de
        ld de, #_cells
        add hl, de
        ld a, c
        ld (hl+), a
        ld (hl), b
        pop de
        jr _bg_xy_009
_bg_xy_existing:
        call _bg_xy_save_cell
_bg_xy_009:
        ld a, (_cell_index)
        ld l, a
        ld a, (_cell_index + 1)
        ld h, a
        ld bc, #_cells
        add hl, bc
        push hl
        ld l, e
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
_bg_xy_save_cell:
        ; HL is the map entry. DE (old tile / new dot) must survive.
        ld bc, #_map
        ld a, l
        sub c
        ld l, a
        ld a, h
        sbc b
        ld h, a
        add hl, hl
        ld a, l
        ld (_cell_index), a
        ld a, h
        ld (_cell_index + 1), a
        ret
_bg_xy_050:
        .dw 1,2,4,8,16,32,64,128,256,512,1024,2048,4096,8192,16384,32768
    __endasm;
}
