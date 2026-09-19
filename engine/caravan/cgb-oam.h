/* ROM bank 3 holds the generated, color-resolved frame templates and this
 * renderer. No data-bank switch or per-component palette lookup is needed. */
extern const uint8_t * const * const ce_oam_templates[];
static const uint8_t *oam_template;
static uint8_t oam_count, oam_x, oam_y, oam_visible;
static void cgb_emit_template(void) __naked {
    __asm
        push bc
        push de
        push hl
        ld a, (_oam_template)
        ld e, a
        ld a, (_oam_template + 1)
        ld d, a
        ld a, (_emit_out)
        ld l, a
        ld a, (_emit_out + 1)
        ld h, a
        ld a, (_oam_count)
        ld b, a
001$:
        ld a, (_oam_y)
        ld c, a
        ld a, (de)
        inc de
        add c
        ld c, a
        ld a, (_emit_top)
        cp c
        jr c, 002$
        jr nz, 003$
002$:
        ld a, (_emit_bottom)
        cp c
        jr c, 003$
        jr z, 003$
        ld a, c
        jr 004$
003$:
        xor a
004$:
        ld (_oam_visible), a
        ld a, (_oam_x)
        ld c, a
        ld a, (de)
        inc de
        add c
        ld c, a
        dec a
        cp #CE_SPRITE_X_LIMIT
        ld a, #0
        jr nc, 005$
        ld a, (_oam_visible)
005$:
        ld (hl+), a
        ld a, c
        ld (hl+), a
        ld a, (de)
        inc de
        ld (hl+), a
        ld a, (de)
        inc de
        ld (hl+), a
        dec b
        jr nz, 001$
        pop hl
        pop de
        pop bc
        ret
    __endasm;
}
static void cgb_actor_sprite(void) {
    sprite_asset=&ce_assets[pose->asset];
    sprite_tiles=sprite_asset->tiles;
    emit_frame=0;
    if(sprite_asset->frames>1u)sprite_animation();
    oam_template=ce_oam_templates[pose->asset][emit_frame];
    oam_count=sprite_tiles>>CE_OBJ_16;
    oam_x=pose->x/16; oam_y=pose->y/16;
    emit_out=&shadow_OAM[pose_slot];
    cgb_emit_template();
    pose_slot+=oam_count;
}
/* sprite() shares this entry after preserving the same three registers. */
static void actor_sprite(void) __naked {
    __asm
        push bc
        push de
        push hl
_ce_actor_sprite_inner::
        call _cgb_actor_sprite
        pop hl
        pop de
        pop bc
        ret
    __endasm;
}
