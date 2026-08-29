-- ═══════════════════════════════════════════════════════════════════════
--  CAR §8.4 / §9.4 · Siembra de la configuración inicial de cartera
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §8.4
--
--  El problema que resuelve: hasta hoy, encender el módulo de cartera en
--  una copropiedad exigía escribir SQL a mano — política de clasificación,
--  ocho tramos, estrategias y plantilla. Sin eso, el job aborta por
--  PH-C26/I-C14 y no pasa absolutamente nada. Todo lo construido en F0-F9
--  y §34 quedaba inaccesible para un cliente nuevo.
--
--  Los valores NO son inventados: son los que el rector propone en §8.4
--  (tramos) y §9.4 (estrategias), que a su vez siguen los aging buckets
--  estándar de la industria (1-30 / 31-60 / 61-90 / >90) con la extensión
--  propia de PH, donde la deuda no se castiga sino que escala al proceso
--  ejecutivo del art. 48.
--
--  `[CONFIG]` en el rector significa SUGERIDO, no impuesto: cada
--  copropiedad los ajusta por acta de asamblea. Esta función da un punto de
--  partida razonable, no una decisión tomada.
--
--  Las acciones de alto impacto nacen con requiere_aprobacion = true
--  (§9.4): requerimiento formal, aviso prejurídico, asignación de abogado y
--  remisión jurídica. El sistema nunca demanda a alguien automáticamente.
--
--  Se siembran también estrategias de canales que hoy no tienen
--  despachador automático (llamada, carta, interno). Es deliberado: esas
--  acciones se gestionan a mano y se registra su resultado — el módulo no
--  es solo mensajería, y omitirlas daría una configuración que no refleja
--  cómo se cobra de verdad.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_sembrar_configuracion_cartera(
  p_tenant_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_politica uuid;
  v_tramo    record;
  v_ids      jsonb := '{}'::jsonb;
begin
  -- Idempotencia por negación: si ya hay configuración, no se toca. Una
  -- segunda siembra silenciosa duplicaría estrategias sobre una política
  -- que alguien ya ajustó.
  if exists (select 1 from public.politicas_clasificacion_cartera where tenant_id = p_tenant_id) then
    raise exception 'CARTERA_CONFIGURACION_YA_EXISTE: esta copropiedad ya tiene una política de '
      'clasificación. Para cambiarla, crea una versión nueva (CAR §8.5).';
  end if;

  insert into public.politicas_clasificacion_cartera (tenant_id, version, estado, nombre, policy_hash)
  values (
    p_tenant_id, 1, 'borrador',
    'Política de clasificación v1 (sugerida)',
    'seed-cartera-' || p_tenant_id::text
  )
  returning id into v_politica;

  -- ── Tramos (§8.4) ───────────────────────────────────────────────────
  for v_tramo in
    select * from (values
      ('AL_DIA',        'Al día',         0,   0,    'ninguno', 'preventiva',     0, 0),
      ('MORA_TEMPRANA', 'Mora temprana',  1,   30,   'bajo',    'administrativa', 1, 1),
      ('MORA_INICIAL',  'Mora inicial',   31,  60,   'bajo',    'administrativa', 2, 2),
      ('MORA_MEDIA',    'Mora media',     61,  90,   'medio',   'administrativa', 3, 3),
      ('MORA_AVANZADA', 'Mora avanzada',  91,  120,  'medio',   'prejuridica',    4, 4),
      ('MORA_CRITICA',  'Mora crítica',   121, 180,  'alto',    'prejuridica',    5, 5),
      ('ALTO_RIESGO',   'Alto riesgo',    181, 360,  'alto',    'juridica',       6, 6),
      ('CRITICA',       'Crítica',        361, null, 'critico', 'juridica',       7, 7)
    ) as t(codigo, nombre, dias_min, dias_max, riesgo, etapa, prioridad, orden)
  loop
    insert into public.politica_clasificacion_tramos (
      tenant_id, politica_id, codigo, nombre, dias_min, dias_max,
      nivel_riesgo, etapa_cobranza, prioridad, orden
    )
    values (
      p_tenant_id, v_politica, v_tramo.codigo, v_tramo.nombre, v_tramo.dias_min, v_tramo.dias_max,
      v_tramo.riesgo::public.nivel_riesgo_t,
      v_tramo.etapa::public.etapa_cobranza_t,
      v_tramo.prioridad, v_tramo.orden
    );
  end loop;

  -- El id de cada tramo, para colgar las estrategias sin volver a
  -- consultarlos uno por uno.
  select jsonb_object_agg(codigo, id) into v_ids
  from public.politica_clasificacion_tramos
  where politica_id = v_politica;

  -- ── Estrategias (§9.4) ──────────────────────────────────────────────
  -- plantilla_codigo apunta al catálogo de eventos de mensajería
  -- (packages/shared/src/sms.ts). Hoy solo 'cartera_pago_vencido' tiene
  -- plantilla real; el resto queda null y la acción se gestiona a mano.
  insert into public.estrategias_cobranza (
    tenant_id, politica_id, tramo_id, codigo, nombre, tipo_accion, canal,
    dias_desde_clasificacion, frecuencia_dias, max_intentos, plantilla_codigo,
    rol_minimo, requiere_aprobacion, activa, orden
  )
  select
    p_tenant_id, v_politica, (v_ids ->> e.tramo)::uuid, e.codigo, e.nombre,
    e.tipo_accion::public.tipo_accion_cobranza_t,
    e.canal::public.canal_cobranza_t,
    e.dias, e.frecuencia, e.intentos, e.plantilla,
    e.rol::public.tenant_role_t, e.aprobacion, e.activa, e.orden
  from (values
    ('MORA_TEMPRANA', 'REC-EMAIL',  'Recordatorio por correo',   'email',                'email',    3,  15,   2, 'cartera_pago_vencido', 'auxiliar',      false, true,  1),
    ('MORA_INICIAL',  'AVISO-SMS',  'Aviso por SMS',             'sms',                  'sms',      0,  15,   2, 'cartera_pago_vencido', 'auxiliar',      false, true,  2),
    ('MORA_MEDIA',    'GESTION-TEL','Gestión telefónica',        'llamada',              'telefono', 0,  15,   3, null,                   'auxiliar',      false, true,  3),
    ('MORA_MEDIA',    'CARTA',      'Comunicación física',       'carta',                'fisico',   10, null, 1, null,                   'auxiliar',      false, true,  4),
    ('MORA_AVANZADA', 'REQ-FORMAL', 'Requerimiento formal',      'requerimiento_formal', 'fisico',   0,  null, 1, null,                   'administrador', true,  true,  5),
    ('MORA_AVANZADA', 'PROP-ACU',   'Propuesta de acuerdo',      'propuesta_acuerdo',    'email',    5,  null, 1, null,                   'auxiliar',      false, true,  6),
    ('MORA_CRITICA',  'AVISO-PREJ', 'Aviso prejurídico',         'aviso_prejuridico',    'fisico',   0,  null, 1, null,                   'administrador', true,  true,  7),
    ('ALTO_RIESGO',   'ASIG-ABG',   'Asignación de abogado',     'asignacion_abogado',   'interno',  0,  null, 1, null,                   'administrador', true,  true,  8),
    ('ALTO_RIESGO',   'REM-JUR',    'Remisión jurídica',         'remision_juridica',    'interno',  15, null, 1, null,                   'administrador', true,  true,  9),
    ('CRITICA',       'REV-MANUAL', 'Revisión manual',           'revision_manual',      'interno',  0,  30,   1, null,                   'administrador', true,  true,  10)
  ) as e(tramo, codigo, nombre, tipo_accion, canal, dias, frecuencia, intentos, plantilla, rol, aprobacion, activa, orden);

  -- Nace en BORRADOR a propósito: activarla es una decisión de quien
  -- administra, y una política vigente ya no se puede corregir (§8.5,
  -- REC-CAR-011). Se revisa primero, se activa después.
  return v_politica;
end;
$$;

comment on function public.fn_sembrar_configuracion_cartera(uuid) is
  'CAR §8.4/§9.4 — siembra la política de clasificación sugerida (8 tramos) y las estrategias '
  'de cobranza sugeridas para una copropiedad que todavía no tiene ninguna. Nace en borrador: '
  'hay que revisarla y activarla. Falla si ya existe una política — corregir es crear versión '
  'nueva, no re-sembrar. security invoker: RLS decide quién puede escribir.';
