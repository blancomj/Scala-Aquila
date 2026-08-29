-- ═══════════════════════════════════════════════════════════════════════
--  Acuerdos de pago (CAR §12.3, bloque 19) — consecutivo estampado por el
--  servidor, mismo mecanismo que certificaciones_deuda/casos_juridicos/
--  recibo_caja (fn_siguiente_consecutivo, RC-3): guard_acuerdo_propuesta lo
--  asigna siempre, nunca se confía del cliente. NOT NULL a nivel de columna
--  era redundante con esa garantía y rompía el I/O directo desde TS (mismo
--  motivo que 20260907100000 para casos_juridicos).
--
--  CREATE OR REPLACE sobre la función de 20260822320000 (que ya corrigió
--  ACUERDO_ESTADO_INICIAL_INVALIDO) — se conserva ese chequeo íntegro y
--  solo se agrega el estampado del consecutivo.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.acuerdos_pago
  alter column consecutivo drop not null;

create or replace function public.guard_acuerdo_propuesta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado <> 'borrador' then
    raise exception 'ACUERDO_ESTADO_INICIAL_INVALIDO: un acuerdo de pago solo puede crearse en '
      'borrador, no %', new.estado;
  end if;
  new.consecutivo := public.fn_siguiente_consecutivo(new.tenant_id, 'acuerdo_pago');
  new.propuesto_por := (select auth.uid());
  return new;
end;
$$;
