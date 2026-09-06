#ifndef HIGH_SCORES_SAVE_H
#define HIGH_SCORES_SAVE_H

#include <stdint.h>

#define HIGH_SCORE_COUNT 5u

void high_scores_load(uint16_t *scores);
void high_scores_save(const uint16_t *scores);

#endif
