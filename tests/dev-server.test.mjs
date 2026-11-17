import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { startDevServer } from '../scripts/dev-server.mjs';
import { loadLocalEnvironment } from '../scripts/local-env.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
test('one local origin serves HTML, JavaScript modules, SPA routes and JSON API',{timeout:60000},async()=>{
 const received=[];
 const app=await startDevServer({root,port:0,env:{},apiHandler:async request=>{
  received.push({url:request.url,origin:request.headers.get('origin'),body:request.method==='POST'?await request.json():null});
  const headers=new Headers({'Content-Type':'application/json'});headers.append('Set-Cookie','session=test; HttpOnly; Path=/');headers.append('Set-Cookie','nonce=test; HttpOnly; Path=/');
  return new Response('{"ok":true}',{headers});
 }});
 try {
  for(const path of ['/','/tarefas','/perfil']){
   const response=await fetch(app.url+path);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);assert.match(await response.text(),/\/src\/main.tsx/);
  }
  for(const path of ['/@vite/client','/src/main.tsx','/src/App.tsx']){
   const response=await fetch(app.url+path);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/(javascript|ecmascript)/);assert.doesNotMatch(await response.text(),/^<!doctype html>/i);
  }
  const api=await fetch(app.url+'/api/auth/session',{method:'POST',headers:{Origin:app.url,'Content-Type':'application/json'},body:'{"credential":"test"}'});
  assert.equal(api.status,200);assert.equal(api.headers.getSetCookie().length,2);
  assert.deepEqual(await api.json(),{ok:true});assert.equal(received[0].origin,app.url);assert.equal(received[0].body.credential,'test');
  const privateFile=join(root,'test-firebase-adminsdk-private.json');
  await writeFile(privateFile,'{"private_key":"PRIVATE_MARKER_FOR_TEST"}');
  try {const privateResponse=await fetch(app.url+'/test-firebase-adminsdk-private.json');assert.equal(privateResponse.status,403);assert.doesNotMatch(await privateResponse.text(),/PRIVATE_MARKER_FOR_TEST/);} finally {await rm(privateFile,{force:true});}
 } finally {await app.close();}
});
test('local env loads .env, honors shell overrides and reads private JSON from a file',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'descomplex-env-'));
 try {
  await writeFile(join(directory,'.env'),'GOOGLE_CLIENT_ID=file-id\nFIREBASE_SERVICE_ACCOUNT_JSON=private.json\n');
  await writeFile(join(directory,'private.json'),JSON.stringify({project_id:'test',private_key:'test-key-not-real'}));
  const env=loadLocalEnvironment(directory,{GOOGLE_CLIENT_ID:'shell-id'});
  assert.equal(env.GOOGLE_CLIENT_ID,'shell-id');assert.equal(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON).project_id,'test');
  assert.throws(()=>loadLocalEnvironment(directory,{FIREBASE_SERVICE_ACCOUNT_JSON:'missing.json'}),/arquivo .json existente/);
 } finally {await rm(directory,{recursive:true,force:true});}
});
