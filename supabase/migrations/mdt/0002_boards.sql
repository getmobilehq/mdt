-- Epic 2: MDT boards (one per board_type per practice)
-- Patients and tasks (epics 3+) will reference mdt_boards.id.

do $$ begin
  create type mdt_board_type as enum (
    'FRAILTY',
    'COMMUNITY',
    'PSYCHIATRY',
    'CHILD_ENQUIRY',
    'CHILD_CONFERENCE',
    'ADULT_SAFEGUARDING'
  );
exception when duplicate_object then null; end $$;

create table if not exists mdt_boards (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id) on delete cascade,
  board_type mdt_board_type not null,
  name text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (practice_id, board_type)
);
create index if not exists mdt_boards_practice_id_idx
  on mdt_boards(practice_id);

alter table mdt_boards enable row level security;

drop policy if exists mdt_boards_member_read on mdt_boards;
create policy mdt_boards_member_read on mdt_boards
  for select using (mdt_is_practice_member(practice_id));

drop policy if exists mdt_boards_admin_insert on mdt_boards;
create policy mdt_boards_admin_insert on mdt_boards
  for insert with check (
    exists (
      select 1 from practice_users pu
      where pu.user_id = auth.uid()
        and pu.practice_id = mdt_boards.practice_id
        and pu.role in ('ADMIN','GP')
    )
  );

drop policy if exists mdt_boards_admin_update on mdt_boards;
create policy mdt_boards_admin_update on mdt_boards
  for update using (
    exists (
      select 1 from practice_users pu
      where pu.user_id = auth.uid()
        and pu.practice_id = mdt_boards.practice_id
        and pu.role in ('ADMIN','GP')
    )
  );
