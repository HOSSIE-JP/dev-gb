from pathlib import Path
import json
import numpy as np
from PIL import Image
r=Path(__file__).resolve().parent
ns={};exec((r/'convert_imagegen.py').read_text().split('payload =')[0],{'__file__':str(r/'convert_imagegen.py')},ns)
compress=ns['compress'];compress.__globals__.update(ns)
p=np.digitize(np.array(Image.open(r/'imagegen-v04/ending.png').convert('L').resize((160,144),Image.Resampling.BOX)),[38,112,200]).astype(np.uint8)
face=p[40:96,40:120].copy()
p[40:96,40:120]=0
atlas,mapping,before,error=compress(p,162)
p=atlas[mapping].reshape(18,20,8,8).transpose(0,2,1,3).reshape(144,160)
p[40:96,40:120]=face
(r/'imagegen-v04/ending-pixels.json').write_text(json.dumps(p.ravel().tolist()))
Image.fromarray(p*85).resize((640,576),Image.Resampling.NEAREST).save(r/'imagegen-v04/ending-gb-preview.png')
(r/'imagegen-v04/conversion.json').write_text(json.dumps({'inputTiles':before,'outputTiles':len(atlas),'error':error},indent=2))
