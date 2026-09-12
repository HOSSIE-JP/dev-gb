import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const lib=createRequire(import.meta.url)('../build/library.cjs');
const game=()=>lib.readGame(process.cwd(),'touhou-kouma');
const errors=g=>lib.validate(g).filter(d=>d.severity==='error');

test('both characters have dedicated screen art and all seven before/after conversations',()=>{
 const g=game();assert.deepEqual(errors(g),[]);assert.equal(g.stages.length,7);
 for(const [i,p]of [g.player,...g.player.characters].entries()){
  assert.equal(p.selectionBackground,i?'select-marisa':'select-reimu');
  assert.equal(p.gameoverBackground,i?'gameover-marisa':'gameover-reimu');
 }
 for(const s of g.stages){
  const reimu=lib.resolvePresentation(g,s),marisa=lib.resolvePresentation(g,s,1);
  assert.equal(reimu,s.presentation);assert.equal(marisa.clearBonus,reimu.clearBonus);
  assert.equal(marisa.dialoguePortrait,'dialogue-marisa-before');assert.equal(marisa.victoryDialogue.portrait,'dialogue-marisa-after');
  for(const pages of [marisa.dialogue,marisa.victoryDialogue.pages]){
   assert.equal(pages.length,4);assert.ok(pages.some(p=>p.speaker==='まりさ'));
   assert.ok(pages.every(p=>p.speaker!=='れいむ'));
  }
  assert.notDeepEqual(marisa.dialogue,reimu.dialogue);assert.notDeepEqual(marisa.victoryDialogue.pages,reimu.victoryDialogue.pages);
 }
});

test('dialogue variants follow stable character IDs after reordering and fall back for legacy projects',()=>{
 const g=game(),s=g.stages[0],marisa=g.player.characters[0];
 g.player.characters.unshift({...marisa,id:'test-pilot',name:'TEST'});
 assert.equal(lib.resolvePresentation(g,s,1),s.presentation);
 assert.equal(lib.resolvePresentation(g,s,2).dialogue,s.presentation.characterDialogues[0].before.pages);
 delete s.presentation.characterDialogues;assert.equal(lib.resolvePresentation(g,s,2),s.presentation);
});

test('portrait composition replaces the complete left panel and preserves the boss and text region',()=>{
 const g=game(),s=g.stages[0],background=g.assets.find(a=>a.id===s.presentation.dialogueBackground),portrait=g.assets.find(a=>a.id==='dialogue-marisa-before');
 const before=[...background.frames[0].pixels],pixels=lib.dialoguePixels(g,background.id,portrait.id);
 for(let y=0;y<144;y++)for(let x=0;x<160;x++)assert.equal(pixels[y*160+x],x<80&&y<96?portrait.frames[0].pixels[y*160+x]:before[y*160+x]);
 assert.deepEqual(background.frames[0].pixels,before);assert.equal(lib.dialoguePixels(g,background.id),undefined);
});

test('invalid character dialogue targets, duplicate routes and broken art references are rejected',()=>{
 for(const change of [
  g=>g.stages[0].presentation.characterDialogues[0].character='missing',
  g=>g.stages[0].presentation.characterDialogues.push({...g.stages[0].presentation.characterDialogues[0],id:'duplicate'}),
  g=>g.player.gameoverBackground='missing',
  g=>g.player.characters[0].selectionBackground='reimu',
  g=>g.stages[0].presentation.characterDialogues[0].after.portrait='reimu',
  g=>g.stages[0].presentation.characterDialogues[0].before.pages[0].line1='あ'.repeat(19),
  g=>g.stages[0].presentation.characterDialogues[0].after.pages=[],
 ]){const g=game();change(g);assert.ok(errors(g).length,'malformed route must not compile');}
});
