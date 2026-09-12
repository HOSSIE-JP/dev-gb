// Deterministic Game Boy format conversion; masters are never overwritten.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');
const lib = require(path.join(root, 'editor/build/library.cjs'));
const {PNG} = require(path.join(root, 'editor/node_modules/pngjs'));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function convert() {
  return [['logo-ai-slop', 'AI Slop Games'], ['logo-touhou-notice', '東方Project二次創作・ゆっくり案内']].map(([id, name]) => {
    const master = id === 'logo-ai-slop' ? id + '-pop-original.png' : id + '-original.png';
    const raw = fs.readFileSync(path.join(__dirname, master)), p = PNG.sync.read(raw);
    const pixels = Array.from({length:160*144}, (_, n) => {
      const x = n % 160, y = Math.floor(n / 160);
      const k = (Math.floor((y + .5) * p.height / 144) * p.width + Math.floor((x + .5) * p.width / 160)) * 4;
      return Math.max(0, Math.min(3, Math.round((.299 * p.data[k] + .587 * p.data[k+1] + .114 * p.data[k+2]) * p.data[k+3] / 255 / 85)));
    });
    const tiles = new Set();
    for(let y=0;y<144;y+=8)for(let x=0;x<160;x+=8){let t='';for(let j=0;j<8;j++)t+=pixels.slice((y+j)*160+x,(y+j)*160+x+8).join('');tiles.add(t);}
    assert.ok(tiles.size <= 255, id + ' tile budget');
    const asset = {id, name, kind:'screen', width:160, height:144, palette:7, origin:{x:0,y:0}, hitbox:{x:0,y:0,w:1,h:1}, emitters:[], frames:[{id:id+'-0',image:'images/'+id+'.png',duration:8,pixels}]};
    const preview = new PNG({width:160,height:144});
    for(let i=0;i<pixels.length;i++){preview.data[i*4]=preview.data[i*4+1]=preview.data[i*4+2]=pixels[i]*85;preview.data[i*4+3]=255;}
    fs.writeFileSync(path.join(__dirname, id+'-gb.png'), PNG.sync.write(preview));
    return {asset, record:{id, master, masterSha256:hash(raw), sourceSize:[p.width,p.height], outputSize:[160,144], sampling:'nearest-neighbor pixel-center, alpha composited over black, luma rounded to four shades', palette:7, uniqueTiles:tiles.size, assetSha256:hash(lib.encodePng(160,144,pixels,false))}};
  });
}
module.exports = convert;
if(require.main === module){const data=convert();if(process.argv.includes('--verify'))for(const {asset}of data)assert.deepEqual(lib.decodeIndexedPng(fs.readFileSync(path.join(root,'projects/touhou-kouma/assets-src',asset.frames[0].image)),160,144),asset.frames[0].pixels);fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify(data.map(x=>x.record),null,2)+'\n');console.log(data.map(x=>x.record));}
