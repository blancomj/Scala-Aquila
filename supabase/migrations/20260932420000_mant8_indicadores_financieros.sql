-- ═══════════════════════════════════════════════════════════════════════
--  MANT-8 · Indicadores y tendencias de mantenimiento (3/4)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_08_indicadores_tendencias.md §3.2
--
--  Regla dura del corte: "Todos leen de presupuesto_ejecucion, presupuesto_rubros
--  y presupuesto_cuenta, sin excepción" — prueba 4 lo verifica estructuralmente.
--
--  ═══ Hallazgo confirmado con el usuario, cambia el mockup del corte ═══
--  El mockup de este corte muestra «Presupuesto Anual / Ejecutado / Comprometido /
--  Disponible» y exige que esas 4 cifras coincidan EXACTAMENTE con el módulo de
--  presupuesto. Verificado (PresupuestoTabEjecucion.vue, la pestaña "Ejecución
--  presupuestal" real): el módulo de presupuesto SOLO tiene Presupuestado y
--  Ejecutado — "Comprometido" y "Disponible" no existen en ningún punto del
--  sistema a nivel de cuenta/tenant (solo existe mant_contrato_ejecucion(),
--  MANT-5, que es "comprometido" de UN contrato individual, no del presupuesto).
--  Peor: MANT-6 (mant_costos, ver 20260932130000) dejó una decisión explícita
--  en contra de mezclar costo_estimado de una OT con una cifra de costo real.
--
--  Decisión de este corte (aprobada): mant_indicador_financiero_presupuesto()
--  expone Presupuestado/Ejecutado como passthrough literal de
--  presupuesto_cuenta_ejecucion — coincidencia exacta GARANTIZADA por
--  construcción (prueba 3). "Comprometido" se muestra SEPARADO, derivado de
--  costo_estimado de OT abiertas, etiquetado explícitamente como estimado — NO
--  participa de la comparación exacta contra presupuesto (prueba 3 no lo cubre).
--  "Disponible" se omite: restar una estimación de una cifra presupuestal real
--  sería la misma figura engañosa que el propio corte advierte evitar.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Presupuestado/Ejecutado de mantenimiento: passthrough exacto de presupuesto_cuenta_ejecucion ──
create function public.mant_indicador_financiero_presupuesto(
  p_tenant_id uuid, p_presupuesto_id uuid, p_cuenta_id uuid default null
)
returns table (
  cuenta_id uuid, cuenta_codigo text, cuenta_nombre text, cuenta_ruta text,
  presupuestado numeric, ejecutado numeric
)
language sql
stable
set search_path = ''
as $$
  select c.id, c.codigo, c.nombre, c.ruta, ce.presupuestado, ce.ejecutado
  from public.presupuesto_cuenta_ejecucion(p_presupuesto_id) ce
  join public.presupuesto_cuenta c on c.id = ce.cuenta_id
  where c.tenant_id = p_tenant_id
    and (
      p_cuenta_id is null
      or c.id = p_cuenta_id
      or c.ruta like (select cc.ruta || '.%' from public.presupuesto_cuenta cc where cc.id = p_cuenta_id)
    );
$$;

comment on function public.mant_indicador_financiero_presupuesto(uuid, uuid, uuid) is
  'MANT-8 §3.2/prueba 3 (central): Presupuestado y Ejecutado leídos SIN transformación de '
  'presupuesto_cuenta_ejecucion (la misma función que alimenta la pestaña "Ejecución presupuestal" '
  'del módulo de Presupuesto) — coinciden exactamente por construcción, no por replicar el cálculo. '
  'p_cuenta_id opcional acota a una cuenta y su subárbol (via ruta), para mostrar solo las cuentas '
  'de mantenimiento que el administrador elija en su plan de cuentas — MANT-8 no etiqueta ni '
  'adivina cuáles cuentas son "de mantenimiento".';

-- ── Comprometido (ESTIMADO): suma de costo_estimado de OT abiertas — NUNCA una cifra presupuestal ──
create function public.mant_indicador_comprometido_estimado(p_tenant_id uuid)
returns table (comprometido_estimado numeric, ordenes_con_estimado int, ordenes_sin_estimado int)
language sql
stable
set search_path = ''
as $$
  select
    coalesce(sum(costo_estimado), 0),
    count(*) filter (where costo_estimado is not null)::int,
    count(*) filter (where costo_estimado is null)::int
  from public.mant_ordenes_trabajo
  where tenant_id = p_tenant_id
    and estado not in ('cerrada', 'cancelada');
$$;

comment on function public.mant_indicador_comprometido_estimado(uuid) is
  'MANT-8 §3.2 (decisión aprobada, ver cabecera de este archivo): suma costo_estimado de OT NO '
  'cerradas/canceladas. Es una ESTIMACIÓN, nunca una cifra presupuestal real (mismo principio ya '
  'fijado por mant_costos, MANT-6: costo_estimado no es costo) — la UI debe etiquetarlo como '
  '"estimado", y la prueba 3 (coincidencia exacta con presupuesto) NO cubre este valor, solo '
  'Presupuestado/Ejecutado.';

-- ── Costo por metro cuadrado ──
create function public.mant_indicador_costo_m2(p_tenant_id uuid, p_desde date, p_hasta date)
returns table (costo_total numeric, area_privada_total numeric, costo_m2 numeric)
language sql
stable
set search_path = ''
as $$
  with costo as (
    select coalesce(sum(monto), 0) as total
    from public.mant_costos(p_tenant_id, p_desde, p_hasta)
  ),
  area as (
    select coalesce(sum(area_privada), 0) as total
    from public.inmuebles
    where tenant_id = p_tenant_id
  )
  select
    costo.total,
    area.total,
    case when area.total > 0 then round(costo.total / area.total, 2) else null end
  from costo, area;
$$;

comment on function public.mant_indicador_costo_m2(uuid, date, date) is
  'MANT-8 §3.2: costo total de mantenimiento (mant_costos, que ya lee exclusivamente '
  'presupuesto_ejecucion) dividido entre la suma de inmuebles.area_privada del tenant. Si ningún '
  'inmueble tiene área cargada (suma 0 o todo null), costo_m2 es null — dato insuficiente, no una '
  'división por cero silenciosa.';
