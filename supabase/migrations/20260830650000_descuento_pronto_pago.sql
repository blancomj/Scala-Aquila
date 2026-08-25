-- ═══════════════════════════════════════════════════════════════════════
--  D3 · Descuento por pronto pago
--  Propietario: plan "Liquidación en dos tiempos" (2026-08-24), decisión D3
--
--  ═══ LA PIEZA QUE FALTABA HACE TIEMPO ═══
--
--  La cuenta 4695 «Descuento por pronto pago» está sembrada y mapeada desde
--  20260830470000, y la cuenta presupuestal existe desde la semilla de PC-2b.
--  Pero ningún código la producía: el descuento era una cuenta esperando un
--  mecanismo.
--
--  ═══ POR QUÉ AL IMPUTAR EL PAGO, Y NO AL LIQUIDAR (D3) ═══
--
--  Porque el descuento depende de CUÁNDO paga el residente, y ese dato no
--  existe cuando se liquida. Ponerlo en la liquidación obligaría a emitir un
--  cargo condicional «si paga antes del 10» y reversarlo cuando no cumple —
--  cargos que nacen para morir. Aquí se emite solo cuando el hecho ya
--  ocurrió: el pago entró, y entró a tiempo.
--
--  ═══ LOS DOS MODOS (pedidos por el usuario) ═══
--
--    reduce_deuda    El residente PAGA MENOS. Con cuota de 100.000 y 5%,
--                    paga 95.000 antes de la fecha y queda a paz y salvo:
--                    el sistema ve que cubrió el neto y emite el cargo
--                    negativo de 5.000 que cierra el saldo. Es lo más común
--                    en PH colombiana.
--
--    saldo_a_favor   El residente PAGA COMPLETO y el descuento le queda como
--                    crédito para el mes siguiente. Más simple de calcular,
--                    pero el beneficio no se percibe en el momento.
--
--  La diferencia operativa está en cuánto tiene que pagar para ganárselo:
--  en reduce_deuda basta cubrir el neto (cuota − descuento); en
--  saldo_a_favor hay que cubrir la cuota entera.
--
--  ═══ QUÉ NO CUBRE ═══
--
--  Solo capital originado en una liquidación. Un pago imputado a intereses
--  de mora o a una novedad no genera descuento — premiar el pronto pago de
--  un interés de mora sería contradictorio, y las novedades (multas,
--  ajustes) no son la cuota que el descuento busca incentivar.
-- ═══════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════
--  1. Configuración, en la política financiera
-- ═══════════════════════════════════════════════════════════════════════
-- Va aquí y no en tenant_configuracion por lo mismo que reconocimiento_
-- ingreso (L4): es una regla que decide dinero, la política vigente es
-- inmutable, y cambiarla obliga a versionarla. Cuando un residente pregunte
-- «¿por qué este mes no me dieron el descuento?», la respuesta está en qué
-- política regía ese día.

create type public.descuento_pronto_pago_modo_t as enum ('reduce_deuda', 'saldo_a_favor');

comment on type public.descuento_pronto_pago_modo_t is
  'Cómo se materializa el descuento por pronto pago: reduce_deuda (el residente paga el neto y '
  'queda a paz y salvo) o saldo_a_favor (paga completo y el descuento le queda como crédito). '
  'ENUM y no lista_tipos (D-24) porque fn_aplicar_descuento_pronto_pago ramifica sobre él para '
  'decidir cuánto debe haber pagado antes de otorgarlo — un valor fuera del vocabulario dejaría '
  'la regla sin definir.';

alter table public.politicas_financieras
  add column descuento_pronto_pago_porcentaje numeric(5, 2) not null default 0
    check (descuento_pronto_pago_porcentaje >= 0 and descuento_pronto_pago_porcentaje <= 100),
  add column descuento_pronto_pago_dias int not null default 0
    check (descuento_pronto_pago_dias >= 0),
  add column descuento_pronto_pago_modo public.descuento_pronto_pago_modo_t
    not null default 'reduce_deuda';

comment on column public.politicas_financieras.descuento_pronto_pago_porcentaje is
  'Porcentaje de descuento sobre el capital del periodo. 0 = desactivado, que es el default: '
  'ninguna copropiedad empieza a dar descuentos porque el sistema se actualizó.';

comment on column public.politicas_financieras.descuento_pronto_pago_dias is
  'Días de anticipación respecto a periodos.fecha_vencimiento. Con 5, el pago debe entrar el día '
  'del vencimiento menos 5 o antes.';


-- ═══════════════════════════════════════════════════════════════════════
--  2. El descuento es un cargo negativo con origen propio
-- ═══════════════════════════════════════════════════════════════════════
-- Un origen nuevo, no reutilizar 'novedad': una novedad es una decisión
-- humana que alguien aprueba, y esto lo produce una regla automática. Que se
-- distingan importa para auditar y para explicarle al residente de dónde
-- salió la línea.
--
-- Postgres no deja usar un valor de enum recién agregado en la misma
-- transacción, y supabase db push corre cada migración en una — de ahí el
-- swap de tipo, igual que en L0.

create type public.cargo_origen_nuevo_t as enum (
  'liquidacion_linea', 'novedad', 'interes', 'descuento'
);

comment on type public.cargo_origen_nuevo_t is
  'Nombre transitorio del swap de tipo (D-24 exige COMMENT en todo enum nuevo; el escáner lee los '
  'create type). El definitivo se aplica tras el rename.';

-- v_cargo_saldo referencia origen_tipo, y Postgres no deja alterar el tipo de
-- una columna de la que depende una vista. Se recrea idéntica después del
-- swap — verificado que es la ÚNICA vista dependiente de cargos.
drop view public.v_cargo_saldo;

alter table public.cargos drop constraint cargos_origen_unico;
alter table public.cargos
  alter column origen_tipo type public.cargo_origen_nuevo_t
  using origen_tipo::text::public.cargo_origen_nuevo_t;
drop type public.cargo_origen_t;
alter type public.cargo_origen_nuevo_t rename to cargo_origen_t;

-- Reconstruida tal cual estaba, sin aprovechar para añadirle columnas: la
-- consume código que no es de este corte, y un cambio de forma aquí sería
-- una modificación de contrato disfrazada de efecto colateral.
create view public.v_cargo_saldo with (security_invoker = true) as
select
  c.id,
  c.tenant_id,
  c.inmueble_id,
  c.periodo_id,
  c.categoria,
  c.origen_tipo,
  c.liquidacion_linea_id,
  c.novedad_id,
  c.cargo_capital_origen_id,
  c.concepto_id,
  c.monto_original,
  c.created_at,
  c.monto_original - coalesce(
    (select sum(pa.monto) from public.pago_aplicaciones pa where pa.cargo_id = c.id), 0
  ) as monto_pendiente,
  c.fecha_vencimiento
from public.cargos c;

-- Recrear una vista la deja sin los privilegios que tenía. Se reponen tal
-- como estaban (los que Supabase concede por defecto en public) en vez de
-- confiar en que se hereden solos.
grant all on public.v_cargo_saldo to authenticated, service_role;

comment on view public.v_cargo_saldo is
  'Cargos con su saldo pendiente derivado (monto_original menos lo aplicado). security_invoker: '
  'la RLS de cargos decide qué ve cada quien. Recreada sin cambios de forma en 20260830650000, '
  'solo porque el swap del enum cargo_origen_t exigía soltarla.';

comment on type public.cargo_origen_t is
  'De dónde nace un cargo: liquidacion_linea (la cuota liquidada), novedad (una decisión humana '
  'aprobada), interes (mora sobre un capital), descuento (pronto pago, automático y negativo). '
  'ENUM y no lista_tipos (D-24): gobierna el CHECK cargos_origen_unico, que exige que la columna '
  'de respaldo corresponda al origen declarado.';

-- El descuento cuelga del capital al que premia — misma columna que usa el
-- interés de mora, y por la misma razón: sin ese vínculo no se sabría sobre
-- qué se calculó.
alter table public.cargos
  add constraint cargos_origen_unico check (
    (origen_tipo = 'liquidacion_linea' and liquidacion_linea_id is not null and novedad_id is null and cargo_capital_origen_id is null)
    or (origen_tipo = 'novedad' and novedad_id is not null and liquidacion_linea_id is null and cargo_capital_origen_id is null)
    or (origen_tipo = 'interes' and cargo_capital_origen_id is not null and liquidacion_linea_id is null and novedad_id is null)
    or (origen_tipo = 'descuento' and cargo_capital_origen_id is not null and liquidacion_linea_id is null and novedad_id is null)
  );


-- ═══════════════════════════════════════════════════════════════════════
--  3. La regla
-- ═══════════════════════════════════════════════════════════════════════
-- Se evalúa por cada cargo de capital que el pago tocó, no por el pago
-- entero: un pago puede cubrir varios periodos, y cada uno tiene su propia
-- fecha de vencimiento y por tanto su propio derecho al descuento.

create function public.fn_aplicar_descuento_pronto_pago(p_pago_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pago      public.pagos%rowtype;
  v_pol       public.politicas_financieras%rowtype;
  v_cargo     record;
  v_descuento numeric(18, 2);
  v_emitidos  int := 0;
begin
  select * into v_pago from public.pagos where id = p_pago_id;
  if v_pago.id is null then return 0; end if;

  select * into v_pol from public.politicas_financieras
   where tenant_id = v_pago.tenant_id and estado = 'vigente';

  -- Sin política vigente o con el descuento apagado no hay nada que hacer.
  if v_pol.id is null or v_pol.descuento_pronto_pago_porcentaje = 0 then
    return 0;
  end if;

  for v_cargo in
    select c.id,
           c.tenant_id,
           c.inmueble_id,
           c.periodo_id,
           c.monto_original,
           p.fecha_vencimiento,
           -- Lo aplicado a ESTE cargo por cualquier pago, no solo por el
           -- actual: el derecho al descuento depende de si el capital quedó
           -- cubierto, sin importar en cuántos pagos llegó.
           coalesce((select sum(pa2.monto) from public.pago_aplicaciones pa2
                     where pa2.cargo_id = c.id), 0) as cubierto
    from public.pago_aplicaciones pa
    join public.cargos c on c.id = pa.cargo_id
    join public.periodos p on p.id = c.periodo_id
    where pa.pago_id = p_pago_id
      and c.categoria = 'capital'
      and c.origen_tipo = 'liquidacion_linea'
      and c.monto_original > 0
      and p.fecha_vencimiento is not null
      -- A tiempo: el pago entró con la anticipación exigida.
      and v_pago.fecha_pago <= p.fecha_vencimiento - v_pol.descuento_pronto_pago_dias
      -- Sin descuento previo sobre este mismo capital.
      and not exists (
        select 1 from public.cargos d
        where d.cargo_capital_origen_id = c.id and d.origen_tipo = 'descuento'
      )
  loop
    v_descuento := round(v_cargo.monto_original * v_pol.descuento_pronto_pago_porcentaje / 100, 2);
    if v_descuento <= 0 then continue; end if;

    -- Aquí está la única diferencia entre los dos modos: cuánto hay que
    -- haber pagado para ganárselo.
    --   reduce_deuda  → basta cubrir el neto (cuota − descuento)
    --   saldo_a_favor → hay que cubrir la cuota entera
    if v_pol.descuento_pronto_pago_modo = 'reduce_deuda' then
      if v_cargo.cubierto < v_cargo.monto_original - v_descuento then continue; end if;
    else
      if v_cargo.cubierto < v_cargo.monto_original then continue; end if;
    end if;

    -- Negativo: reduce lo que la unidad debe. Sin concepto_id a propósito —
    -- el descuento no es menos ingreso de la cuenta presupuestal de la cuota,
    -- es un rubro propio (4695), y ponerlo ahí lo restaría del ejecutado de
    -- la cuota, que sí se causó completa.
    insert into public.cargos (
      tenant_id, inmueble_id, periodo_id, categoria, origen_tipo,
      cargo_capital_origen_id, monto_original
    )
    values (
      v_cargo.tenant_id, v_cargo.inmueble_id, v_cargo.periodo_id, 'otro', 'descuento',
      v_cargo.id, -v_descuento
    );
    v_emitidos := v_emitidos + 1;
  end loop;

  return v_emitidos;
end;
$$;

comment on function public.fn_aplicar_descuento_pronto_pago(uuid) is
  'Emite el descuento por pronto pago (D3) como cargo negativo contra el capital que premia, si '
  'el pago entró con la anticipación exigida y cubrió lo necesario según el modo. Solo capital de '
  'liquidación: premiar el pronto pago de un interés de mora sería contradictorio. Idempotente — '
  'no emite dos descuentos sobre el mismo capital.';


-- ═══════════════════════════════════════════════════════════════════════
--  4. Cuándo se dispara
-- ═══════════════════════════════════════════════════════════════════════
-- Trigger sobre pago_aplicaciones, no un paso dentro de registrar-pago: así
-- cubre cualquier camino que impute un pago (hoy la Edge Function, mañana
-- una carga masiva o una conciliación bancaria) y corre dentro de la misma
-- transacción que la imputación.
--
-- De sentencia y no de fila: registrarPago() inserta todas las aplicaciones
-- de un pago juntas, y la regla se evalúa una vez por pago.

create function public.trg_descuento_pronto_pago()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pago uuid;
begin
  for v_pago in select distinct pago_id from nuevas loop
    perform public.fn_aplicar_descuento_pronto_pago(v_pago);
  end loop;
  return null;
end;
$$;

create trigger trg_descuento_pronto_pago
  after insert on public.pago_aplicaciones
  referencing new table as nuevas
  for each statement execute function public.trg_descuento_pronto_pago();

comment on function public.trg_descuento_pronto_pago() is
  'Dispara el descuento por pronto pago al imputar un pago (D3). No hace nada si la política '
  'vigente lo tiene en 0, que es el default.';
