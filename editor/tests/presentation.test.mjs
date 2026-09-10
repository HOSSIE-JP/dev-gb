import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
const {readGame,validate,validateShape}=createRequire(import.meta.url)('../build/library.cjs');
const root=path.resolve(import.meta.dirname,'../..');
const game=()=>readGame(root,'star-caravan');
function config(g){return {enabled:false,dialogueBackground:'',clearBackground:'',rightPalette:0,dialogue:[],clearEnabled:false,baseBonus:1000,lifeBonus:200,noMissBonus:1000};}
test('legacy projects need no presentation or parallax fields',()=>{const g=game();assert.equal(validate(g).filter(x=>x.severity==='error').length,0);});
test('optional scene settings reject missing art and overflowing dialogue before compilation',()=>{const g=game(),p=config(g);g.stages[0].presentation=p;p.enabled=true;p.dialogue=[{id:'p1',speaker:'れいむ',line1:'あ'.repeat(19),line2:''}];const errors=validate(g).filter(x=>x.severity==='error');assert(errors.some(x=>x.message.includes('背景画像')));assert(errors.some(x=>x.message.includes('18文字')));});
test('presentation schema rejects malformed page collections',()=>{const g=game();g.stages[0].presentation={...config(g),dialogue:'oops'};assert(validateShape(g).some(x=>x.severity==='error'));});
test('parallax tile bounds and speed divisor are validated',()=>{const g=game();g.stages[0].parallax={enabled:true,firstTile:127,width:4,height:2,divisor:0};const errors=validate(g).filter(x=>x.severity==='error');assert(errors.length>=2);assert(errors.some(x=>x.message.includes('視差')));});

test('ending validates duration and image references before ROM compilation',()=>{const g=game();g.ending={seconds:0,slides:[{id:'end',background:'missing'}]};const errors=validate(g).filter(x=>x.severity==='error');assert(errors.length>=2);g.ending={seconds:6,slides:[]};assert.equal(validate(g).filter(x=>x.severity==='error').length,0);});
test('ending rejects malformed slide arrays',()=>{const g=game();g.ending={seconds:6,slides:'invalid'};assert(validateShape(g).some(x=>x.severity==='error'));});

// Preserve the current shared-engine capacity when importing older projects.
test('authored pool budgets accept current maxima and reject overflowing limits',()=>{
 const g=game();g.performance={enemies:12,playerShots:6,enemyShots:32,effects:4};
 assert.equal(validate(g).filter(x=>x.severity==='error').length,0);
 g.performance.enemyShots=33;
 assert(validate(g).some(x=>x.severity==='error' && x.target==='performance'));
});
