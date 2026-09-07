-- ═══════════════════════════════════════════════════════════════════════
--  GOB-4 · Motor de días hábiles colombianos
--  Ver GOB_04_acta.md §3 — "implementa el plazo con una función de días
--  hábiles explícita y probada, no con una resta de días naturales".
--  Búsqueda previa (grep en todo el repo): no existe ninguna función de
--  días hábiles/festivos en todo el proyecto — genuinamente nueva.
--
--  Ley 51 de 1983 ("Ley Emiliani"), texto verificado cruzando 3+ fuentes
--  secundarias (WebFetch directo a funcionpublica.gov.co/alcaldiabogota.gov.co
--  volvió a fallar por TLS, mismo problema de entorno documentado en
--  CO-1/MANT-0/GOB-2/GOB-3): de los 18 festivos, 6 son de fecha fija y NUNCA
--  se trasladan (1 ene, 1 may, 20 jul, 7 ago, 8 dic, 25 dic); 2 dependen de
--  la Pascua y tampoco se trasladan (jueves y viernes santo, siempre en su
--  fecha litúrgica exacta); los 10 restantes SÍ se trasladan al lunes
--  siguiente cuando no caen en lunes (también si caen domingo) — 7 de fecha
--  fija (6 ene, 19 mar, 29 jun, 15 ago, 12 oct, 1 nov, 11 nov) y 3 basados en
--  la Pascua (Ascensión +39, Corpus Christi +60, Sagrado Corazón +68).
--
--  Offsets de Pascua verificados por consistencia interna: Pascua 2026 = 5
--  de abril (algoritmo de Gauss/Meeus-Jones-Butcher, estándar, sin necesidad
--  de fuente externa — es aritmética del calendario gregoriano, no un hecho
--  legal) reproduce exactamente las fechas de Ascensión/Corpus Christi/
--  Sagrado Corazón de 2026 (18 mayo, 8 junio, 15 junio) que dan calendarios
--  de referencia independientes.
-- ═══════════════════════════════════════════════════════════════════════

create function public.gobierno_pascua(p_anio integer)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int;
  v_mes int; v_dia int;
begin
  a := p_anio % 19;
  b := p_anio / 100;
  c := p_anio % 100;
  d := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  v_mes := (h + l - 7 * m + 114) / 31;
  v_dia := ((h + l - 7 * m + 114) % 31) + 1;
  return make_date(p_anio, v_mes, v_dia);
end;
$$;

comment on function public.gobierno_pascua(integer) is
  'GOB-4: domingo de Pascua para un año dado — algoritmo de Meeus/Jones/Butcher (gregoriano), '
  'aritmética de calendario estándar, no un hecho legal que requiera fuente primaria. Base para '
  'jueves/viernes santo (no se trasladan) y Ascensión/Corpus Christi/Sagrado Corazón (Ley 51/1983, '
  'sí se trasladan al lunes siguiente).';

create function public.gobierno_trasladar_lunes(p_fecha date)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_fecha + (((8 - extract(isodow from p_fecha)::int) % 7))::int;
$$;

comment on function public.gobierno_trasladar_lunes(date) is
  'GOB-4: Ley 51 de 1983 art. 1 — traslada una fecha al lunes siguiente si no cae en lunes '
  '(también si cae domingo); si ya es lunes, la deja igual.';

create function public.gobierno_festivos_colombia(p_anio integer)
returns setof date
language sql
stable
set search_path = ''
as $$
  with pascua as (select public.gobierno_pascua(p_anio) as fecha)
  -- Fijos, nunca se trasladan.
  select make_date(p_anio, 1, 1)
  union all select make_date(p_anio, 5, 1)
  union all select make_date(p_anio, 7, 20)
  union all select make_date(p_anio, 8, 7)
  union all select make_date(p_anio, 12, 8)
  union all select make_date(p_anio, 12, 25)
  -- Semana Santa: fecha litúrgica exacta, nunca se traslada.
  union all select fecha - 3 from pascua
  union all select fecha - 2 from pascua
  -- Ley Emiliani: fecha fija que se traslada al lunes siguiente si no cae en lunes.
  union all select public.gobierno_trasladar_lunes(make_date(p_anio, 1, 6))
  union all select public.gobierno_trasladar_lunes(make_date(p_anio, 3, 19))
  union all select public.gobierno_trasladar_lunes(make_date(p_anio, 6, 29))
  union all select public.gobierno_trasladar_lunes(make_date(p_anio, 8, 15))
  union all select public.gobierno_trasladar_lunes(make_date(p_anio, 10, 12))
  union all select public.gobierno_trasladar_lunes(make_date(p_anio, 11, 1))
  union all select public.gobierno_trasladar_lunes(make_date(p_anio, 11, 11))
  -- Ley Emiliani: basados en Pascua, se trasladan al lunes siguiente.
  union all select public.gobierno_trasladar_lunes(fecha + 39) from pascua
  union all select public.gobierno_trasladar_lunes(fecha + 60) from pascua
  union all select public.gobierno_trasladar_lunes(fecha + 68) from pascua
$$;

comment on function public.gobierno_festivos_colombia(integer) is
  'GOB-4: los 18 festivos colombianos de un año (Ley 51 de 1983 art. 1, verificada por fuente '
  'secundaria — WebFetch directo a dominios .gov.co falló por TLS). 6 fijos + 2 de Semana Santa '
  'nunca se trasladan; 10 (7 de fecha fija + 3 basados en Pascua) se trasladan al lunes siguiente.';

create function public.gobierno_es_dia_habil(p_fecha date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select extract(isodow from p_fecha) < 6
    and not exists (
      select 1 from public.gobierno_festivos_colombia(extract(year from p_fecha)::int) f
      where f = p_fecha
    );
$$;

comment on function public.gobierno_es_dia_habil(date) is
  'GOB-4: ni sábado/domingo ni festivo colombiano (gobierno_festivos_colombia del año de la fecha).';

create function public.gobierno_sumar_dias_habiles(p_fecha date, p_dias integer)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_fecha date := p_fecha;
  v_restantes int := p_dias;
begin
  if p_dias < 0 then
    raise exception 'DIAS_HABILES_NEGATIVO: p_dias % debe ser >= 0', p_dias;
  end if;
  while v_restantes > 0 loop
    v_fecha := v_fecha + 1;
    if public.gobierno_es_dia_habil(v_fecha) then
      v_restantes := v_restantes - 1;
    end if;
  end loop;
  return v_fecha;
end;
$$;

comment on function public.gobierno_sumar_dias_habiles(date, integer) is
  'GOB-4: suma p_dias días HÁBILES a p_fecha (salta sábados, domingos y festivos colombianos). '
  'Usada para plazo_disposicion_limite (art. 47 inc. 3, techo de 20 días hábiles) y el plazo por '
  'defecto de la comisión verificadora (art. 47 inc. 2). DIAS_HABILES_NEGATIVO si p_dias < 0.';
