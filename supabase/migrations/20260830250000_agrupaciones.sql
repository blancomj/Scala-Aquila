-- ═══════════════════════════════════════════════════════════════════════
--  Agrupaciones de inmuebles — árbol por copropiedad (Edificio > Piso,
--  Manzana > Lote, Etapa > Torre > Piso, o un solo nivel).
--
--  Motivación: no existía NINGUNA forma de agrupar inmuebles. `inmuebles`
--  no tenía ni una columna para ello, y el catálogo AGRUPACION_PREDIOS
--  (sembrado en 20260814180000 con bloque/edificio/zona/manzana/piso/
--  etapa/unidad/nivel) quedó huérfano: ninguna tabla ni línea de código lo
--  referenciaba. Esta migración lo conecta.
--
--  Por qué un ÁRBOL y no dos columnas fijas ("agrupacion_1"/"agrupacion_2"):
--  lo que se pide como "combinar Edificio + Piso" es en realidad una
--  jerarquía — el Piso 3 pertenece AL Edificio A. Con dos columnas planas
--  (a) el "Piso 3" del Edificio A y el del Edificio B serían el mismo
--  texto y filtrar los mezclaría, (b) no existiría la entidad "Edificio A"
--  (no se puede renombrar de una vez, ni colgarle nada después, y un error
--  de digitación crea un grupo fantasma), y (c) quedaría un tope rígido de
--  2 niveles — insuficiente para conjuntos por etapas, que la Ley 675 de
--  2001 (art. 5, escrituras adicionales por etapa) reconoce explícitamente.
--
--  Deliberadamente NO se materializan `nivel`, `ruta` ni `es_hoja`: son
--  derivables del árbol, que es chico (decenas de nodos por copropiedad) y
--  el cliente carga entero. Materializarlos obligaría a cascadas en cada
--  renombrado/reparentado — justo la clase de estado desincronizable que
--  presupuesto_cuenta.ruta ya documenta como limitación conocida
--  (20260823200000). La profundidad y los ciclos SÍ se validan en el
--  guard, recorriendo hacia arriba.
--
--  Un inmueble pertenece a UNA sola agrupación (decisión explícita del
--  usuario). No se exige que sea hoja: un inmueble puede colgar de
--  "Edificio A" aunque después se creen pisos bajo él — filtrar por un
--  nodo incluye siempre su subárbol (agrupacion_subarbol).
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Catálogo AGRUPACION_PREDIOS: completar y depurar ─────────────────
--  Faltaban 'sector' y 'lote'. 'unidad' se desactiva: en la práctica
--  "Unidad" ES el inmueble (el apartamento), no un grupo que lo contenga —
--  dejarlo activo invita a crear grupos de un solo elemento. No se borra
--  porque lista_tipos es catálogo de referencia compartido; se apaga.
insert into public.lista_tipos (tipo, codigo, nombre, orden, activo)
values
  ('AGRUPACION_PREDIOS', 'sector', 'Sector', 9, true),
  ('AGRUPACION_PREDIOS', 'lote', 'Lote', 10, true)
on conflict (tipo, codigo, tenant_id) do nothing;

update public.lista_tipos
   set activo = false
 where tipo = 'AGRUPACION_PREDIOS' and codigo = 'unidad' and tenant_id is null;

-- ── 2. agrupaciones ────────────────────────────────────────────────────
create table public.agrupaciones (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid   not null references public.tenants (id) on delete cascade,
  -- null = raíz. `restrict`: una agrupación con hijos no se borra por accidente.
  parent_id  uuid   references public.agrupaciones (id) on delete restrict,
  -- Qué ES este nodo (Edificio, Piso, Manzana...) — familia AGRUPACION_PREDIOS.
  tipo_id    bigint not null references public.lista_tipos (id),
  -- El identificador dentro de su padre: "A", "3", "12". El tipo da el resto
  -- del significado, así que aquí no se repite ("Edificio A" se arma para
  -- mostrar, no se almacena duplicado).
  nombre     text   not null,
  orden      int    not null default 0,
  activa     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,

  constraint agrupaciones_nombre_no_vacio check (length(trim(nombre)) > 0),
  -- NULLS NOT DISTINCT: dos raíces del mismo tenant tampoco pueden repetir
  -- nombre (sin esto, parent_id null las haría siempre distintas).
  constraint agrupaciones_hermano_unico unique nulls not distinct (tenant_id, parent_id, nombre)
);

comment on table public.agrupaciones is
  'Árbol de agrupamientos de inmuebles por copropiedad (Edificio > Piso, Manzana > Lote, '
  'Etapa > Torre > Piso, o un solo nivel). nivel/ruta/es_hoja NO se materializan a propósito: '
  'se derivan del árbol, que es chico y el cliente carga entero — ver cabecera de '
  '20260830250000 y la limitación conocida de presupuesto_cuenta.ruta.';
comment on column public.agrupaciones.nombre is
  'Identificador dentro del padre ("A", "3", "12"). La etiqueta completa ("Edificio A") se '
  'compone con lista_tipos.nombre al mostrar; no se almacena duplicada.';

create index agrupaciones_tenant_idx on public.agrupaciones (tenant_id);
create index agrupaciones_parent_idx on public.agrupaciones (parent_id);

alter table public.agrupaciones enable row level security;
alter table public.agrupaciones force row level security;

create policy agrupaciones_select_miembro on public.agrupaciones
  for select using (public.is_member(tenant_id));
create policy agrupaciones_insert_agent on public.agrupaciones
  for insert with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
create policy agrupaciones_update_agent on public.agrupaciones
  for update using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
create policy agrupaciones_delete_agent on public.agrupaciones
  for delete using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create trigger set_updated_at before update on public.agrupaciones
  for each row execute function public.set_updated_at();

-- ── 3. guard del árbol ─────────────────────────────────────────────────
--  Valida lo que no puede expresarse con un CHECK: familia del tipo, tenant
--  del padre, ciclos y profundidad. Recorre hacia arriba en vez de leer un
--  `nivel` materializado.
create function public.guard_agrupacion_arbol()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo_familia text;
  v_tipo_tenant  uuid;
  v_tipo_activo  boolean;
  v_parent       public.agrupaciones%rowtype;
  v_cursor       uuid;
  v_profundidad  int := 1;
begin
  select tipo, tenant_id, activo into v_tipo_familia, v_tipo_tenant, v_tipo_activo
  from public.lista_tipos where id = new.tipo_id;

  if v_tipo_familia is distinct from 'AGRUPACION_PREDIOS' then
    raise exception 'AGRUPACION_TIPO_INVALIDO: tipo_id % no pertenece a AGRUPACION_PREDIOS (es %)',
      new.tipo_id, coalesce(v_tipo_familia, 'inexistente');
  end if;

  if v_tipo_tenant is not null and v_tipo_tenant <> new.tenant_id then
    raise exception 'AGRUPACION_TIPO_TENANT_INCONSISTENTE: % pertenece a otro tenant',
      new.tipo_id;
  end if;

  -- Solo al crear/cambiar el tipo: una agrupación vieja sobre un tipo que
  -- después se desactivó sigue siendo válida (no se rompe el histórico).
  if not v_tipo_activo and (tg_op = 'INSERT' or new.tipo_id is distinct from old.tipo_id) then
    raise exception 'AGRUPACION_TIPO_INACTIVO: el tipo % está desactivado', new.tipo_id;
  end if;

  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'AGRUPACION_CICLO: % no puede ser su propio padre', new.id;
  end if;

  select * into v_parent from public.agrupaciones where id = new.parent_id;

  if v_parent.id is null then
    raise exception 'AGRUPACION_PADRE_INEXISTENTE: parent_id % no existe', new.parent_id;
  end if;

  if v_parent.tenant_id <> new.tenant_id then
    raise exception 'AGRUPACION_TENANT_INCONSISTENTE: la agrupación padre % pertenece a otro '
      'tenant', new.parent_id;
  end if;

  -- Ciclo en reparentado: el nuevo padre no puede ser descendiente propio.
  if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id then
    if new.parent_id in (
      with recursive descendientes as (
        select id from public.agrupaciones where parent_id = old.id
        union all
        select a.id from public.agrupaciones a join descendientes d on a.parent_id = d.id
      )
      select id from descendientes
    ) then
      raise exception 'AGRUPACION_CICLO: % no puede colgar de su propio descendiente %',
        old.id, new.parent_id;
    end if;
  end if;

  -- Profundidad máxima 5 (ej. Etapa > Bloque > Edificio > Piso > Sector).
  v_cursor := new.parent_id;
  while v_cursor is not null loop
    v_profundidad := v_profundidad + 1;
    if v_profundidad > 5 then
      raise exception 'AGRUPACION_PROFUNDIDAD_MAXIMA: el árbol no admite más de 5 niveles';
    end if;
    select parent_id into v_cursor from public.agrupaciones where id = v_cursor;
  end loop;

  return new;
end;
$$;

create trigger guard_agrupacion_arbol
  before insert or update of parent_id, tipo_id, tenant_id on public.agrupaciones
  for each row execute function public.guard_agrupacion_arbol();

-- ── 4. inmuebles.agrupacion_id ─────────────────────────────────────────
--  Nullable: un inmueble sin agrupar sigue siendo válido (y hoy TODOS lo
--  están). `restrict` en la FK impide borrar una agrupación con inmuebles.
alter table public.inmuebles
  add column agrupacion_id uuid references public.agrupaciones (id) on delete restrict;

comment on column public.inmuebles.agrupacion_id is
  'Agrupación a la que pertenece el inmueble (una sola). No se exige que sea hoja: filtrar por '
  'un nodo incluye su subárbol vía agrupacion_subarbol(). NULL = sin agrupar.';

create index inmuebles_agrupacion_idx on public.inmuebles (agrupacion_id)
  where agrupacion_id is not null;

create function public.guard_inmueble_agrupacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agrupacion public.agrupaciones%rowtype;
begin
  if new.agrupacion_id is null then
    return new;
  end if;

  select * into v_agrupacion from public.agrupaciones where id = new.agrupacion_id;

  if v_agrupacion.id is null then
    raise exception 'AGRUPACION_INEXISTENTE: agrupacion_id % no existe', new.agrupacion_id;
  end if;

  if v_agrupacion.tenant_id <> new.tenant_id then
    raise exception 'AGRUPACION_TENANT_INCONSISTENTE: la agrupación % pertenece a otra '
      'copropiedad', new.agrupacion_id;
  end if;

  return new;
end;
$$;

create trigger guard_inmueble_agrupacion
  before insert or update of agrupacion_id on public.inmuebles
  for each row execute function public.guard_inmueble_agrupacion();

-- ── 5. subárbol, para filtrar ──────────────────────────────────────────
--  Filtrar "todos los inmuebles del Edificio A" = agrupacion_id in
--  (select id from agrupacion_subarbol('<edificio A>')). Incluye el propio
--  nodo. No es security definer: corre con los privilegios del invocador
--  para que la RLS de select de agrupaciones siga aplicando tal cual
--  (mismo criterio que presupuesto_cuenta_totales).
create function public.agrupacion_subarbol(p_agrupacion_id uuid)
returns table (id uuid)
language sql
stable
set search_path = ''
as $$
  with recursive subarbol as (
    select a.id from public.agrupaciones a where a.id = p_agrupacion_id
    union all
    select a.id from public.agrupaciones a join subarbol s on a.parent_id = s.id
  )
  select id from subarbol;
$$;

comment on function public.agrupacion_subarbol(uuid) is
  'Ids de una agrupación y todos sus descendientes — para filtrar inmuebles por cualquier nivel '
  'del árbol sin materializar una ruta.';
