-- ═══════════════════════════════════════════════════════════════════════
--  GOB-2 · fix: asistencia y poderes deben quedar inmutables cuando la
--  reunión ya no está en curso.
--
--  Hallazgo real de la verificación manual en el navegador (no de las 14
--  pruebas del corte, que no lo ejercitan): guard_gobierno_asistencia y
--  guard_gobierno_poder validaban tenant/tenedor/coeficiente, pero NUNCA
--  miraban el estado de la reunión — una vez 'cerrada' (o 'cancelada'), la
--  UI seguía permitiendo registrar un nuevo ingreso, una salida, o un poder
--  nuevo. Esto contradice el mismo principio de inmutabilidad que ya rige
--  gobierno_reuniones (REUNION_CERRADA_INMUTABLE) y gobierno_agenda_puntos
--  (AGENDA_INMUTABLE_TRAS_INSTALAR, más estricto todavía).
-- ═══════════════════════════════════════════════════════════════════════

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

  select tenant_id into v_tenant_inmueble from public.inmuebles where id = new.inmueble_id;
  if v_tenant_inmueble is distinct from new.tenant_id then
    raise exception 'ASISTENCIA_INMUEBLE_INVALIDO: inmueble_id % no pertenece al tenant %', new.inmueble_id, new.tenant_id;
  end if;

  select tenant_id into v_tenant_asistente from public.terceros where id = new.asistente_ref;
  if v_tenant_asistente is distinct from new.tenant_id then
    raise exception 'ASISTENCIA_ASISTENTE_INVALIDO: asistente_ref % no pertenece al tenant %', new.asistente_ref, new.tenant_id;
  end if;

  if tg_op = 'INSERT' then
    if exists (
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
  'GOB-2: ASISTENCIA_REUNION_INVALIDA/ASISTENCIA_INMUEBLE_INVALIDO/ASISTENCIA_ASISTENTE_INVALIDO '
  '(tenant), ASISTENCIA_REUNION_CERRADA (reunión cerrada/cancelada, inmutable), '
  'ASISTENCIA_INMUEBLE_DUPLICADO, ASISTENCIA_TENEDOR_SIN_PODER (GOB-0: fn_tenedores_vigentes), y '
  'congelamiento del coeficiente desde fn_coeficiente_set_vigente (invitado siempre 0; '
  'ASISTENCIA_INMUEBLE_SIN_COEFICIENTE si el inmueble no tiene fila en el set).';

create or replace function public.guard_gobierno_poder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_reunion uuid;
  v_estado_reunion public.reunion_estado_t;
  v_tenant_otorgante uuid;
  v_tenant_apoderado uuid;
  v_tenant_inmueble uuid;
begin
  select tenant_id, estado into v_tenant_reunion, v_estado_reunion
  from public.gobierno_reuniones where id = new.reunion_id;
  select tenant_id into v_tenant_otorgante from public.terceros where id = new.otorgante_ref;
  select tenant_id into v_tenant_apoderado from public.terceros where id = new.apoderado_ref;
  select tenant_id into v_tenant_inmueble from public.inmuebles where id = new.inmueble_id;

  if v_tenant_reunion is distinct from new.tenant_id
     or v_tenant_otorgante is distinct from new.tenant_id
     or v_tenant_apoderado is distinct from new.tenant_id
     or v_tenant_inmueble is distinct from new.tenant_id then
    raise exception 'PODER_REFERENCIA_INVALIDA: reunion_id/otorgante_ref/apoderado_ref/inmueble_id '
      'deben pertenecer al tenant %', new.tenant_id;
  end if;

  if tg_op = 'INSERT' and v_estado_reunion in ('cerrada', 'cancelada') then
    raise exception 'PODER_REUNION_CERRADA: la reunión % está % — no admite poderes nuevos',
      new.reunion_id, v_estado_reunion;
  end if;

  if new.validado_at is not null and (tg_op = 'INSERT' or old.validado_at is null) and new.documento_id is null then
    raise exception 'PODER_SIN_SOPORTE: el poder no puede validarse sin documento_id';
  end if;

  return new;
end;
$$;

comment on function public.guard_gobierno_poder() is
  'GOB-2: PODER_REFERENCIA_INVALIDA (tenant), PODER_REUNION_CERRADA (reunión cerrada/cancelada, '
  'no admite poderes nuevos), PODER_SIN_SOPORTE (validar sin documento_id).';
