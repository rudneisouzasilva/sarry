import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { colors, fonts } from '@/theme/colors';
import { decimal } from '@/lib/format';

type Bar = { label: string; value: number; highlight?: boolean };

// Gráfico de barras simples em SVG (funciona igual no celular e na web)
export function BarChart({ data, unit = 'h', height = 180, color = colors.sky }: { data: Bar[]; unit?: string; height?: number; color?: string }) {
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...data.map((d) => d.value));
  const top = 22;
  const bottom = 26;
  const chartH = height - top - bottom;
  const slot = data.length ? width / data.length : 0;
  const barW = Math.min(36, slot * 0.56);

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Gráfico: ${data.map((d) => `${d.label} ${decimal(d.value)} ${unit}`).join(', ')}`}
      style={{ height }}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Line x1={0} x2={width} y1={top + chartH} y2={top + chartH} stroke={colors.line} strokeWidth={1} />
          {data.map((d, i) => {
            const h = d.value > 0 ? Math.max(4, (d.value / max) * chartH) : 0;
            const x = i * slot + (slot - barW) / 2;
            const y = top + chartH - h;
            return (
              <G key={d.label + i}>
                {h > 0 ? <Rect x={x} y={y} width={barW} height={h} rx={8} fill={color} opacity={d.highlight ? 1 : 0.55} /> : null}
                <SvgText x={x + barW / 2} y={y - 6} fill={colors.ink} fontSize={11} fontFamily={fonts.bodySemibold} textAnchor="middle">
                  {d.value > 0 ? decimal(d.value) : ''}
                </SvgText>
                <SvgText
                  x={x + barW / 2}
                  y={height - 6}
                  fill={d.highlight ? colors.ink : colors.muted}
                  fontSize={12}
                  fontFamily={fonts.body}
                  textAnchor="middle"
                >
                  {d.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}
