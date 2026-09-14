-- ═══════════════════════════════════════════════════════════════════════
--  D-124/D-125: ampliación de cobertura de fn_resetear_copropiedad hacia
--  Mantenimiento y Fondos (a pedido del usuario, tras el audit de 118 FKs
--  ON DELETE NO ACTION de D-122).
--
--  Auditado en vivo (pg_constraint), no releído de memoria: 75 tablas
--  fuera de las 76 ya cubiertas referencian, con NO ACTION, alguna de las
--  cubiertas. De esas 75, esta migración agrega 63 (todas las que tienen
--  tenant_id y cuyo grafo de dependencias es resoluble con un solo orden).
--  Quedan DELIBERADAMENTE FUERA de esta pasada (para una revisión propia,
--  ver DECISIONES.md D-125):
--    - gobierno_decisiones / gobierno_reuniones / gobierno_miembros /
--      gobierno_actas: ciclo real de 4 tablas entre sí (dominio de actas y
--      decisiones de asamblea) — requiere su propio análisis con cuidado.
--    - mant_reservas: ciclo real con `cargos` (`cargos.reserva_id` /
--      `mant_reservas.cargo_id`), una tabla núcleo de Cartera/Cobranza
--      ajena a Mantenimiento — se agrupa con el punto anterior porque
--      ambos exigen tocar deferrabilidad de tablas "core", no solo de
--      Mantenimiento/Fondos.
--
--  CICLOS REALES RESUELTOS AQUÍ (3 pares, 6 constraints): un ciclo de 2
--  tablas en 2 DELETE statements separados (uno por tabla, como ya hace
--  esta función) NO se resuelve con `SET CONSTRAINTS ALL DEFERRED` salvo
--  que el constraint en cuestión haya sido creado DEFERRABLE — verificado
--  contra pg_constraint que 979 de 980 FKs del esquema NO lo son. El
--  `SET CONSTRAINTS ALL DEFERRED` que esta función ya ejecuta no hacía
--  nada hasta ahora; con estos 6 constraints marcados DEFERRABLE INITIAL
--  IMMEDIATE, el comportamiento normal de la app no cambia (se sigue
--  validando al instante en cualquier INSERT/UPDATE/DELETE fuera de esta
--  función) pero dentro del reset, Postgres los revisa recién al final de
--  la transacción — momento en el que ambos lados del ciclo ya están
--  vacíos para ese tenant.
--
--  Las AUTO-referencias (mant_contratos, mant_incidencias,
--  mant_inventario_movimientos, y las ya existentes cargos/terceros/
--  pagos/activos/contable_comprobante/fondo_movimientos/pago_aplicaciones/
--  presupuesto_ejecucion) NO necesitan este tratamiento: verificado que un
--  solo `DELETE FROM t WHERE tenant_id = $1` que borra TODAS las filas
--  propias y las que se auto-referencian a la vez ya funciona hoy sin
--  DEFERRABLE (las auto-referencias existentes llevan meses en producción
--  sin este problema) — el chequeo de un FK NOT DEFERRABLE ocurre al
--  final del STATEMENT, no fila por fila, así que un borrado masivo de la
--  misma tabla en un solo statement nunca lo dispara.
alter table public.mant_ordenes_trabajo
  drop constraint mant_ordenes_trabajo_incidencia_fk,
  add constraint mant_ordenes_trabajo_incidencia_fk
    foreign key (incidencia_id) references public.mant_incidencias(id)
    on delete no action deferrable initially immediate;

alter table public.mant_incidencias
  drop constraint mant_incidencias_orden_trabajo_fk,
  add constraint mant_incidencias_orden_trabajo_fk
    foreign key (orden_trabajo_id) references public.mant_ordenes_trabajo(id)
    on delete no action deferrable initially immediate;

alter table public.mant_ordenes_trabajo
  drop constraint mant_ordenes_trabajo_programacion_id_fkey,
  add constraint mant_ordenes_trabajo_programacion_id_fkey
    foreign key (programacion_id) references public.mant_programaciones(id)
    on delete no action deferrable initially immediate;

alter table public.mant_programaciones
  drop constraint mant_programaciones_orden_trabajo_fk,
  add constraint mant_programaciones_orden_trabajo_fk
    foreign key (orden_trabajo_id) references public.mant_ordenes_trabajo(id)
    on delete no action deferrable initially immediate;

alter table public.fondo_solicitudes_uso
  drop constraint fondo_solicitudes_uso_compromiso_id_fkey,
  add constraint fondo_solicitudes_uso_compromiso_id_fkey
    foreign key (compromiso_id) references public.fondo_compromisos(id)
    on delete no action deferrable initially immediate;

alter table public.fondo_compromisos
  drop constraint fondo_compromisos_solicitud_id_fkey,
  add constraint fondo_compromisos_solicitud_id_fkey
    foreign key (solicitud_id) references public.fondo_solicitudes_uso(id)
    on delete no action deferrable initially immediate;

-- ═══════════════════════════════════════════════════════════════════════
--  Hallazgo colateral, corregido de paso: `cargos.novedad_id -> novedades`
--  (330 filas pobladas en tenants de prueba reales, NO dormido como los
--  demás) estaba en el orden EQUIVOCADO en el arreglo anterior
--  ('novedades' se borraba antes que 'cargos') — un bug latente real, no
--  solo teórico, para cualquier tenant con cargos originados de una
--  novedad (ej. recargos por mora). El nuevo orden completo recalculado
--  desde cero (topological sort sobre pg_constraint real, no a mano) ya
--  lo corrige: 'cargos' ahora va antes que 'novedades'.
--
--  Dos ciclos PREEXISTENTES, distintos de los de arriba, quedan
--  documentados y sin tocar (siguen dormidos: 0 filas pobladas en toda la
--  base de desarrollo para las columnas que los completan; no forman
--  parte de lo pedido en este corte):
--    - pagos.intencion_pago_id <-> intenciones_pago.pago_id
--    - cargos.novedad_id -> novedades.acuerdo_pago_id -> acuerdos_pago.
--      documento_id -> documentos.envio_id -> acciones_cobranza_envios.
--      accion_id -> acciones_cobranza.cargo_id -> cargos (el resto del
--      ciclo de 6, además del enlace cargos->novedades ya corregido arriba)
--  Ningún orden lineal puede satisfacer un ciclo completo; se deja para
--  cuando alguno de esos enlaces deje de estar dormido.
--
--  Hallazgo aparte, sin riesgo hoy: 6 catálogos sin tenant_id
--  (contable_plan_cuenta, contable_nota_plantilla, contable_estado_linea,
--  contable_codigo_retirado, gobierno_clase_sancion,
--  gobierno_materia_decision) referencian fundamento_normativo con NO
--  ACTION — verificado que las 112 filas de fundamento_normativo en este
--  entorno son 100% globales (tenant_id is null), así que el reset nunca
--  borra ninguna fila que ellos referencien. Fragilidad latente si algún
--  día se crea un fundamento_normativo específico de un tenant; no se
--  toca en este corte.
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
    'coeficiente_sets', 'inmueble_transferencias',
    'tenant_tercero_rol', 'terceros_contacto_procedencia', 'auditoria_muestras',
    'auditoria_evidencias', 'auditoria_plan_items', 'auditoria_riesgo_residual_historial',
    'auditoria_normativa', 'auditoria_acciones', 'auditoria_ejecuciones',
    'auditoria_procedimientos', 'auditoria_hallazgos', 'auditoria_controles',
    'auditoria_planes', 'auditoria_riesgos', 'auditoria_engagements',
    -- Bloque nuevo (20260935100000, D-124/D-125): 63 tablas de
    -- Mantenimiento/Gobierno/Fondos/Contabilidad/Finanzas antes sin cubrir,
    -- ordenadas por su grafo real de FK (ver cabecera). gobierno_decisiones/
    -- reuniones/miembros/actas y mant_reservas quedan fuera a propósito.
    'actor_externo_vinculo', 'inmueble_persona_rol',
    'atencion_tokens_consulta', 'conciliacion_bancaria', 'conciliacion_bancaria_partida',
    'contable_comprobante_detalle', 'contable_castigo_cartera', 'contable_correccion',
    'contable_comprobante', 'contable_deterioro_detalle', 'contable_politica_conservacion',
    'contable_rendicion_cuentas', 'contable_dictamen', 'contable_certificacion',
    'finanzas_facturas_proveedor', 'fondo_fuentes', 'fondo_remanentes', 'fondo_movimientos',
    'liquidaciones', 'finanzas_lotes_pago', 'extracto_linea',
    'fondo_autorizaciones', 'fondo_compromisos', 'fondo_solicitudes_uso', 'fuente_financiacion',
    'gobierno_acta_entregas', 'gobierno_acta_verificadores', 'gobierno_agenda_puntos',
    'gobierno_asistencia', 'gobierno_compromiso_avances', 'gobierno_compromisos',
    'gobierno_convocatoria_envios', 'gobierno_convocatorias', 'gobierno_expediente_actuaciones',
    'gobierno_impugnacion_actuaciones', 'gobierno_impugnaciones', 'gobierno_expedientes_convivencia',
    'gobierno_infracciones', 'gobierno_parametro_impugnacion',
    'fundamento_normativo',
    'gobierno_poderes', 'gobierno_sanciones', 'novedades', 'gobierno_vencimiento_notificaciones',
    'acciones_cobranza_envios',
    'mant_contrato_activos', 'mant_contrato_clausulas', 'mant_escenario',
    'mant_garantia_reclamaciones', 'mant_garantias', 'mant_hallazgos',
    'gobierno_organos',
    'mant_incidencias', 'mant_inspeccion_respuestas', 'mant_inventario_movimientos',
    'mant_almacenes', 'mant_ot_evidencias', 'mant_plan_activos', 'mant_programaciones',
    'mant_planes', 'mant_proveedor_habilitacion', 'mant_registros_acceso',
    'mant_autorizaciones_visita', 'mant_repuestos', 'mant_salud_snapshot',
    'mant_zona_reserva_regla', 'publicacion_interes', 'recibos_caja', 'tributario_iva_generado',
    'presupuesto_ejecucion', 'periodos',
    'mant_ordenes_trabajo', 'mant_contratos', 'mant_inspecciones', 'mant_cumplimiento',
    'activos', 'zonas_comunes', 'documentos', 'pagos', 'acuerdo_pago_cuotas',
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
  're-sembrarla desde cero. NO cubre todavía: el ciclo de 4 tablas de Gobierno (decisiones/'
  'reuniones/miembros/actas) ni mant_reservas (ciclo con cargos) — deuda conocida, D-125. '
  'Config/políticas/plantillas/consecutivos se preservan a propósito. Exige rol administrador '
  'y deja registro en audit_log.';
