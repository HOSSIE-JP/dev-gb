#!/usr/bin/env python3
"""Create first-draft indexed assets and game data; never overwrite an edited project.
Run with Python 3.10+ and Pillow, then the actual project-store createProject API.
No downloaded artwork, font file, original Touhou audio, or game assets are used.
"""
from pathlib import Path
import argparse, json, math, random
from PIL import Image, ImageDraw

ID='touhou-kouma'
TITLE='SCARLET PILGRIMAGE'
NAMES=['紅美鈴','パチュリー・ノーレッジ','十六夜咲夜','レミリア・スカーレット','フランドール・スカーレット']
BOSSES=['meiling','patchouli','sakuya','remilia','flandre']
STAGES=['紅魔館・花の門','地下大図書館','月時計の回廊','紅月の屋上','封印された地下室']
# Hand-authored 5x7 raster letters, stored as drawing code (not a font binary).
LETTERS={
'A':['01110','10001','10001','11111','10001','10001','10001'],
'B':['11110','10001','10001','11110','10001','10001','11110'],
'C':['01111','10000','10000','10000','10000','10000','01111'],
'D':['11110','10001','10001','10001','10001','10001','11110'],
'E':['11111','10000','10000','11110','10000','10000','11111'],
'F':['11111','10000','10000','11110','10000','10000','10000'],
'G':['01111','10000','10000','10111','10001','10001','01111'],
'H':['10001','10001','10001','11111','10001','10001','10001'],
'I':['111','010','010','010','010','010','111'],
'J':['00111','00010','00010','00010','10010','10010','01100'],
'K':['10001','10010','10100','11000','10100','10010','10001'],
'L':['10000','10000','10000','10000','10000','10000','11111'],
'M':['10001','11011','10101','10101','10001','10001','10001'],
'N':['10001','11001','10101','10011','10001','10001','10001'],
'O':['01110','10001','10001','10001','10001','10001','01110'],
'P':['11110','10001','10001','11110','10000','10000','10000'],
'Q':['01110','10001','10001','10001','10101','10010','01101'],
'R':['11110','10001','10001','11110','10100','10010','10001'],
'S':['01111','10000','10000','01110','00001','00001','11110'],
'T':['11111','00100','00100','00100','00100','00100','00100'],
'U':['10001','10001','10001','10001','10001','10001','01110'],
'V':['10001','10001','10001','10001','10001','01010','00100'],
'W':['10001','10001','10001','10101','10101','10101','01010'],
'X':['10001','10001','01010','00100','01010','10001','10001'],
'Y':['10001','10001','01010','00100','00100','00100','00100'],
'Z':['11111','00001','00010','00100','01000','10000','11111'],
'0':['01110','10001','10011','10101','11001','10001','01110'],
'1':['010','110','010','010','010','010','111'],
'2':['01110','10001','00001','00110','01000','10000','11111'],
'3':['11110','00001','00001','01110','00001','00001','11110'],
'4':['00010','00110','01010','10010','11111','00010','00010'],
'5':['11111','10000','10000','11110','00001','00001','11110'],
'6':['01110','10000','10000','11110','10001','10001','01110'],
'7':['11111','00001','00010','00100','01000','01000','01000'],
'8':['01110','10001','10001','01110','10001','10001','01110'],
'9':['01110','10001','10001','01111','00001','00001','01110'],
'-':['000','000','000','111','000','000','000'],
'/':['00001','00001','00010','00100','01000','10000','10000'],
'.':['0','0','0','0','0','1','1'],
'!':['1','1','1','1','1','0','1'],
' ':['000']*7,
}
def txt(im,text,y,color=3,scale=1,x=None):
    width=sum(len(LETTERS.get(c,LETTERS[' '])[0])+1 for c in text)*scale-scale
    x=(im.width-width)//2 if x is None else x
    d=ImageDraw.Draw(im)
    for ch in text:
        glyph=LETTERS.get(ch,LETTERS[' ']); w=len(glyph[0])
        for gy,row in enumerate(glyph):
            for gx,v in enumerate(row):
                if v=='1': d.rectangle((x+gx*scale,y+gy*scale,x+(gx+1)*scale-1,y+(gy+1)*scale-1),fill=color)
        x+=(w+1)*scale

def img(w,h): return Image.new('L',(w,h),0)
def pix(im): return list(im.get_flattened_data()) if hasattr(im, "get_flattened_data") else list(im.getdata())
def frame_asset(aid,name,images,kind='sprite',palette=0,hit=None,emit=None,duration=10):
    w,h=images[0].size
    return dict(id=aid,name=name,kind=kind,width=w,height=h,palette=palette,
        origin={'x':w//2,'y':h//2},hitbox=hit or {'x':1,'y':1,'w':w-2,'h':h-2},
        emitters=emit if emit is not None else [{'x':w//2,'y':h-2}],
        frames=[dict(id=f'{aid}-{i}',image=f'images/{aid}-{i}.png',duration=duration,pixels=pix(im)) for i,im in enumerate(images)])

def reimu(frame):
    im=img(16,24);d=ImageDraw.Draw(im)
    # Upward flight: back of head, horizontal red bow, trailing skirt, no side-facing nose.
    d.ellipse((4,3,11,13),fill=1)
    d.polygon([(1,3),(6,4),(8,6),(3,7),(0,6)],fill=2)
    d.polygon([(14,3),(9,4),(7,6),(12,7),(15,6)],fill=2)
    d.line((1,3,3,5,5,4),fill=3); d.line((14,3,12,5,10,4),fill=3)
    d.rectangle((6,4,9,7),fill=2); d.point((7,5),fill=3)
    d.polygon([(4,10),(11,10),(12,16),(14,20),(10,22),(7,21),(3,22),(1,20),(3,16)],fill=1)
    d.polygon([(4,12),(11,12),(11,16),(13,20),(9,20),(7,19),(3,20),(4,16)],fill=2)
    arm=frame
    d.polygon([(3,10),(1,11+arm),(0,16+arm),(3,17),(5,13)],fill=3)
    d.polygon([(12,10),(14,11-arm),(15,16-arm),(12,17),(10,13)],fill=3)
    d.line((1,14+arm,3,15),fill=2); d.line((12,14,14,14-arm),fill=2)
    d.rectangle((5,7,10,12),fill=1);d.line((5,12,6,13,9,13,10,12),fill=1)
    d.line((4,20,7,21,10,20,12,21),fill=3)
    d.point((5,23),fill=3);d.point((10,23),fill=3)
    return im

def boss(which,frame=0):
    im=img(24,24);d=ImageDraw.Draw(im)
    if which in (3,4):
        wy=7 if frame==0 else 10
        if which==3:
            d.polygon([(8,11),(3,wy),(0,wy-3),(1,16),(4,14),(6,17),(9,14)],fill=2)
            d.polygon([(15,11),(20,wy),(23,wy-3),(22,16),(19,14),(17,17),(14,14)],fill=2)
            d.line((1,wy+1,4,12,6,14),fill=3);d.line((22,wy+1,19,12,17,14),fill=3)
        else:
            d.line((8,11,1,wy,0,wy-3),fill=1,width=1);d.line((15,11,22,wy,23,wy-3),fill=1)
            for x,y,c in [(1,wy+3,2),(4,wy+5,3),(6,wy+6,2),(22,wy+3,3),(19,wy+5,2),(17,wy+6,3)]:
                d.polygon([(x,y-2),(x+1,y),(x,y+2),(x-1,y)],fill=c)
    # body, sleeves, face
    d.polygon([(8,12),(15,12),(18,21),(15,22),(8,22),(5,21)],fill=1)
    d.polygon([(9,13),(14,13),(16,20),(7,20)],fill=2)
    d.rectangle((8,5,15,12),fill=3)
    hair=1 if which in (0,3) else 2
    d.polygon([(7,4),(9,2),(14,2),(17,5),(17,12),(15,14),(14,7),(12,6),(10,8),(8,7),(8,13),(6,12)],fill=hair)
    d.point((10,9),fill=1);d.point((13,9),fill=1);d.line((11,11,12,11),fill=2)
    d.rectangle((8,22,10,23),fill=1);d.rectangle((13,22,15,23),fill=1)
    if which==0: # Meiling: cap/star, long braids, asymmetric Chinese dress slit.
        d.polygon([(6,5),(8,2),(15,2),(17,5)],fill=2);d.line((6,5,17,5),fill=3)
        d.point((11,2),fill=3);d.line((10,3,12,3),fill=3);d.point((11,4),fill=3)
        d.line((6,10,5,13,6,16,5,18),fill=2);d.line((17,10,18,13,17,16,18,18),fill=2)
        d.rectangle((6,13,8,15),fill=3);d.rectangle((15,13,17,15),fill=3)
        d.line((11,13,13,15,11,17,13,20),fill=3);d.line((14,18,14,22),fill=3)
    elif which==1: # Patchouli: long hair, crescent bonnet, book and nightdress.
        d.rectangle((5,7,7,19),fill=2);d.rectangle((16,7,18,19),fill=2)
        d.ellipse((6,1,17,6),fill=3);d.line((6,6,17,6),fill=2)
        d.ellipse((10,1,14,5),fill=2);d.ellipse((12,1,15,4),fill=3)
        d.rectangle((8,14,15,18),fill=1);d.rectangle((9,14,11,17),fill=3);d.rectangle((13,14,14,17),fill=3)
        d.line((7,20,16,20),fill=3)
    elif which==2: # Sakuya: white headband, silver bob, apron, knife.
        d.line((7,4,8,2,10,3,12,2,14,3,16,2,17,4),fill=3,width=1)
        d.rectangle((9,13,14,18),fill=3);d.polygon([(9,18),(14,18),(15,20),(8,20)],fill=3)
        d.line((5,13,3,17),fill=3);d.line((18,12,21,9),fill=3);d.point((21,8),fill=3)
        d.line((8,12,10,14),fill=1);d.line((15,12,13,14),fill=1)
    else:
        d.ellipse((6,1,17,6),fill=3);d.line((6,5,17,5),fill=2)
        d.polygon([(14,3),(17,1),(18,4),(16,5),(18,7),(15,6)],fill=2)
        d.rectangle((7,13,9,16),fill=3);d.rectangle((14,13,16,16),fill=3)
        d.line((7,20,9,21,11,20,13,21,16,20),fill=3)
        d.polygon([(10,13),(12,15),(14,13)],fill=3)
        if which==4: d.line((16,7,18,10,17,13),fill=2)
    return im

def small_enemy(kind,frame):
    if kind=='bat':
        im=img(16,8);d=ImageDraw.Draw(im);y=1+frame*2
        d.polygon([(7,3),(3,y),(0,0),(1,6),(4,4),(6,7),(9,7),(11,4),(14,6),(15,0),(12,y),(8,3)],fill=2)
        d.rectangle((6,2,9,6),fill=1);d.point((6,3),fill=3);d.point((9,3),fill=3)
    elif kind=='book':
        im=img(8,8);d=ImageDraw.Draw(im);d.rectangle((1,1,6,6),fill=1)
        d.rectangle((1,2,3,5),fill=3);d.rectangle((4,2,6,5),fill=2);d.line((3,1,3,6),fill=1)
        d.point((6-frame,0),fill=2)
    else:
        im=img(16,16);d=ImageDraw.Draw(im)
        d.ellipse((0,5-frame,6,11),fill=3);d.ellipse((9,5-frame,15,11),fill=3)
        d.ellipse((4,1,11,8),fill=1);d.rectangle((6,3,9,7),fill=3);d.point((6,5),fill=1);d.point((9,5),fill=1)
        d.polygon([(6,8),(9,8),(12,13),(3,13)],fill=2);d.line((5,14,5,15),fill=3);d.line((10,14,10,15),fill=3)
    return im

def projectile(kind):
    im=img(8,8);d=ImageDraw.Draw(im)
    if kind in ('ofuda','focus'):
        d.rectangle((2,0,5,7),fill=1);d.rectangle((3,1,4,6),fill=3)
        d.line((3,2,4,3),fill=2);d.point((3,5),fill=2)
        if kind=='focus':d.line((1,2,1,5),fill=2);d.line((6,2,6,5),fill=2)
    elif kind=='orb':d.ellipse((1,1,6,6),fill=1);d.ellipse((2,2,5,5),fill=3);d.point((4,4),fill=2)
    elif kind=='knife':d.polygon([(4,0),(5,4),(3,5),(3,7),(2,7),(2,4)],fill=3);d.line((1,5,5,5),fill=2)
    elif kind=='star':d.polygon([(3,0),(4,2),(7,3),(5,4),(5,7),(3,5),(0,6),(1,3),(0,1),(3,2)],fill=3);d.point((3,3),fill=2)
    else:d.polygon([(3,0),(6,3),(3,7),(0,3)],fill=1);d.polygon([(3,1),(5,3),(3,5),(1,3)],fill=3)
    return im

def explosion(i):
    im=img(16,16);d=ImageDraw.Draw(im);r=[2,4,6,7,6,7][i]
    if i<2:
        d.ellipse((7-r,7-r,8+r,8+r),fill=3)
        d.line((0,7,15,7),fill=2);d.line((7,0,7,15),fill=2)
    else:
        d.ellipse((7-r,7-r,8+r,8+r),outline=3 if i<4 else 2,width=1)
        for a in range(8):
            x=round(7.5+math.cos(a*math.pi/4+i*.2)*r);y=round(7.5+math.sin(a*math.pi/4+i*.2)*r)
            d.point((x,y),fill=3)
        if i==5:d.rectangle((2,2,13,13),fill=0)
    return im

def tile(kind,n):
    im=img(8,8);d=ImageDraw.Draw(im)
    # Background uses low tones, reserving index 3 for tiny lamps/stars.
    if n==0: return im
    if n==1: d.line((0,7,7,7),fill=1);d.line((3,0,3,6),fill=1)
    elif n==2: d.rectangle((0,0,7,7),outline=1);d.point((3,3),fill=1)
    elif n==3: d.line((0,3,7,3),fill=1);d.line((1,0,1,3),fill=1);d.line((5,4,5,7),fill=1)
    elif n==4: d.line((1,0,1,7),fill=2);d.line((6,0,6,7),fill=1)
    elif n==5: d.line((0,1,7,1),fill=2);d.line((0,6,7,6),fill=1)
    elif n==6: d.rectangle((1,0,6,7),fill=1);d.line((2,0,2,7),fill=2)
    elif n==7: d.rectangle((0,2,7,5),fill=1);d.line((0,2,7,2),fill=2)
    elif n==8:
        d.ellipse((2,1,5,5),fill=2);d.point((3,2),fill=3);d.line((3,6,3,7),fill=1)
    elif n==9: d.line((0,7,7,0),fill=1)
    elif n==10: d.line((0,0,7,7),fill=1)
    elif n==11: d.rectangle((1,1,6,6),fill=1);d.rectangle((3,3,4,4),fill=2)
    elif n==12: d.polygon([(3,0),(7,4),(3,7),(0,4)],outline=1)
    elif n==13: d.point((1,1),fill=1);d.point((6,4),fill=1)
    elif n==14: d.line((0,3,2,2,5,3,7,2),fill=1)
    elif n==15: d.line((0,5,7,5),fill=1);d.line((2,1,5,1),fill=1)
    elif n in (16,17,18,19):
        if kind==0: # roses, leaves, rail posts
            if n==16:d.ellipse((0,1,7,7),fill=1);d.line((1,4,6,2),fill=2)
            if n==17:d.ellipse((2,1,5,4),fill=2);d.point((3,2),fill=3);d.line((3,5,3,7),fill=1)
            if n==18:d.line((1,1,1,7),fill=2);d.line((5,1,5,7),fill=2);d.line((0,4,7,4),fill=1)
            if n==19:d.line((0,2,7,2),fill=2);d.line((0,6,7,6),fill=1)
        elif kind==1: # books with four visibly different spine arrangements
            d.line((0,7,7,7),fill=2)
            for j in range(3):
                x=j*3;h=(j+n)%3+3;d.rectangle((x,6-h,x+1,6),fill=1+(j+n)%2)
        elif kind==2: # clockwork / checker tiles
            if n==16:d.ellipse((0,0,7,7),outline=2);d.line((3,3,3,1),fill=2);d.line((3,3,5,4),fill=2)
            if n==17:d.rectangle((0,0,3,3),fill=1);d.rectangle((4,4,7,7),fill=1)
            if n==18:d.rectangle((2,0,5,7),fill=1);d.line((3,0,3,7),fill=2)
            if n==19:d.ellipse((1,1,6,6),outline=1);d.line((0,3,7,3),fill=1);d.line((3,0,3,7),fill=1)
        elif kind==3: # roof shingles, stars and clouds
            if n==16:d.line((0,3,3,0,7,4),fill=1);d.line((0,7,3,4,7,7),fill=1)
            if n==17:d.line((3,1,3,5),fill=2);d.line((1,3,5,3),fill=2);d.point((3,3),fill=3)
            if n==18:d.line((0,6,2,4,4,4,6,2,7,2),fill=1)
            if n==19:d.rectangle((0,0,7,7),fill=1);d.line((1,0,1,7),fill=2)
        else: # iron lattice, crystal sigils and sealed stone
            if n==16:d.line((0,0,7,7),fill=1);d.line((7,0,0,7),fill=1)
            if n==17:d.polygon([(3,0),(6,3),(3,7),(0,3)],outline=2);d.point((3,3),fill=3)
            if n==18:d.line((2,0,2,7),fill=2);d.line((5,0,5,7),fill=1);d.line((2,3,5,3),fill=2)
            if n==19:d.line((0,0,2,2,1,4,4,7),fill=1)
    elif n in (20,21,22,23):
        # Window quadrants: arches plus diamond stained-glass pattern.
        dx=(n-20)%2;dy=(n-20)//2
        for y in range(8):
            for x in range(8):
                xx=x+dx*8;yy=y+dy*8
                if abs(xx-7.5)<(yy/2+2 if yy<8 else 7):
                    if xx in (1,7,8,14) or yy in (7,8,14):im.putpixel((x,y),2)
                    elif (xx+yy)%7==0:im.putpixel((x,y),1)
    elif n==24:d.rectangle((0,0,7,7),fill=1)
    elif n==25:d.rectangle((0,0,7,7),fill=2)
    elif n==26:d.line((0,0,7,0),fill=2);d.line((0,4,7,4),fill=1)
    elif n==27:d.line((0,1,7,1),fill=1);d.line((0,7,7,7),fill=2)
    elif n==28:d.rectangle((0,0,7,7),outline=2);d.line((2,2,5,5),fill=1)
    elif n==29:d.point((1,2),fill=2);d.point((6,6),fill=1)
    elif n==30:d.line((3,0,3,7),fill=1);d.line((0,3,7,3),fill=1)
    elif n==31:d.polygon([(3,1),(6,3),(3,6),(1,3)],outline=1);d.point((3,3),fill=2)
    return im

def background(which,bossframe):
    height=math.ceil(((bossframe-64)*.625+136)/8)
    tiles=[tile(which,i) for i in range(32)]
    atlas=img(64,32)
    for i,t in enumerate(tiles):atlas.paste(t,((i%8)*8,(i//8)*8))
    m=[[0]*20 for _ in range(height)];rng=random.Random(4200+which)
    for y in range(height):
        for x in range(20):
            if which==0:
                m[y][x]=1 if 7<=x<=12 else (16 if x in (0,1,18,19) else 13)
                if x in (6,13):m[y][x]=4
                if x in (3,16) and y%11==0:m[y][x]=17
                if 34<y<57 and 2<=x<=5:m[y][x]=14 if y%2 else 15
                if 92<y<113 and 14<=x<=17:m[y][x]=14
                if y%36 in (0,1) and x not in (7,8,9,10,11,12):m[y][x]=19 if y%36==0 else 18
            elif which==1:
                m[y][x]=2 if 5<=x<=14 else 16+(x+y)%4
                if x in (4,15):m[y][x]=6
                if y%40 in (0,1,2) and 7<=x<=12:m[y][x]=7 if y%40==0 else 24
                if y%40==20 and x in (7,12):m[y][x]=8
                if 70<y<90 and 7<=x<=12:m[y][x]=12
            elif which==2:
                m[y][x]=17 if (x+y)%2 else 0
                if x<3 or x>16:m[y][x]=3
                if x in (3,16):m[y][x]=18
                if y%28==0 and x in (1,18):m[y][x]=16
                if y%56<6 and 6<=x<=13:m[y][x]=5 if y%56 in (0,5) else 19
                if 9<=x<=10:m[y][x]=13
            elif which==3:
                m[y][x]=16 if 4<=x<=15 else 0
                if x in (3,16):m[y][x]=19
                if x in (0,1,18,19) and (y*7+x*3)%23==0:m[y][x]=17
                if y%24 in (1,2) and (x<3 or x>16):m[y][x]=18
                if y%47<3 and 4<=x<=15:m[y][x]=26
                if y<22 and 6<=x<=13:m[y][x]=2
            else:
                m[y][x]=3 if x<4 or x>15 else (13 if y%4 else 19)
                if x in (3,16):m[y][x]=18
                if x in (1,18) and y%12==0:m[y][x]=17
                if y%44<8 and 6<=x<=13:m[y][x]=16 if (x+y)%3 else 12
                if y%44==9 and x in (5,14):m[y][x]=8
        # Discrete gateways/windows mark progress instead of one repeated strip.
        if y in (height-28,height//2,28):
            for x in range(2,18):
                if x not in (8,9,10,11):m[y][x]=5
    # Final encounter dais: columns, arched stained glass, quiet central floor.
    for y in range(0,20):
        for x in range(4,16):m[y][x]=0 if which==3 else 2
        m[y][3]=6;m[y][16]=6
    for x in (5,13):
        m[3][x]=20;m[3][x+1]=21;m[4][x]=22;m[4][x+1]=23
        m[8][x]=8
    for x in range(4,16):m[15][x]=26
    flat=sum(m,[])
    return atlas, height, flat

def screen(kind):
    im=img(160,144);d=ImageDraw.Draw(im)
    d.rectangle((2,2,157,141),outline=1);d.line((7,5,152,5),fill=2)
    if kind=='title':
        d.ellipse((100,42,139,81),fill=2);d.ellipse((108,41,142,76),fill=0)
        for x,y in [(19,60),(43,49),(87,58),(146,37),(149,85)]:d.point((x,y),fill=3)
        # Original gothic silhouette, no original game art.
        d.rectangle((12,85,146,108),fill=1)
        for x,h in [(20,23),(43,34),(75,18),(105,28),(134,40)]:
            d.rectangle((x-6,85-h,x+6,95),fill=1)
            d.polygon([(x-9,85-h),(x,73-h),(x+9,85-h)],fill=2)
            d.rectangle((x-1,87-h,x+1,92-h),fill=2)
        txt(im,'TOUHOU',11,2,2);txt(im,'SCARLET',31,3,1);txt(im,'PILGRIMAGE',41,3,1)
        p=reimu(0).resize((32,48),Image.Resampling.NEAREST)
        mask=p.point(lambda v:255 if v else 0)
        im.paste(p,(65,63),mask)
        txt(im,'REIMU / FIVE NIGHTS',114,2);txt(im,'FAN GAME',132,1)
    elif kind=='clear':
        d.ellipse((45,29,114,97),outline=1);d.ellipse((56,40,103,87),fill=1)
        p=reimu(0).resize((32,48),Image.Resampling.NEAREST);im.paste(p,(65,42),p.point(lambda v:255 if v else 0))
        txt(im,'DAWN RETURNS',14,3);txt(im,'ALL FIVE CLEARED',104,2)
        txt(im,'TOUHOU FAN GAME',132,1)
    elif kind=='over':
        for x in range(10,150,20):d.line((x,25,x+10,38),fill=1)
        txt(im,'NIGHT REMAINS',32,2);txt(im,'TRY AGAIN',64,3)
        d.polygon([(65,89),(95,89),(90,104),(70,104)],outline=2)
        txt(im,'REIMU WILL RETURN',112,1)
    else:
        txt(im,'SHRINE RECORDS',14,3)
        for x in (15,144):d.line((x,30,x,130),fill=1)
    return im

def motion(kind='straight',vx=0,vy=0,amp=0,period=240,pts=None):
    return dict(kind=kind,vx=vx,vy=vy,amplitude=amp,period=period,loop=True,
      points=pts or [{'x':0,'y':0,'frame':0},{'x':0,'y':0,'frame':period}])
def path_motion(amp=12,dy=0,period=256,reverse=False):
    a=-amp if reverse else amp
    return motion('path',period=period,pts=[{'x':0,'y':0,'frame':0},{'x':a,'y':dy,'frame':period//4},{'x':0,'y':0,'frame':period//2},{'x':-a,'y':-dy,'frame':3*period//4},{'x':0,'y':0,'frame':period}])
def pattern(aid,name,asset,kind='straight',speed=1,angle=180,count=1,spread=0,interval=90,rotation=0,repeats=0,delay=24,lifetime=150,damage=1):
    return dict(id=aid,name=name,asset=asset,kind=kind,speed=speed,angle=angle,count=count,spread=spread,interval=interval,rotation=rotation,repeats=repeats,delay=delay,lifetime=lifetime,damage=damage)
def event(aid,frame,kind,ref='',x=80,y=-12,count=1,spacing=0,interval=0,value=0):
    return dict(id=aid,frame=frame,kind=kind,ref=ref,x=x,y=y,count=count,spacing=spacing,interval=interval,value=value)

def compose_game():
    assets=[frame_asset('reimu','博麗霊夢・上向き飛行',[reimu(0),reimu(1)],palette=0,hit={'x':7,'y':11,'w':3,'h':3},emit=[{'x':8,'y':1}],duration=8)]
    for i,b in enumerate(BOSSES):
        assets.append(frame_asset(b,NAMES[i],[boss(i,j) for j in range(2 if i>=3 else 1)],palette=i+1,hit={'x':7,'y':5,'w':10,'h':14},emit=[{'x':12,'y':29}],duration=12))
    assets += [frame_asset('fairy','館の妖精',[small_enemy('fairy',i) for i in range(2)],palette=6,hit={'x':4,'y':3,'w':8,'h':10},duration=8),frame_asset('bat','使い魔',[small_enemy('bat',i) for i in range(2)],palette=4,hit={'x':4,'y':2,'w':8,'h':5},duration=6),frame_asset('book','魔導書',[small_enemy('book',i) for i in range(2)],palette=2,duration=12)]
    for k in ['ofuda','focus','orb','knife','star','diamond']:
        assets.append(frame_asset('shot-'+k,k,[projectile(k)],palette=0 if k in ('ofuda','focus') else 7,hit={'x':2,'y':2,'w':4,'h':4},emit=[]))
    assets.append(frame_asset('burst','六段階の破裂',[explosion(i) for i in range(6)],palette=7,emit=[],duration=3))
    pats=[pattern('reimu-shot','通常札・直進単発','shot-ofuda',speed=5,angle=0,interval=10,delay=0,lifetime=32),pattern('reimu-focus','集中札・単発高威力','shot-focus',speed=5,angle=0,interval=12,delay=0,lifetime=32,damage=2),
      pattern('fairy-aim','妖精・単発自機狙い','shot-orb','aimed',1.25,0,interval=100,delay=35,repeats=1,lifetime=130),
      pattern('bat-drop','使い魔・落下弾','shot-diamond',speed=1.5,delay=30,interval=90,repeats=1,lifetime=120),
      pattern('book-fan','魔導書・二方向','shot-star','fan',1,180,2,45,interval=140,delay=32,repeats=1,lifetime=130),
      pattern('mei-petal','花符・五葉','shot-orb','fan',1,180,5,90,interval=150,lifetime=130),
      pattern('mei-guard','門符・六方','shot-orb','ring',1.25,0,6,360,interval=170,lifetime=135),
      pattern('mei-needle','紅拳・狙いの間','shot-diamond','aimed',1.75,0,interval=60,lifetime=105),
      pattern('pat-element','六曜の輪','shot-star','ring',1,22.5,6,360,interval=160,lifetime=150),
      pattern('pat-page','頁の螺旋','shot-star','spiral',1.25,180,1,0,interval=24,rotation=22.5,lifetime=140),
      pattern('pat-seal','三角の封印','shot-diamond','fan',1.5,180,3,45,interval=90,lifetime=110),
      pattern('sak-fan','時計の針','shot-knife','fan',1.75,180,3,45,interval=95,lifetime=105),
      pattern('sak-cross','逆時計回り','shot-knife','spiral',1.5,180,1,0,interval=23,rotation=-45,lifetime=125),
      pattern('sak-line','銀の一閃','shot-knife','aimed',2,0,interval=42,lifetime=90),
      pattern('rem-ring','紅月の六芒','shot-diamond','ring',1.5,22.5,6,360,interval=140,lifetime=115),
      pattern('rem-fan','夜の翼','shot-orb','fan',1.5,180,5,135,interval=135,lifetime=110),
      pattern('rem-coil','月下の渦','shot-diamond','spiral',1.5,180,1,0,interval=20,rotation=22.5,lifetime=130),
      pattern('flan-ring','禁域の八方','shot-star','ring',1.25,22.5,8,360,interval=175,lifetime=150),
      pattern('flan-coil','七色の破片','shot-star','spiral',1.5,180,1,0,interval=17,rotation=-22.5,lifetime=135),
      pattern('flan-final','真紅の花冠','shot-diamond','fan',1.75,180,5,90,interval=115,lifetime=110)]
    enemies=[dict(id='fairy-down',name='妖精・縦列',asset='fairy',hp=2,score=80,motion=motion(vy=1.25),pattern='fairy-aim',attacks=[]),dict(id='fairy-left',name='妖精・左斜行',asset='fairy',hp=2,score=80,motion=motion(vx=-.3125,vy=1.375),pattern='fairy-aim',attacks=[]),dict(id='fairy-right',name='妖精・右斜行',asset='fairy',hp=2,score=80,motion=motion(vx=.3125,vy=1.375),pattern='fairy-aim',attacks=[]),dict(id='bat-down',name='使い魔・急降下',asset='bat',hp=1,score=60,motion=motion(vy=1.875),pattern='bat-drop',attacks=[]),dict(id='book-down',name='魔導書・浮遊',asset='book',hp=3,score=110,motion=motion(vy=1.125),pattern='book-fan',attacks=[])]
    bossdefs=[]; hp=[110,135,160,190,225];scores=[1200,1600,2100,2800,3600]
    groups=[['mei-petal','mei-guard','mei-needle'],['pat-element','pat-page','pat-seal'],['sak-fan','sak-cross','sak-line'],['rem-ring','rem-fan','rem-coil'],['flan-ring','flan-coil','flan-final']]
    for i,b in enumerate(BOSSES):
        phases=[dict(id=b+'-entry',name='登場',until='time',threshold=64,pattern='',attacks=[],motion=motion(vy=.75))]
        for j,pat in enumerate(groups[i]):
            phases.append(dict(id=f'{b}-p{j+1}',name=[p['name'] for p in pats if p['id']==pat][0],until='hp',threshold=[int(hp[i]*.67),int(hp[i]*.33),0][j],pattern=pat,attacks=[],motion=path_motion(16-i,dy=0,period=256-16*i,reverse=bool(j%2))))
        bossdefs.append(dict(id=b,name=NAMES[i],asset=b,hp=hp[i],score=scores[i],motion=motion(),pattern='',attacks=[],phases=phases))
    stages=[]
    for i,b in enumerate(BOSSES):
        bossframe=1920+i*240
        atlas,h,tiles=background(i,bossframe)
        assets.append(frame_asset(f'map-{i+1}',STAGES[i],[atlas],kind='tileset',palette=[1,2,3,4,5][i],emit=[]))
        ev=[]; t=80; w=0
        while t<bossframe-300:
            kind=(w+i)%5
            if kind==0: ev.append(event(f's{i}-w{w}',t,'enemy','fairy-down',32 if w%2 else 100,count=2,spacing=36,interval=26))
            elif kind==1:ev.append(event(f's{i}-w{w}',t,'enemy','fairy-right',28,count=2,spacing=54,interval=30))
            elif kind==2:ev.append(event(f's{i}-w{w}',t,'enemy','fairy-left',78,count=2,spacing=42,interval=34))
            elif kind==3:ev.append(event(f's{i}-w{w}',t,'enemy','book-down' if i in (1,4) else 'bat-down',48,count=2,spacing=64,interval=40))
            else:ev.append(event(f's{i}-w{w}',t,'enemy','bat-down',24,count=3,spacing=52,interval=32))
            t+=180 if i<2 else 165;w+=1
        ev.append(event(f's{i}-stop',bossframe-64,'scroll',value=0))
        ev.append(event(f's{i}-boss',bossframe,'boss',b))
        stages.append(dict(id=f'stage-{i+1}',name=STAGES[i],tileset=f'map-{i+1}',width=20,height=h,tiles=tiles,walls=[0]*len(tiles),scrollSpeed=.625,loopMap=False,duration=180,clearOnBoss=True,requireBoss=True,scrollDown=True,music=17+2*i,bossMusic=18+2*i,events=ev))
    for sid in ['title','clear','over','scores']:
        assets.append(frame_asset('screen-'+sid,'画面・'+sid,[screen(sid)],kind='screen',palette=0,emit=[]))
    def item(id,text,x,y,binding='none',digits=5):return dict(id=id,text=text,x=x,y=y,palette=0,binding=binding,digits=digits)
    screens=[dict(id='title',name='タイトル',background='screen-title',palette=0,dock='top',items=[item('begin','START',7,15)]),dict(id='gameover',name='ゲームオーバー',background='screen-over',palette=0,dock='top',items=[item('over-score','SCORE ',4,16,'score')]),dict(id='clear',name='クリア',background='screen-clear',palette=0,dock='top',items=[item('clear-score','SCORE ',4,15,'score')]),dict(id='scores',name='ランキング',background='screen-scores',palette=0,dock='top',items=[item('ranking','',5,5,'highscores')]),dict(id='hud',name='状況',background='',palette=0,dock='top',rows=1,items=[item('score','S',0,0,'score'),item('lives','L',8,0,'lives',1),item('boss','HP',12,0,'boss',3)])]
    palette_colors=[['#101421','#35273f','#d85068','#fff4dd'],['#101821','#253b3d','#4eaa7a','#f7ecd3'],['#141222','#39314b','#aa82c7','#fff0dd'],['#101721','#354052','#88b6c9','#fff5e1'],['#171323','#3f2847','#c4759f','#fff0db'],['#181323','#49304c','#e17775','#fff0cf'],['#121c26','#32424e','#91bfaf','#fff1d8'],['#111724','#333244','#aebbd4','#ffffff']]
    return dict(schemaVersion=1,name=ID,title=TITLE,mode='campaign',seed=73,startStage='stage-1',stageOrder=[s['id'] for s in stages],palettes=[dict(id=f'pal-{i}',name=n,colors=c) for i,(n,c) in enumerate(zip(['霊夢','門と美鈴','書架とパチュリー','時計と咲夜','月とレミリア','禁域とフランドール','妖精','弾・エフェクト'],palette_colors))],dmgPalette=27,assets=assets,patterns=pats,enemies=enemies,bosses=bossdefs,stages=stages,screens=screens,player=dict(asset='reimu',speed=2.25,lives=5,invulnerability=150,respawnDelay=90,weapon='reimu-shot',focusWeapon='reimu-focus',focusSpeed=1,x=80,y=120),clearBonus=500,stageFade=True,timeLimit=False,bossCelebration=True,music=dict(title=16,boss=18,clear=27,gameover=28,victory=29),performance=dict(enemies=3,playerShots=4,enemyShots=12,effects=1),effects=dict(explosion='burst',duration=18),provenance=dict(author='Original fan-game production for the requesting user, 2026',license='Engine/code MIT; original fan art and characters: see LICENSE-FAN-CONTENT.md',source='New pixel art and music. Touhou Project characters belong to Team Shanghai Alice. No original game assets or recordings used.'))

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--output',type=Path,required=True);args=ap.parse_args()
    if args.output.exists():raise SystemExit('Refusing to overwrite: choose a new staging file, then use editor revision-aware saving.')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    game=compose_game();args.output.write_text(json.dumps(game,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
    print(f'Authored {len(game["stages"])} stages, {len(game["assets"])} assets, {len(game["patterns"])} patterns: {args.output}')
if __name__=='__main__':main()
