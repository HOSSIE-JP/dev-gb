// Same current engine and input, graze disabled/enabled; score/flash are intentionally different.
// node editor/tests/graze-performance.acceptance.mjs OUTPUT [--reuse]
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,trace,GameBoyMode,PadKey} from './emulator.mjs';
const root=process.cwd(),lib=createRequire(import.meta.url)('../build/library.cjs'),out=path.resolve(process.argv[2]),reuse=process.argv.includes('--reuse');fs.mkdirSync(out,{recursive:true});
const g=lib.readGame(root,'star-caravan');g.name='bg-local';g.stageFade=false;g.timeLimit=false;g.bossCelebration=false;g.player.lives=9;g.player.invulnerability=90;g.player.respawnDelay=12;
g.assets.find(a=>a.id===g.player.asset).hitbox={x:7,y:2,w:3,h:3};
const boss=g.bosses[0],p=g.patterns.find(p=>p.id==='boss-fan'),stage=g.stages[0];boss.battle={background:'bg-bullets',maxBullets:40};boss.hp=255;boss.phases=[boss.phases[0]];Object.assign(boss.phases[0],{until:'hp',threshold:0});Object.assign(p,{count:8,interval:12,speed:0.75,lifetime:400,spread:135});
stage.events=[{id:'boss',kind:'boss',ref:boss.id,frame:0,x:80,y:32,count:1,spacing:0,interval:0,value:0}];stage.clearOnBoss=false;stage.requireBoss=false;
const reports=[];
for(const variant of['baseline','current']){
 g.graze={enabled:variant==='current',radius:6,score:10,flashFrames:12};
 const fixture=path.join(out,variant),file=path.join(fixture,'projects/bg-local/build/Debug/bg-local.gb');
 if(!reuse&&!(variant==='baseline'&&process.argv.includes('--reuse-baseline'))){for(const dir of['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,dir),path.join(fixture,dir),{recursive:true});fs.mkdirSync(path.join(fixture,'projects'),{recursive:true});if(fs.existsSync(path.join(fixture,'projects/bg-local')))lib.saveGame(fixture,'bg-local',g);else lib.createProject(fixture,'bg-local',g.title,g);lib.compile(fixture,'bg-local','Debug',()=>{});}
 assert.equal(lib.revision(lib.readGame(fixture,'bg-local')),lib.revision(g),'reused fixture must match the current test data');
 const rom=fs.readFileSync(file),syms=symbols(file.replace(/\.gb$/,'.map')),report={variant,rom:file,sourceRevision:lib.revision(g),sha256:crypto.createHash('sha256').update(rom).digest('hex'),modes:[]};
 for(const mode of[GameBoyMode.Dmg,GameBoyMode.Cgb]){
  const gb=boot(rom,mode),states=[],gaps=[],bgCycles=[];let peak=0,hits=0,priorLives=9;try{
   frames(gb,240);gb.key_press(PadKey.Start);frames(gb,4);gb.key_lift(PadKey.Start);gb.step_to(syms._ce_step);let lastFrame=gb.ppu_frame();
   for(let n=0;n<1000;n++){
    // Long stationary windows plus sweeps across even/odd and tile boundaries.
    for(const k of[PadKey.Left,PadKey.Right,PadKey.Up,PadKey.Down])gb.key_lift(k);
    if(n>=300&&n<800)gb.key_press([PadKey.Left,PadKey.Up,PadKey.Right,PadKey.Down][Math.floor((n-300)/50)%4]);
    let cycles;
    if(n>0){
     cycles=gb.clock()+gb.step_to(syms._ce_bg_update&65535);const entry=memory(gb),regs=gb.registers(),sp=regs.sp;regs.free();
     let bank=1;for(let k=entry.state.readUInt32LE(entry.state.length-8);k<entry.state.length-8;){const kind=entry.state.toString('ascii',k,k+4),size=entry.state.readUInt32LE(k+4);k+=8;if(kind==='MBC ')for(let q=k;q<k+size;q+=3)if(entry.state.readUInt16LE(q)===0x2000)bank=entry.state[q+2];k+=size;}
     assert.equal(bank,syms._ce_bg_update>>>16,'stop in correct ROM bank');const ret=entry.ram.readUInt16LE(sp-0xc000);let cost=0;
     for(let attempts=0;attempts<100;attempts++){cost+=gb.clock()+gb.step_to(ret);const r=gb.registers(),returned=r.sp===sp+2;r.free();if(returned)break;assert.ok(attempts<99,'return must unwind this call, not a nested banked call');}
     cycles+=cost;bgCycles.push(cost);cycles+=gb.clock()+gb.step_to(syms._ce_step);
    }else cycles=gb.clock()+gb.step_to(syms._ce_step);
    const m=memory(gb),r=m.ram,t=trace(gb,syms._ce_trace);assert.ok(t&&t.scene===1&&!t.result);const life=r.subarray(syms._ce_bg_life-0xc000,syms._ce_bg_life-0xc000+128),bullets=[];
    for(let i=0;i<40;i++)if(life.readUInt16LE(i*2))bullets.push([i,...['x','y','vx','vy','life'].map(k=>r.readUInt16LE(syms['_ce_bg_'+k]-0xc000+i*2))]);
    const expected=new Uint16Array(360),vram=m.state.subarray(m.state.readUInt32LE(m.core+0xa4)),mapBase=m.io[0x40]&8?0x1c00:0x1800,plane=r[syms._ce_bg_plane-0xc000],top=g.screens.find(s=>s.id==='hud')?.dock==='top'?lib.hudHeight(g):0;
    for(const b of bullets){const x=(b[1]>>>8)&254,y=(b[2]>>>8)&254;expected[(y>>>3)*20+(x>>>3)]|=1<<((y&6)*2+((x&6)>>>1));}
    for(let y=top>>>3;y<(top+144-lib.hudHeight(g))>>>3;y++)for(let x=0;x<20;x++){
     const tile=vram[mapBase+y*32+x],start=tile<128?0x1000+tile*16:tile*16;
     for(let py=0;py<4;py++){const nibble=(expected[y*20+x]>>>(py*4))&15;let row=0;for(let px=0;px<4;px++)if(nibble&(1<<px))row|=192>>>(px*2);
      for(let dy=0;dy<2;dy++)assert.equal(vram[start+py*4+dy*2+plane],row,`published BG pixels ${variant} tick ${t.tick} cell ${x},${y}`);
     }
    }
    peak=Math.max(peak,bullets.length);if(t.lives<priorLives)hits++;priorLives=t.lives;
    // OAM and active bullet planes verify drawing and exact collision retirement.
    states.push({t:{...t,score:0},bullets,oam:[...m.oam].map((v,i)=>i%4===3?v&~0x17:v)});if(n>=120)gaps.push(cycles/(70224*gb.multiplier()));lastFrame=gb.ppu_frame();
   }
   assert.equal(peak,40);assert.ok(hits>0,'collision parity must include actual damage/respawn');const mean=gaps.reduce((a,b)=>a+b)/gaps.length;
   const data={mode:mode===GameBoyMode.Dmg?'DMG':'CGB',peak,hits,meanBgUpdateCycles:bgCycles.reduce((a,b)=>a+b)/bgCycles.length,meanDisplayFrames:mean,updatesPerSecond:59.7275/mean,p95:[...gaps].sort((a,b)=>a-b)[Math.floor(gaps.length*.95)],hash:crypto.createHash('sha256').update(JSON.stringify(states)).digest('hex')};
   fs.writeFileSync(path.join(out,variant+'-'+data.mode+'-states.json'),JSON.stringify(states));report.modes.push(data);console.log(variant+' '+JSON.stringify(data));
  }finally{gb.free();}
 }
 reports.push(report);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(reports,null,2));
}
for(let i=0;i<2;i++)assert.equal(reports[0].modes[i].hash,reports[1].modes[i].hash,'every update has identical trace, bullet planes and OAM');
