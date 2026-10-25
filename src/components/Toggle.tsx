import { Pressable, View } from 'react-native';
import { haptic } from '@/lib/haptics';

type Props = {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  tone?: 'amber' | 'sky';
  disabled?: boolean;
};

// Interruptor acessível com alvo de toque de 44 px e feedback háptico
export function Toggle({ value, onChange, label, tone = 'amber', disabled }: Props) {
  const on = tone === 'amber' ? 'bg-amber' : 'bg-sky';
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={6}
      onPress={() => {
        haptic.tap();
        onChange(!value);
      }}
      className={`h-11 w-16 justify-center ${disabled ? 'opacity-40' : ''}`}
    >
      <View className={`h-8 w-14 justify-center rounded-full px-1 ${value ? on : 'bg-line'}`}>
        <View className={`h-6 w-6 rounded-full ${value ? 'self-end bg-bg' : 'self-start bg-muted'}`} />
      </View>
    </Pressable>
  );
}
