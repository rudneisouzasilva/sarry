// Datas e números em pt-BR. O Brasil (Brasília) não tem horário de verão desde 2019: UTC−3 fixo.
export const TZ_OFFSET_MIN = -180;

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// "Data local" representada como Date em UTC deslocado, para cálculos de dia
function local(date: Date) {
  return new Date(date.getTime() + TZ_OFFSET_MIN * 60_000);
}

export function startOfLocalDay(date = new Date()) {
  const l = local(date);
  l.setUTCHours(0, 0, 0, 0);
  return new Date(l.getTime() - TZ_OFFSET_MIN * 60_000);
}

export function greeting(date = new Date()) {
  const h = local(date).getUTCHours();
  if (h < 5) return 'Boa noite';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function longDate(date = new Date()) {
  const l = local(date);
  const day = WEEKDAYS[l.getUTCDay()];
  return `${day[0].toUpperCase()}${day.slice(1)}, ${l.getUTCDate()} de ${MONTHS[l.getUTCMonth()]}`;
}

export function shortWeekday(date: Date) {
  return WEEKDAYS_SHORT[local(date).getUTCDay()];
}

export function clock(date = new Date()) {
  const l = local(date);
  return `${String(l.getUTCHours()).padStart(2, '0')}:${String(l.getUTCMinutes()).padStart(2, '0')}`;
}

export function duration(ms: number) {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

export function relative(dateIso: string, now = Date.now()) {
  const diff = Math.max(0, now - new Date(dateIso).getTime());
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

export function money(value: number) {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

export function decimal(value: number, digits = 1) {
  return value.toFixed(digits).replace('.', ',');
}
