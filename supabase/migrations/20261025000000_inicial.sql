-- Sarry: esquema inicial
-- Tudo é da "casa" (um único lar). Quem pode ver e controlar a casa está em public.members.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Moradores
-- ---------------------------------------------------------------------------
create table public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.members where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Ajustes da casa (linha única)
-- ---------------------------------------------------------------------------
create table public.settings (
  id int primary key default 1 check (id = 1),
  home_name text not null default 'Minha casa',
  tariff_kwh numeric(8, 4) not null default 0.85,
  forgotten_light_hours int not null default 3 check (forgotten_light_hours between 1 and 24),
  late_night_hour int not null default 1 check (late_night_hour between 0 and 6),
  notify_forgotten boolean not null default true,
  notify_offline boolean not null default true,
  offline_minutes int not null default 15 check (offline_minutes between 5 and 240),
  -- nome da cena na Tuya para cada atalho rápido
  quick_scenes jsonb not null default '{"cheguei": "Cheguei", "dormir": "Dormir", "sair": "Sair"}',
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- ---------------------------------------------------------------------------
-- Dispositivos (sincronizados da Tuya; nomes/cômodos/potência editáveis)
-- ---------------------------------------------------------------------------
create table public.devices (
  id text primary key,                      -- id do dispositivo na Tuya
  tuya_name text,
  custom_name text,
  room text,
  kind text not null default 'other' check (kind in ('light', 'ac', 'hub', 'other')),
  category text,
  product_name text,
  power_w int check (power_w is null or power_w between 0 and 10000),
  -- canais (teclas) de interruptores multi-tecla: {"switch_1": {"name": "Sala", "room": "Sala", "hidden": false}}
  channels jsonb not null default '{}',
  is_sub boolean not null default false,    -- dispositivo Zigbee atrás do hub
  online boolean,
  sort int not null default 0,
  hidden boolean not null default false,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Histórico
-- ---------------------------------------------------------------------------
create table public.command_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  device_id text,
  target text,                               -- nome amigável no momento do comando
  commands jsonb not null default '[]',
  source text not null default 'app' check (source in ('app', 'cena', 'automacao', 'atalho', 'painel')),
  ok boolean not null,
  error text,
  created_at timestamptz not null default now()
);
create index command_log_created_idx on public.command_log (created_at desc);

-- Uma linha por MUDANÇA de estado de um canal (tecla, ar ligado, hub online)
create table public.status_samples (
  id bigint generated always as identity primary key,
  device_id text not null,
  channel text not null,                     -- 'switch_1', 'switch', 'power', 'online'
  is_on boolean not null,
  online boolean not null default true,
  data jsonb,                                -- extras (ex.: temperatura do ar)
  origin text not null default 'snapshot' check (origin in ('snapshot', 'comando')),
  sampled_at timestamptz not null default now()
);
create index status_samples_device_idx on public.status_samples (device_id, channel, sampled_at desc);
create index status_samples_time_idx on public.status_samples (sampled_at desc);

create or replace view public.latest_samples
with (security_invoker = true) as
select distinct on (device_id, channel) *
from public.status_samples
order by device_id, channel, sampled_at desc;

-- Intervalos em que cada canal ficou ligado, recortados para [p_from, p_to)
create or replace function public.usage_intervals(p_from timestamptz, p_to timestamptz)
returns table (device_id text, channel text, started_at timestamptz, ended_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    -- estado vigente no início do período
    select distinct on (device_id, channel) device_id, channel, is_on, sampled_at
    from public.status_samples
    where sampled_at < p_from and channel <> 'online'
    order by device_id, channel, sampled_at desc
  ),
  dentro as (
    select device_id, channel, is_on, sampled_at
    from public.status_samples
    where sampled_at >= p_from and sampled_at < p_to and channel <> 'online'
  ),
  s as (
    select
      device_id,
      channel,
      is_on,
      sampled_at,
      lead(sampled_at) over (partition by device_id, channel order by sampled_at) as next_at
    from (select * from base union all select * from dentro) t
  )
  select
    device_id,
    channel,
    greatest(sampled_at, p_from) as started_at,
    least(coalesce(next_at, now()), p_to) as ended_at
  from s
  where is_on
    and least(coalesce(next_at, now()), p_to) > greatest(sampled_at, p_from);
$$;

-- ---------------------------------------------------------------------------
-- Push (Fase 4)
-- ---------------------------------------------------------------------------
create table public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tabelas internas (só Edge Functions, via service role)
-- ---------------------------------------------------------------------------
create table public.tuya_token (
  id int primary key default 1 check (id = 1),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table public.tuya_cache (
  key text primary key,
  value jsonb not null,
  expires_at timestamptz not null
);

create table public.alert_state (
  key text primary key,                      -- ex.: 'forgotten:<device>:<canal>'
  sent_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.members enable row level security;
alter table public.settings enable row level security;
alter table public.devices enable row level security;
alter table public.command_log enable row level security;
alter table public.status_samples enable row level security;
alter table public.push_tokens enable row level security;
alter table public.tuya_token enable row level security;
alter table public.tuya_cache enable row level security;
alter table public.alert_state enable row level security;

create policy "membro vê a si mesmo" on public.members
  for select to authenticated using (user_id = auth.uid());

create policy "membros leem ajustes" on public.settings
  for select to authenticated using (public.is_member());
create policy "membros editam ajustes" on public.settings
  for update to authenticated using (public.is_member()) with check (public.is_member());

create policy "membros leem dispositivos" on public.devices
  for select to authenticated using (public.is_member());
create policy "membros editam dispositivos" on public.devices
  for update to authenticated using (public.is_member()) with check (public.is_member());

create policy "membros leem comandos" on public.command_log
  for select to authenticated using (public.is_member());

create policy "membros leem amostras" on public.status_samples
  for select to authenticated using (public.is_member());

create policy "membro gerencia seus tokens" on public.push_tokens
  for all to authenticated
  using (user_id = auth.uid() and public.is_member())
  with check (user_id = auth.uid() and public.is_member());

-- tuya_token, tuya_cache e alert_state: sem políticas = só a service role acessa.

-- Colunas que o app pode editar em devices (o resto vem da Tuya)
revoke update on public.devices from authenticated;
grant update (custom_name, room, kind, power_w, channels, sort, hidden) on public.devices to authenticated;

-- ---------------------------------------------------------------------------
-- Agendamentos (pg_cron)
-- O snapshot lê a URL do projeto e o segredo do Vault; veja docs/CONFIGURACAO.md.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'sarry-snapshot',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sarry_project_url') || '/functions/v1/snapshot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sarry_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

select cron.schedule(
  'sarry-limpeza',
  '15 4 * * *',
  $$
  delete from public.status_samples where sampled_at < now() - interval '180 days';
  delete from public.command_log where created_at < now() - interval '180 days';
  delete from public.tuya_cache where expires_at < now() - interval '1 day';
  $$
);
