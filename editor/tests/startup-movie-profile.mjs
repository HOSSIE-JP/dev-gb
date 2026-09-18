import fs from 'node:fs';import {boot,frames,memory,symbols,GameBoyMode} from './emulator.mjs';
const stem=process.argv[2],rom=fs.readFileSync(stem+'.gb'),sy=symbols(stem+'.map'),cdb=fs.readFileSync(stem+'.cdb','utf8'),ranges=[];
for(const m of cdb.matchAll(/^L:((?:F[^$]+|G)\$([^$]+)\$0\$0):([0-9a-f]+)$/gim)){const e=cdb.match(new RegExp(`^L:X${m[1].replaceAll('$','\\$')}:([0-9a-f]+)$`,'mi'));if(e)ranges.push({name:m[2],start:parseInt(m[3],16)&65535,end:parseInt(e[1],16)&65535});}
const linked=[...fs.readFileSync(stem+'.noi','utf8').matchAll(/^DEF (_\w+) 0x([0-9a-f]+)$/gim)].map(m=>({name:m[1],start:parseInt(m[2],16)})).filter(x=>x.start>=0x100&&x.start<0x4000).sort((a,b)=>a.start-b.start);
for(let i=0;i<linked.length-1;i++)ranges.push({...linked[i],end:linked[i+1].start-1});
const results=[];
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb]){const gb=boot(rom,mode),p=sy._ce_entities-0xc000,counts=new Map();let active=false,elapsed=0,last,seed=1,total=0;
for(let n=0;n<4000;n++){frames(gb,1);const m=memory(gb),r=m.ram,t={scene:r[sy._ce_scene-0xc000],frame:r.readUInt16LE(p+11),overruns:r[p+13],blocks:r.readUInt16LE(p+4)};if(t.scene===15&&t.blocks){active=true;elapsed++;last=t;}else if(active)break;}
gb.free();const prof=boot(rom,mode);for(let n=0;n<800;n++){frames(prof,1);const r=memory(prof).ram;if(r[sy._ce_scene-0xc000]===15&&r.readUInt16LE(p+4)>0)break;}
for(let n=0;n<12000;n++){const r=prof.registers(),pc=r.pc;r.free();const name=ranges.find(x=>pc>=x.start&&pc<=x.end)?.name??pc.toString(16);seed=(Math.imul(seed,1664525)+1013904223)>>>0;const c=Number(prof.clocks_cycles(256+(seed>>>24)));total+=c;counts.set(name,(counts.get(name)??0)+c);}
prof.free();results.push({mode,elapsed,last,profile:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([name,n])=>({name,percent:n/total*100}))});}
console.log(JSON.stringify(results,null,2));
