import { Pressable, View, type PressableProps, type ViewProps } from 'react-native';

export function Card({ className = '', ...props }: ViewProps & { className?: string }) {
  return <View className={`rounded-card border border-line bg-card p-4 ${className}`} {...props} />;
}

export function PressableCard({ className = '', ...props }: PressableProps & { className?: string }) {
  return (
    <Pressable
      className={`rounded-card border border-line bg-card p-4 active:opacity-80 ${className}`}
      {...props}
    />
  );
}
