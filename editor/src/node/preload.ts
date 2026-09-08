import type { Bridge } from "../shared/bridge";
const { contextBridge, ipcRenderer } = require("electron");
const api: Bridge = {
    init: () => ipcRenderer.invoke("ce:init"),
    open: (name) => ipcRenderer.invoke("ce:open", name),
    save: (name, game) => ipcRenderer.invoke("ce:save", name, game),
    recover: (name, game) => ipcRenderer.invoke("ce:recover", name, game),
    create: (name, title, game) =>
        ipcRenderer.invoke("ce:create", name, title, game),
    importPng: (asset, colors, transparent) =>
        ipcRenderer.invoke("ce:import", asset, colors, transparent),
    exportPng: (asset, frame) => ipcRenderer.invoke("ce:export", asset, frame),
    build: (name, game, config) =>
        ipcRenderer.invoke("ce:build", name, game, config),
    rom: (name, config) => ipcRenderer.invoke("ce:rom", name, config),
    external: (name, config, emulator) =>
        ipcRenderer.invoke("ce:external", name, config, emulator),
    onLog: (callback) => {
        const listener = (_: unknown, log: string) => callback(log);
        ipcRenderer.on("ce:log", listener);
        return () => ipcRenderer.removeListener("ce:log", listener);
    },
    dirty: (value) => ipcRenderer.send("ce:dirty", value),
};
contextBridge.exposeInMainWorld("caravan", api);
