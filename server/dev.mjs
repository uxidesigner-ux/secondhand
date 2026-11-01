import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {GET} from '../api/search.js';
import {GET as detailGET} from '../api/detail.js';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const types={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
http.createServer(async(req,res)=>{try{
const url=new URL(req.url,'http://localhost:4173');
if(['/api/search','/api/detail'].includes(url.pathname)){const handler=url.pathname==='/api/detail'?detailGET:GET;const response=await handler(new Request(url,{method:req.method}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;}
const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(bytes);
}catch{res.writeHead(404).end('Not found');}}).listen(4173,'127.0.0.1',()=>console.log('USED local http://127.0.0.1:4173'));
