#pragma bank 255
#include "caravan.h"
#include <string.h>
typedef char ce_terrain_layout_check[(sizeof(CE_TerrainObject) == 5u && sizeof(CE_ItemEffect) == 3u) ? 1 : -1];

/* State is per instance, not per occupied tile. Four tiles share one HP nibble. */
uint8_t ce_object_hp[CE_MAX_OBJECTS / 2u], ce_object_dirty[CE_MAX_OBJECTS / 8u];
static uint8_t dirty_cursor;
static uint16_t dirty_left, cached_index, cached_id;

static uint8_t hp(uint16_t id) {
    uint8_t value = ce_object_hp[id >> 1];
    return id & 1u ? value >> 4 : value & 15u;
}
static void set_hp(uint16_t id, uint8_t value) {
    uint8_t *out = &ce_object_hp[id >> 1];
    if (id & 1u) *out = (*out & 15u) | (value << 4);
    else *out = (*out & 240u) | value;
}
static void read_object(uint16_t id, CE_TerrainObject *object) {
    ce_map_copy((uint8_t *)object, ce_stage->objects, id * 5u, 5);
}
/* Coordinates are world tiles. Compiled macrocell planes use the same axis as tiles. */
static uint16_t object_at(uint16_t x, uint16_t y) {
    const CE_Stage *s = ce_stage; uint16_t index, id;
    if (!s->object_count) return 0;
    if (s->loop) { if (s->horizontal && x >= s->width) x %= s->width; else if (!s->horizontal && y >= s->height) y %= s->height; }
    if (x >= s->width || y >= s->height) return 0;
    index = s->horizontal ? (x >> 1) * 9u + (y >> 1) : (y >> 1) * 10u + (x >> 1);
    if (index == cached_index) return cached_id;
    ce_map_copy((uint8_t *)&id, s->object_ids, index * 2u, 2);
    cached_index = index; cached_id = id;
    return id;
}
void ce_terrain_clean(void) BANKED { memset(ce_object_dirty, 0, sizeof(ce_object_dirty)); dirty_cursor = 0; dirty_left = 0; }
void ce_terrain_reset(void) BANKED {
    uint16_t id; CE_TerrainObject object; const CE_Stage *s = ce_stage;
    memset(ce_object_hp, 0, sizeof(ce_object_hp)); ce_terrain_clean(); cached_index = 65535u;
    for (id = 0; id != s->object_count; ++id) { read_object(id, &object); set_hp(id, s->object_types[object.type].hp); }
}
uint8_t ce_terrain_tile(uint16_t x, uint16_t y, uint8_t base) BANKED {
    uint16_t id = object_at(x, y); CE_TerrainObject object;
    if (!id || !hp(--id)) return base;
    read_object(id, &object);
    return ce_stage->object_types[object.type].tiles[((y & 1u) << 1) | (x & 1u)];
}
/* Return the wrapped position of an object relative to the current playfield. */
static void screen_position(const CE_TerrainObject *object, int16_t *x, int16_t *y) {
    const CE_Stage *s = ce_stage; int16_t camera = ce_state.camera >> 4;
    *x = object->x * 8u; *y = object->y * 8u;
    if (s->horizontal) {
        *x -= camera; if (s->loop && *x < -15) *x += s->width * 8u;
    } else {
        *y -= camera; if (s->loop && *y < -15) *y += s->height * 8u;
    }
    *y += ce_hud_bottom ? 0u : ce_hud_height;
}
static void damage_object(uint16_t id, uint8_t damage) {
    CE_TerrainObject object; const CE_TerrainType *type; uint8_t before = hp(id); int16_t x, y;
    if (!before) return;
    if (damage < before) { set_hp(id, before - damage); return; }
    /* Commit the dead state before score/drop allocation or another shot can observe it. */
    set_hp(id, 0); ce_object_dirty[id >> 3] |= 1u << (id & 7u); ++dirty_left;
    read_object(id, &object); type = &ce_stage->object_types[object.type];
    ce_add_score(type->score); screen_position(&object, &x, &y);
    ce_spawn_item(type->drop_item, (x + 8) * 16, (y + 8) * 16); ce_sound(1);
}
uint8_t ce_terrain_collision(CE_Box *box, uint8_t damage, uint8_t shots) BANKED {
    const CE_Stage *s = ce_stage; CE_TerrainObject object;
    int16_t left = box->left - 128, right = box->right - 129;
    int16_t upper = box->top - 128, lower = box->bottom - 129;
    uint8_t top = ce_hud_bottom ? 0u : ce_hud_height, bottom = top + 144u - ce_hud_height;
    uint16_t x, y, first_x, last_x, first_y, last_y, wx, wy, id, index, camera = ce_state.camera >> 4;
    if (!s->has_walls && shots != 1u) return 0;
    if (right < 0 || left >= 160 || lower < top || upper >= bottom) return 0;
    if (left < 0) left = 0; if (right > 159) right = 159;
    if (upper < top) upper = top; if (lower >= bottom) lower = bottom - 1u;
    first_x = (left + (s->horizontal ? camera : 0u)) >> 3;
    last_x = (right + (s->horizontal ? camera : 0u)) >> 3;
    first_y = (upper - top + (s->horizontal ? 0u : camera)) >> 3;
    last_y = (lower - top + (s->horizontal ? 0u : camera)) >> 3;
    if (!s->has_walls && (!s->loop || !((s->horizontal ? s->width : s->height) & 1u))) {
        /* Fly-over-only stages have no tile walls to order against. Query each
         * 16px macrocell once, preserving top-to-bottom / left-to-right hits. */
        first_x >>= 1; last_x >>= 1; first_y >>= 1; last_y >>= 1;
        for (y = first_y; y <= last_y; ++y) for (x = first_x; x <= last_x; ++x) {
            id = object_at(x << 1, y << 1);
            if (id && hp(id - 1u)) { damage_object(id - 1u, damage); return 1; }
        }
        return 0;
    }
    for (y = first_y; y <= last_y; ++y) for (x = first_x; x <= last_x; ++x) {
        wx = x; wy = y;
        if (s->loop) { if (s->horizontal && wx >= s->width) wx %= s->width; else if (!s->horizontal && wy >= s->height) wy %= s->height; }
        if (wx >= s->width || wy >= s->height) continue;
        id = object_at(wx, wy);
        if (id && hp(id - 1u)) {
            if (shots == 1u) { damage_object(id - 1u, damage); return 1; }
            read_object(id - 1u, &object);
            if (s->object_types[object.type].solid) return 1;
        }
        if (s->has_walls) {
            index = ce_map_index(wx, wy);
            if (ce_read(&s->walls[index >> 12], index & 4095u)) return 1;
        }
    }
    return 0;
}
void ce_terrain_bomb(void) BANKED {
    const CE_Stage *s = ce_stage; CE_TerrainObject object;
    uint16_t id; int16_t x, y; uint8_t top = ce_hud_bottom ? 0u : ce_hud_height;
    /* A bomb is one discrete action; ordinary shots use constant-time macrocell lookup. */
    for (id = 0; id != s->object_count; ++id) if (hp(id)) {
        read_object(id, &object); screen_position(&object, &x, &y);
        if (x < 160 && x > -16 && y < top + 144u - ce_hud_height && y + 16 > top) damage_object(id, 15);
    }
}
void ce_terrain_flush(uint8_t tile_base) BANKED {
    const CE_Stage *s = ce_stage; CE_TerrainObject object;
    uint8_t scanned = 0, objects = 0, written = 0, needed, bit, cell, value;
    uint16_t id, index, x, y, tx, ty, start, length;
    int16_t offset, position;
    if (!dirty_left) return;
    start = ce_state.camera >> 7; length = s->horizontal ? s->width : s->height;
    /* The renderer keeps all 32 strips resident, including offscreen loop copies.
     * A short loop can contain two copies of one instance. Reserve the complete
     * update before clearing its dirty bit: at most eight cells plus CGB attrs. */
    while (dirty_left && scanned != 64u && objects != 2u) {
        if (!ce_object_dirty[dirty_cursor]) { dirty_cursor = (dirty_cursor + 1u) & 63u; ++scanned; continue; }
        bit = 0; while (!(ce_object_dirty[dirty_cursor] & (1u << bit))) ++bit;
        id = ((uint16_t)dirty_cursor << 3) + bit;
        read_object(id, &object);
        offset = (s->horizontal ? object.x : object.y) - (s->loop ? start % length : start);
        if (s->loop && offset < -1) offset += length;
        needed = 0;
        for (cell = 0; cell != 4u; ++cell) {
            position = offset + (s->horizontal ? (cell & 1u) : (cell >> 1));
            if (position >= 0 && position < 32) ++needed;
            if (s->loop && position + length < 32u) ++needed;
        }
        if (written + needed > 8u) break;
        ce_object_dirty[dirty_cursor] &= ~(1u << bit);
        --dirty_left;
        ++objects;
        for (cell = 0; cell != 4u; ++cell) {
            x = object.x + (cell & 1u); y = object.y + (cell >> 1);
            position = offset + (s->horizontal ? (cell & 1u) : (cell >> 1));
            if (position >= 32) continue;
            index = ce_map_index(x, y); value = ce_read(&s->map[index >> 12], index & 4095u) + tile_base;
            do {
                if (position >= 0) {
                    tx = s->horizontal ? start + position : x; ty = s->horizontal ? y : start + position;
                    set_bkg_tiles(tx & 31u, ty & 31u, 1, 1, &value); ++written;
                    if (ce_is_cgb) { VBK_REG = 1; set_bkg_tiles(tx & 31u, ty & 31u, 1, 1, &s->palette); VBK_REG = 0; }
                }
                position += length;
            } while (s->loop && position < 32);
        }
    }
}
