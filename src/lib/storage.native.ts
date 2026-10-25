// Sessão do Supabase guardada no expo-secure-store (Keychain/Keystore).
// O SecureStore limita cada valor a ~2 KB, então a sessão é dividida em pedaços.
import * as SecureStore from 'expo-secure-store';

const CHUNK = 1800;

function safeKey(key: string) {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const k = safeKey(key);
    const count = await SecureStore.getItemAsync(`${k}.n`);
    if (!count) return SecureStore.getItemAsync(k);
    const parts = await Promise.all(
      Array.from({ length: Number(count) }, (_, i) => SecureStore.getItemAsync(`${k}.${i}`)),
    );
    return parts.some((p) => p === null) ? null : parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const k = safeKey(key);
    await this.removeItem(key);
    const parts = value.match(new RegExp(`.{1,${CHUNK}}`, 'gs')) ?? [''];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${k}.${i}`, p)));
    await SecureStore.setItemAsync(`${k}.n`, String(parts.length));
  },
  async removeItem(key: string): Promise<void> {
    const k = safeKey(key);
    const count = Number((await SecureStore.getItemAsync(`${k}.n`)) ?? 0);
    await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${k}.${i}`)));
    await SecureStore.deleteItemAsync(`${k}.n`);
    await SecureStore.deleteItemAsync(k);
  },
};

export async function getPref(key: string) {
  return SecureStore.getItemAsync(safeKey(key));
}

export async function setPref(key: string, value: string | null) {
  if (value === null) await SecureStore.deleteItemAsync(safeKey(key));
  else await SecureStore.setItemAsync(safeKey(key), value);
}
