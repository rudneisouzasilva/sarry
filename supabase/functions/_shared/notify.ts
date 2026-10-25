// Alertas push: luz esquecida acesa e aparelho offline. Avaliados a cada snapshot.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { type DeviceDTO, isLightChannel } from './core.ts';

const TZ = 'America/Sao_Paulo';

function localHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(date));
}

function localDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);
}

type Alert = { key: string; title: string; body: string; url: string };

async function sendPush(db: SupabaseClient, alerts: Alert[]) {
  if (!alerts.length) return 0;
  const { data: tokens } = await db.from('push_tokens').select('token');
  if (!tokens?.length) return 0;

  const messages = alerts.flatMap((a) =>
    tokens.map((t) => ({
      to: t.token,
      title: a.title,
      body: a.body,
      sound: 'default',
      channelId: 'alertas',
      data: { url: a.url },
    })),
  );
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  const result = await res.json().catch(() => null);
  // remove tokens de aparelhos que desinstalaram o app
  const dead = (result?.data ?? [])
    .map((r: { status: string; details?: { error?: string } }, i: number) =>
      r.status === 'error' && r.details?.error === 'DeviceNotRegistered' ? messages[i].to : null,
    )
    .filter(Boolean);
  if (dead.length) await db.from('push_tokens').delete().in('token', dead);
  return messages.length;
}

export async function evaluateAlerts(db: SupabaseClient, devices: DeviceDTO[]) {
  const { data: settings } = await db.from('settings').select('*').eq('id', 1).single();
  if (!settings) return 0;

  const alerts: Alert[] = [];
  const now = Date.now();

  if (settings.notify_forgotten) {
    const lights = devices.filter((d) => d.online && !d.hidden && d.channels.some((c) => isLightChannel(d.kind, c.code)));
    const { data: latest } = await db
      .from('latest_samples')
      .select('device_id, channel, is_on, sampled_at')
      .in('device_id', lights.map((d) => d.id));
    const since = new Map((latest ?? []).map((l) => [`${l.device_id}|${l.channel}`, l]));
    const hour = localHour();
    const lateNight = hour >= settings.late_night_hour && hour < 6;

    for (const d of lights) {
      for (const c of d.channels.filter((ch) => ch.isOn && !ch.hidden && isLightChannel(d.kind, ch.code))) {
        const sample = since.get(`${d.id}|${c.code}`);
        if (!sample?.is_on) continue;
        const onFor = now - new Date(sample.sampled_at).getTime();
        if (onFor >= settings.forgotten_light_hours * 3600_000) {
          alerts.push({
            key: `forgotten:${d.id}:${c.code}:${sample.sampled_at}`,
            title: 'Luz esquecida acesa',
            body: `${c.name} está acesa há mais de ${settings.forgotten_light_hours} h.`,
            url: '/',
          });
        } else if (lateNight) {
          alerts.push({
            key: `late:${d.id}:${c.code}:${localDate()}`,
            title: 'Luz acesa de madrugada',
            body: `${c.name} continua acesa.`,
            url: '/',
          });
        }
      }
    }
  }

  if (settings.notify_offline) {
    const { data: rows } = await db.from('devices').select('id, last_seen_at, hidden').eq('online', false);
    for (const row of rows ?? []) {
      if (row.hidden || !row.last_seen_at) continue;
      if (now - new Date(row.last_seen_at).getTime() < settings.offline_minutes * 60_000) continue;
      const d = devices.find((x) => x.id === row.id);
      alerts.push({
        key: `offline:${row.id}:${row.last_seen_at}`,
        title: 'Dispositivo offline',
        body: `${d?.name ?? 'Um dispositivo'} está sem conexão há mais de ${settings.offline_minutes} min.`,
        url: '/',
      });
    }
  }

  if (!alerts.length) return 0;
  // envia só o que ainda não foi avisado
  const { data: sent } = await db.from('alert_state').select('key').in('key', alerts.map((a) => a.key));
  const sentKeys = new Set((sent ?? []).map((s) => s.key));
  const fresh = alerts.filter((a) => !sentKeys.has(a.key));
  if (!fresh.length) return 0;
  await db.from('alert_state').insert(fresh.map((a) => ({ key: a.key })));
  return sendPush(db, fresh);
}
