// Unmodified ROM, controller input only. Verify parallax in the actual VRAM.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';
import {capture} from './presentation-qa.mjs';

const lib=createRequire(import.meta.url)('../build/library.cjs');
const g=lib.readGame(process.cwd(),'touhou-kouma');
const file=path.resolve(process.argv[2]), out=path.resolve(process.argv[3]);
const rom=fs.readFileSync(file), s=symbols(file.replace(/\.gb$/,'.map'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'), results=[];
fs.mkdirSync(out,{recursive:true});
for(const [mode,label] of [[GameBoyMode.Cgb,'CGB'],[GameBoyMode.Dmg,'DMG']]) {
  for(let stage=0;stage<7;stage++) {
    const gb=boot(rom,mode);
    const byte=n=>memory(gb).ram[s[n]-0xc000];
    function until(predicate,max=6000) {
      for(let n=0;n<max;n++) {
        const t=settledTrace(gb,s._ce_trace);
        if(t&&predicate(t))return t;
        frames(gb,1);
      }
      throw Error(`timeout: ${label} stage ${stage+1}`);
    }
    function tap(key) {gb.key_press(key);frames(gb,4);gb.key_lift(key);frames(gb,12);}
    try {
      until(t=>t.scene===0);tap(PadKey.Down);
      for(let i=0;i<stage;i++)tap(PadKey.Right);
      tap(PadKey.A);until(t=>t.scene===10);tap(PadKey.A);
      const first=until(t=>t.scene===1&&t.tick>=20&&!byte('_ce_fade_level'));
      const textures=new Set(),cameras=new Set();
      while(true) {
        const t=until(t=>t.scene===1),m=memory(gb);
        const v=m.state.subarray(m.state.readUInt32LE(m.core+0xa4));
        // Center map cells supply the physical atlas's first tile index;
        // HUD font allocation is deliberately not hard-coded here.
        const mapCell=0x1800+(m.io[0x42]>>3)*32+4;
        const tile=Math.min(...Array.from({length:2*7},(_,i)=>v[0x1800+(((m.io[0x42]>>3)+Math.floor(i/7))&31)*32+4+i%7]));
        const attr=mode===GameBoyMode.Cgb?v[mapCell+0x2000]:0;
        const address=(attr&8?0x2000:0)+0x1000+(tile<128?tile:tile-256)*16;
        textures.add(hash(v.subarray(address,address+8*16)));
        cameras.add(m.ram.readUInt16LE(s._ce_state-0xc000+4));
        assert(m.io[0x40]&32,'right HUD Window enabled');
        assert.equal(m.io[0x4b],127,'right HUD stays at x=120');
        assert.equal(m.io[0x4a],0);
        if(t.tick>=first.tick+32)break;
        frames(gb,1);
      }
      assert(textures.size>=4,`${label} stage ${stage+1}: center must animate (${textures.size} textures, ${cameras.size} cameras)`);
      assert(cameras.size>16,'world must scroll independently');
      capture(gb,path.join(out,`${label}-stage-${stage+1}.png`));
      results.push({mode:label,stage:stage+1,textureStates:textures.size,cameraStates:cameras.size,hudFixed:true});
      console.log(results.at(-1));
    } finally {gb.free();}
  }
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:hash(rom),results},null,2));
