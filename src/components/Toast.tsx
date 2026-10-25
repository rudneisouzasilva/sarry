import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, XCircle } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import { Txt } from './Txt';

type ToastMsg = { id: number; text: string; kind: 'ok' | 'error' };

const ToastContext = createContext<(text: string, kind?: ToastMsg['kind']) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback((text: string, kind: ToastMsg['kind'] = 'ok') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), text, kind });
    timer.current = setTimeout(() => setToast(null), kind === 'error' ? 5000 : 2600);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <View pointerEvents="none" className="absolute left-0 right-0 items-center px-4" style={{ bottom: insets.bottom + 84 }}>
        {toast ? (
          <Animated.View
            key={toast.id}
            entering={FadeInDown.duration(180)}
            exiting={FadeOutDown.duration(180)}
            style={{ width: '100%', maxWidth: 480 }}
          >
            <View
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              className="w-full flex-row items-center gap-3 rounded-tile border border-line bg-card-alt px-4 py-3"
            >
            {toast.kind === 'ok' ? <CheckCircle2 size={20} color={colors.ok} /> : <XCircle size={20} color={colors.danger} />}
            <Txt variant="body" className="flex-1 text-sm">
              {toast.text}
            </Txt>
            </View>
          </Animated.View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}
