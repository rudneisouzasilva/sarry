// Protocolo local da Tuya (versões 3.3, 3.4 e 3.5), o mesmo que o Smart Life usa no Wi-Fi de casa.
// Referência: o projeto aberto tinytuya. Mensagens 0x55AA (3.3/3.4) e 0x6699 (3.5).
import { ecb, gcm } from '@noble/ciphers/aes.js';
import { hmac } from '@noble/hashes/hmac.js';
import { md5 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concat, crc32, equal, fromUtf8, putU32, u32, utf8, type Bytes } from './bytes';

export type Version = '3.3' | '3.4' | '3.5';
export const VERSIONS: Version[] = ['3.3', '3.4', '3.5'];

export const CMD = {
  NEG_START: 3,
  NEG_RESP: 4,
  NEG_FINISH: 5,
  CONTROL: 7,
  STATUS: 8,
  HEART_BEAT: 9,
  DP_QUERY: 10,
  CONTROL_NEW: 13,
  DP_QUERY_NEW: 16,
  UPDATEDPS: 18,
} as const;

// comandos que não levam o cabeçalho de versão ("3.x" + 12 zeros)
const NO_HEADER = new Set<number>([
  CMD.DP_QUERY,
  CMD.DP_QUERY_NEW,
  CMD.UPDATEDPS,
  CMD.HEART_BEAT,
  CMD.NEG_START,
  CMD.NEG_RESP,
  CMD.NEG_FINISH,
]);

const PREFIX_55AA = 0x000055aa;
const SUFFIX_55AA = 0x0000aa55;
const PREFIX_6699 = 0x00006699;
const SUFFIX_6699 = 0x00009966;

export type Frame = { seq: number; cmd: number; retcode: number | null; payload: Bytes };

export class LanError extends Error {
  constructor(
    message: string,
    readonly kind: 'timeout' | 'key' | 'refused' | 'protocol' = 'protocol',
  ) {
    super(message);
  }
}

const versionHeader = (v: Version) => concat(utf8(v), new Uint8Array(12));

function hasVersionHeader(p: Uint8Array) {
  return p.length >= 15 && p[0] === 0x33 && p[1] === 0x2e && p[2] >= 0x31 && p[2] <= 0x35;
}

const hmacSha256 = (key: Uint8Array, data: Uint8Array): Bytes => hmac(sha256, key, data) as Bytes;

export function pack55(seq: number, cmd: number, payload: Uint8Array, hmacKey?: Uint8Array): Bytes {
  const endLen = hmacKey ? 36 : 8;
  const header = new Uint8Array(16);
  putU32(header, 0, PREFIX_55AA);
  putU32(header, 4, seq);
  putU32(header, 8, cmd);
  putU32(header, 12, payload.length + endLen);
  const body = concat(header, payload);
  const suffix = new Uint8Array(4);
  putU32(suffix, 0, SUFFIX_55AA);
  if (hmacKey) return concat(body, hmacSha256(hmacKey, body), suffix);
  const crc = new Uint8Array(4);
  putU32(crc, 0, crc32(body));
  return concat(body, crc, suffix);
}

export function pack66(seq: number, cmd: number, payload: Uint8Array, key: Uint8Array, iv?: Uint8Array): Bytes {
  const header = new Uint8Array(18);
  putU32(header, 0, PREFIX_6699);
  // bytes 4-5: reservados (zero)
  putU32(header, 6, seq);
  putU32(header, 10, cmd);
  putU32(header, 14, payload.length + 12 + 16);
  const nonce = iv ?? randomBytes(12);
  const sealed = gcm(key, nonce, header.subarray(4)).encrypt(payload);
  const suffix = new Uint8Array(4);
  putU32(suffix, 0, SUFFIX_6699);
  return concat(header, nonce, sealed, suffix);
}

// As respostas do aparelho começam com um código de retorno (4 bytes). Nos anúncios 3.5 ele
// é opcional: só existe quando o JSON começa logo depois dele.
type Retcode = 'yes' | 'auto';
function splitRetcode(body: Bytes, mode: Retcode): { retcode: number | null; payload: Bytes } {
  const has = mode === 'yes' ? body.length >= 4 : body[0] !== 0x7b && body[4] === 0x7b;
  return has ? { retcode: u32(body, 0), payload: body.slice(4) } : { retcode: null, payload: body };
}

// Lê uma mensagem do começo do buffer. null = ainda incompleta.
// Mensagens 0x6699 são abertas com `key`; as 0x55AA saem com o conteúdo ainda cifrado.
export function unpack(buf: Bytes, key?: Uint8Array, retcode66: Retcode = 'yes'): { frame: Frame; used: number } | null {
  let start = 0;
  while (start + 4 <= buf.length) {
    const prefix = u32(buf, start);
    if (prefix === PREFIX_55AA || prefix === PREFIX_6699) break;
    start++;
  }
  const data = buf.subarray(start);
  if (data.length < 4) return null;
  const prefix = u32(data, 0);

  if (prefix === PREFIX_55AA) {
    if (data.length < 16) return null;
    const len = u32(data, 12);
    const total = 16 + len;
    if (data.length < total) return null;
    // fim: CRC (4) + sufixo (4), ou HMAC (32) + sufixo (4)
    const endLen = len >= 36 && looksLikeHmacFrame(data, total) ? 36 : 8;
    const body = data.slice(16, total - endLen);
    const { retcode, payload } = splitRetcode(body, 'yes');
    return { frame: { seq: u32(data, 4), cmd: u32(data, 8), retcode, payload }, used: start + total };
  }

  if (data.length < 18) return null;
  const len = u32(data, 14);
  const total = 18 + len + 4;
  if (data.length < total) return null;
  if (!key) throw new LanError('Mensagem 3.5 sem chave');
  const iv = data.subarray(18, 30);
  const sealed = data.subarray(30, 18 + len);
  let plain: Bytes;
  try {
    plain = gcm(key, iv, data.subarray(4, 18)).decrypt(sealed) as Bytes;
  } catch {
    throw new LanError('Chave local recusada pelo aparelho', 'key');
  }
  const { retcode, payload } = splitRetcode(plain, retcode66);
  return { frame: { seq: u32(data, 6), cmd: u32(data, 10), retcode, payload }, used: start + total };
}

// Quando o CRC32 confere, a mensagem termina em CRC; senão, em HMAC
function looksLikeHmacFrame(data: Bytes, total: number) {
  const crc = u32(data, total - 8);
  return crc32(data.subarray(0, total - 8)) !== crc;
}

export function randomBytes(n: number): Bytes {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

function parseJson(p: Uint8Array): Record<string, unknown> | null {
  const text = fromUtf8(p);
  const at = text.indexOf('{');
  if (at < 0) return null;
  try {
    return JSON.parse(text.slice(at, text.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
}

// ---------- descoberta (anúncios UDP nas portas 6666, 6667 e 7000) ----------

const UDP_KEY = md5(utf8('yGAdlopoPVldABfn'));

export type Announcement = { id: string; ip: string; version: string };

export function decodeAnnouncement(packet: Bytes): Announcement | null {
  let json: Record<string, unknown> | null = null;
  try {
    const parsed = unpack(packet, UDP_KEY, 'auto');
    if (parsed) {
      const p = parsed.frame.payload;
      const plain = p[0] === 0x7b || u32(packet, 0) === PREFIX_6699;
      json = parseJson(plain ? p : ecb(UDP_KEY).decrypt(p));
    } else {
      json = parseJson(ecb(UDP_KEY).decrypt(packet));
    }
  } catch {
    return null;
  }
  if (!json || typeof json.gwId !== 'string' || typeof json.ip !== 'string') return null;
  return { id: json.gwId, ip: json.ip, version: String(json.version ?? '3.3') };
}

// ---------- sessão com um aparelho ----------

export type Transport = {
  write(data: Bytes): Promise<void>;
  // bytes recebidos até o tempo limite; null se nada chegou
  read(timeoutMs: number): Promise<Bytes | null>;
};

export type Dps = Record<string, boolean | number | string>;

export class TuyaSession {
  private seq = 1;
  private key: Bytes;
  private buf: Bytes = new Uint8Array(0);

  constructor(
    private io: Transport,
    private realKey: Bytes,
    readonly version: Version,
    private devId: string,
    private localNonce: Bytes = randomBytes(16),
  ) {
    this.key = realKey;
  }

  encode(cmd: number, payload: Uint8Array): Bytes {
    const seq = this.seq++;
    if (this.version === '3.3') {
      let p: Uint8Array = ecb(this.key).encrypt(payload);
      if (!NO_HEADER.has(cmd)) p = concat(versionHeader('3.3'), p);
      return pack55(seq, cmd, p);
    }
    const p = NO_HEADER.has(cmd) ? payload : concat(versionHeader(this.version), payload);
    if (this.version === '3.4') return pack55(seq, cmd, ecb(this.key).encrypt(p), this.key);
    return pack66(seq, cmd, p, this.key);
  }

  // Conteúdo de uma mensagem recebida, já decifrado e sem o cabeçalho de versão
  open(frame: Frame): Bytes {
    let p = frame.payload;
    if (this.version === '3.3') {
      if (hasVersionHeader(p)) p = p.slice(15);
      if (!p.length || p[0] === 0x7b) return p;
      return ecb(this.key).decrypt(p) as Bytes;
    }
    if (this.version === '3.4') {
      if (!p.length) return p;
      try {
        p = ecb(this.key).decrypt(p) as Bytes;
      } catch {
        throw new LanError('Chave local recusada pelo aparelho', 'key');
      }
    }
    return hasVersionHeader(p) ? p.slice(15) : p;
  }

  async readFrame(deadline: number): Promise<Frame> {
    for (;;) {
      const parsed = unpack(this.buf, this.key);
      if (parsed) {
        this.buf = this.buf.slice(parsed.used);
        return parsed.frame;
      }
      const left = deadline - Date.now();
      if (left <= 0) throw new LanError('O aparelho não respondeu', 'timeout');
      const chunk = await this.io.read(left);
      if (chunk) this.buf = concat(this.buf, chunk);
    }
  }

  // Combina a chave da sessão (3.4 e 3.5)
  async negotiate(deadline: number) {
    if (this.version === '3.3') return;
    await this.io.write(this.encode(CMD.NEG_START, this.localNonce));
    let frame: Frame;
    do frame = await this.readFrame(deadline);
    while (frame.cmd !== CMD.NEG_RESP);
    let p = frame.payload;
    if (this.version === '3.4') {
      try {
        p = ecb(this.realKey).decrypt(p) as Bytes;
      } catch {
        throw new LanError('Chave local recusada pelo aparelho', 'key');
      }
    }
    if (p.length < 48) throw new LanError('Resposta inválida na troca de chaves');
    const remoteNonce = p.slice(0, 16);
    if (!equal(p.slice(16, 48), hmacSha256(this.realKey, this.localNonce))) {
      throw new LanError('Chave local recusada pelo aparelho', 'key');
    }
    await this.io.write(this.encode(CMD.NEG_FINISH, hmacSha256(this.realKey, remoteNonce)));
    const mixed = this.localNonce.map((b, i) => b ^ remoteNonce[i]);
    this.key =
      this.version === '3.4'
        ? (ecb(this.realKey, { disablePadding: true }).encrypt(mixed) as Bytes)
        : (gcm(this.realKey, this.localNonce.slice(0, 12)).encrypt(mixed).slice(0, 16) as Bytes);
  }

  controlPayload(dps: Dps, cid?: string) {
    const t = Math.floor(Date.now() / 1000);
    // mesmos formatos do tinytuya (payload_dict: default, zigbee, v3.4/v3.5, zigbee_v3.4/v3.5)
    if (this.version === '3.3') {
      const body = cid ? { t, cid, dps } : { devId: this.devId, uid: this.devId, t: String(t), dps };
      return { cmd: CMD.CONTROL, body };
    }
    const body = cid
      ? { protocol: 5, t, data: { cid, ctype: 0, dps }, cid }
      : { protocol: 5, t, data: { dps } };
    return { cmd: CMD.CONTROL_NEW, body };
  }

  // Envia e espera o aparelho confirmar o novo estado (mensagem STATUS com os mesmos DPs)
  async control(dps: Dps, deadline: number, cid?: string) {
    const { cmd, body } = this.controlPayload(dps, cid);
    await this.io.write(this.encode(cmd, utf8(JSON.stringify(body))));
    const wanted = Object.keys(dps);
    for (;;) {
      const frame = await this.readFrame(deadline);
      if ((frame.cmd === CMD.CONTROL || frame.cmd === CMD.CONTROL_NEW) && frame.retcode) {
        throw new LanError(`O aparelho recusou o comando (${frame.retcode})`, 'refused');
      }
      if (![CMD.STATUS, CMD.CONTROL, CMD.CONTROL_NEW].includes(frame.cmd as 8)) continue;
      const json = parseJson(this.open(frame));
      if (!json) continue;
      const inner = (json.data ?? {}) as Record<string, unknown>;
      const got = (json.dps ?? inner.dps) as Record<string, unknown> | undefined;
      const fromCid = (json.cid ?? inner.cid) as string | undefined;
      if (!got || (cid && fromCid && fromCid !== cid)) continue;
      // o valor precisa bater: um STATUS atrasado de um comando anterior não confirma este
      if (wanted.some((k) => got[k] === dps[k])) return;
    }
  }
}
