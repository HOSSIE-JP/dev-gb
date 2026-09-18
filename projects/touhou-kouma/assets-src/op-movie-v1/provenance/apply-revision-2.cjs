const fs = require('node:fs');
const path = require('node:path');
const base = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(base,p),'utf8');
const write = (p,t) => fs.writeFileSync(path.join(base,p),t);
const plan = JSON.parse(read('prompts/shot-plan.json'));
if(plan.revision === 2) throw Error('Revision 2 already applied. Use build-review.cjs to rebuild the page.');
const snapshotFiles=['README-JA.md','build-review.cjs','prompts/shot-plan.json','provenance/QA-JA.md','provenance/validation.json',...plan.clips.flatMap(c=>['prompts/'+c.english_prompt,'prompts/'+c.japanese_prompt])];
for(const file of snapshotFiles){const dest=path.join(__dirname,'archive-v1',file);fs.mkdirSync(path.dirname(dest),{recursive:true});if(!fs.existsSync(dest))fs.copyFileSync(path.join(base,file),dest,fs.constants.COPYFILE_EXCL);}
const cleanup=JSON.parse(read('provenance/clean-boards-v2.json'));
const generation=JSON.parse(read('provenance/image-generation.json'));
for(const asset of cleanup.assets){
  if(!fs.existsSync(path.join(base,asset.dest)))fs.copyFileSync(asset.source_output,path.join(base,asset.dest),fs.constants.COPYFILE_EXCL);
  const old=asset.refs[0].slice(base.replaceAll('\\','/').length+1);
  const prior=generation.assets.find(a=>a.dest===old);
  if(!prior)throw Error('Missing prior asset '+old);
  prior.status='superseded';prior.superseded_by=asset.id;
  if(!generation.assets.some(a=>a.id===asset.id))generation.assets.push(asset);
}
write('provenance/image-generation.json',JSON.stringify(generation,null,2)+'\n');
const times=[[0,1,2,4,6,8.5],[0,2,4,5,7,8.5],[0,2,4,5.5,7.5,9],[0,2,4,5.5,7.5,8.5]];
const labels=[['霊夢の瞳','魔理沙の飛び込み','二人の上昇','ルーミアの弾幕','回避と反撃','湖へ抜ける'],['チルノの氷陣','水面すれすれの反撃','美鈴を見上げる','掌の弾幕をかわす','二人の交差','館の入口へ'],['パチュリーの魔法陣','螺旋を抜けて反撃','咲夜が時間を止める','時間再開・ナイフ回避','一撃で出口を開く','紅い夜空へ'],['霊夢対レミリア','魔理沙対フランドール','四人の交差','月下の対峙','二人の決意','タイトル接続の寄り']];
const pacingJA=['1秒ずつの登場から加速。ルーミアの一波を見せ、回避と反撃を続けて湖へ抜ける。','氷の破裂で門の槍先へ切り替える。美鈴の掌打から交差まで速くつなぎ、入口で色を替える。','4.400〜5.650秒だけ時間を止めて音を落とし、再開と同時に鋭く加速する。','前半の連撃から5.500秒で急減速。月下の対峙を見せ、9.500秒から最後の0.500秒は画角を固定する。'];
const pacingEN=['Use two one-second character introductions, accelerate into a readable attack and counterattack, then exit in one fast chase.','Cut sharply from shattered ice to the gate reveal; keep the palm strike, evasive crossing and doorway exit brisk.','Contrast a 1.250-second stopped-time interval with an abrupt return to full-speed knife dodging and escape.','Use fast exchanges in the first half, a sudden deceleration into the standoff, then a final half-second settled composition.'];
function section(text,name,value){const re=new RegExp('(^'+name+':\\n)[\\s\\S]*?(?=\\n[a-z_]+:\\n|(?![\\s\\S]))','m');if(!re.test(text))throw Error(name);return text.replace(re,()=>name+':\n'+value.trim()+'\n');}
function replaceOnce(text,a,b){if(!text.includes(a))throw Error('Missing replacement: '+a);return text.replace(a,b);}
const oldCommonEN='Reference sheets define identity only: never reproduce turnaround duplicates, grids, labels, arrows or split screens. Keep faces, anatomy and costumes stable. No extra characters, injury, generated logos, visible lettering, subtitles or lip-sync.';
const newCommonEN='Use the model sheets for each character’s identity and the clean six-panel board for composition. Every shot fills one 16:9 frame with the scene itself. Faces, anatomy and costumes remain consistent; each character appears once within the scene.';
const oldCommonJA='設定画は同一性の参照に使い、三面図の複数人物、枠、ラベル、矢印、分割画面を映像に出さない。顔、人体、衣装を安定させる。追加人物、負傷、生成ロゴ、画面の文字、字幕、口パクは入れない。';
const newCommonJA='設定画は各人物の同一性、クリーンな6コマ画像は構図の参照に使う。各カットを16:9いっぱいの一つの情景として描く。顔、人体、衣装を維持し、一つの場面の各人物は一人ずつにする。';
for(let i=0;i<4;i++){
 const c=plan.clips[i];
 c.global_start_seconds=i*10;c.duration_seconds=10;c.shot_starts_seconds=times[i];c.shot_labels_ja=labels[i];c.pacing_ja=pacingJA[i];
 c.upload_order=c.upload_order.map(p=>p.startsWith('storyboards/')?cleanup.assets[i].dest:p);
 for(const lang of ['en','ja']){
  const file='prompts/'+c.id+'.'+lang+'.txt';let t=read(file);
  t=t.replaceAll('15.000','10.000').replaceAll('60-second','40-second').replaceAll('全60秒','全40秒');
  t=replaceOnce(t,lang==='en'?oldCommonEN:oldCommonJA,lang==='en'?newCommonEN:newCommonJA);
  const pnum=i===1?5:4;
  const pictureDefinition=lang==='en'?`<Picture ${pnum}> is the clean six-panel visual board for [Shot 1] through [Shot 6], read left-to-right across the top row, then the bottom row. Use it for composition and subject placement. The written shot descriptions supply camera motion, action and timing.`:`<Picture ${pnum}> は [Shot 1]〜[Shot 6] に対応するクリーンな6コマ画像。上段左から右、下段左から右の順で読む。構図と人物配置を参照し、カメラの動き・動作・時刻は各カットの文章で指定する。`;
  const defs=t.split('subject_definitions:\n')[1].split('\nsummary:')[0];
  t=section(t,'subject_definitions',defs.replace(new RegExp('^<Picture '+pnum+'>[^\\n]*','m'),pictureDefinition));
  const ret=t.split('retention_analysis:\n')[1].split('\ndetailed_description:')[0];
  t=section(t,'retention_analysis',ret.replace(lang==='en'?' Never reproduce arrows, labels or panel borders.':'矢印、ラベル、コマ枠を映像へ出さない。',''));
  const sum=t.split('summary:\n')[1].split('\nretention_analysis:')[0];t=section(t,'summary',sum.trim()+' '+(lang==='en'?pacingEN[i]:pacingJA[i]));
  t=t.replace(/^\[Shot (\d+)\] At 00:\d+\.\d{3},/gm,(_,n)=>`[Shot ${n}] At 00:${times[i][Number(n)-1].toFixed(3).padStart(6,'0')},`);
  if(i===0){
   const pairs=lang==='en'?[['She tightens two fingers around a paper talisman and turns toward the right. Her mouth stays closed. Layer wind and a short paper flutter; the opening breathes for a moment before acceleration.','Her talisman is already raised as she turns right; a crisp paper snap lands on the cut.'],['one hand secures the hat brim, and her other hand controls the broom. She gives a closed-mouth, confident grin, then leans forward.','one hand holds the brim and the other controls the broom. Already leaning forward, she flashes a confident closed-mouth grin.']]:[['二本の指で札を持ち直し、右を向く。口は閉じたまま。風と短い紙の擦れる音。加速前に一瞬の静かな間を置く。','札を上げた状態で右を向き、鋭い紙の音に合わせて次のカットへ切る。'],['片手で帽子のつばを押さえ、もう一方で箒を操る。口を閉じた自信のある笑みを浮かべ、前傾する。','片手で帽子のつば、もう一方で箒を支える。前傾した姿で飛び込み、口を閉じた自信のある笑みを一瞬見せる。']];
   for(const [a,b]of pairs)t=replaceOnce(t,a,b);
  }
  if(i===1)t=replaceOnce(t,lang==='en'?'arcs 45 degrees around the exchange at moderate speed':'中速で45度の弧を描き',lang==='en'?'arcs briskly through 30 degrees around the exchange':'素早く30度の弧を描き');
  if(i===2){t=t.replaceAll('00:06.600','00:04.400').replaceAll('00:08.200','00:05.650');}
  if(i===3){
   t=t.replaceAll('00:14.500','00:09.500');
   const pairs=lang==='en'?[['The camera arcs 60 degrees then settles on the same axis.','The camera arcs 20 degrees in 0.400 seconds, then settles.'],['<Subject 1> raises a talisman beside her cheek and narrows her eyes; <Subject 2> steadies her hat, lifts her focus and gives a restrained closed-mouth grin.','<Subject 1> holds a talisman beside her cheek and narrows her eyes; <Subject 2> already has her focus raised, flashing a closed-mouth grin.']]:[['カメラは中速で60度の弧を描いて穏やかに止まり、対峙の軸を越えない。','カメラは0.400秒で20度の弧を描いて止まり、その後は同じ軸で対峙を見せる。'],['<Subject 1> は頬の横に札を上げ目を細める。<Subject 2> は帽子を押さえ、道具を構え、口を閉じた控えめな笑み。','<Subject 1> は頬の横に札を構えたまま目を細める。<Subject 2> も道具を構えた状態で、口を閉じた控えめな笑みを一瞬見せる。']];
   for(const [a,b]of pairs)t=replaceOnce(t,a,b);
  }
  if(/\barrows?\b|矢印/i.test(t))throw Error('Annotation wording remains in '+file);
  write(file,t);
 }
}
plan.revision=2;plan.duration_seconds=40;plan.time_stop={clip:'clip-03',start_seconds:4.4,end_seconds:5.65};plan.title_camera_settles={clip:'clip-04',at_seconds:9.5};
write('prompts/shot-plan.json',JSON.stringify(plan,null,2)+'\n');
console.log('Applied revision 2: four clean boards, eight 10-second prompts, 40-second plan.');
