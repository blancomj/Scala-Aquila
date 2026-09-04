-- ═══════════════════════════════════════════════════════════════════════
--  fn_resetear_copropiedad — captura en git de una función que ya existía
--  en desarrollo sin migración (encontrada vía `supabase db lint`, que
--  reportó supabase_migrations.schema_migrations con una fila huérfana
--  `20260928100000 resetear_copropiedad` sin archivo local — reparada como
--  'reverted' en esa misma sesión para no bloquear pushes futuros).
--
--  Qué hace: utilidad de desarrollo/QA para dejar una copropiedad como
--  recién creada — borra TODA su data transaccional (cargos, liquidaciones,
--  pagos, novedades, periodos, auditoría, cartera, incluso inmuebles y
--  terceros) para poder re-sembrarla desde cero, sin tener que crear un
--  tenant nuevo. Exige rol administrador en esa copropiedad y deja un
--  registro en audit_log con el conteo de filas borradas por tabla.
--
--  Sobre el lint: `supabase db lint` reporta
--  `relation "public.{tabla1,tabla2,...}" does not exist` sobre esta
--  función. Verificado en vivo (RPC real contra un tenant de prueba,
--  rol administrador, vía PostgREST) que el DELETE por tabla funciona
--  correctamente — el propio bucle `foreach ... in array` con
--  `execute format('delete from public.%I where tenant_id = $1', v_tabla)`
--  ya usa %I (identificador seguro) por elemento, no concatena el arreglo
--  completo. El "error" es un falso positivo conocido de plpgsql_check con
--  foreach-in-array + EXECUTE dinámico: en su análisis estático evalúa
--  v_tabla como si contuviera la representación en texto de TODO el
--  arreglo, no un elemento. Este archivo reescribe el bucle como un for
--  indexado (semánticamente idéntico) porque ese patrón sí lo entiende el
--  analizador — si el lint vuelve a reportarlo, es ruido conocido, no un
--  bug real (ya probado en runtime).
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_resetear_copropiedad(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tablas text[] := array[
    'concepto_test_cases', 'fundamento_propuesta', 'cartera_corridas_diarias',
    'acciones_cobranza_acuses', 'costas_judiciales', 'caso_juridico_actuaciones',
    'documentos_legal_holds', 'prescripcion_actos_interruptivos', 'promesas_pago',
    'novedad_cuotas', 'novedades', 'pago_aplicaciones', 'conciliacion_propuesta',
    'extracto_linea', 'extracto_bancario', 'acciones_cobranza_envios', 'acciones_cobranza',
    'documentos', 'intenciones_pago', 'pagos', 'acuerdo_pago_cuotas', 'acuerdos_pago',
    'cargos', 'liquidacion_lineas', 'liquidaciones', 'presupuesto_ejecucion',
    'presupuesto_rubros', 'presupuestos', 'fondo_movimientos', 'periodos',
    'certificaciones_deuda', 'casos_juridicos', 'estados_cuenta_generados',
    'posiciones_cartera_snapshot', 'eventos_cartera', 'cartera_etapas', 'coeficientes',
    'coeficiente_sets', 'inmueble_transferencias', 'inmueble_persona_rol',
    'tenant_tercero_rol', 'terceros_contacto_procedencia', 'auditoria_muestras',
    'auditoria_evidencias', 'auditoria_plan_items', 'auditoria_riesgo_residual_historial',
    'auditoria_normativa', 'auditoria_acciones', 'auditoria_ejecuciones',
    'auditoria_procedimientos', 'auditoria_hallazgos', 'auditoria_controles',
    'auditoria_planes', 'auditoria_riesgos', 'auditoria_engagements',
    'fundamento_normativo', 'inmuebles', 'terceros'
  ];
  v_tabla     text;
  v_borrados  int;
  v_resumen   jsonb := '{}'::jsonb;
  i           int;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para resetear una copropiedad';
  end if;

  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'TENANT_NO_ENCONTRADO: no existe la copropiedad %', p_tenant_id;
  end if;

  if not public.has_role(p_tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol administrador en esta copropiedad';
  end if;

  perform set_config('aquila.reset_context', 'true', true);
  set constraints all deferred;

  for i in 1 .. array_length(v_tablas, 1) loop
    v_tabla := v_tablas[i];
    execute format('delete from public.%I where tenant_id = $1', v_tabla) using p_tenant_id;
    get diagnostics v_borrados = row_count;
    v_resumen := v_resumen || jsonb_build_object(v_tabla, v_borrados);
  end loop;

  -- fondos es configuración (se preserva) pero su saldo se deriva de
  -- fondo_movimientos, que ya se borró arriba — sin este reset quedaría
  -- un saldo fantasma sin movimientos que lo respalden.
  update public.fondos set saldo_actual = 0 where tenant_id = p_tenant_id;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    (select auth.uid()),
    'tenant.reseteado',
    'tenant',
    p_tenant_id,
    v_resumen
  );

  return v_resumen;
end;
$$;

revoke all on function public.fn_resetear_copropiedad(uuid) from public;
grant execute on function public.fn_resetear_copropiedad(uuid) to authenticated;

comment on function public.fn_resetear_copropiedad(uuid) is
  'Utilidad de desarrollo/QA: borra toda la data transaccional de una copropiedad (incluidos '
  'inmuebles y terceros) para re-sembrarla desde cero, sin crear un tenant nuevo. Exige rol '
  'administrador en esa copropiedad; registra el conteo de filas borradas por tabla en audit_log '
  '(tenant.reseteado). No preservar filas fuera de la lista de tablas es intencional: el objetivo '
  'es dejar la copropiedad como recién creada.';
