import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { AirVent, ChevronRight } from 'lucide-react-native';
import { useAc } from '@/features/climate/useAc';
import { modeLabel } from '@/features/climate/capabilities';
import { decimal } from '@/lib/format';
import { colors } from '@/theme/colors';
import type { CommandSource, Device } from '@/types';
import { PressableCard } from './Card';
import { Toggle } from './Toggle';
import { Txt } from './Txt';

export function AcCard({ device, source = 'app', large }: { device: Device; source?: CommandSource; large?: boolean }) {
  const router = useRouter();
  const { caps, isOn, target, current, setPower } = useAc(device, source);
  const mode = caps ? modeLabel(caps, caps.mode ? device.status[caps.mode.code] : null) : null;

  return (
    <PressableCard
      accessibilityRole="button"
      accessibilityLabel={`${device.name}, ${isOn ? 'ligado' : 'desligado'}. Abrir controles do ar`}
      onPress={() => router.push({ pathname: '/ar/[id]', params: { id: device.id } })}
      className={isOn ? 'border-sky/40' : ''}
    >
      <View className="flex-row items-center gap-3">
        <View className={`h-11 w-11 items-center justify-center rounded-full ${isOn ? 'bg-sky' : 'bg-card-alt'}`}>
          <AirVent size={22} color={isOn ? colors.bg : colors.muted} />
        </View>
        <View className="flex-1">
          <Txt variant="label" numberOfLines={1}>
            {device.name}
          </Txt>
          <Txt variant="caption" numberOfLines={1}>
            {!device.online ? 'Offline' : isOn ? `Ligado${mode ? ` · ${mode}` : ''}` : 'Desligado'}
          </Txt>
        </View>
        <Toggle value={isOn} onChange={(v) => setPower(v)} label={`Ligar ${device.name}`} tone="sky" disabled={!device.online || !caps?.power} />
      </View>
      <View className="mt-4 flex-row items-end justify-between">
        <View className="flex-row items-end gap-6">
          <View>
            <Txt variant="caption">Alvo</Txt>
            <Txt variant="display" className={large ? 'text-6xl' : 'text-4xl'} style={{ color: isOn ? colors.sky : colors.muted }}>
              {target === null ? '--' : `${Number.isInteger(target) ? target : decimal(target)}°`}
            </Txt>
          </View>
          <View className="pb-1">
            <Txt variant="caption">Ambiente</Txt>
            <Txt variant="number">{current === null ? '--' : `${Number.isInteger(current) ? current : decimal(current)}°`}</Txt>
          </View>
        </View>
        <ChevronRight size={22} color={colors.muted} />
      </View>
    </PressableCard>
  );
}
