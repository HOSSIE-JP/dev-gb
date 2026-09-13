/* Reviewed one-shot source migration. Raw Image Gen masters are kept intact.
 * Conversion is palette quantization, grid resampling and frame registration. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PNG}=require('pngjs'),lib=require('../build/library.cjs');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'projects/side-caravan'),source=path.join(dir,'assets-src/imagegen-v03');
const expected='3c09967e89e4a89924956938d5be7d95987ede4600563ff9f47423ac29300ee0';
const g=lib.readGame(root,'side-caravan');if(lib.revision(g)!==expected)throw Error('Source changed: review instead of overwriting edits.');
const names={player:'c25ce632-dbad-4b45-9e7e-ffc986df8422',drone:'5cf91001-c646-4169-959e-3d719a0d2ccc',sweeper:'d28384e5-6e21-4ed2-9865-288b548b5239',carrier:'2a4f006d-48af-4003-a266-a5f2716bd9f2',facility:'ba64072e-b430-45c2-a194-f14e1fc09eb9',boss:'fb4709a5-9937-451b-aac2-827585396687'};
const colors=['#0b1228','#276382','#77d5d7','#fff3c4'],rgb=colors.map(c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16))),manifest=[];
const images={};for(const [id,file] of Object.entries(names)){
 const dst=path.join(source,'masters',id+'.png');if(!fs.existsSync(dst))fs.copyFileSync(path.join('C:/Users/gameofneutral/.codex/generated_images/01a09432-e011-7631-98cd-fd58c6dadd1a','exec-'+file+'.png'),dst);
 const bytes=fs.readFileSync(dst);images[id]=PNG.sync.read(bytes);manifest.push({id,master:'masters/'+id+'.png',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),width:images[id].width,height:images[id].height});
}
function sample(im,x,y){const i=(Math.max(0,Math.min(im.height-1,Math.floor(y)))*im.width+Math.max(0,Math.min(im.width-1,Math.floor(x))))*4;let best=0,d=Infinity;rgb.forEach((c,n)=>{const v=c.reduce((s,k,j)=>s+(k-im.data[i+j])**2,0);if(v<d){best=n;d=v;}});return best;}
function cell(im,col,row,cols,rows,w,h,crop=[0,0,1,1]){return Array.from({length:w*h},(_,i)=>sample(im,(col+crop[0]+(i%w+.5)/w*crop[2])*im.width/cols,(row+crop[1]+(Math.floor(i/w)+.5)/h*crop[3])*im.height/rows));}
function frame(a,p,i,duration=8){return {id:a.id+'-'+i,image:'images/'+a.id+'-'+i+'.png',duration,pixels:p};}
function update(id,w,h,origin,hitbox,pixels){const a=g.assets.find(a=>a.id===id);Object.assign(a,{width:w,height:h,origin,hitbox,palette:a.kind==='sprite'?1:4});a.frames=pixels.map((p,i)=>frame(a,p,i));return a;}
// Each source cell uses the same crop; preserve alignment throughout a sequence.
for(const [id,row] of [['ship',0],['ship-barrier',1]]){
 const im=images.player,ps=[];for(let c=0;c<4;c++)ps.push(cell(im,c,row,4,2,24,16,[.06,.12,.90,.68]));
 for(let c=1;c<4;c++)for(let y=0;y<16;y++)for(let x=7;x<24;x++)ps[c][y*24+x]=ps[0][y*24+x];
 const a=update(id,24,16,{x:12,y:8},{x:9,y:6,w:6,h:4},ps);a.emitters=[{x:23,y:8}];
}
for(const id of ['drone','sweeper','carrier'])update(id,16,16,{x:8,y:8},id==='sweeper'?{x:2,y:3,w:12,h:10}:{x:2,y:4,w:12,h:8},[cell(images[id],0,0,2,1,16,16),cell(images[id],1,0,2,1,16,16)]);
const sheet=cell(images.facility,0,0,1,1,128,64),tiles=[];
// 64 hardware tiles selected from the 128-tile master: stars, deck, pipes,
// grilles, two 16x16 crates and reactor panels. Tile 0 is the cleared surround.
const selected=[...Array.from({length:16},(_,i)=>i),...Array.from({length:16},(_,i)=>16+i),...Array.from({length:8},(_,i)=>48+i),...Array.from({length:8},(_,i)=>64+i),80,81,96,97,84,85,100,101,...Array.from({length:8},(_,i)=>112+i)];
for(const [n,t] of selected.entries())for(let y=0;y<8;y++)for(let x=0;x<8;x++)tiles[(Math.floor(n/16)*8+y)*128+n%16*8+x]=n===0?0:sheet[(Math.floor(t/16)*8+y)*128+t%16*8+x];
update('facility',128,32,{x:0,y:0},{x:0,y:0,w:128,h:32},[tiles]);
const bp=[cell(images.boss,0,0,2,1,80,80),cell(images.boss,1,0,2,1,80,80)];
// Register the rigid shell to frame 0. Only the supplied core/exhaust animation
// regions change; this prevents generated hull shimmer and bounds VRAM updates.
for(let y=0;y<80;y++)for(let x=0;x<80;x++)if(!((x>=10&&x<26&&y>=32&&y<48)||(x>=70&&y>=20&&y<60)))bp[1][y*80+x]=bp[0][y*80+x];
const giant=update('giant-core',160,144,{x:66,y:72},{x:58,y:60,w:16,h:24},bp.map(p=>{const out=Array(160*144).fill(0);for(let y=0;y<80;y++)for(let x=0;x<80;x++)out[(y+32)*160+x+48]=p[y*80+x];return out;}));giant.frames.forEach(f=>f.duration=16);
g.palettes[1].colors=colors;g.palettes[4].colors=colors;g.palettes[0].colors=colors;
const s=structuredClone(g.stages[0]);s.name='01 / ORBITAL RUN';s.width=512;s.duration=60;s.scrollSpeed=1;s.music=36;s.bossMusic=37;s.requireBoss=true;s.clearOnBoss=true;delete s.parallax;
s.tiles=Array.from({length:512*18},(_,i)=>{const x=i%512,y=Math.floor(i/512),z=x<144?0:x<304?1:2;if(y===0||y>=17)return 0;if(y<3||y>14)return z===0?16+x%16:z===1?40+x%8:56+x%8;if(z>0&&y===3)return 32+x%8;return (x*11+y*7)%29===0?1+(x+y)%15:0;});s.walls=Array(s.tiles.length).fill(0);
s.destructibles.types.forEach((t,i)=>{t.tiles=i%2?[52,53,54,55]:[48,49,50,51];});
s.destructibles.objects=[];const put=(x,y,n)=>{if(!s.destructibles.objects.some(o=>o.x===x&&o.y===y))s.destructibles.objects.push({id:`object-${x}-${y}`,x,y,type:s.destructibles.types[(n/2)%2].id});};
for(const x of [48,196,338])for(let dx=0;dx<16;dx+=2)for(let y=0;y<16;y+=2)put(x+dx,y,x+dx+y);
for(let x=20;x<440;x+=4)if(![48,196,338].some(c=>x>=c&&x<c+16))put(x,[4,8,12][x%3],x);
for(const [x,type] of [[84,'cache-power'],[128,'cache-speed'],[264,'cache-bomb'],[300,'cache-life'],[404,'cache-score']])s.destructibles.objects.find(o=>o.x===x).type=type;
const event=(id,frame,kind,ref,x,y,count=1,spacingY=0,interval=0)=>({id,frame,kind,ref,x,y,count,spacing:0,spacingY,interval,value:0});
s.events=[];for(let n=0;n<28;n++){const frame=150+n*115,ref=['pin','wave','sweep','pin'][n%4];s.events.push(event('wave-'+n,frame,'enemy',ref,164,[36,76,116,52,100][n%5],n%4===0?2:1,24,12));}
// All seven pickup types, with recovery powerups late in the run. At least
// 180 updates apart: no more than two scripted pickups can overlap in the pool.
const pickups=['power','speed','barrier','power','bomb','speed','laser','life','score','speed','barrier','power','laser'];
pickups.forEach((id,i)=>s.events.push(event('pickup-'+i,180+i*250,'item',id,150,76)));
s.events.push(event('reactor-arrives',3600,'boss',g.bosses[0].id,130,72));s.events.sort((a,b)=>a.frame-b.frame);
g.stages=[s];g.stageOrder=[s.id];g.startStage=s.id;g.stageFade=false;g.music.title=35;g.music.boss=37;
const b=g.bosses[0];b.contactBoxes=[{x:-16,y:-22,w:66,h:44},{x:-16,y:-32,w:54,h:10},{x:-16,y:22,w:54,h:10},{x:16,y:-36,w:20,h:72}];
b.phases[0].motion.points=[{frame:0,x:0,y:0},{frame:96,x:-34,y:0}];b.battle.returnX=96;
g.provenance={...g.provenance,source:'Original Image Gen masters (2026-09-12), prompts, hashes and GB conversion: assets-src/imagegen-v03. Original SIDE CARAVAN score: engine/caravan/assets-src/side-score.json. Original maps and characters; no commercial game assets.'};
const errors=lib.validate(g).filter(d=>d.severity==='error');if(errors.length)throw Error(JSON.stringify(errors));
const revision=lib.saveGame(root,'side-caravan',g,expected);
fs.writeFileSync(path.join(source,'manifest.json'),JSON.stringify({generator:'OpenAI built-in Image Gen',date:'2026-09-12',palette:colors,conversion:'editor/scripts/revise-side-caravan-v03.cjs',masters:manifest,tileSelection:selected,bossAnimationRegions:[{x:10,y:32,w:16,h:16},{x:70,y:20,w:10,h:40}],projectRevision:revision},null,2)+'\n');
const workflow=JSON.parse(fs.readFileSync(path.join(dir,'workflow.json')));workflow.history.push({version:workflow.version,projectRevision:workflow.projectRevision,rom:workflow.rom,debug:workflow.debug,validationReport:workflow.validationReport});Object.assign(workflow,{version:'0.3-orbital-run',status:'validation-in-progress',projectRevision:revision,approved:false});delete workflow.rom;delete workflow.debug;workflow.automated={};fs.writeFileSync(path.join(dir,'workflow.json'),JSON.stringify(workflow,null,2)+'\n');
console.log(JSON.stringify({revision,objects:s.destructibles.objects.length,spriteTiles:lib.spriteLayout(g).tiles,assets:g.assets.length}));
