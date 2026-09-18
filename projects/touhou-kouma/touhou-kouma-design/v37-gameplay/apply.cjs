// Repeatable v36 -> v37 gameplay migration; no source images are regenerated.
const path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../../../..'),l=require(path.join(root,'editor/build/library.cjs'));
const g=l.readGame(root,'touhou-kouma'),before=l.revision(g);
assert.equal(before,'807ab103a3903883e4ea6cc820be7ae5e3cba366b6145c84893a0b8a165b9dd3','requires unchanged v36');
for(const [id,interval,damage]of [['marisa-shot',8,1],['marisa-focus',10,2]])Object.assign(g.patterns.find(p=>p.id===id),{kind:'beam',name:id==='marisa-shot'?'魔理沙・追従光線':'魔理沙・集中光線',interval,damage,delay:0,repeats:0});
const pathMotion=(points,loop=true)=>({kind:'path',vx:0,vy:0,amplitude:0,period:256,loop,points:points.map(([frame,x,y])=>({frame,x,y}))});
const add=(id,name,opts)=>{const p={...structuredClone(g.patterns.find(p=>p.id==='fairy-aim')),id,name,...opts};g.patterns.push(p);return id;};
const actor=(id,name,asset,hp,score,pattern,motion)=>g.enemies.push({id,name,asset,hp,score,pattern,motion,attacks:[]});
add('v37-scout-aim','斥候・単発狙撃',{kind:'aimed',speed:1.75,delay:44,interval:96,lifetime:100});
add('v37-intercept','迎撃妖精・狙い三連',{kind:'aimed-fan',speed:2.25,count:3,spread:45,delay:40,interval:56,repeats:2,lifetime:84,asset:'shot-diamond'});
add('v37-dive','急降下蝙蝠・置き弾',{kind:'fan',angle:180,speed:1.25,count:3,spread:90,delay:36,interval:96,lifetime:112,asset:'shot-orb'});
add('v37-page','魔導書・交差散弾',{kind:'fan',angle:180,speed:1.5,count:3,spread:90,delay:64,interval:48,repeats:2,lifetime:96,asset:'shot-star'});
add('v37-sniper','精鋭妖精・高速狙撃',{kind:'aimed',speed:3,delay:56,interval:64,repeats:2,lifetime:72,asset:'shot-knife'});
add('v37-seeker','魔導書・遅い誘導弾',{kind:'homing',angle:180,speed:1.25,delay:56,interval:72,repeats:2,lifetime:112,asset:'shot-orb',guidance:{frames:32,period:16}});
actor('v37-scout','斥候妖精','fairy',2,8,'v37-scout-aim',pathMotion([[0,0,0],[32,0,44],[64,0,44],[128,16,240]],false));
actor('v37-intercept-left','迎撃妖精・右切り返し','fairy',3,10,'v37-intercept',pathMotion([[0,0,0],[32,0,48],[64,16,64],[96,0,80],[160,-16,240]],false));
actor('v37-intercept-right','迎撃妖精・左切り返し','fairy',3,10,'v37-intercept',pathMotion([[0,0,0],[32,0,48],[64,-16,64],[96,0,80],[160,16,240]],false));
actor('v37-dive-left','蝙蝠・斜め急降下','bat',1,7,'v37-dive',pathMotion([[0,0,0],[32,48,16],[64,72,80],[96,120,152]],false));
actor('v37-dive-right','蝙蝠・反転急降下','bat',1,7,'v37-dive',pathMotion([[0,0,0],[32,-48,16],[64,-72,80],[96,-120,152]],false));
actor('v37-page','魔導書・横滑り砲台','book',4,13,'v37-page',pathMotion([[0,0,0],[48,0,52],[80,16,52],[112,-16,52],[176,0,240]],false));
actor('v37-sniper','精鋭狙撃妖精','fairy',3,12,'v37-sniper',pathMotion([[0,0,0],[32,0,48],[64,0,48],[96,16,72],[128,0,96],[176,0,240]],false));
actor('v37-seeker','追尾魔導書','book',3,12,'v37-seeker',pathMotion([[0,0,0],[48,0,52],[80,-16,60],[112,0,68],[176,0,240]],false));
// Keep the existing unarmed eight-enemy rushes and their breathing spaces.
// Replace selected armed waves; stagger speed rather than increasing the cap.
g.stages.forEach((s,stage)=>{
 if(stage<2)return;let n=0,dive=0;
 for(const e of s.events){if(e.kind!=='enemy'||e.ref.startsWith('raid-'))continue;
  const k=n++;if(k%3===0)continue;
  if(e.ref==='bat-cross'){const left=!(dive++&1);e.ref=left?'v37-dive-left':'v37-dive-right';e.x=left?-9:129;e.y=24+stage*4;e.count=2;e.interval=40;e.spacing=0;}
  else if(e.ref.startsWith('book')){e.ref=stage>=5&&k%2?'v37-seeker':'v37-page';e.x=28;e.count=2;e.spacing=64;e.interval=36;}
  else {e.ref=stage>=4&&k%4===1?'v37-sniper':stage>=3?(k%2?'v37-intercept-left':'v37-intercept-right'):'v37-scout';e.x=24;e.count=3;e.spacing=36;e.interval=32;}
 }
});
// Three new authored support patterns for each boss (21 -> 42 total).
// Slow targeted counters can reach an above-boss player. Existing broad fans
// remain downward; aimed attacks provide movement pressure, not radial spam.
const themes={
 rumia:[['night-eye','闇の追視','aimed',1,0,1,128],['twin-shadow','双影','aimed',1,0,1.125,144],['night-edge','夜の横風','aimed',1,0,1,128]],
 cirno:[['ice-needle','氷の狙い針','aimed',1,0,1.25,112],['ice-v','氷のＶ字','aimed-fan',2,45,1,128],['ice-trident','氷の三叉','aimed-fan',3,90,1.125,144]],
 meiling:[['lotus-aim','蓮の迎撃','aimed-fan',2,45,1.25,112],['cross-fist','双掌','aimed',1,0,1.5,128],['lotus-triad','三華','aimed-fan',3,90,1.25,128]],
 patchouli:[['fire-point','火符・点火','aimed',1,0,1.75,112],['water-v','水符・二叉','aimed-fan',2,90,1.125,128],['earth-grid','土符・三列','aimed',1,0,1.25,144]],
 sakuya:[['silver-aim','銀の狙撃','aimed',1,0,2,96],['twin-clock','双時計','aimed',1,0,1.5,112],['knife-triad','三本ナイフ','aimed-fan',3,45,1.75,128]],
 remilia:[['scarlet-spear','紅の槍','aimed',1,0,2,96],['bat-wings','蝙蝠の翼','aimed-fan',3,90,1.5,128],['blood-moon','血の双月','aimed',1,0,1.75,112]],
 flandre:[['ruby-aim','紅玉の狙撃','aimed-fan',2,45,1.75,112],['prism-cross','プリズム交差','aimed',1,0,2,112],['four-star','四つ星','aimed-fan',4,135,1.5,144]],
};
const routes=[
 [[0,0,0],[64,-24,8],[128,0,16],[192,24,8],[256,0,0]],
 [[0,0,0],[64,24,16],[128,0,32],[192,-24,16],[256,0,0]],
 [[0,0,0],[32,-16,8],[64,-32,16],[96,-16,24],[128,0,16],[160,16,8],[192,32,16],[224,16,24],[256,0,0]],
 [[0,0,0],[64,32,-8],[128,0,16],[192,-32,-8],[256,0,0]],
 [[0,0,0],[32,-16,0],[64,-32,16],[128,0,32],[160,16,16],[192,32,0],[256,0,0]],
 [[0,0,0],[64,32,16],[128,0,-8],[192,-32,16],[256,0,0]],
 [[0,0,0],[32,-24,8],[64,0,16],[96,24,24],[128,0,32],[160,-24,24],[192,0,16],[224,24,8],[256,0,0]],
];
g.stageOrder.forEach((id,stage)=>{
 const s=g.stages.find(s=>s.id===id),b=g.bosses.find(b=>b.id===s.events.find(e=>e.kind==='boss').ref);
 b.phases.filter(p=>p.until==='hp').forEach((phase,mode)=>{
  const [suffix,name,kind,count,spread,speed,interval]=themes[b.id][mode],id='v37-'+b.id+'-'+suffix;
  const base=g.patterns.find(p=>p.id===phase.pattern);
  // Keep a center projectile in every aimed fan, otherwise a stationary
  // above-boss player sits permanently in its central gap.
  const opts={kind,count:kind==='aimed-fan'&&!(count&1)?count+1:count,spread,speed,interval,angle:0,delay:72+mode*16,repeats:0,lifetime:144,asset:base.asset,emitterOffsets:[{x:0,y:8}]};
  if(['twin-shadow','cross-fist','twin-clock','blood-moon','prism-cross'].includes(suffix))opts.emitterOffsets=[{x:-12,y:0},{x:12,y:0}];
  if(suffix==='earth-grid')opts.emitterOffsets=[{x:-16,y:8},{x:0,y:0},{x:16,y:8}];
  if(suffix==='night-edge')opts.launch={kind:'alternate',x:60,y:24,step:16,lanes:3};
  add(id,name,opts);phase.attacks.push({id:phase.id+'-v37',pattern:id});
  let points=routes[(stage+mode*2)%routes.length].map(p=>[...p]);
  if(stage<2)points=points.map(([f,x,y])=>[f,x/2,y/2]);
  if(mode===1)points=points.map(([f,x,y])=>[f,-x,y]);
  phase.motion=pathMotion(points);
 });
 // Support fire replaces some density, rather than blindly doubling it.
 const originals=new Set(b.phases.flatMap(p=>[p.pattern,...p.attacks.map(a=>a.pattern)]).filter(id=>id&&!id.startsWith('v37-')));
 for(const id of originals){const p=g.patterns.find(p=>p.id===id);p.interval+=stage>=3?16:8;p.lifetime=160;p.speed=stage<2?.75:stage<4?.875:stage<6?1:1.125;}
});
const errors=l.validate(g).filter(d=>d.severity==='error');assert.deepEqual(errors,[]);
l.saveGame(root,'touhou-kouma',g,before);
console.log(JSON.stringify({revision:l.revision(l.readGame(root,'touhou-kouma')),spriteTiles:l.spriteLayout(g).tiles,patterns:g.patterns.length,enemies:g.enemies.length}));
