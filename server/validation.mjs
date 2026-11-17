export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = message => { throw new HttpError(400, message); };
const text = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
export function validId(id) { if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id || '')) bad('Identificador inválido.'); return id; }
export function taskInput(input) {
  if (!text(input.title,120,true) || !text(input.nextStep,180) || !['Urgente','Importante','Circunstancial'].includes(input.category)) bad('Confira o título, primeiro passo e dimensão.');
  const {startDate, dueDate} = input;
  const date = value => {if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const parsed = new Date(value+'T00:00:00Z');return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;};
  if (!date(startDate) || !date(dueDate) || dueDate < startDate) bad('Confira as datas de início e prazo.');
  return {title:input.title.trim(),nextStep:input.nextStep.trim(),category:input.category,startDate,dueDate,done:false};
}
export function diagnosisInput(input) {
  if (!Array.isArray(input.answers) || input.answers.length !== 9 || input.answers.some(n=>!Number.isInteger(n)||n<1||n>5)) bad('Responda às nove afirmações, de 1 a 5.');
  return {answers:input.answers};
}
export function profileInput(input) {
  const {displayName,focusMinutes,notifyEnabled,notifyTime,timezone} = input;
  if(!text(displayName,80,true)||!Number.isInteger(focusMinutes)||focusMinutes<5||focusMinutes>120||typeof notifyEnabled!=='boolean'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(notifyTime)||!text(timezone,80,true)) bad('Confira os dados do perfil.');
  try { new Intl.DateTimeFormat('pt-BR',{timeZone:timezone}); } catch { bad('Fuso horário inválido.'); }
  return {displayName:displayName.trim(),focusMinutes,notifyEnabled,notifyTime,timezone};
}
