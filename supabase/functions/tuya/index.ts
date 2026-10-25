// API do app Sarry. Toda chamada à Tuya passa por aqui; o app nunca vê os segredos.
// POST /functions/v1/tuya  { action: '...', ...params }
import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient, HttpError, requireMember } from '../_shared/supabase.ts';
import { TuyaClient, TuyaError } from '../_shared/tuya.ts';
import {
  type DeviceDTO,
  getHomeId,
  listAutomations,
  listScenes,
  loadDevices,
  recordChanges,
  runScene,
  samplesFor,
  sanitize,
  setAutomation,
  fetchTuyaDevices,
} from '../_shared/core.ts';

type Body = Record<string, unknown> & { action?: string };
type Command = { code: string; value: unknown };
type Source = 'app' | 'cena' | 'atalho' | 'painel';

type SpecFunction = { code: string; type: string; values: string; name?: string; desc?: string };
type Spec = { category: string; functions: SpecFunction[]; status: SpecFunction[] };

function parseValues(raw: string | undefined) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

type ThingProperty = {
  code: string;
  accessMode: string;
  typeSpec: { type: string; range?: string[]; min?: number; max?: number; scale?: number; step?: number; unit?: string };
};

// Propriedades do modelo de coisa (v2). Alguns aparelhos têm recursos que só existem aqui,
// fora do conjunto padrão de comandos (ex.: velocidade do ventilador do ar AUX).
async function getModel(tuya: TuyaClient, id: string) {
  try {
    const res = await tuya.request<{ model: string }>('GET', `/v2.0/cloud/thing/${id}/model`);
    const model = parseValues(res.model) as { services?: { properties?: ThingProperty[] }[] };
    return (model.services ?? []).flatMap((s) => s.properties ?? []).map((p) => ({
      code: p.code,
      access: p.accessMode,
      type: p.typeSpec.type,
      values: {
        range: p.typeSpec.range,
        min: p.typeSpec.min,
        max: p.typeSpec.max,
        scale: p.typeSpec.scale,
        step: p.typeSpec.step,
        unit: p.typeSpec.unit,
      },
    }));
  } catch {
    return [];
  }
}

async function getSpec(tuya: TuyaClient, id: string) {
  return tuya.cached(`spec2:${id}`, 24 * 3600, async () => {
    const spec = await tuya.request<Spec>('GET', `/v1.0/iot-03/devices/${id}/specification`);
    const map = (list: SpecFunction[] = []) =>
      list.map((f) => ({ code: f.code, type: f.type, name: f.name ?? null, values: parseValues(f.values) }));
    return {
      category: spec.category,
      functions: map(spec.functions),
      status: map(spec.status),
      model: await getModel(tuya, id),
    };
  });
}

async function getShadow(tuya: TuyaClient, id: string, codes?: string[]) {
  const res = await tuya.request<{ properties: { code: string; value: unknown }[] }>(
    'GET',
    `/v2.0/cloud/thing/${id}/shadow/properties`,
    { query: { codes: codes?.length ? codes.join(',') : undefined } },
  );
  return Object.fromEntries((res.properties ?? []).map((p) => [p.code, p.value]));
}

// Códigos de "comando não suportado" no conjunto padrão; tentamos pelo modelo de propriedades
const UNSUPPORTED = new Set([2008, 501, 1109]);

async function issueProperties(tuya: TuyaClient, id: string, commands: Command[]) {
  const properties = JSON.stringify(Object.fromEntries(commands.map((c) => [c.code, c.value])));
  await tuya.request('POST', `/v2.0/cloud/thing/${id}/shadow/properties/issue`, { body: { properties } });
}

async function sendCommands(tuya: TuyaClient, id: string, commands: Command[], via: 'standard' | 'properties' = 'standard') {
  if (via === 'properties') return issueProperties(tuya, id, commands);
  try {
    await tuya.request('POST', `/v1.0/iot-03/devices/${id}/commands`, { body: { commands } });
  } catch (err) {
    if (!(err instanceof TuyaError) || !UNSUPPORTED.has(Number(err.code))) throw err;
    await issueProperties(tuya, id, commands);
  }
}

async function commandDevice(
  db: ReturnType<typeof adminClient>,
  tuya: TuyaClient,
  userId: string,
  params: { id: string; commands: Command[]; source?: Source; target?: string; via?: 'standard' | 'properties' },
) {
  const { id, commands } = params;
  if (!id || !Array.isArray(commands) || !commands.length) throw new HttpError(400, 'Comando inválido');
  let error: string | null = null;
  try {
    await sendCommands(tuya, id, commands, params.via);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  await db.from('command_log').insert({
    user_id: userId,
    device_id: id,
    target: params.target ?? null,
    commands,
    source: params.source ?? 'app',
    ok: !error,
    error,
  });
  if (error) throw new HttpError(502, `O aparelho não aceitou o comando: ${error}`);

  await tuya.invalidate('devices');
  // registra na hora a mudança de liga/desliga, para o histórico de uso ficar exato
  const switches = commands.filter((c) => typeof c.value === 'boolean' && /^(switch(_led)?(_\d+)?|power)$/i.test(c.code));
  if (switches.length) {
    await recordChanges(
      db,
      switches.map((c) => ({ device_id: id, channel: c.code, is_on: c.value as boolean, online: true })),
      'comando',
    );
  }
  return { ok: true };
}

async function quickAction(
  db: ReturnType<typeof adminClient>,
  tuya: TuyaClient,
  userId: string,
  action: string,
  source: Source,
) {
  if (action === 'desligar_ar') {
    const devices = await loadDevices(db, tuya);
    const acs = devices.filter((d) => d.kind === 'ac' && d.channels[0]);
    if (!acs.length) throw new HttpError(404, 'Nenhum ar-condicionado encontrado');
    for (const ac of acs) {
      await commandDevice(db, tuya, userId, {
        id: ac.id,
        commands: [{ code: ac.channels[0].code, value: false }],
        source,
        target: ac.name,
      });
    }
    return { ok: true, message: 'Ar-condicionado desligado' };
  }
  const { data: settings } = await db.from('settings').select('quick_scenes').eq('id', 1).single();
  const sceneName: string | undefined = settings?.quick_scenes?.[action];
  if (!sceneName) throw new HttpError(400, 'Atalho desconhecido');
  const scenes = await listScenes(tuya);
  const scene = scenes.find((s) => s.name.trim().toLowerCase() === sceneName.trim().toLowerCase());
  if (!scene) throw new HttpError(404, `Crie uma cena chamada "${sceneName}" no app Smart Life/Nova Digital`);
  return runSceneLogged(db, tuya, userId, scene.id, scene.api, scene.name, source);
}

async function runSceneLogged(
  db: ReturnType<typeof adminClient>,
  tuya: TuyaClient,
  userId: string,
  id: string,
  api: 'v1' | 'v2',
  name: string,
  source: Source,
) {
  let error: string | null = null;
  try {
    await runScene(tuya, id, api);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  await db.from('command_log').insert({
    user_id: userId,
    device_id: null,
    target: `Cena ${name}`,
    commands: [{ code: 'scene', value: id }],
    source: source === 'app' ? 'cena' : source,
    ok: !error,
    error,
  });
  if (error) throw new HttpError(502, `Não foi possível executar a cena: ${error}`);
  await tuya.invalidate('devices');
  return { ok: true, message: `Cena ${name} executada` };
}

async function diagnostics(tuya: TuyaClient) {
  const raw = await fetchTuyaDevices(tuya, true);
  const devices = [];
  for (const d of raw) {
    const entry: Record<string, unknown> = { device: sanitize(d) };
    try {
      entry.specification = await getSpec(tuya, d.id);
    } catch (err) {
      entry.specification_error = err instanceof Error ? err.message : String(err);
    }
    try {
      const model = await tuya.request<{ model: string }>('GET', `/v2.0/cloud/thing/${d.id}/model`);
      entry.thing_model = parseValues(model.model);
    } catch (err) {
      entry.thing_model_error = err instanceof Error ? err.message : String(err);
    }
    devices.push(entry);
  }
  const extra: Record<string, unknown> = {};
  try {
    extra.home_id = await getHomeId(tuya);
    extra.scenes = await listScenes(tuya, true);
    extra.automations = await listAutomations(tuya, true);
  } catch (err) {
    extra.scenes_error = err instanceof Error ? err.message : String(err);
  }
  return {
    generated_at: new Date().toISOString(),
    base_url: Deno.env.get('TUYA_BASE_URL') ?? 'https://openapi.tuyaus.com',
    device_count: devices.length,
    devices,
    ...extra,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const db = adminClient();
  try {
    const user = await requireMember(req, db);
    const body = (await req.json().catch(() => ({}))) as Body;
    const tuya = new TuyaClient(db);
    const source = (body.source as Source) ?? 'app';

    switch (body.action) {
      case 'devices.list': {
        const devices: DeviceDTO[] = await loadDevices(db, tuya, Boolean(body.force));
        return json({ devices, fetchedAt: new Date().toISOString() });
      }
      case 'devices.spec':
        return json(await getSpec(tuya, String(body.id)));
      case 'devices.shadow':
        return json(await getShadow(tuya, String(body.id), body.codes as string[] | undefined));
      case 'devices.command':
        return json(
          await commandDevice(db, tuya, user.id, {
            id: String(body.id),
            commands: body.commands as Command[],
            source,
            target: body.target as string | undefined,
            via: body.via === 'properties' ? 'properties' : 'standard',
          }),
        );
      case 'devices.logs': {
        const hours = Math.min(Number(body.hours) || 24, 24 * 7);
        const end = Date.now();
        const logs = await tuya.request('GET', `/v1.0/devices/${body.id}/logs`, {
          query: { type: 7, start_time: end - hours * 3600_000, end_time: end, size: 100 },
        });
        return json(logs);
      }
      case 'scenes.list':
        return json({ scenes: await listScenes(tuya, Boolean(body.force)) });
      case 'scenes.run':
        return json(
          await runSceneLogged(db, tuya, user.id, String(body.id), body.api === 'v2' ? 'v2' : 'v1', String(body.name ?? ''), source),
        );
      case 'automations.list':
        return json({ automations: await listAutomations(tuya, Boolean(body.force)) });
      case 'automations.set': {
        await setAutomation(tuya, String(body.id), Boolean(body.enabled), body.api === 'v2' ? 'v2' : 'v1');
        await tuya.invalidate('automations');
        return json({ ok: true });
      }
      case 'quick.run':
        return json(await quickAction(db, tuya, user.id, String(body.quick), source));
      case 'diagnostics':
        return json(await diagnostics(tuya));
      case 'snapshot.now': {
        // atualização manual do histórico (ex.: ao abrir a tela de Uso)
        const devices = await loadDevices(db, tuya, true);
        const changed = await recordChanges(db, devices.flatMap(samplesFor), 'snapshot');
        return json({ ok: true, changed });
      }
      default:
        throw new HttpError(400, `Ação desconhecida: ${body.action}`);
    }
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    if (err instanceof TuyaError) return json({ error: `Tuya: ${err.message}`, code: err.code }, 502);
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Erro inesperado' }, 500);
  }
});
