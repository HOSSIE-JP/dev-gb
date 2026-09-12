// Real Electron renderer/preload/IPC and native input; isolated authored projects.
// Run: .tools/electron/electron.exe editor/tests/horizontal-ui.acceptance.cjs
const fs = require("node:fs"),
    path = require("node:path"),
    vm = require("node:vm"),
    assert = require("node:assert/strict"),
    electron = require("electron");
const root = path.resolve(__dirname, "../.."),
    lib = require("../build/library.cjs");
fs.mkdirSync(path.join(root, ".cache"), { recursive: true });
const temp = fs.mkdtempSync(path.join(root, ".cache/horizontal-ui-")),
    out = path.join(root, ".cache/horizontal-ui-result.json"),
    checks = [];
const record = (value) => {
    checks.push(value);
    fs.writeFileSync(out, JSON.stringify({ temp, checks }, null, 2));
};
fs.cpSync(path.join(root, "editor/build"), path.join(temp, "editor/build"), {
    recursive: true,
});
fs.cpSync(path.join(root, ".tools/misaki"), path.join(temp, ".tools/misaki"), {
    recursive: true,
});
fs.mkdirSync(path.join(temp, "config"));
fs.copyFileSync(
    path.join(root, "config/tools.lock.json"),
    path.join(temp, "config/tools.lock.json"),
);
fs.mkdirSync(path.join(temp, "projects"));
const original = lib.readGame(root, "star-caravan");
original.stages[0].tiles[21] = 1;
original.stages[0].tiles[41] = 2;
original.assets.push({
    id: "test-bomb",
    name: "TEST BOMB",
    kind: "screen",
    width: 160,
    height: 144,
    palette: 0,
    origin: { x: 0, y: 0 },
    hitbox: { x: 0, y: 0, w: 160, h: 144 },
    emitters: [],
    frames: [
        {
            id: "test-bomb-frame",
            image: "images/test-bomb.png",
            duration: 8,
            pixels: Array.from(
                { length: 160 * 144 },
                (_, i) => ((i % 160) + Math.floor(i / 160)) % 4,
            ),
        },
    ],
});
lib.createProject(temp, "first", "FIRST", original);
lib.createProject(temp, "second", "SECOND", lib.readGame(root, "star-caravan"));
let win,
    confirmationResponse = 1;
const opened = [],
    confirmations = [];
class TestWindow extends electron.BrowserWindow {
    constructor(options) {
        super({
            ...options,
            show: false,
            width: 1450,
            height: 950,
            webPreferences: {
                ...options.webPreferences,
                backgroundThrottling: false,
            },
        });
        win = this;
    }
}
const native = {
    ...electron,
    BrowserWindow: TestWindow,
    dialog: {
        ...electron.dialog,
        showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
        showMessageBox: async (...args) => {
            confirmations.push(args.at(-1).message);
            return { response: confirmationResponse };
        },
        showMessageBoxSync: () => 1,
    },
    shell: {
        ...electron.shell,
        openPath: async (p) => {
            opened.push(p);
            return "";
        },
    },
};
electron.app.disableHardwareAcceleration();
const timer = setTimeout(() => {
    record({ error: "timeout" });
    electron.app.exit(1);
}, 120000);
const js = async (source) => {
        try {
            return await win.webContents.executeJavaScript(source);
        } catch (error) {
            throw Error(`${error.message}\nRenderer expression: ${source}`);
        }
    },
    wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(source) {
    for (let i = 0; i < 160; i++) {
        if (await js(source)) return;
        await wait(30);
    }
    throw Error("Timed out: " + source);
}
function key(code, modifiers = []) {
    win.webContents.sendInputEvent({
        type: "keyDown",
        keyCode: code,
        modifiers,
    });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: code, modifiers });
}
async function click(expression) {
    const p = await js(
        `(()=>{const e=${expression};if(!e)throw Error('Missing control');e.scrollIntoView({block:'center',inline:'nearest'});const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`,
    );
    win.webContents.sendInputEvent({
        type: "mouseDown",
        ...p,
        button: "left",
        clickCount: 1,
    });
    win.webContents.sendInputEvent({
        type: "mouseUp",
        ...p,
        button: "left",
        clickCount: 1,
    });
    await wait(30);
}
const button = (text, scope = "document") =>
    `[...${scope}.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
const field = (label, scope = "document") =>
    `[...${scope}.querySelectorAll('label.field')].find(e=>e.querySelector(':scope > span')?.textContent===${JSON.stringify(label)})?.querySelector('input,select')`;
async function text(expression, value) {
    await js(`(${expression}).focus()`);
    key("A", ["control"]);
    await win.webContents.insertText(String(value));
    await until(`(${expression}).value===${JSON.stringify(String(value))}`);
}
async function select(expression, value) {
    const index = await js(
        `(()=>{const e=${expression};e.focus();return [...e.options].findIndex(o=>o.value===${JSON.stringify(value)});})()`,
    );
    assert.ok(index >= 0, "option exists: " + value);
    key("Home");
    for (let i = 0; i < index; i++) key("Down");
    key("Return");
    await until(`(${expression}).value===${JSON.stringify(value)}`);
}
async function category(label) {
    await click(
        `[...document.querySelectorAll('.category')].find(e=>e.textContent.includes(${JSON.stringify(label)}))`,
    );
    await wait(50);
}
async function save(project = "first") {
    await js("document.activeElement?.blur()");
    key("S", ["control"]);
    await until("!document.querySelector('.status-dot.unsaved')");
    return lib.readGame(temp, project);
}
const map =
    "document.querySelector('canvas[aria-label=\"ステージマップ編集キャンバス\"]')";
async function stroke(points) {
    const positions = await js(
        `(()=>{const c=${map},w=c.closest('.map');w.scrollLeft=0;w.scrollTop=0;const r=c.getBoundingClientRect();return ${JSON.stringify(points)}.map(([x,y])=>({x:Math.round(r.left+x*r.width/c.width),y:Math.round(r.top+y*r.height/c.height)}));})()`,
    );
    win.webContents.sendInputEvent({
        type: "mouseDown",
        ...positions[0],
        button: "left",
        clickCount: 1,
    });
    await wait(40);
    for (const p of positions.slice(1)) {
        win.webContents.sendInputEvent({
            type: "mouseMove",
            ...p,
            modifiers: ["leftButtonDown"],
        });
        await wait(40);
    }
    win.webContents.sendInputEvent({
        type: "mouseUp",
        ...positions.at(-1),
        button: "left",
        clickCount: 1,
    });
    await wait(60);
}
vm.runInNewContext(
    fs.readFileSync(path.join(root, "editor/build/main.cjs"), "utf8"),
    {
        require: (n) => (n === "electron" ? native : require(n)),
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
        await until("!!document.querySelector('.project-picker select')");
        await category("ステージ");
        await until(`!!${map}`);
        await select(field("スクロール方向"), "horizontal");
        await text(field("マップ横幅（タイル）"), 40);
        await until(`${map}.width===320 && ${map}.height===144`);
        let saved = await save();
        assert.equal(saved.stages[0].tiles[41], 1);
        assert.equal(saved.stages[0].tiles[81], 2);
        record("horizontal resize preserves row-major content");
        await click(button("＋ 破壊BGの種類を追加"));
        await until(
            "document.querySelectorAll('.destructible-fields > details').length===1",
        );
        await click(button("破壊BG"));
        await stroke([
            [17, 17],
            [49, 17],
        ]);
        await until(
            "document.querySelector('.map-tools').innerText.includes('3個配置')",
        );
        key("Z", ["control"]);
        await until(
            "document.querySelector('.map-tools').innerText.includes('0個配置')",
        );
        key("Y", ["control"]);
        await until(
            "document.querySelector('.map-tools').innerText.includes('3個配置')",
        );
        await click(
            "document.querySelector('input[aria-label=\"破壊BGを消去\"]')",
        );
        await stroke([[17, 17]]);
        await until(
            "document.querySelector('.map-tools').innerText.includes('2個配置')",
        );
        key("Z", ["control"]);
        await until(
            "document.querySelector('.map-tools').innerText.includes('3個配置')",
        );
        saved = await save();
        assert.deepEqual(
            saved.stages[0].destructibles.objects.map((o) => [o.x, o.y]),
            [
                [2, 2],
                [4, 2],
                [6, 2],
            ],
        );
        assert.equal(saved.stages[0].destructibles.types[0].solid, false);
        record("16x16 stamp drag, erase, undo and redo persist");
        await click(button("手のひら"));
        const before = await js(
            "document.querySelector('.canvas-well.map').scrollLeft",
        );
        await stroke([
            [100, 48],
            [30, 48],
        ]);
        assert.ok(
            (await js(
                "document.querySelector('.canvas-well.map').scrollLeft",
            )) > before,
        );
        record("horizontal map pans with native pointer input");
        await js(
            "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
        );
        fs.writeFileSync(
            path.join(temp, "horizontal-map.png"),
            Buffer.from(
                (await js(`${map}.toDataURL()`)).split(",")[1],
                "base64",
            ),
        );
        fs.writeFileSync(
            path.join(temp, "horizontal-editor.png"),
            (await win.webContents.capturePage()).toPNG(),
        );
        await category("アイテム");
        await click(
            button("＋ 追加", "document.querySelector('.library-footer')"),
        );
        await until("!!document.querySelector('.form[data-context=\"item\"]')");
        await text(
            field(
                "名前",
                "document.querySelector('.form[data-context=\"item\"]')",
            ),
            "POWER TEST",
        );
        const kinds = ["shot", "speed", "bomb", "life", "score"];
        for (let i = 0; i < kinds.length; i++) {
            if (i) await click(button("＋ 取得効果（複数設定可）を追加"));
            await select(
                `document.querySelectorAll('.form[data-context="effects"]')[${i}].querySelector('select')`,
                kinds[i],
            );
        }
        record("item authoring exposes all five effects");
        await category("自機");
        await click(
            "document.querySelector('input[aria-label=\"パワーアップ段階を有効にする\"]')",
        );
        await click(button("＋ ショット段階を追加"));
        await click(button("＋ 速度段階を追加"));
        await text(
            "document.querySelector('input[aria-label=\"速度段階 2\"]')",
            3,
        );
        await select(field("ミス時のショット"), "down");
        await select(field("ミス時の速度"), "keep");
        await select(field("ボム操作"), "b");
        await click(
            'document.querySelector(\'.form[data-context="bomb"] input[aria-label="有効"]\')',
        );
        await select(
            field(
                "背景画像",
                "document.querySelector('.form[data-context=\"bomb\"]')",
            ),
            "test-bomb",
        );
        await click(
            "document.querySelector('input[aria-label=\"一斉射撃を全弾まとめて生成\"]')",
        );
        await click(
            "document.querySelector('input[aria-label=\"ボムで背景を破壊して得点\"]')",
        );
        saved = await save();
        assert.deepEqual(
            saved.items[0].effects.map((e) => e.kind),
            kinds,
        );
        assert.equal(saved.player.powerUps.shotWeapons.length, 2);
        assert.equal(saved.player.powerUps.speedLevels[1], 3);
        assert.equal(saved.player.bomb.button, "b");
        assert.equal(saved.player.bomb.destroyBackground, true);
        assert.equal(saved.player.atomicVolleys, true);
        record(
            "five item effects, power-up levels, miss behavior, atomic volleys and B bomb save",
        );
        await category("敵キャラクター");
        await select(field("撃破時のアイテム"), saved.items[0].id);
        saved = await save();
        assert.equal(saved.enemies[0].dropItem, saved.items[0].id);
        await category("弾幕");
        await click(button("＋ 発射位置の差替え（自機原点から）を追加"));
        saved = await save();
        assert.deepEqual(saved.patterns[0].emitterOffsets, [{ x: 0, y: 0 }]);
        record("enemy drop and origin-relative emitter offsets save");
        await category("ステージ");
        await click(button("＋ イベント追加"));
        await select(
            field(
                "種類",
                "document.querySelector('.form[data-context=\"event\"]')",
            ),
            "item",
        );
        await text(
            field(
                "編隊間隔 Y",
                "document.querySelector('.form[data-context=\"event\"]')",
            ),
            16,
        );
        saved = await save();
        const event = saved.stages[0].events.at(-1);
        assert.equal(event.kind, "item");
        assert.equal(event.ref, saved.items[0].id);
        assert.equal(event.spacingY, 16);
        record("item timeline event and vertical formation spacing save");
        await select(
            "document.querySelector('.project-picker select')",
            "second",
        );
        await until(
            "document.querySelector('.library .panel-title').textContent.includes('second')",
        );
        await category("ステージ");
        assert.equal(await js(`${map}.width`), 160);
        await select(
            "document.querySelector('.project-picker select')",
            "first",
        );
        await until(
            "document.querySelector('.library .panel-title').textContent.includes('first')",
        );
        await category("ステージ");
        assert.equal(await js(`${map}.width`), 320);
        await click(
            "document.querySelector('button[aria-label=\"現在のプロジェクトフォルダをエクスプローラーで開く\"]')",
        );
        assert.equal(opened.at(-1), path.join(temp, "projects/first"));
        assert.equal(
            fs.existsSync(path.join(temp, "projects/first/build")),
            false,
        );
        record(
            "saved horizontal project reopens; vertical project and Explorer controls still work; no ROM build",
        );
        await js(
            "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
        );
        fs.writeFileSync(
            path.join(temp, "horizontal-reopened.png"),
            (await win.webContents.capturePage()).toPNG(),
        );
        // New nested diagnostic owners must navigate to their authoring controls.
        const typeId = saved.stages[0].destructibles.types[0].id;
        await text(
            field("耐久値", "document.querySelector('.destructible-fields')"),
            16,
        );
        await category("プロジェクト");
        await click(
            "[...document.querySelectorAll('.bottom-tabs button')].find(e=>e.textContent.trim().startsWith('ビルド・検証'))",
        );
        const diagnostic = (id) =>
            `[...document.querySelectorAll('.diagnostic')].find(e=>e.querySelector('strong')?.textContent===${JSON.stringify(id)})`;
        await until(`!!(${diagnostic(typeId)})`);
        await click(diagnostic(typeId));
        await until(`!!${map}`);
        assert.equal(await js(`${map}.width`), 320);
        await text(
            field("耐久値", "document.querySelector('.destructible-fields')"),
            1,
        );
        await category("アイテム");
        const amount =
            'document.querySelector(\'.form[data-context="effects"] input[aria-label="加算量"]\')';
        await text(amount, 0);
        await category("プロジェクト");
        await until(`!!(${diagnostic(saved.items[0].id)})`);
        await click(diagnostic(saved.items[0].id));
        await until("!!document.querySelector('.form[data-context=\"item\"]')");
        await text(amount, 1);
        await save();
        record(
            "item and destructible-type diagnostics navigate to the correct authoring controls",
        );
        // Items are optional: a last unreferenced pickup can be removed after a reopen.
        await select(
            "document.querySelector('.project-picker select')",
            "second",
        );
        await category("アイテム");
        await click(
            button("＋ 追加", "document.querySelector('.library-footer')"),
        );
        let second = await save("second");
        const lastItem = second.items[0].id;
        await select(
            "document.querySelector('.project-picker select')",
            "first",
        );
        await select(
            "document.querySelector('.project-picker select')",
            "second",
        );
        await category("アイテム");
        const remove = button(
            "対象を削除",
            "document.querySelector('.inspector-actions')",
        );
        assert.equal(
            await js(`(${remove}).disabled`),
            false,
            "the final optional item remains deletable",
        );
        const callsBefore = confirmations.length;
        confirmationResponse = 0;
        await click(remove);
        assert.equal(
            confirmations.length,
            callsBefore + 1,
            "native confirmation is called",
        );
        assert.equal(
            await js("document.querySelectorAll('.library .asset-row').length"),
            1,
            "cancel keeps the last item",
        );
        confirmationResponse = 1;
        await click(remove);
        await until(
            "document.querySelectorAll('.library .asset-row').length===0",
        );
        assert.equal(confirmations.length, callsBefore + 2);
        second = await save("second");
        assert.equal(second.items.length, 0);
        key("Z", ["control"]);
        await until(
            "document.querySelectorAll('.library .asset-row').length===1",
        );
        second = await save("second");
        assert.equal(
            second.items[0].id,
            lastItem,
            "Undo restores the exact item",
        );
        key("Y", ["control"]);
        await until(
            "document.querySelectorAll('.library .asset-row').length===0",
        );
        await save("second");
        await select(
            "document.querySelector('.project-picker select')",
            "first",
        );
        await select(
            "document.querySelector('.project-picker select')",
            "second",
        );
        await category("アイテム");
        assert.equal(
            await js("document.querySelectorAll('.library .asset-row').length"),
            0,
            "empty item library persists after reopen",
        );
        record(
            "last optional item: native cancel/confirm, delete, Undo/Redo, save and reopen",
        );
        record("PASS");
        clearTimeout(timer);
        electron.app.exit(0);
    })
    .catch(async (error) => {
        record({ error: error.stack });
        if (win)
            fs.writeFileSync(
                path.join(temp, "failure.png"),
                (await win.webContents.capturePage()).toPNG(),
            );
        clearTimeout(timer);
        electron.app.exit(1);
    });
