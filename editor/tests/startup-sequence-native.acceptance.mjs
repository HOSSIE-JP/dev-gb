// Replay joypad routes from a native first-logo checkpoint to align boot timing.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {symbols, supportedModes} from './emulator.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const file = path.resolve(process.argv[2]), inputDir = path.resolve(process.argv[3]), out = path.resolve(process.argv[4]);
const rom = fs.readFileSync(file), s = symbols(file.replace(/\.gb$/, '.map'));
const hash = crypto.createHash('sha256').update(rom).digest('hex');
const routes = JSON.parse(fs.readFileSync(path.join(inputDir, 'results.json')));
assert.equal(routes.sha256, hash, 'input replay belongs to this exact ROM');
const t = s._ce_trace, signature = Buffer.from([0x21, (t + 22) & 255, (t + 22) >> 8, 0x36, 0]);
const found = rom.indexOf(signature, s._ce_trace_write);
assert.ok(found >= s._ce_trace_write && found < s._ce_sound);
// CGB-only movies borrow physical WRAM bank 4, mapped at $D000 during playback.
const p = rom[0x143] === 0xc0 ? 0xd000 : s._ce_entities;
const addresses = [t + 22, s._ce_scene, s._ce_logo_page, s._ce_logo_phase, p + 11, p + 12];
const bp = `${(found + signature.length).toString(16)}///STEP ${addresses.map(n => `%(${n.toString(16)})%`).join(' ')}`;
const results = [];
fs.mkdirSync(out, {recursive: true});
for (const [, label] of supportedModes(rom)) {
    const names = [`${label}-A-0-2`, `${label}-Start-0-2-natural`, `${label}-A-0-2-replay`];
    for (const name of names.filter(name => routes.results.some(r => r.name === name))) {
        const dir = fs.mkdtempSync(path.join(out, name + '-')), exe = path.join(dir, 'bgb64.exe');
        fs.copyFileSync(path.join(root, '.tools/bgb/bgb64.exe'), exe);
        const route = routes.results.find(r => r.name === name), stateFile = path.join(dir, 'start.sna');
        const base = ['-hf', '-nobatt', '-nowriteini', '-ini', path.join(dir, 'bgb.ini'),
            '-set', `SystemMode=${label === 'DMG' ? 0 : 1}`, '-set', 'DebugMsgFile=1', '-set', 'DebugMsgFileTS=0', '-rom', file];
        const run = args => {
            const result = spawnSync(exe, [...base, ...args], {cwd: dir, windowsHide: true, timeout: 120000});
            if (result.error) throw result.error;
            assert.equal(result.status, 0);
        };
        const at = name => `($${s[name].toString(16)})`;
        // The first phase-2 publication after boot (or ranking) is logo page 0.
        const logo = `${at('_ce_logo_phase')}=2`;
        // BGB demo bytes advance only with the LCD enabled. Its startup is shorter
        // than the WASM boot ROM, so align at the first visible logo, not wall time.
        run(['-br', `${(found + signature.length).toString(16)}/${route.replay ? `${at('_ce_scene')}=0` : logo}`, '-stateonexit', stateFile]);
        if (route.replay) {
            fs.writeFileSync(path.join(dir, 'ranking.dem'), Buffer.concat([Buffer.alloc(8, 4), Buffer.alloc(1800)]));
            run(['-state', stateFile, '-demoplay', path.join(dir, 'ranking.dem'), '-br', `${(found + signature.length).toString(16)}/${logo}`, '-stateonexit', path.join(dir, 'replay.sna')]);
        }
        // Extra tail lets the final START finish the title upload in either emulator.
        fs.writeFileSync(path.join(dir, 'input.dem'), Buffer.concat([fs.readFileSync(path.join(inputDir, name + '.dem')).subarray(route.events[0].frame), Buffer.alloc(60, 8)]));
        run(['-state', route.replay ? path.join(dir, 'replay.sna') : stateFile,
            '-demoplay', path.join(dir, 'input.dem'), '-screenonexit', path.join(dir, 'screen.bmp'), '-br', bp]);
        const rows = fs.readFileSync(path.join(dir, 'debugmsg.txt'), 'utf8').split(/\r?\n/)
            .filter(line => line.startsWith('STEP '))
            .map(line => line.slice(5).trim().split(/\s+/).map(n => parseInt(n, 16))).filter(row => row[0] === 0);
        for (let page = 0; page < routes.count; page++)
            assert.ok(rows.some(r => r[1] === 12 && r[2] === page && r[3] === 2), `${name}: logo ${page} visible`);
        const movie = rows.filter(r => r[1] === 15).map(r => r[4] + r[5] * 256);
        assert.ok(movie.some(frame => frame >= 4), `${name}: movie survives held logo input`);
        if (name.endsWith('-natural')) assert.equal(Math.max(...movie), routes.movieCount - 1, 'held input allows complete movie');
        const title = rows.filter(r => r[1] === 0);
        assert.ok(title.length >= 25, 'held movie input stays on title');
        assert.ok(rows.some(r => r[1] === 10 || r[1] === 1), 'fresh START works');
        results.push({name, nativeCheckpoint: route.replay ? 'logos after ranking' : 'initial logos', movieFramesObserved: [...new Set(movie)].length, titleSamples: title.length, passed: true});
        console.log(name, 'BGB passed');
    }
}
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({rom: file, sha256: hash, results}, null, 2));
