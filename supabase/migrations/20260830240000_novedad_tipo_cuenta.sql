-- ═══════════════════════════════════════════════════════════════════════
--  Mapa "motivo de novedad → cuenta de ingreso", configurado una vez por
--  copropiedad.
--
--  Hasta ahora, quien registraba una novedad tenía que elegir a mano el
--  `presupuesto_cuenta_id` (19 opciones con códigos como
--  `ing_usufructo_vehiculos`) en cada captura — una decisión contable
--  repetida en una pantalla operativa, donde no corresponde tomarla.
--
--  El vínculo pertenece al catálogo, no al evento: "una Sanción siempre se
--  explica bajo Sanción por inasistencia" es una regla de la copropiedad,
--  estable, que se define una sola vez. Esta tabla la guarda y el trigger
--  `aplicar_novedad_cuenta_por_tipo` la aplica sola al insertar la novedad.
--
--  Por qué una tabla y no una columna en lista_tipos: las 8 filas
--  TIPO_NOVEDAD sembradas son GLOBALES (tenant_id is null, compartidas por
--  todos los tenants) mientras que presupuesto_cuenta es por tenant — una
--  fila global no puede apuntar a la cuenta de una copropiedad concreta.
--  La PK (tenant_id, tipo_novedad_id) resuelve eso y sirve igual para los
--  TIPO_NOVEDAD propios de un tenant, si alguno los crea después.
--
--  `novedades.presupuesto_cuenta_id` NO se toca: sigue existiendo y
--  sigue siendo nullable. Se pasa de "lo escribe el usuario" a "lo escribe
--  el trigger desde el mapa", y queda persistido en la fila — la novedad
--  conserva la cuenta que tenía asignada al momento de crearse aunque el
--  mapa cambie después (auditable, mismo criterio append-only del ledger).
-- ═══════════════════════════════════════════════════════════════════════

create table public.novedad_tipo_cuenta (
  tenant_id             uuid   not null references public.tenants (id) on delete cascade,
  tipo_novedad_id       bigint not null references public.lista_tipos (id),
  presupuesto_cuenta_id uuid   not null references public.presupuesto_cuenta (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz,
  primary key (tenant_id, tipo_novedad_id)
);

comment on table public.novedad_tipo_cuenta is
  'Mapa motivo de novedad (lista_tipos TIPO_NOVEDAD) -> cuenta de ingreso (presupuesto_cuenta), '
  'por copropiedad. Lo aplica aplicar_novedad_cuenta_por_tipo al insertar una novedad, para que '
  'quien la registra no tenga que elegir la cuenta contable en cada captura.';
comment on column public.novedad_tipo_cuenta.presupuesto_cuenta_id is
  'Solo cuenta hoja + naturaleza=ingreso (guard_novedad_tipo_cuenta) — mismo criterio que '
  'guard_novedad_tipo_presupuesto sobre novedades.presupuesto_cuenta_id.';

create index novedad_tipo_cuenta_cuenta_idx
  on public.novedad_tipo_cuenta (presupuesto_cuenta_id);

alter table public.novedad_tipo_cuenta enable row level security;
alter table public.novedad_tipo_cuenta force row level security;

-- SELECT abierto a cualquier miembro (mismo criterio que conceptos_select_miembro):
-- es configuración del catálogo, no lleva cifras. Escribir sigue siendo agent-only.
create policy novedad_tipo_cuenta_select_miembro on public.novedad_tipo_cuenta
  for select using (public.is_member(tenant_id));
create policy novedad_tipo_cuenta_insert_agent on public.novedad_tipo_cuenta
  for insert with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
create policy novedad_tipo_cuenta_update_agent on public.novedad_tipo_cuenta
  for update using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
create policy novedad_tipo_cuenta_delete_agent on public.novedad_tipo_cuenta
  for delete using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create trigger set_updated_at before update on public.novedad_tipo_cuenta
  for each row execute function public.set_updated_at();

-- ── guard del mapa: las mismas reglas que ya se exigen sobre
--    novedades.presupuesto_cuenta_id, aplicadas al configurarlo — así una
--    configuración inválida se rechaza al guardarla y no al usarla. ──────
create function public.guard_novedad_tipo_cuenta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo_familia text;
  v_tipo_tenant uuid;
  v_cuenta public.presupuesto_cuenta%rowtype;
begin
  select tipo, tenant_id into v_tipo_familia, v_tipo_tenant
  from public.lista_tipos where id = new.tipo_novedad_id;

  if v_tipo_familia is distinct from 'TIPO_NOVEDAD' then
    raise exception 'TIPO_NOVEDAD_INVALIDO: tipo_novedad_id % no pertenece a TIPO_NOVEDAD (es %)',
      new.tipo_novedad_id, coalesce(v_tipo_familia, 'inexistente');
  end if;

  if v_tipo_tenant is not null and v_tipo_tenant <> new.tenant_id then
    raise exception 'TIPO_NOVEDAD_TENANT_INCONSISTENTE: % pertenece a otro tenant',
      new.tipo_novedad_id;
  end if;

  select * into v_cuenta from public.presupuesto_cuenta where id = new.presupuesto_cuenta_id;

  if v_cuenta.id is null then
    raise exception 'CUENTA_INEXISTENTE: presupuesto_cuenta_id % no existe',
      new.presupuesto_cuenta_id;
  end if;

  if v_cuenta.tenant_id <> new.tenant_id then
    raise exception 'CUENTA_TENANT_INCONSISTENTE: la cuenta % pertenece a otro tenant',
      new.presupuesto_cuenta_id;
  end if;

  if not v_cuenta.es_hoja then
    raise exception 'CUENTA_NO_ES_HOJA: % agrupa subcuentas — el motivo solo puede vincularse '
      'a una cuenta hoja', new.presupuesto_cuenta_id;
  end if;

  if v_cuenta.naturaleza <> 'ingreso' then
    raise exception 'CUENTA_NATURALEZA_INVALIDA: % es egreso — un motivo de novedad (cobro) solo '
      'puede vincularse a una cuenta de ingreso', new.presupuesto_cuenta_id;
  end if;

  return new;
end;
$$;

create trigger guard_novedad_tipo_cuenta
  before insert or update on public.novedad_tipo_cuenta
  for each row execute function public.guard_novedad_tipo_cuenta();

-- ── derivación automática al crear la novedad ────────────────────────────
--  Se nombra con "a" a propósito: Postgres dispara los BEFORE triggers en
--  orden alfabético, así que este corre ANTES de
--  guard_novedad_tipo_presupuesto — la cuenta que pone el mapa queda
--  validada por ese guard igual que si la hubiera escrito un usuario, y una
--  configuración corrupta no puede colarse por esta vía.
--
--  Solo rellena cuando viene NULL: un presupuesto_cuenta_id explícito en el
--  payload sigue mandando (no rompe a ningún llamador existente), y una
--  novedad sin motivo simplemente se queda sin cuenta, como hoy.
create function public.aplicar_novedad_cuenta_por_tipo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.presupuesto_cuenta_id is null and new.tipo_novedad_id is not null then
    select presupuesto_cuenta_id into new.presupuesto_cuenta_id
    from public.novedad_tipo_cuenta
    where tenant_id = new.tenant_id
      and tipo_novedad_id = new.tipo_novedad_id;
  end if;

  return new;
end;
$$;

create trigger aplicar_novedad_cuenta_por_tipo
  before insert on public.novedades
  for each row execute function public.aplicar_novedad_cuenta_por_tipo();
