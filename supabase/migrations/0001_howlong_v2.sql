create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 3 and 20),
  discriminator text not null check (discriminator ~ '^[A-Z0-9]{4}$'),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id text primary key,
  category text not null,
  prompt text not null,
  hint text not null,
  answer_ms bigint not null check (answer_ms > 0),
  accepted_min_ms bigint not null check (accepted_min_ms > 0),
  accepted_max_ms bigint not null check (accepted_max_ms >= accepted_min_ms),
  display_answer text not null,
  fact text not null,
  source_label text not null,
  source_url text not null,
  source_accessed_at date not null,
  difficulty smallint not null check (difficulty between 1 and 3),
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_sets (
  daily_date date primary key,
  question_ids text[] not null check (cardinality(question_ids) = 5),
  content_version integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('daily', 'practice')),
  daily_date date,
  question_ids text[] not null check (cardinality(question_ids) between 1 and 10),
  current_position smallint not null default 0 check (current_position >= 0),
  total_score integer not null default 0 check (total_score >= 0),
  total_error numeric not null default 0 check (total_error >= 0),
  result_pattern text[] not null default '{}',
  status text not null default 'playing' check (status in ('playing', 'complete', 'abandoned')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint daily_date_only_for_daily check ((mode = 'daily' and daily_date is not null) or (mode = 'practice' and daily_date is null))
);

create unique index if not exists attempts_one_daily_per_user on public.attempts(user_id, daily_date) where mode = 'daily';
create index if not exists attempts_leaderboard_index on public.attempts(daily_date, status, total_score desc, total_error asc, completed_at asc);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null references public.questions(id),
  position smallint not null check (position >= 0),
  guess_ms bigint not null check (guess_ms > 0),
  points integer not null check (points between 0 and 1000),
  error_log numeric not null check (error_log >= 0),
  answered_at timestamptz not null default now(),
  unique (attempt_id, position),
  unique (attempt_id, question_id)
);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute procedure public.touch_updated_at();
drop trigger if exists questions_touch_updated_at on public.questions;
create trigger questions_touch_updated_at before update on public.questions for each row execute procedure public.touch_updated_at();

create or replace view public.daily_leaderboard as
select
  a.daily_date,
  p.display_name,
  p.discriminator,
  a.total_score as score,
  a.total_error,
  a.completed_at,
  a.result_pattern,
  row_number() over (partition by a.daily_date order by a.total_score desc, a.total_error asc, a.completed_at asc) as rank
from public.attempts a
join public.profiles p on p.id = a.user_id
where a.mode = 'daily' and a.status = 'complete' and p.is_public = true;

alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.daily_sets enable row level security;
alter table public.attempts enable row level security;
alter table public.answers enable row level security;

revoke all on public.questions from anon, authenticated;
revoke all on public.daily_sets from anon, authenticated;
revoke all on public.attempts from anon, authenticated;
revoke all on public.answers from anon, authenticated;

drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

grant select, update on public.profiles to authenticated;
revoke all on public.daily_leaderboard from anon, authenticated;

comment on table public.questions is 'Answer fields are never exposed through the browser; game-api is the only reader.';
comment on table public.answers is 'Server-calculated answer records. Direct browser writes are intentionally revoked.';
