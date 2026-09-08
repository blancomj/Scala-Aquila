-- ═══════════════════════════════════════════════════════════════════════
--  GOB-4 · gobierno_dias_habiles_entre — contador para la UI del acta
--  (§4.7: "contador de días hábiles restantes para la puesta a disposición").
-- ═══════════════════════════════════════════════════════════════════════

create function public.gobierno_dias_habiles_entre(p_desde date, p_hasta date)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v_fecha date := p_desde;
  v_dias int := 0;
  v_signo int;
begin
  if p_hasta = p_desde then
    return 0;
  end if;
  v_signo := case when p_hasta > p_desde then 1 else -1 end;
  while v_fecha <> p_hasta loop
    v_fecha := v_fecha + v_signo;
    if public.gobierno_es_dia_habil(v_fecha) then
      v_dias := v_dias + v_signo;
    end if;
  end loop;
  return v_dias;
end;
$$;

comment on function public.gobierno_dias_habiles_entre(date, date) is
  'GOB-4: días hábiles entre dos fechas, con signo (positivo si p_hasta es posterior a p_desde, '
  'negativo si es anterior — permite mostrar "vencido hace N días hábiles"). Usada por la UI del '
  'acta para el contador de días hábiles restantes hasta plazo_disposicion_limite.';
