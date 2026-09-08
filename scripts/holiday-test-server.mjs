// Loopback-only development harness; uses in-memory SQLite and fixture identity.
// Excluded from public assets. Never reads .dev.vars or sends external requests.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setup } from '../tests/holiday-helpers.mjs';
import { handleHolidayRequest } from '../worker/holiday-hours.mjs';

export async function startHolidayTestServer(port = 0) {
  const fixture = await setup(), root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.jpg':'image/jpeg', '.ico':'image/x-icon', '.woff2':'font/woff2' };
  const server = createServer(async (req,res) => {
    const url = new URL(req.url, fixture.env.APP_ORIGIN);
    try {
      if (url.pathname.startsWith('/api/admin/google/') && url.pathname !== '/api/admin/google/disconnect') {
        res.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Google connections are disabled in the local test harness.'})); return;
      }
      if (url.pathname.startsWith('/api/admin') || url.pathname === '/api/holiday-hours' || url.pathname === '/admin') {
        const chunks=[]; for await(const chunk of req) chunks.push(chunk);
        const request = new Request(url,{method:req.method,headers:req.headers,...(chunks.length ? {body:Buffer.concat(chunks)} : {})});
        const response = await handleHolidayRequest(request,fixture.env,{waitUntil:p=>fixture.pending.push(p)});
        res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      // Match only the public surface needed by these tests.
      if (!/^\/(?:[\w-]+\.(?:html|js|css)|images\/[\w./-]+|fonts\/[\w.-]+)?$/.test(url.pathname) || url.pathname.includes('..')) {res.writeHead(404).end();return;}
      const path=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
      res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'}).end(await readFile(path));
    } catch {res.writeHead(500,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Local test request failed.'}));}
  });
  await new Promise(done=>server.listen(port,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`; fixture.env.APP_ORIGIN=origin;
  return { ...fixture, server, origin, cookie:{name:'cpc_admin',value:fixture.token,url:origin,httpOnly:true,sameSite:'Lax'},
    close:async()=>{await Promise.allSettled(fixture.pending); await new Promise(done=>server.close(done));fixture.db.close();} };
}
if (process.argv.includes('--preview')) {
  const s=await startHolidayTestServer(8790);
  // Test-only cookie is injected for local visual preview, never for production.
  const original=s.server.listeners('request')[0];s.server.removeAllListeners('request');
  s.server.on('request',(req,res)=>{req.headers.cookie=`cpc_admin=${s.token}`;original(req,res);});
  console.log(`Local fixture preview: ${s.origin}/admin`);
  process.on('SIGINT',()=>s.close().then(()=>process.exit()));
}
