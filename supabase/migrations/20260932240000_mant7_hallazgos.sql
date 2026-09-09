-- ═══════════════════════════════════════════════════════════════════════
--  MANT-7 · Inspecciones, hallazgos y acciones correctivas (5/7)
--
--  mant_hallazgos: la brecha detectada por una inspección — no es una fila
--  de mant_cumplimiento (esa es evidencia positiva), tiene su propio ciclo
--  de vida (abierto → en_tratamiento/aceptado → cerrado) con guards duros:
--
--  - HALLAZGO_LEGAL_NO_ACEPTABLE: se detecta subiendo desde el hallazgo →
--    su inspección → el formato de esa inspección → mant_requisito.
--    tipo_fundamento (MANT-2). Si el formato no tiene requisito_id, el
--    hallazgo nunca puede ser "legal" — Plan del corte §5-D.
--  - HALLAZGO_ACEPTACION_SIN_JUSTIFICACION: exige motivo siempre; exige
--    además organo_aprobador_id (gobierno_organos, GOB-1) para severidad
--    crítica SOLO si el tenant tiene al menos un órgano vigente — Plan
--    del corte §5-C, condición por tenant, no por si el módulo existe.
--  - HALLAZGO_CIERRE_SIN_EVIDENCIA: crítico/mayor exige
--    cerrado_evidencia_documento_id verificado para cerrar.
--
--  mant_hallazgo_actuaciones: bitácora append-only, mismo patrón que
--  caso_juridico_actuaciones (20260822340000) — la insertan las funciones
--  de §6 (siguiente migración) junto con el cambio de estado, nunca sola.
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_hallazgos (
  id                             uuid primary key default gen_random_uuid(),
  tenant_id                      uuid not null references public.tenants (id) on delete cascade,
  inspeccion_id                  uuid not null references public.mant_inspecciones (id),
  descripcion                    text not null,
  severidad                      public.severidad_t not null,
  estado                         public.hallazgo_estado_t not null default 'abierto',
  fecha_limite                   date,
  ot_id                          uuid references public.mant_ordenes_trabajo (id),
  aceptado_motivo                text,
  aceptado_por                   uuid references public.profiles (id),
  aceptado_at                    timestamptz,
  organo_aprobador_id            uuid references public.gobierno_organos (id),
  cerrado_evidencia_documento_id uuid references public.documentos (id),
  cerrado_at                     timestamptz,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz,

  constraint mant_hallazgos_descripcion_no_vacia check (btrim(descripcion) <> '')
);

alter table public.mant_hallazgos enable row level security;
alter table public.mant_hallazgos force row level security;

create index mant_hallazgos_tenant_idx on public.mant_hallazgos (tenant_id);
create index mant_hallazgos_inspeccion_idx on public.mant_hallazgos (inspeccion_id);
create index mant_hallazgos_ot_idx on public.mant_hallazgos (ot_id) where ot_id is not null;
create index mant_hallazgos_abiertos_idx on public.mant_hallazgos (tenant_id, severidad, created_at)
  where estado not in ('cerrado');

comment on table public.mant_hallazgos is
  'MANT-7: no conformidad detectada por una inspección. Un hallazgo con severidad crítico/mayor '
  'exige fecha_limite al crearse, evidencia verificada para cerrarse, y (crítico) aprobación del '
  'órgano competente de GOB-1 al aceptarse si el tenant tiene alguno vigente. Un hallazgo cuya '
  'inspección demuestra un requisito legal_nacional/legal_territorial nunca puede aceptarse.';

create trigger set_updated_at before update on public.mant_hallazgos
  for each row execute function public.set_updated_at();

-- ── Guard de inserción: tenant consistente + fecha_limite obligatoria ──
create function public.guard_mant_hallazgo_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inspeccion_tenant uuid;
begin
  select tenant_id into v_inspeccion_tenant
    from public.mant_inspecciones where id = new.inspeccion_id;
  if v_inspeccion_tenant is distinct from new.tenant_id then
    raise exception 'HALLAZGO_TENANT_INCONSISTENTE: la inspección % no pertenece al tenant %',
      new.inspeccion_id, new.tenant_id;
  end if;

  if new.severidad in ('critico', 'mayor') and new.fecha_limite is null then
    raise exception 'HALLAZGO_SIN_FECHA_LIMITE: un hallazgo de severidad % exige fecha_limite',
      new.severidad;
  end if;

  return new;
end;
$$;

create trigger guard_mant_hallazgo_insert
  before insert on public.mant_hallazgos
  for each row execute function public.guard_mant_hallazgo_insert();

-- Solo se crea como subproducto de fn_mant_registrar_inspeccion (misma bandera de sesión que
-- mant_inspecciones/mant_inspeccion_respuestas — reutiliza guard_mant_inspeccion_flag, 20260932220000).
create trigger guard_mant_inspeccion_flag
  before insert on public.mant_hallazgos
  for each row execute function public.guard_mant_inspeccion_flag();

-- ── Guard de transición: aceptar/cerrar ──
create function public.guard_mant_hallazgo_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requisito_id         uuid;
  v_tipo_fundamento      public.requisito_tipo_t;
  v_tiene_organo_vigente boolean;
begin
  if new.ot_id is distinct from old.ot_id and new.ot_id is not null
     and not exists (
       select 1 from public.mant_ordenes_trabajo where id = new.ot_id and tenant_id = new.tenant_id
     ) then
    raise exception 'HALLAZGO_TENANT_INCONSISTENTE: la OT % no pertenece al tenant %',
      new.ot_id, new.tenant_id;
  end if;

  if new.estado is distinct from old.estado and new.estado = 'aceptado' then
    select f.requisito_id into v_requisito_id
      from public.mant_inspecciones i
      join public.mant_inspeccion_formatos f on f.id = i.formato_id
     where i.id = new.inspeccion_id;

    if v_requisito_id is not null then
      select tipo_fundamento into v_tipo_fundamento
        from public.mant_requisito where id = v_requisito_id;
      if v_tipo_fundamento in ('legal_nacional', 'legal_territorial') then
        raise exception 'HALLAZGO_LEGAL_NO_ACEPTABLE: el hallazgo % es de origen % — nunca puede'
          ' aceptarse, debe tratarse o fijársele un plazo', new.id, v_tipo_fundamento;
      end if;
    end if;

    if new.aceptado_motivo is null or btrim(new.aceptado_motivo) = '' then
      raise exception 'HALLAZGO_ACEPTACION_SIN_JUSTIFICACION: aceptar el hallazgo % exige motivo',
        new.id;
    end if;

    if new.severidad = 'critico' then
      select exists (
        select 1 from public.gobierno_organos
        where tenant_id = new.tenant_id and vigente_hasta is null
      ) into v_tiene_organo_vigente;

      if v_tiene_organo_vigente and new.organo_aprobador_id is null then
        raise exception 'HALLAZGO_ACEPTACION_SIN_JUSTIFICACION: el tenant tiene GOB-1 vigente —'
          ' aceptar un hallazgo crítico exige organo_aprobador_id (%)', new.id;
      end if;

      if new.organo_aprobador_id is not null and not exists (
        select 1 from public.gobierno_organos
        where id = new.organo_aprobador_id and tenant_id = new.tenant_id and vigente_hasta is null
      ) then
        raise exception 'HALLAZGO_TENANT_INCONSISTENTE: organo_aprobador_id % no es un órgano'
          ' vigente del tenant', new.organo_aprobador_id;
      end if;
    end if;

    new.aceptado_at := now();
  end if;

  if new.estado is distinct from old.estado and new.estado = 'cerrado' then
    if new.severidad in ('critico', 'mayor') and new.cerrado_evidencia_documento_id is null then
      raise exception 'HALLAZGO_CIERRE_SIN_EVIDENCIA: cerrar el hallazgo % (severidad %) exige'
        ' evidencia verificada', new.id, new.severidad;
    end if;
    new.cerrado_at := now();
  end if;

  return new;
end;
$$;

comment on function public.guard_mant_hallazgo_transicion() is
  'MANT-7: HALLAZGO_LEGAL_NO_ACEPTABLE (origen legal_nacional/legal_territorial, nunca aceptable), '
  'HALLAZGO_ACEPTACION_SIN_JUSTIFICACION (sin motivo, o crítico sin órgano cuando el tenant tiene '
  'GOB-1 vigente), HALLAZGO_CIERRE_SIN_EVIDENCIA (crítico/mayor sin evidencia verificada).';

create trigger guard_mant_hallazgo_transicion
  before update on public.mant_hallazgos
  for each row execute function public.guard_mant_hallazgo_transicion();

create policy mant_hallazgos_select_miembro
  on public.mant_hallazgos for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_hallazgos_update_auxiliar
  on public.mant_hallazgos for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- Sin policy de insert para authenticated: guard_mant_inspeccion_flag ya lo impide fuera de
-- fn_mant_registrar_inspeccion, así que ninguna policy de insert directo es necesaria ni deseable.
-- Sin policy de delete: un hallazgo nunca se borra, se cierra o se acepta.

-- ═══════════════════════════════════════════════════════════════════════
--  Bitácora append-only — mismo patrón que caso_juridico_actuaciones.
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_hallazgo_actuaciones (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  hallazgo_id       uuid not null references public.mant_hallazgos (id) on delete cascade,
  fecha             date not null default current_date,
  tipo_actuacion_id bigint not null references public.lista_tipos (id),
  descripcion       text not null,
  estado_desde      public.hallazgo_estado_t,
  estado_hasta      public.hallazgo_estado_t,
  registrada_por    uuid not null references public.profiles (id),
  created_at        timestamptz not null default now()
);

alter table public.mant_hallazgo_actuaciones enable row level security;
alter table public.mant_hallazgo_actuaciones force row level security;

create index mant_hallazgo_actuaciones_tenant_idx on public.mant_hallazgo_actuaciones (tenant_id);
create index mant_hallazgo_actuaciones_hallazgo_idx on public.mant_hallazgo_actuaciones (hallazgo_id);

comment on table public.mant_hallazgo_actuaciones is
  'MANT-7: bitácora append-only de un hallazgo — fuente de verdad histórica de qué pasó y '
  'cuándo, mismo criterio que caso_juridico_actuaciones (CAR §15.4). La insertan las funciones '
  'de asignación/aceptación/cierre (20260932250000) junto con el cambio de estado, no un cliente '
  'suelto.';

create function public.guard_mant_hallazgo_actuacion_registrada_por()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.registrada_por := (select auth.uid());
  return new;
end;
$$;

create trigger guard_mant_hallazgo_actuacion_registrada_por
  before insert on public.mant_hallazgo_actuaciones
  for each row execute function public.guard_mant_hallazgo_actuacion_registrada_por();

create trigger mant_hallazgo_actuaciones_append_only
  before update or delete on public.mant_hallazgo_actuaciones
  for each row execute function public.forbid_mutation();

create policy mant_hallazgo_actuaciones_select_miembro
  on public.mant_hallazgo_actuaciones for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_hallazgo_actuaciones_insert_auxiliar
  on public.mant_hallazgo_actuaciones for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
