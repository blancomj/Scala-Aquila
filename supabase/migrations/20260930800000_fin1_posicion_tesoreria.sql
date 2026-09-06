-- ═══════════════════════════════════════════════════════════════════════
--  FIN-1 · Posición de tesorería consolidada — ensambla, por consulta a
--  funciones ya existentes, nunca por cálculo propio (criterio de
--  aceptación del corte): bancos (fn_cuenta_bancaria_disponible), caja y
--  anticipos (contable_libro_mayor sobre la cuenta mapeada por evento en
--  contable_cuenta_default — mismo patrón que RC-1), fondos
--  (fn_fondo_saldos), cartera (fn_posicion_cartera) y cuentas por pagar
--  (presupuesto_ejecucion con liquidacion='por_pagar').
--
--  "utilizable" se resuelve contra finanzas_politica_tesoreria vigente —
--  sin fila vigente, ninguna fila es utilizable (cero valores por
--  defecto, APENDICE_FIN.md).
--
--  Cartera vencida: aproximación documentada en FIN_01_INFORME.md — se
--  suma deuda_total de fn_posicion_cartera para los inmuebles con
--  dias_mora_maximo > 0 (no existe una función que separe monto vencido
--  de monto total por inmueble; sumar deuda_total completa de un inmueble
--  con al menos un cargo vencido es una aproximación razonable, no un
--  cálculo inventado — solo agrega lo que la función ya devuelve).
-- ═══════════════════════════════════════════════════════════════════════

create type public.posicion_naturaleza_t as enum (
  'activo_liquido', 'restringido', 'obligacion', 'derecho'
);

comment on type public.posicion_naturaleza_t is
  'D-24: enum nativo — clasifica cada fila de finanzas_posicion_tesoreria según si suma a la '
  'liquidez operativa (activo_liquido), está apartada para un fin específico y normalmente no '
  'cuenta como utilizable (restringido, p. ej. el fondo de imprevistos), es una obligación de la '
  'copropiedad (anticipos sin aplicar, cuentas por pagar) o un derecho a favor suyo que todavía '
  'no es efectivo (cartera). Gatilla cómo la UI agrupa y suma, no es vocabulario descriptivo.';

create function public.finanzas_posicion_tesoreria(
  p_tenant_id uuid,
  p_fecha timestamptz default now()
)
returns table (
  concepto           text,
  detalle_id         uuid,
  detalle_nombre     text,
  naturaleza         public.posicion_naturaleza_t,
  monto_total        numeric,
  monto_comprometido numeric,
  monto_disponible   numeric,
  utilizable         boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with politica as (
    select *
    from public.finanzas_politica_tesoreria
    where tenant_id = p_tenant_id and estado = 'vigente'
  )

  -- Bancos (GAP_FIN-01: cuentas_bancarias.banco fue reemplazada por entidad_financiera_id,
  -- 20260822170000 — el nombre de la entidad se lee de lista_tipos, no de una columna propia)
  select 'bancos'::text, cb.id, lt_ent.nombre || ' · ' || cb.numero_cuenta,
         'activo_liquido'::public.posicion_naturaleza_t,
         d.saldo_contable, d.comprometido_reservado, d.disponible,
         exists (select 1 from politica pol where cb.id = any(pol.bancos_utilizables))
  from public.cuentas_bancarias cb
  join public.lista_tipos lt_ent on lt_ent.id = cb.entidad_financiera_id
  cross join lateral public.fn_cuenta_bancaria_disponible(cb.id, p_fecha) d
  where cb.tenant_id = p_tenant_id and cb.activa

  union all

  -- Caja (evento CAJA_GENERAL, mapeado en el alta por fn_instanciar_cuentas_default)
  select 'caja'::text, null::uuid, 'Caja general', 'activo_liquido'::public.posicion_naturaleza_t,
         coalesce(lm.saldo_final, 0), 0::numeric, coalesce(lm.saldo_final, 0),
         exists (select 1 from politica pol where pol.incluir_caja)
  from public.contable_cuenta_default ccd
  join public.lista_tipos lt
    on lt.id = ccd.evento_id and lt.codigo = 'CAJA_GENERAL' and lt.tenant_id is null
  left join lateral
    public.contable_libro_mayor(p_tenant_id, '1900-01-01'::date, p_fecha::date, ccd.contable_cuenta_id) lm
    on true
  where ccd.tenant_id = p_tenant_id

  union all

  -- Fondos (fondos.tipo fue renombrada a fondos.naturaleza — fondo_naturaleza_t, 20260929100000)
  select 'fondo:' || coalesce(f.codigo, f.id::text), f.id, f.nombre,
         (case when f.naturaleza = 'imprevistos' then 'restringido' else 'activo_liquido' end)
           ::public.posicion_naturaleza_t,
         s.saldo, s.comprometido, s.disponible,
         exists (select 1 from politica pol where f.id = any(pol.fondos_utilizables))
  from public.fondos f
  cross join lateral public.fn_fondo_saldos(f.id) s
  where f.tenant_id = p_tenant_id and f.estado = 'activo'

  union all

  -- Anticipos de copropietarios sin aplicar (evento ANTICIPO_COPROPIETARIO, RC-1) — obligación,
  -- no liquidez: es plata que no es de la copropiedad.
  select 'anticipos'::text, null::uuid, 'Anticipos de copropietarios',
         'obligacion'::public.posicion_naturaleza_t,
         coalesce(lm2.saldo_final, 0), 0::numeric, coalesce(lm2.saldo_final, 0), false
  from public.contable_cuenta_default ccd2
  join public.lista_tipos lt2
    on lt2.id = ccd2.evento_id and lt2.codigo = 'ANTICIPO_COPROPIETARIO' and lt2.tenant_id is null
  left join lateral
    public.contable_libro_mayor(p_tenant_id, '1900-01-01'::date, p_fecha::date, ccd2.contable_cuenta_id) lm2
    on true
  where ccd2.tenant_id = p_tenant_id

  union all

  -- Cartera total (derecho, no efectivo todavía)
  select 'cartera_total'::text, null::uuid, 'Cartera total', 'derecho'::public.posicion_naturaleza_t,
         coalesce(sum(pc.deuda_total), 0), 0::numeric, coalesce(sum(pc.deuda_total), 0), false
  from public.fn_posicion_cartera(p_tenant_id, p_fecha::date, null) pc

  union all

  -- Cartera vencida (ver nota de cabecera sobre la aproximación)
  select 'cartera_vencida'::text, null::uuid, 'Cartera vencida', 'derecho'::public.posicion_naturaleza_t,
         coalesce(sum(pcv.deuda_total), 0), 0::numeric, coalesce(sum(pcv.deuda_total), 0), false
  from public.fn_posicion_cartera(p_tenant_id, p_fecha::date, null) pcv
  where pcv.dias_mora_maximo > 0

  union all

  -- Cuentas por pagar (presupuesto_ejecucion aún no causadas por CO-3)
  select 'cxp'::text, null::uuid, 'Cuentas por pagar', 'obligacion'::public.posicion_naturaleza_t,
         coalesce(sum(pe.monto), 0), 0::numeric, coalesce(sum(pe.monto), 0), false
  from public.presupuesto_ejecucion pe
  where pe.tenant_id = p_tenant_id and pe.liquidacion = 'por_pagar'
$$;

comment on function public.finanzas_posicion_tesoreria(uuid, timestamptz) is
  'FIN-1 §3.3: consulta pura sobre funciones existentes (fn_cuenta_bancaria_disponible, '
  'fn_fondo_saldos, contable_libro_mayor, fn_posicion_cartera, presupuesto_ejecucion) — cero '
  'cálculo propio. utilizable se resuelve contra finanzas_politica_tesoreria vigente; sin fila '
  'vigente, siempre false. security invoker: RLS de cada tabla subyacente decide qué ve el '
  'llamador.';
