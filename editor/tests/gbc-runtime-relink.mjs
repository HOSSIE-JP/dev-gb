// Development-only iteration over captured GBDK objects. Production acceptance
// always rebuilds through compile(); these ROMs are explicitly intermediate.
// node ... OBJECT_DIR OUTPUT_DIR [replacement.o ...]
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
const [input,output,...replacements]=process.argv.slice(2),out=path.resolve(output),dir=path.join(out,'objects');
fs.mkdirSync(dir,{recursive:true});
fs.cpSync(path.resolve(input),dir,{recursive:true});
const objects=fs.readdirSync(dir).filter(f=>f.endsWith('.o'));
const module=file=>fs.readFileSync(file,'utf8').match(/^M (\w+)$/m)?.[1];
for(const file of replacements.filter(f=>f!=='--dual')){
 const name=module(file),target=objects.find(f=>module(path.join(dir,f))===name);
 if(!target)throw Error('Missing module '+name);
 for(const ext of ['o','asm','adb']){const source=file.replace(/\.o$/,'.'+ext);if(fs.existsSync(source))fs.copyFileSync(source,path.join(dir,target.replace(/\.o$/,'.'+ext)));}
}
const args=[...(replacements.includes('--dual')?['-Wm-yc']:['-Wm-yC','-Wl-g.STACK=0xD000']),'-Wl-yt0x1B','-Wl-ya1','-Wm-yoA','-autobank','-Wb-ext=.rel','-Wl-j','-Wl-w','-debug','-o','../touhou-kouma.gb',...objects];
const result=spawnSync(path.resolve('.tools/gbdk/bin/lcc.exe'),args,{cwd:dir,encoding:'utf8'});
if(result.status!==0)throw Error(result.stdout+result.stderr);
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
fs.writeFileSync(path.join(out,'intermediate-build.json'),JSON.stringify({args,objects:objects.map(file=>({file,module:module(path.join(dir,file)),sha256:sha(fs.readFileSync(path.join(dir,file)))})),romHash:sha(fs.readFileSync(path.join(out,'touhou-kouma.gb')))},null,2));
console.log(path.join(out,'touhou-kouma.gb'));
