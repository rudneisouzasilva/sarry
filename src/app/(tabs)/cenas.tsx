import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Play, Workflow } from 'lucide-react-native';
import { Card } from '@/components/Card';
import { Grid } from '@/components/Grid';
import { SectionTitle } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { Empty, ErrorBanner, Loading } from '@/components/States';
import { useToast } from '@/components/Toast';
import { Toggle } from '@/components/Toggle';
import { Txt } from '@/components/Txt';
import { useDevices } from '@/features/devices/DevicesProvider';
import { useScenes } from '@/features/scenes/useScenes';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme/colors';
import type { Automation, Scene } from '@/types';

export default function Cenas() {
  const toast = useToast();
  const { refresh } = useDevices();
  const { scenes, automations, setAutomations, loading, refreshing, error, load } = useScenes();
  const [running, setRunning] = useState<string | null>(null);

  const run = async (scene: Scene) => {
    haptic.tap();
    setRunning(scene.id);
    try {
      const res = await api.runScene(scene);
      haptic.success();
      toast(res.message);
      setTimeout(() => refresh(true, true), 2000);
    } catch (err) {
      haptic.error();
      toast(err instanceof Error ? err.message : 'Falha ao executar a cena', 'error');
    } finally {
      setRunning(null);
    }
  };

  const toggle = async (a: Automation, enabled: boolean) => {
    // otimista, com reversão se falhar
    setAutomations((list) => list.map((x) => (x.id === a.id ? { ...x, enabled } : x)));
    try {
      await api.setAutomation(a, enabled);
      toast(enabled ? `${a.name} ativada` : `${a.name} pausada`);
    } catch (err) {
      setAutomations((list) => list.map((x) => (x.id === a.id ? { ...x, enabled: !enabled } : x)));
      haptic.error();
      toast(err instanceof Error ? err.message : 'Não foi possível alterar a automação', 'error');
    }
  };

  return (
    <Screen refreshing={refreshing} onRefresh={() => load(true)}>
      <Txt variant="title" className="text-3xl" accessibilityRole="header">
        Cenas
      </Txt>
      <Txt variant="caption">Toque para executar. Crie e edite cenas no app Smart Life ou Nova Digital.</Txt>
      {error ? (
        <View className="mt-4">
          <ErrorBanner message={error} onRetry={() => load(true)} />
        </View>
      ) : null}
      {loading ? <Loading /> : null}

      {!loading && scenes.length ? <SectionTitle>Executar</SectionTitle> : null}
      <Grid>
        {scenes.map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            accessibilityLabel={`Executar cena ${s.name}`}
            accessibilityState={{ busy: running === s.id }}
            disabled={running !== null}
            onPress={() => run(s)}
            className="min-h-[110px] flex-1 justify-between rounded-card border border-line bg-card p-4 active:opacity-80"
          >
            <View className="h-11 w-11 items-center justify-center rounded-full bg-amber/15">
              {running === s.id ? <ActivityIndicator color={colors.amber} /> : <Play size={20} color={colors.amber} />}
            </View>
            <Txt variant="label" numberOfLines={2} className="mt-3">
              {s.name}
            </Txt>
          </Pressable>
        ))}
      </Grid>
      {!loading && !error && !scenes.length ? (
        <View className="mt-6">
          <Empty title="Nenhuma cena" text="Crie cenas do tipo “Toque para executar” no app da Tuya." />
        </View>
      ) : null}

      {!loading && automations.length ? <SectionTitle>Automações</SectionTitle> : null}
      {automations.length ? (
        <Card className="py-1">
          {automations.map((a, i) => (
            <View key={a.id} className={`min-h-16 flex-row items-center gap-3 ${i ? 'border-t border-line' : ''}`}>
              <Workflow size={20} color={a.enabled ? colors.amber : colors.muted} />
              <View className="flex-1 py-2">
                <Txt variant="body" numberOfLines={2}>
                  {a.name}
                </Txt>
                <Txt variant="caption">{a.enabled ? 'Ativa' : 'Pausada'}</Txt>
              </View>
              <Toggle value={a.enabled} onChange={(v) => toggle(a, v)} label={`Automação ${a.name}`} />
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
