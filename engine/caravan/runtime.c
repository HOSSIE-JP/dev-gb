#include "caravan.h"
#include "music.h"
#include "mainloop.h"
#include <string.h>
#include <stddef.h>

/* The SM83 kernels below consume these byte offsets (GBDK/SDCC, no padding). */
typedef char ce_entity_layout_check[(sizeof(CE_Entity) == 25u && offsetof(CE_Entity, x) == 12u && offsetof(CE_Entity, vx) == 20u) ? 1 : -1];
typedef char ce_hitbox_layout_check[(sizeof(CE_Hitbox) == 4u && sizeof(CE_Box) == 8u) ? 1 : -1];
typedef char ce_shot_layout_check[(CE_SHOT_CAPACITY <= 64u && sizeof(OAM_item_t) == 4u) ? 1 : -1];
#ifdef CE_CGB
typedef char ce_cgb_actor_bank_check[(CE_MAX_ENTITIES*sizeof(CE_Entity)<=0x300u && 0xD320u+34u*CE_SHOT_CAPACITY<=0xE000u) ? 1 : -1];
#endif

#ifndef CE_CGB
CE_Entity ce_entities[CE_MAX_ENTITIES];
#endif
CE_State ce_state;
/* Title-screen time bindings are legal before the first gameplay reset. */
const CE_Stage *ce_stage = ce_stages;
#ifdef CE_CGB
CE_Entity CE_AT(0xD000) ce_entities[CE_MAX_ENTITIES];
#endif
int16_t CE_AT(0xD300 + 0u * CE_SHOT_CAPACITY) ce_shot_x[CE_SHOT_CAPACITY];
int16_t CE_AT(0xD300 + 2u * CE_SHOT_CAPACITY) ce_shot_y[CE_SHOT_CAPACITY];
int16_t CE_AT(0xD300 + 4u * CE_SHOT_CAPACITY) ce_shot_vx[CE_SHOT_CAPACITY];
int16_t CE_AT(0xD300 + 6u * CE_SHOT_CAPACITY) ce_shot_vy[CE_SHOT_CAPACITY];
uint16_t CE_AT(0xD300 + 8u * CE_SHOT_CAPACITY) ce_shot_age[CE_SHOT_CAPACITY];
uint16_t CE_AT(0xD300 + 10u * CE_SHOT_CAPACITY) ce_shot_lifetime[CE_SHOT_CAPACITY];
int16_t CE_AT(0xD300 + 12u * CE_SHOT_CAPACITY) ce_shot_px[CE_SHOT_CAPACITY];
int16_t CE_AT(0xD300 + 14u * CE_SHOT_CAPACITY) ce_shot_py[CE_SHOT_CAPACITY];
OAM_item_t CE_AT(0xD300 + 16u * CE_SHOT_CAPACITY) ce_shot_oam[CE_SHOT_CAPACITY];
uint8_t CE_AT(0xD300 + 20u * CE_SHOT_CAPACITY) ce_shot_simple[CE_SHOT_CAPACITY];
static uint8_t CE_AT(0xD300 + 21u * CE_SHOT_CAPACITY) shot_ox[CE_SHOT_CAPACITY];
static uint8_t CE_AT(0xD300 + 22u * CE_SHOT_CAPACITY) shot_oy[CE_SHOT_CAPACITY];
static uint8_t CE_AT(0xD300 + 23u * CE_SHOT_CAPACITY) shot_range_index[CE_SHOT_CAPACITY];
#ifdef CE_DENSE
uint8_t CE_AT(0xD300 + 24u * CE_SHOT_CAPACITY) ce_shot_kind[CE_SHOT_CAPACITY];
uint8_t CE_AT(0xD300 + 25u * CE_SHOT_CAPACITY) ce_shot_asset[CE_SHOT_CAPACITY];
uint8_t CE_AT(0xD300 + 26u * CE_SHOT_CAPACITY) ce_shot_ref[CE_SHOT_CAPACITY];
uint8_t CE_AT(0xD300 + 27u * CE_SHOT_CAPACITY) ce_shot_sequence[CE_SHOT_CAPACITY];
uint8_t CE_AT(0xD300 + 28u * CE_SHOT_CAPACITY) ce_shot_damage[CE_SHOT_CAPACITY];
uint8_t CE_AT(0xD300 + 29u * CE_SHOT_CAPACITY) ce_shot_visible[CE_SHOT_CAPACITY];
uint8_t CE_AT(0xD300 + 30u * CE_SHOT_CAPACITY) ce_actor_visible[CE_MAX_ENTITIES];
const uint8_t ce_dense_shot_capacity=CE_SHOT_CAPACITY;
static uint8_t CE_AT(0xD320 + 30u * CE_SHOT_CAPACITY) shot_active[CE_SHOT_CAPACITY];
static CE_Box dense_shot_box;
#endif
static uint8_t CE_AT(0xD320 + 31u * CE_SHOT_CAPACITY) shot_frames[CE_SHOT_CAPACITY];
static uint8_t CE_AT(0xD320 + 32u * CE_SHOT_CAPACITY) shot_frame[CE_SHOT_CAPACITY];
static uint8_t CE_AT(0xD320 + 33u * CE_SHOT_CAPACITY) shot_left[CE_SHOT_CAPACITY];
static uint8_t shot_top, shot_bottom;
uint8_t ce_is_cgb, ce_scene, ce_pause, ce_active_screen;
uint8_t ce_used;
uint8_t ce_pool_counts[7], ce_pool_oam;
static uint8_t free_slots[CE_FREE_GROUPS];
uint16_t ce_scores[5], ce_respawn;
uint8_t ce_character, ce_player_asset, ce_player_weapon, ce_player_speed, ce_player_focus_weapon, ce_player_focus_speed;
uint8_t ce_bombs, ce_bomb_latch, ce_bomb_left, ce_bomb_image;
uint8_t ce_bomb_hits[CE_FREE_GROUPS];
static uint8_t deferred_finish;
uint16_t ce_music_time;
static uint8_t hit_sound_wait;
uint8_t ce_spell_sound_left;
uint8_t ce_spell_sound_step;
volatile uint8_t ce_trace[24];
uint16_t event_cursor;
CE_Event next_event;
static uint8_t active[CE_MAX_ENTITIES];
#ifndef CE_DENSE
static uint16_t next_attack[CE_ACTOR_SLOTS * 4u];
#endif
uint8_t ce_victory_frame;
uint8_t defeated_asset;
int16_t defeated_x, defeated_y;
#if !defined(CE_DENSE) || defined(CE_CGB)
static CE_Entity *targets[CE_MAX_ENEMIES + 1u];
static CE_Box *target_boxes[CE_MAX_ENEMIES + 1u];
static uint8_t target_count, target_slots[CE_MAX_ENEMIES + 1u];
#endif
static CE_Box boxes[CE_MAX_ENTITIES], player_box;
static CE_Entity player_collision_pose;
static CE_Box *box_a, *box_b;
/* Up to 64 source assets; the compiler emits only sprite assets here.
 * A bullet/player test needs only its center and these precomputed intervals,
 * not four freshly constructed 16-bit edges for every moving bullet. */
static uint8_t player_ranges[64u * 4u];
static int16_t player_delta_x, player_delta_y;
static void prepare_player_ranges(void) {
    uint8_t i; uint8_t *out = player_ranges;
    const CE_Hitbox *p = &ce_hitboxes[ce_player_asset], *b = ce_hitboxes;
    for (i = 0; i != ce_asset_count; ++i, ++b) {
        *out++ = 129 + p->x - b->x - b->w;
        *out++ = 127 + p->x + p->w - b->x;
        *out++ = 129 + p->y - b->y - b->h;
        *out++ = 127 + p->y + p->h - b->y;
    }
}
static void box(CE_Box *b, const CE_Entity *e);
static void prepare_shot(uint8_t slot);
void ce_init_shot_visual(uint8_t slot) NONBANKED {
    const CE_Asset *a = &ce_assets[SHOT_ASSET(slot)];
    shot_ox[slot] = 8u - a->ox; shot_oy[slot] = 16u - a->oy;
    ce_shot_oam[slot].tile = a->first_tile;
    ce_shot_oam[slot].prop = ce_is_cgb ? a->palette : 0u;
    if (ce_is_cgb && ce_color_sprites) ce_shot_oam[slot].prop = ce_color_asset_attrs[SHOT_ASSET(slot)][0];
    ce_shot_simple[slot] = a->tiles == 1u;
    shot_range_index[slot] = SHOT_ASSET(slot) * 4u;
    shot_frames[slot] = a->tiles == 1u ? a->frames : 1u;
    shot_frame[slot] = 0; shot_left[slot] = a->durations[0];
    prepare_shot(slot);
}
/* Bullet ages advance exactly once; unlike player blink there are no skipped
 * renders to decode. The 16-bit wrap must explicitly restart at frame zero. */
static void advance_shot_animation(uint8_t slot) {
    static uint8_t frame; static const CE_Asset *a;
    if (ce_shot_age[slot]) {
        if (--shot_left[slot]) return;
        frame = shot_frame[slot] + 1u;
        if (frame == shot_frames[slot]) frame = 0;
    } else frame = 0;
    a = &ce_assets[SHOT_ASSET(slot)];
    shot_frame[slot] = frame; shot_left[slot] = a->durations[frame];
    ce_shot_oam[slot].tile = a->first_tile + frame * CE_SPRITE_STRIDE;
    if (ce_is_cgb && ce_color_sprites) ce_shot_oam[slot].prop = ce_color_asset_attrs[SHOT_ASSET(slot)][frame * CE_SPRITE_STRIDE];
}
void ce_count_frame(void) NONBANKED {
    if ((ce_scene == 1u || ce_scene == 8u) && ce_battle_mode == 3u) {
        HIDE_WIN; LYC_REG = ce_hud_bottom ? 144u - ce_hud_height : ce_hud_height;
        SCX_REG = ce_hud_bottom ? ce_giant_x : 0;
        SCY_REG = ce_hud_bottom ? ce_giant_y : 192u; return;
    }
    LYC_REG = ce_hud_height;
    if ((ce_scene == 1u || ce_scene == 8u) && !CE_BG_MONO) SHOW_WIN;
}
/* A top-docked Window otherwise covers the entire playfield. */
void ce_hud_scanline(void) NONBANKED {
    if ((ce_scene == 1u || ce_scene == 8u) && ce_battle_mode == 3u) {
        SCX_REG = ce_hud_bottom ? 0 : ce_giant_x;
        SCY_REG = ce_hud_bottom ? 192u - (144u - ce_hud_height) : ce_giant_y; return;
    }
    if ((ce_scene == 1u || ce_scene == 8u) && !ce_hud_bottom) HIDE_WIN; }

void ce_copy(uint8_t *dest, const CE_Data *source, uint16_t offset, uint16_t length) NONBANKED {
    uint8_t bank = CURRENT_BANK, source_bank = source->bank;
    const uint8_t *data = source->data;
    SWITCH_ROM(source_bank);
    memcpy(dest, data + offset, length);
    SWITCH_ROM(bank);
}

uint8_t ce_read(const CE_Data *source, uint16_t offset) NONBANKED {
    uint8_t value, bank = CURRENT_BANK, source_bank = source->bank;
    const uint8_t *data = source->data;
    SWITCH_ROM(source_bank); value = data[offset]; SWITCH_ROM(bank);
    return value;
}
void ce_map_copy(uint8_t *dest, const CE_Data *data, uint16_t offset, uint8_t length) NONBANKED {
    uint8_t n;
    while (length) {
        n = (offset & 4095u) + length > 4096u ? 4096u - (offset & 4095u) : length;
        ce_copy(dest, &data[offset >> 12], offset & 4095u, n);
        dest += n; offset += n; length -= n;
    }
}
uint16_t ce_map_index(uint16_t x, uint16_t y) NONBANKED {
    const CE_Stage *s = ce_stage;
    return s->horizontal ? x * s->height + y : y * s->width + x;
}
void ce_reset(uint8_t stage, uint8_t new_game) NONBANKED {
    ce_bomb_image = 0; deferred_finish = 0;
    if (new_game) { ce_select_player(ce_character); ce_bombs=ce_bomb_stock; ce_bomb_left=0; ce_respawn = 0; memset(&ce_state, 0, sizeof(ce_state)); ce_state.lives = ce_player_lives; }
    ce_bomb_latch=1;
    ce_battle_mode = 0; ce_battle_asset = CE_NONE; ce_boss_invulnerable = 0; ce_transition_state = 0; ce_bg_clear();
    memset(ce_entities, 0, sizeof(ce_entities));
#ifdef CE_DENSE
    memset(ce_shot_kind, 0, sizeof(ce_shot_kind));
    memset(ce_shot_visible, 0, sizeof(ce_shot_visible));
    memset(ce_actor_visible, 0, sizeof(ce_actor_visible));
#endif
    ce_used = 0; memset(ce_pool_counts, 0, sizeof(ce_pool_counts));
    memset(free_slots, 255, sizeof(free_slots));
    free_slots[CE_FREE_GROUPS - 1u] = (CE_MAX_ENTITIES & 7u) ? (1u << (CE_MAX_ENTITIES & 7u)) - 1u : 255u;
    ce_pool_oam = ce_assets[ce_player_asset].tiles;
    shot_top = ce_hud_bottom ? 9u : ce_hud_height + 9u;
    shot_bottom = ce_hud_bottom ? 160u - ce_hud_height : 160u;
    ce_state.stage = stage; ce_stage = &ce_stages[stage]; ce_state.stage_tick = 0; ce_state.camera = ce_stages[stage].scroll_down ? ce_camera_limit() : 0;
    ce_terrain_reset();
    ce_stage_misses = 0; ce_state.scroll = ce_stages[stage].scroll; ce_state.boss_defeated = 0;
    ce_state.player_x = ce_player_start_x; ce_state.player_y = ce_player_start_y;
    ce_state.invulnerable = ce_respawn ? 0 : ce_player_invulnerability; event_cursor = 0; ce_read_event();
    ce_state.cooldown = ce_patterns[ce_player_weapon].delay; ce_state.player_sequence = 0;
    ce_state.weapon_mode = 0;
    prepare_player_ranges();
    ce_music_play(ce_stages[stage].music);
}
uint8_t allocate(uint8_t kind, uint8_t asset) {
#ifdef CE_DENSE
    uint8_t slot, end, first; CE_Entity *e;
    if (ce_pool_counts[kind] >= ce_entity_limits[kind]) {++ce_state.dropped;return CE_NONE;}
    first = kind==CE_ENEMY||kind==CE_BOSS?0u:kind==CE_FX?13u:17u;
    end = kind==CE_ENEMY||kind==CE_BOSS?13u:kind==CE_FX?17u:21u;
    for(slot=first;slot<end&&ce_entities[slot].kind;++slot){}
    if(slot==end){++ce_state.dropped;return CE_NONE;}
    e=&ce_entities[slot];memset(e,0,sizeof(*e));e->kind=kind;e->asset=asset;
    ce_actor_visible[slot]=0;ce_bomb_hits[slot>>3]&=~(1u<<(slot&7u));
    ++ce_pool_counts[kind];if(slot>=ce_used)ce_used=slot+1u;return slot;
#else
    uint8_t group, bit = 1u, slot, reserve = kind == CE_ITEM ? 0u : ce_entity_limits[CE_ITEM] - ce_pool_counts[CE_ITEM]; CE_Entity *e;
    /* Ordinary one-at-a-time allocation keeps the original short path. The
     * free bitmap enforces entity capacity; only atomic volleys need preflight. */
    if (ce_pool_oam + ce_assets[asset].tiles + reserve > 40u || ce_pool_counts[kind] >= ce_entity_limits[kind]) {
        ++ce_state.dropped; return CE_NONE;
    }
    for (group = 0; group != CE_FREE_GROUPS && !free_slots[group]; ++group) {}
    if (group == CE_FREE_GROUPS) { ++ce_state.dropped; return CE_NONE; }
    slot = group << 3;
    while (!(free_slots[group] & bit)) { bit <<= 1; ++slot; }
    free_slots[group] &= ~bit;
    /* Reused actor slots belong to a new target, even during the same bomb. */
    if (kind == CE_ENEMY || kind == CE_BOSS) ce_bomb_hits[group] &= ~bit;
    e = &ce_entities[slot]; memset(e, 0, sizeof(CE_Entity));
    e->kind = kind; e->asset = asset;
    ++ce_pool_counts[kind]; ce_pool_oam += ce_assets[asset].tiles;
    if (slot >= ce_used) ce_used = slot + 1u;
    return slot;
#endif
}
void release(uint8_t slot) {
    CE_Entity *e = &ce_entities[slot];
    if (!e->kind) return;
    --ce_pool_counts[e->kind];
#ifndef CE_DENSE
    ce_pool_oam -= ce_assets[e->asset].tiles;
#endif
    e->kind = 0; active[slot] = 0;
    free_slots[slot >> 3] |= 1u << (slot & 7u);
}
#ifdef CE_DENSE
uint8_t ce_allocate_shot(uint8_t kind,uint8_t asset) NONBANKED {
    uint8_t slot=kind==CE_PSHOT?0u:CE_MAX_PSHOTS, end=kind==CE_PSHOT?CE_MAX_PSHOTS:CE_SHOT_CAPACITY;
    if(ce_pool_counts[kind]>=ce_entity_limits[kind]){++ce_state.dropped;return CE_NONE;}
    for(;slot<end&&ce_shot_kind[slot];++slot){}
    if(slot==end){++ce_state.dropped;return CE_NONE;}
    ce_shot_kind[slot]=kind;ce_shot_asset[slot]=asset;ce_shot_visible[slot]=0;++ce_pool_counts[kind];return slot;
}
void ce_release_shot(uint8_t slot) NONBANKED {
    if(ce_shot_kind[slot])--ce_pool_counts[ce_shot_kind[slot]];
    ce_shot_kind[slot]=0;shot_active[slot]=0;ce_shot_visible[slot]=0;
}
#endif
void ce_clear_combat(uint8_t all) NONBANKED {
    uint8_t i;
    for (i = 0; i != ce_used; ++i) if (all || ce_entities[i].kind == CE_PSHOT || ce_entities[i].kind == CE_ESHOT) release(i);
#ifdef CE_DENSE
    for(i=0;i!=CE_SHOT_CAPACITY;++i)ce_release_shot(i);
#endif
    ce_bg_clear();
}
void explode(int16_t x, int16_t y) {
    uint8_t slot; CE_Entity *e;
    if (ce_explosion_asset == CE_NONE) return;
    slot = allocate(CE_FX, ce_explosion_asset); if (slot == CE_NONE) return;
    e = &ce_entities[slot]; e->x = x; e->y = y; e->lifetime = ce_explosion_duration;
}
uint8_t ce_aim(int16_t dx, int16_t dy) NONBANKED {
    uint8_t i, angle, best = 0;
    int16_t ax = dx < 0 ? -dx : dx, ay = dy < 0 ? -dy : dy;
    int16_t maximum = -1;
    static int16_t score[5];
    /* The 16 directions are four mirrored copies of these five candidates.
     * Shift/add coefficients preserve the exact old integer dot products. */
    score[0] = ay << 4;
    score[1] = (ax << 2) + (ax << 1) + (ay << 4) - ay;
    score[2] = ((ax + ay) << 3) + ((ax + ay) << 1) + ax + ay;
    score[3] = (ax << 4) - ax + (ay << 2) + (ay << 1);
    score[4] = ax << 4;
    for (i = 0; i != 5u; ++i) {
        angle = dx < 0 ? (dy > 0 ? 8u + i : (16u - i) & 15u) : (dy > 0 ? 8u - i : i);
        if (score[i] > maximum || (score[i] == maximum && angle < best)) { maximum = score[i]; best = angle; }
    }
    return best;
}
/* Main-loop only. SDCC SM83 call(1): destination DE, entity BC. The signed
 * divide must round towards zero, including negative fractional coordinates.
 * x/y offsets are signed bytes: adding 128 first converts them to 0..255.
 * Keep full 16-bit boxes; 8-bit wrapping would break offscreen collisions. */
static CE_Box *box_out;
static uint16_t box_left, box_top;
static void box(CE_Box *b, const CE_Entity *e) __naked {
    b; e;
    __asm
        push bc
        push de
        push hl
        ld a, e
        ld (_box_out), a
        ld a, d
        ld (_box_out + 1), a
        ld h, b
        ld l, c
        inc hl
        inc hl
        ld a, (hl)
        ld l, a
        ld h, #0
        add hl, hl
        add hl, hl
        ld de, #_ce_hitboxes
        add hl, de
        ld d, h
        ld e, l
        ld hl, #12
        add hl, bc
        call _ce_box_coordinate
        ld a, c
        ld (_box_left), a
        ld a, b
        ld (_box_left + 1), a
        call _ce_box_coordinate
        ld a, c
        ld (_box_top), a
        ld a, b
        ld (_box_top + 1), a
_ce_box_write::
        ld a, (_box_out)
        ld l, a
        ld a, (_box_out + 1)
        ld h, a
        ld a, (_box_left)
        ld (hl+), a
        ld a, (_box_left + 1)
        ld (hl+), a
        ld a, c
        ld (hl+), a
        ld a, b
        ld (hl+), a
        ld a, (de)
        inc de
        ld b, a
        ld a, (_box_left)
        add b
        ld (hl+), a
        ld a, (_box_left + 1)
        adc #0
        ld (hl+), a
        ld a, (de)
        ld b, a
        ld a, (_box_top)
        add b
        ld (hl+), a
        ld a, (_box_top + 1)
        adc #0
        ld (hl), a
        pop hl
        pop de
        pop bc
        ret
_ce_box_coordinate::
        ld a, (hl+)
        ld c, a
        ld a, (hl+)
        ld b, a
        bit 7, b
        jr z, 011$
        ld a, c
        add #15
        ld c, a
        ld a, b
        adc #0
        ld b, a
011$:
        sra b
        rr c
        sra b
        rr c
        sra b
        rr c
        sra b
        rr c
_ce_box_offset::
        ld a, (de)
        inc de
        add #128
        add c
        ld c, a
        ld a, b
        adc #0
        ld b, a
        ret
    __endasm;
}
static uint8_t overlap(void) __naked {
    __asm
        push bc
        push de
        push hl
        ld a, (_box_b)
        ld l, a
        ld a, (_box_b + 1)
        ld h, a
        ld bc, #6
        add hl, bc
        ld d, h
        ld e, l
        ld a, (_box_a)
        ld l, a
        ld a, (_box_a + 1)
        ld h, a
        inc hl
        inc hl
        call 040$
        jr nc, 043$
        ld bc, #4
        add hl, bc
        dec de
        dec de
        dec de
        dec de
        call 041$
        jr nc, 043$
        ld bc, #-6
        add hl, bc
        inc de
        inc de
        call 040$
        jr nc, 043$
        ld bc, #4
        add hl, bc
        dec de
        dec de
        dec de
        dec de
        call 041$
        ld a, #0
        rla
        jr 044$
043$:
        xor a
044$:
        pop hl
        pop de
        pop bc
        ret
040$:
        ld a, (de)
        inc de
        ld c, a
        ld a, (de)
        dec de
        ld b, a
        ld a, (hl+)
        sub c
        ld a, (hl-)
        sbc b
        ret
041$:
        ld a, (hl+)
        ld c, a
        ld a, (hl-)
        ld b, a
        ld a, (de)
        inc de
        sub c
        ld a, (de)
        dec de
        sbc b
        ret
    __endasm;
}
#include "shot-kernels.h"
#ifdef CE_DENSE
#define move_actor ce_move_actor
#define step_actor ce_step_actor
#else
#define CE_ACTOR_LINKAGE static
#define CE_ACTOR_BANK
#include "actor-step.h"
#endif
static void step_player(uint8_t input) {
    uint8_t top = ce_hud_bottom ? 0u : ce_hud_height;
    uint8_t mode = !ce_bomb_button && (input & J_B) && ce_player_focus_weapon != CE_NONE;
    uint8_t pattern = mode ? ce_player_focus_weapon : ce_player_weapon;
    uint8_t speed = mode ? ce_player_focus_speed : ce_player_speed;
    int16_t limit; const CE_Asset *player = &ce_assets[ce_player_asset];
    const CE_Pattern *weapon = &ce_patterns[pattern];
    if (ce_respawn) {
        if (!--ce_respawn) ce_state.invulnerable = ce_player_invulnerability;
        return;
    }
    if (ce_state.weapon_mode != mode) {
        ce_state.weapon_mode = mode; ce_state.cooldown = weapon->delay; ce_state.player_sequence = 0;
    }
    if (input & J_RIGHT) ce_state.player_x += speed;
    if (input & J_LEFT) ce_state.player_x -= speed;
    if (input & J_DOWN) ce_state.player_y += speed;
    if (input & J_UP) ce_state.player_y -= speed;
    limit = (int16_t)player->ox * 16; if (ce_state.player_x < limit) ce_state.player_x = limit;
    limit = (160 - player->width + player->ox) * 16; if (ce_state.player_x > limit) ce_state.player_x = limit;
    limit = (top + player->oy) * 16; if (ce_state.player_y < limit) ce_state.player_y = limit;
    limit = (top + 144u - ce_hud_height - player->height + player->oy) * 16u; if (ce_state.player_y > limit) ce_state.player_y = limit;
    if (!(input & (ce_bomb_button ? J_A : J_A | J_B))) { ce_state.cooldown = weapon->delay; ce_state.player_sequence = 0; }
    else if (ce_state.cooldown) --ce_state.cooldown;
    else if (!weapon->repeats || ce_state.player_sequence < weapon->repeats) {
        ce_shoot(pattern, ce_player_asset, ce_state.player_x, ce_state.player_y, 1, ce_state.player_sequence++);
        ce_state.cooldown = weapon->interval - 1u; ce_sound(0);
    }
    if (ce_state.invulnerable) --ce_state.invulnerable;
}
static uint8_t step_slot, step_count, step_walls;
static CE_Entity *step_entity;
static void step_nonbullet(uint8_t slot) {
    static CE_Entity *e;
    e = &ce_entities[slot];
    if (e->kind == CE_FX) { ++e->age; if (e->age >= e->lifetime) release(slot); }
    else if (e->kind == CE_ITEM) {
        move_actor(e, ce_items[e->ref].motion, e->age++); box(&boxes[slot], e);
        if (e->age >= e->lifetime) release(slot);
    }
    else { step_actor(e, slot); box(&boxes[slot], e); }
    if ((uint16_t)(e->x + 512) > 3584u || (uint16_t)(e->y + 512) > 3328u) release(slot);
}
#ifdef CE_DENSE
#include "dense-shots.h"
#else
static void step_shot_box(uint8_t slot) {
    static CE_Box *b;
    b = &boxes[slot]; box_out = b; shot_box(slot);
    if (step_walls && ce_terrain_collision(b, ce_entities[slot].damage, ce_entities[slot].kind == CE_PSHOT ? 1u : 2u)) release(slot);
}
/* Snapshot eligibility, visit the original global slots in order, then call
 * the actor path only for actors. Register save/restore is once per traversal,
 * not repeated for every bullet and its prepared sprite. */
static void step_entities(void) __naked {
    __asm
        push bc
        push de
        push hl
        ld a, (_ce_used)
        ld (_step_count), a
        or a
        jp z, 106$
        ld b, a
        ld de, #_active
        ld hl, #_ce_entities
100$:
        ld a, (hl)
        ld (de), a
        inc de
        ld a, l
        add #25
        ld l, a
        jr nc, 101$
        inc h
101$:
        dec b
        jr nz, 100$
        ld hl, #_ce_entities
        ld a, l
        ld (_step_entity), a
        ld a, h
        ld (_step_entity + 1), a
        xor a
        ld (_step_slot), a
102$:
        ld a, (_step_slot)
        ld e, a
        ld d, #0
        ld hl, #_active
        add hl, de
        ld a, (hl)
        or a
        jr z, 105$
        ld a, (_step_entity)
        ld l, a
        ld a, (_step_entity + 1)
        ld h, a
        ld a, (hl)
        cp #3
        jr c, 104$
        cp #5
        jr nc, 104$
        ld a, (_step_slot)
        call _ce_step_bullet_body
        or a
        jr z, 103$
        ld a, (_step_slot)
        call _release
        jr 105$
103$:
        ld a, (_step_walls)
        and #1
        jr nz, 107$
        ld a, (_step_entity)
        ld l, a
        ld a, (_step_entity + 1)
        ld h, a
        ld a, (hl)
        cp #3
        jr nz, 105$
107$:
        ld a, (_step_slot)
        call _step_shot_box
        jr 105$
104$:
        ld a, (_step_slot)
        call _step_nonbullet
105$:
        ld a, (_step_entity)
        add #25
        ld (_step_entity), a
        jr nc, 108$
        ld hl, #_step_entity + 1
        inc (hl)
108$:
        ld hl, #_step_slot
        inc (hl)
        ld a, (_step_count)
        cp (hl)
        jp nz, 102$
106$:
        pop hl
        pop de
        pop bc
        ret
    __endasm;
}
static void steer_sprite_shots(void) {
    uint8_t i, angle; const CE_Pattern *p;
    /* One eighth of slots per update; ordinary shots keep the ASM path. */
    for(i=ce_state.tick&7u;i<ce_used;i+=8u)if(ce_entities[i].kind==CE_ESHOT){
        p=&ce_patterns[ce_entities[i].ref];
        if(p->kind!=5u || ce_shot_age[i]>=p->guide_frames || ((ce_state.tick-i)&p->guide_mask))continue;
        angle=ce_home(ce_entities[i].sequence,ce_shot_x[i]/16,ce_shot_y[i]/16);ce_entities[i].sequence=angle;
        ce_shot_vx[i]=p->velocity[angle*2u];ce_shot_vy[i]=p->velocity[angle*2u+1u];
    }
}
static void collide_shots(void) {
    static uint8_t i, j; static CE_Entity *e, *target;
    if (!ce_pool_counts[CE_PSHOT] || !(ce_pool_counts[CE_ENEMY] | ce_pool_counts[CE_BOSS])) return;
    target_count = 0;
    for (i = 0, e = ce_entities; i != ce_used; ++i, ++e) if (e->kind == CE_ENEMY || e->kind == CE_BOSS) { targets[target_count] = e; target_slots[target_count] = i; target_boxes[target_count++] = &boxes[i]; }
    for (i = 0, e = ce_entities; i != ce_used; ++i, ++e) {
        if (e->kind != CE_PSHOT) continue;
        box_a = &boxes[i];
        for (j = 0; j != target_count; ++j) {
            /* Reject spatial misses before following the target entity pointer.
             * A previous hit may have released/reused that slot, so its kind
             * still has to be checked before applying damage. */
            box_b = target_boxes[j]; if (!overlap()) continue;
            target = targets[j]; if (target->kind != CE_ENEMY && target->kind != CE_BOSS) continue;
            if (target->kind == CE_BOSS && ce_boss_invulnerable) continue;
            release(i);
            ce_damage_actor(target_slots[j],e->damage);
            break;
        }
    }
}
#endif
static void collide_player(void) {
    static uint8_t i, hit; static CE_Entity *e;
    if (ce_respawn) return;
#ifdef CE_CGB
    /* Invulnerable bodies cannot change state. Items and sprite bullets still
     * require overlap checks (pickup / bullet retirement), even while immune. */
    if((ce_state.invulnerable || ce_bomb_image) && !ce_pool_counts[CE_ITEM] && !ce_pool_counts[CE_ESHOT])return;
#endif
    player_collision_pose.asset = ce_player_asset; player_collision_pose.x = ce_state.player_x; player_collision_pose.y = ce_state.player_y;
    box(&player_box, &player_collision_pose); box_a = &player_box;
    player_delta_x = 128 - ce_state.player_x / 16;
    player_delta_y = 128 - ce_state.player_y / 16;
    if (!ce_battle_mode && (ce_stage->has_walls || ce_stage->object_count) && ce_terrain_collision(box_a, 0, 0)) ce_hit_player();
    for (i = 0, e = ce_entities; i != ce_used; ++i, ++e) {
        if (!e->kind || e->kind == CE_PSHOT || e->kind == CE_FX) continue;
#ifdef CE_DENSE
        if(!ce_actor_visible[i] && !(e->kind==CE_BOSS && ce_battle_mode==3u))continue;
#endif
        if (e->kind == CE_ESHOT) hit = bullet_overlaps(i);
        else if (e->kind == CE_BOSS && ce_boss_bodies[e->ref].count) hit = ce_boss_contact(e, &player_box);
        else { if (e->kind == CE_ITEM) box(&boxes[i], e); box_b = &boxes[i]; hit = overlap(); }
        if (hit) { if (e->kind == CE_ITEM) ce_collect_item(i); else { ce_hit_player(); if (e->kind == CE_ESHOT) release(i); } }
    }
#ifdef CE_DENSE
    if(ce_pool_counts[CE_ESHOT])for(i=CE_MAX_PSHOTS;i!=CE_SHOT_CAPACITY;++i)if(ce_shot_kind[i] && ce_shot_visible[i] && bullet_overlaps(i)){ce_hit_player();ce_release_shot(i);}
#endif
}
void ce_step(uint8_t input) NONBANKED {
    uint8_t finish, bomb_pressed; const CE_Stage *stage = ce_stage;
    if (ce_state.result) return;
    ce_trace[22] = 1; /* Keep entity RAM and the public trace in the same snapshot. */
    if (ce_bomb_live && ce_bomb_left && !--ce_bomb_left && ce_bomb_image) {
        ce_bomb_image = 0; ce_load_stage();
    }
    if (ce_bomb_button) {
        bomb_pressed = (input & J_B) && !ce_bomb_latch;
        ce_bomb_latch = !!(input & J_B);
    } else {
        if (!(input & (J_A|J_B))) ce_bomb_latch = 0;
        bomb_pressed = (input & (J_A|J_B)) == (J_A|J_B) && !ce_bomb_latch;
    }
    if(bomb_pressed && ce_bombs && !ce_respawn && !ce_bomb_left){
        ce_bomb_latch=1;--ce_bombs;
        if(ce_state.invulnerable<90u)ce_state.invulnerable=90u;
        ce_bomb_apply();ce_bomb_effect();if (!ce_bomb_live) return;
    }
    step_walls = ce_battle_mode ? 0 : stage->has_walls | (stage->object_count ? 2u : 0u);
    if (ce_demo) ce_state.invulnerable = 2;
    step_player(input); if (CE_BG_ACTIVE && !ce_bomb_image) ce_bg_update();
    finish = ce_stage_events(); step_walls = ce_battle_mode ? 0 : stage->has_walls | (stage->object_count ? 2u : 0u);
    finish |= deferred_finish; deferred_finish = 0;
    if (ce_bomb_image) { deferred_finish = finish; finish = 0; }
    if(ce_pool_counts[CE_ESHOT])steer_sprite_shots();
    step_entities();
    if (ce_bomb_live && ce_bomb_left) ce_bomb_sweep();
#ifdef CE_DENSE
    ce_dense_plan();
#endif
    collide_shots(); collide_player();
    if (ce_bg_hit) ce_hit_player();
    if (!ce_bomb_image && ce_state.boss_defeated && ce_battle_mode && !stage->clear_boss) {
        ce_bg_clear(); ce_battle_mode = 0; ce_battle_asset = CE_NONE; ce_state.scroll = stage->scroll; ce_load_stage();
    }
    while (ce_used && !ce_entities[ce_used - 1u].kind) --ce_used;
    ++ce_state.tick; if (ce_state.stage_tick != 65535u) ++ce_state.stage_tick;
    if (!ce_bomb_image && !ce_state.result && stage->require_boss && !ce_state.boss_defeated && (finish || (ce_time_limit && ce_state.stage_tick >= stage->duration)))
        ce_state.result = 1;
    if (!ce_bomb_image && !ce_state.result && (finish || (ce_state.boss_defeated && stage->clear_boss) || (ce_time_limit && ce_state.stage_tick >= stage->duration))) {
        if (ce_demo) { ce_state.result = 2; return; }
        if (ce_state.boss_defeated && ce_boss_celebration) ce_celebrate_boss();
        else ce_sound(3);
        if (ce_state.boss_defeated) ce_victory_dialogue();
        ce_stage_complete();
    }
}
uint8_t ce_boss_hp(void) NONBANKED {
    uint8_t i; CE_Entity *e = ce_entities;
    for (i = ce_used; i; --i, ++e) if (e->kind == CE_BOSS) return e->hp;
    return 0;
}
void ce_trace_write(void) NONBANKED {
    uint8_t i, count = 0, hp = 0, phase = 0; CE_Entity *e = ce_entities;
    ce_trace[22] = 1; /* Diagnostic seqlock: host ignores an incomplete snapshot. */
    for (i = ce_used; i; --i, ++e) { if (e->kind) ++count; if (e->kind == CE_BOSS) { hp = e->hp; phase = e->phase; } }
#ifdef CE_DENSE
    count+=ce_pool_counts[CE_PSHOT]+ce_pool_counts[CE_ESHOT];
#endif
    ce_trace[0] = 'C'; ce_trace[1] = 'E'; ce_trace[2] = ce_state.tick; ce_trace[3] = ce_state.tick >> 8;
    ce_trace[4] = ce_state.stage; ce_trace[5] = ce_state.score; ce_trace[6] = ce_state.score >> 8;
    ce_trace[7] = ce_state.lives; ce_trace[8] = ce_state.player_x; ce_trace[9] = ce_state.player_x >> 8;
    ce_trace[10] = ce_state.player_y; ce_trace[11] = ce_state.player_y >> 8; ce_trace[12] = hp;
    ce_trace[13] = count; ce_trace[14] = ce_state.dropped; ce_trace[15] = ce_state.dropped >> 8;
    ce_trace[16] = ce_state.result; ce_trace[17] = ce_scene; ce_trace[18] = ce_state.stage_tick; ce_trace[19] = ce_state.stage_tick >> 8;
    ce_trace[20] = phase; ce_trace[21] = ce_bg_count; ce_trace[23] = ce_battle_mode;
    ce_trace[22] = 0;
}
void ce_sound(uint8_t effect) NONBANKED {
    if (ce_spell_sound_left && effect != 5u) { ce_spell_sound_left = 0; NR42_REG = 0; }
    if (effect == 6u) {
        NR10_REG = 0x16; NR11_REG = 0x80; NR12_REG = 0x92; NR13_REG = 0xa0; NR14_REG = 0x87;
    } else if (effect == 5u) {
        ce_spell_sound_left = 72; ce_spell_sound_step = 255; ce_spell_sound();
        /* A faint high-frequency breath, not a percussive crash. */
        NR41_REG = 0; NR42_REG = 0x23; NR43_REG = 0x15; NR44_REG = 0x80;
    } else if (effect == 4u) {
        if (hit_sound_wait) return;
        hit_sound_wait = 4;
        NR41_REG = 0x38; NR42_REG = 0xa1; NR43_REG = 0x19; NR44_REG = 0xc0;
    } else if (!effect) { NR10_REG = 0; NR11_REG = 0x80; NR12_REG = 0x42; NR13_REG = 0xc0; NR14_REG = 0x87; }
    else if (effect == 3u) { NR10_REG = 0x16; NR11_REG = 0x40; NR12_REG = 0xf3; NR13_REG = 0x70; NR14_REG = 0x87; }
    else { NR41_REG = effect == 1u ? 0x08 : 0x00; NR42_REG = effect == 1u ? 0x73 : 0xf4; NR43_REG = effect == 1u ? 0x35 : 0x65; NR44_REG = 0x80; }
}
void ce_audio_sync(void) NONBANKED {
    uint16_t now, elapsed;
    uint8_t input = joypad();
    if ((input & (J_START | J_SELECT | J_A | J_B)) == (J_START | J_SELECT | J_A | J_B)) {
        /* Restart crt0, including WRAM/ISR initialization; SRAM is untouched.
         * Consume the chord so it cannot skip logos or retrigger after boot. */
        DISPLAY_OFF; disable_interrupts(); TAC_REG = 0; NR52_REG = 0;
        while (joypad() & (J_START | J_SELECT | J_A | J_B)) {}
        if (ce_is_cgb) cpu_slow();
        reset();
    }
    if (ce_demo && input) ce_demo_abort = 1;
    CRITICAL { now = sys_time; }
    elapsed = now - ce_music_time; ce_music_time = now;
    hit_sound_wait = elapsed >= hit_sound_wait ? 0 : hit_sound_wait - elapsed;
    if (ce_spell_sound_left) {
        if (elapsed >= ce_spell_sound_left) {ce_spell_sound_left = 0; NR12_REG = 0; NR42_REG = 0;}
        else {ce_spell_sound_left -= elapsed; ce_spell_sound();}
    }
    ce_music_tick(elapsed > 255u ? 255u : (uint8_t)elapsed);
}
void ce_run(void) NONBANKED {
    ce_mainloop();
}
