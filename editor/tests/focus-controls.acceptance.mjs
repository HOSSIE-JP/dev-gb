// Real production ROM, joypad input only. No diagnostic ROM or runtime writes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,settledTrace,entityOffset,GameBoyMode,PadKey} from './emulator.mjs';
const [file,out]=process.argv.slice(2),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map'));
const lib=createRequire(import.meta.url)('../build/library.cjs'),g=lib.readGame(process.cwd(),'touhou-kouma'),results=[];
fs.mkdirSync(out,{recursive:true});
assert.equal(rom[s._ce_graze_score],10);assert.equal(rom[s._ce_focus_requires_a],1);
for(const character of [0,1]){
    const gb=boot(rom,GameBoyMode.Cgb),held=new Set();
    const byte=name=>memory(gb).ram[s[name]-0xc000];
    const trace=()=>settledTrace(gb,s._ce_trace);
    const until=(predicate,max=6500)=>{for(let i=0;i<max;i++){const t=trace();if(t&&predicate(t))return t;frames(gb,1);}throw Error('timeout '+JSON.stringify(trace()));};
    const tap=k=>{gb.key_press(k);frames(gb,4);gb.key_lift(k);frames(gb,12);};
    const set=names=>{for(const name of held)if(!names.includes(name)){gb.key_lift(PadKey[name]);held.delete(name);}for(const name of names)if(!held.has(name)){gb.key_press(PadKey[name]);held.add(name);}};
    const advance=(names,count=1)=>{set(names);const tick=trace().tick;return until(t=>t.scene===1&&((t.tick-tick)&65535)>=count,1000);};
    const shots=()=>{const r=memory(gb).ram;let n=0;for(let i=0;i<byte('_ce_used');i++)if(r[entityOffset(r,s,i)]===3)n++;return n;};
    const firing=()=>character?byte('_ce_beam_pattern')!==255:shots()>0;
    try{
        until(t=>t.scene===0&&!byte('_ce_fade_level'));tap(PadKey.A);
        until(t=>t.scene===10&&!byte('_ce_fade_level'));if(character)tap(PadKey.Right);tap(PadKey.A);
        until(t=>t.scene===1);advance([],2);
        advance(['B'],30);assert.equal(shots(),0);assert.equal(byte('_ce_beam_pattern'),255);assert.equal(byte('_ce_bombs'),2);
        // Public trace can be read after the next joypad was already sampled.
        // Warm the direction, then measure an uninterrupted held interval.
        advance(['B','Right'],2);
        const before=trace();const moved=advance(['B','Right'],4),player=character?g.player.characters[character-1]:g.player;
        assert.equal(moved.x-before.x,(moved.tick-before.tick)*player.focusSpeed*16,'B movement uses exact focus speed');
        advance(['B','A'],18);assert(firing());assert.equal(byte('_ce_bombs'),2,'B then A focuses without bombing');
        advance([],2);advance(['A'],18);assert(firing());
        advance(['A','B'],18);assert(firing());assert.equal(byte('_ce_bombs'),2,'A then B focuses without bombing');
        advance(['B'],3);if(character)assert.equal(byte('_ce_beam_pattern'),255);
        advance([],2);advance(['A','B'],3);assert.equal(byte('_ce_bombs'),1);
        advance(['A','B'],65);assert.equal(byte('_ce_bombs'),1,'held chord does not repeat');
        advance(['A'],2);advance(['A','B'],2);advance(['B'],2);advance(['A','B'],2);assert.equal(byte('_ce_bombs'),1,'partial release does not rearm');
        advance([],2);advance(['A','B'],3);assert.equal(byte('_ce_bombs'),0);
        results.push({character,focusWithoutFire:true,exactFocusSpeed:true,bothStaggerOrders:true,laserStops:!!character,freshChordBomb:true,heldAndPartialReleaseSafe:true});
    }finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({romHash:crypto.createHash('sha256').update(rom).digest('hex'),production:true,grazeScore:10,results},null,2));
console.log('Both production characters: focus/fire/chord input checks passed');
