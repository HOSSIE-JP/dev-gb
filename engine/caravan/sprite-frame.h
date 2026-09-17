/* Included in the caller to avoid an extra call in the legacy hot path. */
pose_slot = 0;
    emit_top = ce_hud_bottom ? 9u : ce_hud_height + 9u;
    emit_bottom = ce_hud_bottom ? 160u - ce_hud_height : 160u;
    DISABLE_OAM_DMA;
    if (!ce_respawn && (ce_bomb_left || !ce_state.invulnerable || !(ce_state.invulnerable & 4u))) {
        player_pose.asset = ce_barrier && ce_barrier_asset != CE_NONE ? ce_barrier_asset : ce_player_asset; player_pose.x = ce_state.player_x;
        player_pose.y = ce_state.player_y; player_pose.age = ce_state.tick;
        animation_slot = 0; pose = &player_pose; sprite();
    }
#ifdef CE_DENSE
    dense_draw();
#else
    if (ce_transition_state == 1u) {
        /* A single break burst replaces the boss briefly, so its smaller sprite
         * cannot be occluded by the boss's earlier OAM entries on DMG or CGB. */
        for (i = ce_used, animation_slot = 1, pose = ce_entities; i; --i, ++pose, ++animation_slot)
            if (pose->kind && pose->kind != CE_BOSS) sprite();
    } else for (i = ce_used, animation_slot = 1, pose = ce_entities; i; --i, ++pose, ++animation_slot) if (pose->kind && !(ce_battle_mode == 3u && pose->kind == CE_BOSS)) sprite();
#endif
    /* Do not DMA a partially written metasprite list. */
    i = pose_slot;
    while (pose_slot < previous_slots) shadow_OAM[pose_slot++].y = 0;
    previous_slots = i;
    if (CE_BG_ACTIVE) for (i = 0; i != previous_slots; ++i) shadow_OAM[i].tile -= 128u;
