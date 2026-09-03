-- ═══════════════════════════════════════════════════════════════════════
--  D-39 · Zona de peligro — resetear una copropiedad a su estado recién
--  creada, sin tocar configuración ni usuarios
--
--  ═══ QUÉ BORRA Y QUÉ NO ═══
--
--  Borra únicamente datos OPERATIVOS/transaccionales (inmuebles, terceros,
--  coeficientes, presupuestos anuales, periodos, liquidaciones, cargos,
--  pagos, cartera, jurídico, conciliación, novedades, auditoría,
--  documentos). Preserva TODA la configuración ya hecha — conceptos,
--  plan contable, puentes presupuesto↔contable, agrupaciones, zonas
--  comunes, plantillas de email/SMS, pasarela de pago, políticas
--  financieras/cartera, cuentas bancarias, fuentes de financiación,
--  numeración de documentos — y a los USUARIOS de la copropiedad
--  (memberships, invitations quedan intactas). `audit_log` nunca se toca
--  (trazabilidad, igual que sobrevive incluso al borrado total del
--  tenant). `recibos_caja` tampoco: es un comprobante fiscal con
--  protección absoluta (forbid_mutation(), igual que audit_log) — ni
--  borrar la copropiedad completa lo permite hoy, así que este reset,
--  menos drástico que eso, tampoco lo toca.
--
--  El fondo de imprevistos (`fondos`) es configuración que el usuario
--  define una vez — se preserva, pero su `saldo_actual` es derivado de
--  `fondo_movimientos` (que sí se borra), así que se resetea a 0 al final.
--
--  ═══ EL BLOQUEO REAL: APPEND-ONLY ═══
--
--  15 de estas tablas están protegidas por forbid_mutation_salvo_tenant_
--  borrado() (20260823250000): rechaza cualquier DELETE mientras el
--  tenant siga existiendo — solo se abre cuando la FK tenant_id ON DELETE
--  CASCADE la arrastra al borrar el tenant. Un reset "in place" (la
--  copropiedad sigue existiendo) nunca cumple esa condición tal cual.
--
--  Se añade una excepción ESTRECHA, mismo patrón ya usado para la purga de
--  audit_log (20260814190000_purga_audit_log.sql): una función SECURITY
--  DEFINER marca un flag de sesión local a la transacción
--  (aquila.reset_context) antes de borrar; el guard deja pasar el DELETE
--  cuando ese flag exacto está presente, además de la condición ya
--  existente. Nadie puede replicar esa condición fuera de
--  fn_resetear_copropiedad() — no es un permiso, es una puerta que solo
--  esa función sabe abrir. UPDATE sigue prohibido siempre, sin excepción.
--
--  ═══ EL SEGUNDO BLOQUEO: DOS CICLOS REALES DE FK ═══
--
--  documentos ↔ pagos ↔ acuerdo_pago_cuotas ↔ acuerdos_pago ↔ documentos,
--  y pagos ↔ intenciones_pago: ninguna secuencia de DELETE por tabla los
--  resuelve porque cada tabla del ciclo referencia a otra que todavía no
--  se borró. En vez de romper el ciclo con UPDATE ... SET columna = null
--  (que el guard append-only tampoco permitiría — UPDATE sigue prohibido
--  siempre), se hacen DEFERRABLE todas las foreign keys ENTRE las tablas
--  de este reset (bloque siguiente): no cambia ningún comportamiento
--  existente (DEFERRABLE INITIALLY IMMEDIATE se comporta idéntico a NOT
--  DEFERRABLE salvo que algo pida diferir explícitamente), pero le permite
--  a fn_resetear_copropiedad() pedir `set constraints all deferred` y
--  borrar las 58 tablas en un orden razonable sin que un ciclo, o un
--  error de orden, tumbe la transacción — Postgres valida las FK al
--  final, momento en el que las dos tablas de cualquier ciclo ya están
--  vacías para ese tenant.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_tablas text[] := array[
    'inmuebles', 'terceros', 'tenant_tercero_rol', 'inmueble_persona_rol',
    'inmueble_transferencias', 'terceros_contacto_procedencia', 'coeficientes',
    'coeficiente_sets', 'presupuestos', 'presupuesto_rubros', 'presupuesto_ejecucion',
    'periodos', 'liquidaciones', 'liquidacion_lineas', 'cartera_corridas_diarias',
    'cartera_etapas', 'posiciones_cartera_snapshot', 'eventos_cartera',
    'acciones_cobranza', 'acciones_cobranza_acuses', 'acciones_cobranza_envios',
    'casos_juridicos', 'caso_juridico_actuaciones', 'costas_judiciales',
    'prescripcion_actos_interruptivos', 'certificaciones_deuda', 'promesas_pago',
    'acuerdos_pago', 'acuerdo_pago_cuotas', 'cargos', 'pagos', 'pago_aplicaciones',
    'intenciones_pago', 'extracto_bancario', 'extracto_linea', 'conciliacion_propuesta',
    'novedades', 'novedad_cuotas', 'fondo_movimientos', 'auditoria_engagements',
    'auditoria_planes', 'auditoria_plan_items', 'auditoria_procedimientos',
    'auditoria_muestras', 'auditoria_evidencias', 'auditoria_hallazgos',
    'auditoria_ejecuciones', 'auditoria_acciones', 'auditoria_controles',
    'auditoria_riesgos', 'auditoria_riesgo_residual_historial', 'auditoria_normativa',
    'documentos', 'documentos_legal_holds', 'fundamento_normativo', 'fundamento_propuesta',
    'concepto_test_cases', 'estados_cuenta_generados'
  ];
  v_fk record;
begin
  for v_fk in
    select con.conname, rel.relname as tabla_hija
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_class relf on relf.oid = con.confrelid
    where con.contype = 'f'
      and con.condeferrable = false
      and rel.relnamespace = 'public'::regnamespace
      and rel.relname = any(v_tablas)
      and relf.relname = any(v_tablas)
  loop
    execute format(
      'alter table public.%I alter constraint %I deferrable initially immediate',
      v_fk.tabla_hija, v_fk.conname
    );
  end loop;
end $$;

-- ── La excepción estrecha en el guard append-only ───────────────────────
create or replace function public.forbid_mutation_salvo_tenant_borrado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and (
    not exists (select 1 from public.tenants where id = old.tenant_id)
    or current_setting('aquila.reset_context', true) = 'true'
  ) then
    return old;
  end if;

  raise exception 'APPEND_ONLY: % no admite % (SEC-14)', tg_table_name, tg_op;
end;
$$;

comment on function public.forbid_mutation_salvo_tenant_borrado() is
  'Igual que forbid_mutation() (sin UPDATE ni DELETE para ningún rol), con DOS excepciones de '
  'DELETE: la FK tenant_id ... on delete cascade al borrar el tenant dueño (original), y el '
  'flag de sesión aquila.reset_context (D-39) que solo fn_resetear_copropiedad() sabe activar '
  '— nunca un DELETE arbitrario mientras el tenant sigue vivo por fuera de esos dos caminos.';

-- ── fn_resetear_copropiedad ──────────────────────────────────────────────
create function public.fn_resetear_copropiedad(p_tenant_id uuid)
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

  foreach v_tabla in array v_tablas loop
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

comment on function public.fn_resetear_copropiedad(uuid) is
  'D-39 — Zona de peligro: borra los datos operativos de una copropiedad (58 tablas) y la deja '
  'como recién creada, preservando configuración (conceptos, plan contable, presupuesto, '
  'agrupaciones, zonas comunes, plantillas, pasarela, políticas, cuentas bancarias, fondos) y '
  'usuarios (memberships, invitations). No toca audit_log ni recibos_caja (comprobante fiscal, '
  'protección absoluta). Exige rol administrador (has_role). Usa set constraints all deferred '
  'para resolver dos ciclos reales de FK (documentos↔pagos↔acuerdos_pago, pagos↔intenciones_pago) '
  'sin depender del orden exacto de los DELETE.';

revoke execute on function public.fn_resetear_copropiedad(uuid) from public, anon;
grant execute on function public.fn_resetear_copropiedad(uuid) to authenticated;
