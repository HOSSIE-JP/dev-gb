#!/usr/bin/env python3
"""NOVA SPEAR original, exact 2bpp source artwork. Requires Pillow.

Run from any directory: python projects/nova-spear/assets-src/art/build_art.py
All geometry is authored on the native pixel grid. There is no resampling,
antialiasing, external source image, or dependency on a system font.
"""
from pathlib import Path
import json
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "images"
OUT.mkdir(parents=True, exist_ok=True)
ASSETS = []
ROLES = {}
GRAY = [255, 170, 85, 0]


def canvas(w, h, fill=0):
    return Image.new("L", (w, h), fill)


def pattern(rows):
    rows = [r.strip() for r in rows.strip().splitlines()]
    assert len(set(map(len, rows))) == 1, rows
    im = canvas(len(rows[0]), len(rows))
    im.putdata([int(c) if c != "." else 0 for row in rows for c in row])
    return im


def save_pixels(im, name):
    assert set(im.tobytes()) <= {0, 1, 2, 3}, name
    p = Image.new("P", im.size)
    p.putpalette([v for g in GRAY for v in (g, g, g)] + [0] * (768 - 12))
    p.putdata(list(im.tobytes()))
    p.save(OUT / (name + ".png"), optimize=False)


def asset(aid, name, frames, role, kind="sprite", hitbox=None, emitters=None, duration=8):
    w, h = frames[0].size
    assert all(f.size == (w, h) for f in frames)
    for i, frame in enumerate(frames):
        save_pixels(frame, f"{aid}-f{i}")
    a = {
        "id": aid, "name": name, "kind": kind, "width": w, "height": h,
        "paletteRole": role, "origin": {"x": 0, "y": 0},
        "hitbox": hitbox or {"x": 2, "y": 2, "w": max(1, w - 4), "h": max(1, h - 4)},
        "emitters": emitters or [],
        "frames": [{"id": f"{aid}-f{i}", "image": f"images/{aid}-f{i}.png", "duration": duration} for i in range(len(frames))],
    }
    ASSETS.append(a)
    return a


# The pilot's narrow nose and swept wings remain legible beside round bullets.
player = pattern("""
.......33.......
.......33.......
......1331......
......2332......
.....123321.....
.....123321.....
..1..123321..1..
..21.123321.12..
.13221233212231.
.23332233223332.
1233322332233321
1232222332222321
1231.123321.1321
.11..23332..11..
.....23132......
.....2..2.......
""")
player1 = player.copy()
ImageDraw.Draw(player1).rectangle((5, 14, 6, 15), fill=3)
ImageDraw.Draw(player1).rectangle((9, 14, 10, 15), fill=3)
asset("player-ship", "自機 / NS-01 SPEAR", [player, player1], "player",
      hitbox={"x": 5, "y": 5, "w": 6, "h": 7}, emitters=[{"x": 8, "y": 0}], duration=6)

asset("player-bullet", "自機弾 / PULSE", [pattern("""
...33...
..1331..
..2332..
..2332..
..2332..
...33...
...22...
........
""")], "shot", hitbox={"x": 2, "y": 0, "w": 4, "h": 7})
asset("player-lance", "集中弾 / FOCUS LANCE", [pattern("""
...33...
..2332..
..3333..
.133331.
..3333..
..2332..
...33...
...22...
""")], "shot", hitbox={"x": 2, "y": 0, "w": 4, "h": 8})
asset("enemy-bullet", "敵弾 / ORB", [pattern("""
........
..2332..
.231132.
.310013.
.310013.
.231132.
..2332..
........
""")], "shot", hitbox={"x": 2, "y": 2, "w": 4, "h": 4})

scout = pattern("""
....2......2....
....3......3....
...131....131...
..123211112321..
.12333222233321.
.13233333333231.
1232233333322321
1232123333212321
1232112332112321
.2321.2332.1232.
.121..2332..121.
..1...1331...1..
......1331......
.......33.......
.......22.......
................
""")
scout1 = scout.copy()
ImageDraw.Draw(scout1).point([(4, 0), (11, 0)], fill=3)
ImageDraw.Draw(scout1).rectangle((7, 7, 8, 8), fill=2)
asset("scout", "斥候機 / NEEDLE", [scout, scout1], "enemy", emitters=[{"x": 8, "y": 14}], duration=10)

asset("interceptor", "迎撃機 / MANTA", [pattern("""
..1..........1..
.132........231.
.1331......1331.
123332....233321
1232332112332321
1232233333322321
.12212333321221.
..121233332121..
...1232332321...
....12233221....
.....123321.....
.....123321.....
......2332......
......1331......
.......22.......
................
""")], "enemy", emitters=[{"x": 8, "y": 14}])

asset("turret", "砲台 / LOCK", [pattern("""
....11111111....
...1233223321...
..123222222321..
.12321111112321.
1232112332112321
1321123333211231
1321232222321231
1221322112231221
1221322112231221
1321232112321231
1321123333211231
1232112332112321
.12321233212321.
..123123321321..
...1223333221...
....11233211....
""")], "armor", emitters=[{"x": 8, "y": 16}])

asset("armored", "重装機 / CITADEL", [pattern("""
...1111..........1111...
..123321........123321..
.1233332111111112333321.
123322332222222233223321
132211233333333321122231
132211232222223211122231
133332232333323223333331
122222232311323222222221
122122232311323222122221
133122232333323222133331
123122123333321221132321
123121112332111121132321
123321.123321..12333321.
.12321.123321..1233321..
..111...2332....1111....
.........22.............
""")], "armor", emitters=[{"x": 12, "y": 16}])

asset("score-beacon", "ボーナス / NOVA BEACON", [pattern("""
.......33.......
......2332......
.....233332.....
....23322332....
...2332112332...
..233213312332..
.23321333312332.
2332133113312332
2332133113312332
.23321333312332.
..233213312332..
...2332112332...
....23322332....
.....233332.....
......2332......
.......33.......
""")], "bonus", hitbox={"x": 3, "y": 3, "w": 10, "h": 10})


def mirrored(im):
    # Boss silhouettes are bilateral; small highlights intentionally differ.
    return im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)


def trident():
    im = canvas(32, 32)
    d = ImageDraw.Draw(im)
    d.polygon([(13, 1), (18, 1), (21, 6), (27, 6), (31, 13), (31, 26), (27, 29), (24, 20), (21, 20), (19, 30), (12, 30), (10, 20), (7, 20), (4, 29), (0, 26), (0, 13), (4, 6), (10, 6)], fill=1)
    d.polygon([(14, 2), (17, 2), (20, 8), (26, 8), (29, 14), (29, 24), (27, 26), (24, 18), (20, 18), (18, 28), (13, 28), (11, 18), (7, 18), (4, 26), (2, 24), (2, 14), (5, 8), (11, 8)], fill=2)
    for x in (4, 24):
        d.rectangle((x, 11, x + 3, 21), fill=1)
        d.line((x, 11, x, 21), fill=3)
        d.rectangle((x + 1, 14, x + 2, 24), fill=3)
    d.polygon([(14, 4), (17, 4), (19, 10), (18, 13), (13, 13), (12, 10)], fill=3)
    d.rectangle((13, 7, 18, 12), fill=1)
    d.rectangle((14, 8, 17, 11), fill=2)
    d.polygon([(13, 15), (18, 15), (20, 18), (18, 22), (13, 22), (11, 18)], fill=1)
    d.polygon([(14, 16), (17, 16), (18, 18), (17, 20), (14, 20), (13, 18)], fill=3)
    d.line((14, 24, 17, 24), fill=3)
    d.line((5, 8, 10, 8), fill=3)
    d.line((21, 8, 26, 8), fill=3)
    d.rectangle((13, 29, 14, 31), fill=3)
    d.rectangle((17, 29, 18, 31), fill=3)
    return im


def bastion():
    im = canvas(32, 32)
    d = ImageDraw.Draw(im)
    for x in (1, 22):
        d.polygon([(x + 2, 0), (x + 6, 0), (x + 8, 4), (x + 8, 24), (x + 6, 30), (x + 2, 30), (x, 24), (x, 4)], fill=1)
        d.rectangle((x + 1, 4, x + 7, 22), fill=2)
        d.line((x + 2, 3, x + 6, 3), fill=3)
        d.line((x + 1, 5, x + 1, 20), fill=3)
        d.rectangle((x + 3, 6, x + 5, 16), fill=1)
        for y in (7, 11, 15):
            d.line((x + 3, y, x + 5, y), fill=3)
        d.rectangle((x + 3, 23, x + 5, 31), fill=3)
        d.line((x + 4, 24, x + 4, 31), fill=1)
    d.rectangle((8, 7, 23, 20), fill=1)
    d.rectangle((9, 8, 22, 19), fill=2)
    d.line((9, 8, 22, 8), fill=3)
    d.polygon([(12, 4), (19, 4), (22, 10), (21, 22), (18, 27), (13, 27), (10, 22), (9, 10)], fill=1)
    d.polygon([(13, 5), (18, 5), (20, 10), (19, 21), (17, 24), (14, 24), (12, 21), (11, 10)], fill=2)
    d.rectangle((13, 8, 18, 13), fill=3)
    d.rectangle((14, 9, 17, 12), fill=1)
    d.rectangle((13, 16, 18, 20), fill=1)
    d.rectangle((14, 17, 17, 19), fill=3)
    d.point([(13, 23), (18, 23)], fill=3)
    return im


def helix():
    im = canvas(32, 32)
    d = ImageDraw.Draw(im)
    d.polygon([(10, 1), (21, 1), (30, 10), (30, 21), (21, 30), (10, 30), (1, 21), (1, 10)], fill=1)
    d.polygon([(11, 2), (20, 2), (29, 11), (29, 20), (20, 29), (11, 29), (2, 20), (2, 11)], fill=2)
    d.polygon([(12, 5), (19, 5), (26, 12), (26, 19), (19, 26), (12, 26), (5, 19), (5, 12)], fill=1)
    d.polygon([(13, 8), (18, 8), (23, 13), (23, 18), (18, 23), (13, 23), (8, 18), (8, 13)], fill=3)
    d.polygon([(13, 10), (18, 10), (21, 13), (21, 18), (18, 21), (13, 21), (10, 18), (10, 13)], fill=2)
    d.rectangle((13, 13, 18, 18), fill=1)
    d.rectangle((14, 14, 17, 17), fill=3)
    # Four raised magnetic vanes make the final core unlike either warship.
    for x, y, w, h in ((13, 0, 6, 7), (25, 13, 7, 6), (13, 25, 6, 7), (0, 13, 7, 6)):
        d.rectangle((x, y, x + w - 1, y + h - 1), fill=1)
        d.rectangle((x + 1, y + 1, x + w - 2, y + h - 2), fill=2)
        d.line((x + 1, y + 1, x + w - 2, y + 1), fill=3)
    d.line((7, 6, 10, 3), fill=3)
    d.line((23, 3, 27, 7), fill=3)
    d.line((4, 23, 8, 27), fill=3)
    d.line((23, 28, 28, 23), fill=3)
    return im


asset("boss-trident", "01 ボス / TRIDENT", [trident()], "boss", hitbox={"x": 2, "y": 3, "w": 28, "h": 27}, emitters=[{"x": 16, "y": 28}])
asset("boss-bastion", "02 ボス / BASTION", [bastion()], "boss", hitbox={"x": 2, "y": 2, "w": 28, "h": 29}, emitters=[{"x": 16, "y": 28}])
asset("boss-helix", "03 ボス / HELIX", [helix()], "finalBoss", hitbox={"x": 3, "y": 3, "w": 26, "h": 26}, emitters=[{"x": 16, "y": 28}])

explosions = []
for i in range(3):
    im = canvas(16, 16)
    d = ImageDraw.Draw(im)
    if i == 0:
        d.polygon([(7, 0), (9, 5), (14, 2), (11, 7), (15, 9), (10, 10), (12, 15), (7, 11), (3, 14), (5, 9), (0, 6), (6, 6)], fill=2)
        d.polygon([(7, 3), (9, 6), (12, 7), (10, 9), (9, 12), (6, 10), (3, 8), (6, 6)], fill=3)
    elif i == 1:
        d.polygon([(6, 0), (11, 1), (14, 4), (15, 9), (12, 14), (7, 15), (2, 13), (0, 8), (2, 3)], fill=2)
        d.polygon([(6, 2), (10, 2), (13, 6), (13, 10), (9, 13), (5, 12), (2, 8), (3, 5)], fill=3)
        d.polygon([(7, 5), (10, 6), (10, 9), (7, 10), (5, 8)], fill=0)
    else:
        for box in ((2, 1, 4, 3), (11, 1, 13, 3), (0, 8, 2, 10), (13, 7, 15, 9), (3, 12, 5, 14), (10, 12, 12, 14)):
            d.rectangle(box, fill=2)
            d.point((box[0], box[1]), fill=3)
    explosions.append(im)
asset("explosion", "爆発 / NOVA BURST", explosions, "shot", duration=5)


def tile(atlas, tid, source):
    assert source.size == (8, 8)
    atlas.paste(source, ((tid % 8) * 8, (tid // 8) * 8))


def block(atlas, start, im):
    result = []
    for y in range(im.height // 8):
        row = []
        for x in range(im.width // 8):
            tid = start + y * 8 + x
            tile(atlas, tid, im.crop((x * 8, y * 8, x * 8 + 8, y * 8 + 8)))
            row.append(tid)
        result.append(row)
    return result


def space_tiles(atlas):
    for tid, points in enumerate(([], [(2, 3, 2)], [(5, 1, 1), (1, 6, 1)], [(2, 3, 3), (1, 3, 1), (3, 3, 1), (2, 2, 1), (2, 4, 1)], [(6, 5, 1)], [(3, 6, 2)], [(5, 2, 1), (6, 3, 1)], [])):
        im = canvas(8, 8)
        for x, y, v in points:
            im.putpixel((x, y), v)
        tile(atlas, tid, im)


orbital = canvas(64, 64)
space_tiles(orbital)
ruin = canvas(32, 32)
d = ImageDraw.Draw(ruin)
d.polygon([(3, 0), (27, 0), (31, 4), (31, 27), (27, 31), (4, 31), (0, 27), (0, 4)], fill=1)
d.line((4, 1, 26, 1), fill=2)
d.line((1, 4, 1, 26), fill=2)
d.rectangle((5, 5, 26, 26), fill=0)
d.rectangle((7, 7, 24, 24), fill=1)
d.rectangle((10, 10, 21, 21), fill=0)
d.line((9, 8, 23, 8), fill=2)
d.line((8, 9, 8, 23), fill=2)
d.rectangle((13, 13, 18, 18), fill=1)
d.rectangle((14, 14, 17, 17), fill=2)
d.point([(4, 4), (27, 4), (4, 27), (27, 27)], fill=2)
ruin_ids = block(orbital, 8, ruin)
arch = canvas(32, 16)
d = ImageDraw.Draw(arch)
d.rectangle((0, 2, 31, 13), fill=1)
d.line((0, 2, 31, 2), fill=2)
d.rectangle((0, 5, 31, 10), fill=0)
for x in (3, 11, 19, 27):
    d.rectangle((x, 4, x + 1, 11), fill=1)
arch_ids = block(orbital, 12, arch)
for tid, flip in ((40, False), (41, True)):
    p = canvas(8, 8)
    d = ImageDraw.Draw(p)
    d.rectangle((1, 0, 5, 7), fill=1)
    d.line((1, 0, 1, 7), fill=2)
    d.line((3, 0, 3, 7), fill=0)
    tile(orbital, tid, mirrored(p) if flip else p)
for tid in (42, 43, 44, 45):
    p = canvas(8, 8)
    d = ImageDraw.Draw(p)
    d.polygon([(1, 1), (5, 0), (7, 3), (5, 6), (2, 5)], fill=1)
    d.line((2, 1, 4, 1), fill=2)
    tile(orbital, tid, p.rotate((tid - 42) * 90))
ROLES["orbital-tiles"] = {"space": [0, 0, 0, 0, 1, 2, 4, 5], "brightStar": 3, "ruinModule": ruin_ids, "ruinBridge": arch_ids, "verticalRail": [40, 41], "debris": [42, 43, 44, 45], "description": "黒い航路を広く保ち、左右に32×32遺跡モジュールと16px高ブリッジを疎に配置。"}
asset("orbital-tiles", "背景01 / ORBITAL RUINS", [orbital], "space", "tileset", duration=1)

carrier = canvas(64, 64)
space_tiles(carrier)
# Fill tiles are mostly dark. Long seam pieces form big plates without noise.
for tid in range(8, 16):
    p = canvas(8, 8, 1)
    d = ImageDraw.Draw(p)
    if tid == 9:
        d.line((0, 0, 7, 0), fill=2)
        d.line((0, 1, 7, 1), fill=0)
    if tid == 10:
        d.line((0, 0, 0, 7), fill=2)
        d.line((1, 0, 1, 7), fill=0)
    if tid == 11:
        d.line((0, 0, 7, 0), fill=2)
        d.line((0, 0, 0, 7), fill=2)
        d.point((3, 3), fill=0)
    if tid == 12:
        d.line((0, 6, 7, 6), fill=0)
        d.line((0, 7, 7, 7), fill=2)
    if tid == 13:
        d.rectangle((2, 0, 5, 7), fill=0)
        d.line((2, 0, 2, 7), fill=2)
    if tid == 14:
        d.rectangle((2, 0, 5, 7), fill=0)
        d.rectangle((3, 1, 4, 3), fill=2)
    if tid == 15:
        d.line((0, 7, 7, 0), fill=2)
        d.line((0, 6, 6, 0), fill=0)
    tile(carrier, tid, p)
deck = canvas(32, 32, 1)
d = ImageDraw.Draw(deck)
d.rectangle((0, 0, 31, 31), outline=0)
d.line((2, 2, 29, 2), fill=2)
d.line((2, 2, 2, 29), fill=2)
d.rectangle((5, 6, 26, 25), fill=0)
d.rectangle((7, 8, 24, 23), fill=1)
for y in (10, 14, 18):
    d.line((9, y, 22, y), fill=2)
    d.line((9, y + 1, 22, y + 1), fill=0)
for x, y in ((3, 3), (28, 3), (3, 28), (28, 28)):
    d.point((x, y), fill=2)
deck_ids = block(carrier, 16, deck)
runway = canvas(32, 16, 1)
d = ImageDraw.Draw(runway)
d.rectangle((0, 0, 31, 15), fill=0)
d.line((0, 1, 31, 1), fill=2)
d.line((0, 14, 31, 14), fill=1)
for x in (2, 10, 18, 26):
    d.polygon([(x, 4), (x + 3, 4), (x + 6, 10), (x + 3, 10)], fill=1)
runway_ids = block(carrier, 20, runway)
ROLES["carrier-tiles"] = {"space": [0, 1, 2, 4], "deck": 8, "topSeam": 9, "leftSeam": 10, "corner": 11, "bottomSeam": 12, "verticalRail": 13, "railLamp": 14, "diagonal": 15, "ventModule": deck_ids, "hazardBand": runway_ids, "description": "左右の甲板を濃いグレーの大きな面で構成。中央は0または8を広く使い、レール13/14を縦方向に連結。"}
asset("carrier-tiles", "背景02 / DREADNOUGHT DECK", [carrier], "carrier", "tileset", duration=1)

reactor = canvas(64, 64)
space_tiles(reactor)
for tid in range(8, 16):
    p = canvas(8, 8, 0)
    d = ImageDraw.Draw(p)
    if tid == 8:
        p = canvas(8, 8, 1)
    if tid in (9, 10, 11):
        d.rectangle((1, 0, 6, 7), fill=1)
        d.line((1, 0, 1, 7), fill=2)
        d.line((4, 0, 4, 7), fill=0)
        if tid == 10:
            d.line((0, 3, 7, 3), fill=2)
        if tid == 11:
            d.rectangle((3, 2, 4, 5), fill=2)
    if tid == 12:
        d.rectangle((0, 1, 7, 6), fill=1)
        d.line((0, 1, 7, 1), fill=2)
        d.line((0, 4, 7, 4), fill=0)
    if tid == 13:
        d.rectangle((1, 1, 7, 7), fill=1)
        d.line([(1, 7), (1, 1), (7, 1)], fill=2)
        d.line([(4, 7), (4, 4), (7, 4)], fill=0)
    if tid == 14:
        d.rectangle((1, 0, 6, 7), fill=1)
        d.rectangle((2, 1, 5, 6), fill=2)
        d.line((3, 2, 3, 5), fill=3)
    if tid == 15:
        d.polygon([(0, 7), (7, 0), (7, 4), (4, 7)], fill=1)
        d.line((1, 7, 7, 1), fill=2)
    tile(reactor, tid, p)
core = canvas(32, 32)
d = ImageDraw.Draw(core)
d.polygon([(8, 0), (23, 0), (31, 8), (31, 23), (23, 31), (8, 31), (0, 23), (0, 8)], fill=1)
d.polygon([(9, 2), (22, 2), (29, 9), (29, 22), (22, 29), (9, 29), (2, 22), (2, 9)], outline=2)
d.polygon([(10, 6), (21, 6), (25, 10), (25, 21), (21, 25), (10, 25), (6, 21), (6, 10)], fill=0)
d.rectangle((11, 10, 20, 21), fill=1)
d.rectangle((13, 12, 18, 19), fill=2)
d.line((14, 13, 14, 18), fill=3)
core_ids = block(reactor, 16, core)
ribs = canvas(32, 16)
d = ImageDraw.Draw(ribs)
for x in range(0, 32, 8):
    d.polygon([(x, 0), (x + 3, 0), (x + 7, 15), (x + 4, 15)], fill=1)
    d.line((x, 0, x + 4, 15), fill=2)
ribs_ids = block(reactor, 20, ribs)
ROLES["reactor-tiles"] = {"void": 0, "wall": 8, "verticalConduit": 9, "conduitJoint": 10, "conduitPulse": 11, "horizontalConduit": 12, "conduitCorner": 13, "energyCell": 14, "diagonal": 15, "reactorModule": core_ids, "ribBand": ribs_ids, "description": "黒い中央航路の左右に9/10/11の配管、32×32炉心を交互に配置。発光セル14は画面内2個程度に抑える。"}
asset("reactor-tiles", "背景03 / HELIX REACTOR", [reactor], "reactor", "tileset", duration=1)


FONT = {
    "N": ["10001", "11001", "11001", "10101", "10011", "10011", "10001"],
    "O": ["01110", "11011", "11011", "11011", "11011", "11011", "01110"],
    "V": ["11011", "11011", "11011", "11011", "11011", "01110", "00100"],
    "A": ["01110", "11011", "11011", "11111", "11011", "11011", "11011"],
    "S": ["01111", "11000", "11000", "01110", "00011", "00011", "11110"],
    "P": ["11110", "11011", "11011", "11110", "11000", "11000", "11000"],
    "E": ["11111", "11000", "11000", "11110", "11000", "11000", "11111"],
    "R": ["11110", "11011", "11011", "11110", "11100", "11010", "11011"],
}


def logo(im, text, x, y):
    d = ImageDraw.Draw(im)
    # Each letter occupies a 16×16 cell, making tile reuse predictable.
    for i, c in enumerate(text):
        for yy, row in enumerate(FONT[c]):
            for xx, v in enumerate(row):
                if v == "1":
                    px, py = x + i * 16 + xx * 3, y + yy * 2
                    d.rectangle((px + 1, py + 2, px + 3, py + 3), fill=1)
                    d.rectangle((px, py, px + 2, py + 1), fill=3 if yy < 3 else 2)


def stars_screen():
    im = canvas(160, 144)
    for tx, ty, tid in ((1, 1, 1), (16, 1, 2), (18, 4, 1), (2, 7, 2), (16, 8, 1), (1, 12, 2), (18, 12, 1), (6, 10, 4), (13, 10, 4)):
        im.paste(orbital.crop((tid * 8, 0, tid * 8 + 8, 8)), (tx * 8, ty * 8))
    return im


title = stars_screen()
logo(title, "NOVA", 48, 16)
logo(title, "SPEAR", 40, 40)
# A bespoke 32×32 insignia reuses the in-game pilot's sharp visual language.
hero = canvas(32, 32)
hero.paste(player, (8, 2))
hd = ImageDraw.Draw(hero)
hd.polygon([(7, 18), (11, 16), (13, 22), (15, 17), (17, 22), (20, 16), (24, 18), (19, 24), (16, 30), (12, 24)], fill=1)
hd.line((13, 19, 15, 28), fill=2)
hd.line((18, 19, 16, 28), fill=3)
title.paste(hero, (64, 64))
# Symmetric orbital wing bars, aligned to the tile grid.
bar = canvas(24, 8)
bd = ImageDraw.Draw(bar)
bd.line((0, 3, 23, 3), fill=1)
bd.line((8, 4, 23, 4), fill=2)
bd.point((3, 3), fill=3)
title.paste(bar, (32, 80))
title.paste(mirrored(bar), (104, 80))
asset("title-art", "タイトル / NOVA SPEAR", [title], "title", "screen", duration=1)

clear = stars_screen()
emblem = canvas(48, 48)
ed = ImageDraw.Draw(emblem)
ed.polygon([(24, 2), (28, 15), (43, 15), (31, 24), (35, 39), (24, 30), (12, 39), (16, 24), (4, 15), (20, 15)], fill=1)
ed.polygon([(24, 6), (27, 17), (38, 17), (29, 23), (32, 34), (24, 27), (16, 34), (19, 23), (10, 17), (21, 17)], fill=2)
emblem.paste(player, (16, 15), player.point(lambda v: 255 if v else 0))
for x in (3, 40):
    ed.line((x + 2, 22, x + 2, 39), fill=2)
    for y in (23, 29, 35):
        ed.polygon([(x, y), (x + 4, y + 4), (x + 4, y + 1)], fill=3)
ed.line((10, 43, 37, 43), fill=2)
clear.paste(emblem, (56, 32))
asset("clear-art", "作戦成功 / RETURN TO ORBIT", [clear], "clear", "screen", duration=1)

over = stars_screen()
distress = canvas(48, 48)
dd = ImageDraw.Draw(distress)
dd.polygon([(23, 1), (46, 41), (1, 41)], outline=1)
dd.line((23, 5, 42, 38), fill=2)
dd.line((4, 38, 17, 38), fill=2)
damaged = player.copy()
ImageDraw.Draw(damaged).rectangle((0, 8, 4, 15), fill=0)
ImageDraw.Draw(damaged).line((7, 6, 9, 10), fill=0)
distress.paste(damaged, (16, 18), damaged.point(lambda v: 255 if v else 0))
dd.point([(12, 30), (10, 34), (31, 33), (29, 36)], fill=2)
over.paste(distress, (56, 32))
asset("gameover-art", "通信途絶 / SIGNAL LOST", [over], "gameover", "screen", duration=1)


def unique_tiles(im):
    return len({im.crop((x, y, x + 8, y + 8)).tobytes() for y in range(0, im.height, 8) for x in range(0, im.width, 8)})


sprite_tiles = sum(a["width"] * a["height"] // 64 * len(a["frames"]) for a in ASSETS if a["kind"] == "sprite")
screen_counts = {name: unique_tiles(im) for name, im in (("title-art", title), ("clear-art", clear), ("gameover-art", over))}
assert sprite_tiles <= 100, sprite_tiles
assert all(n <= 80 for n in screen_counts.values()), screen_counts
manifest = {
    "format": "NOVA SPEAR authored-art manifest 1",
    "provenance": {"author": "NOVA SPEAR project / OpenAI Codex", "license": "CC0-1.0", "source": "Original native pixel geometry and bitmap patterns in art/build_art.py; no third-party game art"},
    "pixelEncoding": {"mode": "P", "grayscale": GRAY, "indexZero": "transparent for sprites, darkest color for backgrounds", "indexOne": "dark outline / dim structure", "indexTwo": "midtone body", "indexThree": "bright highlight", "dmgBGP": "0x1b", "dmgOBP": "0x1b", "antialiasing": False},
    "assets": ASSETS, "tilesetRoles": ROLES,
    "budgets": {"spriteTiles": sprite_tiles, "spriteTileLimit": 128, "screenUniqueTiles": screen_counts, "screenTileLimitIncludingFont": 128},
    "screenTextRegions": {
        "title-art": {"logo": "already painted at x40..119 y16..55", "overlays": [{"x": 16, "y": 104, "text": "START  MISSION"}, {"x": 16, "y": 120, "text": "A FIRE / B FOCUS"}]},
        "clear-art": {"overlays": [{"x": 24, "y": 8, "text": "MISSION CLEAR"}, {"x": 24, "y": 96, "text": "SCORE"}, {"x": 16, "y": 120, "text": "START  REDEPLOY"}]},
        "gameover-art": {"overlays": [{"x": 32, "y": 8, "text": "SIGNAL LOST"}, {"x": 24, "y": 96, "text": "SCORE"}, {"x": 16, "y": 120, "text": "START  RETRY"}]},
    },
}
(ROOT / "art" / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"assets": len(ASSETS), "spriteTiles": sprite_tiles, "screenUniqueTiles": screen_counts}, indent=2))
