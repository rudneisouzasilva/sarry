import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { authenticate, biometricsEnabled } from '@/lib/biometrics';
import { supabase } from '@/lib/supabase';
import { clearLanConfig } from '@/lib/lan';

type SessionState = {
  session: Session | null;
  loading: boolean;
  locked: boolean;
  unlock: () => Promise<boolean>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState>({
  session: null,
  loading: true,
  locked: false,
  unlock: async () => false,
  signOut: async () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

// Tempo em segundo plano depois do qual a biometria é pedida de novo
const RELOCK_MS = 5 * 60_000;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const backgroundAt = useRef<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session && (await biometricsEnabled())) setLocked(true);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'background') backgroundAt.current = Date.now();
      if (state === 'active' && backgroundAt.current && Date.now() - backgroundAt.current > RELOCK_MS) {
        backgroundAt.current = null;
        if (session && (await biometricsEnabled())) setLocked(true);
      }
    });
    return () => sub.remove();
  }, [session]);

  const unlock = async () => {
    const ok = await authenticate();
    if (ok) setLocked(false);
    return ok;
  };

  const signOut = async () => {
    await clearLanConfig();
    await supabase.auth.signOut();
    setLocked(false);
  };

  return (
    <SessionContext.Provider value={{ session, loading, locked, unlock, signOut }}>{children}</SessionContext.Provider>
  );
}
