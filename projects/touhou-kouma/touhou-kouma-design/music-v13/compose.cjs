// Authored melodies, harmony and arrangement for the v0.13 two-voice GB score.
// Regenerate from the repository root. No imported tune, MIDI or recording.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../..'),HZ=59.727500569606,H=255,R=0;
// Each phrase is eight scale degrees, with - = a rest. A and B are different
// melodies, not transpositions. Harmonic rhythm is one chord per bar.
const themes=[
 [16,'title','朱い夜への巡礼',62,'minor',7,'lyric',
  '0 2 4 7 6 4 2 1 / 2 4 5 4 3 2 1 0 / 4 6 7 9 8 7 6 4 / 5 4 2 1 0 - 1 4',
  '9 8 7 4 5 6 7 9 / 8 7 5 3 4 5 6 7 / 7 9 11 10 9 8 7 5 / 6 4 3 2 1 2 0 -',
  'i VI III VII iv i V V','III VII VI III iv VI V V'],
 [17,'gate','鉄門に舞う花',67,'dorian',7,'dance',
  '0 2 4 2 5 4 2 0 / 1 3 5 6 5 3 1 - / 2 4 7 6 4 2 1 2 / 3 2 0 1 4 3 1 0',
  '7 9 8 7 5 4 5 7 / 6 5 3 4 6 7 6 4 / 8 9 7 5 6 8 7 4 / 5 3 2 1 0 2 1 0',
  'i IV i VII III IV ii V','III VII IV i IV ii V V'],
 [18,'meiling','紅蓮の歩法',67,'minor',6,'drive',
  '4 0 2 4 7 6 4 - / 3 1 3 5 8 7 5 3 / 2 4 6 7 6 4 2 1 / 0 2 4 5 4 1 6 4',
  '7 4 9 7 10 9 7 6 / 8 5 7 8 10 8 7 5 / 9 7 6 4 7 9 8 6 / 5 4 2 3 1 4 0 -',
  'i iv VI V i III iv V','VI III VII i iv VI ii V'],
 [19,'library','六曜の書塵',66,'minor',8,'mystic',
  '0 - 4 2 6 5 4 - / 2 3 5 - 4 2 1 0 / 4 6 7 - 6 4 3 2 / 1 - 3 4 6 4 1 -',
  '7 6 4 5 8 7 5 3 / 6 5 3 4 7 6 4 2 / 5 7 9 8 7 5 4 3 / 4 3 1 - 6 4 0 -',
  'i iv VI III ii V i V','VI III iv i VI ii V V'],
 [20,'patchouli','月の余白',66,'minor',6,'arpeggio',
  '0 4 2 6 4 7 6 4 / 1 5 3 7 5 8 7 5 / 2 6 4 8 6 9 8 6 / 1 4 6 8 7 6 4 1',
  '9 7 4 6 8 7 5 3 / 8 6 3 5 7 6 4 2 / 7 9 10 7 8 9 6 4 / 5 4 6 3 2 1 0 -',
  'i VI iv V III VII ii V','III VI VII i iv VI V V'],
 [21,'clock','秒針の迷廊',59,'minor',7,'syncopated',
  '0 - 4 0 2 - 6 4 / 1 - 5 3 6 5 3 - / 2 4 - 7 6 4 2 1 / 3 - 1 4 6 4 0 -',
  '7 6 4 - 9 8 6 4 / 8 7 5 3 7 - 5 2 / 9 7 4 6 8 6 3 5 / 6 4 2 - 1 4 0 -',
  'i VII VI V iv III ii V','VI III iv i VII VI V V'],
 [22,'sakuya','一瞬の銀',59,'minor',6,'syncopated',
  '4 0 4 2 6 4 6 3 / 5 1 5 3 7 5 7 - / 6 2 6 4 8 7 4 2 / 5 3 1 6 4 2 1 -',
  '9 - 7 4 8 - 6 3 / 10 8 5 7 9 7 4 6 / 11 9 7 6 8 6 4 2 / 5 6 4 3 1 4 0 -',
  'i VI ii V i iv VI V','III VII VI V iv VI ii V'],
 [23,'roof','胸壁の上の月',64,'minor',8,'lyric',
  '4 7 6 4 2 - 3 4 / 5 8 7 5 3 2 1 - / 6 9 7 6 4 3 2 4 / 5 4 2 1 6 4 1 -',
  '9 7 6 5 7 9 10 9 / 8 6 5 4 6 8 9 8 / 7 9 11 9 8 7 6 5 / 4 6 5 3 2 1 0 -',
  'i III VI VII iv VI V V','VI VII III i iv VI ii V'],
 [24,'remilia','夜潮の冠',64,'minor',6,'drive',
  '0 4 7 9 7 6 4 2 / 5 7 10 9 8 7 5 3 / 6 8 9 11 9 8 6 4 / 4 6 8 7 6 4 1 -',
  '11 9 7 6 9 8 7 4 / 10 8 6 5 8 7 6 3 / 9 7 5 4 7 9 8 6 / 5 3 4 6 4 1 0 -',
  'i VI III VII iv VI ii V','VI III VII i iv VI V V'],
 [25,'basement','灯らぬ七つの窓',61,'minor',7,'mystic',
  '0 1 4 2 7 6 4 - / 5 4 2 3 1 4 6 - / 2 3 6 4 9 8 6 2 / 1 4 6 7 6 4 1 -',
  '7 9 8 6 4 - 5 7 / 8 10 9 7 5 3 4 6 / 9 8 6 7 10 9 7 5 / 6 4 3 1 2 4 0 -',
  'i VI iv V III VI ii V','VI iv III VII iv VI V V'],
 [26,'flandre','暁の外の遊戯室',61,'minor',6,'playful',
  '7 0 4 2 9 4 8 6 / 5 9 10 7 11 8 6 4 / 2 6 4 8 7 9 6 2 / 3 5 1 4 6 3 0 -',
  '9 7 10 8 11 9 7 4 / 8 6 9 7 10 8 6 3 / 7 5 8 6 9 7 5 2 / 6 4 7 5 3 1 0 -',
  'i VI III V iv VII ii V','VI III iv i VI ii V V'],
 [27,'clear','夜明けの静かな神社',62,'major',8,'lyric',
  '0 2 4 7 6 4 2 - / 3 5 7 6 5 3 2 1 / 4 6 7 9 7 6 4 2 / 3 2 1 4 2 1 0 -',
  '7 9 8 7 5 4 5 7 / 6 8 7 6 4 3 4 6 / 5 7 9 8 7 5 4 2 / 3 4 2 1 0 2 0 -',
  'I vi IV V I iii ii V','IV I vi iii IV ii V V'],
 [28,'over','灯へ帰る',62,'minor',9,'lyric',
  '4 - 3 2 0 - 1 2 / 5 4 2 - 3 2 1 - / 2 4 3 1 0 - 2 1 / 3 1 4 2 1 0 - -',
  '7 6 5 3 4 5 4 - / 6 5 4 2 3 4 3 - / 5 7 6 4 2 3 1 - / 4 3 2 1 2 4 0 -',
  'i VI iv V III VI ii V','VI III iv i VI ii V i'],
 [29,'victory','封印がほどける',62,'major',6,'fanfare',
  '0 2 4 7 - 7 9 11 / 10 8 6 4 5 6 7 -',
  '0 2 4 7 - 7 9 11 / 10 8 6 4 5 6 7 -','I I','I I'],
 [30,'lake','こおりぼしのさざなみ',69,'major',7,'dance',
  '0 2 4 2 1 3 2 - / 3 5 4 2 3 1 0 1 / 4 6 5 3 4 2 1 2 / 3 2 0 1 4 2 1 0',
  '7 9 7 6 4 5 7 8 / 6 8 6 5 3 4 6 7 / 5 7 9 8 7 5 4 2 / 3 5 4 2 1 2 0 -',
  'I vi ii V IV I ii V','IV I vi iii IV ii V V'],
 [31,'cirno','あさつゆのこおりあそび',69,'major',6,'playful',
  '7 4 0 4 8 7 5 2 / 6 4 1 4 9 8 7 - / 5 3 0 3 7 6 4 1 / 4 2 1 3 5 4 0 -',
  '9 7 8 6 7 5 6 4 / 10 8 9 7 8 6 7 5 / 11 9 7 8 6 7 5 4 / 6 4 5 3 2 1 0 -',
  'I IV vi V I ii IV V','IV I ii vi IV ii V V'],
 [32,'forest','宵闇の散歩道',62,'minor',8,'mystic',
  '0 - 4 2 1 - 0 2 / 2 4 6 5 4 2 1 - / 3 - 5 4 2 1 2 3 / 4 3 1 2 6 4 0 -',
  '7 6 4 - 5 7 8 7 / 6 5 3 4 6 7 5 3 / 5 7 9 7 6 5 4 2 / 3 1 4 6 4 2 0 -',
  'i VI III VII iv i V V','VI III iv i VI ii V V'],
 [33,'rumia','月を隠すリボン',60,'minor',7,'playful',
  '0 4 - 2 1 4 0 - / 4 3 2 1 0 4 6 - / 5 2 - 0 6 2 5 - / 2 1 0 6 5 1 4 -',
  '7 0 2 - 7 6 4 3 / 5 7 9 7 5 4 2 - / 8 1 3 5 8 7 5 4 / 6 4 2 1 3 4 0 -',
  'i VI iv V i III VII V','VI III iv i VII VI V V'],
 [34,'ending','おかえり、夜明けの空',62,'major',9,'lyric',
  '2 4 7 - 6 4 2 - / 3 5 7 6 5 3 2 - / 4 6 9 7 6 4 3 2 / 3 2 1 4 2 1 0 -',
  '7 9 8 7 5 4 2 - / 6 8 7 6 4 3 1 - / 5 7 9 8 7 5 4 2 / 3 4 2 1 0 - 0 -',
  'I vi IV V I iii ii V','IV I vi iii IV ii V I'],
];
const scales={minor:[0,2,3,5,7,8,10],major:[0,2,4,5,7,9,11],dorian:[0,2,3,5,7,9,10]};
const degrees={i:0,ii:1,iii:2,iv:3,v:4,vi:5,vii:6};
const rhythms=[[2,2,2,2,1,1,2,4],[3,1,2,2,3,1,2,2],[2,1,1,2,2,2,2,4],[4,2,2,3,1,1,1,2],[1,1,2,1,1,2,4,4]];
const phrase=s=>s.split(' / ').map(p=>p.split(' ').map(n=>n==='-'?null:+n));
const pitch=(m)=>{while(m>95)m-=12;while(m<36)m+=12;return m-35;};
const tracks=themes.map(([id,key,title,tonic,mode,speed,style,a,b,ha,hb])=>{
 const A=phrase(a),B=phrase(b),scale=scales[mode],chordsA=ha.split(' '),chordsB=hb.split(' ');
 const degree=d=>tonic+Math.floor(d/7)*12+scale[(d%7+7)%7];
 const form=style==='fanfare'?[['Fanfare',2]]:speed===9?[['Intro',4],['A',8],['B',8],['Coda',4]]:speed===8?[['Intro',4],['A',8],['B',8],['Reprise',8]]:[['Intro',4],['A',8],['B',8],['Bridge',speed===6?8:4],['Reprise',8]];
 const bars=[];
 for(const [section,count]of form)for(let i=0;i<count;i++){
  const isB=section==='B'||section==='Bridge',chord=(isB?chordsB:chordsA)[i%(isB?chordsB.length:chordsA.length)],d=degrees[chord.toLowerCase()],major=chord===chord.toUpperCase();
  const rootNote=36+tonic%12+scale[d],third=major?4:3,triad=[0,third,7,12];
  const tune=[...(isB?B:A)[i%(isB?B.length:A.length)]],rhythm=rhythms[(i+themes.findIndex(t=>t[0]===id)+(isB?2:0))%rhythms.length];
  if(section==='Intro')for(let j=1;j<8;j+=3)tune[j]=null;
  if(section==='Bridge'){tune.reverse();tune[7]=d+4;}
  if(section==='Reprise'&&i<4)for(let j=0;j<8;j++)if(tune[j]!==null&&degree(tune[j]+7)<=95)tune[j]+=7;
  if(section==='Coda'){tune[4]=2;tune[5]=1;tune[6]=0;tune[7]=null;}
  const lead=[];
  for(let j=0;j<8;j++){
   let note=tune[j]===null?R:pitch(degree(tune[j]));
   if(note&&chord==='V'&&mode!=='major'&&tune[j]%7===6)note=pitch(degree(tune[j])+1);
   const length=style==='fanfare'?2:rhythm[j];lead.push(note,...Array(length-1).fill(H));
   if(['dance','playful','syncopated'].includes(style)&&length>1&&(j+i)%3===1)lead[lead.length-1]=R;
  }
  if((section==='B'||section==='Reprise')&&['drive','arpeggio','playful'].includes(style)&&i%2===1){
   const n=tune[6]??4;for(let j=0;j<4;j++)lead[12+j]=pitch(degree(n+[0,1,2,-1][j]));
  }
  // Bass changes role by section: breathing roots, syncopation, broken chords,
  // then a separate walking answer. It never repeats a fixed 32-note ostinato.
  const bass=Array(16).fill(H),density=section==='Intro'?0:section==='Bridge'?1:section==='B'||section==='Reprise'?3:2;
  const pattern=density===0?[[0,0],[6,7],[10,12],[14,7]]:density===1?[[0,12],[4,third],[8,7],[12,12],[14,third]]:density===2?[[0,0],[3,7],[6,12],[8,third],[11,7],[14,12]]:[[0,0],[2,7],[4,third],[6,12],[8,7],[10,third],[12,12],[14,7]];
  for(const [at,interval]of pattern)bass[at]=pitch(rootNote+interval);
  if((i&1)&&density>1){bass[13]=pitch(rootNote+12);bass[15]=pitch(rootNote+(major?11:10));}
  if(style==='syncopated'){bass[5]=R;bass[9]=R;}
  if(style==='mystic'&&section==='Bridge'){bass[4]=pitch(rootNote+19);bass[12]=pitch(rootNote+third+12);}
  if(section==='Coda'&&i===count-1){for(let j=8;j<16;j++){lead[j]=H;bass[j]=H;}lead[8]=pitch(tonic);bass[8]=pitch(36+tonic%12);lead[15]=R;bass[15]=R;}
  const bright=section==='B'||section==='Reprise',duty=style==='mystic'?128:bright?64:128,envelope=(bright?0x82:section==='Intro'?0x63:0x72),level=0x60;
  assert.equal(lead.length,16);assert.ok([...lead,...bass].every(n=>n===R||n===H||(n>=1&&n<=60)));
  bars.push({section,chord,duty,envelope,level,lead,bass});
 }
 return {id,key:'kouma_'+key,title,tonic,mode,speed,loop:style!=='fanfare',style,seconds:+(bars.length*16*speed/HZ).toFixed(3),form,bars};
});
const score={format:'caravan-banked-score-v1',author:'Original fan-game score, 2026-09-12',channels:{melody:'pulse 2',accompaniment:'wave 3',effects:'pulse 1 and noise 4 reserved'},timing:'Sixteenth-note rows measured in actual VBlanks; MIDI is a score audition, not ROM audio.',tracks};
fs.writeFileSync(path.join(__dirname,'score.json'),JSON.stringify(score,null,2)+'\n');
fs.writeFileSync(path.join(root,'engine/caravan/assets-src/kouma-score.json'),JSON.stringify(score,null,2)+'\n');
// Standard MIDI File, 480 PPQN, matching all rests, holds and the full form.
function vlq(n){const a=[n&127];while(n>>=7)a.unshift((n&127)|128);return Buffer.from(a);}
function midi(song){const blocks=[];for(let channel=0;channel<2;channel++){const notes=song.bars.flatMap(b=>channel?b.bass:b.lead),events=[];let last=0,active=0;const push=(time,data)=>{events.push(vlq(time-last),Buffer.from(data));last=time;};
 push(0,[0xc0+channel,channel?38:80]);if(!channel){const us=Math.round(song.speed/HZ*4e6);push(0,[0xff,0x51,3,(us>>16)&255,(us>>8)&255,us&255]);}
 notes.forEach((n,row)=>{if(n===H)return;if(active)push(row*120,[0x80+channel,active,0]);active=n?n+35:0;if(active)push(row*120,[0x90+channel,active,channel?64:90]);});if(active)push(notes.length*120,[0x80+channel,active,0]);push(notes.length*120,[0xff,0x2f,0]);const data=Buffer.concat(events),head=Buffer.alloc(8);head.write('MTrk');head.writeUInt32BE(data.length,4);blocks.push(head,data);}
 const head=Buffer.from([77,84,104,100,0,0,0,6,0,1,0,2,1,224]);return Buffer.concat([head,...blocks]);}
fs.mkdirSync(path.join(__dirname,'midi'),{recursive:true});for(const song of tracks)fs.writeFileSync(path.join(__dirname,'midi',`${song.id}-${song.key}.mid`),midi(song));
console.table(tracks.map(t=>({id:t.id,title:t.title,seconds:t.seconds,bars:t.bars.length,distinctMelodyBars:new Set(t.bars.map(b=>b.lead.join(','))).size,loop:t.loop})));
