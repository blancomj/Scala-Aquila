-- ═══════════════════════════════════════════════════════════════════════
--  FIN-4 · Flujo de caja proyectado y alertas de liquidez (8/8)
--
--  El entregable 4 del corte decía "plantillas sugeridas de escenarios y
--  reglas, como script opcional de siembra, no como migración" — decisión
--  del usuario (2026-09-09), reproducir aquí EL MISMO cambio ya aprobado
--  para MANT-9 (20260932530000): sembrar automático en create_tenant(),
--  pero de forma que quede sin efecto hasta revisión consciente:
--
--  - finanzas_escenario_parametros: fila 'conservador' en estado='borrador'
--    (nunca 'vigente') — finanzas_flujo_proyectado() solo lee filas
--    estado='vigente' para 'conservador'; en borrador, ese escenario sigue
--    devolviendo datos_insuficientes exactamente como si no existiera fila.
--  - finanzas_alerta_regla: 5 filas de ejemplo (una por código de
--    TIPO_ALERTA_LIQUIDEZ) con activa=false — finanzas_alertas_evaluar()
--    solo procesa reglas activa=true, así que estas 5 filas no emiten
--    ninguna alerta hasta que un administrador las revise y active.
--
--  Prueba 6 del corte ("cero coeficientes de escenario sembrados por
--  defecto, recorriendo las migraciones buscando literales") se ajusta
--  para excluir esta migración por nombre, igual que MANT-9 ajustó su
--  prueba 2 al añadir 20260932530000 — el literal existe aquí a propósito
--  y está documentado, no colado por accidente. La prueba 10 ("cero reglas
--  sembradas") se ajusta a "cero reglas ACTIVAS sembradas", mismo criterio.
--
--  create_tenant() reproducido COMPLETO desde su última redefinición real
--  (20260932530000, de esta misma sesión) — no desde una copia anterior.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_instanciar_finanzas_flujo_default(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.finanzas_escenario_parametros
    (tenant_id, escenario, version, estado, pct_recaudo_esperado, dias_adicionales_pago_proveedor)
  values
    (p_tenant_id, 'conservador', 1, 'borrador', 70, 15);

  insert into public.finanzas_alerta_regla (tenant_id, tipo_id, nombre, activa, umbral, semanas_consecutivas)
  select p_tenant_id, lt.id, f.nombre, false, f.umbral, f.semanas_consecutivas
    from (values
      ('saldo_30d_bajo_umbral', 'Saldo proyectado a 30 días bajo 5.000.000', 5000000::numeric, null::smallint),
      ('saldo_30d_negativo', 'Saldo proyectado a 30 días negativo', null::numeric, null::smallint),
      ('flujo_neto_negativo_n_semanas', 'Flujo neto negativo 3 semanas seguidas', null::numeric, 3::smallint),
      ('cxp_vencida_sin_lote', 'CxP vencida sin lote sobre 2.000.000', 2000000::numeric, null::smallint),
      ('cartera_vencida_deteriorando', 'Cartera vencida deteriorándose', null::numeric, null::smallint)
    ) as f (codigo, nombre, umbral, semanas_consecutivas)
    join public.lista_tipos lt on lt.tipo = 'TIPO_ALERTA_LIQUIDEZ' and lt.codigo = f.codigo;
end;
$$;

comment on function public.fn_instanciar_finanzas_flujo_default(uuid) is
  'FIN-4 addendum (2026-09-09): siembra un finanzas_escenario_parametros ''conservador'' en '
  'borrador y 5 finanzas_alerta_regla de ejemplo con activa=false, llamada desde create_tenant(). '
  'Sin efecto sobre ninguna proyección ni alerta real hasta revisión y activación consciente.';

revoke execute on function public.fn_instanciar_finanzas_flujo_default(uuid) from public, anon, authenticated;

create or replace function public.create_tenant(p_name text, p_slug text)
returns public.tenants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para crear una copropiedad';
  end if;

  insert into public.tenants (name, slug, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), (select auth.uid()))
  returning * into v_tenant;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id)
  values (v_tenant.id, (select auth.uid()), 'tenant.created', 'tenant', v_tenant.id);

  insert into public.memberships (user_id, tenant_id, role, status)
  values ((select auth.uid()), v_tenant.id, 'administrador', 'active');

  perform public.fn_instanciar_presupuesto_cuenta(v_tenant.id);
  perform public.fn_instanciar_plan_contable(v_tenant.id);
  -- GAP-22: el fondo de imprevistos necesita el plan de cuentas para vincular 111015.
  perform public.fn_instanciar_fondo_imprevistos(v_tenant.id);
  perform public.fn_instanciar_cuentas_default(v_tenant.id);
  perform public.fn_instanciar_puentes_presupuesto(v_tenant.id);
  perform public.fn_instanciar_conceptos(v_tenant.id);
  -- MANT-2: requisitos de cumplimiento normativo, sembrado propio del tenant desde el alta.
  perform public.fn_instanciar_requisitos_cumplimiento(v_tenant.id);
  -- MANT-9 addendum: plantilla de factores de salud en borrador — nunca vigente por sí sola.
  perform public.fn_instanciar_salud_factores_default(v_tenant.id);
  -- FIN-4 addendum: plantilla de escenario conservador + reglas de alerta, en borrador/inactivas.
  perform public.fn_instanciar_finanzas_flujo_default(v_tenant.id);

  update public.profiles
  set active_tenant_id = v_tenant.id,
      -- Restaurado (20260904220000): la primera copropiedad de un usuario es su
      -- predeterminada, pero coalesce nunca pisa una ya elegida.
      tenant_predeterminado_id = coalesce(tenant_predeterminado_id, v_tenant.id)
  where id = (select auth.uid());

  return v_tenant;
exception
  when unique_violation then
    raise exception 'SLUG_TAKEN: ya existe una copropiedad con ese slug';
  when check_violation then
    raise exception 'SLUG_INVALID: el nombre o el slug no cumplen el formato requerido';
end;
$$;
