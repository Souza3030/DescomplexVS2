import { useEffect, useRef, useState } from 'react';
import { api, User } from './api';
declare global { interface Window { google?: {accounts: {id: {initialize(options: any): void; renderButton(parent: HTMLElement, options: any): void; disableAutoSelect(): void}}}; } }
let scriptPromise: Promise<void> | undefined;
function loadGoogle() {
  if(window.google?.accounts) return Promise.resolve();
  if(!scriptPromise) scriptPromise = new Promise((resolve,reject) => {
    const script=document.createElement('script'); script.src='https://accounts.google.com/gsi/client'; script.async=true; script.defer=true;
    script.onload=()=>resolve(); script.onerror=()=>{script.remove();scriptPromise=undefined;reject(new Error('Não foi possível carregar o Google. Verifique sua conexão e tente novamente.'));};
    document.head.append(script);
  });
  return scriptPromise;
}
export function GoogleLogin({onLogin}: {onLogin: (user: User)=>void}) {
  const button=useRef<HTMLDivElement>(null);
  const callback=useRef(onLogin);callback.current=onLogin;
  const [status,setStatus]=useState('Preparando login com Google…');
  const [error,setError]=useState('');const [attempt,setAttempt]=useState(0);const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let cancelled=false;
    setError('');setStatus('Preparando login com Google…');
    (async()=>{
      const config=await api<{clientId:string;configured:boolean}>('/auth/config');
      if(cancelled) return;
      if(!config.configured) throw new Error('O login Google ainda não foi configurado no servidor. Consulte as instruções de configuração do projeto.');
      const {nonce}=await api<{nonce:string}>('/auth/start');await loadGoogle();
      if(cancelled||!button.current) return;
      window.google!.accounts.id.initialize({client_id:config.clientId,nonce,auto_select:false,callback:async({credential}: {credential:string})=>{
        if(cancelled) return;setBusy(true);setError('');
        try {const {user}=await api<{user:User}>('/auth/session','POST',{credential});if(!cancelled)callback.current(user);}
        catch(error){if(!cancelled)setError(error instanceof Error?error.message:'Não foi possível entrar.');}
        finally{if(!cancelled)setBusy(false);}
      }});
      button.current.innerHTML='';
      window.google!.accounts.id.renderButton(button.current,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',width:Math.min(380,button.current.clientWidth || 300),locale:'pt-BR'});
      setStatus('');
    })().catch(error=>{if(!cancelled){setStatus('');setError(error.message);}});
    return()=>{cancelled=true;if(button.current)button.current.innerHTML='';};
  },[attempt]);
  return <div className="google-signin"><div ref={button} className={busy?'google-button-host busy':'google-button-host'} aria-hidden={busy || undefined} />{status && <p role="status">{status}</p>}{busy && <p role="status">Validando sua conta…</p>}{error && <div className="feedback" role="alert">{error}</div>}{error && <button className="secondary" onClick={()=>setAttempt(n=>n+1)}>Tentar novamente</button>}</div>;
}
