import { sign, verify, cookies, cookie, nonce } from './session.mjs';
import { HttpError, validId, taskInput, diagnosisInput, profileInput } from './validation.mjs';
const SESSION_SECONDS = 60 * 60 * 24 * 7;
export function createHandler({ env, verifyGoogle, getDatabase, now = () => Date.now() }) {
  return async request => {
    const headers = new Headers({'Content-Type':'application/json','Cache-Control':'no-store'});
    const respond = (body,status=200) => new Response(JSON.stringify(body),{status,headers});
    try {
      const path = new URL(request.url).pathname.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/api/, '');
      if (!['GET','POST','PATCH','DELETE'].includes(request.method)) throw new HttpError(405,'Método não permitido.');
      if (request.method !== 'GET') {
        if(request.headers.get('origin') !== new URL(request.url).origin) throw new HttpError(403,'Origem da solicitação não autorizada.');
        if (request.method !== 'DELETE' && !request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415,'Use JSON.');
      }
      if(path==='/auth/config' && request.method==='GET') {
        return respond({clientId: env.GOOGLE_CLIENT_ID || '',configured:Boolean(env.GOOGLE_CLIENT_ID && env.SESSION_SECRET?.length>=32 && env.FIREBASE_SERVICE_ACCOUNT_JSON)});
      }
      if(!env.GOOGLE_CLIENT_ID || !env.SESSION_SECRET || env.SESSION_SECRET.length<32) throw new HttpError(503,'O login Google ainda precisa ser configurado pelo responsável pelo site.');
      const jar = cookies(request);
      if(path==='/auth/start' && request.method==='GET') {
        const value = nonce();
        headers.append('Set-Cookie',cookie('descomplex_nonce',sign({purpose:'nonce',nonce:value,exp:now()+300000},env.SESSION_SECRET),300,request));
        return respond({nonce:value});
      }
      if(path==='/auth/session' && request.method==='POST') {
        const {credential} = await request.json();
        const challenge=verify(jar.descomplex_nonce,env.SESSION_SECRET,'nonce',now());
        if(!challenge || typeof credential!=='string' || credential.length>10000) throw new HttpError(401,'A tentativa de login expirou. Tente novamente.');
        let claims;try {claims=await verifyGoogle(credential,env.GOOGLE_CLIENT_ID);} catch {throw new HttpError(401,'Não foi possível validar sua conta Google. Tente novamente.');}
        if(!claims || claims.aud!==env.GOOGLE_CLIENT_ID || !['accounts.google.com','https://accounts.google.com'].includes(claims.iss) || claims.exp*1000<=now() || claims.nonce!==challenge.nonce || !claims.email_verified || !claims.sub || !claims.email) throw new HttpError(401,'A credencial Google não é válida para esta sessão.');
        // Optional server-only migration map: Google subject -> previous Firebase UID.
        const map=JSON.parse(env.LEGACY_FIREBASE_UID_BY_GOOGLE_SUB || '{}');
        const uid=validId(map[claims.sub] || `google_${claims.sub}`);
        const user={uid,email:claims.email,displayName:claims.name || claims.email.split('@')[0]};
        headers.append('Set-Cookie',cookie('descomplex_session',sign({purpose:'session',user,exp:now()+SESSION_SECONDS*1000},env.SESSION_SECRET),SESSION_SECONDS,request));
        headers.append('Set-Cookie',cookie('descomplex_nonce','',0,request));
        return respond({user});
      }
      if(path==='/auth/logout' && request.method==='POST') {
        headers.append('Set-Cookie',cookie('descomplex_session','',0,request));return respond({ok:true});
      }
      const session=verify(jar.descomplex_session,env.SESSION_SECRET,'session',now());
      if(path==='/auth/session' && request.method==='GET') return respond({user:session?.user || null});
      if(!session?.user?.uid) throw new HttpError(401,'Entre com sua conta Google para continuar.');
      const db=getDatabase();
      const uid=validId(session.user.uid);
      const tasks=db.collection('users').doc(uid).collection('tasks');
      const diagnoses=db.collection('users').doc(uid).collection('diagnoses');
      const profile=db.collection('profiles').doc(uid);
      if(path==='/data' && request.method==='GET') {
        const [t,d,p]=await Promise.all([tasks.get(),diagnoses.get(),profile.get()]);
        const list=snap=>snap.docs.map(doc=>({...doc.data(),id:doc.id})).sort((a,b)=>b.createdAt-a.createdAt);
        return respond({tasks:list(t),diagnoses:list(d),profile:p.exists?p.data():null});
      }
      if(path==='/tasks' && request.method==='POST') {const ref=await tasks.add({...taskInput(await request.json()),createdAt:now()});return respond({id:ref.id},201);}
      if(path.startsWith('/tasks/')) {
        const ref=tasks.doc(validId(path.slice(7)));
        if(request.method==='PATCH') {const {done}=await request.json();if(typeof done!=='boolean') throw new HttpError(400,'Estado de tarefa inválido.');await ref.update({done});return respond({ok:true});}
        if(request.method==='DELETE') {await ref.delete();return respond({ok:true});}
      }
      if(path==='/diagnoses' && request.method==='POST') {const ref=await diagnoses.add({...diagnosisInput(await request.json()),createdAt:now()});return respond({id:ref.id},201);}
      if(path==='/profile' && request.method==='PATCH') {
        const input=await request.json();
        if(Object.keys(input).length===1 && input.notifyEnabled===false) await profile.set({notifyEnabled:false},{merge:true});
        else await profile.set(profileInput(input),{merge:true});
        return respond({ok:true});
      }
      if(path.startsWith('/tokens/')) {
        const ref=profile.collection('tokens').doc(validId(path.slice(8)));
        if(request.method==='DELETE') {await ref.delete();return respond({ok:true});}
        if(request.method==='POST') {const {token}=await request.json();if(typeof token!=='string'||token.length<20||token.length>4096) throw new HttpError(400,'Token de notificação inválido.');await ref.set({token,updatedAt:now()});return respond({ok:true});}
      }
      throw new HttpError(404,'Operação não encontrada.');
    } catch(error) {
      if(error instanceof HttpError) return respond({error:error.message},error.status);
      if(error instanceof SyntaxError) return respond({error:'Dados JSON inválidos.'},400);
      console.error('Descomplex API error', {code:error.code || 'internal'});
      return respond({error:'Não foi possível acessar seus dados. Tente novamente ou confira a configuração do servidor.'},503);
    }
  };
}
