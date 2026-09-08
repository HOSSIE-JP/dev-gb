#pragma bank 1
#include "caravan.h"

/* Two independent 32-byte records in bank 0. Byte 0 commits the record last.
 * Body: version, project ID, LE generation, five LE scores, CRC16-CCITT.
 * Save only on ranking insertion, outside gameplay. Never erase the old slot. */
static uint8_t record[20];
uint8_t ce_save_slot;
uint16_t ce_save_generation;
static volatile uint8_t * const sram = (volatile uint8_t *)0xa000;

static uint16_t word(uint8_t at) { return record[at] | ((uint16_t)record[at + 1u] << 8); }
static uint16_t crc(void) {
    uint8_t i, bit; uint16_t sum = 0xffff;
    for (i = 1; i != 18u; ++i) {
        sum ^= (uint16_t)record[i] << 8;
        for (bit = 0; bit != 8u; ++bit) sum = (sum & 0x8000u) ? (sum << 1) ^ 0x1021u : sum << 1;
    }
    return sum;
}
static uint8_t read_slot(uint8_t slot) {
    uint8_t i, offset = slot << 5;
    for (i = 0; i != 20u; ++i) record[i] = sram[offset + i];
    if (record[0] != 0xa5u || record[1] != 1u) return 0;
    for (i = 0; i != 4u; ++i) if (record[2u + i] != ce_save_id[i]) return 0;
    if (crc() != word(18)) return 0;
    for (i = 10; i != 18u; i += 2u) if (word(i) > word(i - 2u)) return 0;
    return 1;
}
void ce_save_load(void) BANKED {
    uint8_t slot, i; uint16_t generation, delta;
    ce_save_slot = 255; ce_save_generation = 0;
    for (i = 0; i != 5u; ++i) ce_scores[i] = 0;
    ENABLE_RAM; SWITCH_RAM(0);
    for (slot = 0; slot != 2u; ++slot) if (read_slot(slot)) {
        generation = word(6); delta = generation - ce_save_generation;
        if (ce_save_slot == 255u || (delta && delta < 0x8000u)) {
            ce_save_slot = slot; ce_save_generation = generation;
            for (i = 0; i != 5u; ++i) ce_scores[i] = word(8u + (i << 1));
        }
    }
    DISABLE_RAM;
}
void ce_save_scores(void) BANKED {
    uint8_t i, slot = ce_save_slot == 0u ? 1u : 0u, offset = slot << 5;
    uint16_t sum, generation = ce_save_generation + 1u;
    record[0] = 0xa5; record[1] = 1;
    for (i = 0; i != 4u; ++i) record[2u + i] = ce_save_id[i];
    record[6] = generation; record[7] = generation >> 8;
    for (i = 0; i != 5u; ++i) { record[8u + (i << 1)] = ce_scores[i]; record[9u + (i << 1)] = ce_scores[i] >> 8; }
    sum = crc(); record[18] = sum; record[19] = sum >> 8;
    ENABLE_RAM; SWITCH_RAM(0);
    sram[offset] = 0;
    for (i = 1; i != 20u; ++i) sram[offset + i] = record[i];
    sram[offset] = 0xa5;
    if (read_slot(slot)) { ce_save_slot = slot; ce_save_generation = generation; }
    DISABLE_RAM;
}
