-- ═══════════════════════════════════════════════════════════════════════
--  Fix: fn_aplicar_anticipos reportaba éxito sin aplicar nada
--
--  ═══ CÓMO SE DETECTÓ ═══
--
--  Verificando RC-2 en vivo: se anuló un pago en efectivo de $20.000 que
--  cubría parte de un cargo de capital. La reversa reabrió el cargo
--  correctamente (monto_pendiente volvió a $20.000). Se corrió
--  fn_aplicar_anticipos() a mano para el mismo inmueble — que sí tenía
--  $97.734 de anticipo real y disponible de OTRO pago (uno de sobrepago,
--  sin relación con el anulado). La función devolvió "20000.00" como
--  aplicado. Se verificó el cargo: seguía en $20.000 pendientes. Cero
--  filas nuevas en pago_aplicaciones.
--
--  ═══ LA CAUSA ═══
--
--  fn_aplicar_anticipos (20260903110000, RC-1) inserta con
--  `on conflict (pago_id, cargo_id) do nothing`. pago_aplicaciones_unico
--  (20260816100000) es UNIQUE (pago_id, cargo_id) — un pago solo puede
--  tener UNA fila de aplicación contra un cargo dado. El pago de sobrepago
--  YA tenía una fila contra ese cargo (de la prueba anterior, cuando cubrió
--  parte de él). Al reabrirse el cargo por la reversa e intentar aplicar
--  MÁS de ese mismo pago al MISMO cargo, el INSERT choca contra la fila
--  existente, ON CONFLICT DO NOTHING la descarta en silencio — pero
--  v_disponible/v_aplicado ya se habían incrementado en memoria ANTES del
--  insert, así que la función devuelve el monto como si se hubiera
--  aplicado. Nadie se entera salvo comparando el saldo del cargo a mano.
--
--  ═══ POR QUÉ pago_aplicaciones_unico ERA LA RESTRICCIÓN INCORRECTA ═══
--
--  Nada en el diseño exige que un pago solo pueda tocar un cargo UNA vez.
--  guard_pago_aplicacion_no_excede ya protege contra sobreaplicación
--  sumando TODAS las filas de un cargo (v_cargo_saldo) y TODAS las de un
--  pago — funciona igual con una fila o con diez. La unicidad no prevenía
--  ningún error real; solo bloqueaba un caso legítimo (un pago que vuelve
--  a tocar un cargo que se reabrió) y lo hacía en silencio por culpa del
--  ON CONFLICT DO NOTHING que se le agregó encima para poder seguir
--  operando bajo esa restricción.
--
--  ═══ LA CORRECCIÓN ═══
--
--  Se retira la restricción única. Cada aplicación queda como una fila
--  propia — mismo criterio append-only que el resto del ledger: no se
--  fusiona, se acumula. fn_aplicar_anticipos deja de usar ON CONFLICT: un
--  INSERT que fallara ahora fallaría RUIDOSO, no en silencio.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.pago_aplicaciones drop constraint pago_aplicaciones_unico;

comment on table public.pago_aplicaciones is
  'Resultado de imputarPago() (packages/liquidation-engine) persistido — la cascada de qué '
  'cargo(s) cubrió cada pago, según la estrategia de la política vigente (AD-36). Un mismo par '
  '(pago_id, cargo_id) puede repetirse en más de una fila (sin restricción única desde esta '
  'migración): un pago puede volver a tocar un cargo que se reabrió (RC-2) o que recibió más '
  'anticipo en una corrida posterior de fn_aplicar_anticipos. guard_pago_aplicacion_no_excede '
  'sigue siendo la única protección real contra sobreaplicación, sumando por cargo_id y por '
  'pago_id sin importar cuántas filas haya.';

create or replace function public.fn_aplicar_anticipos(p_tenant_id uuid, p_inmueble_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orden      text[];
  v_aplicado   numeric(18, 2) := 0;
  v_pago       record;
  v_cargo      record;
  v_disponible numeric(18, 2);
  v_monto      numeric(18, 2);
begin
  select array(select jsonb_array_elements_text(pf.imputacion_orden))
    into v_orden
  from public.politicas_financieras pf
  where pf.tenant_id = p_tenant_id and pf.vigente_hasta is null
  limit 1;

  if v_orden is null or cardinality(v_orden) = 0 then
    v_orden := array['interes', 'capital', 'otro'];
  end if;

  for v_pago in
    select p.id,
           p.monto - coalesce((
             select sum(pa.monto) from public.pago_aplicaciones pa where pa.pago_id = p.id
           ), 0) as remanente
    from public.pagos p
    where p.tenant_id = p_tenant_id and p.inmueble_id = p_inmueble_id
      and p.monto > 0
      and not exists (select 1 from public.pagos r where r.pago_original_id = p.id)
    order by p.fecha_pago, p.created_at
  loop
    v_disponible := v_pago.remanente;
    if v_disponible <= 0 then continue; end if;

    for v_cargo in
      select vs.id, vs.monto_pendiente
      from public.v_cargo_saldo vs
      join public.periodos per on per.id = vs.periodo_id
      left join public.conceptos co on co.id = vs.concepto_id
      where vs.tenant_id = p_tenant_id
        and vs.inmueble_id = p_inmueble_id
        and vs.monto_pendiente > 0
      order by per.anio, per.mes,
               coalesce(array_position(v_orden, vs.categoria::text), 99),
               coalesce(co.prioridad, 2147483647),
               vs.id
    loop
      exit when v_disponible <= 0;
      v_monto := least(v_disponible, v_cargo.monto_pendiente);
      if v_monto <= 0 then continue; end if;

      -- Sin ON CONFLICT: ya no hay restricción única que pueda chocar. Si
      -- algo fallara aquí, debe fallar visible, no tragarse el error.
      insert into public.pago_aplicaciones (tenant_id, pago_id, cargo_id, monto)
      values (p_tenant_id, v_pago.id, v_cargo.id, v_monto);

      v_disponible := v_disponible - v_monto;
      v_aplicado := v_aplicado + v_monto;
    end loop;
  end loop;

  return v_aplicado;
end;
$$;

comment on function public.fn_aplicar_anticipos(uuid, uuid) is
  'Imputa el remanente no aplicado de los pagos de un inmueble contra sus cargos abiertos (AD-36), '
  'ignorando pagos ya reversados (RC-2). INSERT sin ON CONFLICT desde este fix: la restricción '
  'única que lo motivaba se retiró por descartar en silencio aplicaciones legítimas de un pago '
  'que vuelve a tocar un cargo reabierto. Idempotente: sin remanente o sin cargos abiertos '
  'devuelve 0.';
