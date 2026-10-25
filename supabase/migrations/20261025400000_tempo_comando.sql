-- Tempo de cada etapa do comando no servidor, para investigar atrasos
alter table public.command_log add column if not exists timing jsonb;
