import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Automation, Scene } from '@/types';

export function useScenes() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    try {
      const [s, a] = await Promise.all([api.scenes(force), api.automations(force)]);
      setScenes(s.scenes);
      setAutomations(a.automations);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar cenas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  return { scenes, automations, setAutomations, loading, refreshing, error, load };
}
