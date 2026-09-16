-- ═══════════════════════════════════════════════════════════════════════
--  RPT-01 · Definiciones de reporte y bitácora de ejecución
--  (PLAN_MOTOR_REPORTES.md §5, D-136)
--
--  Aquí sí manda el tenant: un reporte pertenece a una copropiedad y su
--  aislamiento es el de siempre (is_member / has_role).
--
--  Tres piezas:
--    · reportes            — la identidad del reporte (nombre, categoría)
--    · reporte_versiones   — la definición, versionada; publicada = inmutable
--    · reporte_ejecuciones — qué se ejecutó, con qué parámetros y qué salió
--
--  D-24: un solo enum en todo el módulo, `reporte_version_estado_t`, porque
--  es lo único que gatilla transiciones reales (publicar congela la
--  definición, archivar la retira). Categoría va a `lista_tipos`
--  (CATEGORIA_REPORTE) porque es vocabulario descriptivo, y el resultado de
--  una ejecución es un hecho terminal (`exito boolean`), no un estado con
--  ciclo de vida — de ahí que NO haya cola ni estados QUEUED/RUNNING (R-04).
-- ═══════════════════════════════════════════════════════════════════════

create type public.reporte_version_estado_t as enum ('borrador', 'publicada', 'archivada');

comment on type public.reporte_version_estado_t is
  'Ciclo de vida de una versión de reporte. Gatilla transiciones reales, por eso es enum y no '
  'lista_tipos (D-24): `publicada` congela la definición (guard_reporte_version_inmutable) y es '
  'la única que puede ejecutarse desde una programación; `archivada` la retira sin borrar el '
  'historial de ejecuciones que la referencia. De borrador solo se sale publicando.';

-- ── Familia de catálogo para las categorías ────────────────────────────
insert into public.tipos (codigo, nombre, descripcion) values
  ('CATEGORIA_REPORTE', 'Categoría de reporte',
   'Agrupación temática del Centro de Reportes (Cartera, Financiero, Contabilidad…). Vocabulario '
   'descriptivo puro: no gatilla ninguna lógica, por eso vive aquí y no en un enum (D-24).')
on conflict (codigo) do nothing;

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('CATEGORIA_REPORTE', 'CARTERA',          'Cartera',          10),
  ('CATEGORIA_REPORTE', 'CUENTA_CORRIENTE', 'Cuenta corriente', 20),
  ('CATEGORIA_REPORTE', 'FINANCIERO',       'Financiero',       30),
  ('CATEGORIA_REPORTE', 'CONTABILIDAD',     'Contabilidad',     40),
  ('CATEGORIA_REPORTE', 'PRESUPUESTO',      'Presupuesto',      50),
  ('CATEGORIA_REPORTE', 'MANTENIMIENTO',    'Mantenimiento',    60),
  ('CATEGORIA_REPORTE', 'OTROS',            'Otros',            90)
on conflict (tipo, codigo, tenant_id) do nothing;

-- ── reportes ───────────────────────────────────────────────────────────
create table public.reportes (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  codigo       text not null,
  nombre       text not null,
  descripcion  text,
  categoria_id bigint references public.lista_tipos (id),
  -- Reporte que AQUILA entrega de fábrica (§39). Se siembra por migración y
  -- el usuario no puede borrarlo: puede duplicarlo y ajustar la copia, que
  -- es lo que de verdad necesita.
  del_sistema  boolean not null default false,
  creado_por   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,

  constraint reportes_codigo_unico unique (tenant_id, codigo)
);

alter table public.reportes enable row level security;
alter table public.reportes force row level security;

create index reportes_tenant_idx on public.reportes (tenant_id);

-- R-01 (D-136): se mapea a los 12 permisos existentes, sin permisos nuevos.
-- Ver = data:read (los 3 roles) → is_member.
create policy reportes_select_miembro on public.reportes
  for select to authenticated
  using (public.is_member(tenant_id));

-- Crear/editar = settings:manage → auxiliar (administrador entra por
-- herencia, has_role 20260830100000). `auditor` queda fuera, como en el
-- resto de configuración.
create policy reportes_insert_operador on public.reportes
  for insert to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy reportes_update_operador on public.reportes
  for update to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- Los del sistema no se borran: el USING los excluye.
create policy reportes_delete_operador on public.reportes
  for delete to authenticated
  using (
    not del_sistema
    and public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
  );

create trigger set_updated_at before update on public.reportes
  for each row execute function public.set_updated_at();

comment on table public.reportes is
  'Identidad de un reporte dentro de una copropiedad (RPT-01). La definición no vive aquí sino '
  'en reporte_versiones: este registro sobrevive a todas sus versiones. Permisos mapeados a la '
  'matriz existente (D-136 R-01): ver = is_member (data:read), crear/editar = has_role(auxiliar) '
  '(settings:manage) — sin permisos REPORTES_* nuevos.';

comment on column public.reportes.del_sistema is
  'Reporte entregado de fábrica por AQUILA (§39 del prompt). No se puede borrar (política '
  'reportes_delete_operador) — el camino para ajustarlo es duplicarlo.';

-- ── reporte_versiones ──────────────────────────────────────────────────
create table public.reporte_versiones (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  reporte_id    uuid not null references public.reportes (id) on delete cascade,
  version       int not null,
  estado        public.reporte_version_estado_t not null default 'borrador',
  -- Campos, alias, filtros, parámetros, agrupación, orden y presentación.
  -- JSONB porque es configuración compleja sin consultas propias (§15); todo
  -- lo que necesita índice, estado o ciclo de vida quedó relacional.
  definicion    jsonb not null default '{}'::jsonb,
  notas         text,
  creado_por    uuid references public.profiles (id),
  publicada_por uuid references public.profiles (id),
  publicada_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,

  constraint reporte_versiones_unica unique (reporte_id, version),
  constraint reporte_versiones_version_positiva check (version >= 1),
  -- Publicada sin sello de publicación sería una versión inmutable de la que
  -- no se sabe quién la congeló ni cuándo.
  constraint reporte_versiones_sello_publicacion check (
    (estado = 'borrador' and publicada_at is null and publicada_por is null)
    or (estado <> 'borrador' and publicada_at is not null)
  )
);

alter table public.reporte_versiones enable row level security;
alter table public.reporte_versiones force row level security;

create index reporte_versiones_reporte_idx on public.reporte_versiones (reporte_id, version desc);
create index reporte_versiones_tenant_idx on public.reporte_versiones (tenant_id);

create policy reporte_versiones_select_miembro on public.reporte_versiones
  for select to authenticated
  using (public.is_member(tenant_id));

create policy reporte_versiones_insert_operador on public.reporte_versiones
  for insert to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy reporte_versiones_update_operador on public.reporte_versiones
  for update to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy reporte_versiones_delete_borrador on public.reporte_versiones
  for delete to authenticated
  using (
    estado = 'borrador'
    and public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
  );

create trigger set_updated_at before update on public.reporte_versiones
  for each row execute function public.set_updated_at();

-- ── Una versión publicada es inmutable (§38) ───────────────────────────
create function public.guard_reporte_version_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- Un borrador se edita libremente: es justo para lo que existe.
  if old.estado = 'borrador' then
    return new;
  end if;

  -- Publicada o archivada: lo único admisible es archivar una publicada.
  if new.definicion is distinct from old.definicion
     or new.version is distinct from old.version
     or new.reporte_id is distinct from old.reporte_id
     or new.publicada_at is distinct from old.publicada_at
     or new.publicada_por is distinct from old.publicada_por then
    raise exception
      'RPT_VERSION_PUBLICADA_INMUTABLE: la version % ya esta publicada; editarla exige crear una version nueva',
      old.version;
  end if;

  if old.estado = 'publicada' and new.estado not in ('publicada', 'archivada') then
    raise exception
      'RPT_VERSION_PUBLICADA_INMUTABLE: una version publicada solo puede archivarse, no volver a %',
      new.estado;
  end if;

  if old.estado = 'archivada' and new.estado <> 'archivada' then
    raise exception
      'RPT_VERSION_PUBLICADA_INMUTABLE: una version archivada no se reactiva; se crea una version nueva';
  end if;

  return new;
end;
$fn$;

revoke execute on function public.guard_reporte_version_inmutable() from public, anon, authenticated;

create trigger reporte_versiones_inmutable
  before update on public.reporte_versiones
  for each row execute function public.guard_reporte_version_inmutable();

comment on table public.reporte_versiones is
  'Definición versionada de un reporte (RPT-01). Publicar congela: el trigger '
  'reporte_versiones_inmutable impide tocar `definicion` de una versión publicada — editar '
  'obliga a crear la versión siguiente, y las ejecuciones históricas siguen apuntando a la '
  'definición exacta con la que corrieron (§16/§38 del prompt).';

-- ── reporte_ejecuciones ────────────────────────────────────────────────
create table public.reporte_ejecuciones (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  reporte_id    uuid not null references public.reportes (id) on delete cascade,
  version_id    uuid not null references public.reporte_versiones (id),
  -- Parámetros y filtros efectivos, tal como se resolvieron. Es lo que
  -- permite responder "¿cómo se produjo este documento?" (§95).
  parametros    jsonb not null default '{}'::jsonb,
  origen        text not null default 'manual',
  formato       text not null default 'pantalla',
  ejecutado_por uuid references public.profiles (id),
  iniciado_at   timestamptz not null default now(),
  duracion_ms   int,
  filas         int,
  exito         boolean not null,
  error_codigo  text,

  constraint reporte_ejecuciones_origen_valido check (origen in ('manual', 'programada')),
  constraint reporte_ejecuciones_formato_valido check (
    formato in ('pantalla', 'pdf', 'xlsx', 'csv')
  ),
  -- Un fallo sin código no se puede diagnosticar; un éxito con código miente.
  constraint reporte_ejecuciones_error_coherente check (
    (exito and error_codigo is null) or (not exito and error_codigo is not null)
  )
);

alter table public.reporte_ejecuciones enable row level security;
alter table public.reporte_ejecuciones force row level security;

create index reporte_ejecuciones_tenant_idx
  on public.reporte_ejecuciones (tenant_id, iniciado_at desc);
create index reporte_ejecuciones_reporte_idx
  on public.reporte_ejecuciones (reporte_id, iniciado_at desc);

-- Ver el historial = audit:view, que tienen los 3 roles → is_member.
create policy reporte_ejecuciones_select_miembro on public.reporte_ejecuciones
  for select to authenticated
  using (public.is_member(tenant_id));

-- Cualquier miembro que pueda ejecutar deja su rastro; el insert lo hace la
-- propia sesión, no un proceso privilegiado.
create policy reporte_ejecuciones_insert_miembro on public.reporte_ejecuciones
  for insert to authenticated
  with check (public.is_member(tenant_id));

-- Append-only (SEC-14): una bitácora que se puede editar no es bitácora.
create trigger reporte_ejecuciones_append_only
  before update or delete on public.reporte_ejecuciones
  for each row execute function public.forbid_mutation();

comment on table public.reporte_ejecuciones is
  'Bitácora append-only de ejecuciones (RPT-01, §67 observabilidad). Sin cola ni estados '
  'QUEUED/RUNNING (D-136 R-04: la ejecución es síncrona): `exito` es un hecho terminal, no un '
  'ciclo de vida. Guarda los parámetros efectivos y la versión exacta, que es lo que permite '
  'responder cómo se produjo un documento (§95).';
