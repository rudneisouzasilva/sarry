// Chamada pelo pg_cron a cada 10 minutos: grava mudanças de estado e dispara alertas push.
import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { TuyaClient } from '../_shared/tuya.ts';
import { loadDevices, recordChanges, samplesFor } from '../_shared/core.ts';
import { evaluateAlerts } from '../_shared/notify.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Não autorizado' }, 401);

  const db = adminClient();
  try {
    const tuya = new TuyaClient(db);
    const devices = await loadDevices(db, tuya, true);
    const changed = await recordChanges(db, devices.flatMap(samplesFor), 'snapshot');
    const pushed = await evaluateAlerts(db, devices);
    return json({ ok: true, devices: devices.length, changed, pushed });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Erro inesperado' }, 500);
  }
});
