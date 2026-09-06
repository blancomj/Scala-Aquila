-- ═══════════════════════════════════════════════════════════════════════
--  FIN-1 · Posición de tesorería — compromisos sobre cuenta bancaria
--
--  El mismo defecto que fondo_compromisos (20260929140000) cerró para
--  fondos existe hoy para cuentas bancarias: "disponible" es sinónimo de
--  "saldo". Una copropiedad puede tener $50M en la cuenta operativa y estar
--  comprometida con $70M en pagos vencidos, sin que nada lo advierta.
--
--  Se calca el patrón exacto de fondo_compromisos/guard_fondo_compromiso
--  (mismo criterio de disponible = saldo − reservado, mismos guards de
--  transición/motivo/terminal-inmutable), NO se reinventa uno nuevo.
--
--  Corrección de una lectura previa (BUSCAR EXISTENTE): `cuentas_bancarias.contable_cuenta_id`
--  YA EXISTE — lo agregó PC-3 (`20260830460000_contable_puentes_mapeo.sql`), con su propio guard
--  (`guard_cuenta_bancaria_contable`) que ya exige grupo 11 (efectivo). Un primer intento de esta
--  migración volvió a agregarla y falló contra la base real (`column already exists`) — el mismo
--  descuido que el bug de `create_tenant()` en MANT-2: revisar solo el archivo que CREA una tabla
--  no basta, hay que buscar en todas las migraciones que la alteren después. FIN-1 no necesita
--  agregar nada aquí: solo consume la columna y el guard que PC-3 ya dejó listos.
--
--  ESTADO, por qué es enum (D-24): igual que fondo_compromiso_estado_t,
--  decide si el compromiso resta del disponible (proyectado NO resta —
--  estimado sin decisión firme; reservado SÍ) y qué transiciones admite
--  (ejecutado/liberado/anulado son terminales).
--  ORIGEN, por qué es enum (D-24): gatilla la validación de origen_id — un
--  compromiso 'manual' no lleva origen_id (no hay documento fuente que
--  referenciar); 'factura_proveedor'/'lote_pago' lo exigen, aunque todavía
--  no haya FK dura hacia esas tablas (no existen hasta FIN-2/FIN-3 — se
--  resuelve como par (origen, origen_id) sin FK, tal como pide el corte).
-- ═══════════════════════════════════════════════════════════════════════

create type public.compromiso_bancario_origen_t as enum ('factura_proveedor', 'lote_pago', 'manual');

comment on type public.compromiso_bancario_origen_t is
  'D-24: enum nativo, no lista_tipos — gatilla si origen_id es obligatorio (factura_proveedor y '
  'lote_pago lo exigen; manual no lleva, no hay documento fuente que referenciar). Sin FK dura '
  'hacia finanzas_factura_proveedor/finanzas_lote_pago porque esas tablas no existen todavía '
  '(FIN-2/FIN-3) — se resuelve como par (origen, origen_id), y cuando esas tablas se creen se '
  'agregan los guards de coherencia por trigger, no por FK (FIN-1 §3.1).';

create type public.compromiso_bancario_estado_t as enum (
  'proyectado', 'reservado', 'ejecutado', 'liberado', 'anulado'
);

comment on type public.compromiso_bancario_estado_t is
  'D-24: enum nativo — decide si el compromiso resta del disponible de la cuenta bancaria '
  '(proyectado NO resta, es informativo; reservado SÍ) y qué transiciones admite (ejecutado, '
  'liberado y anulado son terminales, inmutables). Mismo criterio semántico exacto que '
  'fondo_compromiso_estado_t (20260929140000), simplificado a 5 estados porque una cuenta '
  'bancaria no tiene el concepto de "ejecución parcial" que sí tiene un fondo.';

create table public.finanzas_cuenta_bancaria_compromiso (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete cascade,
  cuenta_bancaria_id     uuid not null references public.cuentas_bancarias (id),
  origen                 public.compromiso_bancario_origen_t not null,
  origen_id              uuid,
  monto                  numeric(18, 2) not null,
  estado                 public.compromiso_bancario_estado_t not null default 'proyectado',
  fecha_esperada_ejecucion date,
  motivo_liberacion      text,
  motivo_anulacion       text,
  registrado_por         uuid references public.profiles (id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz,

  constraint finanzas_cuenta_bancaria_compromiso_monto_positivo check (monto > 0)
);

comment on table public.finanzas_cuenta_bancaria_compromiso is
  'Recursos reservados de una cuenta bancaria para una obligación aún no ejecutada — mismo rol '
  'que fondo_compromisos, aplicado a bancos (FIN-1 §3.1). '
  'disponible = saldo_contable − Σ monto de compromisos en estado reservado '
  '(fn_cuenta_bancaria_disponible).';

alter table public.finanzas_cuenta_bancaria_compromiso enable row level security;
alter table public.finanzas_cuenta_bancaria_compromiso force row level security;

create index finanzas_cuenta_bancaria_compromiso_tenant_idx
  on public.finanzas_cuenta_bancaria_compromiso (tenant_id);
create index finanzas_cuenta_bancaria_compromiso_cuenta_idx
  on public.finanzas_cuenta_bancaria_compromiso (cuenta_bancaria_id);
create index finanzas_cuenta_bancaria_compromiso_estado_idx
  on public.finanzas_cuenta_bancaria_compromiso (cuenta_bancaria_id, estado);

create policy finanzas_cuenta_bancaria_compromiso_select_miembro
  on public.finanzas_cuenta_bancaria_compromiso for select
  to authenticated
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'financiero'));

create policy finanzas_cuenta_bancaria_compromiso_insert_auxiliar
  on public.finanzas_cuenta_bancaria_compromiso for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy finanzas_cuenta_bancaria_compromiso_update_auxiliar
  on public.finanzas_cuenta_bancaria_compromiso for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ═══════════════════════════════════════════════════════════════════════
--  fn_cuenta_bancaria_disponible — la fuente de verdad de
--  comprometido/disponible. Estructuralmente idéntica a fn_fondo_saldos:
--  lee el saldo de contable_libro_mayor (nunca calcula uno propio) y suma
--  compromisos por estado. stable, sin escritura.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_cuenta_bancaria_disponible(
  p_cuenta_bancaria_id uuid,
  p_fecha timestamptz default now()
)
returns table (
  saldo_contable          numeric,
  comprometido_reservado  numeric,
  comprometido_proyectado numeric,
  disponible              numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with cb as (
    select * from public.cuentas_bancarias where id = p_cuenta_bancaria_id
  ),
  saldo as (
    select coalesce((
      select lm.saldo_final
      from cb, public.contable_libro_mayor(cb.tenant_id, '1900-01-01'::date, p_fecha::date, cb.contable_cuenta_id) lm
      where cb.contable_cuenta_id is not null
    ), 0) as v
  ),
  comp as (
    select
      coalesce(sum(fcbc.monto) filter (where fcbc.estado = 'reservado'), 0)  as reservado,
      coalesce(sum(fcbc.monto) filter (where fcbc.estado = 'proyectado'), 0) as proyectado
    from cb
    left join public.finanzas_cuenta_bancaria_compromiso fcbc on fcbc.cuenta_bancaria_id = cb.id
  )
  select saldo.v, comp.reservado, comp.proyectado, saldo.v - comp.reservado
  from saldo, comp
$$;

comment on function public.fn_cuenta_bancaria_disponible(uuid, timestamptz) is
  'FIN-1 §3.2: saldo_contable siempre leído de contable_libro_mayor sobre '
  'cuentas_bancarias.contable_cuenta_id (nunca calculado aparte); 0 si la cuenta no tiene cuenta '
  'contable vinculada. comprometido_proyectado es informativo — no descuenta del disponible. '
  'Estructuralmente idéntica a fn_fondo_saldos (20260929140000): security invoker, stable, sin '
  'parametrizar por tenant qué categorías descuentan — es un invariante del enum, no una '
  'preferencia (FIN-1 §3.2).';

-- ═══════════════════════════════════════════════════════════════════════
--  Guards — mismo criterio exacto que guard_fondo_compromiso /
--  guard_fondo_compromiso_transicion (20260929140000), aplicado a bancos.
-- ═══════════════════════════════════════════════════════════════════════

create function public.guard_finanzas_compromiso_bancario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuenta public.cuentas_bancarias;
  v_reservado_otros numeric(18, 2);
  v_saldo numeric(18, 2);
begin
  select * into v_cuenta from public.cuentas_bancarias where id = new.cuenta_bancaria_id;

  if v_cuenta.id is null then
    raise exception 'CUENTA_BANCARIA_INEXISTENTE: % no existe', new.cuenta_bancaria_id;
  end if;

  if v_cuenta.tenant_id <> new.tenant_id then
    raise exception 'CUENTA_BANCARIA_TENANT_INCONSISTENTE: la cuenta % no pertenece al tenant %',
      new.cuenta_bancaria_id, new.tenant_id;
  end if;

  if new.origen = 'manual' and new.origen_id is not null then
    raise exception 'COMPROMISO_BANCARIO_ORIGEN_INVALIDO: un compromiso manual no lleva origen_id';
  end if;

  if new.origen in ('factura_proveedor', 'lote_pago') and new.origen_id is null then
    raise exception 'COMPROMISO_BANCARIO_ORIGEN_INVALIDO: un compromiso de origen % exige origen_id',
      new.origen;
  end if;

  -- R central del corte: un compromiso reservado nuevo, o el aumento de uno existente, nunca
  -- puede dejar el disponible en negativo (FIN-1 §3.1).
  if new.estado = 'reservado' then
    select coalesce(sum(fcbc.monto), 0) into v_reservado_otros
      from public.finanzas_cuenta_bancaria_compromiso fcbc
     where fcbc.cuenta_bancaria_id = new.cuenta_bancaria_id
       and fcbc.estado = 'reservado'
       and fcbc.id <> new.id;

    select d.saldo_contable into v_saldo
      from public.fn_cuenta_bancaria_disponible(new.cuenta_bancaria_id, now()) d;

    if v_reservado_otros + new.monto > coalesce(v_saldo, 0) then
      raise exception 'COMPROMISO_BANCARIO_EXCEDE_DISPONIBLE: reservar % dejaría el disponible de '
        'la cuenta % en negativo (saldo %, ya reservado %)',
        new.monto, v_cuenta.numero_cuenta, v_saldo, v_reservado_otros;
    end if;
  end if;

  new.registrado_por := coalesce(new.registrado_por, (select auth.uid()));
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_finanzas_compromiso_bancario() is
  'Valida consistencia de tenant, coherencia de origen/origen_id, y la regla central del corte: '
  'un compromiso reservado no puede dejar fn_cuenta_bancaria_disponible en negativo — mismo '
  'criterio que guard_fondo_compromiso (R9).';

create trigger guard_finanzas_compromiso_bancario
  before insert or update on public.finanzas_cuenta_bancaria_compromiso
  for each row execute function public.guard_finanzas_compromiso_bancario();

create function public.guard_finanzas_compromiso_bancario_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = old.estado then
    return new;
  end if;

  if old.estado in ('ejecutado', 'liberado', 'anulado') then
    raise exception 'COMPROMISO_BANCARIO_TERMINAL_INMUTABLE: el compromiso % está % y no admite '
      'cambios de estado', old.id, old.estado;
  end if;

  if not (
       (old.estado = 'proyectado' and new.estado in ('reservado', 'anulado'))
    or (old.estado = 'reservado'  and new.estado in ('ejecutado', 'liberado', 'anulado'))
  ) then
    raise exception 'COMPROMISO_BANCARIO_TRANSICION_INVALIDA: % → % no es una transición válida',
      old.estado, new.estado;
  end if;

  if new.estado = 'liberado' and (new.motivo_liberacion is null or btrim(new.motivo_liberacion) = '') then
    raise exception 'COMPROMISO_BANCARIO_SIN_MOTIVO: liberar un compromiso exige motivo_liberacion';
  end if;

  if new.estado = 'anulado' and (new.motivo_anulacion is null or btrim(new.motivo_anulacion) = '') then
    raise exception 'COMPROMISO_BANCARIO_SIN_MOTIVO: anular un compromiso exige motivo_anulacion';
  end if;

  return new;
end;
$$;

create trigger guard_finanzas_compromiso_bancario_transicion
  before update of estado on public.finanzas_cuenta_bancaria_compromiso
  for each row execute function public.guard_finanzas_compromiso_bancario_transicion();
