import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { getPref, setPref } from './storage';

const KEY = 'sarry.biometria';

export async function biometricsAvailable() {
  if (Platform.OS === 'web') return false;
  const [hardware, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hardware && enrolled;
}

export async function biometricsEnabled() {
  if (Platform.OS === 'web') return false;
  return (await getPref(KEY)) === '1';
}

export async function setBiometricsEnabled(on: boolean) {
  await setPref(KEY, on ? '1' : null);
}

export async function authenticate() {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Desbloquear o Sarry',
    cancelLabel: 'Cancelar',
    fallbackLabel: 'Usar senha do aparelho',
  });
  return result.success;
}
