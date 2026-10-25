import { View } from 'react-native';
import { Txt } from '@/components/Txt';

export function ConfigMissing() {
  return (
    <View className="flex-1 items-center justify-center bg-bg px-8">
      <Txt variant="title" className="mb-3 text-center">
        Falta configurar o Supabase
      </Txt>
      <Txt variant="caption" className="text-center">
        Crie o arquivo .env.local com EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY (veja .env.example) e
        reinicie o app. Na Vercel e no EAS, cadastre essas mesmas variáveis.
      </Txt>
    </View>
  );
}
