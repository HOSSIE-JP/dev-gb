/* Exact local occupancy for the 3x3 player hitbox. At most four tiles.
 * Query scratch reuses the renderer's px/py/cell_index registers in WRAM. */
static uint16_t query_h, query_v;
static uint8_t query_hit;
static const uint16_t query_h_table[4]={0x3333u,0x6666u,0xccccu,0x8888u};
static const uint16_t query_v_table[4]={0x00ffu,0x0ff0u,0xff00u,0xf000u};
static uint8_t occupied_player(void) __naked {
    __asm
        push bc
        push de
        push hl
        xor a
        ld (_query_count), a
        ld (_query_hit), a
        ld a, (_ce_respawn)
        ld hl, #_ce_respawn + 1
        or (hl)
        jp nz, _bg_query_done
        ld a, (_ce_bg_count)
        or a
        jp z, _bg_query_done
        ld a, (_left)
        inc a
        and #0xfe
        ld (_px), a
        and #6
        ld e, a
        ld d, #0
        ld hl, #_query_h_table
        add hl, de
        ld a, (hl+)
        ld (_query_h), a
        ld a, (hl)
        ld (_query_h + 1), a
        ld a, (_player_top)
        inc a
        and #0xfe
        ld (_py), a
        and #6
        ld e, a
        ld hl, #_query_v_table
        add hl, de
        ld a, (hl+)
        ld (_query_v), a
        ld a, (hl)
        ld (_query_v + 1), a
        ld a, (_py)
        and #0xf8
        ld l, a
        ld h, #0
        ld e, a
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
        srl h
        rr l
        ld a, l
        ld (_cell_index), a
        ld c, a
        ld a, h
        ld (_cell_index + 1), a
        ld b, a
        ld a, (_query_v)
        ld hl, #_query_h
        and (hl)
        ld e, a
        ld a, (_query_v + 1)
        inc hl
        and (hl)
        ld d, a
        call _bg_query_probe
        ld a, (_px)
        and #6
        cp #6
        jr nz, _bg_query_y
        ld a, (_cell_index)
        ld c, a
        ld a, (_cell_index + 1)
        ld b, a
        inc bc
        ld a, (_query_v)
        and #0x11
        ld e, a
        ld a, (_query_v + 1)
        and #0x11
        ld d, a
        call _bg_query_probe
_bg_query_y:
        ld a, (_py)
        and #6
        cp #6
        jr nz, _bg_query_done
        ld a, (_cell_index)
        add #20
        ld c, a
        ld a, (_cell_index + 1)
        adc #0
        ld b, a
        ld a, (_query_h)
        and #15
        ld e, a
        ld d, #0
        call _bg_query_probe
        ld a, (_px)
        and #6
        cp #6
        jr nz, _bg_query_done
        ld a, (_cell_index)
        add #21
        ld c, a
        ld a, (_cell_index + 1)
        adc #0
        ld b, a
        ld de, #1
        call _bg_query_probe
_bg_query_done:
        ld a, (_query_hit)
        pop hl
        pop de
        pop bc
        ret
_bg_query_probe:
        ld a, (_query_count)
        add a
        ld l, a
        ld h, #0
        push de
        ld de, #_query_cells
        add hl, de
        ld a, c
        ld (hl+), a
        ld (hl), b
        ld hl, #_query_count
        inc (hl)
        pop de
        ld hl, #_map
        add hl, bc
        ld a, (hl)
        or a
        ret z
        cp #255
        jr z, _bg_query_compound
        ld hl, #_hud_tiles
        sub (hl)
        ld l, a
        ld h, #0
        add hl, hl
        ld bc, #_static_masks
        add hl, bc
        jr _bg_query_mask
_bg_query_compound:
        ld h, b
        ld l, c
        add hl, hl
        ld bc, #_cells
        add hl, bc
_bg_query_mask:
        ld a, (hl+)
        and e
        ld e, a
        ld a, (hl)
        and d
        or e
        ret z
        ld a, #1
        ld (_query_hit), a
        ret
    __endasm;
}
