// Traduz a especificação (data points) do ar-condicionado em controles.
// Só mostramos o que o aparelho realmente suporta. Primeiro o conjunto padrão de comandos;
// o que só existir no modelo de coisa (v2) é enviado pelo canal "properties".
import type { CommandVia, Device, DeviceSpec, ModelProperty, SpecFunction } from '@/types';

export type Option = { value: string; label: string };

type Control = { code: string; via: CommandVia };

export type AcCapabilities = {
  power?: Control;
  temp?: Control & { min: number; max: number; step: number; scale: number; unit: string };
  current?: { code: string; scale: number };
  mode?: Control & { options: Option[] };
  fan?: Control & { options: Option[] };
  extras: (Control & { label: string })[];
};

const POWER = ['switch', 'power', 'Power'];
const TEMP = ['temp_set', 'temperature', 'set_temp', 'T'];
const CURRENT = ['temp_current', 'current_temp', 'temp_indoor', 'temperature_current'];
const MODE = ['mode', 'work_mode', 'M'];
const FAN = ['windspeed', 'fan_speed_enum', 'fan_speed', 'wind_speed', 'level', 'F'];

const EXTRAS: { label: string; codes: string[] }[] = [
  { label: 'Swing vertical', codes: ['switch_vertical', 'up_down_wind', 'swing', 'switch_swing', 'swing_vertical', 'windshake'] },
  { label: 'Swing horizontal', codes: ['switch_horizontal', 'swing_horizontal'] },
  { label: 'Sono', codes: ['sleep', 'switch_sleep', 'sleep_mode'] },
  { label: 'Eco', codes: ['mode_eco', 'eco', 'switch_eco', 'energy_saving', 'eco_mode'] },
  { label: 'Turbo', codes: ['strong', 'turbo', 'switch_turbo', 'powerful', 'switch_strong'] },
  { label: 'Luz do painel', codes: ['light'] },
];

const MODE_LABELS: [RegExp, string, number][] = [
  [/^(cold|cool|cooling|refrigeration)$/i, 'Frio', 0],
  [/^(hot|heat|heating)$/i, 'Calor', 1],
  [/^(wind|fan|fan_only|ventilation|air_supply|blow)$/i, 'Ventilar', 2],
  [/^(auto|smart|automatic)$/i, 'Auto', 3],
  [/^(wet|dry|dehumidification|dehumidify)$/i, 'Seco', 4],
];

// Velocidades mostradas no app; as intermediárias (mid_low, mid_high, mute) ficam de fora para simplificar
const FAN_LABELS: [RegExp, string, number][] = [
  [/^(auto|automatic)$/i, 'Auto', 0],
  [/^(low|1|level_1)$/i, 'Baixa', 1],
  [/^(mid|middle|medium|2|level_2)$/i, 'Média', 2],
  [/^(high|3|level_3)$/i, 'Alta', 3],
  [/^(strong|strength|turbo|4|level_4)$/i, 'Turbo', 4],
];

function enumOptions(range: string[] | undefined, table: [RegExp, string, number][], onlyKnown = false): Option[] {
  return (range ?? [])
    .map((value) => {
      const hit = table.find(([re]) => re.test(value));
      return { value, label: hit ? hit[1] : value, order: hit ? hit[2] : 99 };
    })
    .filter((o) => !onlyKnown || o.order < 99)
    .sort((a, b) => a.order - b.order)
    .map(({ value, label }) => ({ value, label }));
}

type Def = { code: string; type: string; values: SpecFunction['values']; via: CommandVia };

const TYPE_ALIASES: Record<string, string> = { bool: 'boolean', value: 'integer' };

function normType(type: string) {
  const t = type.toLowerCase();
  return TYPE_ALIASES[t] ?? t;
}

// Procura primeiro nos comandos padrão; depois nas propriedades graváveis do modelo v2
function find(functions: SpecFunction[], model: ModelProperty[], codes: string[], type: string): Def | undefined {
  for (const code of codes) {
    const f = functions.find((x) => x.code === code && normType(x.type) === type);
    if (f) return { code: f.code, type, values: f.values, via: 'standard' };
  }
  for (const code of codes) {
    const p = model.find((x) => x.code === code && x.access.includes('w') && normType(x.type) === type);
    if (p) return { code: p.code, type, values: p.values, via: 'properties' };
  }
  return undefined;
}

export function acCapabilities(device: Device, spec: DeviceSpec | null): AcCapabilities {
  // Sem especificação ainda: deduz pelo status atual com valores comuns
  if (!spec) {
    const s = device.status;
    const power = POWER.find((c) => typeof s[c] === 'boolean');
    return {
      power: power ? { code: power, via: 'standard' } : undefined,
      temp: 'temp_set' in s ? { code: 'temp_set', via: 'standard', min: 16, max: 30, step: 1, scale: 0, unit: '°C' } : undefined,
      current: 'temp_current' in s ? { code: 'temp_current', scale: 0 } : undefined,
      extras: [],
    };
  }

  const functions = spec.functions ?? [];
  const model = spec.model ?? [];
  const statusDefs = [...(spec.status ?? []), ...functions];

  const power = find(functions, model, POWER, 'boolean');
  const temp = find(functions, model, TEMP, 'integer');
  const currentDef = CURRENT.map((c) => statusDefs.find((x) => x.code === c)).find(Boolean);
  const mode = find(functions, model, MODE, 'enum');
  const fan = find(functions, model, FAN, 'enum');

  let tempCap: AcCapabilities['temp'];
  if (temp) {
    const scale = temp.values.scale ?? 0;
    const factor = 10 ** scale;
    const unitText = temp.values.unit ?? '';
    // Unidade "℃/F" = faixa compartilhada com Fahrenheit (ex.: 16–90). Em Celsius, limitamos a 16–32.
    const fahrenheit = /F/.test(unitText) && !/℃|C/.test(unitText);
    let min = temp.values.min ?? 16 * factor;
    let max = temp.values.max ?? 30 * factor;
    if (!fahrenheit && max / factor > 40) max = 32 * factor;
    if (!fahrenheit && min / factor < 10) min = 16 * factor;
    tempCap = {
      code: temp.code,
      via: temp.via,
      min,
      max,
      step: temp.values.step || factor,
      scale,
      unit: fahrenheit ? '°F' : '°C',
    };
  }

  return {
    power: power ? { code: power.code, via: power.via } : undefined,
    temp: tempCap,
    current: currentDef ? { code: currentDef.code, scale: currentDef.values.scale ?? 0 } : undefined,
    mode: mode
      ? {
          code: mode.code,
          via: mode.via,
          // ar "só frio": o módulo anuncia "hot", mas o aparelho não aquece
          options: enumOptions(mode.values.range, MODE_LABELS).filter((o) => !(device.coolingOnly && o.label === 'Calor')),
        }
      : undefined,
    fan: fan ? { code: fan.code, via: fan.via, options: enumOptions(fan.values.range, FAN_LABELS, true) } : undefined,
    extras: EXTRAS.flatMap(({ label, codes }) => {
      const f = find(functions, model, codes, 'boolean');
      return f ? [{ code: f.code, via: f.via, label }] : [];
    }),
  };
}

// Códigos que o app precisa ler pelo "shadow" do v2, porque não vêm no status padrão
export function shadowCodes(caps: AcCapabilities) {
  const controls: (Control | undefined)[] = [caps.fan, ...caps.extras];
  return controls.filter((c): c is Control => c?.via === 'properties').map((c) => c.code);
}

export function scaled(raw: unknown, scale: number) {
  return typeof raw === 'number' ? raw / 10 ** scale : null;
}

export function modeLabel(caps: AcCapabilities, value: unknown) {
  return caps.mode?.options.find((o) => o.value === value)?.label ?? (typeof value === 'string' ? value : null);
}
