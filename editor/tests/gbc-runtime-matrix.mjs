// Fixed logical input across both characters, seven stages and road/boss starts.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
const [oldRom,newRom,outArg,updates='1200']=process.argv.slice(2),out=path.resolve(outArg);
fs.mkdirSync(out,{recursive:true});
const jobs=[];
for(const route of ['road','boss'])for(let stage=0;stage<7;stage++)for(let character=0;character<2;character++)jobs.push({route,stage,character});
const results=[];
async function worker(){
    for(let job;job=jobs.shift();){
        const dir=path.join(out,`${job.route}-${job.stage}-${job.character}`),log=fs.openSync(dir+'.log','w');
        const status=await new Promise((resolve,reject)=>{
            const p=spawn(process.execPath,['editor/tests/gbc-runtime-parity.mjs',oldRom,newRom,dir,job.route,String(job.character),String(job.stage),updates],{windowsHide:true,stdio:['ignore',log,log]});
            p.on('error',reject);p.on('exit',resolve);
        });
        fs.closeSync(log);
        const report=fs.existsSync(path.join(dir,'results.json'))?JSON.parse(fs.readFileSync(path.join(dir,'results.json'))):null;
        results.push({...job,status,report});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
        console.log(JSON.stringify({...job,status,parity:report?.mismatches.length===0&&report?.pixelMismatches===0&&report?.oamMismatches===0,rates:report?.summary.map(r=>r.updatesPerSecond)}));
    }
}
await Promise.all([worker(),worker()]);
if(results.some(r=>r.status!==0))process.exitCode=1;
