import { useMemo, useRef } from 'react';
import { PanResponder, Platform, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/theme/colors';
import { decimal } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { Txt } from './Txt';

type Props = {
  value: number | null;
  min: number;
  max: number;
  current: number | null;
  active: boolean;
  unit?: string;
  size?: number;
  // arrastar: onChange acompanha o dedo, onCommit dispara ao soltar
  step?: number;
  disabled?: boolean;
  onChange?: (value: number) => void;
  onCommit?: (value: number) => void;
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

// Ângulo do ponto (x, y) convertido em fração do arco (0 a 1); null quando cai no vão de baixo
function fraction(x: number, y: number, c: number) {
  const deg = (Math.atan2(y - c, x - c) * 180) / Math.PI;
  const rel = (deg - START + 720) % 360;
  return rel <= SWEEP ? rel / SWEEP : null;
}

// Dial grande com temperatura alvo e temperatura ambiente real. Arrastável pelo anel.
export function Dial({
  value,
  min,
  max,
  current,
  active,
  unit = '°C',
  size = 260,
  step = 1,
  disabled = false,
  onChange,
  onCommit,
}: Props) {
  const stroke = 16;
  const r = (size - stroke) / 2 - 4;
  const c = size / 2;
  const interactive = Boolean(onCommit) && !disabled && value !== null;

  // refs para o PanResponder (criado uma vez) enxergar os valores atuais
  const live = useRef({ value, min, max, step, interactive, onChange, onCommit });
  live.current = { value, min, max, step, interactive, onChange, onCommit };
  const drag = useRef({ x0: 0, y0: 0, last: null as number | null });

  const pan = useMemo(() => {
    const valueAt = (x: number, y: number) => {
      const { min: lo, max: hi, step: st, value: v } = live.current;
      let t = fraction(x, y, c);
      // no vão de baixo, fica no extremo mais próximo do valor atual (sem pular de 16 para 32)
      if (t === null) {
        const prev = drag.current.last ?? v ?? lo;
        t = (prev - lo) / (hi - lo || 1) > 0.5 ? 1 : 0;
      }
      const raw = lo + t * (hi - lo);
      return Math.min(hi, Math.max(lo, Math.round(raw / st) * st));
    };
    const update = (x: number, y: number) => {
      const next = valueAt(x, y);
      if (next !== drag.current.last) {
        drag.current.last = next;
        haptic.select();
        live.current.onChange?.(next);
      }
    };
    return PanResponder.create({
      // só começa ao tocar no anel, para o resto do cartão continuar rolando a tela
      onStartShouldSetPanResponder: (e) => {
        if (!live.current.interactive) return false;
        const { locationX: x, locationY: y } = e.nativeEvent;
        const d = Math.hypot(x - c, y - c);
        return d > r - 40 && d < r + 28 && fraction(x, y, c) !== null;
      },
      onMoveShouldSetPanResponder: () => false,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        drag.current = { x0: e.nativeEvent.locationX, y0: e.nativeEvent.locationY, last: live.current.value };
        update(drag.current.x0, drag.current.y0);
      },
      onPanResponderMove: (_, g) => update(drag.current.x0 + g.dx, drag.current.y0 + g.dy),
      onPanResponderRelease: () => {
        if (drag.current.last !== null) live.current.onCommit?.(drag.current.last);
      },
      onPanResponderTerminate: () => {
        if (drag.current.last !== null) live.current.onCommit?.(drag.current.last);
      },
    });
  }, [c, r]);

  const stepBy = (dir: 1 | -1) => {
    if (!interactive || value === null) return;
    onCommit?.(Math.min(max, Math.max(min, value + dir * step)));
  };
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
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => stepBy(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
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
      {/* camada de toque por cima de tudo: as coordenadas ficam relativas ao dial */}
      <View
        {...pan.panHandlers}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[
          { position: 'absolute', top: 0, left: 0, width: size, height: size },
          Platform.OS === 'web' ? ({ touchAction: 'none', userSelect: 'none', cursor: interactive ? 'grab' : 'default' } as object) : null,
        ]}
      />
    </View>
  );
}
