import crypto from "node:crypto";
import {
    emptyMusicBar,
    MUSIC_LEVELS,
    MUSIC_VOICES,
    musicErrors,
    setMusicBpm,
    type MidiInfo,
    type MidiOptions,
    type MusicTrack,
} from "../shared/music-score";

type Note = {
    pitch: number;
    velocity: number;
    start: number;
    end: number;
    order: number;
};
type Lane = { key: string; name: string; notes: Note[] };
const check = (ok: unknown, message: string) => {
    if (!ok) throw Error(`MIDI: ${message}`);
};

/** Standard SMF 0/1 reader. Musical choices are explicit import options, not heuristics. */
export function readMidi(bytes: Buffer, name = "MIDI") {
    check(bytes.length <= 4 * 1024 * 1024, "4MiBまで対応します");
    let p = 0,
        limit = bytes.length,
        eventCount = 0;
    const lanes: Lane[] = [],
        tempos: { tick: number; value: number }[] = [],
        warnings = new Set<string>();
    const take = (n: number) => {
        check(n >= 0 && p + n <= limit, "データが途中で切れています");
        const d = bytes.subarray(p, p + n);
        p += n;
        return d;
    };
    const vlq = () => {
        let n = 0,
            b = 0,
            count = 0;
        do {
            b = take(1)[0];
            n = n * 128 + (b & 127);
            check(++count <= 4, "不正な可変長数値です");
        } while (b & 128);
        return n;
    };
    check(take(4).toString() === "MThd", "SMFファイルを選択してください");
    const h = take(take(4).readUInt32BE());
    check(h.length >= 6, "ヘッダーが不正です");
    const format = h.readUInt16BE(),
        tracks = h.readUInt16BE(2),
        ppq = h.readUInt16BE(4);
    check(
        format <= 1 &&
            tracks > 0 &&
            tracks <= 128 &&
            (format !== 0 || tracks === 1),
        "SMF形式0/1・128トラックまで対応します",
    );
    check(
        ppq > 0 && ppq <= 9600,
        "四分音符基準のMIDIを使用してください（SMPTE非対応）",
    );
    let lastTick = 0;
    for (let t = 0; t < tracks; t++) {
        check(take(4).toString() === "MTrk", "トラックが不正です");
        const length = take(4).readUInt32BE();
        limit = p + length;
        check(limit <= bytes.length, "トラック長が不正です");
        let tick = 0,
            status = 0,
            trackName = `Track ${t + 1}`,
            ended = false;
        const active = new Map<string, Note[]>(),
            local = new Map<number, Note[]>();
        while (p < limit) {
            tick += vlq();
            check(
                tick <= 0x7fffffff && ++eventCount <= 200000,
                "MIDIが大きすぎます",
            );
            let st = take(1)[0];
            if (st < 128) {
                p--;
                check(status !== 0, "running statusが不正です");
                st = status;
            } else if (st < 240) status = st;
            if (st === 255) {
                const type = take(1)[0],
                    data = take(vlq());
                if (type === 3)
                    trackName =
                        data.toString("utf8").slice(0, 100) || trackName;
                if (type === 81) {
                    check(
                        data.length === 3 && data.readUIntBE(0, 3) > 0,
                        "テンポが不正です",
                    );
                    tempos.push({ tick, value: data.readUIntBE(0, 3) });
                }
                if (type === 88 && (data[0] !== 4 || data[1] !== 2))
                    warnings.add(
                        "元MIDIは4/4以外の拍子を含みます。取り込み後は四分音符4拍を1小節として表示します。",
                    );
                if (type === 47) {
                    check(data.length === 0, "終端が不正です");
                    ended = true;
                    check(p === limit, "トラック終端後にデータがあります");
                    break;
                }
            } else if (st === 240 || st === 247) {
                take(vlq());
                status = 0;
                warnings.add("SysExはGB音源に変換しません。");
            } else {
                check(st >= 128 && st < 240, "未対応のイベントです");
                const kind = st >> 4,
                    ch = st & 15,
                    a = take(1)[0],
                    b = kind === 12 || kind === 13 ? 0 : take(1)[0];
                check(a < 128 && b < 128, "不正なイベント値です");
                const key = `${ch}:${a}`;
                if (kind === 9 && b) {
                    const n = {
                        pitch: a,
                        velocity: b,
                        start: tick,
                        end: -1,
                        order: eventCount,
                    };
                    const list = local.get(ch) ?? [];
                    list.push(n);
                    local.set(ch, list);
                    const held = active.get(key) ?? [];
                    held.push(n);
                    active.set(key, held);
                } else if (kind === 8 || (kind === 9 && !b)) {
                    const held = active.get(key),
                        n = held?.shift();
                    if (n) n.end = tick;
                } else if ([10, 11, 13, 14].includes(kind))
                    warnings.add(
                        "ペダル・音量CC・ピッチベンド・圧力は変換せず、ノートとvelocityを使用します。",
                    );
            }
        }
        check(ended, "トラック終端がありません");
        check(
            [...active.values()].every((ns) => !ns.length),
            "終了していない音符があります",
        );
        for (const [ch, notes] of local) {
            const valid = notes.filter((n) => n.end > n.start);
            if (valid.length)
                lanes.push({
                    key: `${t}:${ch}`,
                    name: `${trackName} / MIDI CH${ch + 1}${ch === 9 ? "（打楽器）" : ""}`,
                    notes: valid,
                });
        }
        lastTick = Math.max(lastTick, tick);
        limit = bytes.length;
    }
    check(p === bytes.length, "MIDI末尾に余分なデータがあります");
    check(lanes.length > 0, "音符がありません");
    tempos.sort((a, b) => a.tick - b.tick);
    if (new Set(tempos.map((t) => t.value)).size > 1)
        warnings.add(
            "テンポ変化を一定テンポへ置き換えます。採用テンポは取り込み画面で指定してください。",
        );
    const info: MidiInfo = {
        name,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        ppq,
        beats: lastTick / ppq,
        bpm: 60e6 / (tempos.find((t) => t.tick === 0)?.value ?? 500000),
        lanes: lanes.map((l) => ({
            key: l.key,
            name: l.name,
            count: l.notes.length,
            min: Math.min(...l.notes.map((n) => n.pitch)),
            max: Math.max(...l.notes.map((n) => n.pitch)),
        })),
        warnings: [...warnings],
    };
    return { info, lanes };
}

export function convertMidi(
    bytes: Buffer,
    name: string,
    options: MidiOptions,
): MusicTrack {
    const { info, lanes } = readMidi(bytes, name),
        o = options;
    check(
        Number.isInteger(o.id) &&
            o.id >= 16 &&
            o.id <= 37 &&
            typeof o.title === "string" &&
            o.title.trim() &&
            o.title.length <= 120,
        "曲番号・曲名が不正です",
    );
    check(
        Number.isFinite(o.startBeat) &&
            o.startBeat >= 0 &&
            o.startBeat < info.beats &&
            Number.isInteger(o.bars) &&
            o.bars >= 1 &&
            o.bars <= 64 &&
            Number.isFinite(o.bpm) &&
            o.bpm >= 15 &&
            o.bpm <= 900,
        "開始拍・小節数・テンポが不正です",
    );
    check(
        Array.isArray(o.lanes) &&
            o.lanes.length === 3 &&
            Array.isArray(o.octaves) &&
            o.octaves.length === 3 &&
            o.octaves.every((n) => Number.isInteger(n) && n >= -5 && n <= 5) &&
            ["reject", "high", "low", "latest"].includes(o.overlap),
        "声部設定が不正です",
    );
    const selected = o.lanes.filter(Boolean);
    check(
        selected.length > 0 && new Set(selected).size === selected.length,
        "各声部に異なる元トラックを指定してください",
    );
    const song: MusicTrack = {
        id: o.id,
        key: `midi_${info.sha256.slice(0, 12)}`,
        title: o.title,
        speed: 8,
        loop: true,
        bars: Array.from({ length: o.bars }, emptyMusicBar),
        source: {
            file: `assets-src/music/sources/${info.sha256}.mid`,
            name,
            sha256: info.sha256,
            converter: "smf-grid-v1",
            options: structuredClone(o),
            warnings: [...info.warnings],
        },
    };
    setMusicBpm(song, o.bpm);
    const total = o.bars * 16;
    let quantized = 0,
        clipped = 0,
        collisions = 0,
        omitted = 0,
        kept = 0;
    for (const [voice, laneKey] of o.lanes.entries()) {
        if (!laneKey) continue;
        const lane = lanes.find((l) => l.key === laneKey);
        check(lane, "元トラックが見つかりません");
        const rows: Array<(Note & { startRow: number })[]> = Array.from(
            { length: total },
            () => [],
        );
        for (const n of lane!.notes) {
            const start = (n.start / info.ppq - o.startBeat) * 4,
                end = (n.end / info.ppq - o.startBeat) * 4;
            if (end <= 0 || start >= total) {
                omitted++;
                continue;
            }
            const pitch = n.pitch + o.octaves[voice] * 12;
            check(
                pitch >= 36 && pitch <= 95,
                `${lane!.name} にC2〜B6外の音があります。オクターブか採用区間を変更してください。`,
            );
            const a = Math.max(0, Math.min(total - 1, Math.round(start))),
                b = Math.min(total, Math.max(a + 1, Math.round(end)));
            if (
                Math.abs(start - Math.round(start)) > 1e-6 ||
                Math.abs(end - Math.round(end)) > 1e-6
            )
                quantized++;
            if (start < 0 || end > total) clipped++;
            kept++;
            const note = { ...n, pitch, startRow: a };
            for (let r = a; r < b; r++) rows[r].push(note);
        }
        let previous: Note | undefined;
        for (let r = 0; r < total; r++) {
            const candidates = rows[r];
            if (candidates.length > 1) {
                collisions++;
                check(
                    o.overlap !== "reject",
                    `${lane!.name} の${Math.floor(r / 16) + 1}小節 ${(r % 16) + 1}番で音が重なります。声部または重複音の処理を指定してください。`,
                );
            }
            candidates.sort((a, b) =>
                o.overlap === "high"
                    ? b.pitch - a.pitch || a.order - b.order
                    : o.overlap === "low"
                      ? a.pitch - b.pitch || a.order - b.order
                      : b.order - a.order,
            );
            const n = candidates[0],
                bar = song.bars[r >> 4],
                step = r & 15;
            bar[MUSIC_VOICES[voice]]![step] = n
                ? n === previous
                    ? 255
                    : n.pitch - 35
                : 0;
            bar[MUSIC_LEVELS[voice]]![step] = n
                ? voice === 2
                    ? n.velocity >= 76
                        ? 64
                        : 96
                    : Math.max(
                          1,
                          Math.round(
                              (n.velocity / 127) * (voice === 0 ? 12 : 9),
                          ),
                      ) << 4
                : 0;
            previous = n;
        }
    }
    check(kept > 0, "採用区間に音符がありません");
    song.source!.warnings.push(
        `16分音符へ位置を調整: ${quantized}音。区間端で短縮: ${clipped}音。範囲外で省略: ${omitted}音。重複を処理: ${collisions}ステップ。`,
        `パルス音量は主旋律12・副旋律9を上限にvelocityから変換。ベースは25%／50%。指定しなかった${lanes.length - selected.length}声部は取り込みません。`,
    );
    const errors = musicErrors([song]);
    check(!errors.length, errors.join("\n"));
    return song;
}
