-- ═══════════════════════════════════════════════════════════════════════
--  Variación de cartera entre dos cortes — "¿por qué cambió la cartera?"
--  Casos de uso/FACTOR DIFERENCIADOR/ENFOQUE_CONSOLIDACION/ (paso 0)
--
--  DB-FIRST. La comparación entre dos cortes es un FULL OUTER JOIN por
--  inmueble y un conteo de eventos por inmueble: las dos son operaciones
--  de base de datos. Hacerlas en TypeScript obligaría a traer 2×N filas
--  de inmuebles más los eventos del período al Edge para terminar
--  mostrando diez — exactamente el traslado de trabajo que DB-first
--  prohíbe. Aquí la base entrega una fila por inmueble ya comparada, y el
--  TS solo suma, ordena y redacta.
--
--  NO DUPLICA NINGÚN CÁLCULO FINANCIERO. Esta función no sabe qué es una
--  deuda vencida: llama dos veces a fn_dashboard_cartera (20260823180000,
--  con el arreglo de GAP-CAR-001) y resta lo que esa función devuelve. Si
--  la definición de "vencida" cambia allí, cambia aquí sin tocar esta
--  migración. Ese es el motivo de llamarla en vez de reescribir su SQL.
--
--  security invoker, igual que fn_dashboard_cartera: la RLS del invocante
--  gobierna ambas llamadas. Un definer aquí crearía un camino para leer
--  cartera de otro tenant a través de una función de solo lectura.
--
--  FULL OUTER JOIN y no INNER: un inmueble que aparece en un solo corte
--  es justamente el caso interesante — entró en mora o se puso al día.
--  Un inner join los borraría a los dos y el delta total dejaría de
--  cuadrar con la suma de los deltas por inmueble.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_variacion_cartera(
  p_tenant_id             uuid,
  p_fecha_corte_anterior  date,
  p_fecha_corte_actual    date
)
returns table (
  inmueble_id               uuid,
  codigo                    text,
  vencida_anterior          numeric(18, 2),
  vencida_actual            numeric(18, 2),
  delta_vencida             numeric(18, 2),
  total_anterior            numeric(18, 2),
  total_actual              numeric(18, 2),
  corriente_anterior        numeric(18, 2),
  corriente_actual          numeric(18, 2),
  sin_vencimiento_anterior  numeric(18, 2),
  sin_vencimiento_actual    numeric(18, 2),
  interes_anterior          numeric(18, 2),
  interes_actual            numeric(18, 2),
  dias_mora_maximo          int,
  etapa_cobranza            text,
  -- Cuántos eventos de cartera tocaron este inmueble en (anterior, actual].
  -- 0 significa "cambió sin que quedara rastro de por qué": es el residuo
  -- que la UI muestra en vez de repartir.
  eventos_en_periodo        int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with anterior as (
    select * from public.fn_dashboard_cartera(p_tenant_id, p_fecha_corte_anterior)
  ),
  actual as (
    select * from public.fn_dashboard_cartera(p_tenant_id, p_fecha_corte_actual)
  ),
  eventos as (
    -- Extremo inferior abierto: el corte anterior ya refleja lo ocurrido
    -- hasta esa fecha, así que incluirlo contaría dos veces el hecho que
    -- produjo el saldo de partida.
    select
      e.inmueble_id,
      count(*)::int as n
    from public.eventos_cartera e
    where e.tenant_id = p_tenant_id
      and e.inmueble_id is not null
      and e.ocurrido_at >  (p_fecha_corte_anterior + 1)::timestamptz
      and e.ocurrido_at <= (p_fecha_corte_actual + 1)::timestamptz
    group by e.inmueble_id
  )
  select
    coalesce(a.inmueble_id, b.inmueble_id)                         as inmueble_id,
    -- El código del corte actual manda; si el inmueble ya no aparece, el
    -- del anterior es el único que hay.
    coalesce(b.codigo, a.codigo)                                   as codigo,
    coalesce(a.deuda_vencida, 0)                                   as vencida_anterior,
    coalesce(b.deuda_vencida, 0)                                   as vencida_actual,
    coalesce(b.deuda_vencida, 0) - coalesce(a.deuda_vencida, 0)    as delta_vencida,
    coalesce(a.deuda_total, 0)                                     as total_anterior,
    coalesce(b.deuda_total, 0)                                     as total_actual,
    coalesce(a.deuda_corriente, 0)                                 as corriente_anterior,
    coalesce(b.deuda_corriente, 0)                                 as corriente_actual,
    coalesce(a.deuda_sin_vencimiento, 0)                           as sin_vencimiento_anterior,
    coalesce(b.deuda_sin_vencimiento, 0)                           as sin_vencimiento_actual,
    coalesce(a.interes_causado, 0)                                 as interes_anterior,
    coalesce(b.interes_causado, 0)                                 as interes_actual,
    coalesce(b.dias_mora_maximo, 0)                                as dias_mora_maximo,
    coalesce(b.etapa_cobranza, a.etapa_cobranza, 'preventiva')     as etapa_cobranza,
    coalesce(ev.n, 0)                                              as eventos_en_periodo
  from anterior a
  full outer join actual b on b.inmueble_id = a.inmueble_id
  left join eventos ev on ev.inmueble_id = coalesce(a.inmueble_id, b.inmueble_id)
  order by delta_vencida desc;
$$;

comment on function public.fn_variacion_cartera is
  'Compara dos cortes de fn_dashboard_cartera por inmueble y cuenta los eventos de cartera del '
  'período (ENFOQUE_CONSOLIDACION paso 0). No define ni recalcula ningún concepto financiero: '
  'delega en fn_dashboard_cartera y resta. FULL OUTER JOIN a propósito — un inmueble presente en '
  'un solo corte entró en mora o se puso al día, y omitirlo rompería la identidad '
  '«suma de deltas por inmueble = delta total». eventos_en_periodo = 0 significa que el saldo '
  'cambió sin evento registrado que lo explique; la UI lo muestra como residuo.';

-- ═══════════════════════════════════════════════════════════════════════
--  Desglose de los eventos del período por tipo.
--
--  Función aparte y no una columna de la anterior porque la granularidad
--  es distinta: aquella devuelve una fila por inmueble, esta una por tipo
--  de evento. Mezclarlas obligaría a un jsonb repetido en cada fila.
--
--  Los inmuebles NO son excluyentes entre tipos: el mismo inmueble puede
--  tener un CARGO_VENCIDO y un ACUERDO_CUOTA_VENCIDA. Por eso esta función
--  NO devuelve montos — sumarlos entre tipos daría un total falso. Devuelve
--  conteos, que es lo que la pregunta «qué clase de hecho predominó»
--  necesita.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_variacion_cartera_eventos(
  p_tenant_id             uuid,
  p_fecha_corte_anterior  date,
  p_fecha_corte_actual    date
)
returns table (
  tipo                text,
  cantidad_eventos    int,
  cantidad_inmuebles  int
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.tipo::text                                as tipo,
    count(*)::int                               as cantidad_eventos,
    count(distinct e.inmueble_id)::int          as cantidad_inmuebles
  from public.eventos_cartera e
  where e.tenant_id = p_tenant_id
    and e.ocurrido_at >  (p_fecha_corte_anterior + 1)::timestamptz
    and e.ocurrido_at <= (p_fecha_corte_actual + 1)::timestamptz
  group by e.tipo
  order by count(*) desc;
$$;

comment on function public.fn_variacion_cartera_eventos is
  'Eventos de cartera del período agrupados por tipo (ENFOQUE_CONSOLIDACION paso 0). Solo '
  'conteos, nunca montos: un inmueble puede aparecer bajo varios tipos y sumar sus montos entre '
  'tipos produciría un total inexistente.';
