/* Private SM83 kernels, included by runtime.c after the SoA storage. SDCC
 * call(1): slot in A, boolean result in A. Main loop only. C wrappers preserve
 * BC/DE/HL; internal bodies clobber them and are called by the bulk traversal.
 * Planes use ordinary linker-managed WRAM, no absolute addresses or bank state. */
static uint8_t shot_slot, shot_sx, shot_sy;
static const uint8_t *shot_hit_range;

/* box_out is shared with the actor kernel; pixel coordinates are already
 * rounded. Reuse its offset/write tails, preserving all 16-bit edge values. */
static void shot_box(uint8_t slot) __naked {
    slot;
    __asm
        push bc
        push de
        push hl
        ld (_shot_slot), a
        ld e, a
        ld d, #0
        ld hl, #_shot_range_index
        add hl, de
        ld l, (hl)
        ld h, #0
        ld bc, #_ce_hitboxes
        add hl, bc
        ld d, h
        ld e, l
        ld a, (_shot_slot)
        add a
        ld c, a
        ld b, #0
        ld hl, #_ce_shot_px
        add hl, bc
        ld a, (hl+)
        ld c, a
        ld b, (hl)
        call _ce_box_offset
        ld a, c
        ld (_box_left), a
        ld a, b
        ld (_box_left + 1), a
        ld a, (_shot_slot)
        add a
        ld c, a
        ld b, #0
        ld hl, #_ce_shot_py
        add hl, bc
        ld a, (hl+)
        ld c, a
        ld b, (hl)
        call _ce_box_offset
        ld a, c
        ld (_box_top), a
        ld a, b
        ld (_box_top + 1), a
        jp _ce_box_write
    __endasm;
}

static void prepare_shot(uint8_t slot) __naked {
    slot;
    __asm
        push bc
        push de
        push hl
        call _ce_prepare_shot_body
        pop hl
        pop de
        pop bc
        ret
_ce_prepare_shot_body::
        ld (_shot_slot), a
        add a
        ld e, a
        ld d, #0
        ld hl, #_ce_shot_x
        add hl, de
        call 070$
        ld hl, #_ce_shot_px
        add hl, de
        ld a, c
        ld (hl+), a
        ld (hl), b
        srl e
        ld hl, #_shot_ox
        add hl, de
        ld a, (hl)
        add c
        ld (_shot_sx), a
        sla e
        ld hl, #_ce_shot_y
        add hl, de
        call 070$
        ld hl, #_ce_shot_py
        add hl, de
        ld a, c
        ld (hl+), a
        ld (hl), b
        srl e
        ld hl, #_shot_oy
        add hl, de
        ld a, (hl)
        add c
        ld (_shot_sy), a
        sla e
        sla e
        ld hl, #_ce_shot_oam
        add hl, de
        ld a, (_shot_sx)
        dec a
        cp #167
        jr nc, 072$
        ld a, (_shot_top)
        ld b, a
        ld a, (_shot_sy)
        cp b
        jr c, 072$
        ld b, a
        ld a, (_shot_bottom)
        cp b
        jr c, 072$
        jr z, 072$
        ld a, b
        jr 073$
072$:
        xor a
073$:
        ld (hl+), a
        ld a, (_shot_sx)
        ld (hl), a
        xor a
        ret
070$:
        ld a, (hl+)
        ld c, a
        ld b, (hl)
        bit 7, b
        jr z, 071$
        ld a, c
        add #15
        ld c, a
        ld a, b
        adc #0
        ld b, a
071$:
        sra b
        rr c
        sra b
        rr c
        sra b
        rr c
        sra b
        rr c
        ret
    __endasm;
}

static uint8_t step_bullet(uint8_t slot) __naked {
    slot;
    __asm
        push bc
        push de
        push hl
        call _ce_step_bullet_body
        pop hl
        pop de
        pop bc
        ret
_ce_step_bullet_body::
        ld (_shot_slot), a
        add a
        ld e, a
        ld d, #0
        ld hl, #_ce_shot_vx
        add hl, de
        ld a, (hl+)
        ld c, a
        ld b, (hl)
        ld hl, #_ce_shot_x
        add hl, de
        ld a, (hl)
        add c
        ld (hl+), a
        ld a, (hl)
        adc b
        ld (hl), a
        ld hl, #_ce_shot_vy
        add hl, de
        ld a, (hl+)
        ld c, a
        ld b, (hl)
        ld hl, #_ce_shot_y
        add hl, de
        ld a, (hl)
        add c
        ld (hl+), a
        ld a, (hl)
        adc b
        ld (hl), a
        ld hl, #_ce_shot_age
        add hl, de
        inc (hl)
        ld a, (hl+)
        ld c, a
        jr nz, 080$
        inc (hl)
080$:
        ld b, (hl)
        ld hl, #_ce_shot_lifetime
        add hl, de
        ld a, c
        sub (hl)
        inc hl
        ld a, b
        sbc (hl)
        jr nc, 083$
        ld hl, #_ce_shot_x
        add hl, de
        ld a, (hl+)
        ld b, a
        ld a, (hl)
        add #2
        cp #14
        jr c, 081$
        jr nz, 083$
        ld a, b
        or a
        jr nz, 083$
081$:
        ld hl, #_ce_shot_y
        add hl, de
        ld a, (hl+)
        ld b, a
        ld a, (hl)
        add #2
        cp #13
        jr c, 082$
        jr nz, 083$
        ld a, b
        or a
        jr nz, 083$
082$:
        srl e
        ld hl, #_shot_frames
        add hl, de
        ld a, (hl)
        cp #2
        jr c, 085$
        ld a, (_shot_slot)
        call _advance_shot_animation
085$:
        ld a, (_shot_slot)
        jp _ce_prepare_shot_body
083$:
        ld a, #1
084$:
        ret
    __endasm;
}

static uint8_t bullet_overlaps(uint8_t slot) __naked {
    slot;
    __asm
        push bc
        push de
        push hl
        ld e, a
        ld d, #0
        ld hl, #_shot_range_index
        add hl, de
        ld c, (hl)
        ld b, #0
        ld hl, #_player_ranges
        add hl, bc
        ld a, l
        ld (_shot_hit_range), a
        ld a, h
        ld (_shot_hit_range + 1), a
        sla e
        ld hl, #_ce_shot_px
        add hl, de
        ld a, (hl+)
        ld c, a
        ld b, (hl)
        ld a, (_player_delta_x)
        add c
        ld c, a
        ld a, (_player_delta_x + 1)
        adc b
        or a
        jr nz, 091$
        ld a, (_shot_hit_range)
        ld l, a
        ld a, (_shot_hit_range + 1)
        ld h, a
        ld a, c
        sub (hl)
        jr c, 091$
        inc hl
        ld a, (hl)
        sub c
        jr c, 091$
        ld hl, #_ce_shot_py
        add hl, de
        ld a, (hl+)
        ld c, a
        ld b, (hl)
        ld a, (_player_delta_y)
        add c
        ld c, a
        ld a, (_player_delta_y + 1)
        adc b
        or a
        jr nz, 091$
        ld a, (_shot_hit_range)
        ld l, a
        ld a, (_shot_hit_range + 1)
        ld h, a
        inc hl
        inc hl
        ld a, c
        sub (hl)
        jr c, 091$
        inc hl
        ld a, (hl)
        sub c
        ld a, #0
        rla
        xor #1
        jr 092$
091$:
        xor a
092$:
        pop hl
        pop de
        pop bc
        ret
    __endasm;
}
