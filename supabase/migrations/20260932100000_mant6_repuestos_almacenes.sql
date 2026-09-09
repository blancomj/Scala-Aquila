-- ═══════════════════════════════════════════════════════════════════════
--  MANT-6 · Inventario de repuestos y costos (1/6)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_06_inventario_costos.md §4.1
--
--  Este archivo: catálogo de repuestos y almacenes. El ledger append-only
--  de movimientos (§4.2) va en 20260932110000 (necesita estas dos tablas
--  ya creadas).
--
--  Repuesto NO es activo (distinción de producto que el propio corte pide
--  preservar, ver el recuadro del mockup de Inventario): un repuesto es
--  material de consumo, no un bien que forma parte del patrimonio. Por eso
--  `mant_repuestos` no reutiliza `activos` ni su `CATEGORIA_ACTIVO`.
--
--  `mant_almacenes.zona_comun_id` reutiliza `zonas_comunes` (ya existe,
--  20260814100100) para la ubicación física — no se crea una jerarquía de
--  ubicación nueva. El detalle fino ("Estante A - Nivel 2") es texto libre
--  en `mant_almacenes.descripcion`: no hay caso de uso que justifique un
--  árbol de 3 niveles (marco §4.1 del corte).
--
--  `contable_cuenta_id` en `mant_repuestos` nace nullable y sin ningún guard
--  que la exija todavía — la política contable (existencias vs. gasto
--  directo) no está definida en este corte (§3 del prompt, marco: "no se
--  resuelve por defecto"). Cuando exista, un corte futuro la usará; hoy es
--  decorativa, documentada como tal.
-- ═══════════════════════════════════════════════════════════════════════

-- ── §4.1 Catálogo — lista_tipos, NO enum (D-24: vocabulario descriptivo) ──
insert into public.tipos (codigo, nombre, descripcion) values
  ('CATEGORIA_REPUESTO', 'Categoría de repuesto',
   'Clasificación de un material o repuesto de consumo (MANT-6 §4.1) — puramente descriptiva, '
   'sin ningún guard que dependa de cuál sea. Distinta de CATEGORIA_ACTIVO (MANT-0): un repuesto '
   'nunca es un bien patrimonial.');

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('CATEGORIA_REPUESTO', 'pintura', 'Pintura y acabados', 10),
  ('CATEGORIA_REPUESTO', 'ferreteria', 'Ferretería general', 20),
  ('CATEGORIA_REPUESTO', 'plomeria', 'Plomería', 30),
  ('CATEGORIA_REPUESTO', 'electrico', 'Eléctrico', 40),
  ('CATEGORIA_REPUESTO', 'aseo_limpieza', 'Aseo y limpieza', 50),
  ('CATEGORIA_REPUESTO', 'seguridad', 'Seguridad', 60),
  ('CATEGORIA_REPUESTO', 'herramientas', 'Herramientas', 70),
  ('CATEGORIA_REPUESTO', 'otros', 'Otros', 80);

-- ── §4.1 mant_repuestos — catálogo de material de consumo ───────────────
create table public.mant_repuestos (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  sku                   text not null,
  nombre                text not null,
  descripcion           text,
  categoria_id          bigint not null references public.lista_tipos (id),
  unidad_id             bigint references public.lista_tipos (id),
  stock_minimo          numeric(18, 4),
  stock_maximo          numeric(18, 4),
  punto_reorden         numeric(18, 4),
  tercero_preferido_id  uuid references public.terceros (id),
  contable_cuenta_id    uuid references public.contable_cuenta (id),
  codigo_barras         text,
  activo                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz,

  constraint mant_repuestos_sku_unico unique (tenant_id, sku),
  constraint mant_repuestos_nombre_no_vacio check (btrim(nombre) <> ''),
  constraint mant_repuestos_umbrales_validos check (
    (stock_minimo is null or stock_minimo >= 0)
    and (stock_maximo is null or stock_maximo >= 0)
    and (punto_reorden is null or punto_reorden >= 0)
    and (stock_minimo is null or stock_maximo is null or stock_minimo <= stock_maximo)
  )
);

alter table public.mant_repuestos enable row level security;
alter table public.mant_repuestos force row level security;

create index mant_repuestos_tenant_idx on public.mant_repuestos (tenant_id);
create index mant_repuestos_categoria_idx on public.mant_repuestos (categoria_id);
create unique index mant_repuestos_codigo_barras_unico on public.mant_repuestos (codigo_barras)
  where codigo_barras is not null;

comment on table public.mant_repuestos is
  'MANT-6 §4.1: catálogo de materiales y repuestos de consumo — nunca un activo (ver '
  'mant_ordenes_trabajo/activos para bienes patrimoniales). El stock actual NUNCA se guarda '
  'aquí: se deriva de mant_inventario_movimientos vía mant_stock().';
comment on column public.mant_repuestos.unidad_id is
  'MANT-1 UNIDAD_MEDIDA, reutilizada — no se crea un segundo catálogo de unidades.';
comment on column public.mant_repuestos.contable_cuenta_id is
  'Solo tiene efecto si la política contable (existencias vs. gasto directo, prompt §3) se '
  'define en un corte futuro — hoy es decorativa: ningún guard la exige ni la usa.';

comment on column public.mant_repuestos.tercero_preferido_id is
  'Proveedor habitual del repuesto — informativo, no exclusivo (un movimiento de entrada puede '
  'traer un tercero distinto).';

-- ── §4.1 mant_almacenes — ubicación de almacenamiento ────────────────────
create table public.mant_almacenes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  nombre        text not null,
  zona_comun_id uuid references public.zonas_comunes (id),
  descripcion   text,
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,

  constraint mant_almacenes_nombre_no_vacio check (btrim(nombre) <> '')
);

alter table public.mant_almacenes enable row level security;
alter table public.mant_almacenes force row level security;

create index mant_almacenes_tenant_idx on public.mant_almacenes (tenant_id);

comment on table public.mant_almacenes is
  'MANT-6 §4.1: ubicaciones de almacenamiento físico. zona_comun_id (opcional) reutiliza '
  'zonas_comunes ya existente — descripcion es texto libre para el detalle fino ("Estante A - '
  'Nivel 2"), no una jerarquía de niveles nueva: no hay caso de uso que la justifique.';

-- ── Guards de ficha (mismo patrón guard_activo_ficha, MANT-0) ────────────
create function public.guard_mant_repuesto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria_tipo text;
  v_unidad_tipo text;
  v_tercero_tenant uuid;
  v_cuenta_tenant uuid;
begin
  select tipo into v_categoria_tipo from public.lista_tipos where id = new.categoria_id;
  if v_categoria_tipo is distinct from 'CATEGORIA_REPUESTO' then
    raise exception 'REPUESTO_CATEGORIA_INVALIDA: categoria_id % no pertenece a CATEGORIA_REPUESTO '
      '(es %)', new.categoria_id, coalesce(v_categoria_tipo, 'inexistente');
  end if;

  if new.unidad_id is not null then
    select tipo into v_unidad_tipo from public.lista_tipos where id = new.unidad_id;
    if v_unidad_tipo is distinct from 'UNIDAD_MEDIDA' then
      raise exception 'REPUESTO_UNIDAD_INVALIDA: unidad_id % no pertenece a UNIDAD_MEDIDA (es %)',
        new.unidad_id, coalesce(v_unidad_tipo, 'inexistente');
    end if;
  end if;

  if new.tercero_preferido_id is not null then
    select tenant_id into v_tercero_tenant from public.terceros where id = new.tercero_preferido_id;
    if v_tercero_tenant is distinct from new.tenant_id then
      raise exception 'REPUESTO_TENANT_INCONSISTENTE: el tercero % no pertenece al tenant',
        new.tercero_preferido_id;
    end if;
  end if;

  if new.contable_cuenta_id is not null then
    select tenant_id into v_cuenta_tenant from public.contable_cuenta where id = new.contable_cuenta_id;
    if v_cuenta_tenant is distinct from new.tenant_id then
      raise exception 'REPUESTO_TENANT_INCONSISTENTE: la cuenta contable % no pertenece al tenant',
        new.contable_cuenta_id;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_mant_repuesto() is
  'MANT-6 §4.1: categoria_id pertenece a CATEGORIA_REPUESTO, unidad_id (si viene) a UNIDAD_MEDIDA, '
  'y las FK opcionales (tercero, cuenta contable) del mismo tenant.';

create trigger mant_repuestos_guard
  before insert or update on public.mant_repuestos
  for each row execute function public.guard_mant_repuesto();

create function public.guard_mant_almacen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zona_tenant uuid;
begin
  if new.zona_comun_id is not null then
    select tenant_id into v_zona_tenant from public.zonas_comunes where id = new.zona_comun_id;
    if v_zona_tenant is distinct from new.tenant_id then
      raise exception 'ALMACEN_TENANT_INCONSISTENTE: la zona común % no pertenece al tenant',
        new.zona_comun_id;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_mant_almacen() is
  'MANT-6 §4.1: zona_comun_id (si viene) debe pertenecer al mismo tenant.';

create trigger mant_almacenes_guard
  before insert or update on public.mant_almacenes
  for each row execute function public.guard_mant_almacen();

-- ── RLS: lectura miembro, escritura auxiliar (mismo patrón que activos) ──
create policy mant_repuestos_select_miembro
  on public.mant_repuestos for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_repuestos_insert_auxiliar
  on public.mant_repuestos for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_repuestos_update_auxiliar
  on public.mant_repuestos for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_almacenes_select_miembro
  on public.mant_almacenes for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_almacenes_insert_auxiliar
  on public.mant_almacenes for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_almacenes_update_auxiliar
  on public.mant_almacenes for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
