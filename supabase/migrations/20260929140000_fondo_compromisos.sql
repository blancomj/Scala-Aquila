-- ═══════════════════════════════════════════════════════════════════════
--  Dominio Fondos — BLOQUE F: compromisos, y el disponible deja de ser saldo.
--  Propietario: PLAN_MAESTRO_IMPLEMENTACION.md §4.3 (GAP-22), R9, D-36.
--
--  EL DEFECTO QUE CIERRA (ANALISIS_FONDOS_BLOQUE_A.md §7, criterios de no
--  aprobación del Modelo Maestro §45). Hasta esta migración, "disponible"
--  era sinónimo de "saldo": un fondo con $100M podía comprometerse dos veces
--  por $80M cada vez sin que nada lo impidiera, porque no existía el
--  concepto de recursos reservados para una obligación aún no ejecutada.
--  `fondo_compromisos` + `fn_fondo_saldos` cierran esto.
--
--  fondo_movimientos gana las tres columnas de origen que PLAN §4.3 ya
--  documentaba (compromiso_id, solicitud_id, autorizacion_id) y que
--  20260929110000 dejó pendientes a propósito: no tenía sentido crearlas
--  antes de que existieran las tablas a las que apuntan.
--
--  ESTADO, por qué SÍ es enum (D-24). El ciclo PROYECTADO → COMPROMETIDO →
--  PARCIALMENTE_EJECUTADO → EJECUTADO, con salidas a LIBERADO/ANULADO, no es
--  vocabulario: decide si el compromiso resta del disponible (proyectado NO
--  resta — es un estimado, todavía no hay decisión) y si admite más
--  ejecución (terminal vs. no terminal). guard_fondo_compromiso lo hace
--  cumplir.
--
--  LA REGLA CENTRAL (R9, PLAN §4.3): un compromiso nuevo, o el aumento de
--  uno existente, nunca puede dejar el disponible en negativo. Se valida
--  contra fn_fondo_saldos en el propio guard — no hay forma de comprometer
--  más de lo que el fondo realmente tiene disponible.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. fondo_movimientos: los tres orígenes que faltaban ────────────────
alter table public.fondo_movimientos
  add column compromiso_id  uuid,
  add column solicitud_id   uuid,
  add column autorizacion_id uuid references public.fondo_autorizaciones (id);

create index fondo_movimientos_compromiso_idx on public.fondo_movimientos (compromiso_id)
  where compromiso_id is not null;

comment on column public.fondo_movimientos.compromiso_id is
  'Compromiso que este movimiento ejecuta, cuando el uso proviene de una reserva previa (Modelo '
  '§14). La FK real se agrega más abajo, después de crear fondo_compromisos — no puede declararse '
  'antes de que la tabla exista.';
comment on column public.fondo_movimientos.solicitud_id is
  'Solicitud de uso que originó este movimiento (Modelo §13). FK real pendiente de '
  'fondo_solicitudes_uso (bloque G, todavía no construido) — nullable y sin referencia por ahora, '
  'mismo criterio que liquidacion_id esperó a F5 en el modelo original de F2.';

-- ── 2. Ciclo de vida del compromiso (Modelo §18) ────────────────────────
create type public.fondo_compromiso_estado_t as enum (
  'proyectado',
  'comprometido',
  'parcialmente_ejecutado',
  'ejecutado',
  'liberado',
  'anulado'
);

comment on type public.fondo_compromiso_estado_t is
  'Ciclo de vida del compromiso (Modelo Maestro §14/§18). Enum nativo y no lista_tipos (D-24): '
  'el valor decide si el monto resta del disponible del fondo (proyectado no resta — es un '
  'estimado sin decisión firme; comprometido y parcialmente_ejecutado sí) y qué transiciones '
  'admite (ejecutado/liberado/anulado son terminales). guard_fondo_compromiso_transicion y '
  'fn_fondo_saldos dependen de esta semántica exacta.';

-- ── 3. fondo_compromisos ─────────────────────────────────────────────────
create table public.fondo_compromisos (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete cascade,
  fondo_id               uuid not null references public.fondos (id) on delete cascade,
  concepto               text not null,
  monto                  numeric(18, 2) not null,
  monto_ejecutado        numeric(18, 2) not null default 0,
  fecha                  date not null default current_date,
  fecha_limite           date,
  estado                 public.fondo_compromiso_estado_t not null default 'proyectado',
  beneficiario_tercero_id uuid references public.terceros (id),
  documento_id           uuid references public.documentos (id),
  registrado_por         uuid references public.profiles (id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz,

  constraint fondo_compromisos_monto_positivo check (monto > 0),
  constraint fondo_compromisos_ejecutado_no_negativo check (monto_ejecutado >= 0),
  constraint fondo_compromisos_ejecutado_no_excede check (monto_ejecutado <= monto)
);

comment on table public.fondo_compromisos is
  'Recursos reservados de un fondo para una obligación aún no (o no totalmente) ejecutada '
  '(Modelo Maestro §14). Es lo que distingue disponible de saldo: '
  'disponible = saldo − Σ comprometido (fn_fondo_saldos).';
comment on column public.fondo_compromisos.concepto is
  'Para qué se reserva, en lenguaje natural (Modelo §14: "contrato, orden, obligación, proyecto, '
  'presupuesto, cuenta por pagar, según el caso" — AQUILA no tiene todavía esas entidades, así '
  'que el vínculo real es descriptivo hasta que existan).';
comment on column public.fondo_compromisos.beneficiario_tercero_id is
  'A quién se le debe, cuando se conoce (proveedor, contratista). Nullable: un compromiso '
  'proyectado normalmente todavía no tiene beneficiario decidido.';

alter table public.fondo_compromisos enable row level security;
alter table public.fondo_compromisos force row level security;

create index fondo_compromisos_tenant_idx on public.fondo_compromisos (tenant_id);
create index fondo_compromisos_fondo_idx on public.fondo_compromisos (fondo_id);
create index fondo_compromisos_estado_idx on public.fondo_compromisos (tenant_id, estado);

create trigger set_updated_at before update on public.fondo_compromisos
  for each row execute function public.set_updated_at();

create policy fondo_compromisos_select_miembro
  on public.fondo_compromisos for select
  to authenticated
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'financiero'));

create policy fondo_compromisos_insert_agent
  on public.fondo_compromisos for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy fondo_compromisos_update_agent
  on public.fondo_compromisos for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- Ahora que la tabla existe, la FK real de fondo_movimientos.
alter table public.fondo_movimientos
  add constraint fondo_movimientos_compromiso_id_fkey
    foreign key (compromiso_id) references public.fondo_compromisos (id);

-- ── 4. fn_fondo_saldos — la fuente de verdad de comprometido/disponible ──
create function public.fn_fondo_saldos(p_fondo_id uuid)
returns table (saldo numeric, comprometido numeric, disponible numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    public.fn_fondo_saldo_derivado(p_fondo_id),
    coalesce((
      select sum(fc.monto - fc.monto_ejecutado)
        from public.fondo_compromisos fc
       where fc.fondo_id = p_fondo_id
         and fc.estado in ('comprometido', 'parcialmente_ejecutado')
    ), 0),
    public.fn_fondo_saldo_derivado(p_fondo_id) - coalesce((
      select sum(fc.monto - fc.monto_ejecutado)
        from public.fondo_compromisos fc
       where fc.fondo_id = p_fondo_id
         and fc.estado in ('comprometido', 'parcialmente_ejecutado')
    ), 0);
$$;

comment on function public.fn_fondo_saldos(uuid) is
  'Los tres saldos del fondo (Modelo Maestro §15/§49, PLAN §4.3): saldo (Σ movimientos), '
  'comprometido (Σ monto-monto_ejecutado de compromisos comprometido/parcialmente_ejecutado — '
  'un proyectado NO resta: es un estimado sin decisión firme) y disponible = saldo-comprometido. '
  'security invoker a propósito, igual que fn_fondo_reconciliar: se lee con RLS del usuario.';

-- ── 5. Transiciones de estado del compromiso ────────────────────────────
create function public.guard_fondo_compromiso_transicion()
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
    raise exception 'COMPROMISO_ESTADO_TERMINAL: el compromiso % está % y no admite cambios de '
      'estado', old.id, old.estado;
  end if;

  if not (
       (old.estado = 'proyectado'              and new.estado in ('comprometido', 'anulado'))
    or (old.estado = 'comprometido'             and new.estado in
          ('parcialmente_ejecutado', 'ejecutado', 'liberado', 'anulado'))
    or (old.estado = 'parcialmente_ejecutado'   and new.estado in ('ejecutado', 'liberado'))
  ) then
    raise exception 'COMPROMISO_TRANSICION_INVALIDA: % → % no es una transición válida',
      old.estado, new.estado;
  end if;

  return new;
end;
$$;

create trigger guard_fondo_compromiso_transicion
  before update of estado on public.fondo_compromisos
  for each row execute function public.guard_fondo_compromiso_transicion();

-- ── 6. R9: un compromiso nunca deja el disponible en negativo ───────────
create function public.guard_fondo_compromiso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fondo public.fondos;
  v_comprometido_otros numeric(18, 2);
  v_saldo numeric(18, 2);
begin
  select * into v_fondo from public.fondos where id = new.fondo_id;

  if v_fondo.id is null then
    raise exception 'FONDO_NO_ENCONTRADO: % no existe', new.fondo_id;
  end if;

  if v_fondo.tenant_id <> new.tenant_id then
    raise exception 'FONDO_TENANT_INCONSISTENTE: el fondo % no pertenece al tenant %',
      new.fondo_id, new.tenant_id;
  end if;

  if v_fondo.estado <> 'activo' then
    raise exception 'FONDO_ESTADO_NO_ADMITE_COMPROMISOS: el fondo % está % y no admite '
      'compromisos nuevos', v_fondo.codigo, v_fondo.estado;
  end if;

  -- Solo importa cuando el compromiso resta del disponible (Modelo §18).
  if new.estado in ('comprometido', 'parcialmente_ejecutado') then
    select coalesce(sum(fc.monto - fc.monto_ejecutado), 0) into v_comprometido_otros
      from public.fondo_compromisos fc
     where fc.fondo_id = new.fondo_id
       and fc.estado in ('comprometido', 'parcialmente_ejecutado')
       and fc.id <> new.id;

    v_saldo := public.fn_fondo_saldo_derivado(new.fondo_id);

    if v_comprometido_otros + (new.monto - new.monto_ejecutado) > v_saldo then
      raise exception 'COMPROMISO_EXCEDE_DISPONIBLE: comprometer % dejaría el disponible del '
        'fondo % en negativo (saldo %, ya comprometido %) — R9',
        new.monto - new.monto_ejecutado, v_fondo.codigo, v_saldo, v_comprometido_otros;
    end if;
  end if;

  if new.beneficiario_tercero_id is not null and not exists (
    select 1 from public.terceros t
     where t.id = new.beneficiario_tercero_id and t.tenant_id = new.tenant_id
  ) then
    raise exception 'TERCERO_INVALIDO: % no pertenece al tenant %',
      new.beneficiario_tercero_id, new.tenant_id;
  end if;

  if new.documento_id is not null and not exists (
    select 1 from public.documentos d
     where d.id = new.documento_id and d.tenant_id = new.tenant_id
  ) then
    raise exception 'DOCUMENTO_INVALIDO: % no pertenece al tenant %',
      new.documento_id, new.tenant_id;
  end if;

  new.registrado_por := coalesce(new.registrado_por, (select auth.uid()));

  return new;
end;
$$;

create trigger guard_fondo_compromiso
  before insert or update on public.fondo_compromisos
  for each row execute function public.guard_fondo_compromiso();

-- ── 7. Un uso contra un compromiso avanza su ejecución automáticamente ──
-- Mismo patrón que recalcular_saldo_fondo: derivado, no editable a mano.
-- Solo avanza (comprometido → parcialmente_ejecutado → ejecutado), nunca
-- toca proyectado/liberado/anulado — esos son decisiones humanas, no un
-- efecto secundario de registrar un movimiento.
create function public.recalcular_ejecutado_compromiso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ejecutado numeric(18, 2);
  v_monto numeric(18, 2);
  v_estado public.fondo_compromiso_estado_t;
begin
  if new.compromiso_id is null or new.tipo <> 'uso' then
    return new;
  end if;

  select monto, estado into v_monto, v_estado
    from public.fondo_compromisos where id = new.compromiso_id;

  if v_estado not in ('comprometido', 'parcialmente_ejecutado') then
    raise exception 'COMPROMISO_ESTADO_NO_EJECUTABLE: el compromiso % está % y no admite '
      'ejecución', new.compromiso_id, v_estado;
  end if;

  select coalesce(sum(fm.monto), 0) into v_ejecutado
    from public.fondo_movimientos fm
   where fm.compromiso_id = new.compromiso_id
     and fm.tipo = 'uso';

  if v_ejecutado > v_monto then
    raise exception 'COMPROMISO_EJECUCION_EXCEDE_MONTO: % ejecutado supera el comprometido (%) '
      'para el compromiso %', v_ejecutado, v_monto, new.compromiso_id;
  end if;

  update public.fondo_compromisos
     set monto_ejecutado = v_ejecutado,
         estado = case when v_ejecutado >= v_monto then 'ejecutado'::public.fondo_compromiso_estado_t
                        else 'parcialmente_ejecutado'::public.fondo_compromiso_estado_t end
   where id = new.compromiso_id;

  return new;
end;
$$;

create trigger recalcular_ejecutado_compromiso
  after insert on public.fondo_movimientos
  for each row execute function public.recalcular_ejecutado_compromiso();

-- ── 8. guard_fondo_movimiento valida también los dos orígenes nuevos ────
-- Reproducción de 20260929120000 + las dos validaciones que faltaban:
-- compromiso_id debe ser del MISMO fondo (un uso no ejecuta el compromiso
-- de otro fondo) y autorizacion_id debe existir en el tenant.
create or replace function public.guard_fondo_movimiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fondo public.fondos;
  v_original public.fondo_movimientos;
begin
  select * into v_fondo from public.fondos where id = new.fondo_id;

  if v_fondo.id is null then
    raise exception 'FONDO_NO_ENCONTRADO: % no existe', new.fondo_id;
  end if;

  if v_fondo.tenant_id <> new.tenant_id then
    raise exception 'FONDO_TENANT_INCONSISTENTE: el fondo % pertenece a otro tenant', new.fondo_id;
  end if;

  if v_fondo.estado in ('propuesto', 'pendiente_autorizacion', 'cerrado', 'cancelado')
     or (v_fondo.estado = 'en_cierre' and new.tipo <> 'cierre_remanente') then
    raise exception 'FONDO_ESTADO_NO_ADMITE_MOVIMIENTOS: el fondo % está % y no admite un '
      'movimiento de tipo %', v_fondo.codigo, v_fondo.estado, new.tipo;
  end if;

  if new.tipo in ('ajuste', 'reversion')
     and (new.motivo is null or btrim(new.motivo) = '') then
    raise exception 'FONDO_MOTIVO_REQUERIDO: un movimiento de tipo % exige motivo', new.tipo;
  end if;

  if new.tipo = 'reversion' then
    if new.reversion_de_id is null then
      raise exception 'FONDO_REVERSION_INVALIDA: una reversión debe indicar qué movimiento '
        'corrige (reversion_de_id)';
    end if;

    select * into v_original
      from public.fondo_movimientos where id = new.reversion_de_id;

    if v_original.id is null or v_original.fondo_id <> new.fondo_id then
      raise exception 'FONDO_REVERSION_INVALIDA: el movimiento % no existe o no es de este fondo',
        new.reversion_de_id;
    end if;

    if v_original.tipo = 'reversion' then
      raise exception 'FONDO_REVERSION_INVALIDA: una reversión no se revierte — corrige con un '
        'movimiento nuevo';
    end if;

    if new.monto is distinct from
       -public.fn_fondo_movimiento_efecto(v_original.tipo, v_original.monto) then
      raise exception 'FONDO_REVERSION_INVALIDA: una reversión debe valer % (lo contrario del '
        'movimiento que corrige), se recibió %',
        -public.fn_fondo_movimiento_efecto(v_original.tipo, v_original.monto), new.monto;
    end if;
  elsif new.reversion_de_id is not null then
    raise exception 'FONDO_REVERSION_INVALIDA: reversion_de_id solo aplica a un movimiento de '
      'tipo reversion';
  end if;

  if new.documento_id is not null and not exists (
    select 1 from public.documentos d
     where d.id = new.documento_id and d.tenant_id = new.tenant_id
  ) then
    raise exception 'DOCUMENTO_INVALIDO: % no pertenece al tenant %',
      new.documento_id, new.tenant_id;
  end if;

  if new.pago_id is not null and not exists (
    select 1 from public.pagos p where p.id = new.pago_id and p.tenant_id = new.tenant_id
  ) then
    raise exception 'PAGO_INVALIDO: % no pertenece al tenant %', new.pago_id, new.tenant_id;
  end if;

  if new.extracto_linea_id is not null and not exists (
    select 1 from public.extracto_linea el
     where el.id = new.extracto_linea_id and el.tenant_id = new.tenant_id
  ) then
    raise exception 'EXTRACTO_LINEA_INVALIDA: % no pertenece al tenant %',
      new.extracto_linea_id, new.tenant_id;
  end if;

  if new.compromiso_id is not null and not exists (
    select 1 from public.fondo_compromisos fc
     where fc.id = new.compromiso_id and fc.fondo_id = new.fondo_id
  ) then
    raise exception 'COMPROMISO_INVALIDO: % no es un compromiso de este fondo', new.compromiso_id;
  end if;

  if new.autorizacion_id is not null and not exists (
    select 1 from public.fondo_autorizaciones fa
     where fa.id = new.autorizacion_id and fa.fondo_id = new.fondo_id
  ) then
    raise exception 'AUTORIZACION_INVALIDA: % no es una autorización de este fondo',
      new.autorizacion_id;
  end if;

  new.registrado_por := coalesce(new.registrado_por, (select auth.uid()));

  return new;
end;
$$;
