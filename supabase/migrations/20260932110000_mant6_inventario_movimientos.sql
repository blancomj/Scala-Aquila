-- ═══════════════════════════════════════════════════════════════════════
--  MANT-6 · Inventario de repuestos y costos (2/6)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_06_inventario_costos.md §4.2
--
--  Este archivo: ledger append-only de movimientos y mant_stock(). El
--  consumo desde una OT y la transferencia entre almacenes (funciones de
--  orquestación) van en 20260932140000 — necesitan esta tabla ya creada.
--
--  `direccion` (decisión de diseño confirmada en el Plan del corte, §5.A):
--  el prompt dice "cantidad siempre positiva; el signo lo da el tipo", pero
--  también permite que un ajuste baje el stock (corrección a la baja) — un
--  ajuste no puede tener signo fijo. El guard FUERZA direccion = 1 para
--  'entrada' y -1 para 'salida', sin importar lo que mande el cliente; solo
--  en 'ajuste' respeta la direccion tal como la manda quien registra (con
--  motivo obligatorio). 'transferencia' tampoco tiene signo fijo — cada
--  fila del par (ver transferencia_par_id) lleva su propia direccion,
--  validada en conjunto más abajo.
--
--  `presupuesto_ejecucion_id` nace NULL y así se queda mientras no exista
--  una política de valoración de inventario (prompt §3, marco: "no se
--  resuelve por defecto") — mant_inventario_pendientes_contabilizar()
--  (20260932140000) lista todo lo que quedó así, con el código
--  INVENTARIO_POLITICA_CONTABLE_NO_DEFINIDA como dato, no como excepción
--  que aborte el registro físico.
-- ═══════════════════════════════════════════════════════════════════════

create type public.movimiento_tipo_t as enum ('entrada', 'salida', 'ajuste', 'transferencia');
comment on type public.movimiento_tipo_t is
  'Clase de movimiento de inventario (MANT-6 §4.2). Enum nativo y no lista_tipos (D-24) porque '
  'el valor determina el signo con que el movimiento entra a mant_stock() y qué exige el guard: '
  '''entrada'' siempre suma, ''salida'' siempre resta y valida stock suficiente, ''ajuste'' exige '
  'motivo y puede sumar o restar (dirección explícita, ver columna direccion), ''transferencia'' '
  'exige un par de filas enlazadas (transferencia_par_id) entre dos almacenes distintos. Mismo '
  'criterio ya usado para fondo_movimiento_tipo_t.';

create table public.mant_inventario_movimientos (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants (id) on delete cascade,
  repuesto_id               uuid not null references public.mant_repuestos (id),
  almacen_id                uuid not null references public.mant_almacenes (id),
  tipo                      public.movimiento_tipo_t not null,
  direccion                 smallint not null default 1,
  cantidad                  numeric(18, 4) not null,
  costo_unitario            numeric(18, 2),
  orden_trabajo_id          uuid references public.mant_ordenes_trabajo (id),
  tercero_id                uuid references public.terceros (id),
  documento_id              uuid references public.documentos (id),
  motivo                    text,
  transferencia_par_id      uuid references public.mant_inventario_movimientos (id),
  presupuesto_ejecucion_id  uuid references public.presupuesto_ejecucion (id),
  registrado_por            uuid references public.profiles (id),
  registrado_at             timestamptz not null default now(),

  constraint mant_inventario_movimientos_direccion_valida check (direccion in (1, -1))
);

alter table public.mant_inventario_movimientos enable row level security;
alter table public.mant_inventario_movimientos force row level security;

create index mant_inventario_movimientos_tenant_idx on public.mant_inventario_movimientos (tenant_id);
create index mant_inventario_movimientos_repuesto_almacen_idx
  on public.mant_inventario_movimientos (tenant_id, repuesto_id, almacen_id);
create index mant_inventario_movimientos_ot_idx on public.mant_inventario_movimientos (orden_trabajo_id)
  where orden_trabajo_id is not null;
create index mant_inventario_movimientos_pendiente_contabilizar_idx
  on public.mant_inventario_movimientos (tenant_id)
  where orden_trabajo_id is not null and presupuesto_ejecucion_id is null;

comment on table public.mant_inventario_movimientos is
  'MANT-6 §4.2: ledger append-only de movimientos físicos de inventario. El stock actual SE '
  'CALCULA (mant_stock), no se almacena — misma decisión que activo_estado_historial y '
  'presupuesto_ejecucion: un saldo guardado y un ledger append-only son dos verdades esperando '
  'a divergir. Un movimiento no se edita ni se borra: se corrige con otro movimiento.';
comment on column public.mant_inventario_movimientos.direccion is
  'Signo real del movimiento (+1 suma al stock, -1 resta). Para ''entrada''/''salida'' el guard '
  'la fuerza (1/-1 respectivamente) sin importar el valor recibido; solo ''ajuste'' y '
  '''transferencia'' la toman tal como la manda quien registra.';
comment on column public.mant_inventario_movimientos.transferencia_par_id is
  'Solo para tipo = ''transferencia'': apunta a la fila hermana (origen↔destino) del mismo '
  'movimiento. Las dos filas se insertan atómicamente vía fn_mant_transferir_repuesto '
  '(20260932140000) — nunca sueltas.';
comment on column public.mant_inventario_movimientos.presupuesto_ejecucion_id is
  'NULL mientras no exista una política de valoración de inventario definida (prompt §3) — ver '
  'mant_inventario_pendientes_contabilizar(). Cuando la política exista, un corte futuro la '
  'usará para enlazar el efecto contable real de un consumo.';

-- ── Append-only (mismo criterio que activo_estado_historial/presupuesto_ejecucion) ──
create trigger mant_inventario_movimientos_append_only
  before update or delete on public.mant_inventario_movimientos
  for each row execute function public.forbid_mutation();

-- ── Guard de ficha + signo + stock suficiente (§4.2) ─────────────────────
create function public.guard_mant_inventario_movimiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_repuesto_tenant uuid;
  v_almacen_tenant uuid;
  v_tercero_tenant uuid;
  v_documento_tenant uuid;
  v_ot_tenant uuid;
  v_stock numeric;
begin
  if new.cantidad <= 0 then
    raise exception 'MOVIMIENTO_CANTIDAD_INVALIDA: cantidad % debe ser mayor que cero', new.cantidad;
  end if;

  select tenant_id into v_repuesto_tenant from public.mant_repuestos where id = new.repuesto_id;
  if v_repuesto_tenant is distinct from new.tenant_id then
    raise exception 'MOVIMIENTO_TENANT_INCONSISTENTE: el repuesto % no pertenece al tenant',
      new.repuesto_id;
  end if;

  select tenant_id into v_almacen_tenant from public.mant_almacenes where id = new.almacen_id;
  if v_almacen_tenant is distinct from new.tenant_id then
    raise exception 'MOVIMIENTO_TENANT_INCONSISTENTE: el almacén % no pertenece al tenant',
      new.almacen_id;
  end if;

  if new.tercero_id is not null then
    select tenant_id into v_tercero_tenant from public.terceros where id = new.tercero_id;
    if v_tercero_tenant is distinct from new.tenant_id then
      raise exception 'MOVIMIENTO_TENANT_INCONSISTENTE: el tercero % no pertenece al tenant',
        new.tercero_id;
    end if;
  end if;

  if new.documento_id is not null then
    select tenant_id into v_documento_tenant from public.documentos where id = new.documento_id;
    if v_documento_tenant is distinct from new.tenant_id then
      raise exception 'MOVIMIENTO_TENANT_INCONSISTENTE: el documento % no pertenece al tenant',
        new.documento_id;
    end if;
  end if;

  if new.orden_trabajo_id is not null then
    select tenant_id into v_ot_tenant from public.mant_ordenes_trabajo where id = new.orden_trabajo_id;
    if v_ot_tenant is distinct from new.tenant_id then
      raise exception 'MOVIMIENTO_TENANT_INCONSISTENTE: la OT % no pertenece al tenant',
        new.orden_trabajo_id;
    end if;
  end if;

  -- ── Signo por tipo (§4.2 + Plan del corte §5.A) ──
  case new.tipo
    when 'entrada' then
      new.direccion := 1;
    when 'salida' then
      new.direccion := -1;
    when 'ajuste' then
      if new.motivo is null or btrim(new.motivo) = '' then
        raise exception 'AJUSTE_SIN_MOTIVO: un movimiento de tipo ajuste exige motivo';
      end if;
      -- direccion la manda quien registra (ya validada por el CHECK in (1,-1)).
    when 'transferencia' then
      -- Las dos filas del par se insertan en la MISMA transacción y cada una referencia el id
      -- de la otra (ver fn_mant_transferir_repuesto, 20260932140000) — al validar la primera, la
      -- segunda todavía no existe, así que la validación cruzada completa (existencia del par,
      -- mismo tenant/repuesto, almacén distinto, direccion opuesta) la hace esa función DESPUÉS
      -- de insertar ambas, no este trigger fila por fila. Lo que sí se exige aquí, siempre:
      -- que venga de esa función (bandera de sesión, mismo mecanismo que aquila.cerrando_ot en
      -- fn_mant_cerrar_ot) y que no se autorreferencie.
      if coalesce(current_setting('aquila.registrando_transferencia', true), 'false') <> 'true' then
        raise exception 'TRANSFERENCIA_DESTINO_INVALIDO: una transferencia exige '
          'fn_mant_transferir_repuesto, no un INSERT directo';
      end if;
      if new.transferencia_par_id is null or new.transferencia_par_id = new.id then
        raise exception 'TRANSFERENCIA_DESTINO_INVALIDO: transferencia_par_id inválido para %',
          new.id;
      end if;
  end case;

  -- ── Stock suficiente: solo cuando el movimiento RESTA (§4.2) ─────────
  if new.direccion = -1 then
    select public.mant_stock(new.tenant_id, new.repuesto_id, new.almacen_id, current_date)
      into v_stock;
    if coalesce(v_stock, 0) < new.cantidad then
      raise exception 'STOCK_INSUFICIENTE: el almacén % tiene % unidades de % y se intentan '
        'descontar %', new.almacen_id, coalesce(v_stock, 0), new.repuesto_id, new.cantidad;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_mant_inventario_movimiento() is
  'MANT-6 §4.2: valida cantidad > 0, consistencia de tenant de todas las FK, fija la dirección '
  'según el tipo (entrada/salida forzadas, ajuste/transferencia explícitas), exige motivo en '
  'ajuste y valida stock suficiente para cualquier movimiento que reste.';

create trigger mant_inventario_movimientos_guard
  before insert on public.mant_inventario_movimientos
  for each row execute function public.guard_mant_inventario_movimiento();

-- ── mant_stock: el saldo SE CALCULA, nunca se guarda (§4.2) ──────────────
create function public.mant_stock(
  p_tenant_id uuid, p_repuesto_id uuid, p_almacen_id uuid, p_fecha date default current_date
)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(m.direccion * m.cantidad), 0)
  from public.mant_inventario_movimientos m
  where m.tenant_id = p_tenant_id
    and m.repuesto_id = p_repuesto_id
    and m.almacen_id = p_almacen_id
    and m.registrado_at::date <= p_fecha;
$$;

comment on function public.mant_stock(uuid, uuid, uuid, date) is
  'MANT-6 §4.2: stock derivado de mant_inventario_movimientos a una fecha dada — NO existe '
  'columna de stock actual en ningún lado (mismo criterio que activo_estado_historial). Si el '
  'rendimiento lo exige más adelante, se resuelve con una vista materializada medida, no con una '
  'columna nueva.';

-- ── RLS: lectura miembro, escritura auxiliar (mismo patrón que presupuesto_ejecucion) ──
create policy mant_inventario_movimientos_select_miembro
  on public.mant_inventario_movimientos for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_inventario_movimientos_insert_auxiliar
  on public.mant_inventario_movimientos for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
