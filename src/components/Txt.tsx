import { Text, type TextProps } from 'react-native';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'number';

const variants: Record<Variant, string> = {
  display: 'font-display-bold text-5xl text-ink',
  number: 'font-display text-2xl text-ink',
  title: 'font-display text-2xl text-ink',
  heading: 'font-display text-lg text-ink',
  body: 'font-body text-base text-ink',
  label: 'font-body-semibold text-sm text-ink',
  caption: 'font-body text-sm text-muted',
};

const COLOR = /(^|\s)text-(bg|ink|muted|amber|sky|danger|ok)(\/\d+)?(\s|$)/;

export function Txt({ variant = 'body', className = '', ...props }: TextProps & { variant?: Variant; className?: string }) {
  // uma cor passada em className substitui a cor padrão da variante
  const base = COLOR.test(className) ? variants[variant].replace(/\btext-(ink|muted)\b/, '') : variants[variant];
  return <Text className={`${base} ${className}`} maxFontSizeMultiplier={1.6} {...props} />;
}
