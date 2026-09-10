#!/usr/bin/env python3
"""Verify/sync the editable score.json with the 14 stable C music entries.
Default is read-only --check. --write updates only the named arrays/rows and MIDIs.
Requires Python 3.10+, no audio samples, font, Pillow, or compiler dependency.
"""
import argparse, importlib.util, json, re
from pathlib import Path
D=Path(__file__).resolve().parent;ROOT=D.parents[1]
def main():
    p=argparse.ArgumentParser();p.add_argument('--write',action='store_true');a=p.parse_args()
    score=json.loads((D/'score.json').read_text());tracks=score['tracks']
    assert [t['id'] for t in tracks]==list(range(16,32)), 'Stable IDs must be 16..31'
    spec=importlib.util.spec_from_file_location('kouma_composer',D/'compose.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    file=ROOT/'engine/caravan/music.c';before=file.read_text();text=before
    for t in tracks:
        key=t['key'];assert re.fullmatch(r'kouma_[a-z]+',key)
        assert 0<t['rows']<256 and len(t['lead'])==t['rows'] and len(t['bass'])==32
        assert 1<=t['speed']<=255 and t['duty'] in (0,64,128,192) and 0<=t['envelope']<=255
        if t['id'] in (27,28,29):assert not t['loop'], 'Result/fanfare must terminate'
        for part in ('lead','bass'):
            assert all(m.enum_value(n) in (0,255) or 1<=m.enum_value(n)<=60 for n in t[part])
            pattern=r'static const uint8_t '+key+'_'+part+r'\[\]\s*=\s*\{[^}]*\};'
            expected='static const uint8_t '+key+'_'+part+'[]={'+','.join(t[part])+'};'
            text,n=re.subn(pattern,expected,text);assert n==1,(key,part,'array not unique')
        pattern=r'\{\d+,\d+,0x[0-9a-fA-F]+,0x[0-9a-fA-F]+,[01],'+key+'_lead,'+key+r'_bass\}'
        expected='{%d,%d,0x%02x,0x%02x,%d,%s_lead,%s_bass}'%(t['rows'],t['speed'],t['duty'],t['envelope'],t['loop'],key,key)
        text,n=re.subn(pattern,expected,text);assert n==1,(key,'song entry not unique')
    if not a.write:
        assert text==before,'Score differs from C tables. Review the changes, then run sync_score.py --write.'
        print('PASS: all 16 lead/bass arrays and C song-table rows match score.json.')
    else:
        assert file.read_text()==before,'Concurrent change; reload first.'
        tmp=file.with_suffix('.c.tmp');tmp.write_text(text);tmp.replace(file)
        for t in tracks:(D/'midi'/f"{t['id']:02d}-{t['key']}.mid").write_bytes(m.smf(t))
        print('Updated the named music arrays, table rows and MIDI files; rebuild ROM next.')
if __name__=='__main__':main()
