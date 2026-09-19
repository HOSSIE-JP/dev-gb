// Isolated gameplay build. Only logo/movie playback is disabled; gameplay,
// seed, images and score identity remain those of the production project.
// node editor/tests/gbc-runtime-build.mjs OUT [gbc|dual] [ENGINE]
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const lib=createRequire(import.meta.url)('../build/library.cjs');
const root=process.cwd(),out=path.resolve(process.argv[2]);
const hardware=process.argv[3]??'gbc',engine=path.resolve(process.argv[4]??'engine/caravan');
fs.mkdirSync(out,{recursive:true});
fs.mkdirSync(path.join(out,'projects'),{recursive:true});
fs.cpSync(engine,path.join(out,'engine/caravan'),{recursive:true});
for(const tool of ['gbdk','misaki'])if(!fs.existsSync(path.join(out,'.tools',tool)))fs.cpSync(path.join(root,'.tools',tool),path.join(out,'.tools',tool),{recursive:true});
const game=lib.readGame(root,'touhou-kouma');
game.hardware=hardware;game.startupMovie.enabled=false;game.startup.enabled=false;
if(fs.existsSync(path.join(out,'projects/touhou-kouma')))lib.saveGame(out,game.name,game,lib.revision(lib.readGame(out,game.name)));
else lib.createProject(out,game.name,game.title,game);
fs.writeFileSync(path.join(out,'build.log'),'');
if(process.argv.includes('--capture')){
 const generated=path.join(out,'generated'),report=lib.generate(out,game,generated,()=>{}),objects=path.join(out,'objects');fs.mkdirSync(objects,{recursive:true});
 const inputs=['runtime.c','mainloop.c','flow.c','movie.c','special.c','bomb-road.c','terrain.c','items.c','bg-bullets.c','render.c','sprites.c','music.c','sound.c','graze.c','boss-phase.c','save.c'].map(f=>path.join(out,'engine/caravan',f)).concat(report.sourceFiles.map(f=>path.join(generated,f)));
 for(const input of inputs){const target=path.join(objects,path.basename(input,'.c')+'.o'),r=spawnSync(path.join(root,'.tools/gbdk/bin/lcc.exe'),['-DCE_CGB_ONLY='+Number(hardware==='gbc'),'-DCE_GRAZE_ENABLED=1','-DCE_OBJ_16=1','-DCE_HUD_RIGHT=1','-Wf--opt-code-speed','-Wf--max-allocs-per-node50000','-debug','-I'+path.join(out,'engine/caravan'),'-c','-o',target,input],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stdout+r.stderr);}
 console.log('Captured '+inputs.length+' objects: '+objects);
}else{
 const result=lib.compile(out,game.name,'Debug',s=>fs.appendFileSync(path.join(out,'build.log'),s));console.log(JSON.stringify(result));
}
