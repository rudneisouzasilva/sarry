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
type Probe = { ip: string; version: Version };

const CONFIG_KEY = 'sarry.lan.config';
const CONFIG_MAX_AGE = 12 * 3600_000;
const SEEN_KEY = 'sarry.lan.seen';
const SEEN_MAX_AGE = 7 * 24 * 3600_000; // endereços na rede costumam durar (DHCP)
const HOME_FRESH_MS = 5 * 60_000; // só tenta local se houve sinal da rede de casa há pouco
const SCAN_EVERY_MS = 60_000;
const SCAN_MS = 8_000;
const SWEEP_EVERY_MS = 10 * 60_000;
const CONNECT_MS = 700;
const COMMAND_MS = 3_000;

let config: { at: number; devices: LanDevice[] } | null = null;
let syncing: Promise<void> | null = null;
let lastResync = 0;
let lastScan = 'sem varredura';
let lastSweep = 0;
let sweepInfo = '';
let homeAt = 0; // último sinal de que o celular está na rede de casa
let seenLoaded = false;
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
  await secureStorage.removeItem(SEEN_KEY).catch(() => {});
}

async function loadSeen() {
  if (seenLoaded) return;
  seenLoaded = true;
  try {
    const raw = await secureStorage.getItem(SEEN_KEY);
    const saved = raw ? (JSON.parse(raw) as Record<string, Seen>) : {};
    for (const [id, s] of Object.entries(saved)) {
      if (!seen.has(id) && Date.now() - s.at < SEEN_MAX_AGE) seen.set(id, s);
    }
  } catch {
    // sem endereços guardados: a varredura encontra de novo
  }
}

function saveSeen() {
  secureStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(seen))).catch(() => {});
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
    homeAt = now;
  }
  if (found.length) saveSeen();
  lastScan = `pacotes ${packets.length}, ilegíveis ${unreadable}, vistos ${[...new Set(found)].join(' ') || 'nenhum'}`;
}

// Abre e fecha uma conexão: diz se há um aparelho Tuya respondendo nesse endereço
async function reachable(ip: string, timeoutMs: number) {
  try {
    const id = await SarryLan!.tcpOpen(ip, 6668, timeoutMs);
    SarryLan!.tcpClose(id).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

// Descobre qual aparelho está num endereço, testando as chaves locais (só o dono certo é aceito)
async function identify(ip: string, candidates: LanDevice[]): Promise<{ device: LanDevice; version: Version } | null> {
  for (const device of candidates) {
    for (const version of ['3.5', '3.4', '3.3', '3.1'] as Version[]) {
      let io: (Transport & { close(): void }) | null = null;
      try {
        io = await open(ip);
        const session = new TuyaSession(io, utf8(device.localKey), version, device.id);
        if (await session.probe(Date.now() + 800)) return { device, version };
      } catch {
        // chave ou versão erradas: tenta a próxima
      } finally {
        io?.close();
      }
    }
  }
  return null;
}

// Aparelhos Wi-Fi que não se anunciam: procura na rede de casa (a mesma faixa do hub) quem
// responde na porta 6668 e identifica cada um pela chave local. Resultado guardado.
export async function sweepLan() {
  if (!SarryLan || !config) return;
  const missing = config.devices.filter((d) => !d.nodeId && d.localKey && !seen.has(d.id));
  const base = [...seen.values()].map((s) => s.ip).find((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip));
  if (!missing.length || !base) return;
  lastSweep = Date.now();
  const prefix = base.split('.').slice(0, 3).join('.');
  const known = new Set([...seen.values()].map((s) => s.ip));
  const targets = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`).filter((ip) => !known.has(ip));
  const open6668: string[] = [];
  for (let i = 0; i < targets.length; i += 32) {
    const batch = targets.slice(i, i + 32);
    const ok = await Promise.all(batch.map((ip) => reachable(ip, 400)));
    batch.forEach((ip, j) => ok[j] && open6668.push(ip));
  }
  let left = missing;
  const found: string[] = [];
  await Promise.all(
    open6668.map(async (ip) => {
      const hit = await identify(ip, left);
      if (!hit) return;
      left = left.filter((d) => d !== hit.device);
      seen.set(hit.device.id, { ip, version: hit.version, at: Date.now() });
      found.push(`${hit.device.id.slice(-5)}:${hit.version}`);
      homeAt = Date.now();
    }),
  );
  sweepInfo = `; busca: ${open6668.length} na porta 6668, achados ${found.join(' ') || 'nenhum'}`;
  if (found.length) saveSeen();
}

// Repete a varredura enquanto o app estiver aberto; devolve a função que para
export function watchLan(): () => void {
  if (!lanAvailable) return () => {};
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const loop = async () => {
    await scanLan();
    if (!stopped && Date.now() - lastSweep > SWEEP_EVERY_MS) await sweepLan().catch(() => {});
    if (!stopped) timer = setTimeout(loop, SCAN_EVERY_MS);
  };
  (async () => {
    await Promise.all([syncLanConfig(), loadSeen()]);
    // um endereço guardado respondendo já mostra que estamos em casa, sem esperar a varredura
    const first = [...seen.values()][0];
    if (first && (await reachable(first.ip, 400))) homeAt = Date.now();
  })().finally(loop);
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
  if (!host) return `não encontrado na rede (${lastScan}${sweepInfo})`;
  if (Date.now() - homeAt > HOME_FRESH_MS) return 'sem sinal da rede de casa';
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
  await Promise.all([loadConfig(), loadSeen()]);
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
    homeAt = Date.now();
    return { ok: true, ms: Date.now() - started, steps };
  } catch (err) {
    drop(p.hostId);
    // até a próxima varredura, esse aparelho vai pela nuvem; as chaves podem ter mudado (repareamento)
    seen.delete(p.hostId);
    saveSeen();
    lastSweep = 0; // o endereço pode ter mudado: procura de novo na próxima volta
    if (Date.now() - lastResync > 10 * 60_000) {
      lastResync = Date.now();
      syncLanConfig(true);
    }
    const why = err instanceof Error ? err.message : String(err);
    return { ok: false, ms: Date.now() - started, reason: `${step} (${p.host.version}): ${why}` };
  }
}
