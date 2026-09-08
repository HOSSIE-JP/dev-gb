import {initSync,GameBoy,GameBoyMode,BootRom,PadKey} from 'boytacean';
const el=id=>document.getElementById(id),decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const rom=decode(ROM_BYTES),saveKey='gb-playtest:'+ROM_HASH;
let gb,paused=false,ctx,nextAudio=0,last=0,accum=0,frames=0;
const held=new Map(),sources=new Set(),keys={ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',KeyZ:'A',KeyX:'B',Enter:'Start',ShiftRight:'Select',ShiftLeft:'Select'};
const canvas=el('screen'),draw=canvas.getContext('2d'),pixels=draw.createImageData(160,144);
function status(s){el('status').textContent=s;}
function clearAudio(){for(const s of sources){try{s.stop();}catch{}s.disconnect();}sources.clear();nextAudio=0;}
function release(){for(const name of held.values())gb?.key_lift(PadKey[name]);held.clear();}
function press(token,name){if(held.has(token)||!gb||paused)return;held.set(token,name);gb.key_press(PadKey[name]);}
function lift(token){const name=held.get(token);held.delete(token);if(name&&![...held.values()].includes(name))gb?.key_lift(PadKey[name]);}
function save(){if(!gb)return;try{const a=gb.ram_data_eager();localStorage.setItem(saveKey,btoa(String.fromCharCode(...a)));}catch{status('自動保存は利用できません。セーブ書出しを使ってください。');}}
function boot(){save();release();clearAudio();gb?.free();gb=new GameBoy(el('mode').value==='dmg'?GameBoyMode.Dmg:GameBoyMode.Cgb);gb.set_boot_rom(el('mode').value==='dmg'?BootRom.DmgBootix:BootRom.CgbBoytacean);gb.load_unsafe(true);gb.load_rom_wa(rom).free();try{const s=localStorage.getItem(saveKey);if(s){const a=decode(s);if(a.length===gb.ram_data_eager().length)gb.set_ram_data(a);}}catch{}paused=false;el('pause').textContent='一時停止';last=0;accum=0;status('起動しました。Enter または START でゲーム開始。');}
function paint(){const rgb=gb.frame_buffer_eager(),stride=rgb.length/(160*144);for(let i=0;i<160*144;i++){pixels.data[i*4]=rgb[i*stride];pixels.data[i*4+1]=rgb[i*stride+1];pixels.data[i*4+2]=rgb[i*stride+2];pixels.data[i*4+3]=255;}draw.putImageData(pixels,0,0);
const samples=gb.audio_buffer_eager(true);if(!ctx||ctx.state!=='running'||!samples.length)return;const channels=gb.audio_channels(),count=Math.floor(samples.length/channels),rate=gb.audio_sampling_rate();if(!count)return;const b=ctx.createBuffer(channels,count,rate);for(let ch=0;ch<channels;ch++){const a=b.getChannelData(ch);for(let i=0;i<count;i++)a[i]=Math.max(-1,Math.min(1,samples[i*channels+ch]/64));}if(nextAudio-ctx.currentTime>.15)clearAudio();const s=ctx.createBufferSource();s.buffer=b;s.connect(ctx.destination);sources.add(s);s.onended=()=>{sources.delete(s);s.disconnect()};nextAudio=Math.max(ctx.currentTime,nextAudio);s.start(nextAudio);nextAudio+=count/rate;}
function loop(t){requestAnimationFrame(loop);if(paused||!gb){last=t;accum=0;return;}accum+=last?t-last:0;last=t;const interval=1000/59.7275;if(accum<interval)return;accum%=interval;try{gb.clocks_cycles(70224*gb.multiplier());paint();canvas.dataset.frames=String(++frames);if(frames%60===0)save();}catch(e){paused=true;release();clearAudio();status('実行エラー: '+e.message);}}
function download(bytes,name,type){const u=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
el('pause').onclick=()=>{paused=!paused;release();clearAudio();save();el('pause').textContent=paused?'再開':'一時停止';};
el('sound').onclick=async()=>{try{if(!ctx){ctx=new AudioContext();await ctx.resume();}else if(ctx.state==='running'){clearAudio();await ctx.suspend();}else await ctx.resume();el('sound').textContent=ctx.state==='running'?'音声OFF':'音声ON';}catch(e){status('音声を開始できません: '+e.message);}};
el('reset').onclick=boot;el('mode').onchange=boot;
el('rom').onclick=()=>download(rom,ROM_FILENAME,'application/octet-stream');
el('save').onclick=()=>{save();download(gb.ram_data_eager(),ROM_FILENAME.replace(/\.gb$/i,'.sav'),'application/octet-stream');};
el('load').onchange=async e=>{const f=e.target.files[0];if(!f)return;const a=new Uint8Array(await f.arrayBuffer());if(a.length!==gb.ram_data_eager().length){status('セーブ容量がこのROMと一致しません。');return;}gb.set_ram_data(a);save();boot();status('セーブを読み込み、ROMを再起動しました。');e.target.value='';};
document.addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;const name=keys[e.code];if(name){e.preventDefault();press(e.code,name);}});
document.addEventListener('keyup',e=>{if(keys[e.code]){e.preventDefault();lift(e.code);}});
for(const b of document.querySelectorAll('[data-key]')){b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);press('p'+e.pointerId,b.dataset.key);};b.onpointerup=e=>lift('p'+e.pointerId);b.onpointercancel=e=>lift('p'+e.pointerId);b.onlostpointercapture=e=>lift('p'+e.pointerId);}
function unfocus(){release();clearAudio();save();paused=true;el('pause').textContent='再開';}
window.addEventListener('blur',unfocus);document.addEventListener('visibilitychange',()=>{if(document.hidden)unfocus();});window.addEventListener('pagehide',unfocus);
try{initSync({module:decode(WASM_BYTES)});boot();requestAnimationFrame(loop);}catch(e){for(const b of document.querySelectorAll('button,select,input'))if(b.id!=='rom')b.disabled=true;status('この表示環境ではWASMを起動できません。HTMLをブラウザーで開くかROMをダウンロードしてください。 '+e.message);}
