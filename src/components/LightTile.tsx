import { Pressable, View } from 'react-native';
import { Lightbulb, LightbulbOff } from 'lucide-react-native';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme/colors';
import { Txt } from './Txt';

type Props = {
  name: string;
  room: string | null;
  isOn: boolean;
  online: boolean;
  onToggle: () => void;
  large?: boolean;
};

// Bloco de luz: o bloco inteiro é o interruptor
export function LightTile({ name, room, isOn, online, onToggle, large }: Props) {
  const Icon = online ? Lightbulb : LightbulbOff;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={`${name}${room ? `, ${room}` : ''}`}
      accessibilityState={{ checked: isOn, disabled: !online }}
      accessibilityHint={online ? undefined : 'Dispositivo offline'}
      disabled={!online}
      onPress={() => {
        haptic.tap();
        onToggle();
      }}
      className={`flex-1 justify-between rounded-card border p-4 active:opacity-80 ${large ? 'min-h-[150px]' : 'min-h-[120px]'} ${
        isOn ? 'border-amber/50 bg-amber/10' : 'border-line bg-card'
      } ${online ? '' : 'opacity-50'}`}
    >
      <View className="flex-row items-start justify-between">
        <View className={`h-11 w-11 items-center justify-center rounded-full ${isOn ? 'bg-amber' : 'bg-card-alt'}`}>
          <Icon size={22} color={isOn ? colors.bg : colors.muted} strokeWidth={2} />
        </View>
        <View className={`mt-1 h-6 w-10 justify-center rounded-full px-0.5 ${isOn ? 'bg-amber' : 'bg-line'}`}>
          <View className={`h-5 w-5 rounded-full ${isOn ? 'self-end bg-bg' : 'self-start bg-muted'}`} />
        </View>
      </View>
      <View className="mt-3">
        <Txt variant="label" className={large ? 'text-lg' : ''} numberOfLines={1}>
          {name}
        </Txt>
        <Txt variant="caption" numberOfLines={1}>
          {online ? `${room ? `${room} · ` : ''}${isOn ? 'Acesa' : 'Apagada'}` : 'Offline'}
        </Txt>
      </View>
    </Pressable>
  );
}
