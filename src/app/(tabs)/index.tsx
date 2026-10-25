import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Stethoscope } from 'lucide-react-native';
import { AcCard } from '@/components/AcCard';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Grid } from '@/components/Grid';
import { SectionTitle } from '@/components/Header';
import { LightTile } from '@/components/LightTile';
import { QuickScenes } from '@/components/QuickScenes';
import { Screen } from '@/components/Screen';
import { Empty, ErrorBanner, Loading } from '@/components/States';
import { Txt } from '@/components/Txt';
import { useAc } from '@/features/climate/useAc';
import { lightsOf, useDevices } from '@/features/devices/DevicesProvider';
import { useSettings } from '@/features/settings/useSettings';
import { decimal, greeting, longDate } from '@/lib/format';
import { colors } from '@/theme/colors';

export default function Inicio() {
  const router = useRouter();
  const { devices, loading, refreshing, error, refresh, command } = useDevices();
  const { settings } = useSettings();

  const hub = devices.find((d) => d.kind === 'hub');
  const acs = devices.filter((d) => d.kind === 'ac' && !d.hidden);
  const lights = lightsOf(devices);
  const lightsOn = lights.filter((l) => l.isOn).length;
  const online = devices.filter((d) => d.online).length;
  const ac = acs[0];
  const { current: acTemp } = useAc(ac);

  return (
    <Screen refreshing={refreshing} onRefresh={() => refresh(true)}>
      <View className="mb-5 flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Txt variant="caption">
            {longDate()}
          </Txt>
          <Txt variant="title" className="text-3xl" accessibilityRole="header">
            {greeting()}
          </Txt>
          {settings?.home_name ? <Txt variant="caption">{settings.home_name}</Txt> : null}
        </View>
        {hub ? (
          <View
            accessible
            accessibilityLabel={`Hub ${hub.online ? 'online' : 'offline'}`}
            className="mt-1 flex-row items-center gap-2 rounded-full border border-line bg-card px-3 py-2"
          >
            <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hub.online ? colors.ok : colors.danger }} />
            <Txt variant="label">Hub {hub.online ? 'online' : 'offline'}</Txt>
          </View>
        ) : null}
      </View>

      {error ? <ErrorBanner message={error} onRetry={() => refresh(true)} /> : null}

      <View className="flex-row gap-3">
        <Card className="flex-1 p-3.5">
          <Txt variant="caption">Luzes</Txt>
          <Txt variant="number" style={{ color: lightsOn ? colors.amber : colors.ink }}>
            {lightsOn}
            <Txt variant="caption"> de {lights.length}</Txt>
          </Txt>
        </Card>
        <Card className="flex-1 p-3.5">
          <Txt variant="caption">Ar</Txt>
          <Txt variant="number" style={{ color: colors.sky }}>
            {acTemp === null ? '--' : `${decimal(acTemp, 0)}°`}
          </Txt>
        </Card>
        <Card className="flex-1 p-3.5">
          <Txt variant="caption">Online</Txt>
          <Txt variant="number">
            {online}
            <Txt variant="caption"> de {devices.length}</Txt>
          </Txt>
        </Card>
      </View>

      <SectionTitle>Cenas rápidas</SectionTitle>
      <QuickScenes />

      {loading ? <Loading /> : null}

      {acs.length ? <SectionTitle>Clima</SectionTitle> : null}
      <View className="gap-3">
        {acs.map((d) => (
          <AcCard key={d.id} device={d} />
        ))}
      </View>

      {!loading && lights.length ? <SectionTitle>Luzes</SectionTitle> : null}
      <Grid>
        {lights.map((l) => (
          <LightTile
            key={`${l.device.id}:${l.code}`}
            name={l.name}
            room={l.room}
            isOn={l.isOn}
            online={l.device.online}
            onToggle={() => command(l.device, [{ code: l.code, value: !l.isOn }], { label: l.name })}
          />
        ))}
      </Grid>

      {!loading && !error && devices.length === 0 ? (
        <View className="mt-6 gap-4">
          <Empty title="Nenhum dispositivo encontrado" text="Confira as credenciais da Tuya e rode o diagnóstico." />
          <Button title="Abrir diagnóstico" icon={Stethoscope} variant="secondary" onPress={() => router.push('/diagnostico')} />
        </View>
      ) : null}
    </Screen>
  );
}
