-- Copy student password logins from GoTrue audit logs (last 10 days)
-- into client_events. Skip admins. Idempotent on audit row id.

insert into public.client_events (
  id, user_id, created_at, kind, name, path, detail, release, ua
)
select
  a.id,
  actor.id,
  a.created_at,
  'login',
  'sign_in',
  '',
  jsonb_build_object('source', 'auth'),
  '',
  ''
from auth.audit_log_entries a
join public.profiles actor
  on actor.id = (a.payload->>'actor_id')::uuid
where a.payload->>'action' = 'login'
  and a.created_at > now() - interval '10 days'
  and actor.role is distinct from 'admin'
  and not exists (
    select 1 from public.client_events e where e.id = a.id
  );
