import type { Asset, BuildResult, Game, ProjectInfo } from "./model";
export type ImportResult = {
    pixels: number[];
    sourceWidth: number;
    sourceHeight: number;
    uniqueColors: number;
    reduced: number;
    cropped: boolean;
};
export type ToolchainStatus = {
    ready: boolean;
    tools: {
        id: string;
        label: string;
        version: string;
        path: string;
        installed: boolean;
        required: boolean;
    }[];
    hint: string;
};
export interface Bridge {
    confirm(message: string): Promise<boolean>;
    chooseProject(): Promise<{ name: string; projects: ProjectInfo[] } | null>;
    showProjectFolder(name: string): Promise<void>;
    init(): Promise<{
        projects: ProjectInfo[];
        name: string;
        game: Game;
        recovery: Game | null;
        revision: string;
        warnings?: string[];
        glyphs: Record<string, number[]>;
    }>;
    open(
        name: string,
    ): Promise<{
        game: Game;
        recovery: Game | null;
        revision: string;
        warnings?: string[];
    }>;
    save(name: string, game: Game, expectedRevision?: string): Promise<string>;
    recover(name: string, game: Game): Promise<void>;
    create(
        name: string,
        title: string,
        game: Game,
    ): Promise<{ game: Game; projects: ProjectInfo[]; revision: string }>;
    importPng(
        asset: Asset,
        colors: string[],
        transparent: number,
    ): Promise<ImportResult | null>;
    exportPng(asset: Asset, frame: number): Promise<boolean>;
    build(
        name: string,
        game: Game,
        config: string,
        expectedRevision?: string,
    ): Promise<BuildResult>;
    cancelBuild(): Promise<boolean>;
    toolchain(): Promise<ToolchainStatus>;
    rom(
        name: string,
        config: string,
        expectedRevision?: string,
    ): Promise<Uint8Array>;
    external(
        name: string,
        config: string,
        emulator: string,
        expectedRevision?: string,
    ): Promise<void>;
    exportRom(
        name: string,
        config: string,
        expectedRevision?: string,
    ): Promise<boolean>;
    onLog(callback: (log: string) => void): () => void;
    dirty(value: boolean, name?: string, game?: Game): void;
}
declare global {
    interface Window {
        caravan: Bridge;
    }
}
