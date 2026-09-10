"""GB 2bpp conversion of Image Gen source art. Does not write game.json.
Generated portraits are cropped by explicit panel coordinates, reduced to GB
resolution, and mapped to the project's four shade indices. Requires Pillow/numpy.
"""
from pathlib import Path
import json, numpy as np
from PIL import Image, ImageOps
r=Path(__file__).resolve().parent; out=r/'converted-v03';out.mkdir(exist_ok=True)
# Reuse only pure tile compression helpers, not the previous import's top-level work.
namespace={};exec((r/'convert_imagegen.py').read_text().split('payload =')[0],{'__file__':str(r/'convert_imagegen.py')},namespace)
# Function globals must include numpy and the tile helper.
compress=namespace['compress'];compress.__globals__.update(namespace)
g=json.loads((r.parent/'touhou-kouma/assets-src/game.json').read_text())
ids=['reimu','meiling','patchouli','sakuya','remilia','flandre']; payload={'assets':[],'stages':[]}; portraits={}
mini={'meiling':(0,530,198,752),'patchouli':(0,850,172,1086),'sakuya':(0,780,240,1086),'remilia':(0,785,258,1086),'flandre':(0,805,245,1086)}
def indexed(im,size):
    a=np.array(im.convert('L'));ys,xs=np.where(a>32)
    if len(xs):im=im.crop((int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1))
    im=ImageOps.contain(im,size,Image.Resampling.BOX)
    canvas=Image.new('L',size,0);canvas.paste(im,((size[0]-im.width)//2,size[1]-im.height))
    return np.digitize(np.array(canvas),[38,108,190]).astype(np.uint8)
def asset(id,p,kind='screen',palette=0):
    payload['assets'].append({'id':id,'width':p.shape[1],'height':p.shape[0],'kind':kind,'palette':palette,'pixels':p.ravel().tolist()})
    colors=np.array([[int(c[i:i+2],16) for i in (1,3,5)] for c in g['palettes'][palette]['colors']],dtype=np.uint8)
    Image.fromarray(colors[p]).resize((p.shape[1]*3,p.shape[0]*3),Image.Resampling.NEAREST).save(out/(id+'-preview.png'))
for i,id in enumerate(ids):
    im=Image.open(r/'imagegen-v03'/f'{id}.png').convert('L');left=im.crop((0,0,im.width//2,im.height));right=im.crop((im.width//2,0,im.width,im.height))
    if id in mini:
        box=mini[id];sm=im.crop(box);left.paste(0,box);asset(id,indexed(sm,(24,24)),'sprite',i)
    portraits[id]=[indexed(left,(64,88)),indexed(right,(64,80))]
    for j,p in enumerate(portraits[id]):Image.fromarray(p*85).save(out/f'{id}-portrait-{j}.png')
for i,id in enumerate(ids[1:],1):
    for name,variant in [('dialogue',0),('result',1)]:
        p=np.zeros((144,160),dtype=np.uint8)
        for x,ch,v in [(8,'reimu',variant),(88,id,variant)]:
            q=portraits[ch][v];p[96-q.shape[0]:96,x:x+64]=q
        asset(f'{name}-{i}',p,palette=0)
    # Retain the generated side art; the center uses its own Image Gen source.
    im=Image.open(r/'imagegen-originals'/f'stage-{i}.png').convert('L').resize((160,256),Image.Resampling.BOX)
    p=np.digitize(np.array(im),[30,94,172]).astype(np.uint8)
    texture=np.array(Image.open(r/'imagegen-v03'/f'center-{i}.png').convert('L').resize((32,16),Image.Resampling.BOX))
    texture=(texture>30).astype(np.uint8)
    # Artwork is low contrast (indices 0/1), so shots retain the brightest shades.
    p[:,48:112]=np.tile(texture,(16,2))
    p[:,48:112]=0
    atlas,mapping,before,error=compress(p,96)
    if len(atlas)<96:atlas=np.vstack((atlas,np.zeros((96-len(atlas),64),dtype=np.uint8)))
    central=texture.reshape(2,8,4,8).transpose(0,2,1,3).reshape(8,64)
    atlas=np.vstack((atlas,central))
    rows=mapping.reshape(32,20)
    for y in range(32):
        for x in range(6,14):rows[y,x]=96+(y%2)*4+(x-6)%4
    sheet=atlas.reshape(8,13,8,8).transpose(0,2,1,3).reshape(64,104)
    asset(f'map-{i}',sheet,'tileset',i)
    stage=g['stages'][i-1];full=np.vstack([rows[y%32] for y in range(stage['height'])])
    payload['stages'].append({'id':stage['id'],'tiles':full.ravel().tolist(),'parallax':{'enabled':True,'firstTile':96,'width':4,'height':2,'divisor':2}})
    rebuilt=atlas[rows.ravel()].reshape(32,20,8,8).transpose(0,2,1,3).reshape(256,160);Image.fromarray(rebuilt*85).save(out/f'stage-{i}-dmg.png')
(out/'import.json').write_text(json.dumps(payload));print('Prepared',len(payload['assets']),'assets')

# Reimu has a separate, two-frame flying source sheet.
im=Image.open(r/'imagegen-v03/reimu-sprite.png').convert('L');frames=[]
for n in range(2):
    q=im.crop((n*im.width//2,0,(n+1)*im.width//2,im.height));a=np.array(q);ys,xs=np.where(a>35)
    q=q.crop((int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1)).resize((16,24),Image.Resampling.BOX)
    frames.append(np.digitize(np.array(q),[30,105,185]).astype(np.uint8).ravel().tolist())
(out/'reimu-frames.json').write_text(json.dumps(frames))
