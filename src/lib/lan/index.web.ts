// Na web não há acesso à rede local: tudo segue pela nuvem
import type { Command } from '@/types';

export type LanDevice = {
  id: string;
  localKey: string;
  nodeId?: string;
  gatewayId?: string;
  dps: Record<string, number>;
};

export const lanAvailable = false;
export const syncLanConfig = async (_force = false) => {};
export const clearLanConfig = async () => {};
export const scanLan = async () => {};
export const watchLan = () => () => {};
export type LocalResult = { ok: true; ms: number } | { ok: false; ms: number; reason: string };
export const sendLocal = async (_id: string, _commands: Command[]): Promise<LocalResult | null> => null;
