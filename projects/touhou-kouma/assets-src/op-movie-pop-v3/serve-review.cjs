const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const base=__dirname;
const types={'.html':'text/html; charset=utf-8','.png':'image/png','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8','.json':'application/json; charset=utf-8'};
http.createServer((req,res)=>{let p;try{p=path.resolve(base,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{res.writeHead(400).end();return;}if(!p.startsWith(base+path.sep)){res.writeHead(403).end();return;}fs.readFile(p,(e,b)=>{if(e){res.writeHead(404).end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream','Cache-Control':'no-store'});res.end(b);});}).listen(8786,'127.0.0.1',()=>console.log('http://127.0.0.1:8786/review.html'));
