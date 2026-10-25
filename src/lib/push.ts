// Registro de notificações push (Expo Push). No Expo Go do Android o push remoto não funciona:
// use o APK gerado pelo EAS.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export function configureNotifications() {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('alertas', {
      name: 'Alertas da casa',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#F2B544',
    }).catch(() => {});
  }
}

export type PushResult = { ok: true } | { ok: false; reason: string };

export async function registerPush(ask: boolean): Promise<PushResult> {
  if (Platform.OS === 'web') return { ok: false, reason: 'Notificações push estão disponíveis no app instalado.' };
  if (!Device.isDevice) return { ok: false, reason: 'Use um celular de verdade para receber notificações.' };

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return { ok: false, reason: 'Permissão de notificações negada nas configurações do celular.' };

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return { ok: false, reason: 'Projeto EAS não configurado (rode eas init).' };

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { ok: false, reason: 'Faça login novamente.' };
    const { error } = await supabase
      .from('push_tokens')
      .upsert({ token, user_id: auth.user.id, platform: Platform.OS }, { onConflict: 'token' });
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason:
        Constants.appOwnership === 'expo'
          ? 'O Expo Go não recebe push. Instale o APK do Sarry para ativar.'
          : err instanceof Error
            ? err.message
            : 'Falha ao registrar notificações',
    };
  }
}
