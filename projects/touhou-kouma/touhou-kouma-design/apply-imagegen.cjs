const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),api=require(path.join(root,'editor/build/library.cjs'));
const p=JSON.parse(fs.readFileSync(path.join(__dirname,'converted-art/import.json')));
const game=api.readGame(root,'touhou-kouma'),before=api.revision(game);
for(const a of p.assets){const target=game.assets.find(t=>t.id===a.id);assert(target);target.width=a.width;target.height=a.height;target.frames[0].pixels=a.pixels;}
for(const s of p.stages){const target=game.stages.find(t=>t.id===s.id);assert.equal(s.tiles.length,target.tiles.length);target.tiles=s.tiles;}
assert.equal(api.validate(game).filter(d=>d.severity==='error').length,0);
api.saveGame(root,'touhou-kouma',game,before);
assert.equal(api.revision(api.readGame(root,'touhou-kouma')),api.revision(game));
console.log(JSON.stringify({before,after:api.revision(game),reopened:true}));
