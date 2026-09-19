'use strict';
// Local SMF utilities; no package installation, synthesis service or source mutation.
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const HZ = 4194304 / 70224;
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const round = n => +n.toFixed(6);
const noteName = n => ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][n % 12] + (Math.floor(n / 12) - 1);

function parseMidi(buffer) {
    let p = 0;
    function take(n) { assert(p + n <= buffer.length, 'truncated SMF'); const b = buffer.subarray(p, p + n); p += n; return b; }
    function vlq() { let n = 0, b, count = 0; do { b = take(1)[0]; n = n * 128 + (b & 127); assert(++count <= 4, 'invalid VLQ'); } while (b & 128); return n; }
    assert.equal(take(4).toString(), 'MThd');
    const header = take(take(4).readUInt32BE()), format = header.readUInt16BE(0), count = header.readUInt16BE(2), ppq = header.readUInt16BE(4);
    assert(format <= 1 && ppq > 0 && ppq < 32768, 'only PPQ SMF 0/1 supported');
    const tracks = [], notes = [], tempos = [], meters = [], warnings = [];
    let endTick = 0;
    for (let index = 0; index < count; index++) {
        assert.equal(take(4).toString(), 'MTrk');
        const length = take(4).readUInt32BE(), end = p + length;
        assert(end <= buffer.length);
        const t = {index, name: '', notes: [], events: [], endTick: 0}, active = new Map();
        let tick = 0, running = 0;
        while (p < end) {
            tick += vlq();
            let status = buffer[p];
            if (status & 128) { p++; if (status < 240) running = status; }
            else { assert(running, 'missing running status'); status = running; }
            if (status === 255) {
                const type = take(1)[0], data = take(vlq());
                const event = {tick, type, data: [...data]};
                if (type >= 1 && type <= 7) {
                    try { event.text = new TextDecoder('utf-8', {fatal:true}).decode(data); }
                    catch { event.text = new TextDecoder('shift_jis').decode(data); }
                    event.text = event.text.replaceAll('\0', '');
                    if (type === 3) t.name = event.text;
                }
                t.events.push(event);
                if (type === 81) { assert.equal(data.length, 3); tempos.push({tick, us: data.readUIntBE(0, 3)}); }
                if (type === 88) meters.push({tick, numerator: data[0], denominator: 2 ** data[1]});
                if (type === 47) { assert.equal(p, end, 'bytes after end of track'); break; }
            } else if (status === 240 || status === 247) { take(vlq()); running = 0; }
            else {
                assert(status >= 128 && status < 240, 'unsupported MIDI system status');
                const kind = status >> 4, channel = status & 15, a = take(1)[0], b = kind === 12 || kind === 13 ? 0 : take(1)[0];
                assert(a < 128 && b < 128, 'invalid MIDI data byte');
                t.events.push({tick, kind, channel, a, b});
                const key = `${channel}:${a}`;
                if (kind === 9 && b) {
                    const note = {id: notes.length, track: index, channel, pitch: a, velocity: b, start: tick, end: null};
                    notes.push(note); t.notes.push(note);
                    if (!active.has(key)) active.set(key, []);
                    active.get(key).push(note);
                } else if (kind === 8 || (kind === 9 && !b)) {
                    const pending = active.get(key);
                    if (pending?.length) pending.shift().end = tick;
                    else warnings.push({track: index, tick, reason: 'unmatched note off'});
                }
            }
        }
        assert.equal(p, end);
        for (const pending of active.values()) for (const n of pending) {
            n.end = tick; warnings.push({track: index, tick, noteId: n.id, reason: 'unterminated note'});
        }
        t.endTick = tick; endTick = Math.max(endTick, tick); tracks.push(t);
    }
    assert.equal(p, buffer.length, 'trailing SMF data');
    tempos.sort((a,b) => a.tick - b.tick);
    if (!tempos.length || tempos[0].tick > 0) tempos.unshift({tick: 0, us: 500000});
    function secondsAt(tick) {
        let seconds = 0, at = 0, us = 500000;
        for (const tempo of tempos) {
            if (tempo.tick > tick) break;
            seconds += (tempo.tick - at) * us / ppq / 1e6;
            at = tempo.tick; us = tempo.us;
        }
        return seconds + (tick - at) * us / ppq / 1e6;
    }
    return {format, ppq, tracks, notes, tempos, meters, endTick, seconds: secondsAt(endTick), secondsAt, warnings};
}

function vlq(n) {
    assert(Number.isInteger(n) && n >= 0 && n <= 0x0fffffff);
    const b = [n & 127]; while ((n = Math.floor(n / 128))) b.unshift((n & 127) | 128);
    return Buffer.from(b);
}
function meta(type, text) { const b = Buffer.from(text, 'utf8'); return Buffer.concat([Buffer.from([255, type]), vlq(b.length), b]); }
function midiTrack(events, endTick) {
    events.sort((a,b) => a.tick - b.tick || (a.order ?? 0) - (b.order ?? 0));
    let tick = 0; const chunks = [];
    for (const e of events) { chunks.push(vlq(e.tick - tick), Buffer.from(e.bytes)); tick = e.tick; }
    assert(endTick >= tick); chunks.push(vlq(endTick - tick), Buffer.from([255, 47, 0]));
    const data = Buffer.concat(chunks), h = Buffer.alloc(8); h.write('MTrk'); h.writeUInt32BE(data.length, 4);
    return Buffer.concat([h, data]);
}
function writeMidi(song) {
    const endTick = song.rows * 120, us = Math.round(song.stepFrames / HZ * 4e6);
    const threeVoice = Array.isArray(song.counter);
    const conductor = [{tick:0, bytes:meta(3, song.file.replace('.mid', ''))},
        {tick:0, bytes:[255,81,3,us>>16,(us>>8)&255,us&255]},
        {tick:0, bytes:[255,88,4,4,2,24,8]},
        {tick:0, bytes:meta(1, `${threeVoice ? 'Three' : 'Two'}-voice arrangement of user-supplied Touhou transcription; GM timbres are notation aids.`)},
        {tick:0, bytes:meta(6, 'LOOP_START')}];
    for (const section of song.sections) conductor.push({tick:section.outputRow*120, bytes:meta(6, section.name)});
    conductor.push({tick:endTick, bytes:meta(6, 'LOOP_END')});
    const tracks = [midiTrack(conductor, endTick)];
    const voices = threeVoice
        ? [['lead',1,80,92,'GB CH2 - Melody'],['counter',0,80,72,'GB CH1 - Countermelody and harmony'],['bass',2,38,78,'GB CH3 - Bass']]
        : [['lead',1,80,92,'GB CH2 - Melody'],['bass',2,38,68,'GB CH3 - Bass and arpeggio']];
    for (const [voice, channel, program, velocity, name] of voices) {
        const events = [{tick:0,bytes:meta(3,name)}, {tick:0,bytes:[192+channel,program]}];
        for (const note of song[voice]) {
            events.push({tick:note.start*120,order:1,bytes:[144+channel,note.pitch,note.velocity ?? velocity]});
            events.push({tick:note.end*120,order:0,bytes:[128+channel,note.pitch,0]});
        }
        tracks.push(midiTrack(events,endTick));
    }
    const header = Buffer.from([77,84,104,100,0,0,0,6,0,1,0,3,1,224]);
    header.writeUInt16BE(tracks.length, 10);
    return Buffer.concat([header,...tracks]);
}

module.exports = {parseMidi, writeMidi, sha256, round, HZ, noteName, meta, midiTrack};
