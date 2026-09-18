const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const base=__dirname;
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const plan=JSON.parse(read('prompts/shot-plan.json'));
const generation=JSON.parse(read('provenance/image-generation.json'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields=['subject_definitions','summary','retention_analysis','detailed_description','overall_soundscape','non_diegetic_music'];
const checks=[];
function check(name,pass,detail){checks.push({name,pass,detail});if(!pass)throw Error(name+': '+JSON.stringify(detail));}
check('four_ten_second_clips',plan.clips.length===4&&plan.clips.every(c=>c.duration_seconds===10),plan.clips.map(c=>c.duration_seconds));
check('forty_seconds',plan.duration_seconds===40&&plan.clips.every((c,i)=>c.global_start_seconds===i*10),plan.duration_seconds);
check('twenty_eight_shots',plan.clips.reduce((s,c)=>s+c.shot_starts_seconds.length,0)===28,plan.clips.map(c=>c.shot_starts_seconds.length));
for(const c of plan.clips){
 check(c.id+'_ordered_cuts',c.shot_starts_seconds[0]===0&&c.shot_starts_seconds.every((t,i,a)=>t<10&&(i===0||t>a[i-1])),c.shot_starts_seconds);
 check(c.id+'_shot_labels',c.shot_labels_ja.length===c.shot_starts_seconds.length,c.shot_labels_ja);
 for(const language of ['en','ja']){
  const t=read('prompts/'+c.id+'.'+language+'.txt');
  check(c.id+'_'+language+'_six_sections',JSON.stringify([...t.matchAll(/^([a-z_]+):$/gm)].map(m=>m[1]))===JSON.stringify(fields),fields);
  const body=t.split('detailed_description:\n')[1].split('\noverall_soundscape:')[0];
  const indices=[...body.matchAll(/^\[Shot (\d+)\]/gm)].map(m=>+m[1]);
  check(c.id+'_'+language+'_shot_numbers',JSON.stringify(indices)===JSON.stringify(c.shot_starts_seconds.map((_,i)=>i+1)),indices);
  const times=[0,...[...body.matchAll(/^\[Shot \d+\] At 00:(\d+\.\d{3}),/gm)].map(m=>+m[1])];
  check(c.id+'_'+language+'_shot_times',JSON.stringify(times)===JSON.stringify(c.shot_starts_seconds),times);
  const allTimes=[...t.matchAll(/00:(\d+\.\d{3})/g)].map(m=>+m[1]);
  check(c.id+'_'+language+'_end_time',allTimes.includes(10)&&allTimes.every(x=>x<=10),allTimes);
  const definitions=t.split('subject_definitions:\n')[1].split('\nsummary:')[0];
  const references=[...new Set(t.match(/<(?:Subject|Picture) \d+>/g))];
  check(c.id+'_'+language+'_resolved_references',references.every(r=>definitions.includes(r)),references);
  const pictures=[...new Set(t.match(/<Picture \d+>/g))].map(x=>+x.match(/\d+/)[0]).sort((a,b)=>a-b);
  check(c.id+'_'+language+'_upload_numbering',JSON.stringify(pictures)===JSON.stringify(c.upload_order.map((_,i)=>i+1)),pictures);
  check(c.id+'_'+language+'_no_motion_symbols',!/\barrows?\b|矢印/.test(t),'Directions are described as physical motion.');
  check(c.id+'_'+language+'_music_disabled',language==='en'?/non_diegetic_music:\nNone\./.test(t):/non_diegetic_music:\nなし。/.test(t),'No music');
  check(c.id+'_'+language+'_no_vocal_script',!/<d>|<Audio \d+>/.test(t),'No vocal performance');
  if(language==='en'){const count=body.trim().split(/\s+/).length;check(c.id+'_english_detail_words',count>=350&&count<=500,count);}
 }
 c.upload_order.forEach((p,i)=>check(c.id+'_picture_'+(i+1),fs.existsSync(path.join(base,p)),p));
}
check('nine_distinct_finale_portraits',new Set(plan.finale_order).size===9,plan.finale_order);
check('finale_group_holds_3_25_seconds',plan.finale_group_start_seconds===36.75&&plan.finale_group_end_seconds===40,plan.finale_group_end_seconds-plan.finale_group_start_seconds);
check('new_visual_assets_only',plan.clips.every(c=>c.upload_order.every(p=>!/(?:clean-v2|title-bridge|scarlet-roof|forest|library-clock)/.test(p))),plan.clips.flatMap(c=>c.upload_order));
const selected=[...new Set(plan.clips.flatMap(c=>c.upload_order))];
const dimensions=p=>{const b=fs.readFileSync(p);if(b.subarray(1,4).toString()!=='PNG')throw Error('Not PNG '+p);return{width:b.readUInt32BE(16),height:b.readUInt32BE(20)};};
const assets=selected.map(file=>({file,sha256:sha(path.join(base,file)),bytes:fs.statSync(path.join(base,file)).size,...dimensions(path.join(base,file))}));
const models=selected.filter(p=>p.startsWith('references/characters-')).map(file=>({file,source:path.resolve(base,'../op-movie-v1',file),sha256:sha(path.join(base,file))}));
check('five_unchanged_character_sheets',models.length===5&&models.every(m=>sha(m.source)===m.sha256),models.map(m=>m.file));
check('eight_new_generated_assets',generation.assets.filter(a=>a.status==='selected').length===8,generation.assets.length);
const sourcePaths=[...new Set(generation.assets.flatMap(a=>a.refs))];
const manifest={revision:3,tool:generation.tool,selected_assets:assets,reused_character_sheets:models,sources:sourcePaths.map(file=>({file,sha256:sha(file)})),source_game:{file:'../game.json',sha256:sha(path.join(base,'../game.json'))}};
fs.writeFileSync(path.join(base,'provenance/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(base,'provenance/validation.json'),JSON.stringify({status:'passed',checked_at:new Date().toISOString(),checks,visual_review:'See QA-JA.md for visual inspection of new boards and the nine-character finale.',not_performed:['Video generation from this pack','Rendered timing and cuts','Character continuity across generated shots','SFX listening and synchronization','ROM video integration']},null,2)+'\n');
const imageLink=(file,alt,cls='')=>`<a class="${cls}" href="${file}"><img src="${file}" alt="${esc(alt)}"></a>`;
const sections=plan.clips.map(c=>{
 const board=c.upload_order.find(p=>p.startsWith('storyboards/'));
 const timing=c.shot_starts_seconds.map((t,i)=>`<li><b>${t.toFixed(2)}–${(c.shot_starts_seconds[i+1]??10).toFixed(2)}秒</b><span>${esc(c.shot_labels_ja[i])}</span></li>`).join('');
 const refs=c.upload_order.map((p,i)=>`<a class="ref" href="${p}"><b>Picture ${i+1}</b><img loading="lazy" src="${p}" alt="Picture ${i+1}: ${esc(path.basename(p))}"><small>${esc(path.basename(p))}</small></a>`).join('');
 const prompts=['en','ja'].map(lang=>`<details ${lang==='ja'?'open':''}><summary>${lang==='en'?'English · 生成用':'日本語 · 確認用'}</summary><div class="actions"><button data-copy="${c.id}-${lang}">全文をコピー</button><a href="prompts/${c.id}.${lang}.txt" download>TXT保存</a></div><pre id="${c.id}-${lang}">${esc(read('prompts/'+c.id+'.'+lang+'.txt'))}</pre></details>`).join('');
 return `<section id="${c.id}"><p class="eyebrow">${c.id.toUpperCase()} / ${c.global_start_seconds}–${c.global_start_seconds+10} SEC</p><h2>${esc(c.title)}</h2><p>${esc(c.pacing_ja)}</p><ol class="timing">${timing}</ol>${imageLink(board,c.title+'の構図参照','board')}${c.id==='clip-04'?'<p class="caption">上の9コマが順番の顔アップ。その後、下の集合構図へ切り替えて終了します。</p>'+imageLink('references/final-ensemble.png','最後の9人集合絵','board'):''}<h3>参照画像の投入順</h3><div class="refs">${refs}</div><div class="prompts">${prompts}</div></section>`;
}).join('\n');
const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SCARLET PILGRIMAGE · Pop OP v3</title><style>
:root{--ink:#432d43;--muted:#796877;--paper:#fff8f3;--rose:#ce426f;--line:#efced4;--card:#fff}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.75 system-ui,"Yu Gothic",sans-serif}a{color:#ac285c}header,main,footer{max-width:1320px;margin:auto;padding:32px}header{padding-top:45px}h1{font-size:clamp(32px,4.5vw,58px);line-height:1.25;margin:12px 0}h2{font-size:28px;line-height:1.35}.eyebrow{font-size:12px;letter-spacing:.14em;color:var(--rose);font-weight:800}.lead{font-size:19px;max-width:880px}.hero img,.board img{display:block;width:100%;height:auto;border-radius:16px}.hero{display:block;margin:25px 0}.badges,nav{display:flex;flex-wrap:wrap;gap:10px}.badges span,nav a{background:white;border:1px solid var(--line);border-radius:30px;padding:7px 15px;font-size:13px}.note{background:#fff0f1;border-left:4px solid var(--rose);padding:16px 20px;border-radius:5px}nav{position:sticky;top:0;background:#fff8f3f2;backdrop-filter:blur(9px);padding:12px 20px;z-index:4;justify-content:center}nav a{text-decoration:none}section{border-top:1px solid var(--line);padding:30px 0 44px;scroll-margin-top:85px}.timing{list-style:none;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:0;margin:22px 0}.timing li{padding:10px 14px;background:#fff;border-radius:8px;border:1px solid var(--line)}.timing b,.timing span{display:block;font-size:13px}.timing b{color:var(--rose)}.refs{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.ref{background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px;text-decoration:none}.ref img{display:block;width:100%;height:130px;object-fit:contain;margin:8px 0}.ref b{font-size:13px}.ref small{display:block;overflow-wrap:anywhere;font-size:11px;color:var(--muted)}.prompts{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:26px}details{border:1px solid var(--line);border-radius:10px;background:white;align-self:start}summary{padding:16px;font-weight:750;cursor:pointer}.actions{display:flex;gap:15px;align-items:center;padding:0 16px 14px}button{border:0;background:var(--rose);color:white;border-radius:6px;padding:10px 14px;font-weight:700;cursor:pointer}pre{margin:0;padding:16px;border-top:1px solid var(--line);white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.8 ui-monospace,Consolas,"Yu Gothic",monospace;max-height:620px;overflow:auto}.caption,footer{color:var(--muted);font-size:13px}#status{display:none;position:fixed;right:20px;bottom:20px;background:#432d43;color:white;border-radius:8px;padding:12px 18px;z-index:10}@media(max-width:750px){header,main,footer{padding:20px}.prompts{grid-template-columns:1fr}.timing{grid-template-columns:repeat(2,1fr)}.refs{grid-template-columns:repeat(2,minmax(0,1fr))}.ref img{height:110px}nav{justify-content:flex-start;padding:10px}}
</style></head><body><header><p class="eyebrow">SCARLET PILGRIMAGE / POP CHARACTER OPENING / v3</p><h1>ひとりひとりが、主役。</h1><p class="lead">笑顔、視線、ちょっとした仕草。ふたりの飛行、お茶会、庭園のじゃれ合いをつなぎ、最後は9人そろってカメラへ。</p><div class="badges"><span>10秒 × 4本</span><span>全40秒・28カット</span><span>ポップなキャラクター紹介</span><span>9人の顔アップ → 集合絵</span><span>効果音のみ</span></div>${imageLink('references/final-ensemble.png','9人が笑顔で集まる最終集合絵','hero')}<p class="note">新構成の英日プロンプトと画像です。各クリップのPicture順に添付し、英語全文を使用してください。カメラと動作は文章、画像は構図と人物の参照です。旧版から背景・絵コンテ・ラストを作り直しました。</p><p><a href="README-JA.md">使い方・構成メモ</a> · <a href="provenance/manifest.json">画像と出典</a> · <a href="provenance/QA-JA.md">検証範囲</a></p></header><nav>${plan.clips.map(c=>`<a href="#${c.id}">${c.global_start_seconds}–${c.global_start_seconds+10}秒</a>`).join('')}</nav><main>${sections}</main><footer>元のキャラクター設定画5枚を固定して使用。新規背景・絵コンテ・集合絵は内蔵image_genで作成。この資料での動画生成・編集・音声確認は未実施です。最後は集合絵で終了します。</footer><div id="status" role="status"></div><script>document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',async()=>{const text=document.getElementById(b.dataset.copy).textContent;try{await navigator.clipboard.writeText(text)}catch(e){const t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove()}const s=document.getElementById('status');s.textContent='プロンプト全文をコピーしました';s.style.display='block';setTimeout(()=>s.style.display='none',1800)}));</script></body></html>`;
fs.writeFileSync(path.join(base,'review.html'),html);
console.log(JSON.stringify({checks:checks.length,selectedImages:assets.length,newImages:generation.assets.filter(a=>a.status==='selected').length,detailWords:checks.filter(x=>x.name.endsWith('_english_detail_words')).map(x=>x.detail),review:path.join(base,'review.html')},null,2));
