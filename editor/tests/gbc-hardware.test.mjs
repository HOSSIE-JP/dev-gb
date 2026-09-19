import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const lib=createRequire(import.meta.url)('../build/library.cjs'),root=process.cwd();
test('hardware defaults to dual and survives atomic project save/reload',()=>{
    const dir=fs.mkdtempSync(path.join(root,'.cache/gbc-hardware-'));
    fs.mkdirSync(path.join(dir,'projects'));
    const game=lib.readGame(root,'star-caravan');delete game.hardware;
    lib.createProject(dir,'fixture','Fixture',game);
    let opened=lib.readGame(dir,'fixture');
    const manifest=()=>JSON.parse(fs.readFileSync(path.join(dir,'projects/fixture/project.json')));
    assert.equal(opened.hardware,undefined);assert.equal(manifest().cgbCompatibility,'dual');
    for(const hardware of ['gbc','dual']){
        const revision=lib.revision(opened);opened.hardware=hardware;lib.saveGame(dir,'fixture',opened,revision);
        opened=lib.readGame(dir,'fixture');assert.equal(opened.hardware,hardware);
        assert.equal(manifest().cgbCompatibility,hardware==='gbc'?'cgb-only':'dual');
        assert.equal(manifest().lccFlags.filter(f=>f==='-Wm-yc'||f==='-Wm-yC').length,1);
        assert(manifest().lccFlags.includes(hardware==='gbc'?'-Wm-yC':'-Wm-yc'));
    }
    opened.hardware='invalid';assert(lib.validate(opened).some(d=>d.severity==='error'));
    assert.throws(()=>lib.saveGame(dir,'fixture',opened));
    assert.equal(lib.readGame(dir,'fixture').hardware,'dual','failed validation leaves project intact');
});
