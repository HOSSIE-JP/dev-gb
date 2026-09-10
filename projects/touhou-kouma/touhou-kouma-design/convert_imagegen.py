"""Deterministic GB conversion of the six image_gen originals; never regenerates gameplay.
Writes a separate import payload. apply-imagegen.cjs performs a revision-aware save.
Requires Pillow and numpy only for conversion, not ordinary ROM builds.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'converted-art'
OUT.mkdir(exist_ok=True)

def tiles_of(p):
    h, w = p.shape
    return p.reshape(h//8, 8, w//8, 8).transpose(0,2,1,3).reshape(-1,64)

def compress(p, limit):
    tiles = tiles_of(p)
    unique, inverse, counts = np.unique(tiles, axis=0, return_inverse=True, return_counts=True)
    if len(unique) <= limit:
        return unique, inverse, len(unique), 0.0
    u = unique.astype(np.float32)
    # Select representative *actual* tiles; no synthesized seams or blur.
    chosen = [int(np.argmax(counts))]
    dist = ((u-u[chosen[0]])**2).sum(axis=1)
    for _ in range(1, limit):
        idx = int(np.argmax(dist * np.sqrt(counts)))
        chosen.append(idx)
        dist = np.minimum(dist, ((u-u[idx])**2).sum(axis=1))
    centers = u[chosen].copy()
    for _ in range(8):
        ds = ((u[:,None,:]-centers[None,:,:])**2).sum(axis=2)
        labels = ds.argmin(axis=1)
        for k in range(limit):
            ids = np.flatnonzero(labels==k)
            if not len(ids): continue
            mean = np.average(u[ids], axis=0, weights=counts[ids])
            centers[k] = u[ids[((u[ids]-mean)**2).sum(axis=1).argmin()]]
    labels = ((u[:,None,:]-centers[None,:,:])**2).sum(axis=2).argmin(axis=1)
    err = float(np.average(((u-centers[labels])**2).mean(axis=1),weights=counts))
    return centers.astype(np.uint8), labels[inverse], len(unique), err

payload = {'assets':[], 'stages':[], 'report':[]}
game = json.loads((ROOT.parent/'touhou-kouma/assets-src/game.json').read_text())
previews=[]
for idx, name in enumerate(['title']+[f'stage-{i}' for i in range(1,6)]):
    im=Image.open(ROOT/'imagegen-originals'/f'{name}.png').convert('L')
    size=(160,144) if idx==0 else (160,256)
    gray=np.array(im.resize(size,Image.Resampling.BOX))
    levels=[45,122,202] if idx==0 else [30,94,172]
    pixels=np.digitize(gray,levels).astype(np.uint8)
    # Gameplay central floor stays dark; grayscale index zero is transparent only
    # on sprites. BG indices 0/1 are the two dark colors in this project's palettes.
    if idx: pixels[:,56:104]=np.minimum(pixels[:,56:104],1)
    atlas,mapping,before,error=compress(pixels,248 if idx==0 else 104)
    rebuilt=atlas[mapping].reshape(size[1]//8,20,8,8).transpose(0,2,1,3).reshape(size[1],160)
    pal=game['palettes'][idx]['colors'] if idx else game['palettes'][0]['colors']
    rgb=np.array([[int(c[i:i+2],16) for i in (1,3,5)] for c in pal],dtype=np.uint8)
    Image.fromarray(rgb[rebuilt]).save(OUT/f'{name}-gbc.png')
    Image.fromarray(rebuilt*85).save(OUT/f'{name}-dmg.png')
    if idx==0:
        payload['assets'].append({'id':'screen-title','width':160,'height':144,'pixels':rebuilt.ravel().tolist()})
    else:
        # 13 x 8 tiles: 104 BG tiles plus 20 HUD tiles fits the 128-tile budget.
        sheet=atlas.reshape(8,13,8,8).transpose(0,2,1,3).reshape(64,104)
        payload['assets'].append({'id':f'map-{idx}','width':104,'height':64,'pixels':sheet.ravel().tolist()})
        stage=game['stages'][idx-1]
        rows=mapping.reshape(32,20)
        # Retain every original event, camera speed, map height and boss arena.
        full=np.vstack([rows[y%32] for y in range(stage['height'])])
        payload['stages'].append({'id':stage['id'],'tiles':full.ravel().tolist()})
    payload['report'].append({'id':name,'inputUniqueTiles':before,'outputTiles':len(atlas),'meanSquaredIndexError':error,'dimensions':size})
(OUT/'import.json').write_text(json.dumps(payload))
(OUT/'conversion-report.json').write_text(json.dumps(payload['report'],indent=2))
print(json.dumps(payload['report'],indent=2))
