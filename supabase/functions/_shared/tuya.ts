// Cliente da Tuya Cloud OpenAPI: assinatura HMAC-SHA256, token com renovação automática e cache curto.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export class TuyaError extends Error {
  constructor(
    message: string,
    public code?: number | string,
  ) {
    super(message);
  }
}

type TuyaResponse<T> = { success: boolean; result: T; code?: number; msg?: string; t?: number };

type TokenRow = { access_token: string; refresh_token: string; expires_at: string };

const encoder = new TextEncoder();

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new TuyaError(`Segredo ${name} não configurado no Supabase`);
  return value;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return toHex(digest);
}

async function hmacUpperHex(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(text));
  return toHex(sig).toUpperCase();
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// A Tuya exige a query ordenada por chave na string assinada
function canonicalPath(path: string, query?: Record<string, string | number | undefined>): string {
  const entries = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return path;
  return `${path}?${entries.map(([k, v]) => `${k}=${v}`).join('&')}`;
}

// Códigos da Tuya que indicam token inválido/expirado
const TOKEN_ERRORS = new Set([1010, 1011, 1012]);

// Token guardado na memória da instância (sobrevive entre chamadas enquanto ela estiver quente)
let sharedToken: TokenRow | null = null;

export class TuyaClient {
  private accessId = env('TUYA_ACCESS_ID');
  private accessSecret = env('TUYA_ACCESS_SECRET');
  private baseUrl = (Deno.env.get('TUYA_BASE_URL') || 'https://openapi.tuyaus.com').replace(/\/$/, '');
  readonly uid = env('TUYA_UID');

  constructor(private db: SupabaseClient) {}

  private async sign(method: string, url: string, body: string, accessToken = '') {
    const t = Date.now().toString();
    const nonce = crypto.randomUUID();
    const stringToSign = [method, await sha256Hex(body), '', url].join('\n');
    const sign = await hmacUpperHex(this.accessSecret, this.accessId + accessToken + t + nonce + stringToSign);
    return {
      client_id: this.accessId,
      sign,
      t,
      nonce,
      sign_method: 'HMAC-SHA256',
      ...(accessToken ? { access_token: accessToken } : {}),
    };
  }

  private async rawRequest<T>(method: string, url: string, body: unknown, accessToken: string): Promise<TuyaResponse<T>> {
    const bodyText = body === undefined ? '' : JSON.stringify(body);
    const headers = await this.sign(method, url, bodyText, accessToken);
    const res = await fetch(this.baseUrl + url, {
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: bodyText || undefined,
    });
    if (!res.ok) throw new TuyaError(`Tuya respondeu HTTP ${res.status}`, res.status);
    return (await res.json()) as TuyaResponse<T>;
  }

  private async saveToken(result: { access_token: string; refresh_token: string; expire_time: number }) {
    const row: TokenRow = {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_at: new Date(Date.now() + result.expire_time * 1000).toISOString(),
    };
    sharedToken = row;
    await this.db.from('tuya_token').upsert({ id: 1, ...row, updated_at: new Date().toISOString() });
    return row;
  }

  private async fetchNewToken(): Promise<TokenRow> {
    const res = await this.rawRequest<{ access_token: string; refresh_token: string; expire_time: number }>(
      'GET',
      '/v1.0/token?grant_type=1',
      undefined,
      '',
    );
    if (!res.success) throw new TuyaError(`Falha ao obter token da Tuya: ${res.msg}`, res.code);
    return this.saveToken(res.result);
  }

  private async refreshToken(refresh: string): Promise<TokenRow> {
    const res = await this.rawRequest<{ access_token: string; refresh_token: string; expire_time: number }>(
      'GET',
      `/v1.0/token/${refresh}`,
      undefined,
      '',
    );
    if (!res.success) return this.fetchNewToken();
    return this.saveToken(res.result);
  }

  private async getAccessToken(force = false): Promise<string> {
    if (force) return (await this.fetchNewToken()).access_token;
    if (!sharedToken) {
      const { data } = await this.db.from('tuya_token').select('access_token, refresh_token, expires_at').eq('id', 1).maybeSingle();
      sharedToken = data as TokenRow | null;
    }
    if (!sharedToken) return (await this.fetchNewToken()).access_token;
    // renova 5 minutos antes de expirar
    if (new Date(sharedToken.expires_at).getTime() - Date.now() < 5 * 60_000) {
      return (await this.refreshToken(sharedToken.refresh_token)).access_token;
    }
    return sharedToken.access_token;
  }

  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<T> {
    const url = canonicalPath(path, opts.query);
    let res = await this.rawRequest<T>(method, url, opts.body, await this.getAccessToken());
    if (!res.success && TOKEN_ERRORS.has(Number(res.code))) {
      res = await this.rawRequest<T>(method, url, opts.body, await this.getAccessToken(true));
    }
    if (!res.success) throw new TuyaError(res.msg || 'Erro desconhecido da Tuya', res.code);
    return res.result;
  }

  // Cache simples no Postgres para poupar a cota do plano trial
  async cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>, force = false): Promise<T> {
    if (!force) {
      const { data } = await this.db.from('tuya_cache').select('value, expires_at').eq('key', key).maybeSingle();
      if (data && new Date(data.expires_at).getTime() > Date.now()) return data.value as T;
    }
    const value = await loader();
    await this.db.from('tuya_cache').upsert({
      key,
      value: value as unknown as Record<string, unknown>,
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    });
    return value;
  }

  async invalidate(prefix: string) {
    await this.db.from('tuya_cache').delete().like('key', `${prefix}%`);
  }
}
