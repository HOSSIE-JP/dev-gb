// Real Electron renderer/preload/IPC; only native file/confirmation dialogs are stubbed.
const fs = require("node:fs"),
    path = require("node:path"),
    vm = require("node:vm"),
    assert = require("node:assert/strict"),
    electron = require("electron");
const root = path.resolve(__dirname, "../.."),
    lib = require("../build/library.cjs"),
    out = path.join(root, ".cache/music-editor/ui");
fs.mkdirSync(out, { recursive: true });
const temp = fs.mkdtempSync(path.join(out, "project-")),
    records = [],
    report = path.join(out, "results.json");
const record = (value) => {
    records.push(value);
    fs.writeFileSync(report, JSON.stringify({ temp, records }, null, 2));
};
fs.cpSync(path.join(root, "editor/build"), path.join(temp, "editor/build"), {
    recursive: true,
});
fs.mkdirSync(path.join(temp, "config"));
fs.copyFileSync(
    path.join(root, "config/tools.lock.json"),
    path.join(temp, "config/tools.lock.json"),
);
fs.mkdirSync(path.join(temp, "projects"));
const waves = path.join(temp, "engine/caravan/assets-src");
fs.mkdirSync(waves, { recursive: true });
fs.copyFileSync(
    path.join(root, "engine/caravan/assets-src/music-waves.json"),
    path.join(waves, "music-waves.json"),
);
lib.createProject(temp, "first", "FIRST", lib.readGame(root, "star-caravan"));
lib.createProject(temp, "second", "SECOND", lib.readGame(root, "star-caravan"));
const source = path.join(root, "projects/touhou-kouma/assets-src/midi_gb"),
    dest = path.join(temp, "projects/first/assets-src/midi_gb");
fs.mkdirSync(dest, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(source, "import.json")));
for (const file of ["import.json", ...manifest.tracks.map((t) => t.file)])
    fs.copyFileSync(path.join(source, file), path.join(dest, file));
const first = lib.readGame(temp, "first");
first.musicScore = "assets-src/midi_gb/import.json";
lib.saveGame(temp, "first", first);
fs.mkdirSync(path.join(temp, ".tools/misaki"), { recursive: true });
fs.copyFileSync(
    path.join(root, ".tools/misaki/misaki_gothic.bdf"),
    path.join(temp, ".tools/misaki/misaki_gothic.bdf"),
);
let win,
    selection = {
        canceled: false,
        filePaths: [path.join(source, "th06_02_gb3.mid")],
    },
    response = 1;
class TestWindow extends electron.BrowserWindow {
    constructor(options) {
        super({ ...options, show: false, webPreferences: { ...options.webPreferences, backgroundThrottling: false } });
        win = this;
    }
}
const native = {
    ...electron,
    BrowserWindow: TestWindow,
    dialog: {
        ...electron.dialog,
        showOpenDialog: async () => selection,
        showMessageBox: async () => ({ response }),
        showMessageBoxSync: () => response,
    },
};
electron.app.disableHardwareAcceleration();
const timeout = setTimeout(() => {
    record({ error: "timeout" });
    electron.app.exit(1);
}, 120000);
const js = async (s) => {
    try {
        return await win.webContents.executeJavaScript(s);
    } catch (e) {
        throw Error(e.message + "; script=" + s);
    }
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(s) {
    for (let n = 0; n < 160; n++) {
        if (await js(s)) return;
        await delay(50);
    }
    throw Error("Timed out: " + s);
}
async function click(selector) {
    await until(
        `(()=>{const e=document.querySelector(${JSON.stringify(selector)});return e&&!e.disabled&&!e.closest('fieldset[disabled]');})()`,
    );
    await js(
        `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({behavior:'instant',block:'center'});void 0;`,
    );
    await delay(100);
    const pos = await js(
        `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing: '+${JSON.stringify(selector)});const r=e.getBoundingClientRect(),x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);if(!e.contains(document.elementFromPoint(x,y)))throw Error('covered click target: '+${JSON.stringify(selector)});return {x,y};})()`,
    );
    win.webContents.sendInputEvent({
        type: "mouseDown",
        ...pos,
        button: "left",
        clickCount: 1,
    });
    win.webContents.sendInputEvent({
        type: "mouseUp",
        ...pos,
        button: "left",
        clickCount: 1,
    });
    await delay(60);
}
async function button(text) {
    const selector = await js(
        `(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.textContent.trim()===${JSON.stringify(text)} || (${JSON.stringify(text)}==="保存" && b.textContent.trim().startsWith("保存"))));if(!b)throw Error('button '+${JSON.stringify(text)});b.dataset.musicUiTarget='true';return '[data-music-ui-target="true"]';})()`,
    );
    await click(selector);
    await js(
        `document.querySelector('[data-music-ui-target="true"]')?.removeAttribute('data-music-ui-target')`,
    );
}
async function key(k, modifiers = []) {
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: k, modifiers });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: k, modifiers });
    await delay(30);
}
async function dragNote(selector, dx, dy) {
    const pos = await js(
        `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({behavior:'instant',block:'center',inline:'nearest'});const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`,
    );
    await delay(80);
    win.webContents.sendInputEvent({
        type: "mouseDown",
        ...pos,
        button: "left",
        clickCount: 1,
    });
    await delay(60);
    for (let i = 1; i <= 4; i++) {
        win.webContents.sendInputEvent({
            type: "mouseMove",
            x: pos.x + Math.round((dx * i) / 4),
            y: pos.y + Math.round((dy * i) / 4),
            modifiers: ["leftButtonDown"],
        });
        await delay(40);
    }
    win.webContents.sendInputEvent({
        type: "mouseUp",
        x: pos.x + dx,
        y: pos.y + dy,
        button: "left",
        clickCount: 1,
    });
    await delay(100);
}
async function fill(selector, value) {
    await js(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    await key("A", ["control"]);
    win.webContents.insertText(String(value));
    await delay(80);
}
async function select(selector, value) {
    const count = await js(
        `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();return [...e.options].filter(o=>!o.disabled).findIndex(o=>o.value===${JSON.stringify(String(value))});})()`,
    );
    assert(count >= 0);
    await key("Home");
    for (let n = 0; n < count; n++) await key("Down");
    await key("Return");
    await until(
        `document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(String(value))}`,
    );
}
vm.runInNewContext(
    fs.readFileSync(path.join(root, "editor/build/main.cjs"), "utf8"),
    {
        require: (name) => (name === "electron" ? native : require(name)),
        module: { exports: {} },
        __dirname: path.join(temp, "editor/build"),
        process: {
            ...process,
            argv: [process.execPath, "first"],
            env: { ...process.env },
        },
        Buffer,
        console,
        structuredClone,
        URL,
        Response,
        setTimeout,
        clearTimeout,
    },
);
electron.app
    .whenReady()
    .then(async () => {
        await until(`!!document.querySelector('.project-picker select')`);
        await button("♫音楽");
        await until(
            `document.querySelectorAll('select[aria-label="編集する曲"] option').length===14`,
        );
        record(
            "existing fourteen imported songs open without saving or migration",
        );
        assert(!lib.readGame(temp, "first").musicTracks);
        // Real WebAudio buffers are observed, not replaced. Their sources still reach the AudioContext.
        await js(
            `window.musicAudioCapture=[];window.musicContexts=[];const create=AudioContext.prototype.createBufferSource;AudioContext.prototype.createBufferSource=function(){window.musicContexts.push(this);const node=create.call(this),start=node.start;node.start=function(...a){const d=this.buffer.getChannelData(0);window.musicAudioCapture.push({length:d.length,peak:d.reduce((p,n)=>Math.max(p,Math.abs(n)),0)});return start.apply(this,a);};return node;};void 0;`,
        );
        await js(`window.musicEvents=[];for(const name of ['blur','focus'])window.addEventListener(name,()=>window.musicEvents.push({name,time:performance.now()}));document.addEventListener('click',e=>window.musicEvents.push({name:'click',text:e.target.textContent.slice(0,80),trusted:e.isTrusted,time:performance.now()}));for(const name of ['resume','close']){const old=AudioContext.prototype[name];AudioContext.prototype[name]=function(...args){window.musicEvents.push({name,time:performance.now(),state:this.state});return old.apply(this,args);};}void 0;`);
        await select('select[aria-label="編集する曲"]', 32);
        await click('button[aria-label="1小節 1番 主旋律 · CH2"]');
        await select('select[aria-label="音符"]', 37);
        await fill('input[aria-label="音符の長さ"]', 4);
        await button("音符を適用");
        await until(
            `document.querySelector('button[aria-label="1小節 1番 主旋律 · CH2"]').textContent.includes('C5')`,
        );
        await key("Z", ["control"]);
        await until(`!document.querySelector('.status-dot.unsaved')`);
        await key("Y", ["control"]);
        await until(`!!document.querySelector('.status-dot.unsaved')`);
        record("native note edit and project undo/redo work");
        const piano0 =
            '.piano-note:not(.ghost)[data-start="0"][data-pitch="37"]';
        await until(`!!document.querySelector('${piano0}[data-length="4"]')`);
        await dragNote(piano0, 24, -32);
        await until(
            `!!document.querySelector('.piano-note:not(.ghost)[data-start="2"][data-pitch="39"][data-length="4"]')`,
        );
        await until(
            `document.querySelector('button[aria-label="1小節 3番 主旋律 · CH2"]').textContent.includes('D5')`,
        );
        await key("Z", ["control"]);
        await until(`!!document.querySelector('${piano0}[data-length="4"]')`);
        await dragNote(piano0 + " .piano-resize", 24, 0);
        await until(`!!document.querySelector('${piano0}[data-length="6"]')`);
        await key("Delete");
        await until(`!document.querySelector('${piano0}')`);
        await key("Z", ["control"]);
        await until(`!!document.querySelector('${piano0}[data-length="6"]')`);
        // Add a pitched note through an empty grid location, then undo it.
        const point = await js(
            `(()=>{const v=document.querySelector('.piano-viewport'),g=document.querySelector('.piano-grid');document.querySelector('.music-piano').scrollIntoView({behavior:'instant',block:'center'});v.scrollTop=24+(60-45)*16-100;const r=g.getBoundingClientRect();return {x:Math.round(r.x+12*12+6),y:Math.round(r.y+(60-45)*16+8)};})()`,
        );
        win.webContents.sendInputEvent({
            type: "mouseDown",
            ...point,
            button: "left",
            clickCount: 1,
        });
        win.webContents.sendInputEvent({
            type: "mouseUp",
            ...point,
            button: "left",
            clickCount: 1,
        });
        await until(
            `!!document.querySelector('.piano-note:not(.ghost)[data-start="12"][data-pitch="45"][data-length="1"]')`,
        );
        await dragNote(
            '.piano-note:not(.ghost)[data-start="12"][data-pitch="45"] .piano-resize',
            24,
            0,
        );
        await until(
            `!!document.querySelector('.piano-note:not(.ghost)[data-start="12"][data-pitch="45"][data-length="3"]')`,
        );
        await key("Up");
        await until(
            `!!document.querySelector('.piano-note:not(.ghost)[data-start="12"][data-pitch="46"][data-length="3"]')`,
        );
        await key("Z", ["control"]);
        await key("Z", ["control"]);
        await key("Z", ["control"]);
        await until(
            `!document.querySelector('.piano-note:not(.ghost)[data-start="12"][data-pitch="45"]')`,
        );
        await select('select[aria-label="ピアノロール声部"]', 1);
        await until(`!!document.querySelector('.piano-grid.voice-1')`);
        await select('select[aria-label="ピアノロール声部"]', 0);
        record(
            "piano roll native add, drag move, resize, delete, undo and voice switching synchronize the tracker",
        );
        await fill('input[aria-label="編集BPM"]', 140);
        await button("テンポを適用");
        await until(
            `document.querySelector('.music-meta').textContent.includes('137.')`,
        );
        await button("小節をコピー");
        await click('button[aria-label="2小節目"]');
        await button("小節を貼り付け");
        await select('select[aria-label="主旋律 · CH2 音色"]', 64);
        await select('select[aria-label="ベースの波形"]', 1);
        await click('input[aria-label="試聴範囲を繰り返す"]');
        await button("この小節を試聴");
        await until(
            `document.querySelector('.music-audition').textContent.includes('試聴中')&&window.musicAudioCapture.length>0`,
        );
        assert(
            (await js(`window.musicAudioCapture`)).some(
                (a) => a.peak > 0 && a.peak < 1,
            ),
        );
        assert.equal(await js(`window.musicContexts.at(-1).state`), "running");
        await button("試聴を停止");
        await until(`window.musicContexts.at(-1).state==='closed'`);
        record(
            "build-free WebAudio audition emits unclipped PCM and stops its context",
        );
        await select(
            'select[aria-label="曲の割り当て先"]',
            `road:${first.stageOrder[0]}`,
        );
        await button("この曲を割り当てる");
        await button("保存");
        await until(`!document.querySelector('.status-dot.unsaved')`);
        const saved = lib.readGame(temp, "first");
        assert.equal(saved.musicTracks[0].id, 32);
        assert.equal(saved.musicTracks[0].bars[0].lead[0], 37);
        assert.equal(lib.pianoNotes(saved.musicTracks[0], 0)[0].length, 6);
        assert.equal(saved.musicTracks[0].bars[1].duty, 64);
        assert.equal(saved.musicTracks[0].bars[1].wave, 1);
        assert.equal(saved.stages[0].music, 32);
        assert.deepEqual(
            fs.readFileSync(path.join(dest, "th06_02_gb3.mid")),
            fs.readFileSync(path.join(source, "th06_02_gb3.mid")),
        );
        record(
            "normal project save retains edits, assignment and untouched source MIDI",
        );
        await button("MIDIを取り込む");
        await until(`!!document.querySelector('.midi-import')`);
        await button("変換結果を確認");
        await until(`!!document.querySelector('.music-import-result')`);
        await button("この設定で取り込む");
        await until(
            `!document.querySelector('.midi-import')&&document.querySelectorAll('select[aria-label="編集する曲"] option').length===15`,
        );
        record(
            "real dialog boundary, MIDI analysis, conversion review and import IPC succeed",
        );
        await button("保存");
        await until(`!document.querySelector('.status-dot.unsaved')`);
        const imported = lib
            .readGame(temp, "first")
            .musicTracks.find((t) => t.id === 16);
        assert(imported);
        assert.deepEqual(
            fs.readFileSync(
                path.join(temp, "projects/first", imported.source.file),
            ),
            fs.readFileSync(path.join(source, "th06_02_gb3.mid")),
        );
        // Switching projects disposes the audition and reopens edited music through the real backend.
        await button("この小節を試聴");
        await until(`window.musicContexts.at(-1).state==='running'`);
        await select(".project-picker select", "second");
        await until(
            `document.querySelector('.library .panel-title').textContent.includes('second')`,
        );
        await until(`window.musicContexts.every(c=>c.state==='closed')`);
        await select(".project-picker select", "first");
        await until(
            `document.querySelector('.library .panel-title').textContent.includes('first')`,
        );
        await button("♫音楽");
        await until(
            `document.querySelectorAll('select[aria-label="編集する曲"] option').length===15`,
        );
        await select('select[aria-label="編集する曲"]', 32);
        assert(
            (
                await js(
                    `document.querySelector('button[aria-label="1小節 1番 主旋律 · CH2"]').textContent`,
                )
            ).includes("C5"),
        );
        record(
            "project switching stops audio and reopening preserves the edited song",
        );
        selection = { canceled: true, filePaths: [] };
        await button("MIDIを取り込む");
        assert.equal(
            await js(`!!document.querySelector('.midi-import')`),
            false,
        );
        record("canceled file selection preserves the draft");
        await until(
            `![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='MIDIを取り込む').disabled`,
        );
        win.setSize(1150, 760);
        await delay(200);
        await js(`document.querySelector('.music-editor').scrollTop=0`);
        await delay(80);
        fs.writeFileSync(
            path.join(out, "music-editor.png"),
            (await win.webContents.capturePage()).toPNG(),
        );
        const sizes = await js(
            `({window:document.documentElement.clientWidth,page:document.documentElement.scrollWidth,music:document.querySelector('.music-editor').clientWidth,scroll:document.querySelector('.music-editor').scrollWidth})`,
        );
        assert(sizes.page <= sizes.window + 1);
        assert(sizes.scroll <= sizes.music + 1);
        record({ responsive: sizes });
        await js(
            `document.querySelector('.music-edit-area').scrollIntoView({behavior:'instant',block:'start'});void 0;`,
        );
        await delay(100);
        fs.writeFileSync(
            path.join(out, "music-pattern.png"),
            (await win.webContents.capturePage()).toPNG(),
        );
        await js(
            `document.querySelector('.music-piano').scrollIntoView({behavior:'instant',block:'start'});void 0;`,
        );
        await delay(100);
        fs.writeFileSync(
            path.join(out, "music-piano.png"),
            (await win.webContents.capturePage()).toPNG(),
        );
        record("PASS");
        clearTimeout(timeout);
        electron.app.exit(0);
    })
    .catch(async (error) => {
        record({ error: error.stack });
        try { record({ audio: await js(`({events:window.musicEvents,contexts:window.musicContexts?.map(c=>c.state),message:document.querySelector('.music-message')?.textContent,visibility:document.visibilityState,focus:document.hasFocus()})`) }); } catch {}
        try {
            fs.writeFileSync(
                path.join(out, "failure.png"),
                (await win.webContents.capturePage()).toPNG(),
            );
        } catch {}
        clearTimeout(timeout);
        electron.app.exit(1);
    });
