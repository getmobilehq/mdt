-- Epic 8: transcripts and AI-extracted actions
-- Flow: session audio → Whisper transcript → Claude action extraction →
-- clinician review → confirmed actions become tasks.

create table if not exists transcripts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  practice_id uuid not null references practices(id) on delete cascade,
  full_text text not null,
  language text,
  duration_s int,
  processed_at timestamptz not null default now()
);
create index if not exists transcripts_session_id_idx on transcripts(session_id);

create or replace function mdt_transcripts_sync_practice()
returns trigger language plpgsql as $$
begin
  select practice_id into new.practice_id from sessions where id = new.session_id;
  if new.practice_id is null then
    raise exception 'session % not found', new.session_id;
  end if;
  return new;
end;
$$;
drop trigger if exists transcripts_sync_practice on transcripts;
create trigger transcripts_sync_practice before insert on transcripts
  for each row execute function mdt_transcripts_sync_practice();

create table if not exists actions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  practice_id uuid not null references practices(id) on delete cascade,
  description text not null,
  owner_role mdt_user_role not null,
  deadline date,
  confirmed boolean not null default false,
  created_by_ai boolean not null default true,
  human_edited boolean not null default false,
  confirmed_task_id uuid references tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists actions_session_id_idx on actions(session_id);
create index if not exists actions_patient_id_idx on actions(patient_id);

drop trigger if exists actions_touch_updated_at on actions;
create trigger actions_touch_updated_at before update on actions
  for each row execute function mdt_touch_updated_at();

create or replace function mdt_actions_sync_practice()
returns trigger language plpgsql as $$
begin
  select practice_id into new.practice_id from patients where id = new.patient_id;
  if new.practice_id is null then
    raise exception 'patient % not found', new.patient_id;
  end if;
  return new;
end;
$$;
drop trigger if exists actions_sync_practice on actions;
create trigger actions_sync_practice before insert on actions
  for each row execute function mdt_actions_sync_practice();

alter table transcripts enable row level security;
alter table actions enable row level security;

drop policy if exists transcripts_member_read on transcripts;
create policy transcripts_member_read on transcripts
  for select using (mdt_is_practice_member(practice_id));
-- Writes only via service role (worker).
revoke insert, update, delete on transcripts from anon, authenticated;

drop policy if exists actions_member_read on actions;
create policy actions_member_read on actions
  for select using (mdt_is_practice_member(practice_id));

drop policy if exists actions_member_update on actions;
create policy actions_member_update on actions
  for update using (mdt_is_practice_member(practice_id));
-- Inserts come from the worker (service role); clinicians confirm/edit existing rows only.
revoke insert, delete on actions from anon, authenticated;
