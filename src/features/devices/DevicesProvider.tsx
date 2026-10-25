// Estado dos dispositivos: carrega ao abrir, ao voltar para o app e logo após cada comando.
// Sem polling, para poupar a cota da Tuya.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useToast } from '@/components/Toast';
import { useSession } from '@/features/auth/SessionProvider';
import type { Command, CommandSource, CommandVia, Device } from '@/types';

type DevicesState = {
  devices: Device[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  fetchedAt: string | null;
  refresh: (force?: boolean, silent?: boolean) => Promise<void>;
  command: (
    device: Device,
    commands: Command[],
    opts?: { source?: CommandSource; label?: string; via?: CommandVia },
  ) => Promise<boolean>;
};

const Ctx = createContext<DevicesState | null>(null);

export function useDevices() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDevices fora do DevicesProvider');
  return ctx;
}

export function useDevice(id: string | undefined) {
  return useDevices().devices.find((d) => d.id === id);
}

function applyCommands(device: Device, commands: Command[]): Device {
  const status = { ...device.status };
  for (const c of commands) status[c.code] = c.value;
  return {
    ...device,
    status,
    channels: device.channels.map((ch) =>
      typeof status[ch.code] === 'boolean' ? { ...ch, isOn: status[ch.code] as boolean } : ch,
    ),
  };
}

const REFRESH_AFTER_COMMAND_MS = 2500; // dá tempo de a Tuya refletir o comando, sem "piscar" o estado antigo
const MIN_REFRESH_GAP_MS = 10_000;

export function DevicesProvider({ children }: { children: ReactNode }) {
  const { session, locked } = useSession();
  const toast = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const lastFetch = useRef(0);
  const pending = useRef(0); // comandos em andamento: não sobrescrever o estado otimista
  const followUp = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async (force = false, silent = false) => {
    if (!force && Date.now() - lastFetch.current < MIN_REFRESH_GAP_MS) return;
    lastFetch.current = Date.now();
    if (force && !silent) setRefreshing(true);
    try {
      const res = await api.devices(force);
      if (pending.current === 0) setDevices(res.devices);
      setFetchedAt(res.fetchedAt);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dispositivos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!session || locked) return;
    refresh(false);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh(false));
    return () => sub.remove();
  }, [session, locked, refresh]);

  const command = useCallback<DevicesState['command']>(
    async (device, commands, opts = {}) => {
      const before = devices.find((d) => d.id === device.id) ?? device;
      setDevices((list) => list.map((d) => (d.id === device.id ? applyCommands(d, commands) : d)));
      pending.current += 1;
      try {
        await api.command(device.id, commands, {
          source: opts.source ?? 'app',
          target: opts.label ?? device.name,
          via: opts.via,
        });
        return true;
      } catch (err) {
        // reverte o estado otimista e avisa
        setDevices((list) => list.map((d) => (d.id === device.id ? before : d)));
        haptic.error();
        toast(err instanceof Error ? err.message : 'O comando falhou', 'error');
        return false;
      } finally {
        pending.current -= 1;
        if (followUp.current) clearTimeout(followUp.current);
        followUp.current = setTimeout(() => refresh(true, true), REFRESH_AFTER_COMMAND_MS);
      }
    },
    [devices, refresh, toast],
  );

  return (
    <Ctx.Provider value={{ devices, loading, refreshing, error, fetchedAt, refresh, command }}>{children}</Ctx.Provider>
  );
}

// Lista "plana" de luzes: cada tecla de um interruptor multi-tecla vira uma luz
export type Light = { device: Device; code: string; name: string; room: string | null; isOn: boolean };

// Canais que contam como luz: teclas dos interruptores e a luz do ventilador de teto
export function isLightChannel(device: Device, code: string) {
  return device.kind === 'light' || (device.kind === 'fan' && code === 'switch_led');
}

export function lightsOf(devices: Device[]): Light[] {
  return devices
    .filter((d) => !d.hidden)
    .flatMap((d) =>
      d.channels
        .filter((c) => !c.hidden && isLightChannel(d, c.code))
        .map((c) => ({ device: d, code: c.code, name: c.name, room: c.room, isOn: d.online && c.isOn })),
    );
}
