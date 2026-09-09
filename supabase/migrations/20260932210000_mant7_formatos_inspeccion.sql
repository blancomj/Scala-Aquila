-- ═══════════════════════════════════════════════════════════════════════
--  MANT-7 · Inspecciones, hallazgos y acciones correctivas (2/7)
--
--  Formatos de inspección versionados — mismo patrón que
--  mant_criticidad_set/coeficiente_sets (20260930680000/20260814100100):
--  reutiliza public.vigencia_estado_t tal cual (D-24, marco §3 — no se
--  inventa un enum propio). `codigo` es el identificador estable de la
--  plantilla a través de sus versiones (mismo rol que mant_requisito.codigo);
--  el índice único parcial garantiza un solo `codigo` vigente a la vez.
--
--  NO reutilizo guard_politica_inmutable() tal cual: ese guard bloquea
--  CUALQUIER update una vez vigente/historica, incluida la propia
--  transición vigente→historica que activar una versión nueva necesita
--  (el mismo gap que 20260830220000_coeficiente_set_reemplazar_vigente.sql
--  tuvo que corregir después, y que politicas_financieras/presupuestos
--  dejan sin corregir a propósito según su propio comentario). Para no
--  repetir ese gap conocido, guard_mant_inspeccion_formato_inmutable()
--  permite desde el inicio el único cambio necesario: vigente→historica.
--
--  Los ítems (mant_inspeccion_formato_items) quedan congelados en cuanto
--  el formato deja de ser 'borrador' — mismo criterio que
--  guard_criticidad_set_hijo_inmutable (20260930680000).
--
--  requisito_id (nullable): vincula el formato a la exigencia normativa que
--  demuestra (MANT-2, mant_requisito) — de ahí sale tanto la generación de
--  mant_cumplimiento al completar la inspección como la detección de
--  HALLAZGO_LEGAL_NO_ACEPTABLE (mant_requisito.tipo_fundamento). Un
--  checklist puramente interno deja requisito_id en null.
--
--  severidad_si_no_conforme es NOT NULL en el ítem: toda respuesta
--  'no_conforme' genera un hallazgo (fn_mant_registrar_inspeccion,
--  20260932230000) y un hallazgo siempre necesita severidad — no hay
--  ítem que pueda quedar "sin severidad definida" y disparar un hallazgo.
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_inspeccion_formatos (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  codigo         text not null,
  nombre         text not null,
  tipo_id        bigint not null references public.lista_tipos (id),
  requisito_id   uuid references public.mant_requisito (id),
  version        int not null,
  estado         public.vigencia_estado_t not null default 'borrador',
  vigente_desde  date,
  vigente_hasta  date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,

  constraint mant_inspeccion_formatos_version_unica unique (tenant_id, codigo, version),
  constraint mant_inspeccion_formatos_nombre_no_vacio check (btrim(nombre) <> ''),
  constraint mant_inspeccion_formatos_codigo_no_vacio check (btrim(codigo) <> '')
);

alter table public.mant_inspeccion_formatos enable row level security;
alter table public.mant_inspeccion_formatos force row level security;

create index mant_inspeccion_formatos_tenant_idx on public.mant_inspeccion_formatos (tenant_id);
create index mant_inspeccion_formatos_requisito_idx
  on public.mant_inspeccion_formatos (requisito_id) where requisito_id is not null;
create unique index mant_inspeccion_formatos_vigente_unico
  on public.mant_inspeccion_formatos (tenant_id, codigo)
  where estado = 'vigente';

comment on table public.mant_inspeccion_formatos is
  'MANT-7: plantilla versionada de checklist de inspección. codigo identifica la plantilla a '
  'través de sus versiones (mismo rol que mant_requisito.codigo); solo una versión por codigo '
  'puede estar vigente a la vez. requisito_id (nullable) la ata a la exigencia normativa que '
  'demuestra — de ahí salen INSPECCION_CUMPLIMIENTO_SIN_ACREDITACION y '
  'HALLAZGO_LEGAL_NO_ACEPTABLE.';

create trigger set_updated_at before update on public.mant_inspeccion_formatos
  for each row execute function public.set_updated_at();

create function public.guard_mant_inspeccion_formato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.lista_tipos
    where id = new.tipo_id and tipo = 'TIPO_INSPECCION'
  ) then
    raise exception 'INSPECCION_FORMATO_TIPO_INVALIDO: tipo_id % no pertenece a TIPO_INSPECCION',
      new.tipo_id;
  end if;

  if new.requisito_id is not null
     and not exists (
       select 1 from public.mant_requisito
       where id = new.requisito_id and tenant_id = new.tenant_id
     ) then
    raise exception 'INSPECCION_FORMATO_TENANT_INCONSISTENTE: el requisito % no pertenece al tenant %',
      new.requisito_id, new.tenant_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger guard_mant_inspeccion_formato
  before insert or update on public.mant_inspeccion_formatos
  for each row execute function public.guard_mant_inspeccion_formato();

-- ── Inmutabilidad: permite desde el inicio la transición vigente→historica ──
create function public.guard_mant_inspeccion_formato_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.estado = 'historica' then
    raise exception 'INSPECCION_FORMATO_INMUTABLE: el formato % (versión %) es inmutable en estado %'
      ' — corrige creando una versión nueva', old.id, old.version, old.estado;
  end if;

  if old.estado = 'vigente' then
    if new.estado is distinct from 'historica'
       or new.codigo is distinct from old.codigo
       or new.version is distinct from old.version
       or new.tipo_id is distinct from old.tipo_id
       or new.requisito_id is distinct from old.requisito_id
       or new.vigente_desde is distinct from old.vigente_desde then
      raise exception 'INSPECCION_FORMATO_INMUTABLE: el formato % (versión %) es inmutable en'
        ' estado % — corrige creando una versión nueva', old.id, old.version, old.estado;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_mant_inspeccion_formato_inmutable() is
  'Único cambio permitido sobre un formato vigente: retirarlo a historica (con vigente_hasta) '
  'cuando lo reemplaza una versión nueva — todo lo demás queda bloqueado, igual que '
  'guard_coeficiente_set_inmutable (20260830220000).';

create trigger guard_mant_inspeccion_formato_inmutable
  before update on public.mant_inspeccion_formatos
  for each row execute function public.guard_mant_inspeccion_formato_inmutable();

create policy mant_inspeccion_formatos_select_miembro
  on public.mant_inspeccion_formatos for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_inspeccion_formatos_insert_auxiliar
  on public.mant_inspeccion_formatos for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_inspeccion_formatos_update_auxiliar
  on public.mant_inspeccion_formatos for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ═══════════════════════════════════════════════════════════════════════
--  Ítems del checklist — congelados en cuanto el formato deja de ser
--  'borrador' (mismo criterio que guard_criticidad_set_hijo_inmutable).
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_inspeccion_formato_items (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants (id) on delete cascade,
  formato_id                uuid not null references public.mant_inspeccion_formatos (id) on delete cascade,
  orden                     smallint not null default 0,
  texto                     text not null,
  requiere_evidencia        boolean not null default false,
  severidad_si_no_conforme  public.severidad_t not null,
  created_at                timestamptz not null default now(),

  constraint mant_inspeccion_formato_items_texto_no_vacio check (btrim(texto) <> '')
);

alter table public.mant_inspeccion_formato_items enable row level security;
alter table public.mant_inspeccion_formato_items force row level security;

create index mant_inspeccion_formato_items_tenant_idx on public.mant_inspeccion_formato_items (tenant_id);
create index mant_inspeccion_formato_items_formato_idx on public.mant_inspeccion_formato_items (formato_id, orden);

comment on table public.mant_inspeccion_formato_items is
  'MANT-7: ítem de checklist de un mant_inspeccion_formatos. Congelado en cuanto el formato deja '
  'de ser borrador (guard_mant_inspeccion_formato_item_inmutable) — se corrige creando una '
  'versión nueva del formato.';

create function public.guard_mant_inspeccion_formato_item_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_formato_id uuid := coalesce(new.formato_id, old.formato_id);
  v_tenant_id  uuid := coalesce(new.tenant_id, old.tenant_id);
  v_estado     public.vigencia_estado_t;
  v_formato_tenant uuid;
begin
  select estado, tenant_id into v_estado, v_formato_tenant
    from public.mant_inspeccion_formatos where id = v_formato_id;

  if v_formato_tenant is distinct from v_tenant_id then
    raise exception 'INSPECCION_FORMATO_TENANT_INCONSISTENTE: el formato % no pertenece al tenant %',
      v_formato_id, v_tenant_id;
  end if;

  if v_estado <> 'borrador' then
    raise exception 'INSPECCION_FORMATO_ITEM_INMUTABLE: los ítems del formato % son inmutables en'
      ' estado % — corrige creando una versión nueva del formato', v_formato_id, v_estado;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger guard_mant_inspeccion_formato_item_inmutable
  before insert or update or delete on public.mant_inspeccion_formato_items
  for each row execute function public.guard_mant_inspeccion_formato_item_inmutable();

create policy mant_inspeccion_formato_items_select_miembro
  on public.mant_inspeccion_formato_items for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_inspeccion_formato_items_insert_auxiliar
  on public.mant_inspeccion_formato_items for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_inspeccion_formato_items_update_auxiliar
  on public.mant_inspeccion_formato_items for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_inspeccion_formato_items_delete_auxiliar
  on public.mant_inspeccion_formato_items for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
