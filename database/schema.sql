-- Execute este arquivo no SQL Editor do seu projeto Supabase.
-- As contas são gerenciadas pelo Supabase Auth; esta tabela guarda apenas partidas.

create table if not exists public.games (
    id uuid primary key default gen_random_uuid(),
    code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
    created_by uuid not null references auth.users (id) on delete cascade,
    white_player uuid not null references auth.users (id) on delete cascade,
    black_player uuid references auth.users (id) on delete cascade,
    fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    version integer not null default 0 check (version >= 0),
    status text not null default 'waiting'
        check (status in ('waiting', 'active', 'finished')),
    winner_color text check (winner_color in ('white', 'black')),
    last_move jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (black_player is null or black_player <> white_player),
    check (
        (status = 'waiting' and black_player is null)
        or (status in ('active', 'finished') and black_player is not null)
    )
);

create index if not exists games_players_idx
    on public.games (white_player, black_player, updated_at desc);

alter table public.games enable row level security;

revoke all on public.games from anon, authenticated;
grant select on public.games to authenticated;

drop policy if exists "Players can read their own games" on public.games;
create policy "Players can read their own games"
    on public.games
    for select
    to authenticated
    using (auth.uid() = white_player or auth.uid() = black_player);

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'games'
    ) then
        alter publication supabase_realtime add table public.games;
    end if;
end
$$;
