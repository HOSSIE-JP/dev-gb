#pragma bank 255
#include "caravan.h"

extern uint8_t allocate(uint8_t kind, uint8_t asset);
extern void release(uint8_t slot);

uint8_t ce_shot_level, ce_speed_level, ce_barrier, ce_weapon_override;

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
    else ce_player_weapon = ce_players[ce_character].weapon;
    if (ce_weapon_override != CE_NONE) ce_player_weapon = ce_weapon_override;
    if (ce_power_speed_count) ce_player_speed = ce_power_speeds[ce_speed_level];
    ce_state.cooldown = 0; ce_state.player_sequence = 0;
}
void ce_power_reset(void) BANKED {
    ce_shot_level = ce_speed_level = ce_barrier = 0; ce_weapon_override = CE_NONE; apply_power();
}
void ce_power_miss(void) BANKED {
    uint8_t changed = ce_weapon_override != CE_NONE;
    ce_barrier = 0; ce_weapon_override = CE_NONE;
    if (ce_power_shot_miss == 2u) ce_shot_level = 0;
    else if (ce_power_shot_miss == 1u && ce_shot_level) --ce_shot_level;
    if (ce_power_speed_miss == 2u) ce_speed_level = 0;
    else if (ce_power_speed_miss == 1u && ce_speed_level) --ce_speed_level;
    if (ce_power_weapon_count || ce_power_speed_count || changed) apply_power();
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
            ce_weapon_override = CE_NONE;
            ce_shot_level = add_capped(ce_shot_level, effect->amount, ce_power_weapon_count - 1u); changed = 1;
        } else if (effect->kind == 2u && ce_power_speed_count) {
            ce_speed_level = add_capped(ce_speed_level, effect->amount, ce_power_speed_count - 1u); changed = 1;
        } else if (effect->kind == 3u && ce_bomb_stock) ce_bombs = add_capped(ce_bombs, effect->amount, ce_bomb_max);
        else if (effect->kind == 4u) ce_state.lives = add_capped(ce_state.lives, effect->amount, ce_max_lives);
        else if (effect->kind == 5u) ce_add_score(effect->amount);
        else if (effect->kind == 6u) ce_barrier = add_capped(ce_barrier, effect->amount, ce_barrier_max);
        else if (effect->kind == 7u && effect->amount < ce_pattern_count) { ce_weapon_override = effect->amount; changed = 1; }
    }
    if (changed) apply_power();
    ce_sound(6);
}

/* Opt-in Q4 interpolation. Legacy paths retain their original quantization.
 * All products have explicit widths; general long paths use 32 bits here,
 * while the common 128/256-tick sine avoids division and 32-bit arithmetic. */
void ce_smooth_actor(CE_Entity *e, const CE_Motion *m, uint16_t age) BANKED {
    uint16_t t, end, dt; uint8_t i, phase; int16_t offset = 0;
    const CE_Point *p, *next;
    if (m->kind == 3u) {
        end = m->points[m->count - 1u].frame;
        t = m->loop && end ? age % end : (age > end ? end : age);
        i = 0; while (i < m->count - 2u && t >= m->points[i + 1u].frame) ++i;
        p = &m->points[i]; next = p + 1; dt = next->frame - p->frame; t -= p->frame;
        e->x = e->base_x + p->x + (int32_t)(next->x - p->x) * t / dt;
        e->y = e->base_y + p->y + (int32_t)(next->y - p->y) * t / dt;
        return;
    }
    if (m->kind == 2u) {
        phase = m->period == 128u ? (uint8_t)age << 1 : m->period == 256u ? (uint8_t)age : (uint32_t)(age % m->period) * 256u / m->period;
        i = phase >> 4;
        offset = (int16_t)ce_sin[i] * m->amplitude + (int16_t)(ce_sin[(i + 1u) & 15u] - ce_sin[i]) * m->amplitude * (int16_t)(phase & 15u) / 16;
    } else if (m->kind == 1u) {
        dt = m->period >> 2; phase = (age % (dt * 4u)) / dt;
        offset = (uint32_t)(age % dt) * m->amplitude * 16u / dt;
        end = (uint16_t)m->amplitude * 16u;
        if (phase == 1u) offset = end - offset;
        else if (phase == 2u) offset = -offset;
        else if (phase == 3u) offset -= end;
    }
    e->x = e->base_x + m->vx * age + ((m->axis & 1u) ? 0 : offset);
    e->y = e->base_y + m->vy * age + ((m->axis & 1u) ? offset : 0);
}

extern void explode(int16_t x, int16_t y);
void ce_hit_player(void) BANKED {
    uint8_t i;
    if (ce_respawn || ce_state.invulnerable || ce_state.result) return;
    if (ce_barrier) { --ce_barrier; ce_state.invulnerable = ce_barrier_frames; ce_sound(6); return; }
    explode(ce_state.player_x, ce_state.player_y);
    ce_sound(2); if (ce_stage_misses != 255u) ++ce_stage_misses; --ce_state.lives;
    ce_power_miss();
    if (!ce_state.lives) ce_state.result = 1;
    else {
        ce_bombs=ce_bomb_stock;ce_bomb_latch=1;
        ce_respawn = ce_player_respawn_delay;
        ce_state.invulnerable = ce_respawn ? 0 : ce_player_invulnerability;
        ce_state.player_x = ce_player_start_x; ce_state.player_y = ce_player_start_y;
        if (ce_respawn) {
            ce_state.cooldown = 0; ce_state.player_sequence = 0;
            for (i = 0; i != ce_used; ++i) if (ce_entities[i].kind == CE_PSHOT) release(i);
        }
    }
}

void ce_move_complex(CE_Entity *e, const CE_Motion *m, uint16_t age) BANKED {
    /* Main-loop only; no ISR enters actor update. Avoid SM83 stack spills. */
    static uint16_t t, quarter, part; static uint8_t i, phase;
    static int16_t span, offset; static const CE_Point *p;
    if (m->axis & 2u) { ce_smooth_actor(e, m, age); return; }
    offset = 0;
    if (m->kind == 3u) {
        t = m->points[m->count - 1u].frame;
        /* 256-update authored paths wrap exactly with the low byte. */
        age = m->loop && t ? (t == 256u ? (uint8_t)age : age % t) : (age > t ? t : age);
        i = 0; while (i < m->count - 2u && age >= m->points[i + 1u].frame) ++i;
        p = &m->points[i]; t = age - p->frame;
        e->x = e->base_x + p->x + p->vx * t; e->y = e->base_y + p->y + p->vy * t;
        return;
    }
    if (m->kind == 2u) {
        if (m->period == 128u) {
            /* A sine sample lasts eight updates. Integrate the linear part
             * and add only the sample delta at an edge; age 0 also handles
             * phase entry and the 16-bit wrap. Same Q4 path, fewer multiplies. */
            if (!age) { e->x = e->base_x; e->y = e->base_y; return; }
            e->x += m->vx; e->y += m->vy;
            if (!(age & 7u)) {
                i = (uint8_t)(age & 127u) >> 3;
                if (m->axis) e->y += (int16_t)(ce_sin[i] - ce_sin[(i - 1u) & 15u]) * m->amplitude;
                else e->x += (int16_t)(ce_sin[i] - ce_sin[(i - 1u) & 15u]) * m->amplitude;
            }
            return;
        }
        i = (age % m->period) * 16u / m->period;
        offset = (int16_t)ce_sin[i] * m->amplitude;
        e->x = e->base_x + m->vx * age + (m->axis ? 0 : offset);
        e->y = e->base_y + m->vy * age + (m->axis ? offset : 0); return;
    }
    if (m->kind == 1u) {
        quarter = m->period >> 2; phase = (age % (quarter * 4u)) / quarter; part = age % quarter;
        span = part * m->amplitude / quarter;
        offset = phase == 0u ? span : phase == 1u ? m->amplitude - span : phase == 2u ? -span : -m->amplitude + span;
    }
    e->x = e->base_x + m->vx * age + (m->axis ? 0 : offset * 16); e->y = e->base_y + m->vy * age + (m->axis ? offset * 16 : 0);
}

/* CE_Box uses a 128-pixel bias; keep body geometry in ROM, outside the entity pool. */
uint8_t ce_boss_contact(const CE_Entity *e, const CE_Box *player) BANKED {
    const CE_Body *body = &ce_boss_bodies[e->ref];
    const CE_Hitbox *r = body->boxes; uint8_t i;
    int16_t x = e->x / 16 + 128, y = e->y / 16 + 128, left, top;
    for (i = 0; i != body->count; ++i, ++r) {
        left = x + r->x; top = y + r->y;
        if (left < (int16_t)player->right && left + r->w > (int16_t)player->left && top < (int16_t)player->bottom && top + r->h > (int16_t)player->top) return 1;
    }
    return 0;
}
