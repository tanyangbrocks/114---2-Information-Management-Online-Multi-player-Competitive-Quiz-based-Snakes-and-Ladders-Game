-- Snake & Ladder quiz game: run in Supabase SQL editor or via CLI.
-- Enable Realtime for these tables in Dashboard: Database > Replication.

create extension if not exists "pgcrypto";

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  host_secret text not null,
  round_count int not null check (round_count >= 1 and round_count <= 50),
  rounds_config jsonb not null,
  current_round int not null default 0,
  phase text not null default 'lobby'
    check (phase in ('lobby', 'question', 'reveal', 'skill', 'settle', 'between_rounds', 'finished')),
  question_epoch bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  name text not null,
  position int not null default 1 check (position >= 1 and position <= 100),
  stars int not null default 0 check (stars >= 0),
  cards jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.skill_actions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  round int not null,
  player_id uuid not null references public.players (id) on delete cascade,
  action_type text not null,
  target_player_id uuid references public.players (id) on delete cascade,
  consumed_cards jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists players_game_id_idx on public.players (game_id);
create index if not exists games_invite_code_idx on public.games (invite_code);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists games_set_updated_at on public.games;
create trigger games_set_updated_at
before update on public.games
for each row execute procedure public.set_updated_at();

drop trigger if exists players_set_updated_at on public.players;
create trigger players_set_updated_at
before update on public.players
for each row execute procedure public.set_updated_at();

alter table public.games enable row level security;
alter table public.players enable row level security;

drop policy if exists "games_select" on public.games;
drop policy if exists "games_insert" on public.games;
drop policy if exists "games_update" on public.games;
drop policy if exists "players_select" on public.players;
drop policy if exists "players_insert" on public.players;
drop policy if exists "players_update" on public.players;
drop policy if exists "players_delete" on public.players;

-- Demo-friendly policies: anon can read/write games and players.
-- Tighten for production (authenticated host, player-scoped updates).
create policy "games_select" on public.games for select using (true);
create policy "games_insert" on public.games for insert with check (true);
create policy "games_update" on public.games for update using (true);

create policy "players_select" on public.players for select using (true);
create policy "players_insert" on public.players for insert with check (true);
create policy "players_update" on public.players for update using (true);
create policy "players_delete" on public.players for delete using (true);

grant usage on schema public to anon, authenticated;
grant all on public.games to anon, authenticated;
grant all on public.players to anon, authenticated;
grant all on public.skill_actions to anon, authenticated;
