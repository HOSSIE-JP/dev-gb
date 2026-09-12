#pragma bank 1
#include "caravan.h"
#include <stddef.h>

typedef char ce_sprite_layout_check[(sizeof(CE_Asset) == 16u && offsetof(CE_Asset, first_tile) == 5u && offsetof(CE_Asset, frames) == 7u && offsetof(CE_Entity, age) == 6u && offsetof(CE_Entity, x) == 12u) ? 1 : -1];

static uint8_t buffer[128];
static uint16_t previous_row;
static uint16_t hud_values[32];
static uint8_t hud_valid, previous_slots, parallax_phase;
static CE_Entity player_pose;
static CE_Entity shot_pose;
static CE_Entity *entity_pose;
static CE_Entity *pose;
static uint8_t pose_slot;
/* Indexed by stable entity slot, never by the changing OAM draw slot. */
static uint8_t animation_slot;
static uint16_t animation_age[CE_MAX_ENTITIES + 1u];
static uint8_t animation_asset[CE_MAX_ENTITIES + 1u];
static uint8_t animation_frame[CE_MAX_ENTITIES + 1u];
static uint8_t animation_left[CE_MAX_ENTITIES + 1u];

uint8_t ce_fade_level;
static palette_color_t fade_colors[32];
static void palettes(void) {
    uint8_t i, shade, reg = 0, factor = 4u - ce_fade_level;
    uint16_t rgb;
    for (i = 0; i != 4u; ++i) {
        shade = ((ce_dmg_palette >> (i * 2u)) & 3u) + ce_fade_level;
        if (shade > 3u) shade = 3u;
        reg |= shade << (i * 2u);
    }
    BGP_REG = OBP0_REG = OBP1_REG = reg;
    if (ce_is_cgb) {
        for (i = 0; i != ce_palette_count * 4u; ++i) {
            rgb = ce_palettes[i];
            fade_colors[i] = (((rgb & 31u) * factor) >> 2) |
                (((((rgb >> 5) & 31u) * factor) >> 2) << 5) |
                (((((rgb >> 10) & 31u) * factor) >> 2) << 10);
        }
        set_bkg_palette(0, ce_palette_count, fade_colors);
        set_sprite_palette(0, ce_palette_count, fade_colors);
    }
    if (ce_active_screen == 4u && ce_battle_mode == 2u) ce_bg_palette();
}
void ce_set_fade(uint8_t level) BANKED { ce_fade_level = level; palettes(); }
void ce_fade(uint8_t out) BANKED {
    uint8_t frame;
    if (!ce_stage_fade) return;
    for (frame = 0; frame != 24u; ++frame) {
        vsync();
        if (!(frame % 6u)) {
            ce_fade_level = out ? 1u + frame / 6u : 3u - frame / 6u;
            palettes();
        }
        ce_audio_sync();
    }
}
static void tiles(const CE_Data *data, uint8_t first, uint8_t count, uint8_t sprite) {
    uint8_t n; uint16_t offset = 0;
    while (count) {
        n = count > 8u ? 8u : count; ce_copy(buffer, data, offset, (uint16_t)n * 16u);
        if (sprite) set_sprite_data(first, n, buffer); else set_bkg_data(first, n, buffer);
        first += n; count -= n; offset += (uint16_t)n * 16u;
        if (ce_scene == 12u) ce_logo_skip |= joypad();
    }
}
static void hide_all(void) {
    uint8_t i; previous_slots = 0; hud_valid = 0;
    for (i = 0; i != 40u; ++i) hide_sprite(i);
    for (i = 0; i != CE_MAX_ENTITIES + 1u; ++i) animation_asset[i] = CE_NONE;
}
static void screen_map(uint8_t index, uint8_t window) {
    const CE_Screen *s = &ce_screens[index]; uint8_t row, n, height = window ? ce_hud_height >> 3 : 18u;
    for (row = 0; row != height; ++row) {
        if (ce_scene == 12u) ce_logo_skip |= joypad();
        ce_copy(buffer, &s->map, (uint16_t)row * 20u, 20u);
        if (window) set_win_tiles(0, row, 20, 1, buffer); else set_bkg_tiles(0, row, 20, 1, buffer);
        if (ce_is_cgb) {
            ce_copy(buffer, &s->attrs, (uint16_t)row * 20u, 20u); VBK_REG = 1;
            if (window) set_win_tiles(0, row, 20, 1, buffer); else set_bkg_tiles(0, row, 20, 1, buffer);
            VBK_REG = 0;
        }
    }
    /* Clear the offscreen columns in the window as well. */
    for (n = 0; n != 12u; ++n) buffer[n] = 0;
    if (window) { set_win_tiles(20, 0, 12, 1, buffer); set_win_tiles(20, 1, 12, 1, buffer); }
}
static void map_row(uint16_t row) {
    const CE_Stage *s = ce_stage;
    uint16_t world = row, length = s->horizontal ? s->width : s->height;
    uint8_t i, count = s->horizontal ? s->height : s->width, target = row & 31u;
    if (s->loop) world %= length;
    if (world < length) {
        ce_map_copy(buffer, s->map, world * count, count);
        for (i = 0; i != count; ++i) {
            if (s->object_count) buffer[i] = ce_terrain_tile(s->horizontal ? world : i, s->horizontal ? i : world, buffer[i]);
            buffer[i] += ce_screens[4].tile_count;
        }
    } else for (i = 0; i != count; ++i) buffer[i] = 0;
    if (s->horizontal) set_bkg_tiles(target, 0, 1, count, buffer);
    else set_bkg_tiles(0, target, count, 1, buffer);
    if (ce_is_cgb) {
        for (i = 0; i != count; ++i) buffer[i] = s->palette;
        VBK_REG = 1;
        if (s->horizontal) set_bkg_tiles(target, 0, 1, count, buffer);
        else set_bkg_tiles(0, target, count, 1, buffer);
        VBK_REG = 0;
    }
}
static void move_camera(void) {
    if (ce_stage->horizontal) move_bkg(ce_state.camera >> 4, ce_hud_bottom ? 0u : -ce_hud_height);
    else move_bkg(0, (ce_state.camera >> 4) - (ce_hud_bottom ? 0u : ce_hud_height));
}
static void load_screen(uint8_t screen, uint8_t black) {
    ce_trace[22] = 1;
    /* Keep the LCD enabled: LCD-off is visibly white on DMG. Load behind black. */
    ce_active_screen = screen; LCDC_REG &= ~8u;
    ce_fade_level = 4; palettes();
    HIDE_WIN; HIDE_SPRITES; hide_all(); ce_active_screen = screen;
    tiles(&ce_screens[screen].tiles, 0, ce_screens[screen].tile_count, 0);
    screen_map(screen, 0); move_bkg(0, 0); ce_hud(); SHOW_BKG; DISPLAY_ON;
    vsync(); ce_fade_level = black ? 4 : 0; palettes();
}
void ce_load_screen(uint8_t screen) BANKED { load_screen(screen, 0); }
void ce_load_logo(uint8_t screen) BANKED { load_screen(screen, 1); }
void ce_dialogue_update(uint8_t screen) BANKED {
    uint8_t row;
    /* Compiler shares the complete glyph atlas across this conversation.
     * Portrait tiles and their map never change; only the six text rows do. */
    ce_trace[22] = 1; ce_active_screen = screen;
    for (row = 12; row != 18; ++row) {
        ce_copy(buffer, &ce_screens[screen].map, (uint16_t)row * 20u, 20u);
        vsync(); set_bkg_tiles(0, row, 20, 1, buffer);
        if (ce_is_cgb) {
            ce_copy(buffer, &ce_screens[screen].attrs, (uint16_t)row * 20u, 20u);
            VBK_REG = 1; set_bkg_tiles(0, row, 20, 1, buffer); VBK_REG = 0;
        }
        ce_audio_sync();
    }
}
void ce_bomb_setup(void) BANKED {
    uint8_t row,screen=ce_bomb_screens[ce_character];const CE_Screen *s=&ce_screens[screen];
    ce_active_screen=screen;ce_fade_level=4;palettes();HIDE_WIN;
    /* The compiler limits this atlas to 128 tiles: sprite art stays intact. */
    for(row=0;row!=32u;++row)buffer[row]=0;
    LCDC_REG&=~8u;
    for(row=0;row!=32u;++row){set_bkg_tiles(0,row,32,1,buffer);if(ce_is_cgb){VBK_REG=1;set_bkg_tiles(0,row,32,1,buffer);VBK_REG=0;}}
    tiles(&s->tiles,0,s->tile_count,0);screen_map(screen,0);
    if(ce_bomb_styles[ce_character] && ce_state.player_y>1920){
        /* Continue the beam through the wrapped top edge when fired near the bottom. */
        ce_copy(buffer,&s->map,0,20);set_bkg_tiles(0,30,20,1,buffer);set_bkg_tiles(0,31,20,1,buffer);
        if(ce_is_cgb){ce_copy(buffer,&s->attrs,0,20);VBK_REG=1;set_bkg_tiles(0,30,20,1,buffer);set_bkg_tiles(0,31,20,1,buffer);VBK_REG=0;}
    }
    LCDC_REG|=8u;
    for(row=0;row!=32u;++row)buffer[row]=0;
    for(row=0;row!=32u;++row){
        set_bkg_tiles(0,row,32,1,buffer);
        if(ce_is_cgb){VBK_REG=1;set_bkg_tiles(0,row,32,1,buffer);VBK_REG=0;}
    }
    move_bkg(ce_bomb_styles[ce_character]?80-ce_state.player_x/16:0,ce_bomb_styles[ce_character]?120-ce_state.player_y/16:0);vsync();ce_fade_level=0;palettes();SHOW_BKG;SHOW_SPRITES;
}
void ce_bomb_draw(uint8_t visible) BANKED {
    if(visible)LCDC_REG&=~8u;else LCDC_REG|=8u;
}
void ce_load_stage(void) BANKED {
    uint8_t row; uint16_t start = ce_state.camera >> 7; const CE_Stage *s = ce_stage;
    if (ce_battle_mode == 2u) {
        /* A cut-in replaced only the arena. Reload its HUD/sprites/bullet tiles,
         * without uploading the scrolling stage map that stays invisible. */
        ce_active_screen = 4; hide_all(); SPRITES_8x8; ce_battle_setup();
        SHOW_BKG; SHOW_SPRITES; DISPLAY_ON; return;
    }
    /* Preserve an enabled, black LCD during transition loading. Turning it off
     * would flash white on DMG. GBDK VRAM APIs wait for safe access windows. */
    if (!ce_battle_mode && ce_fade_level != 4u) DISPLAY_OFF;
    LCDC_REG &= ~8u; hide_all(); palettes(); ce_active_screen = 4;
    tiles(&ce_screens[4].tiles, 0, ce_screens[4].tile_count, 0);
    tiles(&s->tiles, ce_screens[4].tile_count, s->tile_count, 0);
    tiles(&ce_sprite_data, 128, ce_sprite_tiles, 1); SPRITES_8x8;
    for (row = 0; row != 32u; ++row) map_row(start + row);
    ce_terrain_clean();
    screen_map(4, 1); move_win(7, ce_hud_bottom ? 144u - ce_hud_height : 0);
    parallax_phase = 255u; previous_row = start; move_camera();
    if (ce_battle_mode) ce_battle_setup(); else if (ce_battle_asset != CE_NONE) ce_load_boss(ce_battle_asset);
    ce_hud(); SHOW_BKG; if (ce_battle_mode != 2u) SHOW_WIN; SHOW_SPRITES; DISPLAY_ON;
}
static void number(uint8_t x, uint8_t y, uint16_t value, uint8_t digits) {
    uint8_t i = digits; const CE_Screen *s = &ce_screens[ce_active_screen];
    while (i) { --i; buffer[i] = s->digits[value % 10u]; value /= 10u; }
    if (ce_active_screen == 4u && ce_battle_mode == 2u) ce_bg_hud(x, y, digits, buffer);
    else if (ce_active_screen == 4u) set_win_tiles(x, y, digits, 1, buffer);
    else set_bkg_tiles(x, y, digits, 1, buffer);
}
void ce_hud(void) BANKED {
    const CE_Screen *s = &ce_screens[ce_active_screen]; const CE_Binding *b; uint8_t i, j;
    uint16_t value;
    for (i = 0; i != s->bindings; ++i) {
        b = &s->binding[i]; value = 0;
        if (b->kind == 5u) { for (j = 0; j != 5u; ++j) { number(b->x, b->y + j * 2u, j + 1u, 1); number(b->x + 3u, b->y + j * 2u, ce_scores[j], 5); } continue; }
        if (b->kind == 1u) value = ce_scene == 6u && i < 4u ? ce_bonus_values[i] : ce_state.score;
        else if (b->kind == 2u) value = ce_state.lives;
        else if (b->kind == 3u) {
            if (ce_scene == 13u) value = (ce_continue_left + 59u) / 60u;
            else if (ce_time_limit && ce_state.stage_tick < ce_stage->duration) value = (ce_stage->duration - ce_state.stage_tick + 59u) / 60u;
        }
        else if (b->kind == 4u) value = ce_boss_hp();
        else if (b->kind == 6u) value = ce_bombs;
        else if (b->kind == 7u) value = ce_shot_level + 1u;
        else if (b->kind == 8u) value = ce_speed_level + 1u;
        if (ce_active_screen == 4u) {
            if (hud_valid && hud_values[i] == value) continue;
            hud_values[i] = value;
        }
        number(b->x, b->y, value, b->digits);
    }
    hud_valid = 1;
}
/* Non-reentrant, bank-local SM83 emitter. The ISR only copies completed OAM.
 * Preserve registers explicitly; no C arguments or return-value ABI assumptions. */
static volatile OAM_item_t *emit_out;
static uint8_t emit_left, emit_y, emit_tile, emit_prop, emit_columns, emit_rows;
static uint8_t emit_top, emit_bottom, emit_visible_y;
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
        inc a
        ld (_emit_tile), a
        ld a, (_emit_prop)
        ld (hl+), a
        ld a, e
        add #8
        ld e, a
        dec c
        jr nz, 005$
        ld a, d
        add #8
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
        emit_tile = sprite_asset->first_tile + (sprite_tiles == 1u ? frame : frame * sprite_tiles);
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
    emit_tile = sprite_asset->first_tile + (sprite_tiles == 1u ? frame : frame * sprite_tiles);
}
/* Generic actor and multi-tile bullet setup. Preserve caller registers.
 * No ISR enters these static rendering contexts. */
static void actor_sprite(void) __naked {
    __asm
        push bc
        push de
        push hl
_ce_actor_sprite_inner::
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
        ld a, (_emit_prop)
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
/* Tile-space parallax: compensate the main camera with a cyclic texture offset.
 * At divisor 2 the central motif moves at half the world speed, on DMG and CGB.
 * Tile bytes are prepared in ROM; only up to 128 bytes change at a phase edge. */
static void parallax(void) {
    const CE_Parallax *p = &ce_parallaxes[ce_state.stage];
    uint16_t camera = ce_state.camera >> 4;
    uint8_t phase;
    if (!p->count) return;
    if (!(p->phases & (p->phases - 1u))) phase = ((p->divisor == 2u ? camera >> 1 : camera / p->divisor) - camera) & (p->phases - 1u);
    else phase = (p->phases - (camera - camera / p->divisor) % p->phases) % p->phases;
    if (phase == parallax_phase) return;
    ce_copy(buffer, &p->frames, (uint16_t)phase * p->count * 16u, (uint16_t)p->count * 16u);
    set_bkg_data(ce_screens[4].tile_count + p->first, p->count, buffer);
    parallax_phase = phase;
}
void ce_render(void) BANKED {
    uint8_t i; uint16_t row = ce_state.camera >> 7;
    uint16_t length;
    if (!ce_battle_mode) {
    if (row != previous_row) {
    length = ce_stage->horizontal ? ce_stage->width : ce_stage->height;
    if (row + 1u == previous_row || (ce_stage->loop && !(length & 31u) && previous_row == 0u && row + 1u == length)) map_row(row);
    else if (ce_stage->loop && !(length & 31u) && row == 0u && previous_row + 1u == length) map_row(31u);
    else if (row != previous_row && row != previous_row + 1u) { DISPLAY_OFF; for (i = 0; i != 32u; ++i) map_row(row + i); DISPLAY_ON; }
    else if (row != previous_row) map_row(row + 31u);
    previous_row = row;
    }
    if (ce_stage->object_count) ce_terrain_flush(ce_screens[4].tile_count);
    }
    pose_slot = 0;
    emit_top = ce_hud_bottom ? 9u : ce_hud_height + 9u;
    emit_bottom = ce_hud_bottom ? 160u - ce_hud_height : 160u;
    DISABLE_OAM_DMA;
    if (!ce_respawn && (ce_bomb_left || !ce_state.invulnerable || !(ce_state.invulnerable & 4u))) {
        player_pose.asset = ce_player_asset; player_pose.x = ce_state.player_x;
        player_pose.y = ce_state.player_y; player_pose.age = ce_state.tick;
        animation_slot = 0; pose = &player_pose; sprite();
    }
    if (ce_transition_state == 1u) {
        /* A single break burst replaces the boss briefly, so its smaller sprite
         * cannot be occluded by the boss's earlier OAM entries on DMG or CGB. */
        for (i = ce_used, animation_slot = 1, pose = ce_entities; i; --i, ++pose, ++animation_slot)
            if (pose->kind && pose->kind != CE_BOSS) sprite();
    } else for (i = ce_used, animation_slot = 1, pose = ce_entities; i; --i, ++pose, ++animation_slot) if (pose->kind) sprite();
    /* Do not DMA a partially written metasprite list. */
    i = pose_slot;
    while (pose_slot < previous_slots) shadow_OAM[pose_slot++].y = 0;
    previous_slots = i;
    if (ce_battle_mode == 2u) for (i = 0; i != previous_slots; ++i) shadow_OAM[i].tile -= 128u;
    if (!(ce_state.tick & 7u)) ce_hud();
    if (ce_battle_mode == 2u) ce_bg_flush();
    ENABLE_OAM_DMA;
    /* Publish every completed pose through VBlank DMA before another update
     * can overwrite it. Repeated display frames under load are intentional. */
    vsync();
    if (ce_battle_mode == 2u) ce_bg_publish();
    else if (!ce_battle_mode) { move_camera(); parallax(); }
}

void ce_get_presentation(CE_Presentation *dest, uint8_t stage) BANKED { *dest = ce_presentations[(uint16_t)stage * ce_player_count + ce_character]; }

void ce_get_screen(CE_Screen *dest, uint8_t index) BANKED { *dest = ce_screens[index]; }
void ce_load_boss(uint8_t asset) BANKED {
    if (asset == CE_NONE || !ce_boss_graphics[asset].length) return;
    tiles(&ce_boss_graphics[asset], ce_assets[asset].first_tile - (ce_battle_mode == 2u ? 128u : 0u), ce_boss_graphics[asset].length / 16u, 1);
}
void ce_battle_setup(void) BANKED {
    uint8_t i;
    HIDE_SPRITES; HIDE_WIN; ce_fade_level = 4; palettes();
    if (ce_battle_mode == 2u) {
        tiles(&ce_sprite_data, 0, ce_sprite_tiles, 1); ce_bg_setup();
    } else {
        for (i = 0; i != 32u; ++i) buffer[i] = 0;
        for (i = 0; i != 32u; ++i) set_bkg_tiles(0,i,32,1,buffer);
        move_bkg(0,0); SHOW_WIN;
    }
    ce_load_boss(ce_battle_asset); hud_valid = 0; ce_hud();
    vsync(); ce_fade_level = 0; palettes(); SHOW_SPRITES;
}
