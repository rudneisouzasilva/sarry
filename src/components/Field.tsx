import { TextInput, View, type TextInputProps } from 'react-native';
import { colors } from '@/theme/colors';
import { Txt } from './Txt';

export function Field({ label, hint, className = '', ...props }: TextInputProps & { label: string; hint?: string; className?: string }) {
  return (
    <View className={`gap-1.5 ${className}`}>
      <Txt variant="label" className="text-muted">
        {label}
      </Txt>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        className="min-h-12 rounded-tile border border-line bg-card-alt px-4 font-body text-base text-ink"
        {...props}
      />
      {hint ? <Txt variant="caption">{hint}</Txt> : null}
    </View>
  );
}
