import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {makePlaytestHtml}=require('../scripts/html-export.cjs');
test('HTML export preserves ROM bytes and notices without letting a filename escape into markup',()=>{
 const rom=Buffer.alloc(32768,0x42),wasm=Buffer.from('wasm');
 const html=makePlaytestHtml(rom,wasm,'</script><script>alert(1)</script>.gb','globalThis.exported={ROM_BYTES,WASM_BYTES,ROM_FILENAME};','Example copyright <owner>');
 assert.ok(html.includes('Example copyright &lt;owner&gt;'));
 assert.ok(!html.includes('<script>alert(1)</script>'));
 const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
 const context={};vm.runInNewContext(script,context);
 assert.equal(Buffer.from(context.exported.ROM_BYTES,'base64').compare(rom),0);
 assert.equal(context.exported.ROM_FILENAME,'</script><script>alert(1)</script>.gb');
 assert.throws(()=>makePlaytestHtml(Buffer.alloc(12),wasm,'x','',''),/Invalid ROM/);
});
test('first-launch emulator checksum matches the pinned upstream dependency',()=>{
 const lock=JSON.parse(fs.readFileSync(new URL('../../config/tools.lock.json',import.meta.url)));
 const wasm=fs.readFileSync(new URL('../node_modules/boytacean/boytacean_bg.wasm',import.meta.url));
 assert.equal(crypto.createHash('sha256').update(wasm).digest('hex'),lock.editorEmulator.sha256);
 assert.equal(lock.editorEmulator.version,'0.13.2');
 assert.ok(lock.editorEmulator.url.startsWith('https://'));
});
