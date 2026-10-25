// Regras de negócio compartilhadas entre a API do app (tuya) e o snapshot periódico.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { TuyaClient } from './tuya.ts';

export type TuyaStatus = { code: string; value: unknown };

export type TuyaDevice = {
  id: string;
  name: string;
  category: string;
  online: boolean;
  product_name?: string;
  sub?: boolean;
  icon?: string;
  status?: TuyaStatus[];
  local_key?: string;
  ip?: string;
  [key: string]: unknown;
};

type DeviceRow = {
  id: string;
  tuya_name: string | null;
  custom_name: string | null;
  room: string | null;
  kind: 'light' | 'ac' | 'fan' | 'hub' | 'other';
  category: string | null;
  product_name: string | null;
  power_w: number | null;
  cooling_only: boolean;
  channels: Record<string, { name?: string; room?: string; hidden?: boolean }>;
  is_sub: boolean;
  online: boolean | null;
  sort: number;
  hidden: boolean;
};

export type Channel = { code: string; name: string; room: string | null; hidden: boolean; isOn: boolean };

export type DeviceDTO = {
  id: string;
  name: string;
  tuyaName: string;
  room: string | null;
  kind: DeviceRow['kind'];
  category: string;
  productName: string | null;
  online: boolean;
  isSub: boolean;
  powerW: number | null;
  coolingOnly: boolean;
  hidden: boolean;
  sort: number;
  status: Record<string, unknown>;
  channels: Channel[];
};

const LIGHT_CATEGORIES = new Set(['kg', 'cz', 'pc', 'tdq', 'dj', 'dd', 'xdd', 'fwd', 'dc', 'tgkg', 'tgq', 'qjdcz', 'clkg']);
const AC_CATEGORIES = new Set(['kt', 'ktkzq', 'infrared_ac']);
const FAN_CATEGORIES = new Set(['fskg', 'fs']);
const HUB_CATEGORIES = new Set(['wg2', 'wg', 'wfcon', 'zigbee']);

export function guessKind(category: string): DeviceRow['kind'] {
  if (AC_CATEGORIES.has(category)) return 'ac';
  if (FAN_CATEGORIES.has(category)) return 'fan';
  if (HUB_CATEGORIES.has(category)) return 'hub';
  if (LIGHT_CATEGORIES.has(category)) return 'light';
  return 'other';
}

const SWITCH_CODE = /^switch(_\d+)?$|^switch_led(_\d+)?$/;
const AC_POWER_CODES = ['switch', 'power', 'Power'];

export function statusMap(status: TuyaStatus[] = []): Record<string, unknown> {
  return Object.fromEntries(status.map((s) => [s.code, s.value]));
}

// Canais "liga/desliga" de cada aparelho: teclas dos interruptores ou o liga do ar
export function channelStates(kind: DeviceRow['kind'], status: Record<string, unknown>) {
  if (kind === 'light') {
    return Object.entries(status)
      .filter(([code, value]) => SWITCH_CODE.test(code) && typeof value === 'boolean')
      .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
      .map(([code, value]) => ({ code, isOn: value as boolean }));
  }
  if (kind === 'fan') {
    // liga do ventilador e, se houver, a luz do ventilador
    return ['switch_fan', 'switch_led']
      .filter((code) => typeof status[code] === 'boolean')
      .map((code) => ({ code, isOn: status[code] as boolean }));
  }
  if (kind === 'ac') {
    const code = AC_POWER_CODES.find((c) => typeof status[c] === 'boolean');
    return code ? [{ code, isOn: status[code] as boolean }] : [];
  }
  return [];
}

export function sanitize(device: TuyaDevice) {
  const { local_key: _lk, ip: _ip, ...rest } = device;
  return rest;
}

export async function fetchTuyaDevices(tuya: TuyaClient, force = false): Promise<TuyaDevice[]> {
  return tuya.cached(
    'devices',
    15,
    async () => {
      const list = await tuya.request<TuyaDevice[]>('GET', `/v1.0/users/${tuya.uid}/devices`);
      return list.map((d) => sanitize(d) as TuyaDevice);
    },
    force,
  );
}

// Grava novos aparelhos e atualiza os dados vindos da Tuya sem apagar o que o usuário editou
export async function syncDevices(db: SupabaseClient, list: TuyaDevice[]): Promise<DeviceRow[]> {
  const { data: existing } = await db.from('devices').select('*');
  const byId = new Map((existing ?? []).map((d: DeviceRow) => [d.id, d]));
  const now = new Date().toISOString();

  const fresh = list
    .filter((d) => !byId.has(d.id))
    .map((d, i) => ({
      id: d.id,
      tuya_name: d.name,
      kind: guessKind(d.category),
      category: d.category,
      product_name: d.product_name ?? null,
      is_sub: Boolean(d.sub),
      online: d.online,
      last_seen_at: d.online ? now : null,
      sort: (existing?.length ?? 0) + i,
    }));
  if (fresh.length) await db.from('devices').insert(fresh);

  const changed = list.filter((d) => {
    const row = byId.get(d.id);
    return row && (row.online !== d.online || row.tuya_name !== d.name || row.category !== d.category);
  });
  await Promise.all(
    changed.map((d) =>
      db
        .from('devices')
        .update({
          tuya_name: d.name,
          category: d.category,
          product_name: d.product_name ?? null,
          is_sub: Boolean(d.sub),
          online: d.online,
          ...(d.online ? { last_seen_at: now } : {}),
          updated_at: now,
        })
        .eq('id', d.id),
    ),
  );

  const { data } = await db.from('devices').select('*').order('sort');
  return (data ?? []) as DeviceRow[];
}

export function toDTO(device: TuyaDevice, row: DeviceRow | undefined): DeviceDTO {
  const kind = row?.kind ?? guessKind(device.category);
  const status = statusMap(device.status);
  const name = row?.custom_name || device.name;
  const multi = channelStates(kind, status).length > 1;
  return {
    id: device.id,
    name,
    tuyaName: device.name,
    room: row?.room ?? null,
    kind,
    category: device.category,
    productName: device.product_name ?? null,
    online: device.online,
    isSub: Boolean(device.sub),
    powerW: row?.power_w ?? null,
    coolingOnly: row?.cooling_only ?? false,
    hidden: row?.hidden ?? false,
    sort: row?.sort ?? 0,
    status,
    channels: channelStates(kind, status).map(({ code, isOn }, i) => {
      const meta = row?.channels?.[code] ?? {};
      return {
        code,
        name: meta.name || (multi ? `${name} ${i + 1}` : name),
        room: meta.room ?? row?.room ?? null,
        hidden: meta.hidden ?? false,
        isOn,
      };
    }),
  };
}

type SampleInput = { device_id: string; channel: string; is_on: boolean; online: boolean; data?: unknown };

// Insere uma amostra só quando o estado do canal mudou desde a última
export async function recordChanges(db: SupabaseClient, samples: SampleInput[], origin: 'snapshot' | 'comando') {
  if (!samples.length) return 0;
  const ids = [...new Set(samples.map((s) => s.device_id))];
  const { data: latest } = await db
    .from('latest_samples')
    .select('device_id, channel, is_on, online')
    .in('device_id', ids);
  const last = new Map((latest ?? []).map((l) => [`${l.device_id}|${l.channel}`, l]));
  const changes = samples.filter((s) => {
    const prev = last.get(`${s.device_id}|${s.channel}`);
    return !prev || prev.is_on !== s.is_on || prev.online !== s.online;
  });
  if (changes.length) await db.from('status_samples').insert(changes.map((c) => ({ ...c, origin })));
  return changes.length;
}

export function samplesFor(dto: DeviceDTO): SampleInput[] {
  if (dto.kind === 'hub' || dto.kind === 'other') {
    return [{ device_id: dto.id, channel: 'online', is_on: dto.online, online: dto.online }];
  }
  return dto.channels.map((c) => ({
    device_id: dto.id,
    channel: c.code,
    // aparelho offline conta como desligado no histórico
    is_on: dto.online && c.isOn,
    online: dto.online,
    data:
      dto.kind === 'ac'
        ? {
            temp_set: dto.status.temp_set ?? null,
            temp_current: dto.status.temp_current ?? null,
            mode: dto.status.mode ?? null,
          }
        : undefined,
  }));
}

export async function loadDevices(db: SupabaseClient, tuya: TuyaClient, force = false) {
  const list = await fetchTuyaDevices(tuya, force);
  const rows = await syncDevices(db, list);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return list
    .map((d) => toDTO(d, byId.get(d.id)))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Casa, cenas e automações
// ---------------------------------------------------------------------------
export async function getHomeId(tuya: TuyaClient): Promise<string> {
  return tuya.cached('home', 7 * 24 * 3600, async () => {
    const homes = await tuya.request<{ home_id: number | string; name: string }[]>('GET', `/v1.0/users/${tuya.uid}/homes`);
    if (!homes.length) throw new Error('Nenhuma casa encontrada na conta Tuya');
    return String(homes[0].home_id);
  });
}

export type SceneDTO = { id: string; name: string; enabled: boolean; api: 'v1' | 'v2' };
export type AutomationDTO = SceneDTO;

type V2Rule = { id: string; name: string; status?: string; enabled?: boolean; type?: string };

async function listV2Rules(tuya: TuyaClient, homeId: string, type: 'scene' | 'automation') {
  const res = await tuya.request<{ list?: V2Rule[] } | V2Rule[]>('GET', '/v2.0/cloud/scene/rule', {
    query: { space_id: homeId, type, page_size: 100 },
  });
  const list = Array.isArray(res) ? res : (res.list ?? []);
  return list.map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled ?? r.status !== 'disable',
    api: 'v2' as const,
  }));
}

export async function listScenes(tuya: TuyaClient, force = false): Promise<SceneDTO[]> {
  const homeId = await getHomeId(tuya);
  return tuya.cached(
    'scenes',
    60,
    async () => {
      try {
        const scenes = await tuya.request<{ scene_id: string; name: string; enabled: boolean }[]>(
          'GET',
          `/v1.1/homes/${homeId}/scenes`,
        );
        return scenes.map((s) => ({ id: s.scene_id, name: s.name, enabled: s.enabled !== false, api: 'v1' as const }));
      } catch {
        return listV2Rules(tuya, homeId, 'scene');
      }
    },
    force,
  );
}

export async function runScene(tuya: TuyaClient, id: string, api: 'v1' | 'v2') {
  const homeId = await getHomeId(tuya);
  if (api === 'v2') return tuya.request('POST', `/v2.0/cloud/scene/rule/${id}/actions/trigger`);
  return tuya.request('POST', `/v1.0/homes/${homeId}/scenes/${id}/trigger`);
}

export async function listAutomations(tuya: TuyaClient, force = false): Promise<AutomationDTO[]> {
  const homeId = await getHomeId(tuya);
  return tuya.cached(
    'automations',
    60,
    async () => {
      try {
        const list = await tuya.request<{ automation_id: string; name: string; enabled: boolean }[]>(
          'GET',
          `/v1.0/homes/${homeId}/automations`,
        );
        return list.map((a) => ({ id: a.automation_id, name: a.name, enabled: Boolean(a.enabled), api: 'v1' as const }));
      } catch {
        return listV2Rules(tuya, homeId, 'automation');
      }
    },
    force,
  );
}

export async function setAutomation(tuya: TuyaClient, id: string, enabled: boolean, api: 'v1' | 'v2') {
  const homeId = await getHomeId(tuya);
  if (api === 'v2') {
    return tuya.request('PUT', '/v2.0/cloud/scene/rule/state', { query: { ids: id, is_enable: String(enabled) } });
  }
  return tuya.request('PUT', `/v1.0/homes/${homeId}/automations/${id}/actions/${enabled ? 'enable' : 'disable'}`);
}
