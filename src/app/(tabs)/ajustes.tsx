import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { BellRing, ChevronRight, LogOut, Monitor, Stethoscope } from 'lucide-react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { SectionTitle } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { ErrorBanner } from '@/components/States';
import { useToast } from '@/components/Toast';
import { Toggle } from '@/components/Toggle';
import { Txt } from '@/components/Txt';
import { useSession } from '@/features/auth/SessionProvider';
import { useDevices } from '@/features/devices/DevicesProvider';
import { useSettings } from '@/features/settings/useSettings';
import { biometricsAvailable, biometricsEnabled, setBiometricsEnabled } from '@/lib/biometrics';
import { registerPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme/colors';
import type { Settings } from '@/types';

const KIND_LABEL = { light: 'Luz', ac: 'Ar-condicionado', hub: 'Hub', other: 'Outro' } as const;

function parseNumber(text: string) {
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function Row({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return <View className={`min-h-14 flex-row items-center justify-between gap-3 ${first ? '' : 'border-t border-line'}`}>{children}</View>;
}

export default function Ajustes() {
  const router = useRouter();
  const toast = useToast();
  const { session, signOut } = useSession();
  const { devices, refresh } = useDevices();
  const { settings, error, save } = useSettings();
  const [tariff, setTariff] = useState('');
  const [acPower, setAcPower] = useState<Record<string, string>>({});
  const [quick, setQuick] = useState<Settings['quick_scenes'] | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const acs = devices.filter((d) => d.kind === 'ac');

  useEffect(() => {
    if (settings) {
      setTariff(String(settings.tariff_kwh).replace('.', ','));
      setQuick(settings.quick_scenes);
    }
  }, [settings]);

  useEffect(() => {
    setAcPower(Object.fromEntries(acs.map((d) => [d.id, d.powerW ? String(d.powerW) : ''])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acs.map((d) => `${d.id}:${d.powerW}`).join()]);

  useEffect(() => {
    biometricsAvailable().then(setBioAvailable);
    biometricsEnabled().then(setBioOn);
  }, []);

  const saveSettings = async (patch: Partial<Settings>, msg = 'Ajustes salvos') => {
    try {
      await save(patch);
      toast(msg);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível salvar', 'error');
    }
  };

  const saveTariff = () => {
    const value = parseNumber(tariff);
    if (value === null || value <= 0) return toast('Informe uma tarifa válida, por exemplo 0,85', 'error');
    saveSettings({ tariff_kwh: value }, 'Tarifa salva');
  };

  const savePower = async (id: string) => {
    const value = parseNumber(acPower[id] ?? '');
    if (value === null || value <= 0) return toast('Informe a potência em watts, por exemplo 1100', 'error');
    const { error: err } = await supabase.from('devices').update({ power_w: Math.round(value) }).eq('id', id);
    if (err) return toast(err.message, 'error');
    toast('Potência salva');
    refresh(true, true);
  };

  const enablePush = async () => {
    setPushBusy(true);
    const res = await registerPush(true);
    setPushBusy(false);
    toast(res.ok ? 'Notificações ativadas neste aparelho' : res.reason, res.ok ? 'ok' : 'error');
  };

  return (
    <Screen>
      <Txt variant="title" className="text-3xl" accessibilityRole="header">
        Ajustes
      </Txt>
      {error ? (
        <View className="mt-4">
          <ErrorBanner message={error} />
        </View>
      ) : null}

      <SectionTitle>Dispositivos</SectionTitle>
      <Card className="py-1">
        {devices.length === 0 ? <Txt variant="caption" className="py-4">Nenhum dispositivo carregado.</Txt> : null}
        {devices.map((d, i) => (
          <Pressable
            key={d.id}
            accessibilityRole="button"
            accessibilityLabel={`Editar ${d.name}`}
            onPress={() => router.push({ pathname: '/dispositivo/[id]', params: { id: d.id } })}
            className={`min-h-16 flex-row items-center gap-3 py-2 active:opacity-70 ${i ? 'border-t border-line' : ''}`}
          >
            <View className="flex-1">
              <Txt variant="label" numberOfLines={1}>
                {d.name}
              </Txt>
              <Txt variant="caption" numberOfLines={1}>
                {KIND_LABEL[d.kind]}
                {d.room ? ` · ${d.room}` : ''}
                {d.hidden ? ' · oculto' : ''}
                {d.online ? '' : ' · offline'}
              </Txt>
            </View>
            <ChevronRight size={20} color={colors.muted} />
          </Pressable>
        ))}
      </Card>

      <SectionTitle>Energia</SectionTitle>
      <Card className="gap-4">
        <View className="flex-row items-end gap-3">
          <Field label="Tarifa (R$ por kWh)" value={tariff} onChangeText={setTariff} keyboardType="decimal-pad" className="flex-1" />
          <Button title="Salvar" variant="secondary" onPress={saveTariff} />
        </View>
        {acs.map((d) => (
          <View key={d.id} className="flex-row items-end gap-3">
            <Field
              label={`Potência de ${d.name} (W)`}
              value={acPower[d.id] ?? ''}
              onChangeText={(t) => setAcPower((p) => ({ ...p, [d.id]: t }))}
              keyboardType="number-pad"
              placeholder="ex.: 1100"
              className="flex-1"
            />
            <Button title="Salvar" variant="secondary" onPress={() => savePower(d.id)} />
          </View>
        ))}
        <Txt variant="caption">A potência fica na etiqueta do aparelho ou no manual (consumo em watts).</Txt>
      </Card>

      <SectionTitle>Cenas rápidas</SectionTitle>
      <Card className="gap-4">
        <Txt variant="caption">Nome exato da cena na Tuya que cada botão do Início executa.</Txt>
        {quick
          ? (['cheguei', 'dormir', 'sair'] as const).map((k) => (
              <Field
                key={k}
                label={k === 'cheguei' ? 'Cheguei' : k === 'dormir' ? 'Dormir' : 'Sair'}
                value={quick[k]}
                onChangeText={(t) => setQuick({ ...quick, [k]: t })}
              />
            ))
          : null}
        <Button title="Salvar nomes" variant="secondary" onPress={() => quick && saveSettings({ quick_scenes: quick })} />
      </Card>

      <SectionTitle>Alertas</SectionTitle>
      <Card className="py-1">
        <Row first>
          <View className="flex-1">
            <Txt variant="body">Luz esquecida acesa</Txt>
            <Txt variant="caption">
              Mais de {settings?.forgotten_light_hours ?? 3} h acesa ou acesa após {settings?.late_night_hour ?? 1}h
            </Txt>
          </View>
          <Toggle
            value={settings?.notify_forgotten ?? true}
            onChange={(v) => saveSettings({ notify_forgotten: v })}
            label="Alerta de luz esquecida"
          />
        </Row>
        <Row>
          <View className="flex-1">
            <Txt variant="body">Dispositivo offline</Txt>
            <Txt variant="caption">Sem conexão por mais de {settings?.offline_minutes ?? 15} min</Txt>
          </View>
          <Toggle value={settings?.notify_offline ?? true} onChange={(v) => saveSettings({ notify_offline: v })} label="Alerta de dispositivo offline" />
        </Row>
        <Row>
          <Txt variant="body" className="flex-1">
            Horas para considerar esquecida
          </Txt>
          <View className="flex-row gap-2">
            {[1, 2, 3, 4, 6].map((h) => (
              <Pressable
                key={h}
                accessibilityRole="radio"
                accessibilityState={{ checked: settings?.forgotten_light_hours === h }}
                accessibilityLabel={`${h} horas`}
                onPress={() => saveSettings({ forgotten_light_hours: h })}
                className={`h-11 w-11 items-center justify-center rounded-full ${
                  settings?.forgotten_light_hours === h ? 'bg-amber' : 'bg-card-alt'
                }`}
              >
                <Txt variant="label" className={settings?.forgotten_light_hours === h ? 'text-bg' : ''}>
                  {h}
                </Txt>
              </Pressable>
            ))}
          </View>
        </Row>
      </Card>
      {Platform.OS !== 'web' ? (
        <Button title="Ativar notificações neste aparelho" icon={BellRing} variant="secondary" loading={pushBusy} onPress={enablePush} className="mt-3" />
      ) : null}

      {bioAvailable ? (
        <>
          <SectionTitle>Segurança</SectionTitle>
          <Card className="py-1">
            <Row first>
              <View className="flex-1">
                <Txt variant="body">Desbloquear com biometria</Txt>
                <Txt variant="caption">Pede digital ou rosto ao abrir o app</Txt>
              </View>
              <Toggle
                value={bioOn}
                onChange={async (v) => {
                  await setBiometricsEnabled(v);
                  setBioOn(v);
                }}
                label="Desbloquear com biometria"
              />
            </Row>
          </Card>
        </>
      ) : null}

      <SectionTitle>Ferramentas</SectionTitle>
      <View className="gap-3">
        <Button title="Modo painel de parede" icon={Monitor} variant="secondary" onPress={() => router.push('/painel')} />
        <Button title="Diagnóstico dos dispositivos" icon={Stethoscope} variant="secondary" onPress={() => router.push('/diagnostico')} />
      </View>

      <SectionTitle>Conta</SectionTitle>
      <Card className="gap-3">
        <Txt variant="caption">Conectado como {session?.user.email}</Txt>
        <Button title="Sair da conta" icon={LogOut} variant="danger" onPress={signOut} />
      </Card>
    </Screen>
  );
}
