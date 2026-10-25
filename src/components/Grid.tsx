import { Children, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

// Grade responsiva: 2 colunas no celular, mais no tablet/computador
export function Grid({ children, min = 2, gap = 12 }: { children: ReactNode; min?: number; gap?: number }) {
  const { width } = useWindowDimensions();
  const content = Math.min(width, 960) - 32;
  const cols = Math.max(min, Math.floor(content / 200));
  const items = Children.toArray(children);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  return (
    <View style={{ gap }}>
      {rows.map((row, i) => (
        <View key={i} className="flex-row" style={{ gap }}>
          {row}
          {Array.from({ length: cols - row.length }, (_, j) => (
            <View key={`f${j}`} className="flex-1" />
          ))}
        </View>
      ))}
    </View>
  );
}
