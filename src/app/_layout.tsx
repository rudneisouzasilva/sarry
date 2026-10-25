import '../global.css';
import { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '@/components/Toast';
import { LockScreen } from '@/features/auth/LockScreen';
import { SessionProvider, useSession } from '@/features/auth/SessionProvider';
import { DevicesProvider } from '@/features/devices/DevicesProvider';
import { ConfigMissing } from '@/features/auth/ConfigMissing';
import { configureNotifications, registerPush } from '@/lib/push';
import { isConfigured } from '@/lib/supabase';
import { colors } from '@/theme/colors';

SplashScreen.preventAutoHideAsync().catch(() => {});
configureNotifications();

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.style.backgroundColor = colors.bg;
  document.body.style.backgroundColor = colors.bg;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {Platform.OS === 'android' ? <NavigationBar hidden style="light" /> : null}
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {isConfigured ? (
          <SessionProvider>
            <ToastProvider>
              <DevicesProvider>
                <RootStack />
              </DevicesProvider>
            </ToastProvider>
          </SessionProvider>
        ) : (
          <ConfigMissing />
        )}
      </View>
    </SafeAreaProvider>
  );
}

function RootStack() {
  const { session, loading, locked } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  // Registra o push em silêncio se a permissão já foi dada; abre a tela certa ao tocar no alerta
  useEffect(() => {
    if (!session || Platform.OS === 'web') return;
    registerPush(false).catch(() => {});
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const url = res.notification.request.content.data?.url;
      if (typeof url === 'string') router.push(url as never);
    });
    return () => sub.remove();
  }, [session, router]);

  if (loading) return null;
  if (session && locked) return <LockScreen />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }}>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="ar/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="dispositivo/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="diagnostico" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="painel" />
        <Stack.Screen name="atalho/[acao]" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}
