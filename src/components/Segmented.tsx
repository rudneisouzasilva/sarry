import { Pressable, View } from 'react-native';
import { haptic } from '@/lib/haptics';
import { Txt } from './Txt';

type Option = { value: string; label: string };

type Props = {
  options: Option[];
  value: string | undefined;
  onChange: (value: string) => void;
  label: string;
  tone?: 'amber' | 'sky';
  disabled?: boolean;
};

export function Segmented({ options, value, onChange, label, tone = 'sky', disabled }: Props) {
  const active = tone === 'sky' ? 'bg-sky' : 'bg-amber';
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} className={`flex-row flex-wrap gap-2 ${disabled ? 'opacity-40' : ''}`}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            accessibilityLabel={`${label}: ${o.label}`}
            disabled={disabled}
            onPress={() => {
              if (selected) return;
              haptic.select();
              onChange(o.value);
            }}
            className={`min-h-11 min-w-[72px] flex-1 items-center justify-center rounded-tile border px-3 ${
              selected ? `${active} border-transparent` : 'border-line bg-card-alt'
            }`}
          >
            <Txt variant="label" className={selected ? 'text-bg' : 'text-ink'}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
