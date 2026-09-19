// Native BGB corroboration of the diagnostic ROM, with read-only breakpoints.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {createRequire} from 'node:module';
import {symbols} from './emulator.mjs';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs'),file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const tracks=lib.importMidiMusic(path.join(root,'projects/touhou-kouma/assets-src/midi_gb/import.json')),s=symbols(file.replace(/\.gb$/,'.map')),results=[];
fs.mkdirSync(out,{recursive:true});
for(const mode of ['DMG','CGB']){
    const dir=fs.mkdtempSync(path.join(out,mode+'-')),exe=path.join(dir,'bgb64.exe');fs.copyFileSync(path.join(root,'.tools/bgb/bgb64.exe'),exe);
    const demo=[Buffer.alloc(600)];for(const [i,t]of tracks.entries()){if(i)demo.push(Buffer.alloc(8,16),Buffer.alloc(8));demo.push(Buffer.alloc(t.bars.length*16*(t.speed+(t.speedHalf?.5:0))+64));}
    fs.writeFileSync(path.join(dir,'input.dem'),Buffer.concat(demo));
    const fields=[s._ce_music_track,s._ce_music_row,s._ce_music_row+1,0xff12,0xff17,0xff1a,0xff1c,s._ce_three_case,s._ce_three_test];
    const bp=`${s._ce_three_native_sample.toString(16)}///MIDI ${fields.map(a=>`%(${a.toString(16)})%`).join(' ')}`;
    const r=spawnSync(exe,['-hf','-nobatt','-nowriteini','-ini',path.join(dir,'bgb.ini'),'-set',`SystemMode=${mode==='DMG'?0:1}`,'-set','DebugMsgFile=1','-set','DebugMsgFileTS=0','-rom',file,'-demoplay',path.join(dir,'input.dem'),'-br',bp],{cwd:dir,windowsHide:true,timeout:180000});
    if(r.error)throw r.error;assert.equal(r.status,0);
    const rows=fs.readFileSync(path.join(dir,'debugmsg.txt'),'utf8').split(/\r?\n/).filter(l=>l.startsWith('MIDI ')).map(l=>l.slice(5).trim().split(/\s+/).map(n=>parseInt(n,16)));
    assert(rows.length>1000);assert.equal(rows[0][8],0x73);assert.equal(rows[0][7],1,`${mode}: all eleven SFX contracts`);
    for(const t of tracks){
        const samples=rows.filter(r=>r[0]===t.id),seen=new Set();let loops=0,previous=-1;
        for(const a of samples){const row=a[1]+a[2]*256;seen.add(row);if(row<previous)loops++;previous=row;const b=t.bars[row>>4],i=row&15;assert.equal(a[3]&240,b.counterEnvelope[i]);assert.equal(a[4]&240,b.leadEnvelope[i]);if(b.bassLevel[i]){assert(a[5]&128);assert.equal(a[6]&96,b.bassLevel[i]);}else assert.equal(a[5]&128,0);}
        assert.equal(seen.size,t.bars.length*16,`${mode} ${t.id} full loop`);assert(loops>=1);results.push({mode,id:t.id,rows:seen.size,loops,sfxContracts:11});
    }
    console.log(`${mode}: 14 full loops and all SFX/pause contracts passed in BGB`);
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({diagnostic:true,rom:file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),results},null,2));
