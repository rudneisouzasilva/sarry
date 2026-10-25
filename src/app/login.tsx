import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { House, LogIn } from 'lucide-react-native';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { ErrorBanner } from '@/components/States';
import { Txt } from '@/components/Txt';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme/colors';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (err) setError(err.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : err.message);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-bg">
      <View className="w-full max-w-[420px] flex-1 justify-center self-center px-6">
        <View className="mb-10 items-center gap-3">
          <View className="h-16 w-16 items-center justify-center rounded-card border border-line bg-card">
            <House size={30} color={colors.amber} />
          </View>
          <Txt variant="display" className="text-4xl">
            Sarry
          </Txt>
          <Txt variant="caption">Sua casa, do seu jeito.</Txt>
        </View>
        {error ? <ErrorBanner message={error} /> : null}
        <View className="gap-4">
          <Field
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="voce@exemplo.com"
          />
          <Field
            label="Senha"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            onSubmitEditing={submit}
            placeholder="Sua senha"
          />
          <Button title="Entrar" icon={LogIn} loading={loading} disabled={!email || !password} onPress={submit} className="mt-2" />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
