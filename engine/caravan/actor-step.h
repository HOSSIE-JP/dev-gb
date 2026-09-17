CE_ACTOR_LINKAGE void move_actor(CE_Entity *e, const CE_Motion *m, uint16_t age) CE_ACTOR_BANK {
    if (!m->kind) {
        if (age) { e->x += m->vx; e->y += m->vy; }
        else { e->x = e->base_x; e->y = e->base_y; }
    } else ce_move_complex(e, m, age);
}
CE_ACTOR_LINKAGE void step_actor(CE_Entity *e, uint8_t slot) CE_ACTOR_BANK {
    static uint16_t *schedule;
    static uint8_t k, pattern, primary, layer_count;
    static uint16_t age, sequence; static const uint8_t *layers;
    static const CE_Actor *actor; static const CE_Phase *phase; static const CE_Motion *motion; static const CE_Pattern *shot;
            actor = e->kind == CE_BOSS ? &ce_bosses[e->ref] : &ce_enemies[e->ref];
            motion = actor->motion; pattern = actor->pattern; age = e->age;
            layers = actor->layer; layer_count = actor->layers;
            if (e->kind == CE_BOSS) {
                phase = &actor->phase[e->phase];
                if (!ce_bomb_image && e->phase + 1u < actor->phases && (phase->until ? e->hp <= (phase->hp ? 0u : phase->threshold) : e->phase_age >= phase->threshold)) {
                    if (phase->hp || actor->phase[e->phase + 1u].hp) ce_change_phase(e, phase->until);
                    else {
                        ++e->phase; e->phase_age = 0; e->sequence = 0; e->base_x = e->x; e->base_y = e->y;
                        if (actor->phase[e->phase].intro_frames) ce_phase_intro(&actor->phase[e->phase]);
                    }
                }
                phase = &actor->phase[e->phase]; motion = phase->motion; pattern = phase->pattern; age = e->phase_age;
                layers = phase->layer; layer_count = phase->layers;
            }
            move_actor(e, motion, age);
            if (e->kind == CE_BOSS && ce_battle_mode == 3u) ce_giant_position(e);
            /* Unarmed formations need neither a deadline lookup nor an attack
             * traversal. Preserve both age counters, including their wrap. */
            if (pattern == CE_NONE && !layer_count) { ++e->age; ++e->phase_age; return; }
            schedule = &next_attack[(uint16_t)slot << 2];
            primary = pattern;
            for (k = 0; k <= layer_count; ++k) {
                pattern = k ? layers[k - 1u] : primary;
                if (pattern == CE_NONE) continue;
                shot = &ce_patterns[pattern];
                /* Phase entry and 16-bit age wrap restart the same authored schedule.
                 * Overflowed deadlines stay below age until that reset. */
                if (!age) schedule[k] = shot->delay;
                if (age >= shot->delay && age == schedule[k]) {
                    schedule[k] += shot->interval;
                    sequence = (age - shot->delay) / shot->interval;
                    if (!shot->repeats || sequence < shot->repeats) ce_shoot(pattern, e->asset, e->x, e->y, 0, sequence);
                }
            }
            ++e->age; ++e->phase_age;
}
