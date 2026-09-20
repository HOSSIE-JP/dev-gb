// The SM83 modules own these non-overlapping ranges while their WRAM bank is
// selected. High-water reservations include alignment gaps, not just payload.
export function cgbMemoryLayout(map: string, fixedBytes: number, rightHud: boolean, hudTiles: number, spriteTiles: number) {
    const symbols=new Map([...map.matchAll(/\b([\da-fA-F]{8})\s+([._]\w+)\s/g)].map(m=>[m[2],parseInt(m[1],16)]));
    if(symbols.get('.STACK')!==0xd000)throw Error('GBC stack must start at $D000');
    if(fixedBytes>3072)throw Error('GBC fixed WRAM overlaps the 1 KiB stack reserve');
    for(const [name,address] of [['_ce_actors',0xd000],['_ce_entity_refs',0xd210],['_ce_boxes',0xd950],['_ce_shot_x',0xd400],['_ce_bg_x',0xd000],['_ce_bg_life',0xd200]] as const)
        if(symbols.get(name)!==address)throw Error(`GBC WRAM layout mismatch: ${name}`);
    for(const name of ['_ce_state','_ce_trace','_ce_bg_count','_ce_player_pose'])
        if((symbols.get(name)??0xffff)>=0xcc00)throw Error(`ISR/shared WRAM outside fixed bank: ${name}`);
    for(const m of map.matchAll(/^(_DATA|_INITIALIZED|_BSS)\s+([\da-fA-F]+)\s+([\da-fA-F]+)\s*=/gm))
        if(parseInt(m[2],16)+parseInt(m[3],16)>0xcc00)throw Error('Fixed data reaches the reserved stack');
    const dictionary=hudTiles<=77?136:16,composites=dictionary===136?21:32;
    if(rightHud&&hudTiles+dictionary+composites*2>255)throw Error('Double-buffered barrage tiles exceed VRAM');
    if(spriteTiles>128)throw Error('Resident OBJ graphics collide with the BG tile region');
    return {
        hardware:'gbc' as const,
        wram:[
            {bank:0,reserved:fixedBytes,capacity:3072,purpose:'shared state, ISR, audio and shadow OAM'},
            {bank:1,reserved:0xd52,capacity:4096,purpose:'actors, bullets, collision, animation and motion cursors'},
            {bank:2,reserved:rightHud?0xf24:0xa30,capacity:4096,purpose:'BG bullets, masks, packets and map histories'},
            {bank:3,reserved:rightHud?2080:0,capacity:4096,purpose:'parallax cache and road transfer packets'},
            {bank:4,reserved:780,capacity:4096,purpose:'movie workspace; pinned during its audio ISR'},
            ...[5,6,7].map(bank=>({bank,reserved:0,capacity:4096,purpose:'available'})),
        ],
        stack:{start:0xcc00,end:0xd000,reserved:1024},
        vram:{bytes:16384,bankBytes:8192,residentObjTiles:spriteTiles,hudTiles,barrageTiles:hudTiles+dictionary+(rightHud?composites*2:32),roadTileLimit:128,bombExcludedTileRange:[128,255]},
    };
}
