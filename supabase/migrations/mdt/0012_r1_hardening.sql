-- R1 hardening:
--  1) Redact NHS numbers in dn_board_tasks view (return nhs_last4 only)
--  2) Add profiles.phone for follow-up automation recipient resolution

-- 1) DN board view — replace raw NHS number with last-4 redaction.
drop view if exists dn_board_tasks;
create or replace view dn_board_tasks
with (security_invoker = on)
as
select
  t.id,
  t.patient_id,
  t.practice_id,
  t.description,
  t.assigned_to_user_id,
  t.status,
  t.deadline,
  t.created_at,
  t.updated_at,
  p.full_name as patient_name,
  right(p.nhs_number, 4) as patient_nhs_last4,
  p.board_id as patient_board_id
from tasks t
join patients p on p.id = t.patient_id
where t.assigned_role = 'DN';

comment on view dn_board_tasks is
  'District Nurse board: tasks assigned to DN role, with patient context. '
  'NHS numbers are redacted to last 4 digits. RLS applies via underlying tables.';

-- 2) Phone number on profiles. E.164 format, validated by application.
alter table profiles
  add column if not exists phone text;

comment on column profiles.phone is
  'E.164 phone number for clinician follow-up notifications (WhatsApp/SMS via Twilio).';
