import { useEffect, useMemo, useRef, useState } from 'react';
import { api, User } from './api';
import { GoogleLogin } from './GoogleLogin';
import { categories, percentages, recommendation, Category } from './insights';
import { dueLabel, formatDate, todayLocal } from './dates';
import { registerDailyNotifications, removeDeviceToken } from './notifications';

type Task = { id: string; title: string; nextStep: string; category: Category; done: boolean; createdAt: number; startDate?: string; dueDate?: string };
type Diagnosis = { id: string; answers: number[]; createdAt: number };
type Profile = { displayName: string; focusMinutes: number; notifyEnabled: boolean; notifyTime: string; timezone: string };
type Page = 'Visão geral' | 'Minhas tarefas' | 'Diagnóstico' | 'Foco' | 'Perfil';
const paths: Record<Page, string> = { 'Visão geral': '/', 'Minhas tarefas': '/tarefas', 'Diagnóstico': '/diagnostico', 'Foco': '/foco', 'Perfil': '/perfil' };
function pageFromPath(path: string): Page { return (Object.keys(paths) as Page[]).find(page => paths[page] === path) || 'Visão geral'; }
const questions = [
  { category: 'Urgente', text: 'Adio uma tarefa até o prazo ficar apertado.' },
  { category: 'Urgente', text: 'Só começo quando a pressão se torna inevitável.' },
  { category: 'Urgente', text: 'Subestimo o tempo necessário para concluir entregas.' },
  { category: 'Importante', text: 'Deixo metas importantes sem um primeiro passo definido.' },
  { category: 'Importante', text: 'Troco projetos de longo prazo por tarefas mais fáceis.' },
  { category: 'Importante', text: 'Espero estar motivado para iniciar o que importa.' },
  { category: 'Circunstancial', text: 'Interrupções de outras pessoas mudam meu plano.' },
  { category: 'Circunstancial', text: 'Notificações e redes sociais quebram minha concentração.' },
  { category: 'Circunstancial', text: 'Aceito demandas extras mesmo sem tempo disponível.' },
] as const;

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação. Tente novamente.';
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [page, setPage] = useState<Page>(() => pageFromPath(window.location.pathname));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [message, setMessage] = useState('');
  const savedProfileRef = useRef('');
  const activeUserRef = useRef(user?.uid); activeUserRef.current=user?.uid;
  const [title, setTitle] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [category, setCategory] = useState<Category>('Importante');
  const [startDate, setStartDate] = useState(todayLocal());
  const [dueDate, setDueDate] = useState('');
  const [answers, setAnswers] = useState<number[]>(Array(9).fill(0));
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  runningRef.current = running;
  const [profile, setProfile] = useState<Profile>({ displayName: '', focusMinutes: 25, notifyEnabled: false, notifyTime: '09:00', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Fortaleza' });
  const [profileName, setProfileName] = useState('');
  const [notifyTime, setNotifyTime] = useState('09:00');
  const [taskFilter, setTaskFilter] = useState<'Todas' | 'Em aberto' | 'Concluídas'>('Todas');
  const [taskSearch, setTaskSearch] = useState('');
  const [taskSort, setTaskSort] = useState('recentes');

  function navigate(destination: Page) {
    window.history.pushState(null, '', paths[destination]);
    setPage(destination);
    window.scrollTo(0, 0);
  }
  useEffect(() => {
    const onBack = () => setPage(pageFromPath(window.location.pathname));
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, []);

  useEffect(() => {
    let active = true;
    api<{user:User | null}>('/auth/session').then(({user}) => {if(active)setUser(user);}).catch(error=>{if(active)setMessage(errorText(error));}).finally(()=>{if(active)setAuthLoaded(true);});
    return()=>{active=false;};
  }, []);
  async function refreshData() {
    const data = await api<{tasks:Task[]; diagnoses:Diagnosis[]; profile:Profile | null}>('/data');
    if(activeUserRef.current!==user?.uid) return;
    setTasks(data.tasks); setDiagnoses(data.diagnoses);
    const signature=JSON.stringify(data.profile);
    if(savedProfileRef.current !== signature) {
      savedProfileRef.current=signature;
      const saved=data.profile;
      setProfile(saved || {displayName:user?.displayName || '',focusMinutes:25,notifyEnabled:false,notifyTime:'09:00',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Fortaleza'});
      setProfileName(saved?.displayName || user?.displayName || '');setNotifyTime(saved?.notifyTime || '09:00');
      if(!runningRef.current) {const minutes=saved?.focusMinutes || 25;setFocusMinutes(minutes);setSeconds(minutes*60);}
    }
  }
  useEffect(()=>{
    if(!user){setTasks([]);setDiagnoses([]);savedProfileRef.current='';return;}
    let active=true;
    const refresh=()=>{if(active && document.visibilityState!=='hidden')refreshData().catch(error=>{if(active)setMessage(errorText(error));});};
    refresh();const timer=window.setInterval(refresh,30000);window.addEventListener('focus',refresh);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[user]);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setSeconds(current => {
      if (current <= 1) { setRunning(false); return 0; }
      return current - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (user && profile.notifyEnabled && 'Notification' in window && Notification.permission === 'granted') {
      registerDailyNotifications(user.uid).catch(error => setMessage(errorText(error)));
    }
  }, [user, profile.notifyEnabled]);

  const latest = diagnoses[0];
  const scores = useMemo(() => latest ? percentages(latest.answers) : [0, 0, 0], [latest]);
  const advice = useMemo(() => latest ? recommendation(latest.answers) : null, [latest]);
  const open = tasks.filter(t => !t.done);
  const completed = tasks.length - open.length;
  const overdue = open.filter(t => t.dueDate && t.dueDate < todayLocal()).length;
  const visibleTasks = tasks.filter(t => (taskFilter === 'Todas' || (taskFilter === 'Concluídas' ? t.done : !t.done)) && `${t.title} ${t.nextStep} ${t.category}`.toLocaleLowerCase('pt-BR').includes(taskSearch.toLocaleLowerCase('pt-BR'))).sort((a, b) => taskSort === 'prazo' ? (a.dueDate || '9999').localeCompare(b.dueDate || '9999') : b.createdAt - a.createdAt);
  const focusProgress = Math.min(100, Math.max(0, (1 - seconds / (focusMinutes * 60 || 1)) * 100));

  async function addTask(event: React.FormEvent) {
    event.preventDefault(); if (!user || !title.trim()) return;
    if (dueDate && startDate && dueDate < startDate) { setMessage('O prazo deve ser igual ou posterior à data de início.'); return; }
    try {
      await api('/tasks','POST',{title:title.trim(),nextStep:nextStep.trim(),category,startDate,dueDate}); await refreshData();
      setTitle(''); setNextStep(''); setDueDate(''); setMessage('Tarefa adicionada.');
    } catch (e) { setMessage(errorText(e)); }
  }
  async function toggleTask(task: Task) {
    if (!user) return;
    try { await api(`/tasks/${encodeURIComponent(task.id)}`,'PATCH',{done:!task.done}); await refreshData(); }
    catch (e) { setMessage(errorText(e)); }
  }
  async function removeTask(task: Task) {
    if (!user) return;
    try { await api(`/tasks/${encodeURIComponent(task.id)}`,'DELETE'); await refreshData(); }
    catch (e) { setMessage(errorText(e)); }
  }
  async function saveDiagnosis() {
    if (!user || answers.some(a => a < 1 || a > 5)) { setMessage('Responda às nove afirmações para continuar.'); return; }
    try {
      await api('/diagnoses','POST',{answers}); await refreshData();
      setMessage('Diagnóstico salvo com sucesso. Veja sua recomendação abaixo.');
    } catch (e) { setMessage(errorText(e)); }
  }
  async function saveProfile(event: React.FormEvent) {
    event.preventDefault(); if (!user) return;
    const name = profileName.trim();
    if (!name) { setMessage('Informe seu nome.'); return; }
    try {
      await api('/profile','PATCH',{...profile,displayName:name,notifyTime,focusMinutes,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || profile.timezone}); await refreshData();
      setMessage('Perfil atualizado.');
    } catch (e) { setMessage(errorText(e)); }
  }
  async function enableNotifications() {
    if (!user) return;
    try {
      await registerDailyNotifications(user.uid);
      await api('/profile','PATCH',{...profile,displayName:profileName.trim() || user.displayName || 'Usuário',notifyEnabled:true,notifyTime,focusMinutes,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || profile.timezone}); await refreshData();
      setMessage('Notificações diárias ativadas.');
    } catch (e) { setMessage(e instanceof Error ? e.message : errorText(e)); }
  }
  async function disableNotifications() {
    if (!user) return;
    try { await api('/profile','PATCH',{notifyEnabled:false}); await refreshData(); setMessage('Notificações desativadas.'); }
    catch (e) { setMessage(errorText(e)); }
  }
  async function logout() {
    if (!user) return;
    try { await removeDeviceToken(user.uid); }
    catch (error) { setMessage(errorText(error)); }
    try { await api('/auth/logout','POST',{}); window.google?.accounts.id.disableAutoSelect(); setUser(null); setMessage(''); setRunning(false); }
    catch (error) { setMessage(errorText(error)); }
  }

  if (!authLoaded) return <main className="setup"><img src="/descomplex-wordmark.png" alt="Descomplex" /><p role="status">Carregando sua conta…</p></main>;
  if (!user) return <main className="auth-page auth-redesign"><div className="auth-form-side"><div className="auth-card"><img className="auth-logo" src="/descomplex-wordmark.png" alt="Descomplex" /><span className="eyebrow">UM PASSO DE CADA VEZ</span><h1>Que bom ter<br />você por aqui.</h1><p>Entre com sua conta Google e abra espaço para o que importa.</p><GoogleLogin onLogin={person=>{setUser(person);setMessage('');}} />{message && <div className="feedback" role="alert">{message}</div>}<div className="google-login-note"><span className="summary-icon"><NavIcon index={4} /></span><p><strong>Seu espaço, com a sua conta.</strong>Seu espaço fica pronto na primeira entrada. Sem precisar de uma nova senha.</p></div><p className="auth-note">Gestão do tempo. Liberdade para viver.</p></div></div><aside className="auth-art auth-photo-panel"><img className="auth-photo" src="/images/login-workspace.jpg" alt="Espaço de trabalho com notebook, plantas e luz natural" fetchPriority="high" /><div className="auth-photo-top"><span className="auth-photo-pill">MENOS PRESSA. MAIS INTENÇÃO.</span><span aria-hidden="true">✦</span></div><div className="auth-photo-copy"><span className="eyebrow">UM NOVO JEITO DE COMEÇAR</span><h2>O que importa<br />merece espaço.</h2><p>Entenda seus padrões, organize seus próximos passos e encontre o seu ritmo.</p><div className="auth-photo-tags"><span>Clareza</span><span>Intenção</span><span>Movimento</span></div></div><div className="auth-photo-bottom"><span>PROGRESSO, NÃO PERFEIÇÃO</span><span>01 — 03</span></div></aside></main>;

  return <div className="shell"><aside className="sidebar"><img src="/descomplex-wordmark.png" alt="Descomplex" /><p className="side-caption">SEU ESPAÇO DE AÇÃO</p><nav aria-label="Navegação principal">{(['Visão geral', 'Minhas tarefas', 'Diagnóstico', 'Foco', 'Perfil'] as Page[]).map((item, index) => <button key={item} className={page === item ? 'active' : ''} aria-current={page === item ? 'page' : undefined} onClick={() => { navigate(item); setMessage(''); }}><span className="nav-icon" aria-hidden="true">{<NavIcon index={index} />}</span>{item}</button>)}</nav><div className="side-bottom"><button className="avatar" onClick={() => navigate('Perfil')} aria-label="Editar perfil">{(profile.displayName || user.email || 'U')[0].toUpperCase()}</button><button className="account account-button" onClick={() => navigate('Perfil')}><strong>{profile.displayName || 'Meu perfil'}</strong><small>{user.email || 'Conta Google'}</small></button><button className="logout" onClick={logout} title="Sair" aria-label="Sair">↗</button></div></aside><main className="content"><header className="topbar"><div><span className="eyebrow">DESCOMPLEX / {page.toUpperCase()}</span><h1>{page === 'Visão geral' ? 'Bom te ver por aqui.' : page}</h1></div><div className="date-chip">{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' }).format(new Date())}</div></header>{message && <div className="feedback" role="status">{message}<button onClick={() => setMessage('')} aria-label="Fechar aviso">×</button></div>}
    {page === 'Visão geral' && <><section className="hero"><img className="hero-photo" src="/images/focus-workspace.jpg" alt="Mesa de trabalho iluminada com notebook e plantas" fetchPriority="high" /><div className="hero-copy"><span className="eyebrow">PROGRESSO, NÃO PERFEIÇÃO</span><h2>O próximo passo<br />começa agora.</h2><p>Quando você entende por que adia, fica mais fácil agir com intenção.</p><button className="light-button" onClick={() => navigate('Minhas tarefas')}>Organizar minhas tarefas <span aria-hidden="true">→</span></button></div></section><section className="stats"><article><span>Tarefas em aberto</span><strong>{open.length.toString().padStart(2, '0')}</strong><small>Um passo de cada vez</small></article><article><span>Concluídas</span><strong>{completed.toString().padStart(2, '0')}</strong><small>Seu progresso conta</small></article><article><span>Último diagnóstico</span><strong>{latest ? `${scores[categories.findIndex((_, i) => scores[i] === Math.max(...scores))]}%` : '—'}</strong><small>{latest ? 'Maior dimensão' : 'Ainda não realizado'}</small></article></section><div className="grid-two"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">EM MOVIMENTO</span><h2>Próximas ações</h2></div><button className="link-button" onClick={() => navigate('Minhas tarefas')}>Ver todas →</button></div>{open.length ? open.slice(0, 3).map(t => <div className="compact-task" key={t.id}><button className="check" onClick={() => toggleTask(t)} aria-label={`Concluir ${t.title}`} /> <div><strong>{t.title}</strong><small>{t.nextStep || 'Defina um primeiro passo'}</small></div><span className={`tag ${t.category.toLowerCase()}`}>{t.category}</span></div>) : <Empty title="Tudo em aberto começa com uma decisão." text="Adicione sua primeira tarefa e defina um passo simples." />}</section><section className="panel insight diagnosis-preview"><img className="diagnosis-photo" src="/images/diagnosis-workspace.jpg" alt="" loading="lazy" /><div className="diagnosis-copy"><span className="eyebrow">CONHEÇA SEU PADRÃO</span><h2>Por que você adia?</h2><p>Responda nove afirmações rápidas para descobrir quais situações mais favorecem a procrastinação.</p>{latest && <div className="mini-scores">{categories.map((c, i) => <span key={c}>{c} <b>{scores[i]}%</b></span>)}</div>}<button className="primary" onClick={() => navigate('Diagnóstico')}>{latest ? 'Refazer diagnóstico' : 'Fazer diagnóstico'} <span aria-hidden="true">→</span></button></div></section></div></>}
    {page === 'Minhas tarefas' && <>
      <div className="intro section-intro"><div><span className="eyebrow">INTENÇÃO EM AÇÃO</span><h2>Pequenos passos. Grandes mudanças.</h2><p>Organize o que importa e encontre um próximo passo possível.</p></div><button className="primary" onClick={() => document.getElementById('new-task-title')?.focus()}>＋ Nova tarefa</button></div>
      <section className="task-overview" aria-label="Resumo das tarefas"><article><span className="summary-icon"><NavIcon index={1} /></span><div><small>Em aberto</small><strong>{open.length.toString().padStart(2, '0')}</strong></div></article><article><span className="summary-icon completed-icon">✓</span><div><small>Concluídas</small><strong>{completed.toString().padStart(2, '0')}</strong></div></article><article><span className="summary-icon overdue-icon"><NavIcon index={3} /></span><div><small>Prazo vencido</small><strong>{overdue.toString().padStart(2, '0')}</strong></div></article><article className="completion-summary"><div><small>Seu progresso</small><strong>{tasks.length ? Math.round(completed / tasks.length * 100) : 0}%</strong></div><div className="track"><div style={{width: `${tasks.length ? completed / tasks.length * 100 : 0}%`}} /></div><small>Uma conquista de cada vez.</small></article></section>
      <div className="task-workspace"><section className="panel task-composer"><div className="composer-heading"><span className="summary-icon">＋</span><div><span className="eyebrow">NOVA TAREFA</span><h2>O que você vai começar?</h2></div></div><p className="muted">Não precisa resolver tudo agora. Só definir por onde começar.</p><form onSubmit={addTask} className="task-form"><label>Tarefa<input id="new-task-title" maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex.: preparar apresentação" required /></label><label>Primeiro passo<input maxLength={180} value={nextStep} onChange={e => setNextStep(e.target.value)} placeholder="Ex.: abrir o arquivo e escrever o título" /></label><label>Qual dimensão?<select value={category} onChange={e => setCategory(e.target.value as Category)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><div className="date-fields"><label>Data de início<input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required /></label><label>Prazo<input type="date" value={dueDate} min={startDate} onChange={e => setDueDate(e.target.value)} required /></label></div><button className="primary" type="submit">Adicionar tarefa →</button></form><div className="composer-tip"><span aria-hidden="true">↳</span><p><strong>Deixe o primeiro passo pequeno.</strong>Uma ação de poucos minutos já coloca você em movimento.</p></div></section>
      <section className="panel task-list refined-task-list"><div className="panel-heading"><div><span className="eyebrow">SEU PLANO EM MOVIMENTO</span><h2>Minhas ações <span className="count-badge">{tasks.length}</span></h2></div><span className="muted">{visibleTasks.length} {visibleTasks.length === 1 ? 'tarefa' : 'tarefas'}</span></div>
        <div className="task-toolbar"><label className="task-search"><span className="sr-only">Buscar tarefas</span><input type="search" placeholder="Buscar uma tarefa…" value={taskSearch} onChange={e => setTaskSearch(e.target.value)} /></label><label><span className="sr-only">Ordenar tarefas</span><select value={taskSort} onChange={e => setTaskSort(e.target.value)}><option value="recentes">Mais recentes</option><option value="prazo">Por prazo</option></select></label></div>
        <div className="task-filters" role="group" aria-label="Filtrar tarefas">{(['Todas', 'Em aberto', 'Concluídas'] as const).map(filter => <button key={filter} aria-pressed={taskFilter === filter} className={taskFilter === filter ? 'selected' : ''} onClick={() => setTaskFilter(filter)}>{filter} <span>{filter === 'Todas' ? tasks.length : filter === 'Em aberto' ? open.length : completed}</span></button>)}</div>
        {visibleTasks.length ? visibleTasks.map(t => <div className={`task-row ${t.done ? 'done' : ''}`} key={t.id}><button className="check" onClick={() => toggleTask(t)} aria-label={t.done ? `Reabrir ${t.title}` : `Concluir ${t.title}`}>{t.done ? '✓' : ''}</button><div><strong>{t.title}</strong><small>{t.nextStep || 'Sem primeiro passo definido'}</small><small>Início: {formatDate(t.startDate || new Date(t.createdAt).toISOString().slice(0, 10))}</small>{t.dueDate && <small className={!t.done && t.dueDate < todayLocal() ? 'overdue' : ''}>{dueLabel(t.dueDate, t.done)}</small>}<span className={`tag ${t.category.toLowerCase()}`}>{t.category}</span></div><button className="remove" onClick={() => removeTask(t)} aria-label={`Excluir ${t.title}`} title="Excluir tarefa">×</button></div>) : <div className="task-empty"><img src="/images/diagnosis-workspace.jpg" alt="" /><Empty title={tasks.length ? 'Nenhuma tarefa por aqui.' : 'Seu próximo passo começa aqui.'} text={tasks.length ? 'Experimente outro filtro ou termo de busca.' : 'Crie sua primeira tarefa e transforme uma intenção em ação.'} /></div>}
      </section></div></>}
    {page === 'Diagnóstico' && <><div className="intro"><h2>Reconheça seus padrões.</h2><p>Com que frequência cada situação acontece com você? Responda de 1 (nunca) a 5 (sempre).</p></div><section className="panel diagnosis"><div className="panel-heading"><div><span className="eyebrow">TRÍADE DO TEMPO</span><h2>Seu diagnóstico</h2></div><span className="progress-label">{answers.filter(Boolean).length} de 9 respostas</span></div>{questions.map((q, i) => <div className="question" key={q.text}><div><small>{String(i + 1).padStart(2, '0')} / {q.category}</small><strong>{q.text}</strong></div><div className="scale" role="group" aria-label={q.text}>{[1, 2, 3, 4, 5].map(n => <button key={n} type="button" className={answers[i] === n ? 'selected' : ''} onClick={() => setAnswers(current => current.map((a, index) => index === i ? n : a))} aria-label={`${n} de 5`} aria-pressed={answers[i] === n}>{n}</button>)}</div></div>)}<div className="form-footer"><span>1 = nunca · 5 = sempre</span><button className="primary" onClick={saveDiagnosis} disabled={answers.some(a => !a)}>Salvar diagnóstico →</button></div></section>{latest && <section className="panel result"><span className="eyebrow">SEU ÚLTIMO RESULTADO</span><h2>Onde a procrastinação aparece</h2><p>Os percentuais mostram a participação relativa de cada dimensão nas suas respostas; não são uma avaliação clínica.</p>{categories.map((c, i) => <div className="score-row" key={c}><div><strong>{c}</strong><b>{scores[i]}%</b></div><div className="track"><div style={{ width: `${scores[i]}%` }} /></div></div>)}{advice && <div className="recommendation"><span className="eyebrow">RECOMENDAÇÃO PARA VOCÊ</span><h3>Seu padrão: {advice.behavior}</h3><p>Na dimensão {advice.category.toLowerCase()}, este comportamento apareceu com mais frequência. {advice.action}</p><button className="link-button" onClick={() => navigate('Minhas tarefas')}>Planejar meu primeiro passo →</button></div>}</section>}</>}
    {page === 'Foco' && <><div className="intro"><h2>Crie espaço para começar.</h2><p>Uma coisa de cada vez. Este momento é seu.</p></div>
      <section className="focus-experience"><div className="focus-scene"><img src="/images/focus-nature.jpg" alt="Luz do sol atravessando uma floresta tranquila" /><div className="focus-scene-copy"><span className="scene-label">RESPIRE. SIMPLIFIQUE. COMECE.</span><h2>Menos ruído.<br />Mais presença.</h2><p>Você não precisa dar conta de tudo.<br />Só estar aqui, no próximo passo.</p></div><span className="scene-footnote">UM INTERVALO PARA O QUE IMPORTA</span></div>
      <div className="focus-card focus-controls"><div className="focus-status"><span className={running ? 'status-dot running' : 'status-dot'} />{running ? 'Em concentração' : seconds === 0 ? 'Sessão concluída' : 'Seu momento de foco'}</div><span className="eyebrow">SESSÃO DE FOCO</span>
        <div className="timer-dial" style={{'--progress': `${focusProgress}%`} as React.CSSProperties}><div className="timer-center"><div className="timer" role="timer" aria-label="Tempo restante">{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</div><span>{seconds === 0 ? 'Um passo a mais. Celebre.' : running ? 'Um passo de cada vez' : 'Tudo começa com uma pausa'}</span></div></div>
        <div className="focus-presets" role="group" aria-label="Durações rápidas">{[15,25,50].map(minutes => <button key={minutes} disabled={running} aria-pressed={focusMinutes === minutes} className={focusMinutes === minutes ? 'selected' : ''} onClick={() => {setFocusMinutes(minutes); setSeconds(minutes * 60);}}>{minutes} min</button>)}</div>
<label className="focus-duration">Duração da sessão (minutos)<input type="number" min="5" max="120" step="5" value={focusMinutes} disabled={running} onChange={e => { const minutes = Number(e.target.value); setFocusMinutes(minutes); if (minutes >= 5 && minutes <= 120) setSeconds(minutes * 60); }} /></label><div className="timer-actions"><button className="primary" onClick={() => { if (focusMinutes < 5 || focusMinutes > 120 || !Number.isInteger(focusMinutes)) { setMessage('Escolha de 5 a 120 minutos.'); return; } if (seconds === 0) setSeconds(focusMinutes * 60); setRunning(!running); }}>{running ? 'Pausar' : seconds === 0 ? 'Recomeçar' : 'Iniciar foco'}</button><button className="secondary" onClick={() => { setRunning(false); setSeconds(focusMinutes * 60); }}>Reiniciar</button></div><small>De 5 a 120 minutos de atenção para o que importa.</small></div></section>
      <div className="focus-guidance">{[['01', 'Escolha uma intenção', 'Defina uma ação pequena antes de iniciar.'], ['02', 'Abra espaço', 'Silencie notificações e deixe só o necessário.'], ['03', 'Respeite seu ritmo', 'Ao terminar, respire e reconheça seu avanço.']].map(([n,title,text]) => <article key={n}><span>{n}</span><div><h3>{title}</h3><p>{text}</p></div></article>)}</div></>}
    {page === 'Perfil' && <><div className="intro"><h2>Seu espaço, do seu jeito.</h2><p>Uma rotina que respeita quem você é e como você funciona.</p></div>
      <section className="profile-banner"><img src="/images/profile-home.jpg" alt="Ambiente de trabalho acolhedor com luz natural e plantas" /><div className="profile-banner-content"><span className="profile-monogram" aria-hidden="true">{(profile.displayName || user.displayName || user.email || 'U')[0].toUpperCase()}</span><div><span className="eyebrow">SEU ESPAÇO PESSOAL</span><h2>{profile.displayName || user.displayName || 'Seu perfil'}</h2><p>{user.email || 'Conta Google'}</p></div></div><span className="profile-banner-note">Mais clareza para viver<br />no seu próprio ritmo.</span></section>
      <div className="profile-layout"><section className="panel profile-details"><div className="composer-heading"><span className="summary-icon"><NavIcon index={4} /></span><div><span className="eyebrow">DADOS E PREFERÊNCIAS</span><h2>Editar perfil</h2></div></div><form className="task-form profile-form" onSubmit={saveProfile}><label>Nome<input value={profileName} maxLength={80} onChange={e => setProfileName(e.target.value)} required /></label><label>E-mail<input value={user.email || ''} readOnly /></label><label>Horário do lembrete diário<input type="time" value={notifyTime} onChange={e => setNotifyTime(e.target.value)} /></label><label>Duração padrão do foco (minutos)<input type="number" min="5" max="120" value={focusMinutes} onChange={e => { const minutes = Number(e.target.value); setFocusMinutes(minutes); if (!running && minutes >= 5 && minutes <= 120) setSeconds(minutes * 60); }} required /></label><button className="primary" type="submit">Salvar perfil</button></form></section>
      <div className="profile-aside"><section className="panel notification-card"><div className="panel-heading"><span className="summary-icon"><BellIcon /></span><span className={`notification-state ${profile.notifyEnabled ? 'enabled' : ''}`}>{profile.notifyEnabled ? 'Ativadas' : 'Desativadas'}</span></div><span className="eyebrow">UM CUIDADO COM SUA ROTINA</span><h2>Um lembrete. Um novo começo.</h2><p>Um convite gentil para retomar o que importa, no horário escolhido por você.</p><div className="notification-preview"><div className="notification-brand"><img src="/favicon.png" alt="" /><strong>Descomplex</strong><span>{profile.notifyTime || '09:00'}</span></div><strong>Seu próximo passo espera por você.</strong><p>Reserve um momento para cuidar das suas intenções.</p><small>Exemplo de lembrete</small></div><div className="notification-meta"><span>Horário salvo <strong>{profile.notifyTime || '09:00'}</strong></span><span>Fuso horário <strong>{profile.timezone}</strong></span></div>{profile.notifyEnabled ? <button className="secondary" onClick={disableNotifications}>Desativar notificações</button> : <button className="primary" onClick={enableNotifications}>Ativar notificações</button>}<small className="notification-help">O navegador pedirá permissão. A entrega depende das permissões do dispositivo e da conexão.</small></section>
      <section className="profile-quote"><img src="/images/diagnosis-workspace.jpg" alt="" loading="lazy" /><div><span className="eyebrow">LEVE COM VOCÊ</span><p>Consistência é voltar.<br />Quantas vezes precisar.</p></div></section></div></div></>}

  </main></div>;
}

function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><span aria-hidden="true">✳︎</span><strong>{title}</strong><small>{text}</small></div>; }

function NavIcon({ index }: { index: number }) {
  const paths = [
    <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M10 4v16" /></>,
    <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="m8 12 3 3 5-7" /></>,
    <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="5" /></>,
    <><circle cx="12" cy="12" r="8" /><path d="M12 7v6h5" /></>,
    <><circle cx="12" cy="7" r="3" /><path d="M5 21v-2a7 7 0 0 1 14 0v2Z" /></>,
  ];
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[index]}</svg>;
}

function BellIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>; }
