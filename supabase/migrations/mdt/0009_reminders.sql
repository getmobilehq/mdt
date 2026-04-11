-- Epic 9: follow-up automation
-- reminders: audit trail for follow-up messages sent for incomplete tasks.
-- One row per (task_id, reminder_kind, period) — enforces idempotency so
-- the nightly Celery Beat job never sends a duplicate.

do $$ begin
  create type mdt_reminder_kind as enum ('DUE_SOON','OVERDUE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type mdt_reminder_channel as enum ('WHATSAPP','SMS','EMAIL');
exception when duplicate_object then null; end $$;

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  practice_id uuid not null references practices(id) on delete cascade,
  kind mdt_reminder_kind not null,
  channel mdt_reminder_channel not null,
  period_key text not null,
  recipient_user_id uuid references profiles(id) on delete set null,
  sent_at timestamptz not null default now(),
  provider_ref text,
  unique (task_id, kind, period_key)
);
create index if not exists reminders_practice_id_sent_at_idx
  on reminders(practice_id, sent_at desc);

alter table reminders enable row level security;

drop policy if exists reminders_admin_read on reminders;
create policy reminders_admin_read on reminders
  for select using (
    exists (
      select 1 from practice_users pu
      where pu.user_id = auth.uid()
        and pu.practice_id = reminders.practice_id
        and pu.role = 'ADMIN'
    )
  );

-- Writes only from the worker via service role.
revoke insert, update, delete on reminders from anon, authenticated;
