import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { IconButton } from './Button';
import { Txt } from './Txt';

export function BackHeader({ title, right }: { title: string; right?: ReactNode }) {
  const router = useRouter();
  return (
    <View className="mb-4 flex-row items-center gap-1">
      <IconButton
        icon={ChevronLeft}
        label="Voltar"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        className="-ml-2"
      />
      <Txt variant="title" accessibilityRole="header" className="flex-1" numberOfLines={1}>
        {title}
      </Txt>
      {right}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View className="mb-3 mt-7 flex-row items-center justify-between">
      <Txt variant="heading" accessibilityRole="header">
        {children}
      </Txt>
      {right}
    </View>
  );
}
