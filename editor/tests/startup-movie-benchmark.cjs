// Fast timing harness using the unchanged production movie.c. Full game QA is separate.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),l=require('../build/library.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'.cache/movie-benchmark');fs.mkdirSync(out,{recursive:true});
const movie=l.readGame(root,'touhou-kouma').startupMovie,files=[],decl=[],rows=[];
function data(name,base64){const b=Buffer.from(base64,'base64');files.push(name+'.c');fs.writeFileSync(path.join(out,name+'.c'),`#pragma bank 255\n#include "caravan.h"\nBANKREF(${name})\nconst uint8_t ${name}[]={${[...b]}};\n`);decl.push(`BANKREF_EXTERN(${name})\nextern const uint8_t ${name}[];`);return `{BANK(${name}),${name},${b.length}}`;}
movie.frames.forEach((f,i)=>rows.push('{'+['dmg','cgb','attributes','palettes'].map(k=>data('frame_'+i+'_'+k,f[k])).join(',')+'}'));
const pcm=data('pcm',movie.pcm);
fs.writeFileSync(path.join(out,'data.c'),`#pragma bank 255\n#include "caravan.h"\n${decl.join('\n')}\nstatic const CE_MovieFrame frames[]={${rows}};\nvoid ce_get_movie_frame(CE_MovieFrame *dest,uint8_t i) BANKED {*dest=frames[i];}\n`);
fs.writeFileSync(path.join(out,'main.c'),`#include "caravan.h"\n#include <string.h>\n${decl.join('\n')}\nconst uint8_t ce_movie_count=${rows.length};\nconst CE_Data ce_movie_pcm=${pcm};\nCE_Entity ce_entities[CE_MAX_ENTITIES];\nuint8_t ce_scene,ce_used,ce_is_cgb;uint16_t ce_music_time;\nvoid ce_trace_write(void) NONBANKED {}\nvoid ce_copy(uint8_t *dest,const CE_Data *src,uint16_t off,uint16_t len) NONBANKED {uint8_t bank=CURRENT_BANK, next=src->bank;const uint8_t *p=src->data;SWITCH_ROM(next);memcpy(dest,p+off,len);SWITCH_ROM(bank);}\nvoid main(void){ce_is_cgb=_cpu==CGB_TYPE;if(ce_is_cgb)cpu_fast();set_interrupts(VBL_IFLAG);ce_play_movie();ce_scene=0;while(1)vsync();}\n`);
fs.writeFileSync(path.join(out,'music.c'),'#pragma bank 255\n#include "music.h"\nvoid ce_music_play(uint8_t track) BANKED {(void)track;}\n');
cp.execFileSync(path.join(root,'.tools/gbdk/bin/lcc.exe'),['-Wm-yc','-Wm-yt0x1b','-Wm-yoA','-autobank','-Wb-ext=.rel','-Wl-j','-Wl-w','-debug','-I../../engine/caravan','-o','movie.gb','../../engine/caravan/movie.c','main.c','data.c','music.c',...files],{cwd:out,stdio:'inherit',windowsHide:true,env:{...process.env,TMP:'.',TEMP:'.'}});
console.log(path.join(out,'movie.gb'));
