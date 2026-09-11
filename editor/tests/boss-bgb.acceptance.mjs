// Corroborate phase transitions in native BGB with read-only watchpoints and input.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {symbols} from './emulator.mjs';
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),syms=symbols(file.replace(/\.gb$/,'.map'));
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'debugmsg.txt'),'');
const wp=syms._ce_scene.toString(16)+'//w/SCENE %VALUE%,'+syms._ce_transition_state.toString(16)+'//w/TRANSITION %VALUE%';
const result=spawnSync(process.execPath,['editor/tests/bgb-trace.mjs',file,out,'1300','direct','--watchpoint',wp],{stdio:'inherit',windowsHide:true});assert.equal(result.status,0);
const log=fs.readFileSync(path.join(out,'debugmsg.txt'),'utf8'),values=key=>[...log.matchAll(new RegExp('^'+key+' ([0-9A-F]+)','gm'))].map(m=>parseInt(m[1],16));
const scenes=values('SCENE'),transitions=values('TRANSITION');assert.equal(scenes.filter(s=>s===7).length,3);assert.equal(scenes.filter(s=>s===8).length,3);
assert.equal(transitions.filter(s=>s===1).length,2);assert.equal(transitions.filter(s=>s===2).length,2);assert.ok(scenes.includes(9));assert.ok(!scenes.includes(6),'held fire leaves victory dialogue on screen');
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({emulator:'BGB 1.6.6',scenes,transitions,victoryDialogueHeld:true},null,2));
