// Real joypad input on an unchanged ROM; checks each logo and movie boundary.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {boot, frames, memory, symbols, supportedModes, PadKey} from './emulator.mjs';
import {capture} from './presentation-qa.mjs';

const file = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const rom = fs.readFileSync(file), s = symbols(file.replace(/\.gb$/, '.map'));
const count = rom[s._ce_logo_count], movieCount = rom.readUInt16LE(s._ce_movie_count);
assert.ok(count >= 2 && movieCount >= 36, 'requires multiple logos and a movie');
fs.mkdirSync(out, {recursive: true});
const results = [], buttons = ['A', 'B', 'Select', 'Start', 'Right', 'Left', 'Up', 'Down'];
const scenarios = [
    ...buttons.map(key => ({key, page: 0, phase: 2})),
    ...Array.from({length: count}, (_, page) => [0, 1, 3].map(phase => ({key: 'A', page, phase}))).flat(),
    {key: 'Start', page: 0, phase: 2, naturalMovie: true},
    ...(rom.readUInt16LE(s._ce_attract_title_frames) ? [{key: 'A', page: 0, phase: 2, replay: true}] : []),
];
for (const [mode, label] of supportedModes(rom)) for (const scenario of scenarios) {
    const name = `${label}-${scenario.key}-${scenario.page}-${scenario.phase}${scenario.naturalMovie ? '-natural' : ''}${scenario.replay ? '-replay' : ''}`;
    const gb = boot(rom, mode), input = [], events = [];
    let held = 0;
    const read = () => {
        const {ram, io} = memory(gb), b = name => ram[s[name] - 0xc000];
        const p = rom[0x143] === 0xc0 ? 0x4000 : s._ce_entities - 0xc000;
        return {scene: b('_ce_scene'), page: b('_ce_logo_page'), phase: b('_ce_logo_phase'),
            movieFrame: ram.readUInt16LE(p + 11), blocks: ram.readUInt16LE(p + 4),
            ready: !ram[s._ce_trace - 0xc000 + 22], io};
    };
    const advance = (n = 1) => {for (let i = 0; i < n; i++) {input.push(held); frames(gb, 1);}};
    const until = (predicate, limit = movieCount * 6 + 2400) => {
        for (let n = 0; n < limit; n++) {advance(); const state = read(); if (predicate(state)) return state;}
        throw Error(`${name}: transition timed out: ${JSON.stringify(read())}`);
    };
    const press = key => {gb.key_press(PadKey[key]); held |= 1 << buttons.indexOf(key);};
    const release = key => {gb.key_lift(PadKey[key]); held &= ~(1 << buttons.indexOf(key)); advance(2);};
    const event = () => {const t = read(); events.push({frame: input.length, scene: t.scene, page: t.page, phase: t.phase, movieFrame: t.movieFrame});};
    try {
        if (scenario.replay) {
            until(t => t.scene === 15 && t.blocks > 0);
            until(t => t.scene === 0 && t.ready);
            press('Select'); until(t => t.scene === 4 && t.ready); release('Select');
        }
        until(t => t.scene === 12 && t.page === scenario.page && t.phase === scenario.phase);
        event();
        for (let page = scenario.page; page < count; page++) {
            press(scenario.key);
            const isNext = t => page + 1 < count
                ? t.scene === 12 && t.page === page + 1
                : t.scene === 15;
            until(isNext, 90);
            // Include the upload and fade so this checks a visible next screen.
            until(t => isNext(t) && (t.scene === 15 ? t.blocks > 0 : t.phase === 2), 300);
            advance(30);
            assert.ok(isNext(read()), 'held input must leave the next screen visible');
            event();
            if (page + 1 < count) release(scenario.key);
        }
        capture(gb, path.join(out, `${name}-movie.png`));
        if (scenario.naturalMovie) {
            until(t => t.scene === 0 && t.ready);
        } else {
            release(scenario.key); press(scenario.key);
            until(t => t.scene === 0 && t.ready, 120);
        }
        advance(30);
        assert.equal(read().scene, 0, 'held movie input must stay on title');
        assert.equal(read().io[7] & 4, 0, 'movie timer restored');
        assert.equal(read().io[0x40] & 0x50, 0x40, 'title tile and Window mode restored');
        event();
        release(scenario.key); press('Start');
        until(t => t.scene === 10 || t.scene === 1, 180);
        event();
        fs.writeFileSync(path.join(out, `${name}.dem`), Buffer.from(input));
        results.push({name, ...scenario, frames: input.length, events, passed: true});
        console.log(name, 'passed');
    } catch (error) {
        capture(gb, path.join(out, `${name}-failure.png`));
        fs.writeFileSync(path.join(out, `${name}-failure.json`), JSON.stringify({state: read(), events}, null, 2));
        throw error;
    } finally {gb.free();}
}
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({rom: file,
    sha256: crypto.createHash('sha256').update(rom).digest('hex'), count, movieCount, results}, null, 2));
