-- Epic 3: patients
-- NHS number is sensitive PII: stored in nhs_number (10 digits), never in URLs/logs.
-- Application must always redact on logs; audit metadata must never include it.

do $$ begin
  create type mdt_patient_source as enum ('GP','DN','SW');
exception when duplicate_object then null; end $$;

do $$ begin
  create type mdt_board_column as enum
    ('TO_DISCUSS','IN_PROGRESS','FOLLOW_UP','COMPLETED');
exception when duplicate_object then null; end $$;

create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id) on delete cascade,
  board_id uuid not null references mdt_boards(id) on delete cascade,
  nhs_number text not null,
  full_name text not null,
  dob date not null,
  summary text,
  source mdt_patient_source not null,
  column_id mdt_board_column not null default 'TO_DISCUSS',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nhs_number_format check (nhs_number ~ '^[0-9]{10}$')
);
create index if not exists patients_board_id_column_idx
  on patients(board_id, column_id);
create index if not exists patients_practice_id_idx
  on patients(practice_id);

create or replace function mdt_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists patients_touch_updated_at on patients;
create trigger patients_touch_updated_at before update on patients
  for each row execute function mdt_touch_updated_at();

alter table patients enable row level security;

drop policy if exists patients_member_read on patients;
create policy patients_member_read on patients
  for select using (mdt_is_practice_member(practice_id));

drop policy if exists patients_member_insert on patients;
create policy patients_member_insert on patients
  for insert with check (mdt_is_practice_member(practice_id));

drop policy if exists patients_member_update on patients;
create policy patients_member_update on patients
  for update using (mdt_is_practice_member(practice_id));
