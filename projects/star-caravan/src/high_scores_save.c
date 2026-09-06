#include <gb/gb.h>
#include <stdint.h>

#include "high_scores_save.h"

#define SAVE_SLOT_SIZE 32u
#define SAVE_PAYLOAD_SIZE 18u
#define SAVE_CRC_OFFSET 18u
#define SAVE_FORMAT_VERSION 1u
#define SAVE_SCORE_BYTES (HIGH_SCORE_COUNT * 2u)
#define SAVE_GENERATION_OFFSET 6u
#define SAVE_SCORES_OFFSET 8u
#define SAVE_INVALID_SLOT 0xFFu

static const uint8_t save_magic[4] = { 'S', 'C', 'V', '1' };
static uint8_t active_slot = SAVE_INVALID_SLOT;
static uint16_t active_generation;

static volatile uint8_t *slot_address(uint8_t slot) {
    return (volatile uint8_t *)(0xA000u + ((uint16_t)slot * SAVE_SLOT_SIZE));
}

static uint16_t crc16_update(uint16_t crc, uint8_t value) {
    uint8_t bit;
    crc ^= (uint16_t)value << 8;
    for (bit = 0u; bit != 8u; ++bit) {
        crc = ((crc & 0x8000u) != 0u) ? (uint16_t)((crc << 1) ^ 0x1021u) : (uint16_t)(crc << 1);
    }
    return crc;
}

static uint16_t slot_crc(volatile const uint8_t *slot) {
    uint8_t index;
    uint16_t crc = 0xFFFFu;
    for (index = 0u; index != SAVE_PAYLOAD_SIZE; ++index) crc = crc16_update(crc, slot[index]);
    return crc;
}

static uint8_t slot_is_valid(volatile const uint8_t *slot) {
    uint8_t index;
    uint16_t stored_crc;
    for (index = 0u; index != 4u; ++index) {
        if (slot[index] != save_magic[index]) return 0u;
    }
    if (slot[4] != SAVE_FORMAT_VERSION) return 0u;
    if (slot[5] != SAVE_SCORE_BYTES) return 0u;
    stored_crc = (uint16_t)slot[SAVE_CRC_OFFSET] | ((uint16_t)slot[SAVE_CRC_OFFSET + 1u] << 8);
    return (slot_crc(slot) == stored_crc) ? 1u : 0u;
}

static uint16_t slot_generation(volatile const uint8_t *slot) {
    return (uint16_t)slot[SAVE_GENERATION_OFFSET] | ((uint16_t)slot[SAVE_GENERATION_OFFSET + 1u] << 8);
}

static uint8_t generation_is_newer(uint16_t left, uint16_t right) {
    uint16_t difference = (uint16_t)(left - right);
    return ((difference != 0u) && (difference < 0x8000u)) ? 1u : 0u;
}

static void read_scores(volatile const uint8_t *slot, uint16_t *scores) {
    uint8_t index;
    uint8_t offset;
    for (index = 0u; index != HIGH_SCORE_COUNT; ++index) {
        offset = (uint8_t)(SAVE_SCORES_OFFSET + (index * 2u));
        scores[index] = (uint16_t)slot[offset] | ((uint16_t)slot[offset + 1u] << 8);
    }
}

void high_scores_load(uint16_t *scores) {
    uint8_t index;
    uint8_t first_valid;
    uint8_t second_valid;
    uint8_t selected_slot;
    volatile const uint8_t *first;
    volatile const uint8_t *second;

    for (index = 0u; index != HIGH_SCORE_COUNT; ++index) scores[index] = 0u;
    active_slot = SAVE_INVALID_SLOT;
    active_generation = 0u;

    ENABLE_RAM_MBC5;
    SWITCH_RAM_MBC5(0u);
    first = slot_address(0u);
    second = slot_address(1u);
    first_valid = slot_is_valid(first);
    second_valid = slot_is_valid(second);
    if ((first_valid != 0u) || (second_valid != 0u)) {
        if ((first_valid != 0u) && (second_valid != 0u)) {
            selected_slot = generation_is_newer(slot_generation(second), slot_generation(first)) ? 1u : 0u;
        } else {
            selected_slot = (second_valid != 0u) ? 1u : 0u;
        }
        active_slot = selected_slot;
        active_generation = slot_generation(slot_address(selected_slot));
        read_scores(slot_address(selected_slot), scores);
    }
    DISABLE_RAM_MBC5;
}

void high_scores_save(const uint16_t *scores) {
    uint8_t index;
    uint8_t offset;
    uint8_t target_slot = (active_slot == 0u) ? 1u : 0u;
    uint16_t generation = (uint16_t)(active_generation + 1u);
    uint16_t crc = 0xFFFFu;
    volatile uint8_t *slot;

    ENABLE_RAM_MBC5;
    SWITCH_RAM_MBC5(0u);
    slot = slot_address(target_slot);

    slot[0] = 0u;
    slot[1] = save_magic[1];
    slot[2] = save_magic[2];
    slot[3] = save_magic[3];
    slot[4] = SAVE_FORMAT_VERSION;
    slot[5] = SAVE_SCORE_BYTES;
    slot[SAVE_GENERATION_OFFSET] = (uint8_t)generation;
    slot[SAVE_GENERATION_OFFSET + 1u] = (uint8_t)(generation >> 8);
    for (index = 0u; index != HIGH_SCORE_COUNT; ++index) {
        offset = (uint8_t)(SAVE_SCORES_OFFSET + (index * 2u));
        slot[offset] = (uint8_t)scores[index];
        slot[offset + 1u] = (uint8_t)(scores[index] >> 8);
    }
    crc = crc16_update(crc, save_magic[0]);
    for (index = 1u; index != SAVE_PAYLOAD_SIZE; ++index) crc = crc16_update(crc, slot[index]);
    slot[SAVE_CRC_OFFSET] = (uint8_t)crc;
    slot[SAVE_CRC_OFFSET + 1u] = (uint8_t)(crc >> 8);
    slot[0] = save_magic[0];
    DISABLE_RAM_MBC5;

    active_slot = target_slot;
    active_generation = generation;
}
