-- ═══════════════════════════════════════════════════════════════════════
--  GOB-3 · gobierno_quorum() — cálculo de quórum deliberatorio
--  Ver GOB_03_quorum_votacion.md §4.3
--
--  Recibe el MOMENTO, no la fecha de la reunión: el quórum cambia cuando
--  alguien entra o sale (GOB-2: ingreso_at/salida_at), y cada votación se
--  evalúa con el quórum de su instante.
--
--  Ramifica según el tipo de órgano de la reunión (art. 54): consejo_
--  administracion se calcula por MIEMBROS vigentes del órgano, sin importar
--  coeficientes; cualquier otro tipo (asamblea_general y el resto) se
--  calcula por coeficientes del set congelado en la reunión.
--
--  hay_pluralidad implementa "número plural de propietarios" (art. 45): un
--  solo propietario con el 60% de los coeficientes NO hace quórum, incluso
--  si además trae poderes de otros — se cuentan personas distintas
--  (asistente_ref), no inmuebles ni coeficientes.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.gobierno_quorum(p_reunion_id uuid, p_momento timestamptz)
returns table (
  coeficiente_total       numeric,
  coeficiente_presente    numeric,
  propietarios_presentes  integer,
  pct_presente            numeric,
  hay_pluralidad          boolean,
  quorum_deliberatorio    boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_organo_id uuid;
  v_fecha date;
  v_organo_tipo_codigo text;
  v_coef_total numeric;
  v_coef_presente numeric;
  v_prop_presentes integer;
  v_pct numeric;
begin
  select r.tenant_id, r.organo_id, r.fecha_hora::date, lt.codigo
    into v_tenant_id, v_organo_id, v_fecha, v_organo_tipo_codigo
  from public.gobierno_reuniones r
  join public.gobierno_organos o on o.id = r.organo_id
  join public.lista_tipos lt on lt.id = o.tipo_id
  where r.id = p_reunion_id;

  if v_organo_tipo_codigo = 'consejo_administracion' then
    select count(*) into v_coef_total
    from public.gobierno_miembros m
    where m.organo_id = v_organo_id and m.desde <= v_fecha and (m.hasta is null or m.hasta >= v_fecha);

    select count(distinct a.asistente_ref) into v_prop_presentes
    from public.gobierno_asistencia a
    where a.reunion_id = p_reunion_id and a.calidad = 'organo'
      and a.ingreso_at <= p_momento and (a.salida_at is null or a.salida_at > p_momento);

    v_coef_presente := v_prop_presentes;
    v_pct := case when v_coef_total > 0 then (v_coef_presente / v_coef_total) * 100 else 0 end;

    return query select v_coef_total, v_coef_presente, v_prop_presentes, v_pct,
      true, (v_pct > 50);
  else
    select coalesce(cs.suma_total, 0) into v_coef_total
    from public.gobierno_reuniones r
    left join public.coeficiente_sets cs
      on cs.id = coalesce(r.coeficiente_set_id, public.fn_coeficiente_set_vigente(r.tenant_id, v_fecha))
    where r.id = p_reunion_id;

    select coalesce(sum(a.coeficiente), 0), count(distinct a.asistente_ref)
      into v_coef_presente, v_prop_presentes
    from public.gobierno_asistencia a
    where a.reunion_id = p_reunion_id and a.calidad in ('propietario', 'apoderado')
      and a.ingreso_at <= p_momento and (a.salida_at is null or a.salida_at > p_momento);

    v_pct := case when v_coef_total > 0 then (v_coef_presente / v_coef_total) * 100 else 0 end;

    return query select v_coef_total, v_coef_presente, v_prop_presentes, v_pct,
      (v_prop_presentes > 1), (v_prop_presentes > 1 and v_pct > 50);
  end if;
end;
$$;

comment on function public.gobierno_quorum(uuid, timestamptz) is
  'GOB-3: quórum deliberatorio de una reunión al momento p_momento (no a la fecha de la reunión '
  '— el quórum cambia con cada ingreso/salida, GOB-2). Ramifica por tipo de órgano: '
  'consejo_administracion cuenta miembros vigentes (art. 54, sin coeficientes); el resto cuenta '
  'coeficientes del set congelado en la reunión. hay_pluralidad: más de una persona distinta '
  '(asistente_ref) presente con calidad propietario/apoderado — un solo propietario con mayoría '
  'de coeficientes, incluso con poderes, NO hace quórum (art. 45).';
