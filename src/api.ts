export type User = { uid: string; email: string; displayName: string };
export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {method,credentials:'same-origin',headers:body === undefined ? undefined : {'Content-Type':'application/json'},body:body === undefined ? undefined : JSON.stringify(body)});
  let data: any;
  try { data = await response.json(); } catch { throw new Error('O servidor do aplicativo não está disponível. Use o deploy do Netlify ou npm run dev:full.'); }
  if(!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}
