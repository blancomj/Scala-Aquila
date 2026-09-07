-- ═══════════════════════════════════════════════════════════════════════
--  GOB-3 · fix previo: gobierno_asistencia.inmueble_id debe ser nullable.
--
--  GOB-2 (20260931450000) lo dejó `not null` porque solo modeló asistencia
--  de propietarios/apoderados a una asamblea. GOB-3 necesita registrar la
--  asistencia de un MIEMBRO DE ÓRGANO (calidad='organo') a una reunión de
--  consejo — un revisor fiscal externo, por ejemplo, no necesariamente
--  posee ni representa ningún inmueble (art. 54: el consejo delibera y
--  decide "con independencia de coeficientes", por miembro, no por unidad).
--
--  inmueble_id sigue siendo obligatorio para calidad in ('propietario',
--  'apoderado') — ahí sí representa una unidad con coeficiente real. Para
--  calidad='organo' el coeficiente se fija en 1 (un miembro, un voto,
--  art. 54) — ese valor solo tiene sentido para el conteo por miembros de
--  GOB-3 (gobierno_votaciones cuando el órgano reunido es consejo_
--  administracion); nunca se suma junto a coeficientes reales de asamblea.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.gobierno_asistencia
  alter column inmueble_id drop not null;

alter table public.gobierno_asistencia
  add constraint gobierno_asistencia_inmueble_si_representa_unidad
  check (calidad not in ('propietario', 'apoderado') or inmueble_id is not null);

comment on column public.gobierno_asistencia.inmueble_id is
  'Obligatorio para calidad propietario/apoderado (representa una unidad con coeficiente). '
  'Nulo permitido para invitado/organo — un miembro de órgano (p.ej. revisor fiscal externo) no '
  'necesariamente posee ni representa ningún inmueble (GOB-3, art. 54).';

drop index if exists public.gobierno_asistencia_inmueble_vigente_unico;
create unique index gobierno_asistencia_inmueble_vigente_unico
  on public.gobierno_asistencia (reunion_id, inmueble_id)
  where salida_at is null and inmueble_id is not null;

create or replace function public.guard_gobierno_asistencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_reunion uuid;
  v_fecha date;
  v_estado_reunion public.reunion_estado_t;
  v_tenant_inmueble uuid;
  v_tenant_asistente uuid;
  v_set_id uuid;
  v_es_tenedor boolean;
begin
  select tenant_id, fecha_hora::date, estado into v_tenant_reunion, v_fecha, v_estado_reunion
  from public.gobierno_reuniones where id = new.reunion_id;
  if v_tenant_reunion is distinct from new.tenant_id then
    raise exception 'ASISTENCIA_REUNION_INVALIDA: reunion_id % no pertenece al tenant %', new.reunion_id, new.tenant_id;
  end if;

  if v_estado_reunion in ('cerrada', 'cancelada') then
    raise exception 'ASISTENCIA_REUNION_CERRADA: la reunión % está % — la asistencia es inmutable',
      new.reunion_id, v_estado_reunion;
  end if;

  if new.inmueble_id is not null then
    select tenant_id into v_tenant_inmueble from public.inmuebles where id = new.inmueble_id;
    if v_tenant_inmueble is distinct from new.tenant_id then
      raise exception 'ASISTENCIA_INMUEBLE_INVALIDO: inmueble_id % no pertenece al tenant %', new.inmueble_id, new.tenant_id;
    end if;
  end if;

  select tenant_id into v_tenant_asistente from public.terceros where id = new.asistente_ref;
  if v_tenant_asistente is distinct from new.tenant_id then
    raise exception 'ASISTENCIA_ASISTENTE_INVALIDO: asistente_ref % no pertenece al tenant %', new.asistente_ref, new.tenant_id;
  end if;

  if tg_op = 'INSERT' then
    if new.inmueble_id is not null and exists (
      select 1 from public.gobierno_asistencia a
      where a.reunion_id = new.reunion_id and a.inmueble_id = new.inmueble_id and a.salida_at is null
    ) then
      raise exception 'ASISTENCIA_INMUEBLE_DUPLICADO: el inmueble % ya está representado en esta reunión', new.inmueble_id;
    end if;

    if new.calidad in ('propietario', 'apoderado') then
      select exists (
        select 1 from public.fn_tenedores_vigentes(new.inmueble_id, v_fecha) t
        where t.tercero_id = new.asistente_ref
      ) into v_es_tenedor;
      if v_es_tenedor and new.poder_id is null then
        raise exception 'ASISTENCIA_TENEDOR_SIN_PODER: % es tenedor del inmueble % y no puede '
          'asistir con calidad % sin poder', new.asistente_ref, new.inmueble_id, new.calidad;
      end if;
    end if;

    if new.calidad = 'invitado' then
      new.coeficiente := 0;
    elsif new.calidad = 'organo' then
      -- Un miembro, un voto (art. 54) — solo tiene sentido para el conteo por miembros de GOB-3
      -- (reunión de consejo_administracion). Nunca se suma junto a coeficientes reales.
      new.coeficiente := 1;
    else
      v_set_id := public.fn_coeficiente_set_vigente(new.tenant_id, v_fecha);
      if v_set_id is null then
        raise exception 'ASISTENCIA_SIN_COEFICIENTE_SET: no hay un coeficiente_sets vigente para % en %',
          new.tenant_id, v_fecha;
      end if;
      select valor into new.coeficiente from public.coeficientes where set_id = v_set_id and inmueble_id = new.inmueble_id;
      if new.coeficiente is null then
        raise exception 'ASISTENCIA_INMUEBLE_SIN_COEFICIENTE: el inmueble % no tiene coeficiente '
          'asignado en el set vigente %', new.inmueble_id, v_set_id;
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_gobierno_asistencia() is
  'GOB-2/GOB-3: ASISTENCIA_REUNION_INVALIDA/ASISTENCIA_INMUEBLE_INVALIDO/ASISTENCIA_ASISTENTE_'
  'INVALIDO (tenant), ASISTENCIA_REUNION_CERRADA, ASISTENCIA_INMUEBLE_DUPLICADO (solo si '
  'inmueble_id no es null), ASISTENCIA_TENEDOR_SIN_PODER. Coeficiente: invitado=0, organo=1 (un '
  'miembro un voto, art. 54, GOB-3), propietario/apoderado resuelto desde '
  'fn_coeficiente_set_vigente (ASISTENCIA_INMUEBLE_SIN_COEFICIENTE si falta).';
