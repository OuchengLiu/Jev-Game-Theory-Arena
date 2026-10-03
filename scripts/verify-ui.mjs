import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json'};
http.createServer(async(req,res)=>{
 try {
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  // Serve only public frontend assets; never expose configs, secrets or local reports.
  if(!(pathname==='/' || ['/index.html','/sw.js','/version.json'].includes(pathname) || /^\/(js|shared|css|assets)\//.test(pathname)) || pathname.split('/').some(s=>s.startsWith('.'))) {res.writeHead(404).end();return;}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root)){res.writeHead(403).end();return;}
  let data=await readFile(file);
  if(pathname==='/js/config.js')data=Buffer.from("export const CONFIG={proxyUrl:'http://localhost:8787/decide',turnstileSiteKey:'',requestTimeoutMs:10000,repoUrl:'https://github.com/OuchengLiu/Jev-Game-Theory-Arena'};");
  if(file.endsWith('index.html'))data=Buffer.from(data.toString().replace("connect-src 'self'","connect-src 'self' http://localhost:8787").replace('<title>','<title>[LOCAL TEST] '));
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);
 }catch {res.writeHead(404).end();}
}).listen(8000,'localhost',()=>console.log('Local test UI: http://localhost:8000 — keep verify:worker running. Real Jev calls consume account quota.'));
