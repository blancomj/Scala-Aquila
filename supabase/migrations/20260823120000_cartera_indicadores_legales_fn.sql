-- ═══════════════════════════════════════════════════════════════════════
--  CAR F9 (parte 4) · Indicadores de gestión jurídica (§23.3, últimos 4)
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §23.3
--
--  Mismo patrón que fn_indicadores_gestion (20260823110000): agrega
--  conteos/sumas crudos de un período [fecha_desde, fecha_hasta]; la
--  división con "denominador cero = indeterminado (null)" se hace en TS
--  puro (calcularIndicadoresLegales, REC-CAR-004), nunca aquí.
--
--  La guía (§23.3) da la fórmula de cada indicador pero no precisa
--  numerador/denominador con el detalle que exige implementarlos —
--  interpretaciones adoptadas aquí, documentadas porque no son las
--  únicas lecturas posibles de la fórmula:
--
--  · Legal Referral Rate = inmuebles remitidos a jurídico / inmuebles
--    que alcanzaron el tramo jurídico. cartera_etapas (F6) NO es un log
--    de eventos — solo guarda la etapa actual y una anterior, no permite
--    reconstruir "quién alcanzó jurídico en este período". Se usa
--    posiciones_cartera_snapshot (F3/F8, append-only, una foto por día)
--    como fuente histórica: un inmueble "alcanzó el tramo jurídico" en
--    el período si aparece con etapa_cobranza en ('juridica','judicial')
--    en algún snapshot con fecha_corte dentro de [desde, hasta]. Exige
--    que JOB_CARTERA_DIARIA haya corrido en esas fechas — si no corrió
--    ningún día del período, el denominador es 0 y el indicador es null
--    (no se trata como error 422 como Roll/Cure Rate, porque aquí no se
--    comparan dos fechas puntuales sino un rango).
--
--  · Legal Recovery Rate = Σ monto_recuperado / Σ monto_pretension,
--    sobre la cohorte de casos_juridicos con fecha_remision en el
--    período (misma cohorte que el numerador de Legal Referral Rate).
--    monto_recuperado es un acumulado en la fila del caso (no tiene
--    fecha propia por abono) — no se puede acotar "recuperado durante
--    el período" con más precisión sin una bitácora de recuperaciones,
--    que no existe. Se informa como "de los casos abiertos en este
--    período, qué fracción de lo pretendido se ha recuperado a la
--    fecha de la consulta".
--
--  · Average Days to Recovery = promedio(fecha del último pago que
--    saldó el cargo − fecha_vencimiento), sobre cargos que llegaron a
--    saldo 0 (mismo criterio que v_cargo_saldo.monto_pendiente = 0,
--    ledger append-only de 20260816100000) cuyo último pago cayó en el
--    período. No es un indicador exclusivamente jurídico (aplica a
--    todo cargo saldado, no solo a los de casos en jurídico) — la guía
--    no lo restringe a esa fuente, y exigirlo rompería la fórmula
--    documentada.
--
--  · Cost to Collect = Σ costas_judiciales.monto / Σ recuperado en el
--    período (fn_indicadores_gestion.monto_recuperado_periodo, ya
--    calculado — no se relee). Es una versión PARCIAL del indicador de
--    la guía ("Σ costos de acciones + costas"): acciones_cobranza y
--    estrategias_cobranza no tienen ninguna columna de costo — no existe
--    hoy forma de trackear el costo de gestión administrativa (SMS,
--    llamadas, cartas). Decisión explícita del usuario (2026-08-17): no
--    inventar un modelo de costos nuevo en esta pieza; se informa solo
--    el costo judicial, documentado como parcial en la guía y en el
--    payload de la Edge Function. Ampliarlo a acciones_cobranza requiere
--    una migración de esquema aparte (nueva columna + decisión de
--    backfill), fuera de alcance aquí.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_indicadores_legales(
  p_tenant_id   uuid,
  p_fecha_desde date,
  p_fecha_hasta date
)
returns table (
  inmuebles_remitidos      int,
  inmuebles_tramo_juridico int,
  monto_recuperado_casos   numeric(18, 2),
  monto_pretension_casos   numeric(18, 2),
  suma_dias_recuperacion   numeric,
  cantidad_cargos_saldados int,
  costas_monto             numeric(18, 2)
)
language sql
stable
security invoker
set search_path = ''
as $$
  with cargos_saldados as (
    select
      c.id,
      (max(pg.fecha_pago) - per.fecha_vencimiento) as dias_recuperacion
    from public.cargos c
    join public.periodos per on per.id = c.periodo_id
    join public.pago_aplicaciones pa on pa.cargo_id = c.id
    join public.pagos pg on pg.id = pa.pago_id
    where c.tenant_id = p_tenant_id
      and per.fecha_vencimiento is not null
    group by c.id, c.monto_original, per.fecha_vencimiento
    having sum(pa.monto) >= c.monto_original
       and max(pg.fecha_pago) between p_fecha_desde and p_fecha_hasta
  )
  select
    (select count(distinct inmueble_id)::int
     from public.casos_juridicos
     where tenant_id = p_tenant_id
       and fecha_remision between p_fecha_desde and p_fecha_hasta
    ) as inmuebles_remitidos,
    (select count(distinct inmueble_id)::int
     from public.posiciones_cartera_snapshot
     where tenant_id = p_tenant_id
       and etapa_cobranza in ('juridica', 'judicial')
       and fecha_corte between p_fecha_desde and p_fecha_hasta
    ) as inmuebles_tramo_juridico,
    (select coalesce(sum(monto_recuperado), 0)
     from public.casos_juridicos
     where tenant_id = p_tenant_id
       and fecha_remision between p_fecha_desde and p_fecha_hasta
    ) as monto_recuperado_casos,
    (select coalesce(sum(monto_pretension), 0)
     from public.casos_juridicos
     where tenant_id = p_tenant_id
       and fecha_remision between p_fecha_desde and p_fecha_hasta
    ) as monto_pretension_casos,
    (select coalesce(sum(dias_recuperacion), 0) from cargos_saldados) as suma_dias_recuperacion,
    (select count(*)::int from cargos_saldados) as cantidad_cargos_saldados,
    (select coalesce(sum(monto), 0)
     from public.costas_judiciales
     where tenant_id = p_tenant_id
       and fecha_decision between p_fecha_desde and p_fecha_hasta
    ) as costas_monto;
$$;

comment on function public.fn_indicadores_legales is
  'CAR §23.3 — conteos/sumas crudos para Legal Referral Rate, Legal Recovery Rate, Average '
  'Days to Recovery y Cost to Collect (parcial, sin costo de acciones_cobranza — ver cabecera '
  'de esta migración). security invoker: respeta RLS del usuario que llama, mismo criterio que '
  'fn_indicadores_gestion (20260823110000).';

revoke all on function public.fn_indicadores_legales(uuid, date, date) from public, anon;
grant execute on function public.fn_indicadores_legales(uuid, date, date) to authenticated;
