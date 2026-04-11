-- Epic 7: meeting sessions
-- A session is a single MDT meeting: bound to a board, timestamped,
-- with a snapshot of the patients discussed and their order.

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id) on delete cascade,
  board_id uuid not null references mdt_boards(id) on delete cascade,
  started_by uuid references profiles(id) on delete set null,
  daily_room_url text,
  recording_s3_key text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists sessions_board_id_started_at_idx
  on sessions(board_id, started_at desc);

create table if not exists session_patients (
  session_id uuid not null references sessions(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  position int not null,
  discussed_at timestamptz,
  primary key (session_id, patient_id),
  unique (session_id, position)
);
create index if not exists session_patients_session_idx on session_patients(session_id);

alter table sessions enable row level security;
alter table session_patients enable row level security;

drop policy if exists sessions_member_read on sessions;
create policy sessions_member_read on sessions
  for select using (mdt_is_practice_member(practice_id));

drop policy if exists sessions_member_insert on sessions;
create policy sessions_member_insert on sessions
  for insert with check (mdt_is_practice_member(practice_id));

drop policy if exists sessions_member_update on sessions;
create policy sessions_member_update on sessions
  for update using (mdt_is_practice_member(practice_id));

drop policy if exists session_patients_read on session_patients;
create policy session_patients_read on session_patients
  for select using (
    exists (
      select 1 from sessions s
      where s.id = session_patients.session_id
        and mdt_is_practice_member(s.practice_id)
    )
  );

drop policy if exists session_patients_write on session_patients;
create policy session_patients_write on session_patients
  for all using (
    exists (
      select 1 from sessions s
      where s.id = session_patients.session_id
        and mdt_is_practice_member(s.practice_id)
    )
  )
  with check (
    exists (
      select 1 from sessions s
      where s.id = session_patients.session_id
        and mdt_is_practice_member(s.practice_id)
    )
  );
