import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Activity, AlertCircle, CheckCircle2 } from 'lucide-react-native';
import { BarChart } from '@/components/BarChart';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { Empty, ErrorBanner, Loading } from '@/components/States';
import { Txt } from '@/components/Txt';
import { useDevices } from '@/features/devices/DevicesProvider';
import { useSettings } from '@/features/settings/useSettings';
import { useUsage } from '@/features/usage/useUsage';
import { decimal, duration, money, relative } from '@/lib/format';
import { colors } from '@/theme/colors';

export default function Uso() {
  const router = useRouter();
  const { devices } = useDevices();
  const { settings } = useSettings();
  const usage = useUsage(devices);
  const tariff = settings?.tariff_kwh ?? 0;
  const maxLight = Math.max(1, ...usage.lightsToday.map((l) => l.ms));
  const hasAc = devices.some((d) => d.kind === 'ac');

  return (
    <Screen refreshing={usage.refreshing} onRefresh={usage.reload}>
      <Txt variant="title" className="text-3xl" accessibilityRole="header">
        Uso
      </Txt>
      <Txt variant="caption">Histórico registrado pelo Sarry a cada 10 minutos e a cada comando.</Txt>
      {usage.error ? (
        <View className="mt-4">
          <ErrorBanner message={usage.error} onRetry={usage.reload} />
        </View>
      ) : null}
      {usage.loading ? <Loading /> : null}

      {!usage.loading && hasAc ? (
        <>
          <SectionTitle>Ar-condicionado na semana</SectionTitle>
          <Card>
            <View className="mb-3 flex-row items-end justify-between">
              <View>
                <Txt variant="caption">Total em 7 dias</Txt>
                <Txt variant="number" style={{ color: colors.sky }}>
                  {decimal(usage.weekHours)} h
                </Txt>
              </View>
              <View className="items-end">
                <Txt variant="caption">Hoje</Txt>
                <Txt variant="label">{decimal(usage.days[6]?.value ?? 0)} h</Txt>
              </View>
            </View>
            <BarChart data={usage.days} />
          </Card>

          <View className="mt-3 flex-row gap-3">
            <Card className="flex-1">
              <Txt variant="caption">Custo hoje</Txt>
              <Txt variant="number">{money(usage.acKwhToday * tariff)}</Txt>
              <Txt variant="caption">{decimal(usage.acKwhToday, 2)} kWh</Txt>
            </Card>
            <Card className="flex-1">
              <Txt variant="caption">Custo 7 dias</Txt>
              <Txt variant="number">{money(usage.acKwhWeek * tariff)}</Txt>
              <Txt variant="caption">≈ {money(((usage.acKwhWeek * tariff) / 7) * 30)}/mês</Txt>
            </Card>
          </View>
          {usage.missingPower ? (
            <Card className="mt-3 flex-row items-center gap-3">
              <AlertCircle size={20} color={colors.amber} />
              <Txt variant="caption" className="flex-1">
                Informe a potência do ar em Ajustes para calcular o custo.
              </Txt>
              <Button title="Ajustes" variant="ghost" onPress={() => router.push('/ajustes')} className="min-h-11 px-2" />
            </Card>
          ) : null}
          <Txt variant="caption" className="mt-2">
            Estimativa: horas ligado × potência × tarifa de {money(tariff)}/kWh.
          </Txt>
        </>
      ) : null}

      {!usage.loading && usage.lightsToday.length ? (
        <>
          <SectionTitle>Luzes hoje</SectionTitle>
          <Card className="gap-4">
            {usage.lightsToday.map((l) => (
              <View key={l.key} accessible accessibilityLabel={`${l.name}: ${duration(l.ms)} ligada hoje`}>
                <View className="mb-1.5 flex-row justify-between">
                  <Txt variant="label" numberOfLines={1} className="flex-1">
                    {l.name}
                  </Txt>
                  <Txt variant="caption">{duration(l.ms)}</Txt>
                </View>
                <View className="h-2.5 overflow-hidden rounded-full bg-card-alt">
                  <View
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(l.ms ? 3 : 0, (l.ms / maxLight) * 100)}%`, backgroundColor: l.isOn ? colors.amber : colors.muted }}
                  />
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {!usage.loading ? <SectionTitle>Atividade recente</SectionTitle> : null}
      {!usage.loading && !usage.feed.length ? <Empty title="Sem atividade ainda" text="O histórico aparece conforme você usa a casa." /> : null}
      {usage.feed.length ? (
        <Card className="py-1">
          {usage.feed.map((f, i) => {
            const Icon = !f.ok ? AlertCircle : f.kind === 'command' ? CheckCircle2 : Activity;
            return (
              <View key={f.id} className={`min-h-14 flex-row items-center gap-3 py-2 ${i ? 'border-t border-line' : ''}`}>
                <Icon size={18} color={!f.ok ? colors.danger : f.kind === 'command' ? colors.amber : colors.muted} />
                <View className="flex-1">
                  <Txt variant="label" numberOfLines={1}>
                    {f.title}
                  </Txt>
                  <Txt variant="caption" numberOfLines={2}>
                    {f.detail}
                  </Txt>
                </View>
                <Txt variant="caption">{relative(f.at)}</Txt>
              </View>
            );
          })}
        </Card>
      ) : null}
    </Screen>
  );
}
