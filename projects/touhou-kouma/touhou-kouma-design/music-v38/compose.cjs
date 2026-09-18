// Original v38 rearrangement, MIT. Run from any cwd; the immutable v13 score
// supplies the established themes. No imported music or sampled instruments.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../../..'), HZ = 59.727500569606, H = 255;
const original = JSON.parse(fs.readFileSync(path.join(__dirname, '../music-v13/score.json')));
const scales = {minor:[0,2,3,5,7,8,10], major:[0,2,4,5,7,9,11], dorian:[0,2,3,5,7,9,10]};
const names = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const note = n => { while(n > 95) n -= 12; while(n < 36) n += 12; return n - 35; };
const degree = (d, tonic, mode) => tonic + Math.floor(d / 7) * 12 + scales[mode][(d % 7 + 7) % 7];
const configs = [
 // stage, road, boss, row ticks, lead duty (road/boss), wave, B key, bridge key
 [1,32,33,6,5.5,128,64,1,[3,'major'],[5,'minor'],'木管風の丸い音と跳ねる低音'],
 [2,30,31,5.5,5,0,64,2,[3,'major'],[7,'major'],'細いベル音と氷のアルペジオ'],
 [3,17,18,5.5,5,64,0,3,[3,'major'],[7,'minor'],'撥弦風の短い音と裏拍の跳躍'],
 [4,19,20,5.5,5,128,64,4,[3,'major'],[7,'minor'],'オルガン風の持続音と分散和音'],
 [5,21,22,5,4.5,0,0,5,[3,'minor'],[7,'minor'],'硬い金属音とシンコペーション'],
 [6,23,24,5.5,5,64,128,6,[3,'minor'],[8,'major'],'厚い鋸歯状の音と疾走する低音'],
 [7,25,26,5,4.5,128,0,7,[3,'major'],[6,'minor'],'歪んだ玩具音と交差する音型'],
];
const rhythms = [
 [2,1,1,2,2,3,1,4], [1,1,2,2,1,1,4,4], [3,1,2,1,1,2,2,4],
 [2,2,1,1,2,2,3,3], [1,2,1,3,1,2,2,4], [2,1,1,2,3,1,2,4], [1,1,2,1,1,4,2,4],
];
const forms = {
 6:[['Intro',2],['A',8],['B',8],['Bridge',4],['Reprise',12],['Turnaround',2]],
 5.5:[['Intro',4],['A',8],['B',8],['Bridge',8],['Reprise',8],['Turnaround',4]],
 5:[['Intro',4],['A',8],['Development',4],['B',8],['Bridge',8],['Reprise',8],['Turnaround',4]],
 4.5:[['Intro',2],['A',8],['Development',8],['B',8],['Bridge',8],['Reprise',12],['Turnaround',4]],
};
const roman = {I:0,i:0,ii:1,III:2,iii:2,IV:3,iv:3,V:4,vi:5,VI:5,VII:6};
const harmony = {
 minor:['i','VI','iv','V','III','VII','iv','V'],
 major:['I','vi','IV','V','iii','vi','ii','V'],
 dorian:['i','IV','VII','i','III','IV','ii','V'],
};
function scaleDegree(midi, t) {
 const rel=midi-t.tonic, octave=Math.floor(rel/12), pc=(rel%12+12)%12;
 let closest=0; for(let i=1;i<7;i++) if(Math.abs(scales[t.mode][i]-pc)<Math.abs(scales[t.mode][closest]-pc)) closest=i;
 return octave*7+closest;
}
function nearChord(midi, root, intervals) {
 let best=midi, distance=100;
 for(let oct=-3;oct<5;oct++) for(const d of intervals){const p=root+12*oct+d;if(p<48||p>95)continue;if(Math.abs(p-midi)<distance){best=p;distance=Math.abs(p-midi);}}
 return best;
}
function arrange(t,c,boss) {
 const [stage,,,,,roadDuty,bossDuty,wave,bKey,bridgeKey,description]=c;
 const ticks=c[boss?4:3],form=forms[ticks],bars=[];
 const keyFor=section=>section==='B'?[t.tonic+bKey[0],bKey[1]]:section==='Bridge'?[t.tonic+bridgeKey[0],bridgeKey[1]]:[t.tonic,t.mode];
 for(let si=0;si<form.length;si++){
  const [section,count]=form[si], [tonic,mode]=keyFor(section);
  for(let i=0;i<count;i++){
   const sourceSection=['B','Bridge','Development'].includes(section)?'B':'A';
   const sourceBars=t.bars.filter(b=>b.section===sourceSection),source=sourceBars[(i+(section==='Development'?2:0))%sourceBars.length];
   let tune=source.lead.filter(n=>n!==H).slice(0,8).map(n=>n?scaleDegree(n+35,t):null);
   while(tune.length<8)tune.push(tune[tune.length%4]);
   if(section==='Bridge')tune=tune.slice(4).concat(tune.slice(0,4));
   if(section==='Reprise'&&i<4)tune=tune.map(d=>d===null?null:d+7);
   if(section==='Development')tune=tune.map((d,j)=>d===null?null:d+(j%3===0?2:0));
   const chord=harmony[mode][i%8],chordRoot=36+tonic%12+scales[mode][roman[chord]],third=chord===chord.toUpperCase()?4:3,triad=[0,third,7];
   const rhythm=rhythms[(stage-1+i+(boss?2:0)+(section==='B'?1:0))%rhythms.length],lead=[];
   for(let j=0;j<8;j++){
    const duration=rhythm[j];let midi=tune[j]===null?null:degree(tune[j],tonic,mode);
    if(midi!==null&&lead.length%4===0)midi=nearChord(midi,chordRoot,triad);
    // More attacks without a wall of sixteenth notes; leave breathing room.
    if(section==='Intro'&&j%3===1)midi=null;
    lead.push(midi===null?0:note(midi),...Array(duration-1).fill(H));
    if(duration>1&&[2,3,5,7].includes(stage)&&(j+i)%3===1)lead[lead.length-1]=0;
   }
   if(boss&&i%2===1&&section!=='Intro')for(let j=0;j<4;j++)lead[12+j]=note(chordRoot+24+[0,third,7,12][(j+i)%4]);
   const bass=Array(16).fill(H),root=chordRoot;
   const pulse=section==='Bridge'?[[0,0],[4,7],[8,12],[12,third]]:
    stage===3?[[0,0],[3,12],[6,7],[8,0],[11,third],[14,7]]:
    stage===5?[[0,0],[2,7],[5,12],[6,third],[8,0],[11,7],[13,12],[15,7]]:
    stage===2||stage===4?[[0,0],[2,third],[4,7],[6,12],[8,third],[10,7],[12,12],[14,7]]:
    [[0,0],[2,12],[4,7],[6,12],[8,0],[10,third],[12,7],[14,12]];
   for(const [at,interval]of pulse)bass[at]=note(root+interval);
   if(stage===1||stage===3||stage===5||stage===7)for(const [at]of pulse)if(at<15&&bass[at+1]===H)bass[at+1]=0;
   if(boss&&i%4===3){bass[12]=note(root+7);bass[13]=note(root+12);bass[14]=note(root+third+12);bass[15]=note(root+7);}
   if(section==='Intro'){for(let j=0;j<16;j++)if(j%4)bass[j]=H;}
   let duty=boss?bossDuty:roadDuty,envelope=stage===4?0x83:stage===2?0x91:stage===5?0x81:stage===6?0x92:0x82;
   if(section==='Bridge'){duty=duty===128?64:128;envelope=0x73;}
   if(section==='Intro')envelope=0x72;
   const b={section,tonic,mode,chord,duty,envelope,level:96,wave,lead,bass};
   // Prepare each actual key change with the destination dominant seventh.
   // The final dominant likewise resolves into the first tonic on looping.
   const [nextTonic,nextMode]=keyFor(form[(si+1)%form.length][0]);
   if(i===count-1&&(nextTonic!==tonic||nextMode!==mode||section==='Turnaround')){
    b.tonic=nextTonic;b.mode=nextMode;b.chord='V7';b.pivot=true;
    const dominant=36+nextTonic%12+7;
    for(let j=0;j<16;j++){b.lead[j]=j%2?H:note(dominant+24+[0,4,7,10,7,4,2,4][j>>1]);b.bass[j]=j%2?H:note(dominant+[0,7,4,10,12,7,4,7][j>>1]);}
   }
   assert.equal(lead.length,16);assert.equal(bass.length,16);
   assert.ok([...lead,...bass].every(n=>n===H||Number.isInteger(n)&&n>=0&&n<=60));
   bars.push(b);
  }
 }
 return {...t,speed:Math.floor(ticks),speedHalf:ticks%1!==0,bpm:+(HZ*15/ticks).toFixed(2),seconds:+(bars.length*16*ticks/HZ).toFixed(3),stage,role:boss?'boss':'road',instrument:description,form,bars};
}
const tracks=original.tracks.map(t=>{const c=configs.find(c=>c[1]===t.id||c[2]===t.id);return c?arrange(t,c,c[2]===t.id):t;});
const score={...original,arrangement:'v38: stage-specific wave instruments, faster fractional tempos, prepared key changes and return cadences',tracks};
// 32 four-bit samples per wave. Original additive shapes, not audio samples.
const waveSpecs=[['legacy-triangle',null],['forest-reed',[1,0,.15]],['ice-glass',[1,0,.55,0,.3]],['gate-pluck',[1,.6,.3,.2]],['library-organ',[1,0,.8,0,.4]],['clock-metal',[1,.45,.65,0,.25]],['mansion-brass',[1,.5,.33,.25,.2,.16]],['basement-toy',[1,0,.9,0,.7,0,.5]]];
const waves=waveSpecs.map(([name,harmonics])=>{
 if(!harmonics)return {name,samples:[...Array.from({length:16},(_,i)=>i),...Array.from({length:16},(_,i)=>15-i)]};
 const raw=Array.from({length:32},(_,i)=>harmonics.reduce((s,h,j)=>s+h*Math.sin(2*Math.PI*i*(j+1)/32),0)),peak=Math.max(...raw.map(Math.abs));
 const samples=raw.map((n,i)=>Math.max(0,Math.min(15,Math.round(7.5+7.5*n/peak))));
 // Zero crossings alternate 7/8; preserve exact DC midpoint after quantization.
 samples[0]=7;samples[16]=8;
 assert.equal(samples.reduce((s,n)=>s+n,0),240);
 return {name,samples};
});
const write=(file,data)=>fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
write(path.join(__dirname,'score.json'),score);write(path.join(root,'engine/caravan/assets-src/kouma-score.json'),score);
const bank={license:'MIT',provenance:'Original additive synthesis; v38 composer, no sampled recordings',waves};
write(path.join(__dirname,'wave-bank.json'),bank);write(path.join(root,'engine/caravan/assets-src/music-waves.json'),bank);
const changed=tracks.filter(t=>t.stage);
const audit=changed.map(t=>({id:t.id,stage:t.stage,role:t.role,title:t.title,oldBpm:+(HZ*15/original.tracks.find(o=>o.id===t.id).speed).toFixed(2),bpm:t.bpm,seconds:t.seconds,bars:t.bars.length,keys:[...new Set(t.bars.map(b=>names[b.tonic%12]+' '+b.mode))],wave:waves[t.bars[0].wave].name,uniqueLeadBars:new Set(t.bars.map(b=>b.lead.join(','))).size,form:t.form}));
write(path.join(__dirname,'audit.json'),audit);
// Editing reference MIDI follows the exact same notes and average row tempo.
// Its GM voices are notation aids, not an emulation of the custom GB waves.
function vlq(n){const a=[n&127];while(n>>=7)a.unshift((n&127)|128);return Buffer.from(a);}
function midi(t){const blocks=[];for(let channel=0;channel<2;channel++){
 const rows=t.bars.flatMap(b=>channel?b.bass:b.lead),events=[];let last=0,active=0;
 const push=(time,data)=>{events.push(vlq(time-last),Buffer.from(data));last=time;};push(0,[0xc0+channel,channel?38:80]);
 if(!channel){const us=Math.round((t.speed+(t.speedHalf?.5:0))/HZ*4e6);push(0,[0xff,0x51,3,(us>>16)&255,(us>>8)&255,us&255]);}
 rows.forEach((n,i)=>{if(n===H)return;if(active)push(i*120,[0x80+channel,active,0]);active=n?n+35:0;if(active)push(i*120,[0x90+channel,active,channel?65:90]);});
 if(active)push(rows.length*120,[0x80+channel,active,0]);push(rows.length*120,[0xff,0x2f,0]);const data=Buffer.concat(events),head=Buffer.alloc(8);head.write('MTrk');head.writeUInt32BE(data.length,4);blocks.push(head,data);
 }return Buffer.concat([Buffer.from([77,84,104,100,0,0,0,6,0,1,0,2,1,224]),...blocks]);}
fs.mkdirSync(path.join(__dirname,'midi'),{recursive:true});for(const t of changed)fs.writeFileSync(path.join(__dirname,'midi',`${t.id}-${t.key}.mid`),midi(t));
console.table(audit.map(({id,stage,role,oldBpm,bpm,seconds,wave,uniqueLeadBars})=>({id,stage,role,oldBpm,bpm,seconds,wave,uniqueLeadBars})));
