-- Aparelhos de ar "só frio" (sem modo Calor), como o Elgin Eco Inverter II da casa.
-- O módulo Wi-Fi da Tuya anuncia o modo "hot" mesmo nesses modelos, então o app esconde pela configuração.
alter table public.devices add column if not exists cooling_only boolean not null default false;

grant update (cooling_only) on public.devices to authenticated;

-- O ar já cadastrado na casa é só frio
update public.devices set cooling_only = true where kind = 'ac';
