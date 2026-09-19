import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {ArrangedSong, MusicBar} from "./music-data";

type Note={pitch:number;velocity:number;start:number;end:number;channel:number};
type Entry={id:number;file:string;sha256:string;duty:number;counterDuty:number;wave:number;title:string};
const HZ=4194304/70224;
function requireThat(ok:unknown,message:string):asserts ok {if(!ok)throw Error(`Invalid MIDI soundtrack: ${message}`);}

/** Strict importer for the reviewed three-voice SMF files; no polyphonic reduction at build time. */
export function decodeThreeVoiceMidi(bytes:Buffer) {
    let pos=0;
    const take=(n:number)=>{requireThat(n>=0&&pos+n<=bytes.length,"truncated data");const b=bytes.subarray(pos,pos+n);pos+=n;return b;};
    const vlq=()=>{let n=0,b,count=0;do{b=take(1)[0];n=n*128+(b&127);requireThat(++count<=4,"VLQ");}while(b&128);return n;};
    requireThat(take(4).toString()==="MThd","header");const h=take(take(4).readUInt32BE());
    requireThat(h.length===6&&h.readUInt16BE(0)===1&&h.readUInt16BE(2)===4&&h.readUInt16BE(4)===480,"expected SMF1, 480 PPQ, conductor + 3 voices");
    const voices:Note[][]=[],tempos:number[]=[],markers:{tick:number;name:string}[]=[],meters:number[][]=[];let endTick=-1;
    for(let t=0;t<4;t++){
        requireThat(take(4).toString()==="MTrk","track header");const length=take(4).readUInt32BE(),end=pos+length;
        let tick=0,running=0,ended=false,active:Note|undefined;const notes:Note[]=[];
        while(pos<end){
            tick+=vlq();let status=bytes[pos];if(status&128){pos++;if(status<240)running=status;}else{requireThat(running,"running status");status=running;}
            if(status===255){
                const type=take(1)[0],data=take(vlq());
                if(type===81){requireThat(t===0&&tick===0&&data.length===3,"single initial conductor tempo");tempos.push(data.readUIntBE(0,3));}
                if(type===88){requireThat(t===0&&tick===0,"meter position");meters.push([...data]);}
                if(type===6)markers.push({tick,name:data.toString("utf8")});
                if(type===47){requireThat(data.length===0&&pos===end,"end of track");ended=true;break;}
            }else if(status===240||status===247){take(vlq());running=0;}
            else{
                requireThat(status>=128&&status<240,"unsupported event");
                const kind=status>>4,channel=status&15,a=take(1)[0],b=kind===12||kind===13?0:take(1)[0];requireThat(a<128&&b<128,"data byte");
                if(kind===9&&b){
                    requireThat(t>0&&channel===[-1,1,0,2][t],"voice channel order CH2/CH1/CH3");requireThat(!active,"overlapping notes");
                    requireThat(a>=36&&a<=95&&tick%120===0,"note range/grid");active={pitch:a,velocity:b,start:tick,end:-1,channel};notes.push(active);
                }else if(kind===8||(kind===9&&!b)){
                    requireThat(active&&active.pitch===a&&active.channel===channel,"unmatched note off");requireThat(tick>active.start&&tick%120===0,"note duration/grid");active.end=tick;active=undefined;
                }else requireThat(kind===12,"only GM program changes and notes are supported");
            }
            requireThat(pos<=end,"track overrun");
        }
        requireThat(ended&&!active,"unterminated track/note");requireThat(endTick<0||endTick===tick,"track lengths differ");endTick=tick;
        if(t)voices.push(notes);else requireThat(!notes.length,"conductor notes");
    }
    requireThat(pos===bytes.length&&tempos.length===1&&tempos[0]>0,"tempo/trailing data");
    requireThat(meters.length===1&&meters[0].length===4&&meters[0][0]===4&&meters[0][1]===2,"4/4 meter required");
    requireThat(endTick>0&&endTick%1920===0&&endTick<=64*1920,"bar count");
    requireThat(markers.some(m=>m.name==="LOOP_START"&&m.tick===0)&&markers.some(m=>m.name==="LOOP_END"&&m.tick===endTick),"loop markers");
    const frameRows=tempos[0]/4e6*HZ,speed=Math.round(frameRows*2)/2;
    requireThat(speed>=1&&speed<=60&&Math.abs(speed-frameRows)<.00002,"tempo must use integer/half VBlanks");
    requireThat(voices.every(ns=>ns.length>0&&ns.at(-1)!.end<=endTick-240),"release voices before loop");
    return {voices,rows:endTick/120,speed,markers};
}

export function importMidiMusic(manifestFile:string):ArrangedSong[]{
    const manifest=JSON.parse(fs.readFileSync(manifestFile,"utf8"));
    requireThat(manifest.format==="caravan-midi-import-v1"&&Array.isArray(manifest.tracks)&&manifest.tracks.length>0,"manifest");
    const ids=new Set<number>();
    return manifest.tracks.map((entry:Entry)=>{
        requireThat(Number.isInteger(entry.id)&&entry.id>=16&&entry.id<=37&&!ids.has(entry.id),"duplicate/out-of-range ID");ids.add(entry.id);
        requireThat(typeof entry.file==="string"&&/^[\w.-]+\.mid$/.test(entry.file)&&!entry.file.includes(".."),"MIDI filename");
        requireThat([0,64,128,192].includes(entry.duty)&&[0,64,128,192].includes(entry.counterDuty)&&Number.isInteger(entry.wave)&&entry.wave>=0&&entry.wave<=7,"instruments");
        const bytes=fs.readFileSync(path.join(path.dirname(manifestFile),entry.file));
        requireThat(crypto.createHash("sha256").update(bytes).digest("hex")===entry.sha256,`SHA-256 mismatch: ${entry.file}`);
        const midi=decodeThreeVoiceMidi(bytes),notes=midi.voices.map(()=>Array<number>(midi.rows).fill(0)),levels=midi.voices.map(()=>Array<number>(midi.rows).fill(0));
        for(const [v,ns]of midi.voices.entries())for(const n of ns){
            const start=n.start/120,end=n.end/120;
            const volume=v===2?(n.velocity>=76?64:96):Math.max(1,Math.min(15,Math.round(n.velocity/127*(v===0?12:9))))<<4;
            notes[v][start]=n.pitch-35;
            for(let r=start;r<end;r++){if(r>start)notes[v][r]=255;levels[v][r]=volume;}
        }
        const bars:MusicBar[]=[];
        for(let row=0;row<midi.rows;row+=16){
            const section=midi.markers.filter(m=>m.tick<=row*120&&m.name!=="LOOP_START").at(-1)?.name??"Intro";
            const slice=(a:number[])=>a.slice(row,row+16);
            bars.push({section,chord:"source MIDI",duty:entry.duty,envelope:128,level:64,wave:entry.wave,
                lead:slice(notes[0]),counter:slice(notes[1]),bass:slice(notes[2]),counterDuty:entry.counterDuty,
                leadEnvelope:slice(levels[0]),counterEnvelope:slice(levels[1]),bassLevel:slice(levels[2])});
        }
        return {id:entry.id,key:entry.file.replace(/\.mid$/,""),title:entry.title,speed:Math.floor(midi.speed),speedHalf:!Number.isInteger(midi.speed),loop:true,bars};
    });
}
