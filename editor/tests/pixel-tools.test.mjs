import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { linePoints, paintStroke } = createRequire(import.meta.url)(
    "../build/library.cjs",
);

test("fast pencil strokes connect every cell in every direction", () => {
    const start = { x: 8, y: 8 };
    for (const end of [
        { x: 0, y: 0 },
        { x: 15, y: 0 },
        { x: 0, y: 15 },
        { x: 15, y: 15 },
        { x: 8, y: 0 },
        { x: 0, y: 8 },
        start,
    ]) {
        const cells = linePoints(start, end);
        assert.deepEqual(cells[0], start);
        assert.deepEqual(cells.at(-1), end);
        assert.equal(
            cells.length,
            Math.max(Math.abs(start.x - end.x), Math.abs(start.y - end.y)) + 1,
        );
        for (let i = 1; i < cells.length; i++) {
            assert.ok(Math.abs(cells[i].x - cells[i - 1].x) <= 1);
            assert.ok(Math.abs(cells[i].y - cells[i - 1].y) <= 1);
        }
    }
});
test("rectangle tools preserve interior and support reverse dragging", () => {
    const original = Array(64).fill(0);
    const a = { x: 1, y: 1 },
        b = { x: 5, y: 4 };
    const output = paintStroke(original, 8, 8, a, b, 3, "rectangle");
    assert.deepEqual(output, paintStroke(original, 8, 8, b, a, 3, "rectangle"));
    assert.equal(output.filter((n) => n === 3).length, 14);
    assert.equal(output[2 * 8 + 2], 0);
    assert.deepEqual(original, Array(64).fill(0));
});
test("drawing clips out-of-bounds points without wrapping rows", () => {
    const output = paintStroke(
        Array(16).fill(1),
        4,
        4,
        { x: -2, y: 0 },
        { x: 5, y: 0 },
        0,
    );
    assert.deepEqual(output, [...Array(4).fill(0), ...Array(12).fill(1)]);
    assert.equal(output.length, 16);
});
