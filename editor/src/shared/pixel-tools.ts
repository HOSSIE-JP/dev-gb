import type { Point } from "./model";

/** Integer line including both endpoints; keeps fast pointer strokes continuous. */
export function linePoints(from: Point, to: Point): Point[] {
    let x = Math.round(from.x),
        y = Math.round(from.y);
    const targetX = Math.round(to.x),
        targetY = Math.round(to.y);
    const dx = Math.abs(targetX - x),
        dy = -Math.abs(targetY - y);
    const sx = x < targetX ? 1 : -1,
        sy = y < targetY ? 1 : -1;
    let error = dx + dy;
    const points: Point[] = [];
    for (;;) {
        points.push({ x, y });
        if (x === targetX && y === targetY) return points;
        const twice = 2 * error;
        if (twice >= dy) {
            error += dy;
            x += sx;
        }
        if (twice <= dx) {
            error += dx;
            y += sy;
        }
    }
}

export function paintStroke(
    pixels: number[],
    width: number,
    height: number,
    from: Point,
    to: Point,
    color: number,
    shape = "line",
): number[] {
    const result = [...pixels];
    const put = ({ x, y }: Point) => {
        if (x >= 0 && y >= 0 && x < width && y < height)
            result[y * width + x] = color;
    };
    if (shape === "rectangle") {
        const topRight = { x: to.x, y: from.y },
            bottomLeft = { x: from.x, y: to.y };
        for (const [a, b] of [
            [from, topRight],
            [topRight, to],
            [to, bottomLeft],
            [bottomLeft, from],
        ])
            linePoints(a, b).forEach(put);
    } else linePoints(from, to).forEach(put);
    return result;
}
