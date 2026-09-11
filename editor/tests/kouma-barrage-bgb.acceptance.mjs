import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {symbols} from './emulator.mjs';
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),syms=symbols(file.replace(/\.gb$/,'.map'));
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'debugmsg.txt'),'');
const at=a=>'%('+a.toString(16)+')%',t=syms._ce_trace,e=syms._ce_entities;
const wp=(t+22).toString(16)+'/0/w/BARRAGE %TOTALCLKS% '+[t+4,t+20,e+8,e+9,t+21,t+17,syms._ce_respawn,syms._ce_respawn+1].map(at).join(' ');
const result=spawnSync(process.execPath,['editor/tests/bgb-trace.mjs',file,out,'18000','focus','--watchpoint',wp],{stdio:'inherit',windowsHide:true});assert.equal(result.status,0);
const rows=new Map();let previous;
for(const m of fs.readFileSync(path.join(out,'debugmsg.txt'),'utf8').matchAll(/^BARRAGE ([0-9A-F ]+)/gm)){
 const [clock,stage,phase,lo,hi,count,scene,waitLo,waitHi]=m[1].trim().split(/ +/).map(v=>parseInt(v,16)),age=lo+hi*256,key=stage+'-'+phase;
 if(scene===1&&phase>0&&age>=192&&age<=632&&!waitLo&&!waitHi){
  if(!rows.has(key))rows.set(key,{stage,phase,peak:0,gaps:[]});const r=rows.get(key);r.peak=Math.max(r.peak,count);
  if(previous?.key===key&&previous.age+1===age)r.gaps.push(Math.round(((clock-previous.clock)>>>0)/35112));
 }
 previous={key,age,clock};
}
assert.equal(rows.size,21);
const data=[...rows.values()].map(({gaps,...r})=>{assert.ok(gaps.length>250);assert.ok(gaps.every(n=>n>=1&&n<=2));assert.ok(r.peak<=40);const average=gaps.reduce((a,b)=>a+b,0)/gaps.length;return {...r,samples:gaps.length,updatesPerSecond:+(59.7275/average).toFixed(3),maxGap:Math.max(...gaps)};});
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({emulator:'BGB 1.6.6',clockUnit:'double-speed NOP',rows:data},null,2));console.table(data);
