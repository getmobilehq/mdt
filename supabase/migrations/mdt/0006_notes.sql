-- Epic 6: notes
-- Two kinds: shared MDT notes (visible to all practice members) and
-- private notes (visible only to the creator — no exceptions).

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  practice_id uuid not null references practices(id) on delete cascade,
  content text not null,
  is_private boolean not null default false,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_patient_id_created_at_idx
  on notes(patient_id, created_at desc);

drop trigger if exists notes_touch_updated_at on notes;
create trigger notes_touch_updated_at before update on notes
  for each row execute function mdt_touch_updated_at();

-- Sync practice_id from parent patient.
create or replace function mdt_notes_sync_practice()
returns trigger language plpgsql as $$
begin
  select practice_id into new.practice_id from patients where id = new.patient_id;
  if new.practice_id is null then
    raise exception 'patient % not found', new.patient_id;
  end if;
  return new;
end;
$$;
drop trigger if exists notes_sync_practice on notes;
create trigger notes_sync_practice before insert on notes
  for each row execute function mdt_notes_sync_practice();

alter table notes enable row level security;

-- Read: shared notes to all practice members; private notes to creator only.
drop policy if exists notes_read on notes;
create policy notes_read on notes
  for select using (
    (is_private = false and mdt_is_practice_member(practice_id))
    or (is_private = true and created_by = auth.uid())
  );

-- Insert: practice member, created_by must equal auth.uid().
drop policy if exists notes_insert on notes;
create policy notes_insert on notes
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from patients p
      where p.id = notes.patient_id
        and mdt_is_practice_member(p.practice_id)
    )
  );

-- Update/delete: only the creator can change their own note.
drop policy if exists notes_update_own on notes;
create policy notes_update_own on notes
  for update using (created_by = auth.uid());

drop policy if exists notes_delete_own on notes;
create policy notes_delete_own on notes
  for delete using (created_by = auth.uid());
