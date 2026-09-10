const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),api=require(root+'/editor/build/library.cjs');
const g=api.readGame(root,'touhou-kouma'),before=api.revision(g);
assert.equal(before,'fcbe596bd4968ca6b682548b0c3b789bdb1482a18850711ea1e166f876ce15c0','Review intervening user edits first');
g.assets.find(a=>a.id==='screen-title').frames[0].pixels=JSON.parse(fs.readFileSync(__dirname+'/imagegen-v05/title-pixels.json'));
const data=JSON.parse(fs.readFileSync(__dirname+'/imagegen-v05/pixels.json'));
g.palettes[6]=({id:'pal-cirno',name:'氷の湖・チルノ',colors:['#0c1828','#284e70','#82c8e0','#f3fcff']});
for(const [id,v] of Object.entries(data)){
 const sprite=id==='cirno',tiles=id==='map-lake';
 g.assets.push({id,name:id,kind:sprite?'sprite':tiles?'tileset':'screen',width:v.width,height:v.height,palette:sprite||tiles?6:0,origin:sprite?{x:12,y:12}:{x:0,y:0},hitbox:sprite?{x:7,y:5,w:10,h:14}:{x:0,y:0,w:1,h:1},emitters:sprite?[{x:12,y:22}]:[],frames:[{id:id+'-0',image:'images/'+id+'.png',duration:12,pixels:v.pixels}]});
}
const patterns=[['cirno-icicle','つららの扇','mei-petal',{count:3,spread:90,interval:112,delay:24,speed:1.25}],['cirno-crystal','氷の十字','mei-guard',{count:4,interval:160,delay:48,speed:1}],['cirno-aim','雪玉ねらい','mei-needle',{count:1,interval:96,delay:72,speed:1.5}]];
for(const [id,name,base,props] of patterns)g.patterns.push({...structuredClone(g.patterns.find(p=>p.id===base)),id,name,...props});
const boss=structuredClone(g.bosses[0]);Object.assign(boss,{id:'cirno',name:'チルノ',asset:'cirno',hp:90,score:1000});
boss.phases.forEach((p,i)=>{p.id='cirno-p'+i;p.attacks=i?[{id:'cirno-layer'+i,pattern:patterns[i%3][0]}]:[];if(i){p.pattern=patterns[i-1][0];p.name=patterns[i-1][1];p.threshold=[0,60,30,0][i];}});g.bosses.push(boss);
const s=structuredClone(g.stages[0]);Object.assign(s,{id:'stage-lake',name:'霧の湖・氷の妖精',tileset:'map-lake',music:30,bossMusic:31,height:162});
const rows=JSON.parse(fs.readFileSync(__dirname+'/imagegen-v05/lake-map.json'));s.tiles=Array.from({length:s.height*20},(_,n)=>rows[n%(32*20)]);s.walls=Array(s.tiles.length).fill(0);
s.events=[80,240,400,560,740,920,1100,1280].map((frame,i)=>({id:'lake-wave-'+i,frame,kind:'enemy',ref:i%2?'fairy-wave':'fairy-down',x:i%2?42:34+(i%3)*28,y:-12,count:2,spacing:56,interval:44,value:0}));
s.events.push({id:'lake-stop',frame:1536,kind:'scroll',ref:'',x:80,y:-12,count:1,spacing:0,interval:0,value:0},{id:'lake-boss',frame:1600,kind:'boss',ref:'cirno',x:80,y:-12,count:1,spacing:0,interval:0,value:0});
const talk=[['チルノ','あたいのこおり、すずしいでしょ!','このみずうみは、とおさないよ!'],['れいむ','きりだけでも、じゃまなのに。','こおらせたら、もっとこまるわ。'],['チルノ','だったら、あたいとしょうぶ!','まけたら、かえってよね!'],['れいむ','はいはい。すぐにすませるわ。','かぜをひくまえに、どきなさい。']];
s.presentation={...s.presentation,dialogueBackground:'dialogue-cirno',clearBackground:'result-cirno',rightPalette:6,dialogue:talk.map(([speaker,line1,line2],i)=>({id:'cirno-talk-'+i,speaker,line1,line2}))};
g.stages.unshift(s);g.stageOrder.unshift(s.id);g.startStage=s.id;
g.screens.find(s=>s.id==='title').items.push({id:'scores-hint',text:'SELECT: SCORE',x:3,y:17,palette:0,binding:'none',digits:1});
g.ending={seconds:6,slides:['ending-cirno','ending-meiling-patchouli','ending-sakuya-remilia','ending-flandre','screen-clear'].map((background,i)=>({id:'ending-'+i,background}))};
const errors=api.validate(g).filter(x=>x.severity==='error');assert.equal(errors.length,0,JSON.stringify(errors));api.saveGame(root,'touhou-kouma',g,before);assert.equal(api.revision(api.readGame(root,'touhou-kouma')),api.revision(g));
fs.writeFileSync(root+'/verification/v05-edit.json',JSON.stringify({before,after:api.revision(g),stages:g.stageOrder,slides:g.ending.slides},null,2));console.log(api.revision(g));
