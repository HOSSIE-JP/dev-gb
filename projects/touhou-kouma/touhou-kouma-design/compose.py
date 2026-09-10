#!/usr/bin/env python3
"""Original two-voice score generator. Emits notation, SMF MIDI, and engine tables.
No existing Touhou melody, recording, soundfont, or sampled instrument is input.
Run once per fresh source tree. Refuses to append the same score twice.
"""
from pathlib import Path
import json, struct, argparse
NAMES=['C','CS','D','DS','E','F','FS','G','GS','A','AS','B']
def token(m):return NAMES[m%12]+str(m//12-1)
def enum_value(t):
    if t=='REST':return 0
    if t=='H':return 255
    return (NAMES.index(t[:-1])+(int(t[-1])+1)*12)-35
# IDs stay stable so projects and saves do not depend on UI ordering.
CONFIG=[
(16,'kouma_title','Scarlet Pilgrimage','朱い夜への巡礼',62,9,128,0x80,1,[0,7,12,-1,15,14,12,7,8,12,15,14,11,7,12,-1]),
(17,'kouma_gate','Petals at the Iron Gate','鉄門に舞う花',67,7,192,0x40,1,[0,3,7,10,7,5,3,2,0,7,12,10,8,7,3,5]),
(18,'kouma_meiling','Vermilion Footwork','紅蓮の歩法',67,6,192,0x40,1,[7,0,3,7,12,10,7,3,5,8,12,15,14,12,10,7]),
(19,'kouma_library','Dust of Six Elements','六曜の書塵',66,8,192,0x80,1,[0,-1,7,3,11,7,14,12,8,-1,5,3,7,11,12,7]),
(20,'kouma_patchouli','Marginalia of the Moon','月の余白',66,6,192,0x80,1,[12,7,3,7,11,14,11,7,8,12,15,12,7,5,3,2]),
(21,'kouma_clock','Hall of Uneven Seconds','秒針の迷廊',71,7,192,0x40,1,[0,-2,7,0,3,-2,10,7,2,-2,5,8,11,7,12,-1]),
(22,'kouma_sakuya','Silver Between Ticks','一瞬の銀',71,5,192,0x40,1,[7,0,7,3,10,7,10,5,12,7,14,11,12,7,3,-2]),
(23,'kouma_roof','Moon above the Parapet','胸壁の上の月',64,8,192,0x80,1,[12,-1,7,10,15,-1,14,12,8,12,15,19,17,15,14,11]),
(24,'kouma_remilia','Crown of the Night Tide','夜潮の冠',64,6,192,0x40,1,[0,7,12,15,19,15,12,10,8,15,20,19,17,14,11,7]),
(25,'kouma_basement','Seven Unlit Windows','灯らぬ七つの窓',61,7,192,0x80,1,[0,1,7,3,12,11,7,-2,8,7,5,3,2,5,11,12]),
(26,'kouma_flandre','Playroom beyond Dawn','暁の外の遊戯室',61,5,192,0x40,1,[12,0,7,3,15,7,14,11,8,15,20,17,19,14,11,7]),
]
CHORDS=[0,-4,-2,-5]
def song_for(c):
    ident,key,en,ja,tonic,speed,rows,duty,loop,motif=c
    lead=[]
    for section in range(rows//64):
        for bar,shift in enumerate(CHORDS):
            phrase=motif[section*2:]+motif[:section*2]
            for j,v in enumerate(phrase):
                if v==-1:lead.append('H');continue
                if v==-2:lead.append('REST');continue
                # Different answer and climax, not a verbatim four-bar loop.
                note=tonic+shift+v
                if section==1 and j in (3,7,11):note+=2 if bar!=3 else 1
                if section==2 and j in (0,4,8,12):note+=12
                while note>95:note-=12
                while note<48:note+=12
                lead.append(token(note))
    bass=[]
    for bar,shift in enumerate(CHORDS):
        r=tonic-24+shift
        while r<36:r+=12
        third=4 if bar in (1,2,3) else 3
        for d in [0,7,12,7,third,7,12,7]:bass.append(token(r+d))
    return dict(id=ident,key=key,title=en,titleJa=ja,rows=rows,speed=speed,duty=duty,envelope=0x82 if ident%2==0 else 0x72,loop=bool(loop),lead=lead,bass=bass)

def ending(ident,key,en,ja,lead,speed):
    a=lead.split(); bass=('D3 A3 D4 A3 AS2 F3 AS3 F3 C3 G3 C4 G3 A2 E3 D3 H '*2).split()
    return dict(id=ident,key=key,title=en,titleJa=ja,rows=len(a),speed=speed,duty=0x80,envelope=0x82,loop=False,lead=a,bass=bass)

def varlen(v):
    out=[v&127];v>>=7
    while v:out.insert(0,(v&127)|128);v>>=7
    return bytes(out)
def smf(song):
    # One source row is a sixteenth note, 120 MIDI ticks at PPQN=480.
    us=int(song['speed']/59.727500569606*4*1e6)
    tracks=[]
    for channel,voice in [(0,song['lead']),(1,[song['bass'][(r//2)%32] if r%2==0 else 'H' for r in range(song['rows'])])]:
        events=[(0,bytes([0xc0+channel,80 if channel==0 else 38]))]
        if channel==0:events.append((0,b'\xff\x51\x03'+us.to_bytes(3,'big')))
        active=None
        for row,n in enumerate(voice):
            if n=='H':continue
            tick=row*120
            if active is not None:events.append((tick,bytes([0x80+channel,active,0])));active=None
            if n!='REST':
                active=enum_value(n)+35;events.append((tick,bytes([0x90+channel,active,88 if channel==0 else 66])))
        if active is not None:events.append((song['rows']*120,bytes([0x80+channel,active,0])))
        events.append((song['rows']*120,b'\xff\x2f\x00'))
        data=b'';last=0
        for t,e in sorted(events,key=lambda x:x[0]):data+=varlen(t-last)+e;last=t
        tracks.append(b'MTrk'+struct.pack('>I',len(data))+data)
    return b'MThd'+struct.pack('>IHHH',6,1,2,480)+b''.join(tracks)

def main():
    root=Path(__file__).resolve().parents[2];design=Path(__file__).parent
    musicfile=root/'engine/caravan/music.c';src=musicfile.read_text()
    if 'kouma_title_lead' in src:raise SystemExit('Score already installed; refusing duplicate append.')
    songs=[song_for(c) for c in CONFIG]
    songs += [ending(27,'kouma_clear','A Quiet Shrine at Dawn','夜明けの静かな神社','D5 H F5 A5 D6 H A5 H AS5 A5 G5 F5 E5 H A5 H D5 F5 A5 D6 C6 A5 G5 E5 F5 A5 D6 H H H H REST',11),ending(28,'kouma_over','Return to the Lantern','灯へ帰る','A5 H F5 E5 D5 H AS4 H A4 CS5 E5 H D5 H H REST',13),ending(29,'kouma_victory','Seal Released','封印がほどける','D5 F5 A5 D6 REST A5 REST D6 C6 A5 G5 E5 F5 A5 D6 H AS5 D6 F6 H E6 CS6 A5 E5 F5 G5 A5 CS6 D6 H H REST',5)]
    for s in songs:
        assert len(s['lead'])==s['rows'] and len(s['bass'])==32
        assert 0<s['rows']<256
        assert all(enum_value(n) in [0,255] or 1<=enum_value(n)<=60 for n in s['lead']+s['bass'])
    score={'format':'kouma-original-score-v1','timing':'One row per speed VBlanks at nominal DMG refresh; MIDI/WebAudio is only a synthesized score audition, not captured ROM audio.','authoring':'Newly composed for this fan game. No original Touhou melodies or audio files are inputs.','channels':{'lead':'Game Boy pulse channel 2','bass':'Game Boy wave channel 3','effects':'Existing engine: pulse 1 and noise 4'},'tracks':songs}
    (design/'score.json').write_text(json.dumps(score,ensure_ascii=False,indent=2)+'\n')
    arrays='\n/* Original SCARLET PILGRIMAGE score. Generated from projects/touhou-kouma-design/score.json. */\n'
    for s in songs:
        for part in ['lead','bass']:
            arrays+=f"static const uint8_t {s['key']}_{part}[]={{"+','.join(s[part])+'};\n'
    src=src.replace('typedef struct {\n    uint8_t rows, speed, duty, envelope, loop;',arrays+'\ntypedef struct {\n    uint8_t rows, speed, duty, envelope, loop;')
    needle='    {16,17,0x80,0x72,0,gero_over_lead,gero_over_bass}\n};'
    assert src.count(needle)==1
    rows=['    {%d,%d,0x%02x,0x%02x,%d,%s_lead,%s_bass}'%(s['rows'],s['speed'],s['duty'],s['envelope'],s['loop'],s['key'],s['key']) for s in songs]
    src=src.replace(needle,'    {16,17,0x80,0x72,0,gero_over_lead,gero_over_bass},\n'+',\n'.join(rows)+'\n};')
    musicfile.write_text(src)
    mh=root/'engine/caravan/music.h';s=mh.read_text();assert '#define CE_MUSIC_MAX 15u' in s
    s=s.replace('#define CE_MUSIC_MAX 15u','\n'.join(f"#define CE_MUSIC_{t['key'].upper()} {t['id']}u" for t in songs)+'\n#define CE_MUSIC_MAX 29u');mh.write_text(s)
    mf=root/'editor/src/shared/music.ts';s=mf.read_text();needle='] as const;';assert s.count(needle)==1
    s=s.replace(needle,''.join('    { id: %d, label: %s },\n'%(t['id'],json.dumps('紅魔巡礼 · '+t['titleJa'],ensure_ascii=False)) for t in songs)+needle);mf.write_text(s)
    midi=design/'midi';midi.mkdir()
    for s in songs:(midi/f"{s['id']:02d}-{s['key']}.mid").write_bytes(smf(s))
    print('Created 14 original scores, 14 MIDI files, and actual engine music table entries 16..29.')
if __name__=='__main__':main()
