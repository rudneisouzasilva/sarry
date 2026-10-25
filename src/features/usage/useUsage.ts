import { useCallback, useEffect, useMemo, useState } from 'react';
import { isLightChannel } from '@/features/devices/DevicesProvider';
import { api } from '@/lib/api';
import { shortWeekday, startOfLocalDay } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Device } from '@/types';

type Interval = { device_id: string; channel: string; started_at: string; ended_at: string };

export type FeedItem = { id: string; at: string; title: string; detail: string; ok: boolean; kind: 'command' | 'state' };

type CommandRow = {
  id: number;
  target: string | null;
  commands: { code: string; value: unknown }[];
  source: string;
  ok: boolean;
  error: string | null;
  created_at: string;
};

type SampleRow = { id: number; device_id: string; channel: string; is_on: boolean; online: boolean; sampled_at: string };

const DAY = 24 * 3600_000;

function overlap(i: Interval, from: number, to: number) {
  const a = Math.max(new Date(i.started_at).getTime(), from);
  const b = Math.min(new Date(i.ended_at).getTime(), to);
  return Math.max(0, b - a);
}

const SOURCE: Record<string, string> = { app: 'pelo app', cena: 'cena', atalho: 'atalho', painel: 'painel', automacao: 'automação' };

function describe(c: { code: string; value: unknown }) {
  if (c.code === 'scene') return 'executada';
  if (typeof c.value === 'boolean') return c.value ? 'ligado' : 'desligado';
  if (/temp/.test(c.code) && typeof c.value === 'number') return `temperatura ${c.value}`;
  if (c.code === 'mode') return `modo ${c.value}`;
  return `${c.code} = ${JSON.stringify(c.value)}`;
}

export function useUsage(devices: Device[]) {
  const [intervals, setIntervals] = useState<Interval[]>([]);
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [samples, setSamples] = useState<SampleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (withSnapshot = false) => {
    setRefreshing(withSnapshot);
    try {
      // atualiza o histórico com o estado atual antes de calcular (1 chamada à Tuya)
      if (withSnapshot) await api.snapshotNow().catch(() => {});
      const now = new Date();
      const from = startOfLocalDay(new Date(now.getTime() - 6 * DAY));
      const [iv, cmd, smp] = await Promise.all([
        supabase.rpc('usage_intervals', { p_from: from.toISOString(), p_to: now.toISOString() }),
        supabase.from('command_log').select('*').order('created_at', { ascending: false }).limit(25),
        supabase
          .from('status_samples')
          .select('id, device_id, channel, is_on, online, sampled_at')
          .eq('origin', 'snapshot')
          .order('sampled_at', { ascending: false })
          .limit(25),
      ]);
      const err = iv.error ?? cmd.error ?? smp.error;
      if (err) throw new Error(err.message);
      setIntervals(iv.data as Interval[]);
      setCommands(cmd.data as CommandRow[]);
      setSamples(smp.data as SampleRow[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar histórico');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  const computed = useMemo(() => {
    const now = Date.now();
    const today = startOfLocalDay().getTime();
    const byId = new Map(devices.map((d) => [d.id, d]));
    const acIds = new Set(devices.filter((d) => d.kind === 'ac').map((d) => d.id));

    const days = Array.from({ length: 7 }, (_, i) => {
      const start = today - (6 - i) * DAY;
      const ms = intervals.filter((iv) => acIds.has(iv.device_id)).reduce((sum, iv) => sum + overlap(iv, start, start + DAY), 0);
      return { label: i === 6 ? 'hoje' : shortWeekday(new Date(start + 12 * 3600_000)), value: ms / 3600_000, highlight: i === 6 };
    });

    // custo por aparelho de ar (cada um com sua potência)
    const acKwhWeek = [...acIds].reduce((sum, id) => {
      const power = byId.get(id)?.powerW ?? 0;
      const hours = intervals.filter((iv) => iv.device_id === id).reduce((s, iv) => s + overlap(iv, today - 6 * DAY, now), 0) / 3600_000;
      return sum + (hours * power) / 1000;
    }, 0);
    const acKwhToday = [...acIds].reduce((sum, id) => {
      const power = byId.get(id)?.powerW ?? 0;
      const hours = intervals.filter((iv) => iv.device_id === id).reduce((s, iv) => s + overlap(iv, today, now), 0) / 3600_000;
      return sum + (hours * power) / 1000;
    }, 0);
    const missingPower = [...acIds].some((id) => !byId.get(id)?.powerW);

    const lightsToday = devices
      .filter((d) => !d.hidden)
      .flatMap((d) =>
        d.channels
          .filter((c) => !c.hidden && isLightChannel(d, c.code))
          .map((c) => ({
            key: `${d.id}:${c.code}`,
            name: c.name,
            room: c.room,
            isOn: d.online && c.isOn,
            ms: intervals.filter((iv) => iv.device_id === d.id && iv.channel === c.code).reduce((s, iv) => s + overlap(iv, today, now), 0),
          })),
      )
      .sort((a, b) => b.ms - a.ms);

    const nameOf = (deviceId: string, channel: string) => {
      const d = byId.get(deviceId);
      return d?.channels.find((c) => c.code === channel)?.name ?? d?.name ?? 'Dispositivo';
    };

    const feed: FeedItem[] = [
      ...commands.map((c) => ({
        id: `c${c.id}`,
        at: c.created_at,
        title: c.target ?? 'Comando',
        detail: c.ok ? `${c.commands.map(describe).join(', ')} · ${SOURCE[c.source] ?? c.source}` : `falhou: ${c.error ?? 'erro'}`,
        ok: c.ok,
        kind: 'command' as const,
      })),
      ...samples.map((s) => ({
        id: `s${s.id}`,
        at: s.sampled_at,
        title: nameOf(s.device_id, s.channel),
        detail:
          s.channel === 'online' || !s.online ? (s.online ? 'voltou a ficar online' : 'ficou offline') : s.is_on ? 'ligou' : 'desligou',
        ok: s.online,
        kind: 'state' as const,
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 30);

    const weekHours = days.reduce((s, d) => s + d.value, 0);
    return { days, weekHours, acKwhWeek, acKwhToday, missingPower, lightsToday, feed };
  }, [intervals, commands, samples, devices]);

  return { ...computed, loading, refreshing, error, reload: () => load(true) };
}
