import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { runtimeNotices } from '../scripts/third-party-notices.mjs';
const { findKnownBootRoms, assertNoKnownBootRoms } = createRequire(import.meta.url)('../scripts/distribution-audit.cjs');
test('pinned upstream WASM cannot pass the known firmware distribution check', () => {
    const wasm = fs.readFileSync(new URL('../node_modules/boytacean/boytacean_bg.wasm', import.meta.url));
    assert.equal(findKnownBootRoms(wasm).length, 1);
    assert.throws(() => assertNoKnownBootRoms(wasm), /distribution blocked/);
    assertNoKnownBootRoms(Buffer.from([0x31, 0xfe, 0xff, 0xaf]));
});
test('runtime notices retain every direct package license and transitive scheduler attribution', () => {
    const notices = runtimeNotices();
    for (const name of ['boytacean', 'pngjs', 'react', 'react-dom', 'scheduler']) {
        const dir = new URL(`../node_modules/${name}/`, import.meta.url);
        const license = fs.readFileSync(new URL('LICENSE', dir), 'utf8');
        assert.ok(notices.includes(license), name);
    }
    assert.ok(notices.includes('Lior Halphon'));
});
