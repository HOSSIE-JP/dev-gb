/* Shared SM83 sprite emitter. Dense builds place this outside the scene bank. */
static uint8_t previous_slots;
static CE_Entity player_pose;
static CE_Entity shot_pose;
static CE_Entity *entity_pose;
static CE_Entity *pose;
static uint8_t pose_slot;
/* Indexed by stable entity slot, never by the changing OAM draw slot. */
static uint8_t animation_slot;
#ifdef CE_DENSE
#define CE_ANIMATION_SLOTS (CE_MAX_ENTITIES + 2u)
#else
#define CE_ANIMATION_SLOTS (CE_MAX_ENTITIES + 1u)
#endif
static uint16_t animation_age[CE_ANIMATION_SLOTS];
static uint8_t animation_asset[CE_ANIMATION_SLOTS];
static uint8_t animation_frame[CE_ANIMATION_SLOTS];
static uint8_t animation_left[CE_ANIMATION_SLOTS];

/* Non-reentrant, bank-local SM83 emitter. The ISR only copies completed OAM.
 * Preserve registers explicitly; no C arguments or return-value ABI assumptions. */
static volatile OAM_item_t *emit_out;
static uint8_t emit_left, emit_y, emit_tile, emit_prop, emit_columns, emit_rows;
static uint8_t emit_top, emit_bottom, emit_visible_y;
static const uint8_t *emit_colors;
static void prepare_sprite_color(void) __naked {
    __asm
        ld a, (_ce_color_sprites)
        or a
        ret z
        ld a, (_pose)
        ld l, a
        ld a, (_pose + 1)
        ld h, a
        inc hl
        inc hl
        ld l, (hl)
        ld b, l
        ld h, #0
        add hl, hl
        ld de, #_ce_color_asset_attrs
        add hl, de
        ld a, (hl+)
        ld e, a
        ld d, (hl)
        ld l, b
        ld h, #0
        add hl, hl
        add hl, hl
        add hl, hl
        add hl, hl
        ld bc, #(_ce_assets + 5)
        add hl, bc
        ld a, e
        sub (hl)
        ld (_emit_colors), a
        ld a, d
        sbc a, #0
        ld (_emit_colors + 1), a
        ret
    __endasm;
}
/* Read the current tile's color; preserve the OAM cursor and loop state. */
static void sprite_color(void) __naked {
    __asm
        push hl
        push de
        ld a, (_emit_tile)
        ld e, a
        ld d, #0
        ld a, (_emit_colors + 1)
        ld h, a
        ld a, (_emit_colors)
        ld l, a
        add hl, de
        ld a, (hl)
        pop de
        pop hl
        ret
    __endasm;
}
static void emit_oam(void) __naked {
    __asm
        push bc
        push de
        push hl
        ld a, (_emit_out)
        ld l, a
        ld a, (_emit_out + 1)
        ld h, a
        ld a, (_emit_y)
        ld d, a
        ld a, (_emit_rows)
        ld b, a
001$:
        ld a, (_emit_left)
        ld e, a
        ld a, (_emit_columns)
        ld c, a
        ld a, (_emit_top)
        cp d
        jr c, 002$
        jr nz, 003$
002$:
        ld a, (_emit_bottom)
        cp d
        jr c, 003$
        jr z, 003$
        ld a, d
        jr 004$
003$:
        xor a
004$:
        ld (_emit_visible_y), a
005$:
        ld a, e
        dec a
        cp #167
        jr nc, 006$
        ld a, (_emit_visible_y)
        jr 007$
006$:
        xor a
007$:
        ld (hl+), a
        ld a, e
        ld (hl+), a
        ld a, (_emit_tile)
        ld (hl+), a
        ld a, (_emit_colors + 1)
        or a
        ld a, (_emit_prop)
        call nz, _sprite_color
        ld (hl+), a
        ld a, (_emit_tile)
        inc a
#ifdef CE_DENSE
        inc a
#endif
        ld (_emit_tile), a
        ld a, e
        add #8
        ld e, a
        dec c
        jr nz, 005$
        ld a, d
#ifdef CE_DENSE
        add #16
#else
        add #8
#endif
        ld d, a
        dec b
        jr nz, 001$
        pop hl
        pop de
        pop bc
        ret
    __endasm;
}
/* Non-reentrant: no interrupt calls the renderer. Static scratch avoids
 * repeated stack-relative loads in the per-tile inner loop on SM83. */
static const CE_Asset *sprite_asset;
static uint8_t sprite_tiles;
/* Only animated assets pay for animation decoding. Keep the general authored
 * duration semantics, including nonuniform frames, in C. */
static void sprite_animation(void) {
    static uint16_t time; static uint8_t frame;
    if (sprite_asset->animation_shift != 255u) {
        frame = (pose->age >> sprite_asset->animation_shift) & (sprite_asset->frames - 1u);
        emit_tile = sprite_asset->first_tile + ((sprite_tiles == 1u ? frame : frame * sprite_tiles) * CE_SPRITE_STRIDE);
        return;
    }
    if (animation_asset[animation_slot] == pose->asset && animation_age[animation_slot] == pose->age) {
        frame = animation_frame[animation_slot];
    } else if (pose->age && animation_asset[animation_slot] == pose->asset && animation_age[animation_slot] + 1u == pose->age) {
        frame = animation_frame[animation_slot];
        if (!--animation_left[animation_slot]) {
            if (++frame == sprite_asset->frames) frame = 0;
            animation_left[animation_slot] = sprite_asset->durations[frame];
        }
    } else {
        /* Cold start, slot reuse, skipped player blink, and 16-bit age wrap.
         * This keeps arbitrary authored durations exact without division per
         * bullet per update. Age 0 must restart even after 65535. */
        frame = 0; time = pose->age % sprite_asset->duration;
        while (frame + 1u < sprite_asset->frames && time >= sprite_asset->durations[frame]) { time -= sprite_asset->durations[frame]; ++frame; }
        animation_left[animation_slot] = sprite_asset->durations[frame] - time;
    }
    animation_asset[animation_slot] = pose->asset;
    animation_age[animation_slot] = pose->age;
    animation_frame[animation_slot] = frame;
    emit_tile = sprite_asset->first_tile + ((sprite_tiles == 1u ? frame : frame * sprite_tiles) * CE_SPRITE_STRIDE);
}
/* Generic actor and multi-tile bullet setup. Preserve caller registers.
 * No ISR enters these static rendering contexts. */
static void actor_sprite(void) __naked {
    __asm
        push bc
        push de
        push hl
_ce_actor_sprite_inner::
        ld a, (_ce_is_cgb)
        or a
        call nz, _prepare_sprite_color
        ld a, (_pose)
        ld l, a
        ld a, (_pose + 1)
        ld h, a
        inc hl
        inc hl
        ld l, (hl)
        ld h, #0
        add hl, hl
        add hl, hl
        add hl, hl
        add hl, hl
        ld de, #_ce_assets
        add hl, de
        ld a, l
        ld (_sprite_asset), a
        ld a, h
        ld (_sprite_asset + 1), a
        ld a, (hl+)
        srl a
        srl a
        srl a
        ld (_emit_columns), a
        ld a, (hl+)
#ifdef CE_DENSE
        add #15
        srl a
#endif
        srl a
        srl a
        srl a
        ld (_emit_rows), a
        ld a, (hl+)
        ld b, a
        ld a, #8
        sub b
        ld (_emit_left), a
        ld a, (hl+)
        ld b, a
        ld a, #16
        sub b
        ld (_emit_y), a
        ld a, (hl+)
        ld b, a
        ld a, (_ce_is_cgb)
        or a
        jr nz, 020$
        ld b, #0
020$:
        ld a, b
        ld (_emit_prop), a
        ld a, (hl+)
        ld (_emit_tile), a
        ld a, (hl+)
        ld (_sprite_tiles), a
        ld a, (hl)
        cp #2
        call nc, _sprite_animation
        ld a, (_pose)
        ld l, a
        ld a, (_pose + 1)
        ld h, a
        ld de, #12
        add hl, de
        call 030$
        ld b, a
        ld a, (_emit_left)
        add b
        ld (_emit_left), a
        call 030$
        ld b, a
        ld a, (_emit_y)
        add b
        ld (_emit_y), a
        ld a, (_pose_slot)
        add a
        add a
        ld l, a
        ld h, #0
        ld de, #_shadow_OAM
        add hl, de
        ld a, l
        ld (_emit_out), a
        ld a, h
        ld (_emit_out + 1), a
        ld a, (_sprite_tiles)
        cp #1
        jr nz, 025$
        ld a, (_emit_left)
        dec a
        cp #167
        jr nc, 023$
        ld a, (_emit_top)
        ld b, a
        ld a, (_emit_y)
        cp b
        jr c, 023$
        ld b, a
        ld a, (_emit_bottom)
        cp b
        jr c, 023$
        jr z, 023$
        ld a, b
        jr 024$
023$:
        xor a
024$:
        ld (hl+), a
        ld a, (_emit_left)
        ld (hl+), a
        ld a, (_emit_tile)
        ld (hl+), a
        ld a, (_emit_colors + 1)
        or a
        ld a, (_emit_prop)
        call nz, _sprite_color
        ld (hl), a
        jr 026$
025$:
        call _emit_oam
026$:
        ld a, (_pose_slot)
        ld b, a
        ld a, (_sprite_tiles)
        add b
        ld (_pose_slot), a
        pop hl
        pop de
        pop bc
        ret
030$:
        ld a, (hl+)
        ld e, a
        ld a, (hl+)
        ld d, a
        bit 7, d
        jr z, 031$
        ld a, e
        add #15
        ld e, a
        ld a, d
        adc #0
        ld d, a
031$:
        ld a, d
        swap a
        and #0xf0
        ld b, a
        ld a, e
        swap a
        and #0x0f
        or b
        ret
    __endasm;
}
/* Scatter/gather preserves global entity ordering and only gathers live
 * bullets. Collision removal or slot reuse never publishes an old entry. */
static void shot_sprite(uint8_t slot) __naked {
    slot;
    __asm
        push bc
        push de
        push hl
_ce_shot_sprite_inner::
        ld l, a
        ld h, #0
        add hl, hl
        add hl, hl
        ld de, #_ce_shot_oam
        add hl, de
        ld d, h
        ld e, l
        ld a, (_pose_slot)
        ld l, a
        ld h, #0
        add hl, hl
        add hl, hl
        ld bc, #_shadow_OAM
        add hl, bc
        ld a, (de)
        inc de
        ld (hl+), a
        ld a, (de)
        inc de
        ld (hl+), a
        ld a, (de)
        inc de
        ld (hl+), a
        ld a, (de)
        ld (hl), a
        ld a, (_pose_slot)
        inc a
        ld (_pose_slot), a
        pop hl
        pop de
        pop bc
        ret
    __endasm;
}
static void complex_shot_sprite(uint8_t slot) {
    entity_pose = pose; shot_pose.asset = pose->asset;
    shot_pose.x = ce_shot_x[slot]; shot_pose.y = ce_shot_y[slot]; shot_pose.age = ce_shot_age[slot];
    pose = &shot_pose; actor_sprite(); pose = entity_pose;
}
static void sprite(void) __naked {
    __asm
        push bc
        push de
        push hl
        ld a, (_pose)
        ld l, a
        ld a, (_pose + 1)
        ld h, a
        ld a, (hl)
        cp #3
        jr c, 050$
        cp #5
        jr nc, 050$
        ld a, (_animation_slot)
        dec a
        ld c, a
        ld b, #0
        ld hl, #_ce_shot_simple
        add hl, bc
        ld a, (hl)
        or a
        ld a, c
        jp nz, _ce_shot_sprite_inner
        call _complex_shot_sprite
        pop hl
        pop de
        pop bc
        ret
050$:
        jp _ce_actor_sprite_inner
    __endasm;
}

#ifdef CE_DENSE
#include "dense-render.h"
#endif
CE_SPRITE_LINKAGE void ce_reset_sprites(void) CE_SPRITE_BANK {
    uint8_t i;previous_slots=0;for(i=0;i!=CE_ANIMATION_SLOTS;++i)animation_asset[i]=CE_NONE;
#ifdef CE_DENSE
    ce_dense_ready=0;
#endif
}
#ifdef CE_DENSE
CE_SPRITE_LINKAGE void ce_render_sprites(void) CE_SPRITE_BANK {
    uint8_t i;
#include "sprite-frame.h"
}
#endif
