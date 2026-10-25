import { type ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';

type Props = {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  className?: string;
};

// Container de tela: mobile-first e centralizado com largura máxima na web/tablet
export function Screen({ children, refreshing = false, onRefresh, scroll = true, className = '' }: Props) {
  const insets = useSafeAreaInsets();
  const inner = (
    <View className={`w-full max-w-[960px] self-center px-4 pb-10 ${className}`} style={{ paddingTop: insets.top + 12 }}>
      {children}
    </View>
  );
  if (!scroll) return <View className="flex-1 bg-bg">{inner}</View>;
  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.muted} colors={[colors.amber]} progressBackgroundColor={colors.card} />
        ) : undefined
      }
    >
      {inner}
    </ScrollView>
  );
}
