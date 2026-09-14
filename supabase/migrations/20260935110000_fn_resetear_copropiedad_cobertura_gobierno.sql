-- ═══════════════════════════════════════════════════════════════════════
--  D-125/D-126: cierre de la deuda de 118 FKs (D-122) — última tanda,
--  deliberadamente dejada fuera de D-125: el ciclo real de 4 tablas de
--  Gobierno (decisiones/reuniones/miembros/actas, dominio de actas y
--  decisiones de asamblea) y `mant_reservas` (ciclo con `cargos`, tabla
--  núcleo de Cartera/Cobranza ajena a Mantenimiento). A pedido explícito
--  del usuario ("Sigamos con Gobierno y mant_reservas ahora").
--
--  Se agregan 6 tablas nuevas: gobierno_decisiones, gobierno_reuniones,
--  gobierno_miembros, gobierno_actas, gobierno_votaciones (encontrada al
--  auditar el ciclo — referenciada por gobierno_decisiones.votacion_id,
--  no estaba en la deuda original de D-122 porque solo se descubre al
--  mapear las FKs de decisiones) y mant_reservas.
--
--  CICLO DE GOBIERNO (4 tablas): decisiones -> actas -> miembros ->
--  decisiones, Y decisiones -> reuniones -> miembros -> decisiones (dos
--  ciclos de 3, comparten el tramo miembros -> decisiones). Verificado que
--  DEFERIR ÚNICAMENTE `gobierno_miembros.decision_id` alcanza para romper
--  AMBOS ciclos a la vez (es el único arco que participa en los dos) — no
--  hace falta tocar más de un constraint en este dominio.
--
--  CICLO cargos/mant_reservas: `cargos.reserva_id` <-> `mant_reservas.
--  cargo_id` (un cargo por reservar una zona común, y la reserva sabe qué
--  cargo generó) — mismo patrón que los 3 pares resueltos en D-125, ambos
--  lados deferred.
--
--  Mismo criterio que D-125 para las auto-referencias: `gobierno_
--  decisiones.revoca_decision_id` y `gobierno_reuniones.convocatoria_
--  antecedente_id` NO necesitan DEFERRABLE — un DELETE masivo de todas las
--  filas del tenant en una tabla resuelve sola su propia auto-referencia.
--
--  Orden recalculado desde cero (topological sort sobre pg_constraint real
--  de las 146 tablas resultantes, no a mano) porque insertar 6 tablas más
--  desplaza posiciones ya usadas por otras 140 — verificado edge por edge
--  contra el grafo real: 0 violaciones fuera de los pares DEFERRABLE (estos
--  3 + los 3 ya aplicados en D-125) y los 2 ciclos preexistentes ya
--  documentados en D-125 (`pagos`<->`intenciones_pago`; el resto del ciclo
--  de 6 vía `cargos`/`novedades`/`acuerdos_pago`/`documentos`/
--  `acciones_cobranza_envios`/`acciones_cobranza`, ambos dormidos: 0 filas
--  pobladas, sin relación con este corte).
alter table public.gobierno_miembros
  drop constraint gobierno_miembros_decision_id_fkey,
  add constraint gobierno_miembros_decision_id_fkey
    foreign key (decision_id) references public.gobierno_decisiones(id)
    on delete no action deferrable initially immediate;

alter table public.cargos
  drop constraint cargos_reserva_id_fkey,
  add constraint cargos_reserva_id_fkey
    foreign key (reserva_id) references public.mant_reservas(id)
    on delete no action deferrable initially immediate;

alter table public.mant_reservas
  drop constraint mant_reservas_cargo_id_fkey,
  add constraint mant_reservas_cargo_id_fkey
    foreign key (cargo_id) references public.cargos(id)
    on delete no action deferrable initially immediate;
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
    'novedad_cuotas', 'pago_aplicaciones', 'conciliacion_propuesta',
    'extracto_bancario', 'acciones_cobranza',
    'mant_depreciacion_detalle', 'activo_estado_historial',
    'gobierno_atribucion',
    'inmueble_atributo_historico',
    'solicitud_actuaciones', 'solicitudes',
    'tercero_perfil', 'publicaciones',
    'vehiculo_paso', 'vehiculos',
    'anuncios', 'finanzas_flujo_corridas_diarias', 'gobierno_vencimiento_corridas',
    'notificaciones',
    'intenciones_pago', 'acuerdos_pago', 'cargos', 'liquidacion_lineas',
    'presupuesto_rubros', 'presupuestos',
    'estados_cuenta_generados',
    'posiciones_cartera_snapshot', 'eventos_cartera', 'cartera_etapas', 'coeficientes',
    'inmueble_transferencias',
    'tenant_tercero_rol', 'terceros_contacto_procedencia', 'auditoria_muestras',
    'auditoria_evidencias', 'auditoria_plan_items', 'auditoria_riesgo_residual_historial',
    'auditoria_normativa', 'auditoria_acciones', 'auditoria_ejecuciones',
    'auditoria_procedimientos', 'auditoria_hallazgos', 'auditoria_controles',
    'auditoria_planes', 'auditoria_riesgos', 'auditoria_engagements',
    'actor_externo_vinculo', 'inmueble_persona_rol',
    'atencion_tokens_consulta', 'conciliacion_bancaria', 'conciliacion_bancaria_partida',
    'contable_comprobante_detalle', 'contable_castigo_cartera', 'contable_correccion',
    'contable_comprobante', 'contable_deterioro_detalle', 'contable_politica_conservacion',
    'contable_rendicion_cuentas', 'contable_dictamen', 'contable_certificacion',
    'finanzas_facturas_proveedor', 'fondo_fuentes', 'fondo_remanentes', 'fondo_movimientos',
    'liquidaciones', 'finanzas_lotes_pago', 'extracto_linea',
    'fondo_autorizaciones', 'fondo_compromisos', 'fondo_solicitudes_uso', 'fuente_financiacion',
    'gobierno_acta_entregas', 'gobierno_acta_verificadores',
    'gobierno_asistencia', 'gobierno_compromiso_avances', 'gobierno_compromisos',
    'gobierno_convocatoria_envios', 'gobierno_convocatorias', 'gobierno_expediente_actuaciones',
    'gobierno_impugnacion_actuaciones', 'gobierno_impugnaciones', 'gobierno_expedientes_convivencia',
    'gobierno_infracciones', 'gobierno_parametro_impugnacion',
    'fundamento_normativo',
    'gobierno_poderes', 'gobierno_sanciones', 'novedades', 'gobierno_vencimiento_notificaciones',
    'acciones_cobranza_envios',
    'mant_contrato_activos', 'mant_contrato_clausulas', 'mant_escenario',
    'mant_garantia_reclamaciones', 'mant_garantias', 'mant_hallazgos',
    'mant_incidencias', 'mant_inspeccion_respuestas', 'mant_inventario_movimientos',
    'mant_almacenes', 'mant_ot_evidencias', 'mant_plan_activos', 'mant_programaciones',
    'mant_planes', 'mant_proveedor_habilitacion', 'mant_registros_acceso',
    'mant_autorizaciones_visita', 'mant_repuestos', 'mant_salud_snapshot',
    'mant_zona_reserva_regla', 'publicacion_interes', 'recibos_caja', 'tributario_iva_generado',
    'presupuesto_ejecucion', 'periodos',
    'mant_ordenes_trabajo', 'mant_contratos', 'mant_inspecciones', 'mant_cumplimiento',
    'activos',
    -- Bloque nuevo (20260935110000, D-125/D-126): ciclo de Gobierno (4
    -- tablas) + mant_reservas, ordenados por su grafo real de FK (ver
    -- cabecera). Con esto, D-122 (118 FKs) queda 100% cerrado.
    'mant_reservas', 'zonas_comunes',
    'gobierno_decisiones', 'gobierno_actas', 'gobierno_reuniones', 'coeficiente_sets',
    'gobierno_organos', 'gobierno_votaciones', 'gobierno_agenda_puntos', 'gobierno_miembros',
    'documentos', 'pagos', 'acuerdo_pago_cuotas',
    'casos_juridicos', 'certificaciones_deuda', 'inmuebles', 'terceros'
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

  -- fondos se preserva (config), pero no puede sobrevivir apuntando a un
  -- documento que este mismo reset va a borrar.
  update public.fondos set documento_principal_id = null where tenant_id = p_tenant_id;

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

comment on function public.fn_resetear_copropiedad(uuid) is
  'Utilidad de desarrollo/QA: borra la data transaccional de una copropiedad (cargos, '
  'liquidaciones, pagos, novedades, periodos, auditoría, cartera, contabilidad, gobierno, '
  'mantenimiento, finanzas, fondos, solicitudes externas, inmuebles y terceros) para poder '
  're-sembrarla desde cero. D-122/D-125/D-126: los 118 FKs ON DELETE NO ACTION quedan cerrados. '
  'Config/políticas/plantillas/consecutivos se preservan a propósito. Exige rol administrador '
  'y deja registro en audit_log.';
