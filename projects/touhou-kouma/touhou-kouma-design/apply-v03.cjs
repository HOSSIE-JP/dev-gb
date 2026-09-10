// Targeted, revision-aware import. Refuse repeated overwrite of an edited v0.3.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),api=require(path.join(root,'editor/build/library.cjs'));
const g=api.readGame(root,'touhou-kouma'),before=api.revision(g);
assert(!g.stages.some(s=>s.presentation?.enabled),'v0.3 already imported; edit in CARAVAN EDITOR instead');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'converted-v03/import.json')));
for(const a of data.assets){let t=g.assets.find(x=>x.id===a.id);if(!t){t={id:a.id,name:a.id,kind:a.kind,width:a.width,height:a.height,palette:a.palette,origin:{x:80,y:72},hitbox:{x:0,y:0,w:1,h:1},emitters:[],frames:[{id:a.id+'-0',image:'images/'+a.id+'.png',duration:8,pixels:[]}]};g.assets.push(t);}t.width=a.width;t.height=a.height;for(const f of t.frames)f.pixels=a.pixels;}
const conversations=[
[['めいりん','ここからさきは、こうまかん。','おきゃくさまなら、ごよやくを。'],['れいむ','そらをおおう、このあかいきり。','そのはなしをききにきたの。'],['めいりん','おじょうさまは、おいそがしいの。','まずはわたしが、おあいてします!'],['れいむ','じゃあ、てみじかにすませるわ。','とおしてもらうわよ!']],
[['パチュリー','そのあしおと、ほんがいたむわ。','としょかんでは、しずかにして。'],['れいむ','きりをはらせば、すぐかえるわ。','あなたがやったの?'],['パチュリー','あれは、あのこなりのわがまま。','でも、ここをあらすのはこまる。'],['れいむ','ほんはよけて、あなたをねらうわ。','それなら、もんくないでしょ?']],
[['さくや','おそうじのとちゅうですのに。','また、ほこりがふえてしまうわ。'],['れいむ','とけいまで、とまってるわよ。','ここは、いつもこうなの?'],['さくや','おじょうさまのじかんは、たいせつ。','あなたには、おかえりいただくわ。'],['れいむ','わたしのじかんも、たいせつなの。','さっさと、みちをあけて!']],
[['レミリア','ようこそ。あかいよるは、どう?','つきも、わたしのいろになるわ。'],['れいむ','ひるまでまっくらじゃ、こまるの。','そろそろ、おしまいにしなさい。'],['レミリア','わたしのよるを、かえられる?','あなたのうんめいを、みせて。'],['れいむ','うんめいより、あすのてんきよ。','はれに、してもらうわ!']],
[['フランドール','ねえ、おねえさまとあそんだの?','こんどは、わたしのばんだよね!'],['れいむ','まだいたの? もうかえるのよ。','あばれるなら、すこしだけね。'],['フランドール','ほんとう? やくそくだよ!','こわれないで、つきあってね。'],['れいむ','あそびにも、きまりがあるの。','おわったら、おとなしくすること!']]
];
for(let i=0;i<g.stages.length;i++){const s=g.stages[i],d=data.stages.find(x=>x.id===s.id);Object.assign(s,d);s.presentation={enabled:true,dialogueBackground:`dialogue-${i+1}`,clearBackground:`result-${i+1}`,rightPalette:i+1,dialogue:conversations[i].map(([speaker,line1,line2],n)=>({id:`s${i+1}-dialogue-${n+1}`,speaker,line1,line2})),clearEnabled:true,baseBonus:1000,lifeBonus:200,noMissBonus:1000};}
const reimuFrames=JSON.parse(fs.readFileSync(path.join(__dirname,'converted-v03/reimu-frames.json')));g.assets.find(a=>a.id==='reimu').frames.forEach((f,i)=>f.pixels=reimuFrames[i]);
const errors=api.validate(g).filter(d=>d.severity==='error');assert.equal(errors.length,0,JSON.stringify(errors,null,2));
api.saveGame(root,'touhou-kouma',g,before);assert.equal(api.revision(api.readGame(root,'touhou-kouma')),api.revision(g));console.log(JSON.stringify({before,after:api.revision(g),reopened:true}));
