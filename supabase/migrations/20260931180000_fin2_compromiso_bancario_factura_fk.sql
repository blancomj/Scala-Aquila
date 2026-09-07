-- ═══════════════════════════════════════════════════════════════════════
--  FIN-2 · Factura de proveedor y retenciones aplicadas (7/7)
--
--  FIN-1 (20260930780000) dejó escrito en su propio comentario que, cuando
--  finanzas_facturas_proveedor existiera, este guard debía completarse con
--  la validación de que origen_id resuelve a una fila real —
--  "cuando esas tablas se creen se agregan los guards de coherencia por
--  trigger, no por FK (FIN-1 §3.1)". Se cierra ahora esa obligación
--  pendiente para 'factura_proveedor'; 'lote_pago' queda igual de
--  pendiente hasta FIN-3 (documentado en FIN_02_INFORME.md).
--
--  Reutiliza el código de error ya registrado (COMPROMISO_BANCARIO_
--  ORIGEN_INVALIDO) en vez de inventar uno nuevo — mismo criterio de
--  MANT-5 (CUENTA_NO_ES_HOJA, ACTIVO_TENANT_INCONSISTENTE).
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

  -- FIN-2: finanzas_facturas_proveedor ya existe — verificar que origen_id resuelve a una fila
  -- real del tenant. 'lote_pago' sigue sin poder validarse (FIN-3 no existe todavía).
  if new.origen = 'factura_proveedor'
     and not exists (
       select 1 from public.finanzas_facturas_proveedor
       where id = new.origen_id and tenant_id = new.tenant_id
     ) then
    raise exception 'COMPROMISO_BANCARIO_ORIGEN_INVALIDO: la factura % no existe o no pertenece '
      'al tenant', new.origen_id;
  end if;

  -- R central del corte: un compromiso reservado nuevo, o el aumento de uno existente, nunca
  -- puede dejar el disponible en negativo (FIN-1 §3.1).
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
  'Valida consistencia de tenant, coherencia de origen/origen_id (incluida la resolución real de '
  'factura_proveedor desde FIN-2 — lote_pago pendiente de FIN-3), y la regla central del corte: '
  'un compromiso reservado no puede dejar fn_cuenta_bancaria_disponible en negativo — mismo '
  'criterio que guard_fondo_compromiso (R9).';
