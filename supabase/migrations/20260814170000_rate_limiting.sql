-- ═══════════════════════════════════════════════════════════════════════
--  E7 · Rate limiting (Postgres, sin servicio externo)
--  Propietario: PROMPT_MAESTRO_FASE1.md §13 E7, §15.1 GAP-12
--
--  El plan pedía Upstash Redis (§13, §17 anexo). Decisión de esta sesión
--  (GAP-12, §15.1): sin cuenta de Upstash creada todavía, se implementa
--  con una tabla + función Postgres — mismo contrato de resultado
--  (bloquear tras N intentos en una ventana), servido por la misma base
--  de datos que ya está siempre disponible. Revertible sin coste: si más
--  adelante se crea la cuenta de Upstash, esta función se reemplaza sin
--  tocar las Edge Functions (siguen llamando `check_rate_limit`).
--
--  Cada bloqueo registra 'security.rate_limited' (ya está en el catálogo
--  de eventos auditables, §11.1) — atómico dentro de la misma función,
--  para no depender de que la Edge Function recuerde auditarlo aparte.
-- ═══════════════════════════════════════════════════════════════════════

create table public.rate_limit_hits (
  id           bigint generated always as identity primary key,
  bucket       text not null,
  created_at   timestamptz not null default now()
);

alter table public.rate_limit_hits enable row level security;
alter table public.rate_limit_hits force row level security;

-- Sin política de SELECT/INSERT/UPDATE/DELETE para authenticated/anon: la
-- única vía de escritura es check_rate_limit() (SECURITY DEFINER). Nadie
-- necesita leer esta tabla directamente desde el cliente.
create index rate_limit_hits_bucket_idx on public.rate_limit_hits (bucket, created_at);

comment on table public.rate_limit_hits is
  'Ventana deslizante de intentos por bucket (p.ej. "invite_user:<uid>"). Solo se escribe '
  'vía check_rate_limit() — sin política RLS de escritura para ningún rol de cliente.';

create function public.check_rate_limit(p_bucket text, p_max_hits int, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.rate_limit_hits
  where bucket = p_bucket
    and created_at > now() - p_window;

  if v_count >= p_max_hits then
    insert into public.audit_log (actor_id, action, entity_type, metadata)
    values (
      (select auth.uid()),
      'security.rate_limited',
      'rate_limit',
      jsonb_build_object('bucket', p_bucket, 'max_hits', p_max_hits)
    );
    return false;
  end if;

  insert into public.rate_limit_hits (bucket) values (p_bucket);
  return true;
end;
$$;

revoke execute on function public.check_rate_limit(text, int, interval) from public, anon;
grant execute on function public.check_rate_limit(text, int, interval) to authenticated;

comment on function public.check_rate_limit is
  'true = permitido (y registra el intento). false = bloqueado (y audita '
  'security.rate_limited, sin registrar un intento nuevo — el bloqueo no cuenta como hit).';
