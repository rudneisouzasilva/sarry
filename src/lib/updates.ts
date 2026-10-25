import * as Updates from 'expo-updates';
import { AppState, Platform } from 'react-native';

const RESUME_CHECK_GAP_MS = 15 * 60_000;
let lastCheck = 0;

// Baixa e aplica na hora uma atualização publicada pelo EAS Update (só no app instalado)
async function applyUpdate() {
  if (__DEV__ || Platform.OS === 'web' || !Updates.isEnabled) return;
  lastCheck = Date.now();
  try {
    const { isAvailable } = await Updates.checkForUpdateAsync();
    if (!isAvailable) return;
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
  } catch {
    // sem internet ou servidor fora: segue com a versão atual
  }
}

// Confere ao abrir o app e ao voltar para ele (no máximo a cada 15 min)
export function watchUpdates() {
  applyUpdate();
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active' && Date.now() - lastCheck > RESUME_CHECK_GAP_MS) applyUpdate();
  });
  return () => sub.remove();
}
