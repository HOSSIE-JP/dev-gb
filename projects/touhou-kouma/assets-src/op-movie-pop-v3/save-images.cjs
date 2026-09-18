const fs=require('node:fs');
const path=require('node:path');
const base=__dirname;
const data=JSON.parse(fs.readFileSync(path.join(base,'provenance/image-generation.json'),'utf8'));
for(const a of data.assets){if(a.status!=='selected')continue;const dest=path.join(base,a.dest);if(!dest.startsWith(base+path.sep))throw Error('Invalid destination');fs.copyFileSync(a.source_output,dest);}
console.log('Saved '+data.assets.filter(a=>a.status==='selected').length+' selected images.');
