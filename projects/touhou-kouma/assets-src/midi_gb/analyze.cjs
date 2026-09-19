'use strict';
const fs = require('node:fs'), path = require('node:path');
const {parseMidi, sha256, round, noteName} = require('./midi-lib.cjs');
const source = path.resolve(__dirname, '../midi_org');

// RipX's tempo map supplies beat time but its note attacks have a small global phase.
// Use prominent melodic attacks; never infer the chorus from density alone.
function phaseFor(m, scale) {
    let best = {cost:Infinity, phase:0};
    const notes = m.notes.filter(n=>n.channel!==9 && n.velocity>=65 && n.pitch>=55 && n.pitch<=90);
    for(let i=0;i<128;i++) {
        const phase=i/128, cost=notes.reduce((sum,n)=>{
            const r=(n.start/m.ppq*scale-phase)*4, d=Math.abs(r-Math.round(r));
            return sum + Math.min(.3,d)**2 * n.velocity;
        },0);
        if(cost<best.cost)best={cost,phase};
    }
    return best.phase % .25;
}

function quantize(m, config) {
    const scale=config.beatScale??1, phase=config.phase??phaseFor(m,scale);
    return m.notes.filter(n=>n.channel!==9).map(n=>({
        ...n, qStart:Math.round((n.start/m.ppq*scale-phase)*4),
        qEnd:Math.max(Math.round((n.start/m.ppq*scale-phase)*4)+1,Math.round((n.end/m.ppq*scale-phase)*4)),
        rawDuration:(n.end-n.start)/m.ppq*scale,
    }));
}

function melodyPath(notes, start, end, options={}) {
    const {tracks={},low=60,high=88,center=75,velocity=35}=options;
    const candidates=notes.filter(n=>n.qEnd>start&&n.qStart<end&&n.pitch>=low&&n.pitch<=high&&n.velocity>=velocity&&n.rawDuration>=.13&&(tracks[n.track]??0)>0);
    let prev=[{n:null,cost:0,prev:null}];
    for(let row=start;row<end;row++) {
        const active=candidates.filter(n=>n.qStart<=row&&n.qEnd>row);
        // Collapse identical pitches: the loudest/most trusted track supplies provenance.
        const byPitch=new Map();
        for(const n of active) {
            const merit=n.velocity/127+(tracks[n.track]??0)*.35;
            if(!byPitch.has(n.pitch)||merit>byPitch.get(n.pitch).merit)byPitch.set(n.pitch,{n,merit});
        }
        const states=[null,...[...byPitch.values()].map(v=>v.n)].map(n=>{
            let winner=null;
            for(const p of prev) {
                const same=n&&p.n&&n.pitch===p.n.pitch;
                if(n&&!same&&n.qStart<row-1&&row!==start)continue; // no arbitrary late attacks
                const leap=n&&p.n?Math.abs(n.pitch-p.n.pitch):0;
                let cost=p.cost;
                if(n){
                    cost+=1.65*n.velocity/127+.9*(tracks[n.track]??0)-.035*Math.abs(n.pitch-center);
                    if(n.qStart===row)cost+=.35;
                    if(n.rawDuration<.23)cost-=.5;
                    if(p.n&&!same)cost-=.09*leap + (leap>12?.65:0);
                    if(same)cost+=.18;
                } else {
                    // Rests are allowed, but a weak off-register held overtone should lose.
                    cost+=.65;
                    if(p.n && p.n.qEnd>row)cost-=.5;
                }
                if(!winner||cost>winner.cost)winner={n,cost,prev:p,row};
            }
            return winner;
        }).filter(Boolean);
        prev=states;
    }
    let winner=prev.reduce((a,b)=>a.cost>b.cost?a:b); const cells=[];
    while(winner.prev){cells.push(winner.n);winner=winner.prev;}
    return cells.reverse();
}

function summarize(file, config={}) {
    const bytes=fs.readFileSync(path.join(source,file)),m=parseMidi(bytes), scale=config.beatScale??1;
    const phase=config.phase??phaseFor(m,scale),notes=quantize(m,{...config,phase});
    const tracks=config.tracks??Object.fromEntries(m.tracks.filter(t=>/Strings|Piano|Guitar/.test(t.name)&&!t.name.startsWith('Bass')).map(t=>[t.index,t.name==='Strings'?1:t.name==='Piano'?.9:.65]));
    const count=Math.ceil((m.endTick/m.ppq*scale-phase)/4), cells=melodyPath(notes,0,count*16,{tracks,...config.melody});
    const bars=[];
    for(let bar=0;bar<count;bar++){
        const seg=cells.slice(bar*16,bar*16+16),onsets=seg.filter((n,i)=>n&&(i===0||!seg[i-1]||seg[i-1].pitch!==n.pitch||n.qStart===bar*16+i));
        const bass=notes.filter(n=>n.pitch<60&&n.velocity>=65&&n.qStart>=bar*16&&n.qStart<(bar+1)*16);
        const weights=Array(12).fill(0);for(const n of bass)weights[n.pitch%12]+=n.velocity*Math.min(4,n.qEnd-n.qStart);
        bars.push({bar:bar+1,sec:round(m.secondsAt((bar*4+phase)/scale*m.ppq)),pitches:onsets.map(n=>n.pitch),melody:onsets.map(n=>noteName(n.pitch)).join(' '),mean:round(seg.filter(Boolean).reduce((a,n)=>a+n.pitch,0)/(seg.filter(Boolean).length||1)),coverage:seg.filter(Boolean).length,
            bass:weights.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v).slice(0,2).filter(x=>x.v).map(x=>noteName(x.i+36)).join(' ')});
    }
    return {file,sha256:sha256(bytes),seconds:round(m.seconds),beats:round(m.endTick/m.ppq),beatScale:scale,phase,tracks,bars};
}

if(require.main===module){
    const args=process.argv.slice(2),f=args.find(x=>x.endsWith('.mid')),scale=+(args.find(x=>x.startsWith('--scale='))?.split('=')[1]??1);
    const items=(f?[f]:fs.readdirSync(source).filter(x=>x.endsWith('.mid'))).map(file=>summarize(file,{beatScale:scale}));
    if(args.includes('--json'))console.log(JSON.stringify(items,null,2));
    else for(const x of items){console.log(x.file,'sec',x.seconds,'phase',x.phase,'tracks',JSON.stringify(x.tracks));for(const b of x.bars)console.log(String(b.bar).padStart(3),b.sec.toFixed(1).padStart(6),b.bass.padEnd(7),b.coverage.toString().padStart(2),b.melody);}
}
module.exports={source,phaseFor,quantize,melodyPath,summarize};
