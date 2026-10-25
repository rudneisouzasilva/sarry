import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useDevices } from '@/features/devices/DevicesProvider';
import type { CommandSource, CommandVia, Device, DeviceSpec } from '@/types';
import { acCapabilities, scaled, shadowCodes } from './capabilities';

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

// Controle do ar: leitura do estado e comandos, com temperatura alvo "debounced" para os botões + e −.
// Recursos fora do conjunto padrão (ex.: ventilação do ar AUX) são lidos do "shadow" do v2.
export function useAc(device: Device | undefined, source: CommandSource = 'app', opts: { withShadow?: boolean } = {}) {
  const { command } = useDevices();
  const spec = useSpec(device?.id);
  const caps = useMemo(() => (device ? acCapabilities(device, spec) : null), [device, spec]);
  const [shadow, setShadow] = useState<Record<string, unknown>>({});
  const [pendingTemp, setPendingTemp] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const extraCodes = caps ? shadowCodes(caps).join(',') : '';
  const loadShadow = useCallback(async () => {
    if (!device || !extraCodes) return;
    try {
      const values = await api.shadow(device.id, extraCodes.split(','));
      setShadow((s) => ({ ...s, ...values }));
    } catch {
      // sem o shadow, esses controles só aparecem sem seleção
    }
  }, [device?.id, extraCodes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (opts.withShadow) loadShadow();
  }, [opts.withShadow, loadShadow]);

  const value = (code: string) => (code in (device?.status ?? {}) ? device?.status[code] : shadow[code]);

  const isOn = Boolean(device && caps?.power && device.online && value(caps.power.code) === true);
  const target = caps?.temp ? (pendingTemp ?? scaled(value(caps.temp.code), caps.temp.scale)) : null;
  const current = caps?.current ? scaled(value(caps.current.code), caps.current.scale) : null;

  const send = useCallback(
    async (code: string, v: unknown, via: CommandVia = 'standard') => {
      if (!device) return false;
      const prev = shadow[code];
      if (via === 'properties') setShadow((s) => ({ ...s, [code]: v }));
      const ok = await command(device, [{ code, value: v }], { source, label: device.name, via });
      if (!ok && via === 'properties') setShadow((s) => ({ ...s, [code]: prev }));
      return ok;
    },
    [device, command, source, shadow],
  );

  const setPower = (on: boolean) => caps?.power && send(caps.power.code, on, caps.power.via);

  // agenda o envio da temperatura (em graus); delay 0 envia já, como ao soltar o dial
  const setTemp = (deg: number, delay = 0) => {
    if (!caps?.temp) return;
    const { min, max, scale, code, via } = caps.temp;
    const factor = 10 ** scale;
    const clamped = Math.min(max, Math.max(min, Math.round(deg * factor)));
    setPendingTemp(clamped / factor);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await send(code, clamped, via);
      setPendingTemp(null);
    }, delay);
  };

  // só mostra o valor enquanto o dedo arrasta o dial, sem enviar
  const previewTemp = (deg: number) => {
    if (timer.current) clearTimeout(timer.current);
    setPendingTemp(deg);
  };

  const nudgeTemp = (dir: 1 | -1) => {
    if (!caps?.temp || target === null) return;
    const { step, scale } = caps.temp;
    const factor = 10 ** scale;
    // passo de 1 grau (ou o passo mínimo do aparelho, se maior)
    setTemp(target + (dir * Math.max(step, factor)) / factor, TEMP_DEBOUNCE_MS);
  };

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return { caps, spec, isOn, target, current, setPower, nudgeTemp, setTemp, previewTemp, send, value };
}
