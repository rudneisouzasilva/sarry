// Traduz a especificação (data points) do ar-condicionado em controles.
// Só mostramos o que o aparelho realmente suporta.
import type { Device, DeviceSpec, SpecFunction } from '@/types';

export type Option = { value: string; label: string };

export type AcCapabilities = {
  power?: { code: string };
  temp?: { code: string; min: number; max: number; step: number; scale: number; unit: string };
  current?: { code: string; scale: number };
  mode?: { code: string; options: Option[] };
  fan?: { code: string; options: Option[] };
  extras: { code: string; label: string }[];
};

const POWER = ['switch', 'power', 'Power'];
const TEMP = ['temp_set', 'temperature', 'set_temp', 'T'];
const CURRENT = ['temp_current', 'current_temp', 'temp_indoor', 'temperature_current'];
const MODE = ['mode', 'work_mode', 'M'];
const FAN = ['windspeed', 'fan_speed_enum', 'fan_speed', 'wind_speed', 'level', 'F'];

const EXTRAS: { label: string; codes: string[] }[] = [
  { label: 'Swing', codes: ['switch_vertical', 'swing', 'switch_swing', 'swing_vertical', 'windshake'] },
  { label: 'Swing horizontal', codes: ['switch_horizontal', 'swing_horizontal'] },
  { label: 'Sono', codes: ['sleep', 'switch_sleep', 'sleep_mode'] },
  { label: 'Eco', codes: ['eco', 'switch_eco', 'energy_saving', 'eco_mode'] },
  { label: 'Turbo', codes: ['strong', 'turbo', 'switch_turbo', 'powerful', 'switch_strong'] },
];

const MODE_LABELS: [RegExp, string, number][] = [
  [/^(cold|cool|cooling|refrigeration)$/i, 'Frio', 0],
  [/^(hot|heat|heating)$/i, 'Calor', 1],
  [/^(wind|fan|fan_only|ventilation|air_supply|blow)$/i, 'Ventilar', 2],
  [/^(auto|smart|automatic)$/i, 'Auto', 3],
  [/^(wet|dry|dehumidification|dehumidify)$/i, 'Seco', 4],
];

const FAN_LABELS: [RegExp, string, number][] = [
  [/^(auto|automatic)$/i, 'Auto', 0],
  [/^(low|1|level_1|quiet|mute)$/i, 'Baixa', 1],
  [/^(mid|middle|medium|2|level_2)$/i, 'Média', 2],
  [/^(high|3|level_3)$/i, 'Alta', 3],
  [/^(strong|turbo|4|level_4)$/i, 'Turbo', 4],
];

function label(value: string, table: [RegExp, string, number][]): [string, number] {
  const hit = table.find(([re]) => re.test(value));
  return hit ? [hit[1], hit[2]] : [value, 99];
}

function enumOptions(f: SpecFunction, table: [RegExp, string, number][]): Option[] {
  return (f.values.range ?? [])
    .map((v) => {
      const [l, order] = label(v, table);
      return { value: v, label: l, order };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ value, label: l }) => ({ value, label: l }));
}

function find(list: SpecFunction[], codes: string[], type?: string) {
  for (const code of codes) {
    const f = list.find((x) => x.code === code && (!type || x.type.toLowerCase() === type));
    if (f) return f;
  }
  return undefined;
}

export function acCapabilities(device: Device, spec: DeviceSpec | null): AcCapabilities {
  const functions = spec?.functions ?? [];
  const statusDefs = spec?.status ?? [];
  const all = [...functions, ...statusDefs];

  // Sem especificação ainda: deduz pelo status atual com valores comuns
  if (!spec) {
    const s = device.status;
    return {
      power: POWER.find((c) => typeof s[c] === 'boolean') ? { code: POWER.find((c) => typeof s[c] === 'boolean')! } : undefined,
      temp: 'temp_set' in s ? { code: 'temp_set', min: 16, max: 30, step: 1, scale: 0, unit: '°C' } : undefined,
      current: 'temp_current' in s ? { code: 'temp_current', scale: 0 } : undefined,
      extras: [],
    };
  }

  const power = find(functions, POWER, 'boolean');
  const temp = find(functions, TEMP, 'integer');
  const current = find(statusDefs, CURRENT) ?? find(all, CURRENT);
  const mode = find(functions, MODE, 'enum');
  const fan = find(functions, FAN, 'enum');

  return {
    power: power ? { code: power.code } : undefined,
    temp: temp
      ? {
          code: temp.code,
          min: temp.values.min ?? 16,
          max: temp.values.max ?? 30,
          step: temp.values.step || 1,
          scale: temp.values.scale ?? 0,
          unit: temp.values.unit?.includes('F') ? '°F' : '°C',
        }
      : undefined,
    current: current ? { code: current.code, scale: current.values.scale ?? 0 } : undefined,
    mode: mode ? { code: mode.code, options: enumOptions(mode, MODE_LABELS) } : undefined,
    fan: fan ? { code: fan.code, options: enumOptions(fan, FAN_LABELS) } : undefined,
    extras: EXTRAS.flatMap(({ label: l, codes }) => {
      const f = find(functions, codes, 'boolean');
      return f ? [{ code: f.code, label: l }] : [];
    }),
  };
}

export function scaled(raw: unknown, scale: number) {
  return typeof raw === 'number' ? raw / 10 ** scale : null;
}

export function modeLabel(caps: AcCapabilities, value: unknown) {
  return caps.mode?.options.find((o) => o.value === value)?.label ?? (typeof value === 'string' ? value : null);
}
