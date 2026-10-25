// Chamadas tipadas à Edge Function "tuya". O app nunca fala direto com a Tuya.
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type {
  Automation,
  Command,
  CommandSource,
  Device,
  DeviceSpec,
  QuickAction,
  Scene,
} from '@/types';

export class ApiError extends Error {}

async function call<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('tuya', { body: { action, ...params } });
  if (error) {
    let message = 'Não foi possível falar com o servidor. Verifique sua conexão.';
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      if (body?.error) message = body.error;
    }
    throw new ApiError(message);
  }
  return data as T;
}

export const api = {
  devices: (force = false) => call<{ devices: Device[]; fetchedAt: string }>('devices.list', { force }),
  spec: (id: string) => call<DeviceSpec>('devices.spec', { id }),
  command: (id: string, commands: Command[], opts: { source?: CommandSource; target?: string } = {}) =>
    call<{ ok: true }>('devices.command', { id, commands, ...opts }),
  logs: (id: string, hours = 24) => call<unknown>('devices.logs', { id, hours }),
  scenes: (force = false) => call<{ scenes: Scene[] }>('scenes.list', { force }),
  runScene: (scene: Scene, source: CommandSource = 'app') =>
    call<{ ok: true; message: string }>('scenes.run', { id: scene.id, api: scene.api, name: scene.name, source }),
  automations: (force = false) => call<{ automations: Automation[] }>('automations.list', { force }),
  setAutomation: (a: Automation, enabled: boolean) =>
    call<{ ok: true }>('automations.set', { id: a.id, api: a.api, enabled }),
  quick: (quick: QuickAction, source: CommandSource = 'app') =>
    call<{ ok: true; message: string }>('quick.run', { quick, source }),
  diagnostics: () => call<Record<string, unknown>>('diagnostics'),
  snapshotNow: () => call<{ ok: true; changed: number }>('snapshot.now'),
};
