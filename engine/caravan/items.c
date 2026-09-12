#pragma bank 255
#include "caravan.h"

extern uint8_t allocate(uint8_t kind, uint8_t asset);
extern void release(uint8_t slot);

uint8_t ce_shot_level, ce_speed_level;

/* Character selection is cold setup; keep it outside scarce fixed ROM bank 0. */
void ce_select_player(uint8_t index) BANKED {
    const CE_Player *p;
    ce_character = index < ce_player_count ? index : 0; p = &ce_players[ce_character];
    ce_player_asset=p->asset;ce_player_weapon=p->weapon;ce_player_speed=p->speed;
    ce_player_focus_weapon=p->focus_weapon;ce_player_focus_speed=p->focus_speed;
    ce_power_reset();
}

static uint8_t add_capped(uint8_t value, uint16_t amount, uint8_t maximum) {
    return value >= maximum || amount >= maximum - value ? maximum : value + amount;
}
static void apply_power(void) {
    if (ce_power_weapon_count) ce_player_weapon = ce_power_weapons[ce_shot_level];
    if (ce_power_speed_count) ce_player_speed = ce_power_speeds[ce_speed_level];
    ce_state.cooldown = 0; ce_state.player_sequence = 0;
}
void ce_power_reset(void) BANKED {
    ce_shot_level = ce_speed_level = 0; apply_power();
}
void ce_power_miss(void) BANKED {
    if (ce_power_shot_miss == 2u) ce_shot_level = 0;
    else if (ce_power_shot_miss == 1u && ce_shot_level) --ce_shot_level;
    if (ce_power_speed_miss == 2u) ce_speed_level = 0;
    else if (ce_power_speed_miss == 1u && ce_speed_level) --ce_speed_level;
    if (ce_power_weapon_count || ce_power_speed_count) apply_power();
}
void ce_spawn_item(uint8_t ref, int16_t x, int16_t y) BANKED {
    uint8_t slot; CE_Entity *e; const CE_Item *item;
    if (ref == CE_NONE || ref >= ce_item_count) return;
    item = &ce_items[ref]; slot = allocate(CE_ITEM, item->asset);
    if (slot == CE_NONE) return;
    e = &ce_entities[slot]; e->ref = ref; e->lifetime = item->lifetime;
    e->x = e->base_x = x; e->y = e->base_y = y;
}
void ce_collect_item(uint8_t slot) BANKED {
    const CE_Item *item = &ce_items[ce_entities[slot].ref];
    const CE_ItemEffect *effect = item->effect; uint8_t n, changed = 0;
    /* Release first: an item can never be collected twice in one update. */
    release(slot);
    for (n = 0; n != item->effects; ++n, ++effect) {
        if (effect->kind == 1u && ce_power_weapon_count) {
            ce_shot_level = add_capped(ce_shot_level, effect->amount, ce_power_weapon_count - 1u); changed = 1;
        } else if (effect->kind == 2u && ce_power_speed_count) {
            ce_speed_level = add_capped(ce_speed_level, effect->amount, ce_power_speed_count - 1u); changed = 1;
        } else if (effect->kind == 3u && ce_bomb_stock) ce_bombs = add_capped(ce_bombs, effect->amount, ce_bomb_max);
        else if (effect->kind == 4u) ce_state.lives = add_capped(ce_state.lives, effect->amount, ce_max_lives);
        else if (effect->kind == 5u) ce_add_score(effect->amount);
    }
    if (changed) apply_power();
    ce_sound(6);
}
