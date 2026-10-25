import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import { Txt } from './Txt';

type Props = PressableProps & {
  title: string;
  icon?: LucideIcon;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  className?: string;
};

const styles = {
  primary: { box: 'bg-amber', text: 'text-bg', icon: colors.bg },
  secondary: { box: 'bg-card-alt border border-line', text: 'text-ink', icon: colors.ink },
  danger: { box: 'bg-card-alt border border-danger/40', text: 'text-danger', icon: colors.danger },
  ghost: { box: '', text: 'text-muted', icon: colors.muted },
};

export function Button({ title, icon: Icon, variant = 'primary', loading, disabled, className = '', ...props }: Props) {
  const s = styles[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      className={`min-h-12 flex-row items-center justify-center gap-2 rounded-tile px-5 active:opacity-80 ${s.box} ${
        disabled ? 'opacity-50' : ''
      } ${className}`}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={s.icon} />
      ) : (
        <View className="flex-row items-center gap-2">
          {Icon && <Icon size={18} color={s.icon} strokeWidth={2} />}
          <Txt variant="label" className={`text-base ${s.text}`}>
            {title}
          </Txt>
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon: Icon,
  label,
  onPress,
  color = colors.ink,
  size = 22,
  className = '',
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      className={`h-11 w-11 items-center justify-center rounded-full active:opacity-70 ${disabled ? 'opacity-40' : ''} ${className}`}
    >
      <Icon size={size} color={color} strokeWidth={2} />
    </Pressable>
  );
}
