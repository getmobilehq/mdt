-- Epic 10: audit polish
-- - Helper view that joins audit_log with profile names for admin UI
--   (RLS from audit_log still applies via security_invoker)
-- - Retention helper: purge audit rows older than 7 years (NHS retention baseline).
--   Run manually or from a scheduled Celery task with the service role.

create or replace view audit_log_with_actor
with (security_invoker = on)
as
select
  a.id,
  a.user_id,
  a.role,
  a.action,
  a.resource_type,
  a.resource_id,
  a.practice_id,
  a.metadata,
  a.created_at,
  p.full_name as actor_name,
  p.email as actor_email
from audit_log a
left join profiles p on p.id = a.user_id;

comment on view audit_log_with_actor is
  'Audit log joined with actor profile info. RLS inherited from audit_log (admin read).';

-- Retention helper. Safe to run as service role; it only drops rows with
-- created_at older than the cutoff. NHS Records Management Code of Practice
-- defaults to 8 years for clinical records; audit is kept 7 years by default.
create or replace function mdt_purge_old_audit(retain_years int default 7)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count int;
begin
  -- Temporarily disable the append-only trigger for this controlled purge.
  alter table audit_log disable trigger audit_log_no_update;
  delete from audit_log
    where created_at < now() - (retain_years || ' years')::interval;
  get diagnostics deleted_count = row_count;
  alter table audit_log enable trigger audit_log_no_update;
  return deleted_count;
end;
$$;
revoke all on function mdt_purge_old_audit(int) from public, anon, authenticated;
