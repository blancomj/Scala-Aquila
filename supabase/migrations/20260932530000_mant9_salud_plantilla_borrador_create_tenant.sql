-- ═══════════════════════════════════════════════════════════════════════
--  MANT-9 · addendum — plantilla de factores de salud sembrada en borrador
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_09_salud_decision.md §3.1
--
--  REVIERTE, con instrucción explícita del usuario (2026-09-09, ya con el
--  corte MANT-9 cerrado y sus 7 migraciones pusheadas a remoto), la nota de
--  `20260932460000_mant9_salud_set.sql` que decía "la plantilla va en un
--  script OPCIONAL (entregable 3), nunca en una migración". La razón
--  original (no imponer un índice de salud con apariencia de decisión ya
--  tomada) sigue siendo válida — la variante que el usuario pidió la
--  resuelve dejando el set sembrado en estado='borrador':
--
--  - mant_salud() SOLO lee sets con estado='vigente' (verificado en
--    20260932490000) — un set en borrador tiene efecto CERO sobre cualquier
--    índice real. Ningún activo, en ningún tenant, ve un número por este
--    cambio hasta que un administrador entre a Configuración de salud y
--    presione "Activar esta versión" de forma consciente.
--  - Esa activación sigue exigiendo peso total = 100 exactamente
--    (guard_salud_set_pesos_completos) y sigue siendo la única puerta —
--    este addendum no la toca ni la evita.
--
--  10 de los 12 códigos de FUENTE_SALUD_FACTOR, no los 12: se excluyen
--  'edad' (necesita vida_util_meses poblado, no obligatorio en MANT-0) y
--  'condicion_inspeccion' (necesita al menos una inspección registrada, no
--  obligatoria en MANT-7) — ambos devolverían null siempre en un tenant
--  recién creado, desperdiciando peso en un factor crónicamente sin dato.
--  Los otros 10 sí dependen de datos que ya existen o son razonablemente
--  alcanzables desde el alta (estado del activo, OTs, costos, criticidad,
--  requisitos normativos, hallazgos).
--
--  Advertencias deliberadas dejadas en comentarios de fila (no bloquean
--  nada, son para quien revise el borrador antes de activarlo):
--  - 'costo': los tramos son un monto absoluto en COP — dependen del
--    tamaño real de la copropiedad, un placeholder genérico no puede
--    acertarle a todas. Se espera que el administrador los ajuste.
--  - 'criticidad': mant_criticidad() de MANT-1 LANZA EXCEPCIÓN
--    (CRITICIDAD_SIN_SET_VIGENTE / CRITICIDAD_EVALUACION_INCOMPLETA) si el
--    tenant no tiene su propio set de criticidad vigente y evaluado por
--    activo — comportamiento preexistente de mant_salud(), no introducido
--    aquí. Si el administrador activa este set de salud sin haber armado
--    antes su criticidad (MANT-1), mant_salud() fallará en vez de omitir
--    el factor. Documentado, no corregido — corregir mant_salud() está
--    fuera del alcance de este addendum.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_instanciar_salud_factores_default(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set_id uuid;
begin
  insert into public.mant_salud_set (tenant_id, version, estado)
  values (p_tenant_id, 1, 'borrador')
  returning id into v_set_id;

  insert into public.mant_salud_factor
    (tenant_id, set_id, codigo, nombre, peso, fuente_id, ventana_dias, escala)
  select p_tenant_id, v_set_id, f.codigo, f.nombre, f.peso,
         (select lt.id from public.lista_tipos lt
           where lt.tipo = 'FUENTE_SALUD_FACTOR' and lt.codigo = f.codigo),
         f.ventana_dias, f.escala::jsonb
  from (values
    ('disponibilidad', 'Disponibilidad', 15,
      365, '[{"hasta":70,"puntaje":20},{"hasta":85,"puntaje":60},{"hasta":95,"puntaje":85},{"hasta":null,"puntaje":100}]'),
    ('criticidad', 'Criticidad', 15,
      365, '[{"hasta":40,"puntaje":90},{"hasta":70,"puntaje":60},{"hasta":null,"puntaje":30}]'),
    ('mtbf', 'MTBF', 10,
      365, '[{"hasta":168,"puntaje":20},{"hasta":720,"puntaje":50},{"hasta":2160,"puntaje":80},{"hasta":null,"puntaje":100}]'),
    ('mttr', 'MTTR', 10,
      365, '[{"hasta":4,"puntaje":100},{"hasta":24,"puntaje":70},{"hasta":72,"puntaje":40},{"hasta":null,"puntaje":10}]'),
    ('cumplimiento_plan', 'Cumplimiento del plan', 10,
      365, '[{"hasta":50,"puntaje":20},{"hasta":75,"puntaje":50},{"hasta":90,"puntaje":80},{"hasta":null,"puntaje":100}]'),
    ('costo', 'Costo de mantenimiento', 10,
      365, '[{"hasta":0,"puntaje":100},{"hasta":500000,"puntaje":80},{"hasta":2000000,"puntaje":50},{"hasta":null,"puntaje":20}]'),
    ('cumplimiento_normativo', 'Cumplimiento normativo', 10,
      365, '[{"hasta":50,"puntaje":20},{"hasta":80,"puntaje":60},{"hasta":null,"puntaje":100}]'),
    ('hallazgos_criticos', 'Hallazgos críticos abiertos', 10,
      365, '[{"hasta":0,"puntaje":100},{"hasta":1,"puntaje":60},{"hasta":3,"puntaje":30},{"hasta":null,"puntaje":10}]'),
    ('ot_a_tiempo', 'OT cerradas a tiempo', 5,
      365, '[{"hasta":50,"puntaje":20},{"hasta":75,"puntaje":50},{"hasta":90,"puntaje":80},{"hasta":null,"puntaje":100}]'),
    ('tendencia_fallas', 'Tendencia de fallas', 5,
      90, '[{"hasta":0,"puntaje":100},{"hasta":1,"puntaje":70},{"hasta":3,"puntaje":40},{"hasta":null,"puntaje":10}]')
  ) as f (codigo, nombre, peso, ventana_dias, escala);

  insert into public.mant_salud_banda (tenant_id, set_id, etiqueta, puntaje_desde, puntaje_hasta, orden)
  values
    (p_tenant_id, v_set_id, 'Crítico', 0, 39.99, 1),
    (p_tenant_id, v_set_id, 'Regular', 40, 69.99, 2),
    (p_tenant_id, v_set_id, 'Bueno', 70, 89.99, 3),
    (p_tenant_id, v_set_id, 'Óptimo', 90, null, 4);
end;
$$;

comment on function public.fn_instanciar_salud_factores_default(uuid) is
  'MANT-9 addendum (2026-09-09): siembra un mant_salud_set en estado=borrador con una plantilla '
  'de 10 factores (pesos suman 100) y 4 bandas, llamada desde create_tenant(). Sin efecto sobre '
  'ningún índice real hasta que un administrador la revise/ajuste y active conscientemente — '
  'mant_salud() solo lee sets vigente.';

-- ── create_tenant(): reproduce el cuerpo COMPLETO vigente (20260931780000) + 1 línea nueva ──
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
