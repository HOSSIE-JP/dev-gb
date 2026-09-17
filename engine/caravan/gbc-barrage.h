/* Bank 2, main-thread only. Stack/ISR state stay in fixed WRAM0.
 * 96 shots: D000-D4df; masks D500-D97f; map D980-DBbf;
 * attributes DBC0-DDff; dynamic tile packet DE00-DF7f.
 * Movie/giant scratch shares this bank only in mutually exclusive scenes. */
#define CGB_MASKS ((uint16_t *)0xD500u)
#define CGB_MAP ((uint8_t *)0xD980u)
#define CGB_ATTRS ((uint8_t *)0xDBC0u)
#define CGB_TILES ((uint8_t *)0xDE00u)
#define CGB_STATIC_TILES 181u
#define CGB_DYNAMIC_TILES 24u
extern const CE_Data ce_cgb_dictionary, ce_cgb_lookup[8];
extern const uint8_t ce_cgb_singleton[32];
extern uint16_t ce_cgb_cells[CE_MAX_BG_SHOTS];
extern uint16_t ce_cgb_compounds[CE_MAX_BG_SHOTS/2];
extern uint8_t ce_cgb_compounds_count;
extern uint8_t ce_cgb_cells_count, ce_cgb_dynamic_count;
void ce_cgb_resolve(void) NONBANKED;
