// BGB, production ROM, identical frame-based joypad movies. Read-only trace logs.
// node editor/tests/kouma-native-performance.mjs ROM OUT
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {symbols} from './emulator.mjs';
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),map=fs.readFileSync(file.replace(/\.gb$/,'.map'),'utf8'),s=symbols(file.replace(/\.gb$/,'.map')),rom=fs.readFileSync(file),t=s._ce_trace;
fs.mkdirSync(out,{recursive:true});const clock=parseInt(map.match(/\b([\da-fA-F]{8})\s+_sys_time\b/)[1],16);
const sig=Buffer.from([0x21,(t+22)&255,(t+22)>>8,0x36,0]),published=rom.indexOf(sig,s._ce_trace_write)+sig.length;
assert(published>s._ce_trace_write&&published<s._ce_trace_write+32);
const fields=[t+17,t+2,t+3,clock,clock+1,t+4,t+7,t+12,s._ce_bg_count,s._ce_character],hex=n=>n.toString(16),results=[];
for(const mode of ['CGB','DMG'])for(const route of ['road','boss']){
 if(mode==='DMG'&&process.argv.includes('--cgb-only'))continue;
 if(mode==='DMG'&&rom[0x143]===0xc0)continue;
 const fixture=process.argv.includes('--fixture');if(fixture&&route==='road')continue;
 if(process.argv.includes('--boss-only')&&(mode!=='CGB'||route!=='boss'))continue;
 const dir=fs.mkdtempSync(path.join(out,mode+'-'+route+'-')),exe=path.join(dir,'bgb64.exe');fs.copyFileSync('.tools/bgb/bgb64.exe',exe);
 const input=Buffer.alloc(5000);input.fill(8,240,300);
 if(route==='boss')for(let i=0;i<10;i++)input.fill(2,600+i*16,604+i*16);
 input.fill(128,800,804);input.fill(32,824,828);input.fill(1,860,864);input.fill(16,920,924);input.fill(1,980,984);input.fill(1,1300);
 if(fixture){input.fill(0);input.fill(8,240,244);}
 fs.writeFileSync(path.join(dir,'input.dem'),input);
 const bp=`${hex(published)}///PERF ${fields.map(a=>`%(${hex(a)})%`).join(' ')}`;
 let extra='';if(process.argv.includes('--dma')){
  const local=fs.readFileSync(file.replace(/\.gb$/,'.noi'),'utf8').match(/^DEF Fbg_bullets\$ce_bg_publish_local\$0\$0 0x([\da-f]+)/mi);
  const publish=local?parseInt(local[1],16):s._ce_bg_publish;
  const vsync=parseInt(map.match(/\b([\da-fA-F]{8})\s+_vsync\b/)[1],16),bankStart=(publish>>>16)*0x4000,start=local||rom[0x143]!==0xc0?bankStart+(publish&0x3fff):bankStart;
  // Observe the actual completed transfer, not a stale value at wrapper entry.
  const end=rom.indexOf(Buffer.from([0xea,s._ce_bg_dma_end_ly&255,s._ce_bg_dma_end_ly>>>8]),start);
  assert(end>=start&&end<bankStart+0x4000,'DMA completion store');
  extra=`,${hex(0x4000+(end&0x3fff)+3)}/ROMBANK=${hex(publish>>>16)}//DMA %($ff44)% %TOTALCLKS% %(${hex(clock)})% %(${hex(clock+1)})% %($ff40)% %(${hex(s._ce_bg_dma_end_ly)})%`;
  const call=Buffer.from([0xcd,vsync&255,vsync>>>8]);let wait=rom.lastIndexOf(call,end);assert(wait>=Math.max(bankStart,end-512));
  extra+=`,${hex(0x4000+(wait&0x3fff))}/ROMBANK=${hex(publish>>>16)}//WAIT %($ff44)% %TOTALCLKS%`;
 }
 if(process.argv.includes('--dma')&&route==='road'&&s._ce_road_dma_end_ly){
  const bank=s._ce_render>>>16,start=bank*0x4000;
  const end=rom.indexOf(Buffer.from([0xea,s._ce_road_dma_end_ly&255,s._ce_road_dma_end_ly>>>8]),start);
  assert(end>=start&&end<start+0x4000,'road DMA completion store');
  extra+=`,${hex(0x4000+(end&0x3fff)+3)}/ROMBANK=${hex(bank)}//ROAD_DMA %(${hex(s._ce_road_dma_end_ly)})%`;
 }
 const run=spawnSync(exe,['-hf','-nobatt','-nowriteini','-ini',path.join(dir,'bgb.ini'),'-set',`SystemMode=${mode==='DMG'?0:1}`,'-set','DebugVRAMbreak=1','-set','DebugOAMDMABreak=1','-set','DebugMsgFile=1','-set','DebugMsgFileTS=0','-rom',file,'-demoplay',path.join(dir,'input.dem'),'-screenonexit',path.join(dir,'screen.bmp'),'-br',bp+extra],{cwd:dir,windowsHide:true,timeout:180000});
 if(run.error)throw run.error;assert.equal(run.status,0);
 const rows=fs.readFileSync(path.join(dir,'debugmsg.txt'),'utf8').split(/\r?\n/).filter(l=>l.startsWith('PERF ')).map(l=>l.slice(5).trim().split(/\s+/).map(n=>parseInt(n,16))).map(a=>({scene:a[0],tick:a[1]+a[2]*256,frame:a[3]+a[4]*256,stage:a[5],lives:a[6],hp:a[7],bullets:a[8],character:a[9]}));
 const expectedStage=fixture?0:6,expectedCharacter=fixture?0:1;
 assert(rows.some(r=>r.scene===1&&r.stage===expectedStage&&r.character===expectedCharacter),'menu reaches requested stage and character');
 const samples=[];for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i],gap=(b.frame-a.frame)&65535;
  if(a.scene===1&&b.scene===1&&a.stage===expectedStage&&b.stage===expectedStage&&a.character===expectedCharacter&&b.tick===a.tick+1&&a.tick>=120&&gap>0&&gap<=12)samples.push({...b,gap});
 }
 assert(samples.length>=200);
 const windows=[];for(let start=120;start<Math.max(...samples.map(r=>r.tick));start+=120){const a=samples.filter(r=>r.tick>=start&&r.tick<start+120);if(a.length>=60)windows.push({tick:start,updates:a.length,updatesPerSecond:a.length*59.7275/a.reduce((n,r)=>n+r.gap,0)});}
 const logs=fs.readFileSync(path.join(dir,'debugmsg.txt'),'utf8').split(/\r?\n/),dma=mode==='CGB'?logs.filter(l=>l.startsWith('DMA ')).filter(l=>parseInt(l.trim().split(/\s+/).at(-2),16)&128).map(l=>parseInt(l.trim().split(/\s+/).at(-1),16)):[],waits=logs.filter(l=>l.startsWith('WAIT ')).length;
 if(dma.length)assert(dma.every(ly=>ly>=144&&ly<=153),'native VRAM DMA stays within VBlank, including LY wrap');
 const roadDma=logs.filter(l=>l.startsWith('ROAD_DMA ')).map(l=>parseInt(l.trim().split(/\s+/).at(-1),16));
 assert(roadDma.every(ly=>ly>=144&&ly<=153),'road VRAM DMA stays inside VBlank');
 const gaps=samples.map(r=>r.gap).sort((a,b)=>a-b);
 const result={mode,route,inputSha256:crypto.createHash('sha256').update(input).digest('hex'),updates:samples.length,updatesPerSecond:samples.length*59.7275/samples.reduce((n,r)=>n+r.gap,0),deadlineMisses:gaps.filter(g=>g!==1).length,frameGapP95:gaps[Math.floor(gaps.length*.95)],frameGapMax:gaps.at(-1),peak:Math.max(...samples.map(r=>r.bullets)),dmaSamples:dma.length,dmaEndMax:dma.length?Math.max(...dma):undefined,roadDmaSamples:roadDma.length,roadDmaEndMax:roadDma.length?Math.max(...roadDma):undefined,extraVblankWaits:waits,windows};results.push(result);console.log(JSON.stringify(result));
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),results},null,2));
}
