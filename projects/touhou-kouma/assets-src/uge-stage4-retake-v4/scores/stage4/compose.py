#!/usr/bin/env python3
"""Stage 4 v4: new high-tempo theme, explicitly authored lead phrases."""
from pathlib import Path
import json,re,collections,hashlib
HERE=Path(__file__).resolve().parent
# chord: onset/pitch/duration. Four-bar blocks form 92 bars (4 intro + 88 loop).
BLOCKS=[
('intro_ignite',['F#m','D','E','C#'],[
'0:C#5:2 2:F#5:2 4:G#5:2 6:A5:2 8:C#6:4 12:B5:2 14:A5:2',
'0:F#5:2 2:A5:2 4:D6:4 8:C#6:2 10:A5:2 12:F#5:4',
'0:G#5:2 2:B5:2 4:E6:4 8:D6:2 10:B5:2 12:G#5:4',
'0:G#5:2 2:F5:2 4:C#5:2 6:F5:2 8:G#5:2 10:B5:2 12:C#6:2']),
('A_hook_first_flight',['F#m','D','A','E'],[
'0:F#5:2 2:G#5:2 4:A5:3 7:C#6:3 10:B5:2 12:A5:2 14:G#5:2',
'0:F#5:4 4:A5:2 6:D6:4 10:C#6:2 12:A5:2 14:F#5:2',
'0:E5:2 2:F#5:2 4:A5:3 7:C#6:3 10:B5:2 12:A5:2 14:G#5:2',
'0:B5:3 3:G#5:3 6:E5:2 8:F#5:2 10:G#5:2 12:B5:3']),
('A_hook_question_open',['F#m','D','Bm','C#'],[
'0:F#5:2 2:G#5:2 4:A5:3 7:C#6:3 10:E6:2 12:C#6:2 14:A5:2',
'0:D6:4 4:C#6:2 6:A5:2 8:F#5:3 11:A5:3 14:C#6:2',
'0:D6:2 2:C#6:2 4:B5:4 8:F#5:2 10:A5:2 12:B5:2 14:D6:2',
'0:C#6:3 3:B5:2 5:G#5:3 8:F5:2 10:G#5:2 12:B5:2 14:C#6:2']),
('P_first_skyline',['F#m','E','D','C#'],[
'0:F#6:6 6:E6:2 8:C#6:3 11:A5:3 14:B5:2',
'0:E6:4 4:D6:2 6:B5:2 8:G#5:2 10:B5:2 12:E6:4',
'0:D6:3 3:C#6:3 6:A5:2 8:F#5:2 10:A5:2 12:D6:4',
'0:C#6:3 3:B5:2 5:G#5:3 8:F5:2 10:G#5:2 12:C#6:3']),
('P_first_reply',['Bm','D','C#','F#m'],[
'0:D6:4 4:C#6:2 6:B5:2 8:F#5:2 10:A5:2 12:B5:4',
'0:A5:3 3:F#5:3 6:D5:2 8:F#5:2 10:A5:2 12:D6:4',
'0:F6:3 3:E6:2 5:C#6:3 8:B5:2 10:G#5:2 12:F5:2 14:G#5:2',
'0:A5:3 3:G#5:2 5:F#5:7']),
('B_running_shadows',['Bm','E','A','C#'],[
'0:F#5:2 3:B5:2 6:D6:2 8:C#6:2 11:B5:2 14:A5:2',
'0:G#5:2 3:B5:2 6:E6:2 8:D6:2 11:B5:2 14:G#5:2',
'0:A5:2 3:C#6:2 6:E6:3 10:C#6:2 13:A5:3',
'0:G#5:2 3:F5:2 6:C#5:3 10:F5:2 13:G#5:2']),
('B_shadow_answers',['Bm','G','D','C#'],[
'0:B5:3 3:A5:2 5:F#5:3 8:D5:2 10:F#5:2 12:A5:2 14:B5:2',
'0:D6:3 3:B5:2 5:G5:3 8:A5:2 10:B5:2 12:D6:4',
'0:A5:3 3:F#5:2 5:D5:3 8:F#5:2 10:A5:2 12:C#6:2 14:D6:2',
'0:C#6:2 2:B5:2 4:G#5:2 6:F5:2 8:G#5:3 11:C#6:3']),
('B_springboard',['D','E','F#m','C#'],[
'0:F#5:2 2:A5:2 4:D6:2 6:C#6:2 8:A5:2 10:F#5:2 12:A5:4',
'0:G#5:2 2:B5:2 4:E6:2 6:D6:2 8:B5:2 10:G#5:2 12:B5:4',
'0:A5:2 2:C#6:2 4:F#6:4 8:E6:2 10:C#6:2 12:A5:4',
'0:G#5:2 2:B5:2 4:C#6:3 7:F6:3 10:E6:2 12:C#6:2']),
('C_wide_open_air',['A','E','F#m','D'],[
'0:E6:6 6:C#6:2 8:B5:2 10:A5:4 14:C#6:2',
'0:B5:5 5:G#5:3 8:E5:2 10:G#5:2 12:B5:4',
'0:C#6:6 6:A5:2 8:G#5:2 10:F#5:4 14:A5:2',
'0:A5:5 5:F#5:3 8:D5:2 10:F#5:2 12:A5:3']),
('C_horizon_answer',['A','Bm','D','E'],[
'0:C#6:4 4:E6:3 7:C#6:3 10:B5:2 12:A5:4',
'0:B5:4 4:D6:3 7:B5:3 10:A5:2 12:F#5:4',
'0:A5:2 2:B5:2 4:D6:5 9:C#6:3 12:A5:4',
'0:G#5:2 2:B5:2 4:E6:5 9:D6:3 12:B5:3']),
('C_starlight_rise',['F#m','D','Bm','C#'],[
'0:C#6:3 3:A5:3 6:F#5:2 8:A5:2 10:C#6:2 12:E6:4',
'0:F#6:4 4:E6:2 6:D6:2 8:C#6:2 10:A5:2 12:F#5:4',
'0:B5:3 3:D6:3 6:F#6:4 10:E6:2 12:D6:4',
'0:C#6:3 3:B5:2 5:G#5:3 8:F5:2 10:G#5:2 12:C#6:3']),
('D_racing_echoes',['F#m','E','D','C#'],[
'0:F#5:2 2:A5:2 4:C#6:2 8:A5:2 10:G#5:2 12:F#5:3',
'2:G#5:2 4:B5:2 6:E6:2 10:B5:2 12:G#5:3',
'0:F#5:2 2:A5:2 4:D6:2 8:A5:2 10:F#5:2 12:D5:3',
'2:F5:2 4:G#5:2 6:C#6:2 10:B5:2 12:G#5:3']),
('D_echoes_join',['Bm','G','D','C#'],[
'0:B5:3 3:D6:2 5:F#6:3 8:D6:2 10:B5:2 12:A5:4',
'0:B5:3 3:D6:2 5:G6:3 8:F#6:2 10:D6:2 12:B5:4',
'0:A5:3 3:D6:2 5:F#6:3 8:E6:2 10:D6:2 12:A5:4',
'0:G#5:2 2:B5:2 4:C#6:3 7:F6:3 10:E6:2 12:C#6:2 14:B5:2']),
('Aprime_flight_recognized',['F#m','D','A','E'],[
'0:F#5:2 2:G#5:2 4:A5:3 7:C#6:3 10:B5:2 12:A5:2 14:G#5:2',
'0:F#5:4 4:A5:2 6:D6:3 9:C#6:3 12:A5:2 14:F#5:2',
'0:E5:2 2:F#5:2 4:A5:3 7:C#6:3 10:E6:2 12:C#6:2 14:A5:2',
'0:B5:3 3:G#5:3 6:E5:2 8:G#5:2 10:B5:2 12:E6:3']),
('Aprime_new_turn',['F#m','G','Bm','C#'],[
'0:F#5:2 2:G#5:2 4:A5:3 7:C#6:3 10:E6:2 12:F#6:4',
'0:G6:4 4:F#6:2 6:D6:2 8:B5:3 11:D6:3 14:G5:2',
'0:F#5:2 2:A5:2 4:B5:3 7:D6:3 10:C#6:2 12:B5:2 14:A5:2',
'0:G#5:3 3:B5:2 5:C#6:3 8:F6:2 10:E6:2 12:C#6:3']),
('P2_skyline_returns',['F#m','E','D','C#'],[
'0:F#6:6 6:E6:2 8:C#6:3 11:A5:3 14:B5:2',
'0:E6:4 4:D6:2 6:B5:2 8:G#5:2 10:B5:2 12:E6:4',
'0:D6:3 3:C#6:3 6:A5:2 8:F#5:2 10:A5:2 12:D6:4',
'0:F6:3 3:E6:2 5:C#6:3 8:B5:2 10:G#5:2 12:C#6:3']),
('P2_answer_climbs',['Bm','D','E','C#'],[
'0:D6:4 4:F#6:3 7:D6:3 10:C#6:2 12:B5:4',
'0:F#6:4 4:E6:2 6:D6:2 8:C#6:2 10:A5:2 12:D6:4',
'0:E6:4 4:G#6:3 7:E6:3 10:D6:2 12:B5:4',
'0:F6:4 4:E6:2 6:C#6:2 8:B5:2 10:G#5:2 12:C#6:3']),
('P2_true_peak',['F#m','A','D','C#'],[
'0:F#6:4 4:E6:2 6:C#6:2 8:A5:2 10:C#6:2 12:F#6:4',
'0:A6:5 5:G#6:3 8:E6:2 10:C#6:2 12:A5:4',
'0:D6:4 4:F#6:3 7:E6:3 10:D6:2 12:A5:4',
'0:G#5:2 2:B5:2 4:C#6:3 7:F6:3 10:E6:2 12:C#6:2']),
('E_second_wind',['Bm','E','A','C#'],[
'0:F#5:3 3:B5:3 6:D6:2 8:C#6:2 10:B5:2 12:A5:4',
'0:G#5:3 3:B5:3 6:E6:2 8:D6:2 10:B5:2 12:G#5:4',
'0:A5:3 3:C#6:3 6:E6:2 8:C#6:2 10:B5:2 12:A5:4',
'0:G#5:3 3:F5:3 6:C#5:2 8:F5:2 10:G#5:2 12:B5:3']),
('E_second_wind_answer',['D','E','F#m','C#'],[
'0:A5:3 3:D6:3 6:F#6:2 8:E6:2 10:D6:2 12:C#6:4',
'0:B5:3 3:E6:3 6:G#6:2 8:F#6:2 10:E6:2 12:D6:4',
'0:C#6:3 3:F#6:3 6:E6:2 8:C#6:2 10:A5:2 12:F#5:4',
'0:G#5:2 2:B5:2 4:C#6:3 7:F6:3 10:E6:2 12:C#6:3']),
('Coda_gather_the_hook',['F#m','D','Bm','C#'],[
'0:F#5:2 2:G#5:2 4:A5:3 7:C#6:3 10:A5:2 12:F#5:4',
'0:A5:2 2:B5:2 4:D6:3 7:C#6:3 10:A5:2 12:F#5:4',
'0:B5:2 2:C#6:2 4:D6:3 7:F#6:3 10:D6:2 12:B5:4',
'0:C#6:3 3:B5:2 5:G#5:3 8:F5:2 10:G#5:2 12:C#6:3']),
('Coda_glint_in_motion',['D','A','Bm','E'],[
'0:F#6:4 4:E6:2 6:D6:2 8:A5:3 11:F#5:3 14:A5:2',
'0:E6:4 4:C#6:2 6:B5:2 8:A5:3 11:E5:3 14:A5:2',
'0:D6:4 4:C#6:2 6:B5:2 8:F#5:3 11:D5:3 14:F#5:2',
'0:E6:4 4:D6:2 6:B5:2 8:G#5:3 11:E5:3 14:G#5:2']),
('Seam_launch_again',['D','Bm','C#','C#'],[
'0:A5:2 2:F#5:2 4:D5:3 7:F#5:3 10:A5:2 12:D6:4',
'0:B5:2 2:A5:2 4:F#5:3 7:D5:3 10:F#5:2 12:B5:4',
'0:C#6:3 3:B5:2 5:G#5:3 8:F5:2 10:G#5:2 12:C#6:3',
'0:G#5:3 3:F5:3 6:C#5:2 8:F5:2 10:G#5:2 12:B5:2'])]
CH={'F#m':('F#2','C#3','A2',['A3','C#4','F#4']), 'D':('D3','A2','F#3',['F#4','A3','D4']), 'E':('E3','B2','G#2',['G#3','B3','E4']), 'C#':('C#3','G#2','F3',['F4','G#3','C#4']), 'A':('A2','E3','C#3',['C#4','E4','A3']), 'Bm':('B2','F#3','D3',['D4','F#4','B3']), 'G':('G2','D3','B2',['B3','D4','G3'])}
def midi(n):
 m=re.fullmatch(r'([A-G])([#b]?)(\d)',n);return 12*(int(m[3])+1)+{'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[m[1]]+{'':0,'#':1,'b':-1}[m[2]]
def parse(s):return [dict(r=int(r),n=n,d=int(d)) for r,n,d in (a.split(':') for a in s.split())]
bars=[]
for block,(section,chords,lines) in enumerate(BLOCKS):
 for j,(chord,line) in enumerate(zip(chords,lines)):
  root,fifth,third,tones=CH[chord];melody=parse(line)
  # Three response points, quiet enough to leave the fast melody in front.
  grids=[[(1,3,0),(6,3,1),(11,4,2)],[(0,4,2),(7,3,0),(12,3,1)],[(2,4,1),(8,3,2),(13,3,0)],[(0,3,0),(5,4,2),(11,3,1)]]
  grid=grids[(block+j)%4]
  if block in [8,9,10]:grid=[(0,6,0),(8,6,1)] # broader middle, still fast pulse
  if block in [11,12]:grid=[(5,3,0),(13,3,1)] if j%2==0 else [(0,3,2),(8,3,0)]
  counter=[dict(r=r,n=tones[t],d=d) for r,d,t in grid]
  for n in counter:
   active=[midi(m['n']) for m in melody if m['r']<n['r']+n['d'] and m['r']+m['d']>n['r']]
   options=[t for t in tones if all((p-midi(t))%12 not in (1,11) and p-midi(t)>=5 for p in active)]
   if options:n['n']=min(options,key=lambda t:abs(midi(t)-midi(n['n'])))
  # Varied 8th-note drive, syncopation and sustained chorus anchors.
  bass_patterns=[[(0,root,2),(2,fifth,1),(4,third,2),(6,fifth,1),(8,root,3),(12,fifth,2),(14,third,2)],[(0,root,3),(3,fifth,1),(4,root,2),(6,third,2),(8,fifth,3),(12,root,2),(15,fifth,1)],[(0,root,2),(2,third,2),(4,fifth,3),(8,root,2),(10,fifth,2),(12,third,3)],[(0,root,4),(5,fifth,2),(8,third,3),(12,fifth,2),(15,root,1)],[(0,root,2),(3,fifth,2),(6,third,2),(8,root,2),(11,fifth,2),(14,root,2)]]
  pattern=bass_patterns[(block*2+j)%5]
  if block in [3,4,15,16,17]:pattern=bass_patterns[3 if j%2==0 else 1]
  bass=[dict(r=r,n=n,d=d) for r,n,d in pattern]
  # Keep fast passing melody notes clear of low-register semitone beating;
  # choose another real chord tone rather than changing the melodic line.
  for n in bass:
   upper=[(midi(m['n']),lane) for lane,notes in [('melody',melody),('counter',counter)] for m in notes if m['r']<n['r']+n['d'] and m['r']+m['d']>n['r']]
   options=[t for t in [root,fifth,third] if all((q-midi(t))%12 not in (1,11) and q-midi(t)>=5 for q,lane in upper)]
   if options:n['n']=min(options,key=lambda t:abs(midi(t)-midi(n['n'])))

  # Noise stays clearly driving: two backbeats, separated kick accents.
  rows=[0,2,4,6,8,10,12,14]
  drums=[dict(r=r,kind='snare' if r in [4,12] else 'kick' if r in [0,8] else 'hat') for r in rows]
  if (block+j)%3==1:drums=[dict(r=r,kind='snare' if r in [4,12] else 'kick' if r in [0,6,10] else 'hat') for r in rows]
  if block in [8,9]:drums=[dict(r=r,kind=k) for r,k in [(0,'kick'),(2,'hat'),(4,'hat'),(6,'hat'),(8,'snare'),(10,'hat'),(12,'kick'),(14,'hat')]]
  if j==3 and block not in [4,22]:drums+=[dict(r=15,kind='snare' if block%2 else 'hat')]
  # Full ensemble breath at the first cadence and at loop seam only.
  if (block,j) in [(4,3),(22,3)]:
   limit=12 if block==4 else 14
   for lane in [counter,bass]:
    lane[:]=[dict(n,d=min(n['d'],limit-n['r'])) for n in lane if n['r']<limit]
   drums=[n for n in drums if n['r']<limit]
  bars.append(dict(section=section,chord=chord,bass=root,melody=melody,counter=counter,bass_notes=bass,drums=sorted(drums,key=lambda n:n['r'])))
assert len(bars)==92
# Give one major-phrase transition a descending inner-line bridge, not a reset.
for b in bars:
 for lane in ['melody','counter','bass_notes']:
  end=0
  for n in b[lane]:assert n['r']>=end and n['d']>0 and n['r']+n['d']<=16;end=n['r']+n['d']
score={'id':'stage4','title':'夜界を駆ける閃光 / Night-Sky Sprint — retake v4','version':'retake_v4_high_tempo','key':'F# minor','ticks_pattern':[5],'loop_start_bar_zero_based':4,'end_mode':'loop','mix_profile':'boss_v2','bars':bars}
# Bright precise pulse and quiet independent inner line. No sample audio.
score['instruments']={'duty':[{'name':'Fast singing lead 50%','volume':11,'duty':2},{'name':'Night reply 25%','volume':5,'duty':1}], 'wave':[{'name':'Driving triangle bass','wave_volume':2,'wave_index':0}], 'noise':[{'name':'Kick tight','volume':11,'envelope_period':1,'bits':15,'length':12},{'name':'Snare tight','volume':8,'envelope_period':1,'bits':15,'length':16},{'name':'Hat tight','volume':4,'envelope_period':1,'bits':15,'length':5}]}
# Technical audit + full-phrase duplication check. Deliberate melodic returns
# have a changed counter/bass/drum context.
canonical=[json.dumps({k:b[k] for k in ['melody','counter','bass_notes','drums']},sort_keys=True) for b in bars]
dups=[]
for i in range(85):
 for j in range(i+8,85):
  if canonical[i:i+8]==canonical[j:j+8]:dups.append((i,j))
assert not dups
hz=4194304/70224;bar_s=80/hz
result={'bpm':hz*60/20,'bars':92,'intro_bars':4,'loop_bars':88,'first_seconds':92*bar_s,'loop_seconds':88*bar_s,'first_chorus_seconds':12*bar_s,'notes':{k:sum(len(b[k]) for b in bars) for k in ['melody','counter','bass_notes','drums']},'duplicate_8bar_full_textures':dups}
(HERE/'score.json').write_text(json.dumps(score,ensure_ascii=False,indent=2)+'\n')
(HERE/'composition.txt').write_text('第4面 v4 / 夜界を駆ける閃光\n\n約179BPM。静かな異界探索から、高速で夜空を駆け抜ける疾走ステージへコンセプトを変更。旋律・リズム・ベース・打楽器を新作し、旧版の単なる倍速ではない。\n\n主題は F#–G#–A の助走から C#6 に跳び、B–A–G# と滑る上昇下降。3行+3行のシンコペーションを八分の走りに混ぜる。初回約16秒で F#6 の長い歌い出しへ到達し、覚えやすさと疾走感を両立。\n\n中盤はA major側へ広がり、メロディーを長く歌わせたまま基礎テンポを維持。二声の呼応後、主題を再現し、G majorへの意外な逸脱とA6の一度だけの最高音へ進む。最後は短い呼吸を残して主題へ戻る。\n\n低音は根音/5度だけの一律反復を避け、3度・転回・シンコペーション・サビの持続音を使い分けた。ドラムは明確なバックビート。対旋律は控えめな音量と2–3個の応答で主旋律を塞がない。音符ごとの117msの切れ目は復活させず、8分の走句は連続した音の切り替えを中心にした。\n\n'+json.dumps(result,indent=2)+'\n\n'+ '\n'.join(f'{i*4+1:02d}–{i*4+4:02d}: {name}' for i,(name,_,_) in enumerate(BLOCKS))+'\n\n音声の主観聴取合格・物理実機検証は主張しない。公式ドライバー音源検証は別途。\n')
print(json.dumps(result,indent=2))
