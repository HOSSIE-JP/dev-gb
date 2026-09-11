// Native BGB corroboration of timing and VBlank-only CGB DMA. Read-only ROM and RAM.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {symbols} from './emulator.mjs';
const base=(process.argv[2]??'.cache/kouma-v07/bg-final/fixture/projects/bg-test/build/Release/bg-test.gb').replace(/\.gb$/,''),out=process.argv[3]??'.cache/kouma-v07/bgb-timing-final',syms=symbols(base+'.map');
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+"/debugmsg.txt","");
const wp=syms._ce_qa_tick.toString(16)+'//w/BG %TOTALCLKS% %SCANLINE% %('+syms._ce_bg_dma_end_ly.toString(16)+')%';
const result=spawnSync(process.execPath,['editor/tests/bgb-trace.mjs',base+'.gb',out,'300','idle','--watchpoint',wp+',ff55//w/DMA %SCANLINE% %VALUE%'],{stdio:'inherit',windowsHide:true});assert.equal(result.status,0);
const text=fs.readFileSync(out+'/debugmsg.txt','utf8'),points=[...text.matchAll(/^BG ([0-9A-F]+) ([0-9A-F]+) ([0-9A-F]+)/gm)].map(m=>m.slice(1).map(x=>parseInt(x,16))).filter(x=>x[2]>=144),gaps=points.slice(1).map((x,i)=>(x[0]-points[i][0])>>>0);
// The interrupt dispatch can move the observation instruction a few NOPs.
// This small phase jitter must never become a second display-frame interval.
assert.ok(points.length>100);assert.ok(gaps.every(x=>Math.abs(x-35112)<=8),'native CGB one update per PPU frame');
assert.ok(points.every(x=>x[2]>=144&&x[2]<=153));
const dma=[...text.matchAll(/^DMA ([0-9A-F]+) ([0-9A-F]+)/gm)].map(m=>m.slice(1).map(x=>parseInt(x,16)));assert.ok(dma.length>100);assert.ok(dma.every(x=>x[0]>=144&&x[0]<=153),'GDMA only begins in VBlank');
fs.writeFileSync(out+'/timing.json',JSON.stringify({emulator:'BGB 1.6.6',bullets:64,samples:points.length,clockUnit:'double-speed NOP',clocksPerUpdate:[...new Set(gaps)],framesPerUpdate:1,dmaStartLines:[...new Set(dma.map(x=>x[0]))],dmaEndLines:[...new Set(points.map(x=>x[2]))]},null,2));

