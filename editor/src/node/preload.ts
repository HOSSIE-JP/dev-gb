import type { Bridge } from "../shared/bridge";
const { contextBridge, ipcRenderer } = require("electron");
const api: Bridge = {
    init: () => ipcRenderer.invoke("ce:init"),
    open: (name) => ipcRenderer.invoke("ce:open", name),
    save: (name, game, revision) =>
        ipcRenderer.invoke("ce:save", name, game, revision),
    recover: (name, game) => ipcRenderer.invoke("ce:recover", name, game),
    create: (name, title, game) =>
        ipcRenderer.invoke("ce:create", name, title, game),
    importPng: (asset, colors, transparent) =>
        ipcRenderer.invoke("ce:import", asset, colors, transparent),
    exportPng: (asset, frame) => ipcRenderer.invoke("ce:export", asset, frame),
    build: (name, game, config, revision) =>
        ipcRenderer.invoke("ce:build", name, game, config, revision),
    cancelBuild: () => ipcRenderer.invoke("ce:cancel-build"),
    toolchain: () => ipcRenderer.invoke("ce:toolchain"),
    rom: (name, config, revision) =>
        ipcRenderer.invoke("ce:rom", name, config, revision),
    external: (name, config, emulator, revision) =>
        ipcRenderer.invoke("ce:external", name, config, emulator, revision),
    exportRom: (name, config, revision) =>
        ipcRenderer.invoke("ce:export-rom", name, config, revision),
    onLog: (callback) => {
        const listener = (_: unknown, log: string) => callback(log);
        ipcRenderer.on("ce:log", listener);
        return () => ipcRenderer.removeListener("ce:log", listener);
    },
    dirty: (value, name, game) =>
        ipcRenderer.send("ce:dirty", value, name, game),
};
contextBridge.exposeInMainWorld("caravan", api);
