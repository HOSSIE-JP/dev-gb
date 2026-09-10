const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),api=require(root+'/editor/build/library.cjs');
const g=api.readGame(root,'touhou-kouma'),before=api.revision(g);
assert.equal(before,'eca67344795e371709b2e677d1f544eb3454fbc1c02b496008ac34a2b3fe2252','Source changed; review edits before applying');
g.assets.find(a=>a.id==='screen-clear').frames[0].pixels=JSON.parse(fs.readFileSync(__dirname+'/imagegen-v04/ending-pixels.json'));
const screen=g.screens.find(s=>s.id==='clear');screen.items=[{id:'clear-heading',text:'ALL CLEAR!',x:5,y:15,palette:0,binding:'none',digits:1},{id:'clear-score',text:'SCORE ',x:4,y:17,palette:0,binding:'score',digits:5}];
const pat=(id,changes)=>Object.assign(g.patterns.find(p=>p.id===id),changes);
pat('reimu-shot',{name:'通常・三方向拡散札',kind:'fan',count:3,spread:45,interval:26,lifetime:32});g.performance.playerShots=6;
const pathMotion=(coords)=>({kind:'path',vx:0,vy:0,amplitude:0,period:coords.at(-1)[2],loop:true,points:coords.map(([x,y,frame])=>({x,y,frame}))});
const still=pathMotion([[0,0,0],[0,0,256]]);
const sweep=pathMotion([[0,0,0],[-24,0,64],[24,0,192],[0,0,256]]);
const diamond=pathMotion([[0,0,0],[-24,8,64],[0,24,128],[24,8,192],[0,0,256]]);
const dash=pathMotion([[0,0,0],[0,0,64],[-24,0,80],[-24,0,128],[24,0,160],[24,0,208],[0,0,224],[0,0,256]]);
const dive=pathMotion([[0,0,0],[0,0,48],[24,32,80],[0,0,128],[-24,32,160],[0,0,208],[0,0,256]]);
// Lower-density layers use staggered clocks, so space between volleys remains readable.
pat('mei-petal',{count:3,spread:90,interval:96,delay:24,lifetime:120});
pat('mei-guard',{count:4,interval:144,delay:48,lifetime:125});
pat('mei-needle',{interval:72,delay:70});
pat('pat-element',{count:4,angle:0,interval:144,delay:24,lifetime:140});
pat('pat-page',{count:2,spread:180,interval:64,rotation:45,delay:48,lifetime:125});
pat('pat-seal',{count:3,spread:90,interval:112,delay:80});
pat('sak-fan',{count:3,spread:90,interval:104,delay:30});
pat('sak-cross',{count:2,spread:180,interval:64,rotation:45,delay:24,lifetime:105});
pat('sak-line',{count:1,interval:64,delay:84});
pat('rem-ring',{count:4,interval:128,delay:24,lifetime:110});
pat('rem-fan',{count:3,spread:135,interval:112,delay:64});
pat('rem-coil',{count:2,spread:180,interval:56,rotation:22.5,delay:28,lifetime:110});
pat('flan-ring',{count:8,interval:208,delay:24,lifetime:130});
pat('flan-coil',{count:2,spread:180,interval:64,rotation:-45,delay:70,lifetime:115});
pat('flan-final',{count:3,spread:90,interval:96,delay:32});
const designs=[
 [['花扇と追尾',sweep,'mei-petal','mei-needle'],['四方陣・接近',diamond,'mei-guard','mei-petal'],['門番の連携',dash,'mei-needle','mei-guard']],
 [['四元素と封印',still,'pat-element','pat-seal'],['回転する書頁',sweep,'pat-page','pat-element'],['封印の交差',diamond,'pat-seal','pat-page']],
 [['停止と狙撃',dash,'sak-line','sak-fan'],['旋回する双刃',diamond,'sak-cross','sak-line'],['横薙ぎと追尾',sweep,'sak-fan','sak-cross']],
 [['紅い四方陣',diamond,'rem-ring','rem-fan'],['急襲と薙ぎ払い',dive,'rem-fan','rem-ring'],['双螺旋の夜',sweep,'rem-coil','rem-fan']],
 [['八方星と回転弾',still,'flan-ring','flan-coil'],['遊戯の急襲',dive,'flan-final','flan-coil'],['星の檻',dash,'flan-coil','flan-ring']]
];
g.bosses.forEach((b,i)=>b.phases.slice(1).forEach((p,j)=>{const [name,motion,pattern,layer]=designs[i][j];Object.assign(p,{name,motion,pattern,attacks:[{id:p.id+'-layer',pattern:layer}]});}));
const cloneEnemy=(base,id,name,motion,pattern,hp)=>{const e=structuredClone(g.enemies.find(x=>x.id===base));Object.assign(e,{id,name,motion,pattern,hp});g.enemies.push(e);};
cloneEnemy('fairy-down','fairy-wave','妖精・蛇行', { ...still,kind:'wave',vx:0,vy:1.125,amplitude:20,period:128},'fairy-aim',2);
cloneEnemy('bat-down','bat-cross','使い魔・横断', {...still,kind:'straight',vx:1.75,vy:0.25},'bat-drop',1);
cloneEnemy('book-down','book-stop','魔導書・停止射撃', {...pathMotion([[0,0,0],[0,52,48],[0,52,128],[0,196,256]]),loop:false},'book-fan',4);
g.stages.forEach((s,i)=>{let n=0;for(const e of s.events){if(e.kind!=='enemy')continue;const k=n++;if(k%4===1){e.ref='fairy-wave';e.x=44+(i%2)*28;e.count=2;e.spacing=48;e.interval=38;}if(k%4===2){e.ref='bat-cross';e.x=-12;e.y=36+(i%3)*12;e.count=3;e.spacing=0;e.interval=36;}if(k%4===3){e.ref='book-stop';e.x=40+(i%2)*24;e.y=-12;e.count=2;e.spacing=64;e.interval=44;}}});
const errors=api.validate(g).filter(x=>x.severity==='error');assert.equal(errors.length,0,JSON.stringify(errors));
api.saveGame(root,'touhou-kouma',g,before);const after=api.revision(api.readGame(root,'touhou-kouma'));assert.equal(after,api.revision(g));
fs.writeFileSync(root+'/verification/v04-edit.json',JSON.stringify({before,after,patterns:g.patterns.length,enemies:g.enemies.length,revisionSaveReopened:true},null,2));console.log({before,after});
