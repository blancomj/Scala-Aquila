-- ═══════════════════════════════════════════════════════════════════════
--  costas_judiciales.actuacion_id — CAR §16, I-C11, roadmap §3.2 (hueco
--  "menor prioridad" documentado el 2026-08-29).
--
--  Por qué NO se cambia documento_fuente por documento_id (a diferencia de
--  caso_juridico_actuaciones/acuerdos_pago/documentos.envio_id, que sí
--  llevan ese patrón): documento_fuente es la EVIDENCIA OBLIGATORIA de la
--  costa (I-C11, "sin esto no existe la costa") y hoy no hay flujo de
--  registro que exija subir un archivo antes de crear la costa — volverla
--  `documento_id not null` rompería registrarCosta() sin construir antes un
--  selector/carga de documento (deliberadamente diferido en todo el
--  módulo, ver §3.2 "visual al final"). documento_fuente se queda como
--  está: la cita legible que exige I-C11.
--
--  Lo que sí se resuelve, y es justo lo que el propio roadmap señaló como
--  la salida barata: normalmente el soporte real de una costa ES la misma
--  actuación judicial que la liquidó (el auto que la fija). Con
--  actuacion_id, una costa puede apuntar a esa actuación — y en cuanto esa
--  actuación tenga su documento_id (20260908160000) cargado, la costa
--  queda con evidencia real navegable sin necesitar su propia columna
--  documento_id ni su propio flujo de carga.
--
--  Nullable, mismo criterio que el resto del módulo: no toda costa nace
--  con la actuación exacta ya identificada. Se valida y se congela en los
--  DOS guards ya existentes (guard_costa_judicial_insert/_transicion) en
--  vez de un trigger aparte — actuacion_id es evidencia igual que
--  documento_fuente/fecha_decision/autoridad, así que sigue exactamente el
--  mismo régimen: se fija al crear, inmutable después (I-C11).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.costas_judiciales
  add column actuacion_id uuid references public.caso_juridico_actuaciones (id);

comment on column public.costas_judiciales.actuacion_id is
  'CAR §16, I-C11 — nullable. La actuación judicial (típicamente el auto que liquida la '
  'costa) que la respalda; su documento_id (20260908160000), cuando exista, es la evidencia '
  'real navegable. No sustituye documento_fuente, que sigue siendo la cita obligatoria. '
  'Inmutable tras el insert, igual que el resto de la evidencia (guard_costa_judicial_transicion).';

create or replace function public.guard_costa_judicial_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caso_actuacion uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para registrar una costa judicial';
  end if;

  if new.actuacion_id is not null then
    select caso_id into v_caso_actuacion
    from public.caso_juridico_actuaciones
    where id = new.actuacion_id;

    if v_caso_actuacion is null then
      raise exception 'ACTUACION_INVALIDA: % no existe', new.actuacion_id;
    end if;
    if v_caso_actuacion is distinct from new.caso_id then
      raise exception 'ACTUACION_INVALIDA: % no pertenece al caso %', new.actuacion_id, new.caso_id;
    end if;
  end if;

  new.registrada_por := (select auth.uid());
  return new;
end;
$$;

create or replace function public.guard_costa_judicial_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id
     or new.caso_id is distinct from old.caso_id
     or new.tipo_costa is distinct from old.tipo_costa
     or new.monto is distinct from old.monto
     or new.documento_fuente is distinct from old.documento_fuente
     or new.fecha_decision is distinct from old.fecha_decision
     or new.autoridad is distinct from old.autoridad
     or new.actuacion_id is distinct from old.actuacion_id
     or new.registrada_por is distinct from old.registrada_por
  then
    raise exception 'COSTA_JUDICIAL_INMUTABLE: la evidencia de una costa judicial (%) no se '
      'puede modificar — solo estado y monto_recuperado (I-C11)', old.id;
  end if;
  return new;
end;
$$;
