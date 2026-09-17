import type {Game} from "./model";
const spriteCache = new WeakMap<Game, ReturnType<typeof quantizeSpriteAssets>>();
const frameCache = new WeakMap<Game, Map<number[], ReturnType<typeof quantizeColorTiles>>>();
export function colorPreview(game:Game,asset:Game["assets"][number],frame=asset.frames[0]) {
    if(asset.kind==="sprite") {let q=spriteCache.get(game);if(!q){q=quantizeSpriteAssets(game);spriteCache.set(game,q);}return q.enabled?q.frames.get(asset.id+"/"+frame.id)?.preview:undefined;}
    if(!frame.cgbPixels)return undefined;
    let cache=frameCache.get(game);if(!cache){cache=new Map();frameCache.set(game,cache);}
    let q=cache.get(frame.cgbPixels);
    if(!q){const groups=game.stages.filter(s=>s.tileset===asset.id&&s.parallax?.enabled).map(s=>Array.from({length:s.parallax!.width*s.parallax!.height},(_,i)=>s.parallax!.firstTile+i));q=quantizeColorTiles(asset.width,asset.height,frame.cgbPixels,undefined,groups);cache.set(frame.cgbPixels,q);}
    return q.preview;
}
export const colorHex=(rgb:number)=>`#${rgb.toString(16).padStart(6,"0")}`;
/** Hardware RGB555 tile quantization. Palette zero belongs to the UI. */
export function rgb555(rgb: number): number {
    return ((rgb >>> 19) & 31) | (((rgb >>> 11) & 31) << 5) | (((rgb >>> 3) & 31) << 10);
}
/** OBJ palettes are shared by every resident and overlay actor. Index zero is transparent. */
export function quantizeSpriteAssets(game:Game) {
    const assets=game.assets.filter(a=>a.kind==="sprite"), rgb:number[]=[], mask:number[]=[], ranges:{image:string,start:number,width:number,height:number}[]=[];
    for(const a of assets)for(const f of a.frames){
        ranges.push({image:a.id+"/"+f.id,start:rgb.length,width:a.width,height:a.height});
        for(let y=0;y<a.height;y+=8)for(let x=0;x<a.width;x+=8)for(let j=0;j<8;j++)for(let i=0;i<8;i++){
            const at=(y+j)*a.width+x+i;
            rgb.push(f.cgbPixels?.[at] ?? Number.parseInt(game.palettes[a.palette].colors[f.pixels[at]].slice(1),16));mask.push(f.cgbPixels ? +(f.cgbPixels[at]>=0) : f.pixels[at]);
        }
    }
    const pairs:number[][]=[];
    if(game.performance?.dense)for(const r of ranges)for(let y=0;y+8<r.height;y+=16)for(let x=0;x<r.width/8;x++){
        const top=r.start/64+y/8*(r.width/8)+x;pairs.push([top,top+r.width/8]);
    }
    const q=quantizeColorTiles(8,rgb.length/8,rgb,mask,pairs), frames=new Map<string,{pixels:number[],preview:number[],attributes:number[]}>();
    for(const r of ranges){const pixels:number[]=[],preview:number[]=[];let n=r.start;for(let y=0;y<r.height;y+=8)for(let x=0;x<r.width;x+=8)for(let j=0;j<8;j++)for(let i=0;i<8;i++){const at=(y+j)*r.width+x+i;pixels[at]=q.pixels[n];preview[at]=q.preview[n++];}frames.set(r.image,{pixels,preview,attributes:q.attributes.slice(r.start/64,n/64)});}
    return {frames,palettes:q.palettes,error:q.error,enabled:assets.some(a=>a.frames.some(f=>!!f.cgbPixels))};
}
export function expand555(c: number): number {
    const byte = (v: number) => (v << 3) | (v >>> 2);
    return (byte(c & 31) << 16) | (byte((c >>> 5) & 31) << 8) | byte(c >>> 10);
}
type Histogram = Map<number, number>;
const distance = (a: number, b: number) => 2 * ((a & 31) - (b & 31)) ** 2 + 4 * (((a >>> 5) & 31) - ((b >>> 5) & 31)) ** 2 + ((a >>> 10) - (b >>> 10)) ** 2;
function nearest(c: number, palette: number[]) {
    let best = 0, error = Infinity;
    palette.forEach((p, i) => { const d = distance(c, p); if (d < error) { error = d; best = i; } });
    return { best, error };
}
function fit(hist: Histogram, count = 4): number[] {
    const colors = [...hist.keys()].sort((a,b) => (hist.get(b)!-hist.get(a)!) || a-b);
    if (!colors.length) return Array(count).fill(0);
    const palette = [colors[0]];
    while (palette.length < count) {
        let best = colors[0], score = -1;
        for (const c of colors) { const e = nearest(c,palette).error * hist.get(c)!; if (e > score) { best=c; score=e; } }
        palette.push(best);
    }
    for (let pass=0;pass<8;pass++) {
        const sums = Array.from({length:count},()=>[0,0,0,0]);
        for (const [c,w] of hist) { const s=sums[nearest(c,palette).best]; s[0]+=(c&31)*w; s[1]+=((c>>>5)&31)*w; s[2]+=(c>>>10)*w; s[3]+=w; }
        sums.forEach((s,i)=>{if(s[3])palette[i]=Math.round(s[0]/s[3])|(Math.round(s[1]/s[3])<<5)|(Math.round(s[2]/s[3])<<10);});
    }
    return palette.sort((a,b)=>((a&31)*2+((a>>>5)&31)*4+(a>>>10))-((b&31)*2+((b>>>5)&31)*4+(b>>>10)) || a-b);
}
const error = (h: Histogram,p: number[]) => {let e=0;for(const [c,w] of h)e+=nearest(c,p).error*w;return e;};
export function quantizeColorTiles(width: number,height: number,rgb: readonly number[], mask?: readonly number[], samePaletteTiles: number[][] = []) {
    if(width%8 || height%8 || rgb.length!==width*height)throw new Error("Color images must contain complete 8x8 tiles");
    const input=rgb.map(rgb555), histograms: Histogram[]=[], all: Histogram=new Map();
    for(let y=0;y<height;y+=8)for(let x=0;x<width;x+=8){
        const h:Histogram=new Map();for(let j=0;j<8;j++)for(let i=0;i<8;i++){const at=(y+j)*width+x+i;if(mask&&!mask[at])continue;const c=input[at];h.set(c,(h.get(c)??0)+1);all.set(c,(all.get(c)??0)+1);}histograms.push(h);
    }
    const fitPalette=(h:Histogram)=>fit(h,mask?3:4), palettes=[fitPalette(all)];
    while(palettes.length<7){let worst=0,score=-1;histograms.forEach((h,i)=>{const e=Math.min(...palettes.map(p=>error(h,p)));if(e>score){score=e;worst=i;}});palettes.push(fitPalette(histograms[worst]));}
    const attributes:number[]=Array(histograms.length).fill(0);
    for(let pass=0;pass<12;pass++){
        const groups:Histogram[]=Array.from({length:7},()=>new Map());
        histograms.forEach((h,i)=>{let best=0,e=Infinity;palettes.forEach((p,n)=>{const d=error(h,p);if(d<e){best=n;e=d;}});attributes[i]=best+1;for(const[c,w]of h)groups[best].set(c,(groups[best].get(c)??0)+w);});
        if(pass<11)groups.forEach((h,i)=>{if(h.size)palettes[i]=fitPalette(h);});
    }
    for(const group of samePaletteTiles){let best=0,score=Infinity;palettes.forEach((p,n)=>{const e=group.reduce((sum,i)=>sum+error(histograms[i],p),0);if(e<score){score=e;best=n;}});for(const i of group)attributes[i]=best+1;}
    const pixels=Array(input.length).fill(0), preview=Array(input.length).fill(0);
    let squaredError=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const i=y*width+x,p=palettes[attributes[Math.floor(y/8)*(width/8)+Math.floor(x/8)]-1],n=nearest(input[i],p);
        if(mask&&!mask[i])continue;
        pixels[i]=n.best+(mask?1:0);preview[i]=expand555(p[n.best]);squaredError+=n.error;
    }
    return {pixels,attributes,palettes:palettes.flatMap(p=>mask?[0,...p]:p),preview,error:squaredError/input.length,singlePaletteError:error(all,fitPalette(all))/input.length};
}
