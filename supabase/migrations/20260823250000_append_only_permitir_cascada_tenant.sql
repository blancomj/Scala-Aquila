-- ═══════════════════════════════════════════════════════════════════════
--  Fix real: borrar un tenant con actividad en CUALQUIER tabla append-only
--  con tenant_id ON DELETE CASCADE era imposible — mismo bug que
--  audit_log (20260823240000), pero la variante CASCADE en vez de SET
--  NULL, encontrada al reproducir la limpieza real de tests con la suite
--  ya existente (tests/rls/motor-presupuestal-financiacion.test.ts, que
--  sí toca fondo_movimientos).
--
--  Auditadas las 12 tablas protegidas por forbid_mutation() (antes de
--  20260823240000):
--    • audit_log — tenant_id ON DELETE SET NULL — ya resuelto aparte.
--    • tasas_referencia — GLOBAL, sin tenant_id (documentado en su propia
--      migración) — no le aplica este problema, no se toca.
--    • Las otras 10 — TODAS con tenant_id ... on delete cascade:
--      liquidacion_lineas, fondo_movimientos, cargos, pagos,
--      pago_aplicaciones, concepto_versiones, documentos (renombrada de
--      documentos_inmueble en 20260822130000, trigger ya se llama
--      documentos_append_only), posiciones_cartera_snapshot,
--      caso_juridico_actuaciones, eventos_cartera.
--
--  Fix: un único guard compartido (mismo criterio de reutilización que ya
--  usaba forbid_mutation() para las 12) que deja pasar EXCLUSIVAMENTE un
--  DELETE cuando el tenant_id de la fila ya no existe en `tenants` — es
--  decir, exactamente la situación de "esta fila se está borrando porque
--  la FK de tenants la está arrastrando en cascada", nunca un DELETE
--  arbitrario mientras el tenant sigue vivo. UPDATE sigue prohibido
--  siempre, sin excepción, en las 10 tablas — a diferencia de audit_log,
--  ninguna de estas necesita sobrevivir al tenant (no hay retención
--  documentada tipo SEC-14/24-meses para ellas), así que CASCADE (borrar
--  del todo) es el comportamiento correcto, no SET NULL.
--
--  security definer: la comprobación "el tenant ya no existe" debe ser
--  cierta sin importar la visibilidad RLS del rol que dispara el
--  trigger — si dependiera de RLS, un rol sin membership en ese tenant
--  vería "no existe" aunque el tenant siga vivo, permitiendo un DELETE
--  indebido.
-- ═══════════════════════════════════════════════════════════════════════

create function public.forbid_mutation_salvo_tenant_borrado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.tenants where id = old.tenant_id) then
    return old;
  end if;

  raise exception 'APPEND_ONLY: % no admite % (SEC-14)', tg_table_name, tg_op;
end;
$$;

comment on function public.forbid_mutation_salvo_tenant_borrado() is
  'Igual que forbid_mutation() (sin UPDATE ni DELETE para ningún rol), con UNA excepción: deja '
  'pasar el DELETE que la FK tenant_id ... on delete cascade dispara al borrar el tenant dueño '
  '— nunca un DELETE mientras el tenant sigue existiendo. Compartida por las 10 tablas '
  'append-only con tenant_id CASCADE (ver cabecera de 20260823250000); audit_log usa su propia '
  'versión (forbid_mutation_audit_log, SET NULL en vez de CASCADE) y tasas_referencia no tiene '
  'tenant_id, así que ninguna de las dos usa esta función.';

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'liquidacion_lineas', 'fondo_movimientos', 'cargos', 'pagos', 'pago_aplicaciones',
    'concepto_versiones', 'documentos', 'posiciones_cartera_snapshot',
    'caso_juridico_actuaciones', 'eventos_cartera'
  ]
  loop
    execute format('drop trigger %I_append_only on public.%I', v_tabla, v_tabla);
    execute format(
      'create trigger %I_append_only before update or delete on public.%I '
      'for each row execute function public.forbid_mutation_salvo_tenant_borrado()',
      v_tabla, v_tabla
    );
  end loop;
end $$;
