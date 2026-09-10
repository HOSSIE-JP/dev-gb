/* Q12.4 motion and lifetime planes: one register save per traversal. */
static void update_all(void) __naked {
    __asm
        push bc
        push de
        push hl
        xor a
        ld (_slot), a
001$:
        ld a, (_slot)
        add a
        ld c, a
        ld b, #0
        ld hl, #_ce_bg_life
        add hl, bc
        ld a, (hl+)
        ld e, a
        ld a, (hl)
        or e
        jr z, 005$
        ld a, (hl)
        ld d, a
        dec de
        ld a, d
        ld (hl-), a
        ld (hl), e
        or e
        jr nz, 002$
        ld hl, #_ce_bg_count
        dec (hl)
        jr 005$
002$:
        ld hl, #_ce_bg_vx
        add hl, bc
        ld a, (hl+)
        ld e, a
        ld d, (hl)
        ld hl, #_ce_bg_x
        add hl, bc
        ld a, (hl)
        add e
        ld (hl+), a
        ld a, (hl)
        adc d
        ld (hl), a
        ld hl, #_ce_bg_vy
        add hl, bc
        ld a, (hl+)
        ld e, a
        ld d, (hl)
        ld hl, #_ce_bg_y
        add hl, bc
        ld a, (hl)
        add e
        ld (hl+), a
        ld a, (hl)
        adc d
        ld (hl), a
        call _draw_shot
005$:
        ld hl, #_slot
        inc (hl)
        ld a, (_ce_bg_limit)
        cp (hl)
        jp nz, 001$
        pop hl
        pop de
        pop bc
        ret
    __endasm;
}
