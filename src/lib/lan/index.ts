// Controle local: no Wi-Fi de casa, o APK fala direto com os aparelhos (como o Smart Life).
// Fora de casa, na web ou se algo falhar, o comando segue pela nuvem (Edge Function), como antes.
import SarryLan from '../../../modules/sarry-lan';
import { api } from '@/lib/api';
import { secureStorage } from '@/lib/storage';
import type { Command } from '@/types';
import { fromBase64, toBase64, utf8, type Bytes } from './bytes';
import { decodeAnnouncement, TuyaSession, VERSIONS, type Dps, type Transport, type Version } from './protocol';

export type LanDevice = {
  id: string;
  localKey: string;
  // sub-aparelho Zigbee: comandos vão pelo hub (gatewayId) com o node_id como "cid"
  nodeId?: string;
  gatewayId?: string;
  // código do comando -> número do DP no aparelho
  dps: Record<string, number>;
};

type Seen = { ip: string; version: Version; at: number };

const CONFIG_KEY = 'sarry.lan.config';
const CONFIG_MAX_AGE = 12 * 3600_000;
const SEEN_FRESH_MS = 3 * 60_000; // só tenta local se o aparelho anunciou na rede há pouco
const SCAN_EVERY_MS = 60_000;
const SCAN_MS = 6_000;
const CONNECT_MS = 700;
const COMMAND_MS = 3_000;

let config: { at: number; devices: LanDevice[] } | null = null;
let syncing: Promise<void> | null = null;
let lastResync = 0;
let lastScan = 'sem varredura';
const seen = new Map<string, Seen>();
const queues = new Map<string, Promise<unknown>>();

export const lanAvailable = SarryLan != null;

async function loadConfig() {
  if (config) return config;
  const raw = await secureStorage.getItem(CONFIG_KEY).catch(() => null);
  if (raw) {
    try {
      config = JSON.parse(raw);
    } catch {
      config = null;
    }
  }
  return config;
}

// Busca as chaves locais no servidor (só com login) e guarda no armazenamento seguro do celular
export function syncLanConfig(force = false): Promise<void> {
  if (!lanAvailable) return Promise.resolve();
  syncing ??= (async () => {
    const current = await loadConfig();
    if (!force && current && Date.now() - current.at < CONFIG_MAX_AGE) return;
    const { devices } = await api.lanConfig();
    config = { at: Date.now(), devices };
    await secureStorage.setItem(CONFIG_KEY, JSON.stringify(config)).catch(() => {});
  })()
    .catch(() => {})
    .finally(() => {
      syncing = null;
    });
  return syncing;
}

export async function clearLanConfig() {
  config = null;
  seen.clear();
  await secureStorage.removeItem(CONFIG_KEY).catch(() => {});
}

// Ouve os anúncios dos aparelhos na rede (portas 6666, 6667 e 7000)
export async function scanLan() {
  if (!SarryLan) return;
  const packets = await SarryLan.listenUdp([6666, 6667, 7000], SCAN_MS).catch(() => []);
  const now = Date.now();
  const found: string[] = [];
  let unreadable = 0;
  for (const p of packets) {
    const a = decodeAnnouncement(fromBase64(p.data));
    if (!a) {
      unreadable++;
      continue;
    }
    found.push(`${a.id.slice(-5)}:${a.version}@${p.port}`);
    const version = VERSIONS.find((v) => v === a.version);
    if (version) seen.set(a.id, { ip: a.ip || p.address, version, at: now });
  }
  lastScan = `pacotes ${packets.length}, ilegíveis ${unreadable}, vistos ${[...new Set(found)].join(' ') || 'nenhum'}`;
}

// Repete a varredura enquanto o app estiver aberto; devolve a função que para
export function watchLan(): () => void {
  if (!lanAvailable) return () => {};
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const loop = async () => {
    await scanLan();
    if (!stopped) timer = setTimeout(loop, SCAN_EVERY_MS);
  };
  syncLanConfig().finally(loop);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

type Plan = { host: Seen; hostId: string; key: Bytes; cid?: string; dps: Dps };

// Plano do envio local, ou o motivo de não dar (vai para o histórico, para diagnóstico)
function plan(deviceId: string, commands: Command[]): Plan | string {
  if (!config) return 'sem chaves locais';
  const device = config.devices.find((d) => d.id === deviceId);
  if (!device) return 'aparelho sem chave local';
  if (!commands.length) return 'sem comandos';
  const hostId = device.nodeId && device.gatewayId ? device.gatewayId : device.id;
  const host = seen.get(hostId);
  if (!host) return `não encontrado na rede (${lastScan})`;
  if (Date.now() - host.at > SEEN_FRESH_MS) return 'anúncio na rede antigo';
  // a chave é a do aparelho que recebe a conexão (o hub, no caso dos Zigbee)
  const keyOwner = hostId === device.id ? device : config.devices.find((d) => d.id === hostId);
  if (!keyOwner?.localKey) return 'hub sem chave local';
  const dps: Dps = {};
  for (const c of commands) {
    const dp = device.dps[c.code];
    const ok = typeof c.value === 'boolean' || typeof c.value === 'number' || typeof c.value === 'string';
    if (dp == null || !ok) return `sem DP para ${c.code}`;
    dps[String(dp)] = c.value as boolean | number | string;
  }
  return { host, hostId, key: utf8(keyOwner.localKey), cid: hostId === device.id ? undefined : device.nodeId, dps };
}

async function open(ip: string): Promise<Transport & { close(): void }> {
  const lan = SarryLan!;
  const id = await lan.tcpOpen(ip, 6668, CONNECT_MS);
  return {
    write: async (data) => {
      await lan.tcpWrite(id, toBase64(data));
    },
    read: async (ms) => {
      const got = await lan.tcpRead(id, Math.ceil(ms));
      return got == null ? null : fromBase64(got);
    },
    close: () => {
      lan.tcpClose(id).catch(() => {});
    },
  };
}

// Um comando por vez para cada aparelho/hub (muitos aceitam só uma conexão local)
function serialize<T>(key: string, work: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(work);
  queues.set(key, next);
  next.finally(() => queues.get(key) === next && queues.delete(key)).catch(() => {});
  return next;
}

export type LocalResult =
  | { ok: true; ms: number; steps: Record<string, number> }
  | { ok: false; ms: number; reason: string };

// Conexão aberta por aparelho/hub, reaproveitada por alguns segundos: poupa a conexão e a troca de chaves
type Open = { session: TuyaSession; io: Transport & { close(): void }; ip: string; idle?: ReturnType<typeof setTimeout> };
const conns = new Map<string, Open>();
const IDLE_MS = 20_000;

function drop(hostId: string) {
  const c = conns.get(hostId);
  if (!c) return;
  conns.delete(hostId);
  if (c.idle) clearTimeout(c.idle);
  c.io.close();
}

// Tenta pela rede local. ok=false: não deu (o app usa a nuvem e registra o motivo).
export async function sendLocal(deviceId: string, commands: Command[]): Promise<LocalResult | null> {
  if (!lanAvailable) return null;
  await loadConfig();
  const p = plan(deviceId, commands);
  if (typeof p === 'string') return { ok: false, ms: 0, reason: p };
  const started = Date.now();
  const steps: Record<string, number> = {};
  let step = 'conexão';
  const mark = (name: string, since: number) => (steps[name] = Date.now() - since);
  try {
    await serialize(p.hostId, async () => {
      const deadline = Date.now() + COMMAND_MS;
      const fresh = async () => {
        drop(p.hostId);
        let t = Date.now();
        step = 'conexão';
        const io = await open(p.host.ip);
        mark('conexao', t);
        const session = new TuyaSession(io, p.key, p.host.version, p.hostId);
        t = Date.now();
        step = 'troca de chaves';
        await session.negotiate(deadline);
        mark('chaves', t);
        const c: Open = { session, io, ip: p.host.ip };
        conns.set(p.hostId, c);
        return c;
      };
      let c = conns.get(p.hostId);
      const reused = Boolean(c && c.ip === p.host.ip);
      if (!c || !reused) c = await fresh();
      if (c.idle) clearTimeout(c.idle);
      step = 'comando';
      let t = Date.now();
      try {
        await c.session.control(p.dps, reused ? Math.min(deadline, Date.now() + 1500) : deadline, p.cid);
      } catch (err) {
        // a conexão guardada pode ter caído (o aparelho fecha as ociosas): tenta uma vez com uma nova
        if (!reused) throw err;
        c = await fresh();
        step = 'comando';
        t = Date.now();
        await c.session.control(p.dps, deadline, p.cid);
      }
      mark('comando', t);
      steps.reuso = reused ? 1 : 0;
      const kept = c;
      kept.idle = setTimeout(() => conns.get(p.hostId) === kept && drop(p.hostId), IDLE_MS);
    });
    return { ok: true, ms: Date.now() - started, steps };
  } catch (err) {
    drop(p.hostId);
    // até a próxima varredura, esse aparelho vai pela nuvem; as chaves podem ter mudado (repareamento)
    seen.delete(p.hostId);
    if (Date.now() - lastResync > 10 * 60_000) {
      lastResync = Date.now();
      syncLanConfig(true);
    }
    const why = err instanceof Error ? err.message : String(err);
    return { ok: false, ms: Date.now() - started, reason: `${step} (${p.host.version}): ${why}` };
  }
}
