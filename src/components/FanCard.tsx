import { View } from 'react-native';
import { Fan } from 'lucide-react-native';
import { useDevices } from '@/features/devices/DevicesProvider';
import { colors } from '@/theme/colors';
import type { CommandSource, Device } from '@/types';
import { Card } from './Card';
import { Segmented } from './Segmented';
import { Toggle } from './Toggle';
import { Txt } from './Txt';

// Velocidades rápidas (o aparelho aceita de 1 a 100%)
const SPEEDS = [
  { value: '25', label: 'Baixa' },
  { value: '50', label: 'Média' },
  { value: '75', label: 'Alta' },
  { value: '100', label: 'Máxima' },
];

function nearestSpeed(raw: unknown) {
  if (typeof raw !== 'number') return undefined;
  return SPEEDS.reduce((best, s) => (Math.abs(Number(s.value) - raw) < Math.abs(Number(best.value) - raw) ? s : best)).value;
}

// Sentido do motor: para a frente ventila, invertido exaure
const DIRECTIONS = [
  { value: 'forward', label: 'Ventilar' },
  { value: 'reversal', label: 'Exaustor' },
];

// Ventilador de teto: liga/desliga, velocidade e sentido. A luz aparece junto das outras luzes.
export function FanCard({ device, source = 'app' }: { device: Device; source?: CommandSource }) {
  const { command } = useDevices();
  const fan = device.channels.find((c) => c.code === 'switch_fan');
  const isOn = Boolean(device.online && fan?.isOn);
  const speed = device.status.fan_speed;
  const direction = device.status.control_back;

  const send = (code: string, value: unknown, label = device.name) => command(device, [{ code, value }], { source, label });

  return (
    <Card className={isOn ? 'border-amber/40' : ''}>
      <View className="flex-row items-center gap-3">
        <View className={`h-11 w-11 items-center justify-center rounded-full ${isOn ? 'bg-amber' : 'bg-card-alt'}`}>
          <Fan size={22} color={isOn ? colors.bg : colors.muted} />
        </View>
        <View className="flex-1">
          <Txt variant="label" numberOfLines={1}>
            {device.name}
          </Txt>
          <Txt variant="caption" numberOfLines={1}>
            {!device.online
              ? 'Offline'
              : isOn
                ? `Ligado${typeof speed === 'number' ? ` · ${speed}%` : ''}`
                : 'Desligado'}
          </Txt>
        </View>
        {fan ? <Toggle value={isOn} onChange={(v) => send(fan.code, v)} label={`Ligar ${device.name}`} disabled={!device.online} /> : null}
      </View>
      {typeof speed === 'number' ? (
        <View className="mt-4">
          <Segmented
            label="Velocidade"
            tone="amber"
            options={SPEEDS}
            value={nearestSpeed(speed)}
            onChange={(v) => send('fan_speed', Number(v), `${device.name} ${v}%`)}
            disabled={!isOn}
          />
        </View>
      ) : null}
      {typeof direction === 'string' ? (
        <View className="mt-3">
          <Segmented
            label="Função"
            tone="amber"
            options={DIRECTIONS}
            value={direction}
            onChange={(v) => send('control_back', v, `${device.name}: ${v === 'forward' ? 'ventilar' : 'exaustor'}`)}
            disabled={!device.online}
          />
        </View>
      ) : null}
    </Card>
  );
}
