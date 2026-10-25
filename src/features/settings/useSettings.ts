import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Settings } from '@/types';

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
    if (err) setError(err.message);
    else setSettings(data ? { ...data, tariff_kwh: Number(data.tariff_kwh) } : null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    const { error: err } = await supabase
      .from('settings')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (err) throw new Error(err.message);
  }, []);

  return { settings, error, reload: load, save };
}
