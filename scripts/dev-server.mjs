import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer as createViteServer } from 'vite';
import productionApi from '../netlify/functions/api.mjs';
import { loadLocalEnvironment } from './local-env.mjs';

export async function startDevServer({ root = fileURLToPath(new URL('../', import.meta.url)), port = 8888, apiHandler = productionApi, env } = {}) {
  Object.assign(process.env, env || loadLocalEnvironment(root));
  let vite;
  const server = createHttpServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/api/') && !pathname.startsWith('/.netlify/functions/api/')) {
      return vite.middlewares(request, response, () => {response.statusCode = 404; response.end('Not found');});
    }
    try {
      const chunks = []; let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 65536) {response.writeHead(413, {'Content-Type':'application/json'});response.end('{"error":"Solicitação muito grande."}');return;}
        chunks.push(chunk);
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      // Use the listener's port rather than trusting an arbitrary Host header.
      const host = request.headers.host === `127.0.0.1:${server.address().port}` ? '127.0.0.1' : 'localhost';
      const url = `http://${host}:${server.address().port}${request.url}`;
      const result = await apiHandler(new Request(url, {method:request.method, headers, body:['GET','HEAD'].includes(request.method) ? undefined : Buffer.concat(chunks)}));
      response.statusCode = result.status;
      for (const [name, value] of result.headers) if (name !== 'set-cookie') response.setHeader(name, value);
      const cookies = result.headers.getSetCookie();
      if (cookies.length) response.setHeader('Set-Cookie', cookies);
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      response.writeHead(500, {'Content-Type':'application/json'});
      response.end('{"error":"Falha no servidor local. Confira a configuração e reinicie."}');
    }
  });
  vite = await createViteServer({root, appType:'spa', server:{middlewareMode:true,hmr:{server}}});
  try {
    await new Promise((resolve,reject) => {server.once('error',reject);server.listen(port,'localhost',resolve);});
  } catch (error) {await vite.close();throw error;}
  const actualPort = server.address().port;
  return { url:`http://localhost:${actualPort}`, server, async close() {await vite.close();await new Promise(resolve=>server.close(resolve));} };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--port');
  const port = index >= 0 ? Number(process.argv[index+1]) : 8888;
  try {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Informe uma porta válida entre 1 e 65535.');
    const app = await startDevServer({port});
    console.log(`\nDescomplex: ${app.url}\nInterface Vite e API na mesma porta. Ctrl+C para encerrar.\n`);
    for (const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{await app.close();process.exit(0);});
  } catch(error) {
    console.error(error.code === 'EADDRINUSE' ? `A porta ${port} já está em uso. Encerre o servidor anterior antes de iniciar.` : error.message.includes('FIREBASE_SERVICE_ACCOUNT_JSON') ? error.message : 'Não foi possível iniciar o servidor local. Confira as dependências e a configuração do projeto.');
    process.exitCode=1;
  }
}
