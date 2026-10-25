import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useDevices } from '@/features/devices/DevicesProvider';
import type { CommandSource, Device, DeviceSpec } from '@/types';
import { acCapabilities, scaled } from './capabilities';

const specCache = new Map<string, DeviceSpec>();

export function useSpec(id: string | undefined) {
  const [spec, setSpec] = useState<DeviceSpec | null>(id ? (specCache.get(id) ?? null) : null);
  useEffect(() => {
    if (!id || specCache.has(id)) return;
    let alive = true;
    api
      .spec(id)
      .then((s) => {
        specCache.set(id, s);
        if (alive) setSpec(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);
  return spec;
}

const TEMP_DEBOUNCE_MS = 700;

// Controle do ar: leitura do estado e comandos, com temperatura alvo "debounced" para os botões + e −
export function useAc(device: Device | undefined, source: CommandSource = 'app') {
  const { command } = useDevices();
  const spec = useSpec(device?.id);
  const caps = useMemo(() => (device ? acCapabilities(device, spec) : null), [device, spec]);
  const [pendingTemp, setPendingTemp] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOn = Boolean(device && caps?.power && device.online && device.status[caps.power.code] === true);
  const target = caps?.temp ? (pendingTemp ?? scaled(device?.status[caps.temp.code], caps.temp.scale)) : null;
  const current = caps?.current ? scaled(device?.status[caps.current.code], caps.current.scale) : null;

  const send = useCallback(
    (code: string, value: unknown) => device && command(device, [{ code, value }], { source, label: device.name }),
    [device, command, source],
  );

  const setPower = (on: boolean) => caps?.power && send(caps.power.code, on);

  const nudgeTemp = (dir: 1 | -1) => {
    if (!caps?.temp || target === null) return;
    const { min, max, step, scale, code } = caps.temp;
    const factor = 10 ** scale;
    // passo de 1 grau (ou o passo mínimo do aparelho, se maior)
    const stepRaw = Math.max(step, factor);
    const raw = Math.round(target * factor) + dir * stepRaw;
    const clamped = Math.min(max, Math.max(min, raw));
    const next = clamped / factor;
    setPendingTemp(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await send(code, clamped);
      setPendingTemp(null);
    }, TEMP_DEBOUNCE_MS);
  };

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return { caps, spec, isOn, target, current, setPower, nudgeTemp, send };
}
