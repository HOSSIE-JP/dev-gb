// Import an existing v2 ranking into both production ROMs without touching
// runtime RAM. GBC-only is a hardware change, not a new save/score version.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {boot,memory,symbols,GameBoyMode} from './emulator.mjs';
const [oldFile,newFile,out]=process.argv.slice(2),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const scores=[54321,12345,4321,999,123];
const oldRom=fs.readFileSync(oldFile),oldSymbols=symbols(oldFile.replace(/\.gb$/,'.map'));
const saveId=oldRom.subarray(oldSymbols._ce_save_id,oldSymbols._ce_save_id+4);
assert.equal(saveId.length,4);
const save=Buffer.alloc(8192,255);
for(let slot=0;slot<2;slot++){
    const r=save.subarray(slot*32,slot*32+20);
    r[0]=0xa5;r[1]=2;saveId.copy(r,2);r.writeUInt16LE(40+slot,6);
    scores.forEach((v,i)=>r.writeUInt16LE(v,i*2+8));
    let crc=65535;
    for(let i=1;i<18;i++){crc^=r[i]<<8;for(let bit=0;bit<8;bit++)crc=((crc&32768)?(crc<<1)^0x1021:crc<<1)&65535;}
    r.writeUInt16LE(crc,18);
}
const results=[];
for(const file of [oldFile,newFile]){
    const rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map'));
    assert.deepEqual(rom.subarray(s._ce_save_id,s._ce_save_id+4),saveId);
    for(const variant of ['unchanged','corrupt-newest']){
        const imported=Buffer.from(save);if(variant==='corrupt-newest')imported[40]^=1;
        const gb=boot(rom,GameBoyMode.Cgb);
        try{
            assert.equal(gb.ram_data_eager().length,imported.length);
            gb.set_ram_data(imported);gb.step_to(s._ce_trace_write);
            const ram=memory(gb).ram;
            assert.deepEqual(scores.map((_,i)=>ram.readUInt16LE(s._ce_scores-0xc000+i*2)),scores);
            assert.equal(ram.readUInt16LE(s._ce_save_generation-0xc000),variant==='unchanged'?41:40);
            assert.deepEqual(Buffer.from(gb.ram_data_eager()),imported,'boot must not rewrite or rescale a v2 save');
            results.push({romHash:hash(rom),variant,scores,saveHash:hash(imported),unchanged:true});
        }finally{gb.free();}
    }
}
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({saveId:saveId.toString('hex'),results},null,2));
console.log('Production v2 save import: both ROMs, unchanged and damaged-newest fallback passed');
