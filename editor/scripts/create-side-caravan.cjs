/* Manual, deterministic original authoring source. Normal saves/builds never run this. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const lib = require('../build/library.cjs');
const id = 'side-caravan';

const font = {
 A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],
 C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],
 E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],
 G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],
 I:['111','010','010','010','010','010','111'],L:['10000','10000','10000','10000','10000','10000','11111'],
 M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','10101','10011','10001','10001','10001'],
 O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],
 R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110'],
 T:['11111','00100','00100','00100','00100','00100','00100'],U:['10001','10001','10001','10001','10001','10001','01110'],
 V:['10001','10001','10001','10001','10001','01010','00100'],W:['10001','10001','10001','10101','10101','10101','01010'],
 Y:['10001','10001','01010','00100','00100','00100','00100'],
 '1':['010','110','010','010','010','010','111'],'+':['00000','00100','00100','11111','00100','00100','00000'],
};
function canvas(w,h) {
 const pixels=Array(w*h).fill(0);
 return {w,h,pixels,put(x,y,c){if(x>=0&&y>=0&&x<w&&y<h)pixels[y*w+x]=c;},
  rect(x,y,rw,rh,c){for(let dy=0;dy<rh;dy++)for(let dx=0;dx<rw;dx++)this.put(x+dx,y+dy,c);},
  text(text,y,scale=1,c=3){const width=[...text].reduce((n,ch)=>n+(font[ch]?.[0].length??3)+1,0)*scale;let x=Math.floor((w-width)/2);for(const ch of text){const glyph=font[ch];if(glyph)glyph.forEach((row,dy)=>[...row].forEach((v,dx)=>{if(v==='1')this.rect(x+dx*scale,y+dy*scale,scale,scale,c);}));x+=((glyph?.[0].length??3)+1)*scale;}},
 };
}
function asset(aid,name,kind,w,h,palette,frames,extra={}) {
 return {id:aid,name,kind,width:w,height:h,palette,origin:{x:kind==='sprite'?w/2:0,y:kind==='sprite'?h/2:0},
  hitbox:{x:0,y:0,w,h},emitters:[],frames:frames.map((pixels,n)=>({id:`${aid}-${n}`,image:`images/${aid}-${n}.png`,duration:8,pixels})),...extra};
}
const ascii = rows => rows.flatMap(row=>[...row].map(n=>Number(n)));
const ship = ascii([
 '0000000200000000','0011100222000000','0002322333320000','1233333333333330',
 '1233333333333330','0002322333320000','0011100222000000','0000000200000000',
]);
const drone = ascii(['00222000','02333200','23323320','32222233','32222233','23323320','02333200','00222000']);
const assets=[
 asset('ship','自機 / SIDE LANCER','sprite',16,8,0,[ship,ship.map((v,i)=>i%16<2&&v?2:v)],{hitbox:{x:5,y:2,w:6,h:4},emitters:[{x:16,y:4}]}),
 asset('pulse','自弾 / PULSE','sprite',8,8,1,[ascii(['00000000','00000000','00000000','02333320','02333320','00000000','00000000','00000000'])],{hitbox:{x:1,y:3,w:6,h:2}}),
 asset('orb','敵弾 / ORB','sprite',8,8,2,[ascii(['00000000','00033000','00322300','03233230','03233230','00322300','00033000','00000000'])],{hitbox:{x:2,y:2,w:4,h:4}}),
 asset('drone','編隊機 / PIN','sprite',8,8,2,[drone,drone.map(v=>v===2?1:v)],{hitbox:{x:1,y:1,w:6,h:6},emitters:[{x:0,y:4}]}),
];
for(const [aid,name,role] of [['sweeper','迎撃機 / SWEEPER',2],['carrier','補給艇 / SUPPLY',3]]){
 const c=canvas(16,8);c.rect(2,1,12,6,2);c.rect(0,3,15,2,3);c.rect(5,2,6,4,1);c.rect(6,3,4,2,3);
 if(aid==='sweeper'){c.rect(7,0,5,1,3);c.rect(7,7,5,1,3);}else{c.rect(11,2,3,4,3);c.rect(1,2,2,4,1);}
 assets.push(asset(aid,name,'sprite',16,8,role,[c.pixels],{hitbox:{x:2,y:1,w:12,h:6},emitters:[{x:0,y:4}]}));
}
// Two hardware sprites per scanline leave room for simultaneous5way shots and enemy fire.
const bossArt=canvas(16,24);
bossArt.rect(5,2,10,20,2);bossArt.rect(7,0,7,3,3);bossArt.rect(7,21,7,3,3);
bossArt.rect(4,4,11,16,1);bossArt.rect(0,5,6,3,3);bossArt.rect(0,16,6,3,3);
bossArt.rect(0,10,13,4,2);bossArt.rect(4,8,7,8,3);bossArt.rect(5,10,5,4,1);bossArt.rect(6,11,3,2,3);
bossArt.rect(12,5,3,14,2);bossArt.rect(13,8,1,8,3);
assets.push(asset('core','要塞ボス / TRIPLE CORE','sprite',16,24,4,[bossArt.pixels],{hitbox:{x:1,y:3,w:14,h:18},emitters:[{x:0,y:12}]}));
const burstFrames=[];
for(let f=0;f<3;f++){const c=canvas(8,8);for(let y=0;y<8;y++)for(let x=0;x<8;x++){const d=Math.abs(2*x-7)+Math.abs(2*y-7);if(d<4+f*4)c.put(x,y,d<4?3:2);}burstFrames.push(c.pixels);}
assets.push(asset('burst','爆発 / SPARK','sprite',8,8,1,burstFrames));
for(const [key,glyph,palette] of [['power','P',1],['speed','S',0],['bomb','B',3],['life','1',4],['score','+',1]]){
 const c=canvas(8,8);c.rect(0,0,8,8,2);c.rect(1,1,6,6,1);c.text(glyph,0,1,3);
 assets.push(asset(`item-${key}`,`アイテム / ${key.toUpperCase()}`,'sprite',8,8,palette,[c.pixels],{hitbox:{x:0,y:0,w:8,h:8}}));
}
const atlas=canvas(128,32);
function tile(index,draw){const c=canvas(8,8);draw(c);const ox=index%16*8,oy=Math.floor(index/16)*8;for(let y=0;y<8;y++)for(let x=0;x<8;x++)atlas.put(ox+x,oy+y,c.pixels[y*8+x]);}
tile(0,()=>{});tile(1,c=>c.put(2,3,1));tile(2,c=>{c.put(6,1,2);c.put(1,6,1);});tile(3,c=>{c.put(4,4,2);c.put(3,4,1);c.put(5,4,1);});
for(let i=4;i<32;i++)tile(i,c=>{const zone=Math.floor(i/8);c.rect(0,0,8,8,zone===1?1:0);c.rect(0,0,8,1,2);c.rect(0,0,1,8,2);if(i%4===0)c.rect(2,2,4,4,1);if(i%4===1){for(let y=2;y<7;y+=2)c.rect(2,y,5,1,2);}if(i%4===2){c.rect(3,0,2,8,2);c.rect(3,3,2,2,3);}if(i%4===3){c.rect(2,2,4,4,2);c.rect(3,3,2,2,1);}});
for(let style=0;style<8;style++)for(let part=0;part<4;part++)tile(32+style*4+part,c=>{
 const left=part%2===0,top=part<2;c.rect(0,0,8,8,1);c.rect(left?0:7,0,1,8,3);c.rect(0,top?0:7,8,1,3);
 c.rect(left?2:0,top?2:0,6,6,2);c.rect(left?3:0,top?3:0,5,5,1);
 if(style===0)c.rect(left?4:0,top?4:0,4,4,2);
 else if(style===1){for(let k=1;k<7;k+=2)c.rect(k,2,1,4,2);}
 else {c.rect(left?5:0,top?5:0,3,3,3);if((style+part)%2)c.put(3,3,3);}
});
assets.push(asset('facility','軌道施設・甲板・炉心 / BG','tileset',128,32,5,[atlas.pixels]));
function screenArt(kind){const c=canvas(160,144);for(let y=0;y<144;y+=8)for(let x=0;x<160;x+=8)if((x/8+y/8*3)%7===0)c.put(x+3,y+3,1);
 c.rect(8,8,144,1,2);c.rect(8,134,144,1,2);
 if(kind==='title'){c.text('SIDE',18,3,3);c.text('CARAVAN',44,3,3);for(let y=0;y<8;y++)for(let x=0;x<16;x++)if(ship[y*16+x])c.rect(56+x*3,76+y*3,3,3,ship[y*16+x]);}
 else if(kind==='clear'){c.text('CORE SILENCED',30,1,3);c.text('MISSION CLEAR',50,1,2);c.rect(32,75,96,2,2);}
 else if(kind==='over'){c.text('SIGNAL LOST',35,2,3);c.rect(32,75,96,2,1);}
 else {for(let y=0;y<144;y++)for(let x=0;x<160;x++){const d=Math.abs(x-80)+Math.abs(y-76);if((d>>3)%3===0)c.put(x,y,3);else if((d>>3)%3===1)c.put(x,y,2);}}
 return c.pixels;}
for(const [key,name] of [['title','タイトル'],['clear','クリア'],['over','ゲームオーバー'],['bomb','ボム演出']])assets.push(asset(`${key}-art`,name,'screen',160,144,5,[screenArt(key)]));
const motion=(vx=0,vy=0,extra={})=>({kind:'straight',vx,vy,amplitude:0,period:128,loop:false,points:[{x:0,y:0,frame:0},{x:0,y:0,frame:60}],...extra});
const pattern=(pid,name,extra={})=>({id:pid,name,asset:'pulse',kind:'straight',speed:6,angle:90,count:1,spread:0,interval:20,rotation:0,repeats:0,delay:0,lifetime:40,damage:1,emitterOffsets:[{x:8,y:0}],...extra});
const patterns=[
 pattern('shot-1','NORMAL'),pattern('shot-2','TWIN',{emitterOffsets:[{x:8,y:-3},{x:8,y:3}]}),
 pattern('shot-3','TRI PULSE',{kind:'fan',count:3,spread:45}),pattern('shot-5','FIVE PULSE',{kind:'fan',count:5,spread:90}),
 pattern('aim','AIMED',{asset:'orb',kind:'aimed',angle:0,speed:1.25,interval:110,delay:48,lifetime:180,emitterOffsets:[{x:-8,y:0}]}),
 pattern('fan','CORE FAN',{asset:'orb',kind:'fan',angle:270,count:3,spread:45,speed:1.5,interval:110,delay:55,lifetime:130,emitterOffsets:[{x:-8,y:0}]}),
 pattern('core-line','CORE PRESSURE',{asset:'orb',angle:270,speed:1.75,interval:45,delay:30,lifetime:110,emitterOffsets:[{x:-8,y:0}]}),
 pattern('core-final','CORE CHASE',{asset:'orb',kind:'homing',angle:270,speed:1.5,interval:75,delay:20,lifetime:120,emitterOffsets:[{x:-8,y:0}],guidance:{frames:32,period:16}}),
];
const enemies=[
 {id:'pin',name:'PIN FORMATION',asset:'drone',hp:1,score:80,motion:motion(-1.5),pattern:''},
 {id:'sweep',name:'SWEEPER',asset:'sweeper',hp:2,score:150,motion:motion(-1),pattern:'aim'},
 {id:'wave',name:'WAVE INTERCEPTOR',asset:'sweeper',hp:2,score:150,motion:motion(-1.25,0,{kind:'wave',oscillationAxis:'y',amplitude:20,period:128}),pattern:''},
 {id:'supply',name:'SUPPLY CARRIER',asset:'carrier',hp:3,score:200,motion:motion(-0.75),pattern:'',dropItem:'power'},
];
const bosses=[{id:'triple-core',name:'TRIPLE CORE',asset:'core',hp:96,score:5000,motion:motion(),pattern:'fan',battle:{background:'stage',maxBullets:8,returnX:130,returnY:76},phases:[
 {id:'core-entry',name:'TRACKING CORE',until:'hp',threshold:64,pattern:'fan',motion:motion(0,0,{kind:'path',points:[{frame:0,x:0,y:0},{frame:100,x:-46,y:0}],loop:false})},
 {id:'core-pressure',name:'PRESSURE CORE',until:'hp',threshold:32,pattern:'core-line',motion:motion(0,0,{kind:'wave',oscillationAxis:'y',amplitude:34,period:256})},
 {id:'core-final',name:'LAST CORE',until:'hp',threshold:0,pattern:'core-final',motion:motion(0,0,{kind:'wave',oscillationAxis:'y',amplitude:24,period:128})},
]}];
const items=[['power','shot',1],['speed','speed',1],['bomb','bomb',1],['life','life',1],['score','score',500]].map(([key,kind,amount])=>({id:key,name:{power:'P / ショット強化',speed:'S / スピード',bomb:'B / ボム追加',life:'1 / 1UP',score:'+ / 500点'}[key],asset:`item-${key}`,motion:motion(-0.625),lifetime:260,effects:[{kind,amount}]}));
const width=448,height=18,tiles=Array(width*height).fill(0),walls=Array(width*height).fill(0);
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 const zone=x<112?0:x<254?1:2;
 let t=(x*7+y*11)%23<3?1+(x+y)%3:0;
 if(zone===0&&(y<2||y>14))t=4+(x%4);
 if(zone===1)t=(y===0||y===16)?10:(y<4||y>12)?8+(x+y)%4:((x%16===0)?11:0);
 if(zone===2)t=(y<3||y>13)?16+(x+y)%4:((y===4||y===12)?18:t);
 tiles[y*width+x]=t;
}
const types=[{id:'panel',name:'薄装甲パネル / 40点',tiles:[32,33,34,35],hp:1,score:40,solid:false},{id:'armour',name:'重装甲パネル / 100点',tiles:[36,37,38,39],hp:3,score:100,solid:false}];
for(const [n,item] of ['power','speed','bomb','life','score'].entries())types.push({id:`cache-${item}`,name:`補給コンテナ / ${item}`,tiles:[40+n*4,41+n*4,42+n*4,43+n*4],hp:2,score:60,solid:false,dropItem:item});
const objects=[],occupied=new Set();
function place(x,y,type='panel'){const k=`${x},${y}`;if(occupied.has(k))return;occupied.add(k);objects.push({id:`bg-${x}-${y}`,type,x,y});}
for(const x0 of [40,176,326])for(let dx=0;dx<8;dx++)for(let dy=0;dy<8;dy++)place(x0+dx*2,dy*2,'panel');
for(let x=18;x<430;x+=18)for(const y of [0,2,12,14])place(x,y,x%36===0?'armour':'panel');
for(const [x,y,kind] of [[82,6,'power'],[138,8,'score'],[226,6,'bomb'],[290,10,'speed'],[396,6,'score']])place(x,y,`cache-${kind}`);
const events=[];
function event(eid,seconds,kind,ref,x=0,y=0,extra={}){events.push({id:eid,frame:Math.round(seconds*60),kind,ref,x,y,count:1,spacing:0,spacingY:0,interval:0,value:0,...extra});}
for(let t=6,n=0;t<172;t+=7,n++){
 const y=28+(n%5)*20;
 event(`formation-${n}`,t,'enemy','pin',176,y,{count:4,interval:18,spacingY:n%2?5:-5});
 if(n%3===1)event(`interceptor-${n}`,t+2,'enemy','wave',176,76+(n%2?22:-22));
 if(n%4===2)event(`gunner-${n}`,t+3,'enemy','sweep',176,38+(n%3)*30);
}
for(const t of [38,73,118,153])event(`supply-${t}`,t,'enemy','supply',176,76);
for(const [kind,times] of Object.entries({power:[3,18,31,64,99,129,160],speed:[10,47,104],bomb:[25,83,138],life:[112],score:[42,70,146,167]}))for(const t of times)event(`${kind}-${t}`,t,'item',kind,150,76);
event('deck-speed',60,'scroll','',0,0,{value:0.3125});event('reactor-speed',120,'scroll','',0,0,{value:0.375});
event('boss-stop',180,'scroll','',0,0,{value:0});event('boss',180,'boss','triple-core',176,76);
events.sort((a,b)=>a.frame-b.frame);
const text=(tid,label,x,y,binding='none',digits)=>({id:tid,text:label,x,y,palette:5,binding,...(digits?{digits}:{})});
const screen=(sid,name,background,rows)=>({id:sid,name,background,palette:5,dock:'top',items:rows});
const game={schemaVersion:1,name:id,title:'SIDE CARAVAN',mode:'campaign',seed:71,dmgPalette:27,startStage:'side-1',stageOrder:['side-1'],
 palettes:[
  {id:'ice',name:'ICE / 自機',colors:['#040817','#254a79','#54cce6','#efffff']},
  {id:'gold',name:'GOLD / 自弾',colors:['#040817','#9a5227','#efac36','#fff5b8']},
  {id:'coral',name:'CORAL / 敵',colors:['#040817','#74304c','#e66b72','#fff0ce']},
  {id:'mint',name:'MINT / 補給',colors:['#040817','#236758','#68caa0','#ecffe3']},
  {id:'violet',name:'VIOLET / コア',colors:['#040817','#70436e','#c875b6','#fff1ea']},
  {id:'navy',name:'NAVY / 施設',colors:['#040817','#1b3049','#53738b','#d4e4dc']},
 ],assets,patterns,enemies,bosses,items,
 stages:[{id:'side-1',name:'ORBITAL SIEGE',tileset:'facility',width,height,tiles,walls,scrollAxis:'horizontal',scrollSpeed:0.25,loopMap:false,duration:180,clearOnBoss:true,requireBoss:true,music:2,bossMusic:5,destructibles:{types,objects},events}],
 screens:[screen('title','SIDE CARAVAN','title-art',[text('title-start','START MISSION',3,13),text('title-controls','A SHOT  B BOMB',3,15),text('title-scores','SELECT SCORES',3,17)]),
 screen('gameover','ゲームオーバー','over-art',[text('over-score','SCORE ',3,12,'score'),text('over-back','START : TITLE',3,15)]),
 screen('clear','クリア','clear-art',[text('clear-score','SCORE ',3,12,'score'),text('clear-back','START : TITLE',3,15)]),
 screen('scores','スコアボード','',[text('rank-title','SIDE CARAVAN',4,1),text('rank-label','FLIGHT RECORDS',3,3),text('rank-values','',5,5,'highscores'),text('rank-back','A : TITLE',5,16)]),
 {...screen('hud','戦況 / HUD','',[text('score','S',0,0,'score',5),text('lives','P',7,0,'lives',1),text('bombs','B',10,0,'bombs',1),text('power','W',13,0,'shotLevel',1),text('speed','V',16,0,'speedLevel',1)]),rows:1}],
 player:{asset:'ship',speed:1.5,lives:3,maxLives:9,invulnerability:150,respawnDelay:60,weapon:'shot-1',x:28,y:76,atomicVolleys:true,
  powerUps:{shotWeapons:['shot-1','shot-2','shot-3','shot-5'],speedLevels:[1.5,1.75,2,2.25],shotOnMiss:'down',speedOnMiss:'keep'},
  bomb:{enabled:true,stock:2,maxStock:9,damage:30,frames:48,flashPeriod:4,background:'bomb-art',button:'b',destroyBackground:true}},
 clearBonus:2000,timeLimit:false,bossCelebration:true,stageFade:true,music:{title:1,boss:5,clear:6,gameover:7,victory:8},
 performance:{enemies:8,playerShots:15,enemyShots:8,effects:4},effects:{explosion:'burst',duration:16},
 provenance:{author:'HOSSIE-JP / SIDE CARAVAN',license:'MIT',source:'Original pixel art, horizontal encounter choreography and destructible scenery. Authored by editor/scripts/create-side-caravan.cjs; existing original Caravan BGM.'}};

function scoreCeiling(){let score=game.clearBonus+bosses[0].score;for(const e of events){if(e.kind==='enemy'){const a=enemies.find(a=>a.id===e.ref);score+=a.score*e.count;}if(e.kind==='item'&&e.ref==='score')score+=500;}
 for(const o of objects){const t=types.find(t=>t.id===o.type);score+=t.score+(t.dropItem==='score'?500:0);}return score;}
const brief={id,title:game.title,template:'original',stageCount:1,mode:'campaign',timeLimit:false,lives:3,creative:{theme:'宇宙施設への接近、戦艦甲板、炉心区画',weapons:'通常・2連・3方向・5方向',controls:'A射撃 Bボム',destructibles:objects.length},constraints:{maxScore:scoreCeiling(),durationGameSeconds:180}};
if(require.main===module){
 const errors=lib.validate(game).filter(d=>d.severity==='error');if(errors.length)throw Error(JSON.stringify(errors,null,2));
 const destination=path.join(root,'projects',id);
 if(fs.existsSync(destination))throw Error('SIDE CARAVAN already exists; never regenerate over editor changes. Use a separate project ID for a new design.');
 lib.createProject(root,id,game.title,game);
 fs.writeFileSync(path.join(destination,'brief.json'),JSON.stringify(brief,null,2)+'\n');
 const reopened=lib.readGame(root,id);if(lib.validate(reopened).some(d=>d.severity==='error'))throw Error('Saved project did not reopen cleanly');
 console.log(JSON.stringify({project:id,objects:objects.length,events:events.length,scoreCeiling:scoreCeiling(),spriteTiles:lib.spriteLayout(game).tiles},null,2));
}
module.exports={game,brief,scoreCeiling};
