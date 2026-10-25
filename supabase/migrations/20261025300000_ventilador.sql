-- Novo tipo de aparelho: interruptor de ventilador de teto (categoria Tuya fskg)
alter table public.devices drop constraint if exists devices_kind_check;
alter table public.devices add constraint devices_kind_check check (kind in ('light', 'ac', 'fan', 'hub', 'other'));
update public.devices set kind = 'fan' where category in ('fskg', 'fs') and kind = 'other';
