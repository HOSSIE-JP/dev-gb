// A 4x4 occupancy mask describes sixteen possible 2x2 dots in one GB tile.
// H/V tile attributes let all masks with <=3 dots share just 181 tiles.
export function flipBarrageMask(mask: number, attributes: number): number {
    let out = 0;
    for (let y=0;y<4;y++) for(let x=0;x<4;x++)
        if(mask & (1 << (y*4+x))) out |= 1 << ((attributes&64 ? 3-y : y)*4+(attributes&32 ? 3-x : x));
    return out;
}
export function gbcBarrageDictionary() {
    const masks: number[] = [], ids = new Map<number, number>();
    const lookup = new Uint8Array(65536*2).fill(255);
    for(let mask=0;mask<65536;mask++) {
        let bits=mask, count=0;while(bits){bits&=bits-1;count++;}
        if(count>3)continue;
        const variants=[0,32,64,96].map(attr=>({mask:flipBarrageMask(mask,attr),attr}));
        const canonical=variants.reduce((a,b)=>b.mask<a.mask?b:a);
        if(!ids.has(canonical.mask)){ids.set(canonical.mask,masks.length);masks.push(canonical.mask);}
        lookup[mask*2]=ids.get(canonical.mask)!;
        lookup[mask*2+1]=8|canonical.attr;
    }
    const tiles=new Uint8Array(masks.length*16);
    masks.forEach((mask,i)=>{for(let y=0;y<8;y++)for(let x=0;x<8;x++)
        if(mask & (1 << ((y>>1)*4+(x>>1)))) {
            tiles[i*16+y*2]|=128>>x;tiles[i*16+y*2+1]|=128>>x;
        }
    });
    return {masks, tiles, lookup};
}
