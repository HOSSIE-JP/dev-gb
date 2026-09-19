#include "caravan.h"
#if CE_CGB_ONLY
#pragma bank 3
#else
#pragma bank 255
#endif
#include "caravan.h"
#include <stddef.h>

typedef char ce_sprite_layout_check[(sizeof(CE_Asset) == 16u && offsetof(CE_Asset, first_tile) == 5u && offsetof(CE_Asset, frames) == 7u && offsetof(CE_Entity, age) == 6u && offsetof(CE_Entity, x) == 12u) ? 1 : -1];
static uint8_t previous_slots;
/* Reset-only setup need not occupy the hot fixed ROM bank. */
void ce_prepare_player_ranges(void) BANKED {
    uint8_t i; uint8_t *out=ce_player_ranges;
    const CE_Hitbox *p=&ce_hitboxes[ce_player_asset],*b=ce_hitboxes;
    for(i=0;i!=ce_asset_count;++i,++b){
        *out++=129+p->x-b->x-b->w;
        *out++=127+p->x+p->w-b->x;
        *out++=129+p->y-b->y-b->h;
        *out++=127+p->y+p->h-b->y;
    }
}
CE_Entity ce_player_pose;
#define player_pose ce_player_pose
static CE_Entity shot_pose;
static CE_Entity *entity_pose;
static CE_Entity *pose;
static uint8_t pose_slot;
/* Indexed by stable entity slot, never by the changing OAM draw slot. */
static uint8_t animation_slot;
static uint16_t CE_WRAM(0xdba0) animation_age[CE_MAX_ENTITIES + 1u];
static uint8_t CE_WRAM(0xdbf0) animation_asset[CE_MAX_ENTITIES + 1u];
static uint8_t CE_WRAM(0xdc20) animation_frame[CE_MAX_ENTITIES + 1u];
static uint8_t CE_WRAM(0xdc50) animation_left[CE_MAX_ENTITIES + 1u];

/* Non-reentrant, bank-local SM83 emitter. The ISR only copies completed OAM.
 * Preserve registers explicitly; no C arguments or return-value ABI assumptions. */
static volatile OAM_item_t *emit_out;
static uint8_t emit_left, emit_y, emit_tile, emit_prop, emit_columns, emit_rows;
static uint8_t emit_top, emit_bottom, emit_visible_y;
static const uint8_t *emit_colors;
#if !CE_CGB_ONLY
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
        cp #CE_SPRITE_X_LIMIT
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
        add #CE_OBJ_TILES
        ld (_emit_tile), a
        ld a, e
        add #8
        ld e, a
        dec c
        jr nz, 005$
        ld a, d
        add #CE_OBJ_HEIGHT
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
#endif
static const CE_Asset *sprite_asset;
#if CE_CGB_ONLY
static uint8_t emit_frame;
#endif
static uint8_t sprite_tiles;
/* Only animated assets pay for animation decoding. Keep the general authored
 * duration semantics, including nonuniform frames, in C. */
static void sprite_animation(void) {
    static uint16_t time; static uint8_t frame;
#if CE_CGB_ONLY
    if(sprite_asset->animation_shift==3u && sprite_asset->frames<=32u){emit_frame=((uint8_t)pose->age>>3)&(sprite_asset->frames-1u);return;}
    if(sprite_asset->animation_shift==4u && sprite_asset->frames<=16u){emit_frame=((uint8_t)pose->age>>4)&(sprite_asset->frames-1u);return;}
#endif
    #if !CE_CGB_ONLY
    if (sprite_asset->animation_shift != 255u) {
        frame = (pose->age >> sprite_asset->animation_shift) & (sprite_asset->frames - 1u);
        emit_tile = sprite_asset->first_tile + (sprite_tiles == 1u ? frame : frame * sprite_tiles);
        return;
    }
    #endif
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
#if CE_CGB_ONLY
    emit_frame=frame;
#else
    emit_tile = sprite_asset->first_tile + (sprite_tiles == 1u ? frame : frame * sprite_tiles);
#endif
}
/* Generic actor and multi-tile bullet setup. Preserve caller registers.
 * No ISR enters these static rendering contexts. */
#if CE_CGB_ONLY
#include "cgb-oam.h"
#else
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
#if CE_OBJ_16
        add #8
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
        cp #CE_OBJ_TILES
        jr nz, 025$
        ld a, (_emit_left)
        dec a
        cp #CE_SPRITE_X_LIMIT
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
#if CE_OBJ_16
        srl a
#endif
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
#endif
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
/* A static 8x16 laser already has a prepared first OAM component. Avoid
 * rebuilding an actor pose, looking up animation and running a metasprite
 * loop for every laser. The second tile keeps its own CGB palette. */
static void tall_shot_sprite(uint8_t slot) {
    const CE_Asset *a=&ce_assets[pose->asset];
    uint8_t x=ce_shot_oam[slot].x,y=(uint8_t)ce_shot_py[slot]+24u-a->oy;
    shot_sprite(slot);
    shadow_OAM[pose_slot].y=(uint8_t)(x-1u)<CE_SPRITE_X_LIMIT && y>=emit_top && y<emit_bottom?y:0;
    shadow_OAM[pose_slot].x=x;
    shadow_OAM[pose_slot].tile=ce_shot_oam[slot].tile+1u;
    shadow_OAM[pose_slot].prop=ce_is_cgb&&ce_color_sprites?ce_color_asset_attrs[pose->asset][1]:ce_shot_oam[slot].prop;
    ++pose_slot;
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
        cp #2
        jr z, 051$
        or a
        ld a, c
        jp nz, _ce_shot_sprite_inner
        call _complex_shot_sprite
        jr 052$
051$:
        ld a, c
        call _tall_shot_sprite
052$:
        pop hl
        pop de
        pop bc
        ret
050$:
        jp _ce_actor_sprite_inner
    __endasm;
}

void ce_hide_sprites(void) BANKED {
    uint8_t i;previous_slots=0;
    for(i=0;i!=40u;++i)hide_sprite(i);
    for(i=0;i!=CE_MAX_ENTITIES+1u;++i)animation_asset[i]=CE_NONE;
}
void ce_draw_sprites(void) BANKED {
    uint8_t i;
    pose_slot = 0;
    emit_top = ce_hud_bottom ? 17u - CE_OBJ_HEIGHT : ce_hud_height + 17u - CE_OBJ_HEIGHT;
    emit_bottom = ce_hud_bottom ? 160u - ce_hud_height : 160u;
    DISABLE_OAM_DMA;
    if(ce_focus_enabled && ce_state.weapon_mode && !ce_respawn){
        const CE_Hitbox *hit=&ce_hitboxes[ce_player_asset];
        /* Match the player's 8px component X positions. DMG sorts by X before
         * OAM order; a centered single sprite would be hidden by the player. */
        shadow_OAM[0].x=ce_state.player_x/16+8+ce_focus_offsets[ce_character];
        shadow_OAM[0].y=ce_state.player_y/16+16+hit->y+(hit->h>>1)-3;
        shadow_OAM[0].tile=ce_focus_tile+ce_character*(2u*CE_OBJ_TILES);shadow_OAM[0].prop=0;
        shadow_OAM[1]=shadow_OAM[0];shadow_OAM[1].x+=8u;shadow_OAM[1].tile+=CE_OBJ_TILES;
        pose_slot=2;
    }
    if (!ce_respawn && (ce_bomb_left || !ce_state.invulnerable || !(ce_state.invulnerable & 4u))) {
        player_pose.asset = ce_barrier && ce_barrier_asset != CE_NONE ? ce_barrier_asset : ce_player_asset; player_pose.x = ce_state.player_x;
        player_pose.y = ce_state.player_y; player_pose.age = ce_state.tick;
        animation_slot = 0; pose = &player_pose; sprite();
#if CE_GRAZE_ENABLED
        if (ce_graze_flash) ce_graze_oam(pose_slot);
#endif
    }
#if CE_CGB_ONLY
    for(i=0;i!=ce_used;++i){
        animation_slot=i+1u;pose=&CE_ENTITY(i);
        if(pose->kind && !(pose->kind==CE_BOSS && (ce_transition_state==1u || ce_battle_mode==3u)))sprite();
    }
#else
    if (ce_transition_state == 1u) {
        /* A single break burst replaces the boss briefly, so its smaller sprite
         * cannot be occluded by the boss's earlier OAM entries on DMG or CGB. */
        for (i = ce_used, animation_slot = 1, pose = ce_entities; i; --i, ++pose, ++animation_slot)
            if (pose->kind && pose->kind != CE_BOSS) sprite();
    } else for (i = ce_used, animation_slot = 1, pose = ce_entities; i; --i, ++pose, ++animation_slot) if (pose->kind && !(ce_battle_mode == 3u && pose->kind == CE_BOSS)) sprite();
#endif
#if CE_OBJ_16
    if(ce_beam_pattern!=CE_NONE && !ce_respawn && !ce_transition_state && !ce_state.result){
        int16_t y=ce_state.player_y/16-8;
        uint8_t x=ce_state.player_x/16+4u;
        uint8_t tile=ce_beam_tile+((ce_state.tick&1u)?2u:0u);
        /* Actors were admitted with nine slots reserved. The repeated 8x16
         * strip is clipped by the LCD at the top; its foot ends at the muzzle.
         * A full-length core survives both animation frames. */
        while(y>(ce_hud_bottom?0:ce_hud_height) && pose_slot<40u){
            shadow_OAM[pose_slot].y=y;shadow_OAM[pose_slot].x=x;
            shadow_OAM[pose_slot].tile=tile;shadow_OAM[pose_slot].prop=0;
            ++pose_slot;y-=16;
        }
    }
#endif
    /* Do not DMA a partially written metasprite list. */
    i = pose_slot;
    while (pose_slot < previous_slots) shadow_OAM[pose_slot++].y = 0;
    previous_slots = i;
    if (ce_battle_mode >= 2u) for (i = 0; i != previous_slots; ++i) shadow_OAM[i].tile -= 128u;
}
