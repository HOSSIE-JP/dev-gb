#ifndef CARAVAN_H
#define CARAVAN_H
#include <gb/gb.h>
#include <gb/cgb.h>
#include <stdint.h>

#define CE_MAX_ENTITIES 31u
#define CE_NONE 255u
#define CE_ENEMY 1u
#define CE_BOSS 2u
#define CE_PSHOT 3u
#define CE_ESHOT 4u
#define CE_FX 5u

typedef struct { uint8_t bank; const uint8_t *data; uint16_t length; } CE_Data;
typedef struct { uint16_t frame; int16_t x, y, vx, vy; } CE_Point;
typedef struct {
    uint8_t kind; int16_t vx, vy; uint8_t amplitude; uint16_t period;
    uint8_t loop, count; const CE_Point *points;
} CE_Motion;
typedef struct {
    uint8_t width, height, ox, oy, hx, hy, hw, hh, palette, first_tile, tiles, frames;
    const uint8_t *durations; uint8_t emitters; const int8_t *emitter_xy;
} CE_Asset;
typedef struct {
    uint8_t asset, kind, speed, angle, count, rotation, repeats;
    uint16_t interval, delay, lifetime; uint8_t damage; const int8_t *angles;
} CE_Pattern;
typedef struct { uint8_t until; uint16_t threshold; uint8_t pattern; const CE_Motion *motion; uint8_t layers; const uint8_t *layer; } CE_Phase;
typedef struct { uint8_t asset, hp; uint16_t score; uint8_t pattern; const CE_Motion *motion; uint8_t phases; const CE_Phase *phase; uint8_t layers; const uint8_t *layer; } CE_Actor;
typedef struct { uint16_t frame; uint8_t kind, ref; int16_t x, y; uint8_t value; } CE_Event;
typedef struct {
    uint16_t height, duration, event_count; uint8_t scroll, loop, clear_boss, has_walls;
    CE_Data tiles; uint8_t tile_count, palette;
    const CE_Data *map; const CE_Data *walls; CE_Data events;
} CE_Stage;
typedef struct { uint8_t kind, x, y; } CE_Binding;
typedef struct {
    CE_Data tiles, map, attrs; uint8_t tile_count, palette, bindings;
    const CE_Binding *binding; const uint8_t *digits;
} CE_Screen;
typedef struct {
    uint8_t kind, ref, asset, hp, phase, sequence; uint16_t age, phase_age, lifetime;
    int16_t x, y, base_x, base_y, vx, vy; uint8_t damage;
} CE_Entity;
typedef struct { uint16_t left, top, right, bottom; } CE_Box;
typedef struct { int8_t x, y; uint8_t w, h; } CE_Hitbox;
typedef struct {
    uint16_t tick, stage_tick, camera, score, invulnerable, cooldown, dropped;
    int16_t player_x, player_y; uint8_t stage, lives, result, boss_defeated, scroll, player_sequence;
} CE_State;

extern const uint8_t ce_asset_count, ce_pattern_count, ce_enemy_count, ce_boss_count, ce_stage_count;
extern const CE_Asset ce_assets[];
extern const CE_Hitbox ce_hitboxes[];
extern const CE_Pattern ce_patterns[];
extern const CE_Actor ce_enemies[], ce_bosses[];
extern const CE_Stage ce_stages[];
extern const CE_Screen ce_screens[5];
extern const CE_Data ce_sprite_data;
extern const palette_color_t ce_palettes[];
extern const uint8_t ce_palette_count, ce_sprite_tiles, ce_campaign, ce_start_stage, ce_hud_bottom;
extern const uint8_t ce_player_asset, ce_player_weapon, ce_player_speed, ce_player_lives;
extern const uint16_t ce_player_invulnerability, ce_clear_bonus;
extern const uint8_t ce_explosion_asset, ce_explosion_duration;
extern const int16_t ce_player_start_x, ce_player_start_y;
extern const int8_t ce_sin[16], ce_cos[16];
extern CE_Entity ce_entities[CE_MAX_ENTITIES];
extern CE_State ce_state;
extern uint8_t ce_is_cgb, ce_scene, ce_pause, ce_active_screen;
extern uint8_t ce_used;
extern uint16_t ce_scores[5];
extern volatile uint8_t ce_trace[24];

void ce_copy(uint8_t *dest, const CE_Data *source, uint16_t offset, uint16_t length) NONBANKED;
uint8_t ce_read(const CE_Data *source, uint16_t offset) NONBANKED;
void ce_reset(uint8_t stage, uint8_t new_game) NONBANKED;
void ce_step(uint8_t input) NONBANKED;
void ce_trace_write(void) NONBANKED;
uint8_t ce_boss_hp(void) NONBANKED;
void ce_load_stage(void) BANKED;
void ce_load_screen(uint8_t screen) BANKED;
void ce_render(void) BANKED;
void ce_hud(void) BANKED;
void ce_sound(uint8_t effect) NONBANKED;
void ce_run(void) NONBANKED;
#endif
