import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { verifyGbdkOutput } = createRequire(import.meta.url)(
    "../build/library.cjs",
);
test("GBDK bank overlap diagnostics reject a zero-exit tool result", () => {
    for (const diagnostic of [
        "Warning: Multiple write of    13 bytes at 0x4017 -> 0x4023 writes:(0x4017 -> 0x4023, 0x4000 -> 0x5678)",
        "Warning: Possible overflow from Bank 0 into Bank 1",
    ])
        assert.throws(
            () => verifyGbdkOutput(diagnostic),
            /ROMバンク重複・容量超過/,
        );
});
test("GBDK ordinary output remains valid and available for logging", () => {
    assert.doesNotThrow(() =>
        verifyGbdkOutput(
            "ROM_1 0x4000 -> 0x7fff\nWarning: unused local variable",
        ),
    );
});
