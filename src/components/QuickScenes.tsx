import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { DoorOpen, LogOut, Moon, type LucideIcon } from 'lucide-react-native';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useDevices } from '@/features/devices/DevicesProvider';
import { colors } from '@/theme/colors';
import type { CommandSource, QuickAction } from '@/types';
import { useToast } from './Toast';
import { Txt } from './Txt';

const QUICK: { id: QuickAction; label: string; icon: LucideIcon }[] = [
  { id: 'cheguei', label: 'Cheguei', icon: DoorOpen },
  { id: 'dormir', label: 'Dormir', icon: Moon },
  { id: 'sair', label: 'Sair', icon: LogOut },
];

export function QuickScenes({ source = 'app', large }: { source?: CommandSource; large?: boolean }) {
  const toast = useToast();
  const { refresh } = useDevices();
  const [running, setRunning] = useState<QuickAction | null>(null);

  const run = async (id: QuickAction) => {
    haptic.tap();
    setRunning(id);
    try {
      const res = await api.quick(id, source);
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

  return (
    <View className="flex-row gap-3">
      {QUICK.map(({ id, label, icon: Icon }) => (
        <Pressable
          key={id}
          accessibilityRole="button"
          accessibilityLabel={`Cena ${label}`}
          accessibilityState={{ busy: running === id }}
          disabled={running !== null}
          onPress={() => run(id)}
          className={`flex-1 items-center gap-2 rounded-card border border-line bg-card active:opacity-80 ${large ? 'py-6' : 'py-4'}`}
        >
          <View className="h-11 w-11 items-center justify-center rounded-full bg-card-alt">
            {running === id ? <ActivityIndicator color={colors.amber} /> : <Icon size={22} color={colors.amber} />}
          </View>
          <Txt variant="label">{label}</Txt>
        </Pressable>
      ))}
    </View>
  );
}
