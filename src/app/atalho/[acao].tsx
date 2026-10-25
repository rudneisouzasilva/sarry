// Destino dos atalhos do ícone do app (sarry://atalho/dormir, /sair, /desligar_ar)
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { CheckCircle2, XCircle } from 'lucide-react-native';
import { Button } from '@/components/Button';
import { Txt } from '@/components/Txt';
import { useDevices } from '@/features/devices/DevicesProvider';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme/colors';
import type { QuickAction } from '@/types';

const VALID: QuickAction[] = ['cheguei', 'dormir', 'sair', 'desligar_ar'];
const LABEL: Record<QuickAction, string> = {
  cheguei: 'Cheguei',
  dormir: 'Dormir',
  sair: 'Sair',
  desligar_ar: 'Desligar o ar',
};

export default function Atalho() {
  const { acao } = useLocalSearchParams<{ acao: string }>();
  const router = useRouter();
  const { refresh } = useDevices();
  const [state, setState] = useState<{ status: 'running' | 'ok' | 'error'; message: string }>({ status: 'running', message: '' });
  const started = useRef(false);
  const action = VALID.includes(acao as QuickAction) ? (acao as QuickAction) : null;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!action) {
      setState({ status: 'error', message: 'Atalho desconhecido' });
      return;
    }
    api
      .quick(action, 'atalho')
      .then((res) => {
        haptic.success();
        setState({ status: 'ok', message: res.message });
        refresh(true, true);
        setTimeout(() => router.replace('/'), 1400);
      })
      .catch((err) => {
        haptic.error();
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Falha ao executar' });
      });
  }, [action, refresh, router]);

  return (
    <View className="flex-1 items-center justify-center gap-5 bg-bg px-8" accessibilityLiveRegion="polite">
      {state.status === 'running' ? <ActivityIndicator size="large" color={colors.amber} /> : null}
      {state.status === 'ok' ? <CheckCircle2 size={48} color={colors.ok} /> : null}
      {state.status === 'error' ? <XCircle size={48} color={colors.danger} /> : null}
      <Txt variant="title" className="text-center">
        {action ? LABEL[action] : 'Atalho'}
      </Txt>
      <Txt variant="caption" className="text-center">
        {state.status === 'running' ? 'Executando...' : state.message}
      </Txt>
      {state.status === 'error' ? <Button title="Ir para o início" variant="secondary" onPress={() => router.replace('/')} /> : null}
    </View>
  );
}
