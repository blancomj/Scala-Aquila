-- ═══════════════════════════════════════════════════════════════════════
--  FIN-1 · Fix: un compromiso bancario terminal admitía editar cualquier
--  columna que no fuera `estado` (p. ej. `monto`), porque
--  guard_finanzas_compromiso_bancario_transicion solo se dispara
--  "before update of estado" — mismo alcance estrecho que
--  guard_fondo_compromiso_transicion (20260929140000), que tiene el mismo
--  gap sin descubrir todavía en ese módulo (fuera de alcance de este
--  corte corregirlo ahí).
--
--  La prueba obligatoria 4 del corte pide explícitamente "no admite
--  modificación" en general, no solo la transición de estado — encontrado
--  al escribir esa prueba, antes de darla por buena con una aserción más
--  débil. Se agrega el chequeo al inicio de guard_finanzas_compromiso_
--  bancario (que sí se dispara en cualquier UPDATE, todas las columnas).
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.guard_finanzas_compromiso_bancario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuenta public.cuentas_bancarias;
  v_reservado_otros numeric(18, 2);
  v_saldo numeric(18, 2);
begin
  if tg_op = 'UPDATE' and old.estado in ('ejecutado', 'liberado', 'anulado') then
    raise exception 'COMPROMISO_BANCARIO_TERMINAL_INMUTABLE: el compromiso % está % y no admite '
      'modificaciones', old.id, old.estado;
  end if;

  select * into v_cuenta from public.cuentas_bancarias where id = new.cuenta_bancaria_id;

  if v_cuenta.id is null then
    raise exception 'CUENTA_BANCARIA_INEXISTENTE: % no existe', new.cuenta_bancaria_id;
  end if;

  if v_cuenta.tenant_id <> new.tenant_id then
    raise exception 'CUENTA_BANCARIA_TENANT_INCONSISTENTE: la cuenta % no pertenece al tenant %',
      new.cuenta_bancaria_id, new.tenant_id;
  end if;

  if new.origen = 'manual' and new.origen_id is not null then
    raise exception 'COMPROMISO_BANCARIO_ORIGEN_INVALIDO: un compromiso manual no lleva origen_id';
  end if;

  if new.origen in ('factura_proveedor', 'lote_pago') and new.origen_id is null then
    raise exception 'COMPROMISO_BANCARIO_ORIGEN_INVALIDO: un compromiso de origen % exige origen_id',
      new.origen;
  end if;

  if new.estado = 'reservado' then
    select coalesce(sum(fcbc.monto), 0) into v_reservado_otros
      from public.finanzas_cuenta_bancaria_compromiso fcbc
     where fcbc.cuenta_bancaria_id = new.cuenta_bancaria_id
       and fcbc.estado = 'reservado'
       and fcbc.id <> new.id;

    select d.saldo_contable into v_saldo
      from public.fn_cuenta_bancaria_disponible(new.cuenta_bancaria_id, now()) d;

    if v_reservado_otros + new.monto > coalesce(v_saldo, 0) then
      raise exception 'COMPROMISO_BANCARIO_EXCEDE_DISPONIBLE: reservar % dejaría el disponible de '
        'la cuenta % en negativo (saldo %, ya reservado %)',
        new.monto, v_cuenta.numero_cuenta, v_saldo, v_reservado_otros;
    end if;
  end if;

  new.registrado_por := coalesce(new.registrado_por, (select auth.uid()));
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_finanzas_compromiso_bancario() is
  'Valida consistencia de tenant, coherencia de origen/origen_id, y la regla central del corte: '
  'un compromiso reservado no puede dejar fn_cuenta_bancaria_disponible en negativo — mismo '
  'criterio que guard_fondo_compromiso (R9). Un compromiso en estado terminal (ejecutado/'
  'liberado/anulado) rechaza cualquier UPDATE, no solo un cambio de estado.';
