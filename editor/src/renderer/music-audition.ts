import {
    MUSIC_HZ,
    MUSIC_LEVELS,
    MUSIC_VOICES,
    type MusicTrack,
} from "../shared/music-score";

/** Lightweight GB-like audition; not an APU emulator. Builds nothing and writes nothing. */
export class MusicAudition {
    private context: AudioContext | null = null;
    private sources = new Set<AudioBufferSourceNode>();
    private timer = 0;
    stop() {
        window.clearInterval(this.timer);
        this.timer = 0;
        for (const s of this.sources) {
            s.onended = null;
            try {
                s.stop();
            } catch {}
        }
        this.sources.clear();
        const c = this.context;
        this.context = null;
        void c?.close();
    }
    async play(
        song: MusicTrack,
        waves: number[][],
        firstBar: number,
        lastBar: number,
        mask: boolean[],
        repeat: boolean,
        onRow: (row: number) => void,
        onEnd: () => void,
    ) {
        this.stop();
        const ctx = new AudioContext({ sampleRate: 22050 });
        this.context = ctx;
        await ctx.resume();
        if (this.context !== ctx) return;
        const held = [0, 0, 0],
            phase = [0, 0, 0];
        for (let b = 0; b < firstBar; b++)
            for (let r = 0; r < 16; r++)
                MUSIC_VOICES.forEach((v, i) => {
                    const n = song.bars[b][v]?.[r] ?? 0;
                    if (n !== 255) held[i] = n;
                });
        const initial = [...held],
            barSeconds =
                (16 * (song.speed + (song.speedHalf ? 0.5 : 0))) / MUSIC_HZ,
            rangeSeconds = (lastBar - firstBar + 1) * barSeconds;
        const start = ctx.currentTime + 0.04;
        let next = start,
            bar = firstBar,
            finished = false;
        const schedule = () => {
            if (this.context !== ctx) return;
            while (!finished && next < ctx.currentTime + 0.18) {
                const b = song.bars[bar],
                    samples = Math.round(barSeconds * ctx.sampleRate),
                    buffer = ctx.createBuffer(1, samples, ctx.sampleRate),
                    data = buffer.getChannelData(0);
                let at = 0;
                for (let row = 0; row < 16; row++) {
                    // Odd rows get the extra VBlank, matching the engine's half-frame cadence.
                    const frameEnd =
                        (row + 1) * song.speed +
                        (song.speedHalf ? Math.floor((row + 1) / 2) : 0);
                    const until = Math.min(
                        samples,
                        Math.round((frameEnd / MUSIC_HZ) * ctx.sampleRate),
                    );
                    const amplitudes = MUSIC_VOICES.map((v, i) => {
                        const n = b[v]?.[row] ?? 0;
                        if (n !== 255) {
                            held[i] = n;
                            phase[i] = 0;
                        }
                        return !mask[i] || !held[i]
                            ? 0
                            : i === 2
                              ? ({ 32: 1, 64: 0.5, 96: 0.25 }[
                                    b.bassLevel?.[row] ?? b.level
                                ] ?? 0)
                              : ((b[MUSIC_LEVELS[i]]?.[row] ?? b.envelope) >>
                                    4) /
                                15;
                    });
                    const frequencies = held.map((n, i) => {
                        if (!n) return 0;
                        const pitch = Math.round(
                            2048 - 131072 / (440 * 2 ** ((n + 35 - 69) / 12)),
                        );
                        return i === 2
                            ? 65536 / (2048 - (1024 + (pitch >> 1)))
                            : 131072 / (2048 - pitch);
                    });
                    for (; at < until; at++) {
                        let value = 0;
                        for (let i = 0; i < 3; i++)
                            if (amplitudes[i]) {
                                const sample =
                                    i === 2
                                        ? (waves[b.wave ?? 0]?.[
                                              Math.floor(phase[i] * 32)
                                          ] ?? 8) /
                                              7.5 -
                                          1
                                        : phase[i] <
                                            [0.125, 0.25, 0.5, 0.75][
                                                (i === 0
                                                    ? b.duty
                                                    : (b.counterDuty ?? 64)) >>
                                                    6
                                            ]
                                          ? 1
                                          : -1;
                                value += sample * amplitudes[i];
                                phase[i] =
                                    (phase[i] +
                                        frequencies[i] / ctx.sampleRate) %
                                    1;
                            }
                        data[at] = value * 0.2;
                    }
                }
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(ctx.destination);
                this.sources.add(source);
                source.onended = () => this.sources.delete(source);
                source.start(next);
                next += barSeconds;
                if (++bar > lastBar) {
                    if (repeat) {
                        bar = firstBar;
                        held.splice(0, 3, ...initial);
                        phase.fill(0);
                    } else finished = true;
                }
            }
            const elapsed = Math.max(0, ctx.currentTime - start),
                position = repeat
                    ? elapsed % rangeSeconds
                    : Math.min(elapsed, rangeSeconds);
            const within = Math.floor(position / barSeconds),
                rowTime = position % barSeconds;
            let r = 0;
            while (
                r < 15 &&
                ((r + 1) * song.speed +
                    (song.speedHalf ? Math.floor((r + 1) / 2) : 0)) /
                    MUSIC_HZ <=
                    rowTime
            )
                r++;
            onRow((firstBar + within) * 16 + r);
            if (finished && ctx.currentTime >= next) {
                this.stop();
                onRow(-1);
                onEnd();
            }
        };
        schedule();
        this.timer = window.setInterval(schedule, 40);
    }
}
