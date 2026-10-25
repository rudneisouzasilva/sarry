// Na web a sessão fica no localStorage do navegador.
function ls(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const secureStorage = {
  async getItem(key: string) {
    return ls()?.getItem(key) ?? null;
  },
  async setItem(key: string, value: string) {
    ls()?.setItem(key, value);
  },
  async removeItem(key: string) {
    ls()?.removeItem(key);
  },
};

export async function getPref(key: string) {
  return ls()?.getItem(key) ?? null;
}

export async function setPref(key: string, value: string | null) {
  if (value === null) ls()?.removeItem(key);
  else ls()?.setItem(key, value);
}
