// Read actual BG bullet arrays in the already built barrage fixture; never patch RAM.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),syms=symbols(file.replace(/\.gb$/,'.map')),results=[];
fs.mkdirSync(out,{recursive:true});
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb]){
 const gb=boot(fs.readFileSync(file),mode),rows=new Map();let previous=new Map(),lastKey='';
 const angle=(vx,vy)=>(Math.round(Math.atan2(vx,-vy)*8/Math.PI)+16)%16;
 try{frames(gb,240);gb.key_press(PadKey.Start);frames(gb,2);gb.key_lift(PadKey.Start);gb.key_press(PadKey.B);
  for(let frame=0;frame<16000;frame++){
   gb.step_to(syms._ce_qa_marker);const r=memory(gb).ram,byte=n=>r[syms[n]-0xc000],e=syms._ce_entities-0xc000,t=r.subarray(syms._ce_trace-0xc000),key=t[4]+'-'+r[e+4];
   if(t[17]===3)break;
   if(t[17]===1&&r[e]===2&&r[e+4]>0){
    if(key!==lastKey)previous=new Map();if(!rows.has(key))rows.set(key,{stage:t[4],phase:r[e+4],turns:0,leftSpawns:0,rightSpawns:0,ceilingSpawns:0,sideY:[],lowerCenterSamples:0});const row=rows.get(key),next=new Map();
    for(let i=0;i<64;i++){
     const life=r.readUInt16LE(syms._ce_bg_life-0xc000+i*2);if(!life)continue;
     const vx=r.readInt16LE(syms._ce_bg_vx-0xc000+i*2),vy=r.readInt16LE(syms._ce_bg_vy-0xc000+i*2),x=r.readUInt16LE(syms._ce_bg_x-0xc000+i*2),y=r.readUInt16LE(syms._ce_bg_y-0xc000+i*2),old=previous.get(i);
     assert.ok(vy>=0);let born=frame,turn=-1000;
     if(old&&old.life===life+1){born=old.born;turn=old.turn;
      if(old.vx!==vx||old.vy!==vy){assert.ok(Math.abs(angle(vx,vy)-angle(old.vx,old.vy))<=1,'at most one direction step per sample');assert.ok(frame-turn>=16,'authored homing is staggered every 16 updates');assert.ok(frame-born<=48,'no steering after the 48-update window');turn=frame;row.turns++;}
     }else{if(x===256)row.leftSpawns++;if(x===158*256)row.rightSpawns++;if(y===16*256)row.ceilingSpawns++;if(x===256||x===158*256){assert.ok(y>=80*256&&y<=132*256,'side shots originate in the lower half');if(!row.sideY.includes(y/256))row.sideY.push(y/256);}}
     if(vy===0&&y>=80*256&&x>=72*256&&x<=88*256)row.lowerCenterSamples++;
     next.set(i,{life,vx,vy,born,turn});
    }
    previous=next;lastKey=key;
   }else{previous=new Map();lastKey='';}
   gb.clock();
  }
  const data=[...rows.values()];assert.equal(data.length,21);
  for(const stage of [1,2,4])assert.ok(data.filter(r=>r.stage===stage).reduce((n,r)=>n+r.leftSpawns+r.rightSpawns,0)>0,'side spawns for stage '+stage);
  for(const stage of [1,2,4])assert.ok(data.filter(r=>r.stage===stage).some(r=>r.lowerCenterSamples>0),'horizontal shots actually cross the lower player area for stage '+stage);
  for(const stage of [3,5,6])assert.ok(data.filter(r=>r.stage===stage).reduce((n,r)=>n+r.turns,0)>0,'curving bullets for stage '+stage);
  assert.ok(data.filter(r=>r.stage===3).some(r=>r.ceilingSpawns>0));results.push({mode:mode===GameBoyMode.Dmg?'DMG':'CGB',rows:data});
 }finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,results},null,2));console.log(JSON.stringify(results,null,2));
