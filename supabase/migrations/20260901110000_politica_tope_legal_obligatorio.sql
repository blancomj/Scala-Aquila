-- ═══════════════════════════════════════════════════════════════════════
--  S2 (auditoría externa 2026-08-26, Docs/evaluacion/02) — el tope legal
--  del interés de mora (GAP-CAR-004, 20260822220000) era opt-in sin límite
--  de tiempo: cualquier política nueva podía simplemente no declarar
--  interes_tipo_tasa/interes_multiplicador y quedar sin validar contra el
--  art. 30 Ley 675/2001, no solo las políticas anteriores al cambio.
--
--  Decisión del usuario (2026-08-26): a partir de ahora es obligatorio
--  para toda política que declare interés de mora. Se mantiene opt-in
--  únicamente para una política que no cobra interés de mora en absoluto
--  (interes_tasa_mensual e interes_tope_mensual ambos null) — no hay nada
--  que topar en ese caso.
--
--  Por qué esto alcanza solo a pólizas "nuevas" sin tocar las legadas: el
--  trigger ya tenía dos salidas tempranas que esta migración no toca —
--  `new.estado <> 'vigente'` y, sobre todo, `TG_OP = 'UPDATE' and
--  old.estado = 'vigente'` (una política que YA estaba vigente y se
--  actualiza sin cambiar de estado nunca llega a este chequeo). Lo único
--  que queda sujeto a la regla nueva es exactamente lo que el hallazgo
--  señalaba: un INSERT o una activación (transición hacia 'vigente') que
--  nace hoy.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.guard_politica_financiera_tope_legal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_valor_mensual_referencia numeric(8, 6);
  v_tope_legal numeric(8, 6);
begin
  if new.estado <> 'vigente' then
    return new;
  end if;
  if TG_OP = 'UPDATE' and old.estado = 'vigente' then
    return new;
  end if;

  if new.interes_tipo_tasa is null or new.interes_multiplicador is null then
    -- S2: sin tipo/multiplicador declarados, solo se acepta si la política
    -- tampoco cobra interés de mora — nada que topar, nada que validar.
    if new.interes_tasa_mensual is not null or new.interes_tope_mensual is not null then
      raise exception 'TOPE_LEGAL_NO_DECLARADO: una política que declara interes_tasa_mensual o '
        'interes_tope_mensual debe declarar también interes_tipo_tasa e interes_multiplicador, '
        'para poder validarse contra el tope legal (art. 30 Ley 675 de 2001) — S2, auditoría '
        '2026-08-26. Una política sin interés de mora puede omitir los tres campos.';
    end if;
    return new;
  end if;

  select valor_mensual into v_valor_mensual_referencia
    from public.tasas_referencia
   where tipo_tasa = new.interes_tipo_tasa
     and vigente_desde <= coalesce(new.vigente_desde, current_date)
     and (vigente_hasta is null or vigente_hasta >= coalesce(new.vigente_desde, current_date))
   order by vigente_desde desc
   limit 1;

  if v_valor_mensual_referencia is null then
    raise exception 'TASA_REFERENCIA_NO_ENCONTRADA: no hay una tasa de referencia % '
      'vigente a la fecha de la política % (CAR §3.4)', new.interes_tipo_tasa, new.id;
  end if;

  v_tope_legal := new.interes_multiplicador * v_valor_mensual_referencia;

  if new.interes_tope_mensual is not null and new.interes_tope_mensual > v_tope_legal then
    raise exception 'INTERES_EXCEDE_TOPE_LEGAL: interes_tope_mensual (%) excede % × tasa '
      'de referencia vigente (%) = % — art. 30 Ley 675 de 2001 (CAR §3.1)',
      new.interes_tope_mensual, new.interes_multiplicador, v_valor_mensual_referencia,
      v_tope_legal;
  end if;

  if new.interes_tasa_mensual is not null and new.interes_tasa_mensual > v_tope_legal then
    raise exception 'INTERES_EXCEDE_TOPE_LEGAL: interes_tasa_mensual (%) excede % × tasa '
      'de referencia vigente (%) = % — art. 30 Ley 675 de 2001 (CAR §3.1)',
      new.interes_tasa_mensual, new.interes_multiplicador, v_valor_mensual_referencia,
      v_tope_legal;
  end if;

  return new;
end;
$$;

comment on function public.guard_politica_financiera_tope_legal() is
  'PH-C36/PH-C37: rechaza activar una política financiera cuyo interés de mora excede '
  'multiplicador × la tasa de referencia declarada. La asamblea puede fijar menos que el tope '
  '(art. 30 L675, PH-C37), nunca más (PH-C36). Desde S2 (auditoría 2026-08-26), declarar '
  'interes_tasa_mensual/interes_tope_mensual sin interes_tipo_tasa/interes_multiplicador ya no '
  'se acepta en silencio — TOPE_LEGAL_NO_DECLARADO. Solo una política sin interés de mora puede '
  'omitir los tres campos.';
