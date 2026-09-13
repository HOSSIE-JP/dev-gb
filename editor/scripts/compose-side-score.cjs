/* Original two-voice score. Editable output is the engine's banked notation.
 * Phrases are explicit scale-degree melodies; harmony/voicing arranged by section. */
const fs=require('node:fs'),path=require('node:path');
const H=255,R=0,scale=[0,2,3,5,7,8,10];
const phrase={
 lift:[[0,H,2,4,H,2,1,H,0,2,4,6,5,H,4,H],[4,H,5,6,7,H,6,4,5,H,4,2,1,H,2,H]],
 run:[[0,4,7,H,6,4,2,H,1,4,6,H,5,4,2,1],[2,H,4,5,6,H,4,2,1,2,4,H,2,1,0,H],[4,2,0,H,1,2,4,H,5,4,2,1,2,H,4,H],[6,H,5,4,2,H,1,2,4,5,6,7,6,4,2,H]],
 horizon:[[7,H,H,6,5,H,4,H,2,H,4,5,6,H,H,4],[5,H,6,7,9,H,7,6,5,H,4,2,4,H,H,H],[4,H,H,2,1,H,2,4,6,H,5,4,2,H,H,1],[2,4,5,H,4,2,1,H,0,H,2,4,6,5,4,H]],
 bridge:[[0,H,R,4,H,R,2,H,1,H,R,5,H,R,4,H],[2,H,R,6,H,R,4,H,3,H,R,2,1,H,R,H]],
 ascent:[[4,5,6,7,6,4,2,H,5,6,7,9,7,6,4,H],[7,H,9,7,6,5,4,2,4,5,6,7,9,H,7,H]],
 duel:[[0,0,4,R,2,2,5,R,4,4,7,6,5,4,2,1],[0,2,4,5,4,2,1,0,6,H,5,4,2,1,2,R],[7,R,6,5,4,R,2,4,5,6,7,6,5,4,2,R],[4,5,4,2,1,2,4,6,7,H,6,5,4,2,1,H]]
};
const chords={Em:[5,3],C:[1,4],G:[8,4],D:[3,4],Am:[10,3],B:[12,4],F:[6,4]};
const arrangements={
 title:[['Intro',4,'lift',['Em','C','G','D']],['A',8,'horizon',['Em','C','G','D']],['B',8,'lift',['Am','D','G','B']],['Reprise',8,'horizon',['C','D','Em','B']],['Turnaround',4,'ascent',['Am','C','B','B']]],
 stage:[['Launch',4,'lift',['Em','C','G','D']],['Flight',12,'run',['Em','C','G','D']],['Open Sky',12,'horizon',['C','D','G','Em']],['Break',4,'bridge',['Am','C','D','B']],['Reactor Ascent',12,'ascent',['Em','D','C','B']],['Home Stretch',16,'run',['G','D','Em','C']],['Turnaround',4,'lift',['Am','C','B','B']]],
 boss:[['Warning',4,'bridge',['Em','F','Em','B']],['Pressure',8,'duel',['Em','C','Am','B']],['Counterattack',8,'ascent',['C','D','Em','B']],['Overdrive',8,'duel',['Em','D','C','B']],['Turnaround',4,'run',['Am','C','B','B']]]
};
function pitch(degree,base){return base+scale[((degree%7)+7)%7]+12*Math.floor(degree/7);}
const tracks=Object.entries(arrangements).map(([key,sections],j)=>{const bars=[];for(const [section,count,motif,progression] of sections)for(let n=0;n<count;n++){
 const chord=progression[n%progression.length],[bassRoot,third]=chords[chord],melody=phrase[motif][n%phrase[motif].length];
 const lead=melody.map((d,i)=>d===H?H:pitch(d,29)+(section==='Home Stretch'?3:0));
 // Distinct endings every four/eight bars, leaving a breath before the loop.
 if(n%4===3){lead[12]=pitch(4,29);lead[13]=pitch(3,29);lead[14]=pitch(chord==='B'?1:2,29);lead[15]=n===count-1?R:H;}
 if(chord==='B')for(let i=0;i<lead.length;i++)if(lead[i]!==H&&lead[i]%12===4)lead[i]++; // leading tone D#
 const bass=Array.from({length:16},(_,i)=>i%2?R:bassRoot+[0,12,7,12,0,third+12,7,n%4===3?11:12][i>>1]);
 if(motif==='bridge')for(let i=0;i<16;i++)if(i%4!==0)bass[i]=H;
 bars.push({section,chord,duty:motif==='horizon'?128:n%4===3?192:64,envelope:motif==='bridge'?0x92:0xb2,level:64,lead,bass});
 }return {id:35+j,key:'side-'+key,title:['STARLIGHT IGNITION','ORBITAL OVERDRIVE','REACTOR HEART'][j],speed:[7,6,5][j],loop:true,bars};});
const score={format:'caravan-banked-score-v1',title:'SIDE CARAVAN / Orbital Run',composer:'Original composition for HOSSIE-JP dev-gb, 2026-09-12',license:'MIT',notes:'Pulse 2 lead and wave 3 bass; channels 1 and 4 reserved for effects. Note 1=C2, 0=rest, 255=hold. 16 steps/bar.',tracks};
fs.writeFileSync(path.resolve(__dirname,'../../engine/caravan/assets-src/side-score.json'),JSON.stringify(score,null,2)+'\n');
console.log(tracks.map(t=>({id:t.id,bars:t.bars.length,seconds:t.bars.length*16*t.speed/59.7275})));
