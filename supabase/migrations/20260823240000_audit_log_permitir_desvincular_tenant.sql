-- ═══════════════════════════════════════════════════════════════════════
--  Fix real: borrar un tenant con actividad en audit_log era imposible
--
--  audit_log.tenant_id references tenants(id) on delete set null — el
--  diseño de retención (24 meses, SEC-14) exige que la auditoría
--  sobreviva al tenant que la generó. Pero esa misma acción de la FK es,
--  mecánicamente, un UPDATE sobre audit_log, y forbid_mutation() ("sin
--  UPDATE ni DELETE para ningún rol") la rechazaba también a ELLA —
--  nadie podía borrar un tenant que hubiera generado auditoría, ni en
--  dev ni en producción.
--
--  Encontrado al limpiar los fixtures de
--  tests/rls/presupuesto-cuenta-arbol.test.ts: decenas de tenants de
--  prueba huérfanos de años de tests anteriores (mpf-*, lp-otro, ...)
--  confirman que eliminarTenant() nunca había podido completar su
--  DELETE — no es un problema nuevo de esta migración, ya estaba ahí.
--
--  Fix: audit_log gana su propia versión del guard (forbid_mutation()
--  NO se toca — sigue igual para fondo_movimientos/liquidacion_lineas)
--  que deja pasar EXCLUSIVAMENTE el UPDATE que pone tenant_id a NULL sin
--  tocar ninguna otra columna — exactamente lo que hace la FK, nada más.
--  Cualquier otro intento de UPDATE, o cualquier DELETE, sigue rechazado
--  igual que antes.
-- ═══════════════════════════════════════════════════════════════════════

create function public.forbid_mutation_audit_log()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.tenant_id is null and old.tenant_id is not null
     and new.id = old.id
     and new.actor_id is not distinct from old.actor_id
     and new.action = old.action
     and new.entity_type is not distinct from old.entity_type
     and new.entity_id is not distinct from old.entity_id
     and new.metadata = old.metadata
     and new.ip is not distinct from old.ip
     and new.user_agent is not distinct from old.user_agent
     and new.created_at = old.created_at
  then
    return new;
  end if;

  raise exception 'APPEND_ONLY: % no admite % (SEC-14)', tg_table_name, tg_op;
end;
$$;

comment on function public.forbid_mutation_audit_log() is
  'SEC-14 append-only para audit_log, con UNA excepción: deja pasar el UPDATE que la FK '
  'audit_log_tenant_id_fkey (on delete set null) dispara al borrar un tenant — pone tenant_id '
  'a NULL sin tocar ninguna otra columna. Sin esto, ningún tenant con actividad en audit_log '
  'podía borrarse (ni en dev ni en producción), porque el forbid_mutation() genérico también '
  'bloqueaba esa acción de la propia FK. Cualquier otro UPDATE, o cualquier DELETE, sigue '
  'rechazado igual que con forbid_mutation() (que no cambia, sigue usándose tal cual en '
  'fondo_movimientos/liquidacion_lineas).';

drop trigger audit_log_append_only on public.audit_log;
create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.forbid_mutation_audit_log();
