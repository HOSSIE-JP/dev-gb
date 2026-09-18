const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const base = __dirname;
const read = p => fs.readFileSync(path.join(base,p),'utf8');
const plan = JSON.parse(read('prompts/shot-plan.json'));
const generation = JSON.parse(read('provenance/image-generation.json'));
const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const dimensions = p => { const b=fs.readFileSync(p); if(b.subarray(1,4).toString()!=='PNG')throw Error('Not PNG: '+p);return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)}; };
const fields=['subject_definitions','summary','retention_analysis','detailed_description','overall_soundscape','non_diegetic_music'];
const checks=[];
const check=(name,pass,detail)=>{checks.push({name,pass,detail});if(!pass)throw Error(name+': '+detail);};
check('four_clips',plan.clips.length===4,plan.clips.length);
check('sixty_seconds',plan.clips.reduce((s,c)=>s+c.duration_seconds,0)===60,plan.duration_seconds);
const bosses=new Set();
for(const c of plan.clips){
  c.bosses.forEach(x=>bosses.add(x));
  check(c.id+'_six_cuts',c.shot_starts_seconds.length===6 && c.shot_starts_seconds[0]===0 && c.shot_starts_seconds.every((t,i,a)=>t<15&&(i===0||t>a[i-1])),c.shot_starts_seconds);
  c.upload_order.forEach((p,i)=>check(c.id+'_picture_'+(i+1),fs.existsSync(path.join(base,p)),p));
  for(const language of ['en','ja']){
    const file='prompts/'+c.id+'.'+language+'.txt';
    const text=read(file);
    const actual=Array.from(text.matchAll(/^([a-z_]+):$/gm),m=>m[1]);
    check(c.id+'_'+language+'_fields',JSON.stringify(actual)===JSON.stringify(fields),actual);
    const body=text.split('detailed_description:\n')[1].split('\noverall_soundscape:')[0];
    const shots=Array.from(body.matchAll(/^\[Shot (\d+)\]/gm),m=>Number(m[1]));
    check(c.id+'_'+language+'_shots',JSON.stringify(shots)==='[1,2,3,4,5,6]',shots);
    const times=[0,...Array.from(body.matchAll(/^\[Shot \d+\] At 00:(\d+\.\d{3}),/gm),m=>Number(m[1]))];
    check(c.id+'_'+language+'_timing',JSON.stringify(times)===JSON.stringify(c.shot_starts_seconds),times);
    const defs=text.split('subject_definitions:\n')[1].split('\nsummary:')[0];
    const referenced=Array.from(new Set(text.match(/<(?:Subject|Picture) \d+>/g)));
    check(c.id+'_'+language+'_references_resolve',referenced.every(r=>defs.includes(r)),referenced);
    const pictures=Array.from(new Set(text.match(/<Picture \d+>/g))).map(x=>Number(x.match(/\d+/)[0])).sort((a,b)=>a-b);
    check(c.id+'_'+language+'_picture_count',JSON.stringify(pictures)===JSON.stringify(c.upload_order.map((_,i)=>i+1)),pictures);
    check(c.id+'_'+language+'_no_vocal_script',!/<d>/.test(text)&&!/<Audio \d+>/.test(text),'No dialogue or supplied audio asset');
    check(c.id+'_'+language+'_music_disabled',language==='en'?/non_diegetic_music:\nNone\./.test(text):/non_diegetic_music:\nなし。/.test(text),'Explicit no music');
    if(language==='en')check(c.id+'_description_words',body.trim().split(/\s+/).length>=350&&body.trim().split(/\s+/).length<=500,body.trim().split(/\s+/).length);
  }
}
check('all_seven_bosses',bosses.size===7,Array.from(bosses));
const selected=Array.from(new Set(plan.clips.flatMap(c=>c.upload_order)));
check('fourteen_selected_images',selected.length===14,selected.length);
const assets=selected.map(p=>({file:p,role:p.split('/')[0],bytes:fs.statSync(path.join(base,p)).size,...dimensions(path.join(base,p)),sha256:sha(path.join(base,p))}));
const sourcePaths=Array.from(new Set(generation.assets.flatMap(a=>a.refs))).filter(p=>fs.existsSync(p));
const sources=sourcePaths.map(p=>({file:p,sha256:sha(p),...dimensions(p)}));
const manifest={schemaVersion:1,title:plan.title,tool:'image_gen.imagegen (built-in)',selected_assets:assets,comparison_asset:{file:'references/title-current.png',sha256:sha(path.join(base,'references/title-current.png'))},source_assets:sources,source_game:{file:'../game.json',sha256:sha(path.join(base,'../game.json'))},note:'Original project art retained. AI-generated animation adaptations; no new exclusive license over Touhou characters or source artwork.'};
fs.writeFileSync(path.join(base,'provenance/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const validation={status:'passed',checked_at:new Date().toISOString(),automated_checks:checks,visual_review:'Reviewed all selected generated images for cast, costume, background and storyboard function. Storyboard thumbnails are schematic; the text timeline and character model sheets govern exact details.',not_performed:['Video generation','Motion/identity continuity in a generated video','Actual SFX sync and absence of music in rendered video','ROM movie conversion and integration']};
fs.writeFileSync(path.join(base,'provenance/validation.json'),JSON.stringify(validation,null,2)+'\n');
const cards=plan.clips.map(c=>{
 const sb=c.upload_order.find(p=>p.startsWith('storyboards/'));
 const en=read('prompts/'+c.english_prompt),ja=read('prompts/'+c.japanese_prompt);
 return '<section id="'+c.id+'"><div class="section-head"><p class="eyebrow">'+c.id.toUpperCase()+' / '+c.global_start_seconds+'–'+(c.global_start_seconds+15)+' SEC</p><h2>'+escape(c.title)+'</h2><p>'+escape(c.bosses.join(' · '))+' / 15秒・6カット</p></div><a class="board" href="'+sb+'"><img src="'+sb+'" alt="'+escape(c.title)+'の6コマ絵コンテ"></a><h3>参照画像の投入順</h3><div class="references">'+c.upload_order.map((p,i)=>'<a class="ref" href="'+p+'"><span>Picture '+(i+1)+'</span><img loading="lazy" src="'+p+'" alt="Picture '+(i+1)+'"><small>'+escape(p.split('/').pop())+'</small></a>').join('')+'</div><div class="prompt-grid">'+[['en','English · 投入用',en],['ja','日本語 · 確認用',ja]].map(([l,label,t])=>'<details '+(l==='ja'?'open':'')+'><summary>'+label+'</summary><div class="actions"><button data-copy="'+c.id+'-'+l+'">全文をコピー</button><a href="prompts/'+c.id+'.'+l+'.txt" download>TXTを保存</a></div><pre id="'+c.id+'-'+l+'">'+escape(t)+'</pre></details>').join('')+'</div></section>';
}).join('\n');
const html='<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SCARLET PILGRIMAGE — OP制作パック</title><style>'+
':root{color-scheme:dark;--bg:#10121b;--panel:#1b1c2b;--line:#37364b;--muted:#a7aabc;--ink:#f3efe9;--accent:#efad92}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.75 system-ui,"Yu Gothic",sans-serif}a{color:#ffcfaf}header,main,footer{max-width:1320px;margin:auto;padding:32px}header{padding-top:64px}.eyebrow{color:var(--accent);font-size:13px;letter-spacing:.15em}h1{font-family:Georgia,serif;font-size:clamp(32px,5vw,64px);line-height:1.1;margin:14px 0}h2{font-size:28px;line-height:1.4;margin:8px 0}h3{margin-top:28px}p{max-width:900px}.intro{color:#d1ccce}.tags,nav{display:flex;gap:12px;flex-wrap:wrap}.tags span,nav a{padding:7px 14px;border:1px solid var(--line);border-radius:50px;font-size:13px}nav{position:sticky;top:0;background:#10121bf2;z-index:10;padding:12px 32px;backdrop-filter:blur(8px);justify-content:center}nav a{text-decoration:none}section{scroll-margin-top:90px;border-top:1px solid var(--line);padding:36px 0 48px}.section-head p{color:var(--muted)}.board img{display:block;width:100%;height:auto;border-radius:10px}.references{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px}.ref{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px;text-decoration:none;overflow:hidden}.ref span{font-weight:700;font-size:13px}.ref img{display:block;width:100%;height:145px;object-fit:contain;background:#e9e5df;margin:8px 0}.ref small{display:block;font-size:11px;overflow-wrap:anywhere;color:#c8c9d1}.prompt-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:28px}details{background:var(--panel);border:1px solid var(--line);border-radius:8px;align-self:start}summary{cursor:pointer;padding:16px;font-weight:700}.actions{display:flex;align-items:center;gap:16px;padding:0 16px 12px}button{border:0;border-radius:5px;padding:9px 15px;color:#221813;background:#ffc4a4;cursor:pointer;font-weight:700}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.8 ui-monospace,Consolas,"Yu Gothic",monospace;padding:16px;margin:0;max-height:650px;overflow:auto;border-top:1px solid var(--line)}.transition{display:grid;grid-template-columns:1.5fr 1fr;gap:18px}.transition img{width:100%;height:330px;object-fit:contain;background:#090b13}.note{padding:18px;border-left:3px solid var(--accent);background:var(--panel)}footer{font-size:13px;color:var(--muted)}#status{position:fixed;bottom:20px;right:20px;background:#ffcbad;color:#251a14;padding:10px 18px;border-radius:6px;display:none}@media(max-width:750px){header,main,footer{padding:22px}.prompt-grid,.transition{grid-template-columns:1fr}.references{grid-template-columns:repeat(2,minmax(0,1fr))}.ref img{height:110px}nav{justify-content:flex-start;padding:10px}.transition img{height:auto}}'+
'</style></head><body><header><p class="eyebrow">TOUHOU KOUMA / OPENING PRODUCTION PACK v1</p><h1>SCARLET<br>PILGRIMAGE</h1><p class="intro">霊夢と魔理沙、紅霧の先へ。7人のボスとの弾幕をくぐり、紅い月の下で姉妹と向き合う60秒。</p><div class="tags"><span>15秒 × 4本</span><span>16:9 / Ref2VA</span><span>9人の三面図</span><span>24カット</span><span>効果音のみ</span></div><p><a href="README-JA.md">使い方と制作メモ</a> · <a href="provenance/manifest.json">画像・出典一覧</a> · <a href="provenance/validation.json">検証記録</a></p><p class="note">画像とプロンプトの制作資料です。動画本体は未生成。英語版を投入し、日本語版で演出を確認できます。画像はクリックして原寸で開けます。</p></header><nav>'+plan.clips.map(c=>'<a href="#'+c.id+'">'+String(c.global_start_seconds).padStart(2,'0')+'–'+(c.global_start_seconds+15)+'秒</a>').join('')+'<a href="#title">タイトル接続</a></nav><main>'+cards+
'<section id="title"><p class="eyebrow">FINAL FRAME → TITLE SCREEN</p><h2>対峙の余韻から、ゲームへ。</h2><p>最後は霊夢を右、紅魔館を左へ。生成映像にはロゴを描かせず、60秒の直後に既存タイトル画面へつなぎます。</p><div class="transition"><figure><a href="references/title-bridge.png"><img src="references/title-bridge.png" alt="OPの最終フレーム参照"></a><figcaption>OP最終フレームの参照</figcaption></figure><figure><a href="references/title-current.png"><img src="references/title-current.png" alt="既存タイトル原画"></a><figcaption>既存タイトル原画（比較用）</figcaption></figure></div></section></main><footer>既存プロジェクト原画に基づくアニメ用補助設定。東方Project二次創作。新規画像は内蔵image_genで生成。設定画と文章の指示を優先し、絵コンテの矢印・文字・コマ枠は動画に出しません。</footer><div id="status" role="status"></div><script>document.querySelectorAll("[data-copy]").forEach(b=>b.addEventListener("click",async()=>{const t=document.getElementById(b.dataset.copy).textContent;try{await navigator.clipboard.writeText(t)}catch(e){const a=document.createElement("textarea");a.value=t;document.body.appendChild(a);a.select();document.execCommand("copy");a.remove()}const s=document.getElementById("status");s.textContent="プロンプト全文をコピーしました";s.style.display="block";setTimeout(()=>s.style.display="none",1800)}));</script></body></html>';
fs.writeFileSync(path.join(base,'review.html'),html);
console.log(JSON.stringify({checks:checks.length,selectedImages:assets.length,sources:sources.length,review:path.join(base,'review.html')},null,2));
