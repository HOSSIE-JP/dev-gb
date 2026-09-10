#ifndef CARAVAN_H
#define CARAVAN_H
#include <gb/gb.h>
#include <gb/cgb.h>
#include <stdint.h>

#define CE_MAX_ENTITIES 39u
#define CE_MAX_ENEMIES 12u
#define CE_MAX_ESHOTS 32u
#define CE_FREE_GROUPS ((CE_MAX_ENTITIES + 7u) / 8u)
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
    /* 16 bytes on SM83: cheap indexed lookup, no duplicate hitbox fields.
     * animation_shift is 255 unless equal power-of-two frames can use a mask. */
    uint8_t width, height, ox, oy, palette, first_tile, tiles, frames;
    uint16_t duration; uint8_t animation_shift;
    const uint8_t *durations; uint8_t emitters; const int8_t *emitter_xy;
} CE_Asset;
typedef struct {
    uint8_t asset, kind, speed, angle, count, rotation, repeats;
    uint16_t interval, delay, lifetime; uint8_t damage; const int8_t *angles; const int16_t *velocity;
} CE_Pattern;
typedef struct { uint8_t until; uint16_t threshold; uint8_t pattern; const CE_Motion *motion; uint8_t layers; const uint8_t *layer; uint8_t intro_screen; uint16_t intro_frames; } CE_Phase;
typedef struct { uint8_t asset, hp; uint16_t score; uint8_t pattern; const CE_Motion *motion; uint8_t phases; const CE_Phase *phase; uint8_t layers; const uint8_t *layer; uint8_t background, bg_limit; } CE_Actor;
typedef struct { uint16_t frame; uint8_t kind, ref; int16_t x, y; uint8_t value; } CE_Event;
typedef struct {
    uint16_t height, duration, event_count; uint8_t scroll, loop, clear_boss, has_walls;
    CE_Data tiles; uint8_t tile_count, palette;
    const CE_Data *map; const CE_Data *walls; CE_Data events;
    uint8_t require_boss, music, scroll_down, boss_music;
} CE_Stage;
typedef struct { uint8_t kind, x, y, digits; } CE_Binding;
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
    uint8_t weapon_mode;
} CE_State;

extern const uint8_t ce_asset_count, ce_pattern_count, ce_enemy_count, ce_boss_count, ce_stage_count;
extern const CE_Asset ce_assets[];
extern const CE_Hitbox ce_hitboxes[];
extern const CE_Pattern ce_patterns[];
extern const CE_Actor ce_enemies[], ce_bosses[];
extern const CE_Stage ce_stages[];
/* Screen metadata is bank 1, consumed only by bank-1 render/scene routines. */
typedef struct { uint8_t first, count, clear; uint16_t base, life, no_miss, clear_wait; } CE_Presentation;
typedef struct { uint8_t first, count, phases, divisor; CE_Data frames; } CE_Parallax;
extern const CE_Screen ce_screens[];
extern const CE_Presentation ce_presentations[];
extern const CE_Parallax ce_parallaxes[];
extern uint8_t ce_stage_misses, ce_dialogue_page;
extern uint16_t ce_bonus_values[4];
void ce_dialogue(void) BANKED;
void ce_stage_complete(void) BANKED;
extern const CE_Data ce_sprite_data, ce_boss_graphics[];
extern const palette_color_t ce_palettes[];
extern const uint8_t ce_dmg_palette;
extern const uint8_t ce_palette_count, ce_sprite_tiles, ce_campaign, ce_start_stage, ce_hud_bottom, ce_hud_height;
extern const uint8_t ce_player_asset, ce_player_weapon, ce_player_speed, ce_player_lives;
extern const uint8_t ce_player_focus_weapon, ce_player_focus_speed;
extern const uint8_t ce_music_title, ce_music_boss, ce_music_clear, ce_music_gameover, ce_music_victory;
extern const uint8_t ce_entity_limits[6];
extern const uint16_t ce_player_invulnerability, ce_clear_bonus, ce_player_respawn_delay;
extern const uint8_t ce_stage_fade, ce_time_limit, ce_boss_celebration;
extern uint8_t ce_victory_frame;
extern uint16_t ce_respawn;
extern uint8_t ce_fade_level;
extern const uint8_t ce_explosion_asset, ce_explosion_duration;
extern const int16_t ce_player_start_x, ce_player_start_y;
extern const int8_t ce_sin[16], ce_cos[16];
extern CE_Entity ce_entities[CE_MAX_ENTITIES];
extern CE_State ce_state;
/* Bullet motion is canonical in these planes; entity records keep common
 * kind/asset/damage metadata and the stable allocation/draw order. */
extern int16_t ce_shot_x[CE_MAX_ENTITIES], ce_shot_y[CE_MAX_ENTITIES];
extern int16_t ce_shot_vx[CE_MAX_ENTITIES], ce_shot_vy[CE_MAX_ENTITIES];
extern uint16_t ce_shot_age[CE_MAX_ENTITIES], ce_shot_lifetime[CE_MAX_ENTITIES];
extern int16_t ce_shot_px[CE_MAX_ENTITIES], ce_shot_py[CE_MAX_ENTITIES];
extern OAM_item_t ce_shot_oam[CE_MAX_ENTITIES];
extern uint8_t ce_shot_simple[CE_MAX_ENTITIES];
extern uint8_t ce_is_cgb, ce_scene, ce_pause, ce_active_screen;
extern uint8_t ce_used;
extern uint16_t ce_scores[5];
extern const uint8_t ce_save_id[4];
void ce_save_load(void) BANKED;
void ce_save_scores(void) BANKED;
extern volatile uint8_t ce_trace[24];

void ce_copy(uint8_t *dest, const CE_Data *source, uint16_t offset, uint16_t length) NONBANKED;
uint8_t ce_read(const CE_Data *source, uint16_t offset) NONBANKED;
void ce_reset(uint8_t stage, uint8_t new_game) NONBANKED;
void ce_step(uint8_t input) NONBANKED;
void ce_trace_write(void) NONBANKED;
uint8_t ce_boss_hp(void) NONBANKED;
void ce_load_stage(void) BANKED;
void ce_load_screen(uint8_t screen) BANKED;
void ce_get_presentation(CE_Presentation *dest, uint8_t stage) BANKED;
void ce_dialogue_update(uint8_t screen) BANKED;
extern const uint8_t ce_ending_first, ce_ending_count;
extern const uint16_t ce_ending_frames;
void ce_render(void) BANKED;
void ce_fade(uint8_t out) BANKED;
void ce_audio_sync(void) NONBANKED;
void ce_hud(void) BANKED;
void ce_sound(uint8_t effect) NONBANKED;
void ce_run(void) NONBANKED;
/* Boss presentation and monochrome BG shot renderer. */
typedef struct { int16_t x,y,vx,vy; uint16_t life; uint8_t damage; } CE_BGSpawn;
extern CE_BGSpawn ce_bg_request;
extern uint8_t ce_battle_mode, ce_battle_asset, ce_bg_limit, ce_bg_count, ce_bg_hit;
extern uint8_t ce_bg_plane, ce_bg_back, ce_bg_map_front, ce_boss_invulnerable;
extern uint16_t ce_bg_tile_drops, ce_bg_peak_tiles, ce_intro_left, ce_clear_wait_left;
void ce_bg_clear(void) BANKED;
void ce_bg_setup(void) BANKED;
void ce_bg_begin(void) BANKED;
void ce_bg_update(void) BANKED;
void ce_bg_spawn(void) BANKED;
void ce_bg_flush(void) BANKED;
void ce_bg_publish(void) BANKED;
void ce_bg_palette(void) BANKED;
void ce_bg_hud(uint8_t x, uint8_t y, uint8_t count, const uint8_t *data) BANKED;
void ce_get_screen(CE_Screen *dest, uint8_t index) BANKED;
void ce_load_boss(uint8_t asset) BANKED;
void ce_battle_setup(void) BANKED;
void ce_clear_combat(uint8_t all) NONBANKED;
void ce_celebrate_boss(void) BANKED;
void ce_read_event(void) BANKED;
uint8_t ce_stage_events(void) BANKED;
void ce_phase_intro(const CE_Phase *phase) BANKED;
#endif
