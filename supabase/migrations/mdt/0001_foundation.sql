-- CareLoop MDT foundation: organisations, practices, profiles, audit log.
-- RLS enabled on every table. Audit log is append-only.

create extension if not exists "pgcrypto";

do $$ begin
  create type mdt_user_role as enum ('GP','DN','ADMIN','SOCIAL_WORKER','PCN_ADMIN');
exception when duplicate_object then null; end $$;

create table if not exists organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists practices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete restrict,
  name text not null,
  address text,
  created_at timestamptz not null default now()
);
create index if not exists practices_org_id_idx on practices(org_id);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  default_role mdt_user_role not null default 'GP',
  created_at timestamptz not null default now()
);

create table if not exists practice_users (
  user_id uuid not null references profiles(id) on delete cascade,
  practice_id uuid not null references practices(id) on delete cascade,
  role mdt_user_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, practice_id)
);
create index if not exists practice_users_practice_id_idx on practice_users(practice_id);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  role mdt_user_role,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  practice_id uuid references practices(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_practice_id_created_at_idx
  on audit_log(practice_id, created_at desc);
create index if not exists audit_log_user_id_created_at_idx
  on audit_log(user_id, created_at desc);

-- Helper: is the current auth user a member of this practice?
create or replace function mdt_is_practice_member(p_practice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from practice_users
    where user_id = auth.uid() and practice_id = p_practice_id
  );
$$;

alter table organisations enable row level security;
alter table practices enable row level security;
alter table profiles enable row level security;
alter table practice_users enable row level security;
alter table audit_log enable row level security;

drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles
  for select using (id = auth.uid());
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update using (id = auth.uid());

drop policy if exists practice_users_self_read on practice_users;
create policy practice_users_self_read on practice_users
  for select using (user_id = auth.uid());

drop policy if exists practices_member_read on practices;
create policy practices_member_read on practices
  for select using (mdt_is_practice_member(id));

drop policy if exists organisations_member_read on organisations;
create policy organisations_member_read on organisations
  for select using (
    exists (
      select 1 from practices p
      join practice_users pu on pu.practice_id = p.id
      where p.org_id = organisations.id and pu.user_id = auth.uid()
    )
  );

drop policy if exists audit_log_admin_read on audit_log;
create policy audit_log_admin_read on audit_log
  for select using (
    practice_id is not null and exists (
      select 1 from practice_users pu
      where pu.user_id = auth.uid()
        and pu.practice_id = audit_log.practice_id
        and pu.role = 'ADMIN'
    )
  );

-- Writes to audit_log only via service role (no insert policy for anon/authenticated).
revoke insert, update, delete on audit_log from anon, authenticated;

-- Append-only: block updates/deletes even if a future policy allows them.
create or replace function mdt_audit_log_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;
drop trigger if exists audit_log_no_update on audit_log;
create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function mdt_audit_log_immutable();

-- Auto-create profile row on signup.
create or replace function mdt_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function mdt_handle_new_user();
