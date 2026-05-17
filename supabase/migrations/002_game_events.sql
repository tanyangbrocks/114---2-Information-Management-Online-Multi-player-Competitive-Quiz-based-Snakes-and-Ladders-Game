-- Migration for Battle Report System (Game Events)

create table if not exists public.game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  round int not null,
  message text not null,
  type text not null default 'info',
  created_at timestamptz not null default now()
);

create index if not exists game_events_game_id_idx on public.game_events (game_id);

alter table public.game_events enable row level security;

drop policy if exists "game_events_select" on public.game_events;
drop policy if exists "game_events_insert" on public.game_events;
drop policy if exists "game_events_delete" on public.game_events;

create policy "game_events_select" on public.game_events for select using (true);
create policy "game_events_insert" on public.game_events for insert with check (true);
create policy "game_events_delete" on public.game_events for delete using (true);

grant all on public.game_events to anon, authenticated;
