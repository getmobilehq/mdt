-- Epic 4: task system
-- Every task belongs to a patient, which inherits its practice_id for RLS.

do $$ begin
  create type mdt_task_status as enum
    ('OPEN','IN_PROGRESS','DONE','CANCELLED');
exception when duplicate_object then null; end $$;

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  practice_id uuid not null references practices(id) on delete cascade,
  description text not null,
  assigned_role mdt_user_role not null,
  assigned_to_user_id uuid references profiles(id) on delete set null,
  status mdt_task_status not null default 'OPEN',
  deadline date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_patient_id_idx on tasks(patient_id);
create index if not exists tasks_practice_id_status_idx
  on tasks(practice_id, status);
create index if not exists tasks_assigned_role_status_idx
  on tasks(assigned_role, status);

drop trigger if exists tasks_touch_updated_at on tasks;
create trigger tasks_touch_updated_at before update on tasks
  for each row execute function mdt_touch_updated_at();

-- Keep practice_id consistent with the parent patient.
create or replace function mdt_tasks_sync_practice()
returns trigger language plpgsql as $$
begin
  select practice_id into new.practice_id from patients where id = new.patient_id;
  if new.practice_id is null then
    raise exception 'patient % not found', new.patient_id;
  end if;
  return new;
end;
$$;
drop trigger if exists tasks_sync_practice on tasks;
create trigger tasks_sync_practice before insert on tasks
  for each row execute function mdt_tasks_sync_practice();

alter table tasks enable row level security;

drop policy if exists tasks_member_read on tasks;
create policy tasks_member_read on tasks
  for select using (mdt_is_practice_member(practice_id));

drop policy if exists tasks_member_insert on tasks;
create policy tasks_member_insert on tasks
  for insert with check (
    exists (
      select 1 from patients p
      where p.id = tasks.patient_id
        and mdt_is_practice_member(p.practice_id)
    )
  );

drop policy if exists tasks_member_update on tasks;
create policy tasks_member_update on tasks
  for update using (mdt_is_practice_member(practice_id));
