import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../server/api.mjs';
import { sign,verify } from '../server/session.mjs';
import { taskInput,profileInput,diagnosisInput } from '../server/validation.mjs';
const env={GOOGLE_CLIENT_ID:'client.apps.googleusercontent.com',SESSION_SECRET:'a'.repeat(64),FIREBASE_SERVICE_ACCOUNT_JSON:'{}'};
const now=1700000000000;
const claims={aud:env.GOOGLE_CLIENT_ID,iss:'https://accounts.google.com',sub:'google123',email:'test@example.com',name:'Teste',email_verified:true,exp:now/1000+3600};
const req=(path,method='GET',body,cookie='',origin='https://example.netlify.app')=>new Request(`https://example.netlify.app/api${path}`,{method,headers:{'origin':origin,'cookie':cookie,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
function setup(overrides={}){
 const paths=[];
 const ref=path=>({collection:name=>ref(`${path}/${name}`),doc:id=>{paths.push(`${path}/${id}`);return ref(`${path}/${id}`);},get:async()=>({docs:[],exists:false}),add:async(data)=>{paths.push({path,data});return{id:'created'};},update:async()=>{},set:async()=>{},delete:async()=>{}});
 let acceptedNonce;
 const handler=createHandler({env,now:()=>now,verifyGoogle:async()=>({...claims,nonce:acceptedNonce}),getDatabase:()=>({collection:name=>ref(name)}),...overrides});
 async function login(){
  const start=await handler(req('/auth/start'));acceptedNonce=(await start.json()).nonce;
  const nonceCookie=start.headers.get('set-cookie').split(';')[0];
  const response=await handler(req('/auth/session','POST',{credential:'verified-by-injected-google-verifier'},nonceCookie));
  return {response,cookie:response.headers.getSetCookie().find(s=>s.startsWith('descomplex_session=')).split(';')[0]};
 }
 return {handler,login,paths};
}
test('signed session rejects expired, altered or wrong-purpose tokens',()=>{
 const token=sign({purpose:'session',exp:now+1000,user:{uid:'u'}},env.SESSION_SECRET);
 assert.equal(verify(token,env.SESSION_SECRET,'session',now).user.uid,'u');
 assert.equal(verify(token,env.SESSION_SECRET,'nonce',now),null);
 assert.equal(verify(token,env.SESSION_SECRET,'session',now+1001),null);
 assert.equal(verify(token+'x',env.SESSION_SECRET,'session',now),null);
});
test('data and writes require a server-verified session',async()=>{
 const {handler}=setup();
 assert.equal((await handler(req('/data'))).status,401);
 assert.equal((await handler(req('/tasks','POST',{uid:'someone-else'}))).status,401);
});
test('login requires nonce; issuer/audience/expiry/email verification are checked',async()=>{
 const {handler}=setup();assert.equal((await handler(req('/auth/session','POST',{credential:'fake'}))).status,401);
 for(const invalid of [{aud:'attacker'},{iss:'attacker'},{exp:1},{email_verified:false},{nonce:'different'}]){
  let challenge;const api=setup({verifyGoogle:async()=>({...claims,nonce:challenge,...invalid})});
  const start=await api.handler(req('/auth/start'));challenge=(await start.json()).nonce;const cookie=start.headers.get('set-cookie').split(';')[0];
  assert.equal((await api.handler(req('/auth/session','POST',{credential:'fake'},cookie))).status,401);
 }
});
test('login issues HttpOnly Secure cookies; data is scoped to the verified uid',async()=>{
 const {handler,login,paths}=setup();const {response,cookie}=await login();assert.equal(response.status,200);
 assert.match(response.headers.get('set-cookie'),/HttpOnly/);assert.match(response.headers.get('set-cookie'),/Secure/);
 assert.equal((await handler(req('/auth/session','GET',undefined,cookie))).status,200);
 assert.equal((await handler(req('/data','GET',undefined,cookie))).status,200);
 assert(paths.includes('users/google_google123'));assert(paths.includes('profiles/google_google123'));
 const body={title:'Primeiro passo',nextStep:'Abrir arquivo',category:'Importante',startDate:'2026-11-17',dueDate:'2026-11-18',uid:'another-user',createdAt:1};
 assert.equal((await handler(req('/tasks','POST',body,cookie))).status,201);
 assert.equal(paths.find(p=>p?.data)?.data.createdAt,now);
 assert(!paths.some(p=>typeof p==='string'&&p.includes('another-user')));
});
test('cross-origin writes and malformed resource ids are rejected',async()=>{
 const {handler,login}=setup();const {cookie}=await login();
 assert.equal((await handler(req('/profile','PATCH',{},cookie,'https://attacker.example'))).status,403);
 assert.equal((await handler(req('/tasks/invalid%2Fuid','DELETE',undefined,cookie))).status,400);
});
test('configured migration retains the legacy Firebase data uid',async()=>{
 const {login}=setup({env:{...env,LEGACY_FIREBASE_UID_BY_GOOGLE_SUB:'{"google123":"previousUid"}'}});
 assert.equal((await (await login()).response.json()).user.uid,'previousUid');
});
test('logout clears the session cookie',async()=>{
 const {handler,login}=setup();const {cookie}=await login();const response=await handler(req('/auth/logout','POST',{},cookie));
 assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
});
test('server validates dates, profile bounds and all nine diagnosis answers',()=>{
 assert.throws(()=>taskInput({title:'x',nextStep:'',category:'Importante',startDate:'2026-02-31',dueDate:'2026-11-18'}));
 assert.throws(()=>profileInput({displayName:'Teste',focusMinutes:0,notifyEnabled:false,notifyTime:'09:00',timezone:'UTC'}));
 assert.throws(()=>diagnosisInput({answers:[1,2]}));
 assert.throws(()=>diagnosisInput({answers:Array(9).fill(6)}));
 assert.deepEqual(diagnosisInput({answers:Array(9).fill(3)}),{answers:Array(9).fill(3)});
});
