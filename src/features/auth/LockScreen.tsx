import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Fingerprint, LogOut } from 'lucide-react-native';
import { Button } from '@/components/Button';
import { Txt } from '@/components/Txt';
import { colors } from '@/theme/colors';
import { useSession } from './SessionProvider';

export function LockScreen() {
  const { unlock, signOut } = useSession();
  const [failed, setFailed] = useState(false);

  const tryUnlock = async () => setFailed(!(await unlock()));

  useEffect(() => {
    tryUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View className="flex-1 items-center justify-center gap-6 bg-bg px-8">
      <View className="h-20 w-20 items-center justify-center rounded-full border border-line bg-card">
        <Fingerprint size={36} color={colors.amber} />
      </View>
      <View className="items-center gap-2">
        <Txt variant="title">Sarry bloqueado</Txt>
        <Txt variant="caption" className="text-center">
          {failed ? 'Não foi possível confirmar sua identidade.' : 'Confirme sua identidade para continuar.'}
        </Txt>
      </View>
      <Button title="Desbloquear" icon={Fingerprint} onPress={tryUnlock} className="w-full max-w-[320px]" />
      <Button title="Sair da conta" icon={LogOut} variant="ghost" onPress={signOut} />
    </View>
  );
}
