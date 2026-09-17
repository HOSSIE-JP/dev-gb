const path=require('node:path');const l=require(path.resolve('editor/build/library.cjs'));const root=process.cwd(),g=l.readGame(root,'touhou-kouma'),rev=l.revision(g),report=[];
for(const s of g.stages){
 if(!s.parallax?.enabled||s.tileset.endsWith('-hud40'))continue;
 const a=g.assets.find(a=>a.id===s.tileset),par=s.parallax,animated=Array.from({length:par.width*par.height},(_,i)=>par.firstTile+i);
 const keep=[...new Set(s.tiles.filter((_,i)=>i%s.width<15))].filter(i=>!animated.includes(i)).sort((a,b)=>a-b).concat(animated),remap=new Map(keep.map((v,i)=>[v,i]));
 let dims;for(let w=1;w<=16;w++)for(let h=1;h<=16;h++)if(w*h>=keep.length&&(!dims||w*h<dims[0]*dims[1]||(w*h===dims[0]*dims[1]&&Math.abs(w-h)<Math.abs(dims[0]-dims[1]))))dims=[w,h];
 if(dims[0]*dims[1]>101)throw Error('Tile budget '+s.id);
 const width=dims[0]*8,height=dims[1]*8;
 function pack(src){const dst=Array(width*height).fill(0);for(let n=0;n<keep.length;n++){const tile=keep[n];for(let y=0;y<8;y++)for(let x=0;x<8;x++)dst[(Math.floor(n/dims[0])*8+y)*width+n%dims[0]*8+x]=src[(Math.floor(tile/(a.width/8))*8+y)*a.width+tile%(a.width/8)*8+x];}return dst;}
 const out={...structuredClone(a),id:a.id+'-hud40',name:a.name+'（右HUD用）',width,height,origin:{x:0,y:0},hitbox:{x:0,y:0,w:width,h:height}};
 out.frames=out.frames.map((f,i)=>({...f,image:`images/${out.id}-f${i}.png`,pixels:pack(f.pixels),...(f.cgbPixels?{cgbImage:`images/${out.id}-f${i}-cgb.png`,cgbPixels:pack(f.cgbPixels)}:{})}));
 g.assets.push(out);s.tileset=out.id;s.tiles=s.tiles.map((t,i)=>i%s.width<15?remap.get(t):0);par.firstTile=keep.length-animated.length;
 report.push({stage:s.id,source:a.id,derived:out.id,tiles:dims[0]*dims[1],parallaxFirst:par.firstTile});
}
l.saveGame(root,'touhou-kouma',g,rev);console.log(report);
