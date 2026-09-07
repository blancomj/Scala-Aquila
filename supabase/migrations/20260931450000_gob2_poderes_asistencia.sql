-- ═══════════════════════════════════════════════════════════════════════
--  GOB-2 · gobierno_poderes / gobierno_asistencia
--  Ver GOB_02_reunion_convocatoria_asistencia.md §4.4, pruebas 2, 6-11
--
--  No existe en todo el repo ninguna tabla de poder/apoderado (confirmado
--  por grep en el Plan del corte) — el único rastro previo es el código
--  'apoderado' en lista_tipos.PERSONA_PREDIO, que es una ETIQUETA DE ROL
--  sobre un inmueble, no un poder. gobierno_poderes es genuinamente nuevo.
--
--  Límite de poderes por apoderado: por decisión explícita (Plan del
--  corte), NO se implementa ningún tope por defecto — es REMISIÓN AL
--  REGLAMENTO (marco §3) sin piso legal citado; inventar un número violaría
--  la prohibición #3 del marco ("no inventes reglas jurídicas"). Pregunta
--  abierta para el abogado, sin resolver aquí.
--
--  El coeficiente de cada asistencia se resuelve de forma INDEPENDIENTE al
--  coeficiente_set_id (todavía nulo) de gobierno_reuniones: ambos llaman a
--  fn_coeficiente_set_vigente(tenant_id, fecha_hora::date) con la misma
--  fecha, así que siempre coinciden — el registro de asistencia ocurre
--  antes de instalar (en la puerta), cuando la reunión todavía no congeló
--  su propio coeficiente_set_id.
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_poderes (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  reunion_id        uuid not null references public.gobierno_reuniones (id) on delete cascade,
  otorgante_ref     uuid not null references public.terceros (id),
  inmueble_id       uuid not null references public.inmuebles (id),
  apoderado_ref     uuid not null references public.terceros (id),
  documento_id      uuid references public.documentos (id),
  alcance           text,
  validado_por      uuid references public.profiles (id),
  validado_at       timestamptz,
  rechazado_motivo  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);

alter table public.gobierno_poderes enable row level security;
alter table public.gobierno_poderes force row level security;

create index gobierno_poderes_tenant_idx on public.gobierno_poderes (tenant_id);
create index gobierno_poderes_reunion_idx on public.gobierno_poderes (reunion_id);
create index gobierno_poderes_apoderado_idx on public.gobierno_poderes (apoderado_ref);

comment on table public.gobierno_poderes is
  'GOB-2: poder de representación de un otorgante (propietario/tenedor) a un apoderado, para una '
  'reunión específica. Sin documento_id no puede validarse (PODER_SIN_SOPORTE). Límite de '
  'poderes por apoderado: sin implementar, remisión al reglamento sin piso legal citado — '
  'pregunta abierta para el abogado (marco §3).';

create policy gobierno_poderes_select_miembro
  on public.gobierno_poderes for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_poderes_insert_auxiliar
  on public.gobierno_poderes for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy gobierno_poderes_update_auxiliar
  on public.gobierno_poderes for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.guard_gobierno_poder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_reunion uuid;
  v_tenant_otorgante uuid;
  v_tenant_apoderado uuid;
  v_tenant_inmueble uuid;
begin
  select tenant_id into v_tenant_reunion from public.gobierno_reuniones where id = new.reunion_id;
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

  -- Validar (poner validado_at) exige documento_id — sin importar si viene en el mismo INSERT
  -- o en un UPDATE posterior.
  if new.validado_at is not null and (tg_op = 'INSERT' or old.validado_at is null) and new.documento_id is null then
    raise exception 'PODER_SIN_SOPORTE: el poder no puede validarse sin documento_id';
  end if;

  return new;
end;
$$;

comment on function public.guard_gobierno_poder() is
  'GOB-2: PODER_REFERENCIA_INVALIDA (tenant), PODER_SIN_SOPORTE (validar sin documento_id).';

create trigger guard_gobierno_poder
  before insert or update on public.gobierno_poderes
  for each row execute function public.guard_gobierno_poder();

create trigger set_updated_at before update on public.gobierno_poderes
  for each row execute function public.set_updated_at();

-- ── gobierno_asistencia ────────────────────────────────────────────────
create table public.gobierno_asistencia (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  reunion_id            uuid not null references public.gobierno_reuniones (id) on delete cascade,
  inmueble_id           uuid not null references public.inmuebles (id),
  asistente_ref         uuid not null references public.terceros (id),
  calidad               public.asistencia_calidad_t not null,
  poder_id              uuid references public.gobierno_poderes (id),
  coeficiente           numeric(12, 10) not null default 0,
  ingreso_at            timestamptz not null default now(),
  salida_at             timestamptz,
  modalidad_asistencia  text,

  constraint gobierno_asistencia_salida_valida check (salida_at is null or salida_at >= ingreso_at),
  constraint gobierno_asistencia_modalidad_valida
    check (modalidad_asistencia is null or modalidad_asistencia in ('presencial', 'remota')),
  constraint gobierno_asistencia_poder_si_apoderado
    check (calidad <> 'apoderado' or poder_id is not null)
);

alter table public.gobierno_asistencia enable row level security;
alter table public.gobierno_asistencia force row level security;

create index gobierno_asistencia_tenant_idx on public.gobierno_asistencia (tenant_id);
create index gobierno_asistencia_reunion_idx on public.gobierno_asistencia (reunion_id);
create unique index gobierno_asistencia_inmueble_vigente_unico
  on public.gobierno_asistencia (reunion_id, inmueble_id) where salida_at is null;

comment on table public.gobierno_asistencia is
  'GOB-2: registro de asistencia y representación a una reunión, con el coeficiente congelado '
  'desde el coeficiente_sets vigente a la fecha de la reunión (fn_coeficiente_set_vigente) — no '
  'se lee en vivo. ingreso_at/salida_at existen porque el quórum puede cambiar durante la '
  'sesión; GOB-3 lo calculará al momento de cada votación, no una vez al inicio.';

create policy gobierno_asistencia_select_miembro
  on public.gobierno_asistencia for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_asistencia_insert_auxiliar
  on public.gobierno_asistencia for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy gobierno_asistencia_update_auxiliar
  on public.gobierno_asistencia for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.guard_gobierno_asistencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_reunion uuid;
  v_fecha date;
  v_tenant_inmueble uuid;
  v_tenant_asistente uuid;
  v_set_id uuid;
  v_es_tenedor boolean;
begin
  select tenant_id, fecha_hora::date into v_tenant_reunion, v_fecha
  from public.gobierno_reuniones where id = new.reunion_id;
  if v_tenant_reunion is distinct from new.tenant_id then
    raise exception 'ASISTENCIA_REUNION_INVALIDA: reunion_id % no pertenece al tenant %', new.reunion_id, new.tenant_id;
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
    -- Un inmueble no puede estar representado dos veces simultáneamente (índice único parcial
    -- ya lo impide con un error genérico; se anticipa aquí con el código propio).
    if exists (
      select 1 from public.gobierno_asistencia a
      where a.reunion_id = new.reunion_id and a.inmueble_id = new.inmueble_id and a.salida_at is null
    ) then
      raise exception 'ASISTENCIA_INMUEBLE_DUPLICADO: el inmueble % ya está representado en esta reunión', new.inmueble_id;
    end if;

    -- Un tenedor (arrendatario/inquilino/locatario/usufructuario) no puede figurar con calidad
    -- propietario ni apoderado salvo que tenga poder otorgado por el propietario (GOB-0).
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
  '(tenant), ASISTENCIA_INMUEBLE_DUPLICADO, ASISTENCIA_TENEDOR_SIN_PODER (GOB-0: '
  'fn_tenedores_vigentes), y congelamiento del coeficiente desde fn_coeficiente_set_vigente '
  '(invitado siempre 0; ASISTENCIA_INMUEBLE_SIN_COEFICIENTE si el inmueble no tiene fila en el '
  'set).';

create trigger guard_gobierno_asistencia
  before insert or update on public.gobierno_asistencia
  for each row execute function public.guard_gobierno_asistencia();

create or replace function public.gobierno_reunion_coeficiente_actual(p_reunion_id uuid)
returns numeric(12, 10)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(a.coeficiente), 0)
  from public.gobierno_asistencia a
  where a.reunion_id = p_reunion_id and a.calidad <> 'invitado' and a.salida_at is null
$$;

comment on function public.gobierno_reunion_coeficiente_actual(uuid) is
  'GOB-2: coeficiente acumulado EN VIVO de quienes siguen presentes (salida_at is null), '
  'excluyendo invitados — se calcula, no se almacena (marco §6.3). Indicador de quórum en '
  'tiempo real para la UI de registro de asistencia (§4.5).';
