import type { Asset, BuildResult, Game, ProjectInfo } from "./model";
export type ImportResult = {
    pixels: number[];
    sourceWidth: number;
    sourceHeight: number;
    uniqueColors: number;
    reduced: number;
    cropped: boolean;
};
export interface Bridge {
    init(): Promise<{
        projects: ProjectInfo[];
        name: string;
        game: Game;
        recovery: Game | null;
        revision: string;
        glyphs: Record<string, number[]>;
    }>;
    open(
        name: string,
    ): Promise<{ game: Game; recovery: Game | null; revision: string }>;
    save(name: string, game: Game): Promise<string>;
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
    build(name: string, game: Game, config: string): Promise<BuildResult>;
    rom(name: string, config: string): Promise<Uint8Array>;
    external(name: string, config: string, emulator: string): Promise<void>;
    onLog(callback: (log: string) => void): () => void;
    dirty(value: boolean): void;
}
declare global {
    interface Window {
        caravan: Bridge;
    }
}
