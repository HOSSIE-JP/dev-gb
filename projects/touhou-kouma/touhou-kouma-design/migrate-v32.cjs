const path=require('node:path');const fs=require('node:fs');
const l=require(path.resolve('editor/build/library.cjs'));
const root=process.cwd(),g=l.readGame(root,'touhou-kouma'),revision=l.revision(g);
if(g.legacyScoreDivisor===10)throw Error('already migrated');
const scale=x=>Math.round(x*12)/16;
function motion(m){m.vx=scale(m.vx);if(m.oscillationAxis!=='y')m.amplitude=Math.round(m.amplitude*.75);for(const p of m.points){p.x=scale(p.x);p.vx=scale(p.vx);}}
g.player.x=scale(g.player.x);g.graze.score=1;g.clearBonus=Math.floor(g.clearBonus/10);g.legacyScoreDivisor=10;
for(const e of g.enemies){e.score=Math.floor(e.score/10);motion(e.motion);}
for(const b of g.bosses){b.score=Math.floor(b.score/10);motion(b.motion);if(b.battle)b.battle.returnX=scale(b.battle.returnX??80);for(const p of b.phases){motion(p.motion);if(p.until==='hp'){p.timeLimitSeconds=60;p.score=b.score;}}}
for(const p of g.patterns)if(p.launch?.kind==='fixed')p.launch.x=Math.round(p.launch.x*.75);
for(const s of g.stages){
  for(const e of s.events){if(['enemy','boss','item'].includes(e.kind)){e.x=scale(e.x);e.spacing=scale(e.spacing);}}
  for(const key of ['tiles','walls']){const src=[...s[key]];for(let y=0;y<s.height;y++)for(let x=0;x<15;x++)s[key][y*s.width+x]=src[y*s.width+x+2];}
  for(const t of s.destructibles?.types??[])t.score=Math.floor(t.score/10);
  for(const o of s.destructibles?.objects??[])o.x-=2;
  if(s.presentation)for(const key of ['baseBonus','lifeBonus','noMissBonus'])s.presentation[key]=Math.floor(s.presentation[key]/10);
}
for(const item of g.items??[])for(const e of item.effects)if(e.kind==='score')e.amount=Math.floor(e.amount/10);
const hud=g.screens.find(s=>s.id==='hud');hud.dock='right';hud.columns=5;hud.rows=18;hud.items=[];
[['TIME','bossTime',2],['HP','boss',3],['MODE','bossPhase',3],['SCORE','score',5],['LIFE','lives',1],['BOMB','bombs',1]].forEach(([text,binding,digits],i)=>{
hud.items.push({id:`${binding}-label`,text,x:Math.floor((5-text.length)/2),y:i*3,palette:0,binding:'none'},
{id:binding,text:'',x:Math.floor((5-digits)/2),y:i*3+1,palette:0,binding,digits});});
const errors=l.validate(g).filter(d=>d.severity==='error');if(errors.length)throw Error(JSON.stringify(errors));
l.saveGame(root,'touhou-kouma',g,revision);
console.log(JSON.stringify({before:revision,after:l.revision(l.readGame(root,'touhou-kouma'))}));
