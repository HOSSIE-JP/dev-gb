#pragma bank 2
#include "music.h"

/* Original NOVA SPEAR score, composed for this repository (MIT).
 * Eighth-note phrases use pulse channel 2; wave channel 3 carries an
 * alternating bass. No channel-1/noise, mixer, master-power or ISR writes.
 * Pitch table: C2 through B6; 2048 - 131072 / frequency, rounded offline. */
enum {
    REST, C2, CS2, D2, DS2, E2, F2, FS2, G2, GS2, A2, AS2,
    B2, C3, CS3, D3, DS3, E3, F3, FS3, G3, GS3, A3, AS3,
    B3, C4, CS4, D4, DS4, E4, F4, FS4, G4, GS4, A4, AS4,
    B4, C5, CS5, D5, DS5, E5, F5, FS5, G5, GS5, A5, AS5,
    B5, C6, CS6, D6, DS6, E6, F6, FS6, G6, GS6, A6, AS6,
    B6,
    H = 255
};

static const uint16_t pulse_pitch[]={
    0, 44, 157, 263, 363, 457, 547, 631, 711, 786, 856, 923,
    986, 1046, 1102, 1155, 1205, 1253, 1297, 1339, 1379, 1417, 1452, 1486,
    1517, 1547, 1575, 1602, 1627, 1650, 1673, 1694, 1714, 1732, 1750, 1767,
    1783, 1798, 1812, 1825, 1837, 1849, 1860, 1871, 1881, 1890, 1899, 1907,
    1915, 1923, 1930, 1936, 1943, 1949, 1954, 1959, 1964, 1969, 1974, 1978,
    1982,
};
/* Symmetric, softly stepped triangle; DC midpoint is 7.5. */
static const uint8_t bass_wave[16]={
    0x01,0x23,0x45,0x67,0x89,0xab,0xcd,0xef,
    0xfe,0xdc,0xba,0x98,0x76,0x54,0x32,0x10
};

static const uint8_t title_lead[]={
    E4, B4, E5, H, FS5, E5, D5, B4,
    C5, H, E5, G5, FS5, E5, D5, H,
    B4, D5, FS5, H, A5, FS5, E5, D5,
    B4, H, A4, FS4, E4, H, REST, REST,
    E5, FS5, G5, B5, A5, G5, FS5, E5,
    D5, E5, FS5, A5, G5, FS5, E5, D5,
    C5, E5, G5, A5, B5, H, A5, FS5,
    E5, B4, FS5, DS5, E5, H, H, REST,
};
static const uint8_t title_bass[]={
    E2, B2, E3, B2, C2, G2, C3, G2,
    D2, A2, D3, A2, B2, FS3, B3, FS3,
    E2, B2, E3, B2, D2, A2, D3, A2,
    C2, G2, C3, G2, B2, FS3, B2, DS3,
};

static const uint8_t orbit_lead[]={
    E5, H, B4, D5, E5, G5, FS5, E5,
    C5, H, G4, B4, C5, E5, D5, C5,
    D5, H, A4, C5, D5, FS5, E5, D5,
    B4, D5, FS5, A5, FS5, D5, B4, REST,
    E5, G5, B5, A5, G5, FS5, E5, G5,
    C5, E5, G5, B5, A5, G5, E5, C5,
    D5, FS5, A5, C6, B5, A5, FS5, D5,
    FS5, A5, B5, DS5, E5, H, REST, B4,
    E5, B5, G5, E5, FS5, G5, A5, B5,
    G5, E5, C5, G4, C5, D5, E5, G5,
    A5, FS5, D5, A4, D5, E5, FS5, A5,
    B5, A5, FS5, D5, B4, D5, FS5, DS5,
    E5, G5, B5, E6, D6, B5, A5, G5,
    E5, G5, C6, B5, A5, G5, E5, D5,
    D5, FS5, A5, D6, C6, A5, FS5, E5,
    B4, DS5, FS5, A5, G5, FS5, E5, H,
};
static const uint8_t orbit_bass[]={
    E2, B2, E3, B2, C2, G2, C3, G2,
    D2, A2, D3, A2, B2, FS3, B3, FS3,
    E2, B2, E3, B2, C2, G2, C3, G2,
    D2, A2, D3, A2, B2, FS3, B2, DS3,
};

static const uint8_t carrier_lead[]={
    A4, E5, REST, G5, A5, G5, E5, C5,
    F5, C5, REST, E5, F5, A5, G5, E5,
    G5, D5, REST, F5, G5, A5, B5, G5,
    E5, B4, E5, GS5, B5, A5, GS5, E5,
    A5, E5, C5, E5, A5, B5, C6, B5,
    A5, F5, C5, F5, A5, G5, F5, E5,
    D5, G5, B5, D6, C6, B5, A5, G5,
    E5, GS5, B5, D6, C6, B5, GS5, E5,
    C6, B5, A5, G5, E5, G5, A5, C6,
    C6, A5, F5, E5, C5, E5, F5, A5,
    B5, A5, G5, F5, D5, F5, G5, B5,
    B5, GS5, E5, D5, B4, D5, E5, GS5,
    A5, H, C6, B5, A5, G5, E5, C5,
    F5, A5, C6, A5, F5, E5, C5, A4,
    G5, B5, D6, B5, G5, F5, D5, B4,
    E5, GS5, B5, GS5, A5, H, E5, REST,
};
static const uint8_t carrier_bass[]={
    A2, E3, A3, E3, F2, C3, F3, C3,
    G2, D3, G3, D3, E2, B2, E3, B2,
    A2, E3, A3, E3, F2, C3, F3, C3,
    G2, D3, G3, D3, E2, B2, E3, GS2,
};

static const uint8_t reactor_lead[]={
    D5, A4, D5, F5, E5, D5, C5, A4,
    AS4, F4, AS4, D5, C5, AS4, A4, F4,
    C5, G4, C5, E5, D5, C5, AS4, G4,
    A4, E5, A5, G5, E5, CS5, A4, REST,
    D5, F5, A5, C6, A5, F5, E5, D5,
    AS4, D5, F5, A5, G5, F5, D5, AS4,
    C5, E5, G5, AS5, A5, G5, E5, C5,
    A4, CS5, E5, G5, A5, G5, E5, CS5,
    D6, A5, F5, A5, E5, D5, F5, A5,
    F5, D5, AS4, D5, C5, AS4, D5, F5,
    G5, E5, C5, E5, D5, C5, E5, G5,
    A5, E5, CS5, E5, G5, E5, CS5, A4,
    D5, F5, A5, D6, C6, A5, F5, E5,
    D5, F5, AS5, D6, C6, AS5, F5, D5,
    E5, G5, C6, E6, D6, C6, G5, E5,
    CS5, E5, G5, A5, G5, E5, D5, H,
};
static const uint8_t reactor_bass[]={
    D2, A2, D3, A2, AS2, F3, AS3, F3,
    C2, G2, C3, G2, A2, E3, A3, E3,
    D2, A2, D3, A2, AS2, F3, AS3, F3,
    C2, G2, C3, G2, A2, E3, A2, CS3,
};

static const uint8_t boss_lead[]={
    E5, E4, B4, E5, G5, FS5, E5, B4,
    C5, C4, G4, C5, E5, D5, C5, G4,
    DS5, DS4, AS4, DS5, FS5, F5, DS5, AS4,
    B4, B3, FS4, B4, DS5, FS5, A5, B5,
    E6, B5, G5, E5, FS5, G5, A5, B5,
    C6, G5, E5, C5, D5, E5, FS5, G5,
    DS6, AS5, FS5, DS5, F5, FS5, GS5, AS5,
    B5, A5, FS5, DS5, B4, DS5, FS5, REST,
};
static const uint8_t boss_bass[]={
    E2, E3, B2, E3, C2, C3, G2, C3,
    DS2, DS3, AS2, DS3, B2, B3, FS3, B3,
    E2, E3, B2, E3, C2, C3, G2, C3,
    DS2, DS3, AS2, DS3, B2, FS3, B2, DS3,
};

static const uint8_t clear_lead[]={
    E5, H, G5, H, B5, H, E6, H,
    D6, B5, A5, G5, A5, H, B5, H,
    C6, H, E6, H, D6, B5, A5, FS5,
    E5, H, H, H, H, H, REST, REST,
};
static const uint8_t clear_bass[]={
    E2, B2, E3, B2, D2, A2, D3, A2,
    C2, G2, C3, G2, E2, B2, E3, H,
    E2, B2, E3, B2, D2, A2, D3, A2,
    C2, G2, C3, G2, E2, B2, E3, H,
};

static const uint8_t gameover_lead[]={
    E5, H, D5, B4, C5, H, A4, H,
    B4, H, FS4, DS4, E4, H, H, REST,
};
static const uint8_t gameover_bass[]={
    E2, H, D2, H, C2, H, B2, E2,
    E2, H, D2, H, C2, H, B2, E2,
    E2, H, D2, H, C2, H, B2, E2,
    E2, H, D2, H, C2, H, B2, E2,
};

/* Original ascending brass-like victory cadence, separate from final clear. */
static const uint8_t victory_lead[]={
    E5,G5,B5,E6, REST,E6,REST,E6,
    D6,B5,G5,D6, C6,E6,G6,H,
    FS6,D6,B5,FS6, E6,B5,G5,E5,
    C6,D6,DS6,B5, E6,H,H,H
};
static const uint8_t victory_bass[]={
    E2,B2,E3,B2, D2,A2,D3,A2,
    C2,G2,C3,G2, B2,FS3,E3,H,
    E2,B2,E3,B2, D2,A2,D3,A2,
    C2,G2,C3,G2, B2,FS3,E3,H
};


/* Original GERONEKO score (2026): candy major-key bounce, nebula dance,
 * broad D-minor cosmic theme and pentatonic ninja battle. */
static const uint8_t gero_title_lead[]={C5,E5,G5,H,A5,G5,E5,REST,F5,A5,G5,E5,D5,E5,C5,H,E5,G5,C6,H,B5,A5,G5,E5,F5,E5,D5,G5,C5,H,H,REST};
static const uint8_t gero_title_bass[]={C3,G3,E3,G3,F2,C3,A2,C3,C3,G3,E3,G3,G2,D3,B2,G2,C3,G3,E3,G3,F2,C3,A2,C3,C3,G3,E3,G3,G2,D3,B2,G2};
static const uint8_t gero_candy_lead[]={C5,REST,E5,G5,A5,G5,E5,C5,D5,E5,G5,E5,C5,H,G4,REST,F5,REST,A5,C6,B5,A5,G5,E5,D5,E5,F5,D5,G5,H,G4,REST,E5,G5,C6,G5,A5,G5,E5,C5,D5,F5,A5,F5,G5,F5,D5,B4,C5,E5,G5,A5,G5,E5,D5,G4,F5,E5,D5,B4,C5,H,REST,G4};
static const uint8_t gero_candy_bass[]={C3,G3,E3,G3,C3,G3,E3,G3,F2,C3,A2,C3,G2,D3,B2,D3,C3,G3,E3,G3,D3,A3,F3,A3,F2,C3,G2,D3,C3,G3,C3,REST};
static const uint8_t gero_nebula_lead[]={G5,D5,B4,D5,G5,A5,B5,H,A5,E5,C5,E5,A5,G5,E5,H,B5,G5,D5,G5,B5,A5,G5,D5,FS5,A5,D6,H,C6,A5,FS5,D5,E5,G5,B5,H,A5,G5,E5,D5,C5,E5,A5,H,G5,E5,D5,C5,D5,G5,B5,D6,C6,B5,A5,G5,FS5,A5,D6,A5,G5,H,H,REST};
static const uint8_t gero_nebula_bass[]={G2,D3,B2,D3,A2,E3,C3,E3,G2,D3,B2,D3,D3,A3,FS3,A3,E3,B3,G3,B3,C3,G3,E3,G3,G2,D3,B2,D3,D3,A3,G3,H};
static const uint8_t gero_cosmos_lead[]={D5,H,H,A5,H,H,D6,H,C6,H,A5,H,G5,H,H,H,AS5,H,H,F6,H,H,D6,H,C6,H,AS5,H,A5,H,H,H,G5,H,A5,H,D6,H,E6,H,F6,H,E6,D6,C6,H,A5,H,AS5,H,D6,H,C6,H,A5,H,G5,H,A5,H,D5,H,H,H,D6,H,A5,D6,F6,H,E6,D6,C6,H,G5,C6,E6,H,D6,C6,AS5,H,F5,AS5,D6,H,C6,AS5,A5,H,E5,A5,CS6,H,E6,H,F6,H,H,E6,D6,H,A5,H,G5,H,AS5,D6,C6,H,A5,H,AS5,H,C6,H,D6,H,E6,H,CS6,H,A5,H,D6,H,H,H};
static const uint8_t gero_cosmos_bass[]={D2,A2,D3,F3,C2,G2,C3,E3,AS2,F3,AS3,D3,A2,E3,A3,CS3,G2,D3,G3,AS3,D2,A2,D3,F3,AS2,F3,C3,G3,A2,E3,D3,H};
static const uint8_t gero_ninja_lead[]={D5,A4,D5,F5,G5,F5,D5,REST,A5,G5,F5,D5,C5,D5,F5,G5,AS5,F5,AS5,C6,D6,C6,AS5,F5,A5,G5,E5,CS5,A4,CS5,E5,G5,D6,A5,F5,D5,G5,A5,C6,H,AS5,F5,D5,AS4,C5,D5,F5,H,G5,A5,D6,C6,A5,G5,F5,D5,CS5,E5,A5,CS6,D6,H,REST,A5};
static const uint8_t gero_ninja_bass[]={D2,A2,D3,A2,D2,A2,F3,A2,AS2,F3,AS3,F3,A2,E3,A3,E3,D2,A2,F3,A2,AS2,F3,D3,F3,G2,D3,G3,D3,A2,E3,D3,H};
static const uint8_t gero_clear_lead[]={C5,H,E5,G5,C6,H,H,H,A5,H,G5,E5,F5,H,A5,H,G5,H,C6,H,E6,D6,C6,G5,A5,G5,E5,D5,C6,H,H,H};
static const uint8_t gero_clear_bass[]={C3,G3,E3,G3,F2,C3,A2,C3,C3,G3,E3,G3,F2,G2,C3,H,C3,G3,E3,G3,F2,C3,A2,C3,C3,G3,E3,G3,F2,G2,C3,H};
static const uint8_t gero_over_lead[]={G5,H,E5,H,D5,E5,C5,H,F5,H,D5,H,C5,H,H,REST};
static const uint8_t gero_over_bass[]={C3,H,G2,H,F2,H,C3,H,C3,H,G2,H,F2,H,C3,H,C3,H,G2,H,F2,H,C3,H,C3,H,G2,H,F2,H,C3,H};


/* Legacy scores remain byte-for-byte compatible with their original projects. */

typedef struct {
    uint8_t rows, speed, duty, envelope, loop;
    const uint8_t *lead, *bass;
} CE_Song;
static const CE_Song songs[]={
    {64,15,0x80,0x72,1,title_lead,title_bass},
    {128,10,0x80,0x72,1,orbit_lead,orbit_bass},
    {128,9,0x40,0x72,1,carrier_lead,carrier_bass},
    {128,8,0x80,0x72,1,reactor_lead,reactor_bass},
    {64,8,0x40,0x82,1,boss_lead,boss_bass},
    {32,12,0x80,0x82,0,clear_lead,clear_bass},
    {16,15,0x80,0x72,0,gameover_lead,gameover_bass},
    {32,5,0x40,0xa2,0,victory_lead,victory_bass},
    {32,12,0x40,0x72,1,gero_title_lead,gero_title_bass},
    {64,11,0x40,0x72,1,gero_candy_lead,gero_candy_bass},
    {64,12,0x80,0x72,1,gero_nebula_lead,gero_nebula_bass},
    {128,17,0x80,0x83,1,gero_cosmos_lead,gero_cosmos_bass},
    {64,10,0x40,0x82,1,gero_ninja_lead,gero_ninja_bass},
    {32,13,0x80,0x83,0,gero_clear_lead,gero_clear_bass},
    {16,17,0x80,0x72,0,gero_over_lead,gero_over_bass},
};

uint8_t ce_music_track;
uint16_t ce_music_row;
static uint16_t song_rows;
static uint8_t remaining, paused, lead_note, bass_note, song_speed, song_loop;
static uint8_t instrument_duty, instrument_envelope, instrument_level;
static uint8_t bar[35];
static const CE_MusicScore *score;

static void load_bar(void) NONBANKED;

static void mute(void) {
    NR22_REG = 0; NR30_REG = 0;
}
static void lead(uint8_t note) {
    uint16_t pitch;
    if (!note) { NR22_REG = 0; return; }
    pitch = pulse_pitch[note];
    NR21_REG = instrument_duty;
    NR22_REG = instrument_envelope;
    NR23_REG = (uint8_t)pitch;
    NR24_REG = 0x80u | (uint8_t)(pitch >> 8);
}
static void bass(uint8_t note) {
    uint16_t pitch;
    if (!note) { NR30_REG = 0; return; }
    /* Wave has twice the sample cycle of pulse at the same register value. */
    pitch = 1024u + (pulse_pitch[note] >> 1);
    /* Stop before retriggering: active-channel retriggers can corrupt wave
     * RAM on DMG. The waveform itself is only loaded at track changes. */
    NR30_REG = 0; NR30_REG = 0x80; NR31_REG = 0; NR32_REG = instrument_level;
    NR33_REG = (uint8_t)pitch;
    NR34_REG = 0x80u | (uint8_t)(pitch >> 8);
}
static void play_row(void) {
    uint8_t note;
    if (ce_music_track >= 16u) {
        if (!(ce_music_row & 15u)) {
            load_bar(); instrument_duty = bar[0]; instrument_envelope = bar[1]; instrument_level = bar[2];
        }
        note = bar[3u + (ce_music_row & 15u)];
        if (note != H) { lead_note = note; lead(note); }
        note = bar[19u + (ce_music_row & 15u)];
        if (note != H) { bass_note = note; bass(note); }
    } else {
        const CE_Song *song = &songs[ce_music_track - 1u];
        note = song->lead[ce_music_row];
        if (note != H) { lead_note = note; lead(note); }
        if (!(ce_music_row & 1u)) {
            note = song->bass[(ce_music_row >> 1) & 31u];
            if (note != H) { bass_note = note; bass(note); }
        }
    }
    remaining = song_speed;
}
void ce_music_play(uint8_t track) BANKED {
    uint8_t i;
    if (track > CE_MUSIC_MAX) track = CE_MUSIC_OFF;
    if (track == ce_music_track) return;
    mute(); ce_music_track = track;
    ce_music_row = 0; remaining = 0; paused = 0; lead_note = 0; bass_note = 0;
    if (!track) return;
    if (track >= 16u) {
        score = &ce_music_scores[track - 16u];
        song_rows = score->rows; song_speed = score->speed; song_loop = score->loop;
    } else {
        const CE_Song *song = &songs[track - 1u];
        song_rows = song->rows; song_speed = song->speed; song_loop = song->loop;
        instrument_duty = song->duty; instrument_envelope = song->envelope; instrument_level = 0x60;
    }
    /* DMG permits safe wave RAM writes only while the wave DAC is off. */
    for (i = 0; i != 16u; ++i) AUD3WAVE[i] = bass_wave[i];
    play_row();
}
void ce_music_pause(uint8_t value) BANKED {
    value = !!value;
    if (value == paused) return;
    paused = value;
    if (paused) mute();
    else if (ce_music_track) { lead(lead_note); bass(bass_note); }
}
void ce_music_tick(uint8_t elapsed) BANKED {
    uint8_t advanced = 0;
    if (!ce_music_track || paused || !elapsed) return;
    while (elapsed >= remaining) {
        elapsed -= remaining;
        if (++ce_music_row == song_rows) {
            if (!song_loop) { mute(); ce_music_track = 0; return; }
            ce_music_row = 0;
        }
        play_row();
        /* Bound the work after a loading stall instead of bursting every
         * missed note. Ordinary small updates retain the musical clock. */
        if (++advanced == 3u) return;
    }
    remaining -= elapsed;
}

/* Executed in fixed ROM: changing banks must never unmap the copy code. */
static void load_bar(void) NONBANKED {
    uint8_t i, previous = CURRENT_BANK, bank = score->bank;
    const uint8_t *source = score->data + (ce_music_row >> 4) * 35u;
    SWITCH_ROM(bank);
    for (i = 0; i != 35u; ++i) bar[i] = source[i];
    SWITCH_ROM(previous);
}
