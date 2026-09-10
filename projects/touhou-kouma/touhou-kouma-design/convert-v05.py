from pathlib import Path
import json,numpy as np
from PIL import Image,ImageOps
r=Path(__file__).resolve().parent;out=r/'imagegen-v05'
ns={};exec((r/'convert_imagegen.py').read_text().split('payload =')[0],{'__file__':str(r/'convert_imagegen.py')},ns);compress=ns['compress'];compress.__globals__.update(ns)
def shrink(im,size):
 a=np.array(im.convert('L'));y,x=np.where(a>32)
 if len(x): im=im.crop((int(x.min()),int(y.min()),int(x.max())+1,int(y.max())+1))
 im=ImageOps.contain(im,size,Image.Resampling.BOX);p=Image.new('L',size,0);p.paste(im,((size[0]-im.width)//2,size[1]-im.height));return np.digitize(np.array(p),[38,108,190]).astype(np.uint8)
def packed(p,limit):
 atlas,mapping,_,_=compress(p,limit);h,w=p.shape
 return atlas[mapping].reshape(h//8,w//8,8,8).transpose(0,2,1,3).reshape(h,w)
assets={};im=Image.open(out/'cirno-sheet.png').convert('L');w,h=im.size
portraits=[shrink(im.crop((0,0,610,h)),(64,88)),shrink(im.crop((630,0,1150,h)),(64,80))]
assets['cirno']=shrink(im.crop((1190,200,w,750)),(24,24))
for i,label in enumerate(['dialogue','result']):
 p=np.zeros((144,160),dtype=np.uint8);q=np.array(Image.open(r/f'converted-v03/reimu-portrait-{i}.png'))//85;p[96-q.shape[0]:96,8:72]=q
 q=portraits[i];p[96-q.shape[0]:96,88:152]=q;assets[label+'-cirno']=p
for name in ['ending-cirno','ending-meiling-patchouli','ending-sakuya-remilia','ending-flandre']:
 if not (out/(name+'.png')).exists():continue
 p=np.digitize(np.array(Image.open(out/(name+'.png')).convert('L').resize((160,144),Image.Resampling.BOX)),[38,112,200]).astype(np.uint8)
 # Preserve eyes and mouths exactly; compress the surrounding hair/outfit first.
 face=p[48:104,24:136].copy();p[48:104,24:136]=0;p=packed(p,145);p[48:104,24:136]=face
 assets[name]=p
if (out/'lake.png').exists():
 p=np.digitize(np.array(Image.open(out/'lake.png').convert('L').resize((160,256),Image.Resampling.BOX)),[32,102,180]).astype(np.uint8)
 texture=np.array(Image.open(out/"lake.png").convert("L").resize((160,256),Image.Resampling.BOX))[112:128,64:96];texture=(texture>np.percentile(texture,70)).astype(np.uint8);p[:,48:112]=0
 atlas,mapping,_,_=compress(p,96)
 if len(atlas)<96:atlas=np.vstack((atlas,np.zeros((96-len(atlas),64),dtype=np.uint8)))
 atlas=np.vstack((atlas,texture.reshape(2,8,4,8).transpose(0,2,1,3).reshape(8,64)))
 rows=mapping.reshape(32,20)
 for y in range(32):
  for x in range(6,14):rows[y,x]=96+(y%2)*4+(x-6)%4
 assets['map-lake']=atlas.reshape(8,13,8,8).transpose(0,2,1,3).reshape(64,104)
 (out/'lake-map.json').write_text(json.dumps(rows.ravel().tolist()))
for name,p in assets.items():Image.fromarray(p*85).resize((p.shape[1]*3,p.shape[0]*3),Image.Resampling.NEAREST).save(out/(name+'-gb.png'))
(out/'pixels.json').write_text(json.dumps({name:{'width':p.shape[1],'height':p.shape[0],'pixels':p.ravel().tolist()} for name,p in assets.items()}));print(list(assets))
