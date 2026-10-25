export type DeviceKind = 'light' | 'ac' | 'hub' | 'other';

export type Channel = {
  code: string;
  name: string;
  room: string | null;
  hidden: boolean;
  isOn: boolean;
};

export type Device = {
  id: string;
  name: string;
  tuyaName: string;
  room: string | null;
  kind: DeviceKind;
  category: string;
  productName: string | null;
  online: boolean;
  isSub: boolean;
  powerW: number | null;
  hidden: boolean;
  sort: number;
  status: Record<string, unknown>;
  channels: Channel[];
};

export type Command = { code: string; value: unknown };

export type SpecFunction = {
  code: string;
  type: string;
  name: string | null;
  values: {
    min?: number;
    max?: number;
    scale?: number;
    step?: number;
    unit?: string;
    range?: string[];
  };
};

// Propriedade do modelo de coisa (v2), enviada pelo canal "properties"
export type ModelProperty = {
  code: string;
  access: string; // 'rw' | 'ro' | 'wr'
  type: string; // 'bool' | 'enum' | 'value' ...
  values: SpecFunction['values'];
};

export type DeviceSpec = {
  category: string;
  functions: SpecFunction[];
  status: SpecFunction[];
  model?: ModelProperty[];
};

export type CommandVia = 'standard' | 'properties';

export type Scene = { id: string; name: string; enabled: boolean; api: 'v1' | 'v2' };
export type Automation = Scene;

export type CommandSource = 'app' | 'cena' | 'atalho' | 'painel';

export type QuickAction = 'cheguei' | 'dormir' | 'sair' | 'desligar_ar';

export type Settings = {
  id: number;
  home_name: string;
  tariff_kwh: number;
  forgotten_light_hours: number;
  late_night_hour: number;
  notify_forgotten: boolean;
  notify_offline: boolean;
  offline_minutes: number;
  quick_scenes: Record<'cheguei' | 'dormir' | 'sair', string>;
};

export type DeviceRow = {
  id: string;
  tuya_name: string | null;
  custom_name: string | null;
  room: string | null;
  kind: DeviceKind;
  category: string | null;
  power_w: number | null;
  channels: Record<string, { name?: string; room?: string; hidden?: boolean }>;
  hidden: boolean;
  sort: number;
};
