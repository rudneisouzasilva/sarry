import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/theme/colors';
import { decimal } from '@/lib/format';
import { Txt } from './Txt';

type Props = {
  value: number | null;
  min: number;
  max: number;
  current: number | null;
  active: boolean;
  unit?: string;
  size?: number;
};

const SWEEP = 270;
const START = 135; // começa embaixo à esquerda

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

// Dial grande com temperatura alvo e temperatura ambiente real
export function Dial({ value, min, max, current, active, unit = '°C', size = 260 }: Props) {
  const stroke = 16;
  const r = (size - stroke) / 2 - 4;
  const c = size / 2;
  const t = value === null ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min || 1)));
  const end = START + SWEEP * t;
  const knob = polar(c, c, r, end);
  const tone = active ? colors.sky : colors.muted;
  const text = value === null ? '--' : Number.isInteger(value) ? String(value) : decimal(value);

  return (
    <View
      style={{ width: size, height: size }}
      className="items-center justify-center self-center"
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Temperatura alvo"
      accessibilityValue={{ min, max, now: value ?? undefined, text: `${text} graus` }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Path d={arc(c, c, r, START, START + SWEEP)} stroke={colors.line} strokeWidth={stroke} strokeLinecap="round" fill="none" />
        {value !== null && t > 0 ? (
          <Path d={arc(c, c, r, START, Math.max(end, START + 0.5))} stroke={tone} strokeWidth={stroke} strokeLinecap="round" fill="none" />
        ) : null}
        {value !== null ? <Circle cx={knob.x} cy={knob.y} r={stroke / 2 + 3} fill={colors.bg} stroke={tone} strokeWidth={4} /> : null}
      </Svg>
      <Txt variant="caption">{active ? 'Alvo' : 'Desligado'}</Txt>
      <View className="flex-row items-start">
        <Txt variant="display" className="text-7xl leading-[84px]" style={{ color: active ? colors.ink : colors.muted }}>
          {text}
        </Txt>
        <Txt variant="title" className="mt-3" style={{ color: tone }}>
          {unit}
        </Txt>
      </View>
      <Txt variant="caption">Ambiente {current === null ? '--' : `${decimal(current, Number.isInteger(current) ? 0 : 1)}${unit}`}</Txt>
    </View>
  );
}
