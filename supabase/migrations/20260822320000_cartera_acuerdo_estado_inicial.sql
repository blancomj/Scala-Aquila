-- ═══════════════════════════════════════════════════════════════════════
--  CAR F5 · corrige guard_acuerdo_propuesta(): estado inicial válido
--
--  Mismo hueco que se corrigió en acciones_cobranza (20260822280000,
--  guard_accion_cobranza_propuesta): guard_acuerdo_transicion() solo
--  vigila UPDATE — sin este chequeo, un INSERT directo podía crear un
--  acuerdo ya en 'vigente' y saltarse por completo la aprobación.
--  CREATE OR REPLACE sobre la función de 20260822310000, ya aplicada —
--  mismo criterio que las correcciones anteriores de esta migración serie.
-- ═══════════════════════════════════════════════════════════════════════

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
  new.propuesto_por := (select auth.uid());
  return new;
end;
$$;
