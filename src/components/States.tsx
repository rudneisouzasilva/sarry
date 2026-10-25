import { ActivityIndicator, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import { Button } from './Button';
import { Txt } from './Txt';

export function Loading({ label = 'Carregando' }: { label?: string }) {
  return (
    <View className="items-center justify-center py-16" accessibilityLabel={label}>
      <ActivityIndicator color={colors.amber} size="large" />
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View accessibilityRole="alert" className="mb-4 flex-row items-center gap-3 rounded-tile border border-danger/40 bg-card p-4">
      <AlertTriangle size={20} color={colors.danger} />
      <Txt variant="body" className="flex-1 text-sm">
        {message}
      </Txt>
      {onRetry ? <Button title="Tentar" variant="ghost" onPress={onRetry} className="min-h-11 px-2" /> : null}
    </View>
  );
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <View className="items-center rounded-card border border-dashed border-line px-6 py-10">
      <Txt variant="heading" className="text-center">
        {title}
      </Txt>
      {text ? (
        <Txt variant="caption" className="mt-2 text-center">
          {text}
        </Txt>
      ) : null}
    </View>
  );
}
