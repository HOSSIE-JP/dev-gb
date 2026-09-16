import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const l=createRequire(import.meta.url)('../build/library.cjs');
test('exhibition timing is optional and bounded',()=>{
 const g=l.readGame(process.cwd(),'touhou-kouma'),errors=()=>l.validate(g).filter(d=>d.severity==='error');
 delete g.attract;assert.deepEqual(errors(),[]);
 g.attract={enabled:true,titleSeconds:12,bossSeconds:15,rankingSeconds:8};assert.deepEqual(errors(),[]);
 for(const k of ['titleSeconds','bossSeconds','rankingSeconds']){const v=g.attract[k];g.attract[k]=0;assert.ok(errors().length);g.attract[k]=v;}
 g.attract.enabled='yes';assert.ok(errors().length);
});
