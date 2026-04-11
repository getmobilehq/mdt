-- Epic 5: District Nurse board
-- A view over tasks assigned to role DN, enriched with patient context.
-- Access is controlled by the underlying tasks/patients RLS; the view inherits it.

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
  p.nhs_number as patient_nhs_number,
  p.board_id as patient_board_id
from tasks t
join patients p on p.id = t.patient_id
where t.assigned_role = 'DN';

comment on view dn_board_tasks is
  'District Nurse board: tasks assigned to DN role, with patient context. RLS applies via underlying tables.';
