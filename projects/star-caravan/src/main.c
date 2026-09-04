#include <gb/gb.h>
#include <gb/cgb.h>
#include <stdint.h>

/*
 * STAR CARAVAN
 * A small, original two-minute vertical score attack for GBDK-2020.
 *
 * The program intentionally keeps all art as compact 2bpp data and 5x7 glyph
 * descriptions in source. No third-party game graphics or code are used.
 */

#define SCREEN_TILE_WIDTH 20u
#define MAP_TILE_WIDTH 32u
#define MAP_TILE_HEIGHT 32u

#define FONT_TILE_COUNT 44u
#define STAR_TILE_FIRST FONT_TILE_COUNT
#define STAR_TILE_COUNT 4u

#define SPRITE_TILE_FIRST 64u
#define SPRITE_TILE_PLAYER_LEFT (SPRITE_TILE_FIRST + 0u)
#define SPRITE_TILE_PLAYER_RIGHT (SPRITE_TILE_FIRST + 1u)
#define SPRITE_TILE_PLAYER_SHOT (SPRITE_TILE_FIRST + 2u)
#define SPRITE_TILE_ENEMY_SCOUT (SPRITE_TILE_FIRST + 3u)
#define SPRITE_TILE_ENEMY_WING (SPRITE_TILE_FIRST + 4u)
#define SPRITE_TILE_ENEMY_SHOT (SPRITE_TILE_FIRST + 5u)
#define SPRITE_TILE_EXPLOSION_A (SPRITE_TILE_FIRST + 6u)
#define SPRITE_TILE_EXPLOSION_B (SPRITE_TILE_FIRST + 7u)
#define SPRITE_TILE_BOSS_TL (SPRITE_TILE_FIRST + 8u)
#define SPRITE_TILE_BOSS_TR (SPRITE_TILE_FIRST + 9u)
#define SPRITE_TILE_BOSS_BL (SPRITE_TILE_FIRST + 10u)
#define SPRITE_TILE_BOSS_BR (SPRITE_TILE_FIRST + 11u)
#define SPRITE_TILE_COUNT 12u

#define PLAYER_SPRITE_LEFT 0u
#define PLAYER_SPRITE_RIGHT 1u
#define PLAYER_SHOT_SPRITE_FIRST 2u
#define MAX_PLAYER_SHOTS 6u
#define ENEMY_SPRITE_FIRST 8u
#define MAX_ENEMIES 8u
#define ENEMY_SHOT_SPRITE_FIRST 16u
#define MAX_ENEMY_SHOTS 8u
#define BOSS_SPRITE_FIRST 24u
#define HARDWARE_SPRITE_COUNT 40u

#define PLAYER_MAX_X 144u
#define PLAYER_MIN_Y 20u
#define PLAYER_MAX_Y 136u
#define PLAYER_SPEED 2u
#define PLAYER_START_X 72u
#define PLAYER_START_Y 124u
#define PLAYER_INVULNERABLE_FRAMES 240u

#ifndef CARAVAN_SECONDS
#define CARAVAN_SECONDS 120u
#endif
#define BOSS_APPEAR_SECOND 60u
#define BOSS_START_HP 32u

#define ENEMY_INACTIVE 0u
#define ENEMY_ACTIVE 1u
#define ENEMY_EXPLODING 2u

#define BOSS_INACTIVE 0u
#define BOSS_ACTIVE 1u
#define BOSS_EXPLODING 2u

#define SCENE_TITLE 0u
#define SCENE_GAME 1u
#define SCENE_GAME_OVER 2u
#define SCENE_CLEAR 3u
#define SCENE_SCORES 4u

#define RESULT_GAME_OVER 0u
#define RESULT_CLEAR 1u

typedef struct PlayerShot {
    uint8_t active;
    uint8_t x;
    uint8_t y;
} PlayerShot;

typedef struct EnemyShot {
    uint8_t active;
    uint8_t x;
    uint8_t y;
    int8_t dx;
} EnemyShot;

typedef struct Enemy {
    uint8_t state;
    uint8_t x;
    uint8_t y;
    uint8_t type;
    uint8_t hp;
    uint8_t direction;
    uint8_t phase;
    uint8_t shot_timer;
    uint8_t state_timer;
} Enemy;

typedef struct Boss {
    uint8_t state;
    uint8_t x;
    uint8_t y;
    uint8_t hp;
    uint8_t direction;
    uint8_t move_timer;
    uint8_t shot_timer;
    uint8_t state_timer;
} Boss;

/* Rows are five-bit-wide 5x7 glyphs. Tile 0 is a blank. */
static const uint8_t glyph_rows[FONT_TILE_COUNT][7] = {
    {0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u}, /* space */
    {0x0Eu, 0x11u, 0x13u, 0x15u, 0x19u, 0x11u, 0x0Eu}, /* 0 */
    {0x04u, 0x0Cu, 0x04u, 0x04u, 0x04u, 0x04u, 0x0Eu}, /* 1 */
    {0x0Eu, 0x11u, 0x01u, 0x02u, 0x04u, 0x08u, 0x1Fu}, /* 2 */
    {0x1Eu, 0x01u, 0x01u, 0x0Eu, 0x01u, 0x01u, 0x1Eu}, /* 3 */
    {0x02u, 0x06u, 0x0Au, 0x12u, 0x1Fu, 0x02u, 0x02u}, /* 4 */
    {0x1Fu, 0x10u, 0x10u, 0x1Eu, 0x01u, 0x01u, 0x1Eu}, /* 5 */
    {0x06u, 0x08u, 0x10u, 0x1Eu, 0x11u, 0x11u, 0x0Eu}, /* 6 */
    {0x1Fu, 0x01u, 0x02u, 0x04u, 0x08u, 0x08u, 0x08u}, /* 7 */
    {0x0Eu, 0x11u, 0x11u, 0x0Eu, 0x11u, 0x11u, 0x0Eu}, /* 8 */
    {0x0Eu, 0x11u, 0x11u, 0x0Fu, 0x01u, 0x02u, 0x0Cu}, /* 9 */
    {0x0Eu, 0x11u, 0x11u, 0x1Fu, 0x11u, 0x11u, 0x11u}, /* A */
    {0x1Eu, 0x11u, 0x11u, 0x1Eu, 0x11u, 0x11u, 0x1Eu}, /* B */
    {0x0Fu, 0x10u, 0x10u, 0x10u, 0x10u, 0x10u, 0x0Fu}, /* C */
    {0x1Eu, 0x11u, 0x11u, 0x11u, 0x11u, 0x11u, 0x1Eu}, /* D */
    {0x1Fu, 0x10u, 0x10u, 0x1Eu, 0x10u, 0x10u, 0x1Fu}, /* E */
    {0x1Fu, 0x10u, 0x10u, 0x1Eu, 0x10u, 0x10u, 0x10u}, /* F */
    {0x0Fu, 0x10u, 0x10u, 0x13u, 0x11u, 0x11u, 0x0Fu}, /* G */
    {0x11u, 0x11u, 0x11u, 0x1Fu, 0x11u, 0x11u, 0x11u}, /* H */
    {0x0Eu, 0x04u, 0x04u, 0x04u, 0x04u, 0x04u, 0x0Eu}, /* I */
    {0x01u, 0x01u, 0x01u, 0x01u, 0x11u, 0x11u, 0x0Eu}, /* J */
    {0x11u, 0x12u, 0x14u, 0x18u, 0x14u, 0x12u, 0x11u}, /* K */
    {0x10u, 0x10u, 0x10u, 0x10u, 0x10u, 0x10u, 0x1Fu}, /* L */
    {0x11u, 0x1Bu, 0x15u, 0x15u, 0x11u, 0x11u, 0x11u}, /* M */
    {0x11u, 0x19u, 0x15u, 0x13u, 0x11u, 0x11u, 0x11u}, /* N */
    {0x0Eu, 0x11u, 0x11u, 0x11u, 0x11u, 0x11u, 0x0Eu}, /* O */
    {0x1Eu, 0x11u, 0x11u, 0x1Eu, 0x10u, 0x10u, 0x10u}, /* P */
    {0x0Eu, 0x11u, 0x11u, 0x11u, 0x15u, 0x12u, 0x0Du}, /* Q */
    {0x1Eu, 0x11u, 0x11u, 0x1Eu, 0x14u, 0x12u, 0x11u}, /* R */
    {0x0Fu, 0x10u, 0x10u, 0x0Eu, 0x01u, 0x01u, 0x1Eu}, /* S */
    {0x1Fu, 0x04u, 0x04u, 0x04u, 0x04u, 0x04u, 0x04u}, /* T */
    {0x11u, 0x11u, 0x11u, 0x11u, 0x11u, 0x11u, 0x0Eu}, /* U */
    {0x11u, 0x11u, 0x11u, 0x11u, 0x11u, 0x0Au, 0x04u}, /* V */
    {0x11u, 0x11u, 0x11u, 0x15u, 0x15u, 0x15u, 0x0Au}, /* W */
    {0x11u, 0x11u, 0x0Au, 0x04u, 0x0Au, 0x11u, 0x11u}, /* X */
    {0x11u, 0x11u, 0x0Au, 0x04u, 0x04u, 0x04u, 0x04u}, /* Y */
    {0x1Fu, 0x01u, 0x02u, 0x04u, 0x08u, 0x10u, 0x1Fu}, /* Z */
    {0x00u, 0x00u, 0x00u, 0x1Fu, 0x00u, 0x00u, 0x00u}, /* - */
    {0x00u, 0x04u, 0x04u, 0x00u, 0x04u, 0x04u, 0x00u}, /* : */
    {0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x0Cu, 0x0Cu}, /* . */
    {0x01u, 0x02u, 0x02u, 0x04u, 0x08u, 0x08u, 0x10u}, /* / */
    {0x04u, 0x04u, 0x04u, 0x04u, 0x04u, 0x00u, 0x04u}, /* ! */
    {0x08u, 0x04u, 0x02u, 0x01u, 0x02u, 0x04u, 0x08u}, /* > */
    {0x02u, 0x04u, 0x08u, 0x10u, 0x08u, 0x04u, 0x02u}  /* < */
};

/* Four tiny star tiles. Pixels use palette entries 1, 2, and 3. */
static const uint8_t star_tiles[STAR_TILE_COUNT * 16u] = {
    0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x08u, 0x00u,
    0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x00u,
    0x00u, 0x00u, 0x00u, 0x00u, 0x40u, 0x00u, 0x00u, 0x00u,
    0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x04u, 0x00u, 0x00u,
    0x00u, 0x00u, 0x00u, 0x00u, 0x00u, 0x10u, 0x00u, 0x38u,
    0x10u, 0x7Cu, 0x00u, 0x38u, 0x00u, 0x10u, 0x00u, 0x00u,
    0x00u, 0x00u, 0x00u, 0x00u, 0x24u, 0x24u, 0x18u, 0x18u,
    0x7Eu, 0x7Eu, 0x18u, 0x18u, 0x24u, 0x24u, 0x00u, 0x00u
};

/* Twelve original 8x8 sprite tiles in Game Boy 2bpp row-pair format. */
static const uint8_t sprite_tiles[SPRITE_TILE_COUNT * 16u] = {
    /* player left */
    0x01u, 0x07u, 0x03u, 0x1Fu, 0x0Fu, 0x3Fu, 0x3Fu, 0xFFu,
    0x0Fu, 0x3Fu, 0x03u, 0x1Fu, 0x01u, 0x07u, 0x00u, 0x02u,
    /* player right */
    0x80u, 0xE0u, 0xC0u, 0xF8u, 0xF0u, 0xFCu, 0xFCu, 0xFFu,
    0xF0u, 0xFCu, 0xC0u, 0xF8u, 0x80u, 0xE0u, 0x00u, 0x40u,
    /* player shot */
    0x18u, 0x18u, 0x18u, 0x3Cu, 0x18u, 0x3Cu, 0x18u, 0x3Cu,
    0x18u, 0x3Cu, 0x18u, 0x3Cu, 0x18u, 0x18u, 0x00u, 0x00u,
    /* enemy scout */
    0x00u, 0x18u, 0x18u, 0x3Cu, 0x3Cu, 0x7Eu, 0x66u, 0xFFu,
    0x24u, 0x7Eu, 0x18u, 0x3Cu, 0x00u, 0x18u, 0x00u, 0x00u,
    /* enemy wing */
    0x00u, 0x42u, 0x42u, 0xE7u, 0x24u, 0x7Eu, 0x3Cu, 0xFFu,
    0x18u, 0x7Eu, 0x18u, 0x3Cu, 0x00u, 0x18u, 0x00u, 0x00u,
    /* enemy shot */
    0x00u, 0x00u, 0x18u, 0x18u, 0x3Cu, 0x3Cu, 0x7Eu, 0x7Eu,
    0x3Cu, 0x3Cu, 0x18u, 0x18u, 0x00u, 0x00u, 0x00u, 0x00u,
    /* explosion A */
    0x00u, 0x81u, 0x24u, 0x24u, 0x18u, 0x5Au, 0x42u, 0xA5u,
    0x18u, 0x5Au, 0x24u, 0x24u, 0x00u, 0x81u, 0x00u, 0x00u,
    /* explosion B */
    0x24u, 0xA5u, 0x00u, 0x5Au, 0x5Au, 0x7Eu, 0x24u, 0xFFu,
    0x5Au, 0x7Eu, 0x00u, 0x5Au, 0x24u, 0xA5u, 0x00u, 0x00u,
    /* boss top left */
    0x03u, 0x0Fu, 0x0Fu, 0x3Fu, 0x1Fu, 0x7Fu, 0x3Fu, 0xFFu,
    0x36u, 0xFFu, 0x3Fu, 0xFFu, 0x1Fu, 0x7Fu, 0x0Fu, 0x3Fu,
    /* boss top right */
    0xC0u, 0xF0u, 0xF0u, 0xFCu, 0xF8u, 0xFEu, 0xFCu, 0xFFu,
    0x6Cu, 0xFFu, 0xFCu, 0xFFu, 0xF8u, 0xFEu, 0xF0u, 0xFCu,
    /* boss bottom left */
    0x0Fu, 0x3Fu, 0x1Fu, 0x7Fu, 0x3Fu, 0xFFu, 0x1Fu, 0x7Fu,
    0x0Fu, 0x3Fu, 0x07u, 0x1Fu, 0x03u, 0x0Fu, 0x01u, 0x03u,
    /* boss bottom right */
    0xF0u, 0xFCu, 0xF8u, 0xFEu, 0xFCu, 0xFFu, 0xF8u, 0xFEu,
    0xF0u, 0xFCu, 0xE0u, 0xF8u, 0xC0u, 0xF0u, 0x80u, 0xC0u
};

static const palette_color_t background_palettes[8] = {
    RGB(0u, 0u, 2u), RGB(2u, 5u, 12u), RGB(6u, 18u, 24u), RGB(27u, 31u, 31u),
    RGB(0u, 0u, 3u), RGB(10u, 4u, 18u), RGB(31u, 21u, 3u), RGB(31u, 31u, 25u)
};

static const palette_color_t sprite_palettes[16] = {
    RGB(0u, 0u, 0u), RGB(2u, 10u, 31u), RGB(2u, 27u, 31u), RGB(31u, 31u, 31u),
    RGB(0u, 0u, 0u), RGB(24u, 7u, 0u), RGB(31u, 24u, 2u), RGB(31u, 31u, 25u),
    RGB(0u, 0u, 0u), RGB(18u, 0u, 6u), RGB(31u, 3u, 19u), RGB(31u, 25u, 30u),
    RGB(0u, 0u, 0u), RGB(15u, 0u, 0u), RGB(31u, 9u, 0u), RGB(31u, 29u, 5u)
};

static uint8_t tile_scratch[16];
static uint8_t row_buffer[MAP_TILE_WIDTH];
static uint8_t window_map[SCREEN_TILE_WIDTH * 2u];

static PlayerShot player_shots[MAX_PLAYER_SHOTS];
static EnemyShot enemy_shots[MAX_ENEMY_SHOTS];
static Enemy enemies[MAX_ENEMIES];
static Boss boss;

static uint16_t high_scores[5];
static uint16_t score;
static uint8_t latest_rank;
static uint8_t is_cgb;
static uint8_t lcd_active;
static uint8_t rng_state;

static uint8_t player_x;
static uint8_t player_y;
static uint8_t player_lives;
static uint8_t player_invulnerable;
static uint8_t fire_cooldown;

static uint8_t elapsed_seconds;
static uint8_t time_minutes;
static uint8_t time_seconds;
static uint8_t frame_in_second;
static uint8_t spawn_timer;
static uint8_t spawn_sequence;
static uint8_t animation_frame;
static uint8_t paused;
static uint8_t hud_dirty;
static uint8_t warning_timer;
static uint8_t stage_clear_ready;

static uint8_t tile_for_character(char character) {
    if ((character >= '0') && (character <= '9')) {
        return (uint8_t)(1u + (uint8_t)(character - '0'));
    }
    if ((character >= 'A') && (character <= 'Z')) {
        return (uint8_t)(11u + (uint8_t)(character - 'A'));
    }
    switch (character) {
        case '-': return 37u;
        case ':': return 38u;
        case '.': return 39u;
        case '/': return 40u;
        case '!': return 41u;
        case '>': return 42u;
        case '<': return 43u;
        default: return 0u;
    }
}

static void load_font_tiles(void) {
    uint8_t tile;
    uint8_t row;
    uint8_t bits;

    for (tile = 0u; tile != FONT_TILE_COUNT; ++tile) {
        for (row = 0u; row != 7u; ++row) {
            bits = (uint8_t)(glyph_rows[tile][row] << 2u);
            tile_scratch[(uint8_t)(row << 1u)] = bits;
            tile_scratch[(uint8_t)((row << 1u) + 1u)] = bits;
        }
        tile_scratch[14] = 0u;
        tile_scratch[15] = 0u;
        set_bkg_data(tile, 1u, tile_scratch);
    }
}

static void hide_all_sprites(void) {
    uint8_t sprite;

    for (sprite = 0u; sprite != HARDWARE_SPRITE_COUNT; ++sprite) {
        move_sprite(sprite, 0u, 0u);
    }
}

static void turn_display_off(void) {
    if (lcd_active != 0u) {
        vsync();
        DISPLAY_OFF;
        lcd_active = 0u;
    }
}

static void turn_display_on(uint8_t show_window, uint8_t show_sprites) {
    SHOW_BKG;
    if (show_window != 0u) {
        SHOW_WIN;
    } else {
        HIDE_WIN;
    }
    if (show_sprites != 0u) {
        SHOW_SPRITES;
    } else {
        HIDE_SPRITES;
    }
    DISPLAY_ON;
    lcd_active = 1u;
}

static void build_starfield(void) {
    uint8_t x;
    uint8_t y;
    uint8_t pattern;

    for (y = 0u; y != MAP_TILE_HEIGHT; ++y) {
        for (x = 0u; x != MAP_TILE_WIDTH; ++x) {
            pattern = (uint8_t)(((uint8_t)(x * 7u) + (uint8_t)(y * 11u) + (x ^ y)) & 31u);
            if (pattern == 0u) {
                row_buffer[x] = (uint8_t)(STAR_TILE_FIRST + 3u);
            } else if (pattern < 3u) {
                row_buffer[x] = (uint8_t)(STAR_TILE_FIRST + 2u);
            } else if (pattern < 7u) {
                row_buffer[x] = (uint8_t)(STAR_TILE_FIRST + (pattern & 1u));
            } else {
                row_buffer[x] = 0u;
            }
        }
        set_bkg_tiles(0u, y, MAP_TILE_WIDTH, 1u, row_buffer);
    }

    if (is_cgb != 0u) {
        for (x = 0u; x != MAP_TILE_WIDTH; ++x) {
            row_buffer[x] = BKGF_CGB_PAL0;
        }
        VBK_REG = 1u;
        for (y = 0u; y != MAP_TILE_HEIGHT; ++y) {
            set_bkg_tiles(0u, y, MAP_TILE_WIDTH, 1u, row_buffer);
        }
        VBK_REG = 0u;
    }
}

static void write_background_text(uint8_t x, uint8_t y, const char *text) {
    uint8_t length;

    length = 0u;
    while ((text[length] != '\0') && ((uint8_t)(x + length) < SCREEN_TILE_WIDTH)) {
        row_buffer[length] = tile_for_character(text[length]);
        ++length;
    }
    if (length != 0u) {
        set_bkg_tiles(x, y, length, 1u, row_buffer);
    }
}

static void blank_background_text(uint8_t x, uint8_t y, uint8_t length) {
    uint8_t index;

    for (index = 0u; index != length; ++index) {
        row_buffer[index] = 0u;
    }
    set_bkg_tiles(x, y, length, 1u, row_buffer);
}

static void uint16_to_tiles(uint16_t value, uint8_t *destination) {
    uint16_t divisor;
    uint8_t digit;
    uint8_t index;

    divisor = 10000u;
    for (index = 0u; index != 5u; ++index) {
        digit = (uint8_t)(value / divisor);
        destination[index] = (uint8_t)(1u + digit);
        value = (uint16_t)(value - (uint16_t)((uint16_t)digit * divisor));
        divisor = (uint16_t)(divisor / 10u);
    }
}

static void write_background_score(uint8_t x, uint8_t y, uint16_t value) {
    uint16_to_tiles(value, row_buffer);
    set_bkg_tiles(x, y, 5u, 1u, row_buffer);
}

static void write_window_text(uint8_t x, uint8_t y, const char *text) {
    uint8_t offset;

    offset = 0u;
    while ((text[offset] != '\0') && ((uint8_t)(x + offset) < SCREEN_TILE_WIDTH)) {
        window_map[(uint8_t)(y * SCREEN_TILE_WIDTH + x + offset)] = tile_for_character(text[offset]);
        ++offset;
    }
}

static void wait_for_input_release(void) {
    while (joypad() != 0u) {
        vsync();
    }
}

static uint8_t random_byte(void) {
    if ((rng_state & 1u) != 0u) {
        rng_state = (uint8_t)((rng_state >> 1u) ^ 0xB8u);
    } else {
        rng_state >>= 1u;
    }
    if (rng_state == 0u) {
        rng_state = 0xA5u;
    }
    return rng_state;
}

static uint8_t sprite_property(uint8_t color_palette, uint8_t dmg_palette_one) {
    if (is_cgb != 0u) {
        return color_palette;
    }
    return (dmg_palette_one != 0u) ? OAMF_PAL1 : OAMF_PAL0;
}

static void initialize_sound(void) {
    NR52_REG = 0x80u;
    NR50_REG = 0x77u;
    NR51_REG = 0xFFu;
}

static void sound_fire(void) {
    NR10_REG = 0x00u;
    NR11_REG = 0x80u;
    NR12_REG = 0x42u;
    NR13_REG = 0xC0u;
    NR14_REG = 0x87u;
}

static void sound_enemy_down(void) {
    NR41_REG = 0x08u;
    NR42_REG = 0x73u;
    NR43_REG = 0x35u;
    NR44_REG = 0x80u;
}

static void sound_player_down(void) {
    NR41_REG = 0x00u;
    NR42_REG = 0xF4u;
    NR43_REG = 0x65u;
    NR44_REG = 0x80u;
}

static void sound_clear(void) {
    NR10_REG = 0x16u;
    NR11_REG = 0x40u;
    NR12_REG = 0xF3u;
    NR13_REG = 0x70u;
    NR14_REG = 0x87u;
}

static uint8_t boxes_overlap(
    uint8_t ax,
    uint8_t ay,
    uint8_t aw,
    uint8_t ah,
    uint8_t bx,
    uint8_t by,
    uint8_t bw,
    uint8_t bh
) {
    if ((uint8_t)(ax + aw) <= bx) return 0u;
    if ((uint8_t)(bx + bw) <= ax) return 0u;
    if ((uint8_t)(ay + ah) <= by) return 0u;
    if ((uint8_t)(by + bh) <= ay) return 0u;
    return 1u;
}

static void add_score(uint16_t points) {
    if (score > (uint16_t)(65535u - points)) {
        score = 65535u;
    } else {
        score = (uint16_t)(score + points);
    }
    hud_dirty = 1u;
}

static uint8_t record_score(uint16_t value) {
    uint8_t index;
    uint8_t shift;

    for (index = 0u; index != 5u; ++index) {
        if (value >= high_scores[index]) {
            for (shift = 4u; shift > index; --shift) {
                high_scores[shift] = high_scores[(uint8_t)(shift - 1u)];
            }
            high_scores[index] = value;
            return (uint8_t)(index + 1u);
        }
    }
    return 0u;
}

static void initialize_hardware(void) {
    DISPLAY_OFF;
    lcd_active = 0u;
    is_cgb = (_cpu == CGB_TYPE) ? 1u : 0u;

    LCDC_REG &= (uint8_t)~(LCDCF_BG9C00 | LCDCF_OBJ16);
    LCDC_REG |= (LCDCF_BG8000 | LCDCF_WIN9C00);
    SPRITES_8x8;
    BGP_REG = 0x1Bu;
    OBP0_REG = 0x1Bu;
    OBP1_REG = 0x24u;

    if (is_cgb != 0u) {
        VBK_REG = 0u;
        set_bkg_palette(0u, 2u, background_palettes);
        set_sprite_palette(0u, 4u, sprite_palettes);
    }

    load_font_tiles();
    set_bkg_data(STAR_TILE_FIRST, STAR_TILE_COUNT, star_tiles);
    set_sprite_data(SPRITE_TILE_FIRST, SPRITE_TILE_COUNT, sprite_tiles);
    hide_all_sprites();
    initialize_sound();

    rng_state = 0x6Du;
    SCX_REG = 0u;
    SCY_REG = 0u;
    move_win(7u, 0u);
}

static uint8_t run_title(void) {
    uint8_t keys;
    uint8_t previous_keys;
    uint8_t pressed;
    uint8_t blink_timer;
    uint8_t prompt_visible;

    turn_display_off();
    HIDE_WIN;
    HIDE_SPRITES;
    hide_all_sprites();
    SCX_REG = 0u;
    SCY_REG = 0u;
    build_starfield();
    write_background_text(3u, 2u, "STAR CARAVAN");
    write_background_text(2u, 4u, "2 MINUTE ATTACK");
    write_background_text(1u, 7u, "A OR START  LAUNCH");
    write_background_text(2u, 9u, "SELECT  SCORES");
    write_background_text(3u, 12u, "MOVE  D-PAD");
    write_background_text(3u, 13u, "FIRE  A OR B");
    write_background_text(3u, 16u, "DMG / COLOR");
    turn_display_on(0u, 0u);

    wait_for_input_release();
    previous_keys = 0u;
    blink_timer = 0u;
    prompt_visible = 1u;
    for (;;) {
        vsync();
        keys = joypad();
        pressed = (uint8_t)(keys & (uint8_t)~previous_keys);
        previous_keys = keys;

        ++blink_timer;
        if (blink_timer == 30u) {
            blink_timer = 0u;
            prompt_visible ^= 1u;
            if (prompt_visible != 0u) {
                write_background_text(1u, 7u, "A OR START  LAUNCH");
            } else {
                blank_background_text(1u, 7u, 18u);
            }
        }

        if ((pressed & (J_A | J_START)) != 0u) {
            return SCENE_GAME;
        }
        if ((pressed & J_SELECT) != 0u) {
            return SCENE_SCORES;
        }
    }
}

static uint8_t run_scoreboard(void) {
    uint8_t index;
    uint8_t row;
    uint8_t keys;
    uint8_t previous_keys;
    uint8_t pressed;

    turn_display_off();
    HIDE_WIN;
    HIDE_SPRITES;
    hide_all_sprites();
    SCX_REG = 0u;
    SCY_REG = 0u;
    build_starfield();
    write_background_text(4u, 2u, "SCOREBOARD");
    write_background_text(3u, 4u, "RANK   SCORE");

    for (index = 0u; index != 5u; ++index) {
        row = (uint8_t)(6u + (index << 1u));
        row_buffer[0] = (uint8_t)(2u + index);
        set_bkg_tiles(4u, row, 1u, 1u, row_buffer);
        write_background_score(10u, row, high_scores[index]);
    }
    write_background_text(6u, 16u, "A  BACK");
    turn_display_on(0u, 0u);

    wait_for_input_release();
    previous_keys = 0u;
    for (;;) {
        vsync();
        keys = joypad();
        pressed = (uint8_t)(keys & (uint8_t)~previous_keys);
        previous_keys = keys;
        if ((pressed & (J_A | J_B | J_START | J_SELECT)) != 0u) {
            return SCENE_TITLE;
        }
    }
}

static void clear_entities(void) {
    uint8_t index;

    for (index = 0u; index != MAX_PLAYER_SHOTS; ++index) {
        player_shots[index].active = 0u;
    }
    for (index = 0u; index != MAX_ENEMY_SHOTS; ++index) {
        enemy_shots[index].active = 0u;
    }
    for (index = 0u; index != MAX_ENEMIES; ++index) {
        enemies[index].state = ENEMY_INACTIVE;
    }
    boss.state = BOSS_INACTIVE;
    hide_all_sprites();
}

static void configure_game_sprites(void) {
    uint8_t index;
    uint8_t player_property;
    uint8_t player_shot_property;
    uint8_t enemy_property;
    uint8_t enemy_shot_property;
    uint8_t boss_property;

    player_property = sprite_property(OAMF_CGB_PAL0, 0u);
    player_shot_property = sprite_property(OAMF_CGB_PAL1, 1u);
    enemy_property = sprite_property(OAMF_CGB_PAL2, 1u);
    enemy_shot_property = sprite_property(OAMF_CGB_PAL1, 1u);
    boss_property = sprite_property(OAMF_CGB_PAL3, 1u);

    set_sprite_tile(PLAYER_SPRITE_LEFT, SPRITE_TILE_PLAYER_LEFT);
    set_sprite_tile(PLAYER_SPRITE_RIGHT, SPRITE_TILE_PLAYER_RIGHT);
    set_sprite_prop(PLAYER_SPRITE_LEFT, player_property);
    set_sprite_prop(PLAYER_SPRITE_RIGHT, player_property);

    for (index = 0u; index != MAX_PLAYER_SHOTS; ++index) {
        set_sprite_tile((uint8_t)(PLAYER_SHOT_SPRITE_FIRST + index), SPRITE_TILE_PLAYER_SHOT);
        set_sprite_prop((uint8_t)(PLAYER_SHOT_SPRITE_FIRST + index), player_shot_property);
    }
    for (index = 0u; index != MAX_ENEMIES; ++index) {
        set_sprite_tile((uint8_t)(ENEMY_SPRITE_FIRST + index), SPRITE_TILE_ENEMY_SCOUT);
        set_sprite_prop((uint8_t)(ENEMY_SPRITE_FIRST + index), enemy_property);
    }
    for (index = 0u; index != MAX_ENEMY_SHOTS; ++index) {
        set_sprite_tile((uint8_t)(ENEMY_SHOT_SPRITE_FIRST + index), SPRITE_TILE_ENEMY_SHOT);
        set_sprite_prop((uint8_t)(ENEMY_SHOT_SPRITE_FIRST + index), enemy_shot_property);
    }
    for (index = 0u; index != 4u; ++index) {
        set_sprite_prop((uint8_t)(BOSS_SPRITE_FIRST + index), boss_property);
    }
    set_sprite_tile(BOSS_SPRITE_FIRST, SPRITE_TILE_BOSS_TL);
    set_sprite_tile((uint8_t)(BOSS_SPRITE_FIRST + 1u), SPRITE_TILE_BOSS_TR);
    set_sprite_tile((uint8_t)(BOSS_SPRITE_FIRST + 2u), SPRITE_TILE_BOSS_BL);
    set_sprite_tile((uint8_t)(BOSS_SPRITE_FIRST + 3u), SPRITE_TILE_BOSS_BR);
}

static void reset_game(void) {
    uint8_t index;

    turn_display_off();
    HIDE_WIN;
    HIDE_SPRITES;
    SCX_REG = 0u;
    SCY_REG = 0u;
    build_starfield();
    clear_entities();
    configure_game_sprites();

    score = 0u;
    player_x = PLAYER_START_X;
    player_y = PLAYER_START_Y;
    player_lives = 3u;
    player_invulnerable = PLAYER_INVULNERABLE_FRAMES;
    fire_cooldown = 0u;
    elapsed_seconds = 0u;
    time_minutes = (uint8_t)(CARAVAN_SECONDS / 60u);
    time_seconds = (uint8_t)(CARAVAN_SECONDS % 60u);
    frame_in_second = 0u;
    spawn_timer = 20u;
    spawn_sequence = 0u;
    animation_frame = 0u;
    paused = 0u;
    hud_dirty = 1u;
    warning_timer = 0u;
    stage_clear_ready = 0u;

    move_win(7u, 0u);
    if (is_cgb != 0u) {
        for (index = 0u; index != (SCREEN_TILE_WIDTH * 2u); ++index) {
            window_map[index] = BKGF_CGB_PAL1;
        }
        VBK_REG = 1u;
        set_win_tiles(0u, 0u, SCREEN_TILE_WIDTH, 2u, window_map);
        VBK_REG = 0u;
    }
    turn_display_on(1u, 1u);
}

static void update_hud(void) {
    uint8_t index;

    for (index = 0u; index != (SCREEN_TILE_WIDTH * 2u); ++index) {
        window_map[index] = 0u;
    }
    write_window_text(0u, 0u, "SCORE");
    uint16_to_tiles(score, &window_map[6]);
    write_window_text(13u, 0u, "T");
    window_map[15] = (uint8_t)(1u + time_minutes);
    window_map[16] = 38u;
    window_map[17] = (uint8_t)(1u + (time_seconds / 10u));
    window_map[18] = (uint8_t)(1u + (time_seconds - (uint8_t)((time_seconds / 10u) * 10u)));

    if (paused != 0u) {
        write_window_text(7u, 1u, "PAUSED");
    } else if (warning_timer != 0u) {
        write_window_text(6u, 1u, "WARNING!");
    } else {
        write_window_text(0u, 1u, "LIVES");
        window_map[6] = (uint8_t)(1u + player_lives);
        if (boss.state == BOSS_ACTIVE) {
            write_window_text(10u, 1u, "BOSS");
            window_map[15] = (uint8_t)(1u + (boss.hp / 10u));
            window_map[16] = (uint8_t)(1u + (boss.hp - (uint8_t)((boss.hp / 10u) * 10u)));
        } else {
            write_window_text(10u, 1u, "STAGE 1");
        }
    }

    if (is_cgb != 0u) {
        VBK_REG = 0u;
    }
    set_win_tiles(0u, 0u, SCREEN_TILE_WIDTH, 2u, window_map);
    hud_dirty = 0u;
}

static void draw_player(void) {
    if ((player_invulnerable != 0u) && ((player_invulnerable & 0x04u) != 0u)) {
        move_sprite(PLAYER_SPRITE_LEFT, 0u, 0u);
        move_sprite(PLAYER_SPRITE_RIGHT, 0u, 0u);
        return;
    }
    move_sprite(PLAYER_SPRITE_LEFT, (uint8_t)(player_x + 8u), (uint8_t)(player_y + 16u));
    move_sprite(PLAYER_SPRITE_RIGHT, (uint8_t)(player_x + 16u), (uint8_t)(player_y + 16u));
}

static void spawn_player_shot(void) {
    uint8_t index;

    for (index = 0u; index != MAX_PLAYER_SHOTS; ++index) {
        if (player_shots[index].active == 0u) {
            player_shots[index].active = 1u;
            player_shots[index].x = (uint8_t)(player_x + 4u);
            player_shots[index].y = (uint8_t)(player_y - 5u);
            sound_fire();
            return;
        }
    }
}

static void update_player_shots(void) {
    uint8_t index;
    uint8_t sprite;

    for (index = 0u; index != MAX_PLAYER_SHOTS; ++index) {
        sprite = (uint8_t)(PLAYER_SHOT_SPRITE_FIRST + index);
        if (player_shots[index].active == 0u) {
            move_sprite(sprite, 0u, 0u);
        } else if (player_shots[index].y <= 18u) {
            player_shots[index].active = 0u;
            move_sprite(sprite, 0u, 0u);
        } else {
            player_shots[index].y = (uint8_t)(player_shots[index].y - 4u);
            move_sprite(
                sprite,
                (uint8_t)(player_shots[index].x + 8u),
                (uint8_t)(player_shots[index].y + 16u)
            );
        }
    }
}

static void spawn_enemy_shot(uint8_t x, uint8_t y, int8_t dx) {
    uint8_t index;

    for (index = 0u; index != MAX_ENEMY_SHOTS; ++index) {
        if (enemy_shots[index].active == 0u) {
            enemy_shots[index].active = 1u;
            enemy_shots[index].x = x;
            enemy_shots[index].y = y;
            enemy_shots[index].dx = dx;
            return;
        }
    }
}

static void update_enemy_shots(void) {
    uint8_t index;
    uint8_t sprite;

    for (index = 0u; index != MAX_ENEMY_SHOTS; ++index) {
        sprite = (uint8_t)(ENEMY_SHOT_SPRITE_FIRST + index);
        if (enemy_shots[index].active == 0u) {
            move_sprite(sprite, 0u, 0u);
            continue;
        }

        if ((animation_frame & 1u) == 0u) {
            ++enemy_shots[index].y;
            if (enemy_shots[index].dx < 0) {
                if (enemy_shots[index].x != 0u) {
                    --enemy_shots[index].x;
                }
            } else if (enemy_shots[index].dx > 0) {
                if (enemy_shots[index].x < 152u) {
                    ++enemy_shots[index].x;
                }
            }
        }

        if (enemy_shots[index].y > 143u) {
            enemy_shots[index].active = 0u;
            move_sprite(sprite, 0u, 0u);
        } else {
            move_sprite(
                sprite,
                (uint8_t)(enemy_shots[index].x + 8u),
                (uint8_t)(enemy_shots[index].y + 16u)
            );
        }
    }
}

static void spawn_enemy(void) {
    uint8_t index;
    uint8_t type;

    for (index = 0u; index != MAX_ENEMIES; ++index) {
        if (enemies[index].state == ENEMY_INACTIVE) {
            type = (uint8_t)(spawn_sequence % 3u);
            ++spawn_sequence;
            enemies[index].state = ENEMY_ACTIVE;
            enemies[index].x = (uint8_t)(4u + (random_byte() % 145u));
            enemies[index].y = 17u;
            enemies[index].type = type;
            enemies[index].hp = (type == 2u) ? 2u : 1u;
            enemies[index].direction = (random_byte() & 1u);
            enemies[index].phase = 0u;
            enemies[index].shot_timer = (uint8_t)(45u + (random_byte() & 31u));
            enemies[index].state_timer = 0u;
            return;
        }
    }
}

static void explode_enemy(uint8_t index) {
    if (enemies[index].state != ENEMY_ACTIVE) {
        return;
    }
    if (enemies[index].type == 0u) {
        add_score(100u);
    } else if (enemies[index].type == 1u) {
        add_score(150u);
    } else {
        add_score(250u);
    }
    enemies[index].state = ENEMY_EXPLODING;
    enemies[index].state_timer = 12u;
    sound_enemy_down();
}

static void update_enemies(void) {
    uint8_t index;
    uint8_t sprite;
    int8_t aim;

    for (index = 0u; index != MAX_ENEMIES; ++index) {
        sprite = (uint8_t)(ENEMY_SPRITE_FIRST + index);
        if (enemies[index].state == ENEMY_INACTIVE) {
            move_sprite(sprite, 0u, 0u);
            continue;
        }
        if (enemies[index].state == ENEMY_EXPLODING) {
            --enemies[index].state_timer;
            set_sprite_tile(
                sprite,
                ((enemies[index].state_timer & 0x04u) != 0u) ? SPRITE_TILE_EXPLOSION_A : SPRITE_TILE_EXPLOSION_B
            );
            move_sprite(sprite, (uint8_t)(enemies[index].x + 8u), (uint8_t)(enemies[index].y + 16u));
            if (enemies[index].state_timer == 0u) {
                enemies[index].state = ENEMY_INACTIVE;
                move_sprite(sprite, 0u, 0u);
            }
            continue;
        }

        ++enemies[index].phase;
        if (enemies[index].type == 0u) {
            enemies[index].y = (uint8_t)(enemies[index].y + 2u);
            set_sprite_tile(sprite, SPRITE_TILE_ENEMY_SCOUT);
        } else if (enemies[index].type == 1u) {
            ++enemies[index].y;
            if ((enemies[index].phase & 0x03u) == 0u) {
                if (enemies[index].direction == 0u) {
                    if (enemies[index].x > 3u) {
                        --enemies[index].x;
                    } else {
                        enemies[index].direction = 1u;
                    }
                } else if (enemies[index].x < 149u) {
                    ++enemies[index].x;
                } else {
                    enemies[index].direction = 0u;
                }
            }
            set_sprite_tile(sprite, SPRITE_TILE_ENEMY_WING);
        } else {
            ++enemies[index].y;
            if ((enemies[index].phase & 0x07u) == 0u) {
                if ((uint8_t)(enemies[index].x + 4u) < (uint8_t)(player_x + 8u)) {
                    ++enemies[index].x;
                } else if (enemies[index].x > player_x) {
                    --enemies[index].x;
                }
            }
            set_sprite_tile(
                sprite,
                ((animation_frame & 0x08u) != 0u) ? SPRITE_TILE_ENEMY_WING : SPRITE_TILE_ENEMY_SCOUT
            );
        }

        /* Only armored hunters fire. This keeps the early waves readable on DMG. */
        if (enemies[index].type == 2u) {
            if (enemies[index].shot_timer != 0u) {
                --enemies[index].shot_timer;
            } else if ((enemies[index].y > 24u) && (enemies[index].y < 112u)) {
                if ((uint8_t)(player_x + 8u) < enemies[index].x) {
                    aim = -1;
                } else if (player_x > (uint8_t)(enemies[index].x + 8u)) {
                    aim = 1;
                } else {
                    aim = 0;
                }
                spawn_enemy_shot((uint8_t)(enemies[index].x + 1u), (uint8_t)(enemies[index].y + 7u), aim);
                enemies[index].shot_timer = (uint8_t)(96u + (random_byte() & 63u));
            }
        }

        if (enemies[index].y > 143u) {
            enemies[index].state = ENEMY_INACTIVE;
            move_sprite(sprite, 0u, 0u);
        } else {
            move_sprite(sprite, (uint8_t)(enemies[index].x + 8u), (uint8_t)(enemies[index].y + 16u));
        }
    }
}

static void clear_enemy_wave(void) {
    uint8_t index;

    for (index = 0u; index != MAX_ENEMIES; ++index) {
        enemies[index].state = ENEMY_INACTIVE;
        move_sprite((uint8_t)(ENEMY_SPRITE_FIRST + index), 0u, 0u);
    }
    for (index = 0u; index != MAX_ENEMY_SHOTS; ++index) {
        enemy_shots[index].active = 0u;
        move_sprite((uint8_t)(ENEMY_SHOT_SPRITE_FIRST + index), 0u, 0u);
    }
}

static void spawn_boss(void) {
    clear_enemy_wave();
    boss.state = BOSS_ACTIVE;
    boss.x = 72u;
    boss.y = 24u;
    boss.hp = BOSS_START_HP;
    boss.direction = 1u;
    boss.move_timer = 0u;
    boss.shot_timer = 20u;
    boss.state_timer = 0u;
    warning_timer = 120u;
    hud_dirty = 1u;
}

static void draw_boss(void) {
    uint8_t tile;

    if (boss.state == BOSS_INACTIVE) {
        move_sprite(BOSS_SPRITE_FIRST, 0u, 0u);
        move_sprite((uint8_t)(BOSS_SPRITE_FIRST + 1u), 0u, 0u);
        move_sprite((uint8_t)(BOSS_SPRITE_FIRST + 2u), 0u, 0u);
        move_sprite((uint8_t)(BOSS_SPRITE_FIRST + 3u), 0u, 0u);
        return;
    }

    if (boss.state == BOSS_EXPLODING) {
        tile = ((boss.state_timer & 0x08u) != 0u) ? SPRITE_TILE_EXPLOSION_A : SPRITE_TILE_EXPLOSION_B;
        set_sprite_tile(BOSS_SPRITE_FIRST, tile);
        set_sprite_tile((uint8_t)(BOSS_SPRITE_FIRST + 1u), tile);
        set_sprite_tile((uint8_t)(BOSS_SPRITE_FIRST + 2u), tile);
        set_sprite_tile((uint8_t)(BOSS_SPRITE_FIRST + 3u), tile);
    } else {
        set_sprite_tile(BOSS_SPRITE_FIRST, SPRITE_TILE_BOSS_TL);
        set_sprite_tile((uint8_t)(BOSS_SPRITE_FIRST + 1u), SPRITE_TILE_BOSS_TR);
        set_sprite_tile((uint8_t)(BOSS_SPRITE_FIRST + 2u), SPRITE_TILE_BOSS_BL);
        set_sprite_tile((uint8_t)(BOSS_SPRITE_FIRST + 3u), SPRITE_TILE_BOSS_BR);
    }

    move_sprite(BOSS_SPRITE_FIRST, (uint8_t)(boss.x + 8u), (uint8_t)(boss.y + 16u));
    move_sprite((uint8_t)(BOSS_SPRITE_FIRST + 1u), (uint8_t)(boss.x + 16u), (uint8_t)(boss.y + 16u));
    move_sprite((uint8_t)(BOSS_SPRITE_FIRST + 2u), (uint8_t)(boss.x + 8u), (uint8_t)(boss.y + 24u));
    move_sprite((uint8_t)(BOSS_SPRITE_FIRST + 3u), (uint8_t)(boss.x + 16u), (uint8_t)(boss.y + 24u));
}

static void update_boss(void) {
    if (boss.state == BOSS_INACTIVE) {
        draw_boss();
        return;
    }
    if (boss.state == BOSS_EXPLODING) {
        if (boss.state_timer != 0u) {
            --boss.state_timer;
            draw_boss();
        } else {
            boss.state = BOSS_INACTIVE;
            draw_boss();
            stage_clear_ready = 1u;
        }
        return;
    }

    ++boss.move_timer;
    if ((boss.move_timer & 0x01u) == 0u) {
        if (boss.direction == 0u) {
            if (boss.x > 16u) {
                --boss.x;
            } else {
                boss.direction = 1u;
            }
        } else if (boss.x < 128u) {
            ++boss.x;
        } else {
            boss.direction = 0u;
        }
    }

    if (boss.shot_timer != 0u) {
        --boss.shot_timer;
    } else {
        spawn_enemy_shot((uint8_t)(boss.x + 2u), (uint8_t)(boss.y + 16u), -1);
        spawn_enemy_shot((uint8_t)(boss.x + 6u), (uint8_t)(boss.y + 16u), 0);
        spawn_enemy_shot((uint8_t)(boss.x + 10u), (uint8_t)(boss.y + 16u), 1);
        boss.shot_timer = 54u;
    }
    draw_boss();
}

static uint8_t hit_player(void) {
    uint8_t index;

    if (player_invulnerable != 0u) {
        return 0u;
    }
    sound_player_down();
    if (player_lives != 0u) {
        --player_lives;
    }
    hud_dirty = 1u;
    if (player_lives == 0u) {
        return 1u;
    }

    player_x = PLAYER_START_X;
    player_y = PLAYER_START_Y;
    player_invulnerable = PLAYER_INVULNERABLE_FRAMES;
    for (index = 0u; index != MAX_ENEMY_SHOTS; ++index) {
        enemy_shots[index].active = 0u;
        move_sprite((uint8_t)(ENEMY_SHOT_SPRITE_FIRST + index), 0u, 0u);
    }
    return 0u;
}

static uint8_t check_collisions(void) {
    uint8_t shot_index;
    uint8_t enemy_index;

    for (shot_index = 0u; shot_index != MAX_PLAYER_SHOTS; ++shot_index) {
        if (player_shots[shot_index].active == 0u) {
            continue;
        }

        if ((boss.state == BOSS_ACTIVE) && boxes_overlap(
            player_shots[shot_index].x,
            player_shots[shot_index].y,
            8u,
            6u,
            boss.x,
            boss.y,
            16u,
            16u
        )) {
            player_shots[shot_index].active = 0u;
            move_sprite((uint8_t)(PLAYER_SHOT_SPRITE_FIRST + shot_index), 0u, 0u);
            if (boss.hp != 0u) {
                --boss.hp;
                hud_dirty = 1u;
            }
            if (boss.hp == 0u) {
                add_score(5000u);
                boss.state = BOSS_EXPLODING;
                boss.state_timer = 72u;
                clear_enemy_wave();
                sound_clear();
            }
            continue;
        }

        for (enemy_index = 0u; enemy_index != MAX_ENEMIES; ++enemy_index) {
            if ((enemies[enemy_index].state == ENEMY_ACTIVE) && boxes_overlap(
                player_shots[shot_index].x,
                player_shots[shot_index].y,
                8u,
                6u,
                enemies[enemy_index].x,
                enemies[enemy_index].y,
                8u,
                8u
            )) {
                player_shots[shot_index].active = 0u;
                move_sprite((uint8_t)(PLAYER_SHOT_SPRITE_FIRST + shot_index), 0u, 0u);
                if (enemies[enemy_index].hp != 0u) {
                    --enemies[enemy_index].hp;
                }
                if (enemies[enemy_index].hp == 0u) {
                    explode_enemy(enemy_index);
                }
                break;
            }
        }
    }

    if (player_invulnerable != 0u) {
        return 0u;
    }

    for (enemy_index = 0u; enemy_index != MAX_ENEMIES; ++enemy_index) {
        if ((enemies[enemy_index].state == ENEMY_ACTIVE) && boxes_overlap(
            (uint8_t)(player_x + 7u),
            (uint8_t)(player_y + 3u),
            2u,
            2u,
            (uint8_t)(enemies[enemy_index].x + 2u),
            (uint8_t)(enemies[enemy_index].y + 2u),
            4u,
            4u
        )) {
            explode_enemy(enemy_index);
            return hit_player();
        }
    }

    for (shot_index = 0u; shot_index != MAX_ENEMY_SHOTS; ++shot_index) {
        if ((enemy_shots[shot_index].active != 0u) && boxes_overlap(
            (uint8_t)(player_x + 6u),
            (uint8_t)(player_y + 2u),
            4u,
            4u,
            (uint8_t)(enemy_shots[shot_index].x + 2u),
            (uint8_t)(enemy_shots[shot_index].y + 2u),
            4u,
            4u
        )) {
            enemy_shots[shot_index].active = 0u;
            move_sprite((uint8_t)(ENEMY_SHOT_SPRITE_FIRST + shot_index), 0u, 0u);
            return hit_player();
        }
    }

    if ((boss.state == BOSS_ACTIVE) && boxes_overlap(
        (uint8_t)(player_x + 4u),
        (uint8_t)(player_y + 2u),
        8u,
        4u,
        boss.x,
        boss.y,
        16u,
        16u
    )) {
        return hit_player();
    }
    return 0u;
}

static void update_game_clock(void) {
    ++frame_in_second;
    if (frame_in_second != 60u) {
        return;
    }
    frame_in_second = 0u;
    ++elapsed_seconds;
    if (time_seconds != 0u) {
        --time_seconds;
    } else if (time_minutes != 0u) {
        --time_minutes;
        time_seconds = 59u;
    }
    if (warning_timer != 0u) {
        if (warning_timer > 60u) {
            warning_timer = (uint8_t)(warning_timer - 60u);
        } else {
            warning_timer = 0u;
        }
    }
    hud_dirty = 1u;
}

static uint8_t run_game(void) {
    uint8_t keys;
    uint8_t previous_keys;
    uint8_t pressed;

    reset_game();
    wait_for_input_release();
    previous_keys = 0u;

    for (;;) {
        vsync();
        if (hud_dirty != 0u) {
            update_hud();
        }

        keys = joypad();
        pressed = (uint8_t)(keys & (uint8_t)~previous_keys);
        previous_keys = keys;
        if ((pressed & J_START) != 0u) {
            paused ^= 1u;
            hud_dirty = 1u;
        }
        if (paused != 0u) {
            continue;
        }

        if (((keys & J_LEFT) != 0u) && (player_x >= PLAYER_SPEED)) {
            player_x = (uint8_t)(player_x - PLAYER_SPEED);
        }
        if (((keys & J_RIGHT) != 0u) && (player_x <= (uint8_t)(PLAYER_MAX_X - PLAYER_SPEED))) {
            player_x = (uint8_t)(player_x + PLAYER_SPEED);
        }
        if (((keys & J_UP) != 0u) && (player_y >= (uint8_t)(PLAYER_MIN_Y + PLAYER_SPEED))) {
            player_y = (uint8_t)(player_y - PLAYER_SPEED);
        }
        if (((keys & J_DOWN) != 0u) && (player_y <= (uint8_t)(PLAYER_MAX_Y - PLAYER_SPEED))) {
            player_y = (uint8_t)(player_y + PLAYER_SPEED);
        }

        if (fire_cooldown != 0u) {
            --fire_cooldown;
        }
        if (((keys & (J_A | J_B)) != 0u) && (fire_cooldown == 0u)) {
            spawn_player_shot();
            fire_cooldown = 6u;
        }

        if (player_invulnerable != 0u) {
            --player_invulnerable;
        }
        ++animation_frame;
        ++SCY_REG;
        update_game_clock();

        if ((elapsed_seconds == BOSS_APPEAR_SECOND) && (boss.state == BOSS_INACTIVE)) {
            spawn_boss();
        }

        if (boss.state == BOSS_INACTIVE) {
            if (spawn_timer != 0u) {
                --spawn_timer;
            } else if (elapsed_seconds < BOSS_APPEAR_SECOND) {
                spawn_enemy();
                spawn_timer = (elapsed_seconds < 30u) ? 42u : 28u;
            }
        }

        update_player_shots();
        update_enemies();
        update_enemy_shots();
        update_boss();
        draw_player();

        if (check_collisions() != 0u) {
            return RESULT_GAME_OVER;
        }
        if (stage_clear_ready != 0u) {
            return RESULT_CLEAR;
        }
        if (elapsed_seconds >= CARAVAN_SECONDS) {
            add_score(2000u);
            sound_clear();
            return RESULT_CLEAR;
        }
    }
}

static uint8_t run_result_screen(uint8_t cleared) {
    uint8_t keys;
    uint8_t previous_keys;
    uint8_t pressed;

    turn_display_off();
    HIDE_WIN;
    HIDE_SPRITES;
    hide_all_sprites();
    SCX_REG = 0u;
    SCY_REG = 0u;
    build_starfield();

    if (cleared != 0u) {
        write_background_text(4u, 3u, "STAGE CLEAR");
        write_background_text(3u, 5u, "CARAVAN COMPLETE");
    } else {
        write_background_text(5u, 3u, "GAME OVER");
        write_background_text(3u, 5u, "MISSION ENDED");
    }
    write_background_text(5u, 8u, "SCORE");
    write_background_score(10u, 8u, score);
    if (latest_rank != 0u) {
        write_background_text(5u, 10u, "RANK");
        row_buffer[0] = (uint8_t)(1u + latest_rank);
        set_bkg_tiles(10u, 10u, 1u, 1u, row_buffer);
    }
    write_background_text(5u, 12u, "TIME");
    row_buffer[0] = (uint8_t)(1u + time_minutes);
    row_buffer[1] = 38u;
    row_buffer[2] = (uint8_t)(1u + (time_seconds / 10u));
    row_buffer[3] = (uint8_t)(1u + (time_seconds - (uint8_t)((time_seconds / 10u) * 10u)));
    set_bkg_tiles(10u, 12u, 4u, 1u, row_buffer);
    write_background_text(2u, 14u, "A OR START  TITLE");
    write_background_text(3u, 16u, "SELECT  SCORES");
    turn_display_on(0u, 0u);

    wait_for_input_release();
    previous_keys = 0u;
    for (;;) {
        vsync();
        keys = joypad();
        pressed = (uint8_t)(keys & (uint8_t)~previous_keys);
        previous_keys = keys;
        if ((pressed & J_SELECT) != 0u) {
            return SCENE_SCORES;
        }
        if ((pressed & (J_A | J_B | J_START)) != 0u) {
            return SCENE_TITLE;
        }
    }
}

void main(void) {
    uint8_t scene;
    uint8_t result;

    initialize_hardware();
    high_scores[0] = 0u;
    high_scores[1] = 0u;
    high_scores[2] = 0u;
    high_scores[3] = 0u;
    high_scores[4] = 0u;
    latest_rank = 0u;
    scene = SCENE_TITLE;

    for (;;) {
        if (scene == SCENE_TITLE) {
            scene = run_title();
        } else if (scene == SCENE_GAME) {
            result = run_game();
            latest_rank = record_score(score);
            scene = (result == RESULT_CLEAR) ? SCENE_CLEAR : SCENE_GAME_OVER;
        } else if (scene == SCENE_SCORES) {
            scene = run_scoreboard();
        } else if (scene == SCENE_CLEAR) {
            scene = run_result_screen(1u);
        } else {
            scene = run_result_screen(0u);
        }
    }
}
