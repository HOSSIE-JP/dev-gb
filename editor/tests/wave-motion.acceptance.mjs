// Execute the production wave updater against an independent closed-form oracle.
// Covers every 16-bit age, wrap, positive/negative velocity and extreme amplitude.
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {boot,memory,symbols,GameBoyMode} from './emulator.mjs';
const root=path.resolve(import.meta.dirname,'../..'),out=path.resolve(process.argv[2]??'.cache/wave-motion'),lib=createRequire(import.meta.url)('../build/library.cjs');
fs.mkdirSync(out,{recursive:true});const fixture=fs.mkdtempSync(path.join(out,'fixture-'));
for(const d of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,d),path.join(fixture,d),{recursive:true});
const file=path.join(fixture,'engine/caravan/runtime.c');let source=fs.readFileSync(file,'utf8');
assert.ok(source.includes('static void move_actor('));source=source.replace('static void move_actor(','void move_actor(');
fs.writeFileSync(file,source);
fs.writeFileSync(path.join(fixture,'engine/caravan/mainloop.c'),`#pragma bank 255
#include "caravan.h"
void move_actor(CE_Entity *, const CE_Motion *, uint16_t);
volatile uint8_t ce_wave_status;
volatile uint16_t ce_wave_age;
static CE_Entity entity;
static CE_Motion motion;
static const int16_t velocities[4][2]={{0,24},{31,-23},{-127,95},{127,-127}};
static const uint8_t amplitudes[4]={0,12,128,255};
void ce_mainloop(void) BANKED {
    uint8_t k; uint16_t age; int16_t expected_x, expected_y;
    ce_wave_status=1; motion.kind=2;motion.period=128;
    for(k=0;k!=4;++k){
        motion.vx=velocities[k][0];motion.vy=velocities[k][1];motion.amplitude=amplitudes[k];
        entity.base_x=32760;entity.base_y=-32760;age=0;
        do {
            move_actor(&entity,&motion,age);
            expected_x=(int16_t)((int32_t)entity.base_x+(int32_t)motion.vx*age+(int16_t)ce_sin[(age%128u)/8u]*motion.amplitude);
            expected_y=(int16_t)((int32_t)entity.base_y+(int32_t)motion.vy*age);
            ce_wave_age=age;
            if(entity.x!=expected_x||entity.y!=expected_y){ce_wave_status=0xe0+k;for(;;)vsync();}
            ++age;
        }while(age);
        move_actor(&entity,&motion,0);
        if(entity.x!=entity.base_x||entity.y!=entity.base_y){ce_wave_status=0xf0+k;for(;;)vsync();}
    }
    ce_wave_status=0xa5;for(;;)vsync();
}
`);
fs.mkdirSync(path.join(fixture,'projects'));lib.createProject(fixture,'wave-test','WAVE TEST',lib.readGame(root,'star-caravan'));
const report=lib.compile(fixture,'wave-test','Debug',()=>{}),rom=fs.readFileSync(report.romPath),s=symbols(report.romPath.replace(/\.gb$/,'.map')),results=[];
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb]){const gb=boot(rom,mode);try{let status=0,age=0;for(let n=0;n<30000;n++){gb.clocks_cycles(65536);const r=memory(gb).ram;status=r[s._ce_wave_status-0xc000];age=r.readUInt16LE(s._ce_wave_age-0xc000);if(status>1)break;}assert.equal(status,0xa5,'closed-form parity at age '+age);results.push({mode:mode===GameBoyMode.Dmg?'DMG':'CGB',ages:65536,configurations:4,wraps:4,status});}finally{gb.free();}}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({fixture:true,rom:report.romPath,results},null,2));console.log(results);
