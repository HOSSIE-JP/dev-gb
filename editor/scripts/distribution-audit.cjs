// Known-data check, not a complete license clearance or firmware inventory.
const fs = require('node:fs');
const crypto = require('node:crypto');
const DMG_SHA256 = 'cf053eccb4ccafff9e67339d4e78e98dce7d1ed59be819d2a1ba2232c6fce1c7';
function findKnownBootRoms(bytes) {
    const data = Buffer.from(bytes);
    // First two SM83 instructions narrow candidates; the full hash proves a match.
    const prefix = Buffer.from([0x31, 0xfe, 0xff, 0xaf]);
    const matches = [];
    for (let offset = data.indexOf(prefix); offset !== -1; offset = data.indexOf(prefix, offset + 1)) {
        if (offset + 256 > data.length) continue;
        if (crypto.createHash('sha256').update(data.subarray(offset, offset + 256)).digest('hex') === DMG_SHA256)
            matches.push({ kind: 'original-dmg-bootstrap', offset, size: 256, sha256: DMG_SHA256 });
    }
    return matches;
}
function assertNoKnownBootRoms(bytes) {
    const matches = findKnownBootRoms(bytes);
    if (matches.length) throw new Error('HTML/WASM distribution blocked: original DMG bootstrap detected. Use a rights-cleared emulator build and review docs/licensing.md. Selecting a replacement boot ROM does not remove embedded firmware.');
}
module.exports = { findKnownBootRoms, assertNoKnownBootRoms };
if (require.main === module) {
    try {
        if (!process.argv[2]) throw new Error('Usage: node distribution-audit.cjs FILE.wasm');
        assertNoKnownBootRoms(fs.readFileSync(process.argv[2]));
        console.log('No known DMG bootstrap found. Other redistribution conditions still require review.');
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
