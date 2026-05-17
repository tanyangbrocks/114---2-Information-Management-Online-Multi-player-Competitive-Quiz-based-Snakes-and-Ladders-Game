-- Add hide_host_qr column to games table
alter table public.games add column if not exists hide_host_qr boolean not null default false;
