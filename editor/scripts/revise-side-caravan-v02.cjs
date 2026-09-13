/* One-shot migration of the reviewed v0.1 source; never invoked by save/build.
 * New pictures are original, editable four-index pixel assets (MIT). */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),lib=require('../build/library.cjs');
const expected='b92c0fdc34fff3ddfc3ff80084e05a826e47c82a39acc2521abee0248852ffd5';
const g=lib.readGame(root,'side-caravan');
if(lib.revision(g)!==expected)throw Error('The source changed; review the migration instead of overwriting edits.');
const copy=x=>structuredClone(x),old=g.stages[0];
const asset=(id,name,w,h,pixels,kind='sprite',origin={x:w/2,y:h/2})=>({id,name,kind,width:w,height:h,palette:kind==='screen'?4:1,origin,hitbox:{x:0,y:0,w,h},emitters:[],frames:[{id:id+'-0',image:'images/'+id+'-0.png',duration:8,pixels}]});
const glyph=(id,rows)=>{
 const p=Array(64).fill(2);for(let y=1;y<7;y++)for(let x=1;x<7;x++)p[y*8+x]=1;
 rows.forEach((row,y)=>[...row].forEach((c,x)=>{if(c==='1')p[(y+1)*8+x+2]=3;}));
 return asset('item-'+id,id==='barrier'?'H / BARRIER':'L / LASER',8,8,p);
};
g.assets.push(glyph('barrier',['1001','1001','1111','1001','1001','1001']),glyph('laser',['1000','1000','1000','1000','1000','1111']));
const shield=copy(g.assets.find(a=>a.id==='ship'));shield.id='ship-barrier';shield.name='自機 / バリア装着';shield.frames=shield.frames.map((f,n)=>({...f,id:`ship-barrier-${n}`,image:`images/ship-barrier-${n}.png`,pixels:f.pixels.map((v,i)=>v||((i%16===1||i%16===14||i<16||i>=112)&&i%16>0&&i%16<15?2:0))}));g.assets.push(shield);
const laserPixels=Array(64).fill(0);for(let x=0;x<8;x++){laserPixels[3*8+x]=3;laserPixels[4*8+x]=2;}
g.assets.push(asset('laser-pulse','集中レーザーパルス',8,8,laserPixels));
g.player.barrierMax=3;g.player.barrierFrames=45;g.player.barrierAsset=shield.id;g.player.bomb.live=true;
g.player.powerUps.shotWeapons=['shot-1','shot-2','shot-3'];
g.patterns=g.patterns.filter(p=>p.id!=='shot-5');
for(const p of g.patterns.filter(p=>p.id.startsWith('shot-'))){p.interval=p.id==='shot-3'?10:12;p.speed=8;p.lifetime=25;}
g.patterns.push({...copy(g.patterns[0]),id:'laser',name:'FOCUS LASER',asset:'laser-pulse',kind:'laser',interval:4,damage:3,lifetime:24});
for(const [id,effect] of [['barrier',{kind:'barrier',amount:1}],['laser',{kind:'weapon',amount:1,weapon:'laser'}]])g.items.push({...copy(g.items[0]),id,name:id==='barrier'?'H / バリア':'L / 集中レーザー',asset:'item-'+id,effects:[effect]});
for(const item of g.items){item.motion.vx=-1;item.lifetime=220;}
for(const e of g.enemies)if(e.motion.kind!=='straight')e.motion.smooth=true;
// The original three map sections are spread over three independently editable
// maps. Keep dense 8x8 clusters intact while moving their group as a unit.
const starts=[0,112.5,253.125],speeds=[.75,.875,1],factors=[3,2.8,8/3],clusters=[40,176,326];
g.stages=starts.map((start,z)=>{
 const s=copy(old);s.id='side-'+(z+1);s.name=['01 / APPROACH','02 / BATTLESHIP DECK','03 / REACTOR'][z];s.width=512;s.scrollSpeed=speeds[z];s.duration=60;s.requireBoss=z===2;s.clearOnBoss=z===2;
 s.tiles=Array.from({length:512*18},(_,i)=>old.tiles[Math.floor(i/512)*old.width+Math.min(old.width-1,Math.floor(start+(i%512)/factors[z]))]);s.walls=Array(s.tiles.length).fill(0);
 s.destructibles.objects=old.destructibles.objects.filter(o=>o.x>=start&&(z===2||o.x<starts[z+1])).map(o=>{
  const cluster=clusters[z],x=o.x>=cluster&&o.x<cluster+16?Math.round((cluster-start)*factors[z]/2)*2+(o.x-cluster):Math.round((o.x-start)*factors[z]/2)*2;
  return {...o,x};
 });
 s.events=old.events.filter(e=>e.kind!=='scroll'&&e.kind!=='end'&&e.frame>=z*3600&&(z===2||e.frame<(z+1)*3600)).map(e=>({...e,frame:e.frame-z*3600}));
 if(z<2)s.events.push({id:s.id+'-end',frame:3599,kind:'end',ref:'',x:0,y:0,count:1,spacing:0,interval:0,value:0});
 const pickup=(id,second)=>({id:s.id+'-'+id,frame:second*60,kind:'item',ref:id,x:150,y:76,count:1,spacing:0,interval:0,value:0});
 s.events.push(pickup('barrier',[5,7,7][z]),pickup('laser',[35,30,35][z]));
 s.events.sort((a,b)=>a.frame-b.frame);return s;
});
g.stageOrder=g.stages.map(s=>s.id);g.startStage=g.stageOrder[0];g.stageFade=false;
// A full-screen reactor superstructure, with a bright vulnerable core at its
// origin. Repeated original panels keep the hardware tile atlas compact.
const w=160,h=144,pixels=Array(w*h).fill(0);
function rect(x,y,rw,rh,c){for(let yy=y;yy<y+rh;yy++)for(let xx=x;xx<x+rw;xx++)if(xx>=0&&yy>=0&&xx<w&&yy<h)pixels[yy*w+xx]=c;}
rect(72,8,88,128,1);rect(88,0,72,144,1);
for(let y=8;y<136;y+=16)for(let x=72;x<160;x+=16){rect(x,y,16,16,1);rect(x+1,y+1,14,14,2);rect(x+3,y+3,10,10,1);rect(x+4,y+4,8,2,3);}
for(const y of [16,112]){rect(24,y,80,16,2);rect(24,y+2,80,12,1);rect(24,y+6,72,4,3);rect(96,y-8,16,32,2);}
rect(48,48,64,48,2);rect(48,52,60,40,1);rect(56,56,40,32,2);rect(64,60,24,24,3);rect(68,64,16,16,1);rect(72,66,8,12,3);
rect(40,66,24,12,1);rect(40,70,24,4,3);rect(100,56,8,32,3);
const giant=asset('giant-core','巨大BG / REACTOR CITADEL',w,h,pixels,'screen',{x:76,y:72});g.assets.push(giant);
const boss=g.bosses[0];boss.name='REACTOR CITADEL';boss.hp=180;boss.battle={background:'bg-boss',graphic:giant.id,maxBullets:32,returnX:116,returnY:72};
boss.phases.forEach((p,i)=>{p.threshold=[120,60,0][i];p.motion.smooth=true;p.motion.oscillationAxis='y';if(i)p.motion.amplitude=i===1?20:16;});
boss.phases[0].motion.points=[{frame:0,x:0,y:0},{frame:96,x:-20,y:0}];
const bossEvent=g.stages[2].events.find(e=>e.kind==='boss');bossEvent.x=136;bossEvent.y=72;
const fan=g.patterns.find(p=>p.id==='fan');Object.assign(fan,{count:5,spread:90,interval:60,speed:1.25});
Object.assign(g.patterns.find(p=>p.id==='core-line'),{kind:'fan',count:3,spread:45,interval:36,speed:1.5});
Object.assign(g.patterns.find(p=>p.id==='core-final'),{interval:24,speed:1.5});
const hud=g.screens.find(s=>s.id==='hud');hud.items=[
 {id:'score',text:'',x:0,y:0,palette:5,binding:'score',digits:5},
 ...[['lives','P',6],['bombs','B',9],['shotLevel','W',12],['speedLevel','V',15],['barrier','H',18]].map(([binding,text,x])=>({id:binding,text,x,y:0,palette:5,binding,digits:1}))
];
const errors=lib.validate(g).filter(d=>d.severity==='error');if(errors.length)throw Error(JSON.stringify(errors));
const revision=lib.saveGame(root,'side-caravan',g,expected);
const dir=path.join(root,'projects/side-caravan'), workflow=JSON.parse(fs.readFileSync(path.join(dir,'workflow.json'),'utf8'));
workflow.history=[...(workflow.history??[]),{version:workflow.version,projectRevision:workflow.projectRevision,rom:workflow.rom,debug:workflow.debug,validationReport:workflow.validationReport}];
workflow.feedback.push({date:'2026-09-12',request:'背景加速、動作を続けるボム、バリア、3方向密度と集中レーザー、滑らかな移動、BGスクロール巨大ボス＋BG弾幕',status:'implemented-awaiting-validation'});
workflow.version='0.2-live-bomb-bg-boss';workflow.status='validation-in-progress';workflow.projectRevision=revision;
delete workflow.rom;delete workflow.debug;workflow.automated={};
fs.writeFileSync(path.join(dir,'workflow.json'),JSON.stringify(workflow,null,2)+'\n');
const brief=JSON.parse(fs.readFileSync(path.join(dir,'brief.json'),'utf8'));brief.stageCount=3;brief.creative.weapons='通常・2連・高密度3方向、Lで集中パルスレーザー、Hでバリア';brief.creative.scrollSpeeds=speeds;brief.creative.boss='160×144 BG画像・BGスクロール移動・BG弾幕32発';brief.constraints.maxScore=38320;
fs.writeFileSync(path.join(dir,'brief.json'),JSON.stringify(brief,null,2)+'\n');console.log(JSON.stringify({revision,stages:g.stages.map(s=>({id:s.id,objects:s.destructibles.objects.length,speed:s.scrollSpeed})),assets:g.assets.length}));
