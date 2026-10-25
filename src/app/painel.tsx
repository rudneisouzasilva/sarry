// Modo painel de parede: tela cheia, tela sempre ligada, controles grandes
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Maximize, X } from 'lucide-react-native';
import { AcCard } from '@/components/AcCard';
import { IconButton } from '@/components/Button';
import { Grid } from '@/components/Grid';
import { LightTile } from '@/components/LightTile';
import { QuickScenes } from '@/components/QuickScenes';
import { Txt } from '@/components/Txt';
import { lightsOf, useDevices } from '@/features/devices/DevicesProvider';
import { clock, longDate } from '@/lib/format';
import { colors } from '@/theme/colors';

// No painel a tela fica ligada o tempo todo: atualiza o status a cada 2 minutos (cota da Tuya)
const PANEL_REFRESH_MS = 2 * 60_000;

export default function Painel() {
  useKeepAwake();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { devices, command, refresh } = useDevices();
  const [now, setNow] = useState(new Date());
  const lights = lightsOf(devices);
  const acs = devices.filter((d) => d.kind === 'ac' && !d.hidden);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    const r = setInterval(() => refresh(true, true), PANEL_REFRESH_MS);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [refresh]);

  const fullscreen = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    }
  };

  const exit = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined' && document.fullscreenElement) document.exitFullscreen?.();
    router.canGoBack() ? router.back() : router.replace('/');
  };

  return (
    <View className="flex-1 bg-bg">
      <StatusBar hidden />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}>
        <View className="w-full max-w-[1200px] self-center px-6">
          <View className="mb-6 flex-row items-start justify-between">
            <View>
              <Txt variant="display" className="text-7xl leading-[84px]" accessibilityRole="header">
                {clock(now)}
              </Txt>
              <Txt variant="heading" className="text-muted">
                {longDate(now)}
              </Txt>
            </View>
            <View className="flex-row gap-2">
              {Platform.OS === 'web' ? <IconButton icon={Maximize} label="Tela cheia" onPress={fullscreen} color={colors.muted} /> : null}
              <IconButton icon={X} label="Sair do modo painel" onPress={exit} color={colors.muted} />
            </View>
          </View>

          <QuickScenes source="painel" large />

          {acs.length ? (
            <View className="mt-5 gap-3">
              {acs.map((d) => (
                <AcCard key={d.id} device={d} source="painel" large />
              ))}
            </View>
          ) : null}

          <View className="mt-5">
            <Grid min={2}>
              {lights.map((l) => (
                <LightTile
                  key={`${l.device.id}:${l.code}`}
                  name={l.name}
                  room={l.room}
                  isOn={l.isOn}
                  online={l.device.online}
                  large
                  onToggle={() => command(l.device, [{ code: l.code, value: !l.isOn }], { source: 'painel', label: l.name })}
                />
              ))}
            </Grid>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
