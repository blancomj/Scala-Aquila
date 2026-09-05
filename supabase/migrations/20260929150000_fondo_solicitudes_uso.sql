-- ═══════════════════════════════════════════════════════════════════════
--  Dominio Fondos — BLOQUE G: solicitudes de uso.
--  Propietario: PLAN_MAESTRO_IMPLEMENTACION.md §4.3 (GAP-22), D-36, D-37.
--
--  Modelo Maestro §13/§19/§20: NECESIDAD → SOLICITUD → VALIDACIÓN →
--  AUTORIZACIÓN → COMPROMISO → EJECUCIÓN → MOVIMIENTO. Es la pieza que
--  faltaba para que "comprometer" (bloque F) tenga un origen humano
--  documentado en vez de nacer de un insert directo a fondo_compromisos.
--
--  SEGREGACIÓN DE FUNCIONES (D-37): "quien solicita un uso no puede
--  aprobarlo, y quien aprueba no puede ejecutar". Se hace cumplir en la
--  base, no en la matriz de permisos — mismo criterio que
--  guard_accion_cobranza_transicion y guard_fondo_compromiso_transicion:
--    • decidir (aprobar/rechazar) exige rol administrador y actor distinto
--      del solicitante.
--    • comprometer exige rol auxiliar y actor distinto del aprobador.
--
--  SIN EDGE FUNCTION TODAVÍA. Igual que fondo_compromisos/fondo_fuentes,
--  esta migración cierra el modelo de datos y sus guards — la capa de
--  API/UI (bloque P, ya pendiente) decidirá si necesita una Edge Function
--  encima. Las cuatro transiciones críticas (en_revision, aprobada/
--  rechazada, comprometida, ejecutada) son seguras aunque se llamen con un
--  UPDATE directo: el guard revalida rol, segregación y disponible, igual
--  que ya hacen guard_fondo_compromiso y guard_fondo_estado_transicion.
--
--  "EJECUTADA" NO ES UNA DECISIÓN HUMANA — se deriva de que el compromiso
--  vinculado llegue a 'ejecutado' (bloque F). El guard bloquea cualquier
--  intento de poner una solicitud en 'ejecutada' a mano, con el mismo
--  mecanismo de bandera de sesión que ya usa fn_resetear_copropiedad
--  (aquila.reset_context) para distinguir "lo hizo el sistema" de
--  "lo hizo un usuario".
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. fondo_compromisos gana el enlace hacia atrás ─────────────────────
-- Diferido a propósito en 20260929140000: no tenía sentido crear la columna
-- antes de que existiera la tabla a la que apunta.
alter table public.fondo_compromisos
  add column solicitud_id uuid;

create unique index fondo_compromisos_solicitud_unica
  on public.fondo_compromisos (solicitud_id)
  where solicitud_id is not null;

comment on column public.fondo_compromisos.solicitud_id is
  'Solicitud de uso que originó este compromiso, cuando existe (Modelo §13/§19). Único: una '
  'solicitud aprobada genera como máximo un compromiso — comprometerla dos veces sería reservar '
  'el mismo uso dos veces.';

-- ── 2. Ciclo de vida de la solicitud (Modelo §13) ───────────────────────
create type public.fondo_solicitud_uso_estado_t as enum (
  'borrador',
  'en_revision',
  'aprobada',
  'rechazada',
  'comprometida',
  'ejecutada',
  'anulada'
);

comment on type public.fondo_solicitud_uso_estado_t is
  'Ciclo de vida de la solicitud de uso (Modelo Maestro §13). Enum nativo y no lista_tipos '
  '(D-24): decide qué acción de negocio dispara cada transición (aprobar exige rol y valida '
  'disponible, comprometer crea la fila real en fondo_compromisos, ejecutada solo la deriva el '
  'sistema) — guard_fondo_solicitud_uso_transicion depende de esta semántica exacta.';

-- ── 3. fondo_solicitudes_uso ─────────────────────────────────────────────
create table public.fondo_solicitudes_uso (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  fondo_id          uuid not null references public.fondos (id) on delete cascade,
  solicitante_id    uuid not null references public.profiles (id),
  fecha             date not null default current_date,
  objetivo          text not null,
  monto_solicitado  numeric(18, 2) not null,
  justificacion     text,
  estado            public.fondo_solicitud_uso_estado_t not null default 'borrador',
  aprobador_id      uuid references public.profiles (id),
  fecha_aprobacion  timestamptz,
  motivo_rechazo    text,
  compromiso_id     uuid references public.fondo_compromisos (id),
  documento_id      uuid references public.documentos (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,

  constraint fondo_solicitudes_uso_monto_positivo check (monto_solicitado > 0)
);

comment on table public.fondo_solicitudes_uso is
  'Solicitud para usar recursos de un fondo, antes de comprometerlos (Modelo Maestro §13). El '
  'fondo de imprevistos NO se salta este flujo (§19): AQUILA no decide si un gasto "es" '
  'imprevisto, pero exige la misma trazabilidad de solicitud → autorización → compromiso que '
  'cualquier otro fondo.';
comment on column public.fondo_solicitudes_uso.justificacion is
  'Por qué se necesita, en lenguaje natural. No se interpreta ni decide automáticamente si el '
  'gasto es elegible — esa es la decisión humana que aprobada/rechazada registra.';
comment on column public.fondo_solicitudes_uso.compromiso_id is
  'Compromiso que esta solicitud generó al ser comprometida. Redundante con '
  'fondo_compromisos.solicitud_id (ambas direcciones), a propósito: evita un join para la vista '
  'de detalle de la solicitud, que es donde más se consulta.';

alter table public.fondo_solicitudes_uso enable row level security;
alter table public.fondo_solicitudes_uso force row level security;

create index fondo_solicitudes_uso_tenant_idx on public.fondo_solicitudes_uso (tenant_id);
create index fondo_solicitudes_uso_fondo_idx on public.fondo_solicitudes_uso (fondo_id);
create index fondo_solicitudes_uso_estado_idx on public.fondo_solicitudes_uso (tenant_id, estado);

create trigger set_updated_at before update on public.fondo_solicitudes_uso
  for each row execute function public.set_updated_at();

create policy fondo_solicitudes_uso_select_miembro
  on public.fondo_solicitudes_uso for select
  to authenticated
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'financiero'));

create policy fondo_solicitudes_uso_insert_agent
  on public.fondo_solicitudes_uso for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- Una sola política de UPDATE para todas las transiciones (borrador→...→
-- anulada, y las cuatro decisiones críticas): el guard de abajo es quien
-- distingue qué rol y qué segregación exige cada una — la policy solo pide
-- "algún" auxiliar, igual que fondos_update_agent/fondo_compromisos_update_agent.
create policy fondo_solicitudes_uso_update_agent
  on public.fondo_solicitudes_uso for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── 4. Ahora que la tabla existe: la FK real de fondo_compromisos y de
--       fondo_movimientos.solicitud_id, ambas diferidas desde sus
--       migraciones de origen. ─────────────────────────────────────────
alter table public.fondo_compromisos
  add constraint fondo_compromisos_solicitud_id_fkey
    foreign key (solicitud_id) references public.fondo_solicitudes_uso (id);

alter table public.fondo_movimientos
  add constraint fondo_movimientos_solicitud_id_fkey
    foreign key (solicitud_id) references public.fondo_solicitudes_uso (id);

comment on column public.fondo_movimientos.solicitud_id is
  'Solicitud de uso que originó este movimiento (Modelo §13). FK ahora real (bloque G).';

-- ── 5. Coherencia de referencias + validación temprana de disponible ────
create function public.guard_fondo_solicitud_uso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fondo public.fondos;
begin
  select * into v_fondo from public.fondos where id = new.fondo_id;

  if v_fondo.id is null then
    raise exception 'FONDO_NO_ENCONTRADO: % no existe', new.fondo_id;
  end if;

  if v_fondo.tenant_id <> new.tenant_id then
    raise exception 'FONDO_TENANT_INCONSISTENTE: el fondo % no pertenece al tenant %',
      new.fondo_id, new.tenant_id;
  end if;

  if tg_op = 'INSERT' and v_fondo.estado <> 'activo' then
    raise exception 'FONDO_ESTADO_NO_ADMITE_SOLICITUDES: el fondo % está % y no admite '
      'solicitudes de uso nuevas', v_fondo.codigo, v_fondo.estado;
  end if;

  if new.documento_id is not null and not exists (
    select 1 from public.documentos d
     where d.id = new.documento_id and d.tenant_id = new.tenant_id
  ) then
    raise exception 'DOCUMENTO_INVALIDO: % no pertenece al tenant %',
      new.documento_id, new.tenant_id;
  end if;

  return new;
end;
$$;

create trigger guard_fondo_solicitud_uso
  before insert or update on public.fondo_solicitudes_uso
  for each row execute function public.guard_fondo_solicitud_uso();

-- ── 6. La máquina de estados, con segregación de funciones (D-37) ───────
create function public.guard_fondo_solicitud_uso_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_disponible numeric(18, 2);
begin
  if new.estado = old.estado then
    return new;
  end if;

  if old.estado in ('rechazada', 'ejecutada', 'anulada') then
    raise exception 'SOLICITUD_ESTADO_TERMINAL: la solicitud % está % y no admite cambios de '
      'estado', old.id, old.estado;
  end if;

  if not (
       (old.estado = 'borrador'      and new.estado in ('en_revision', 'anulada'))
    or (old.estado = 'en_revision'   and new.estado in ('borrador', 'aprobada', 'rechazada', 'anulada'))
    or (old.estado = 'aprobada'      and new.estado in ('comprometida', 'anulada'))
    or (old.estado = 'comprometida'  and new.estado = 'ejecutada')
  ) then
    raise exception 'SOLICITUD_TRANSICION_INVALIDA: % → % no es una transición válida para la '
      'solicitud %', old.estado, new.estado, old.id;
  end if;

  v_actor := (select auth.uid());

  if new.estado in ('aprobada', 'rechazada') then
    -- D-37: quien decide no puede ser quien solicitó.
    if v_actor is not null and v_actor = old.solicitante_id then
      raise exception 'SOLICITUD_AUTOAPROBACION: el solicitante % no puede decidir su propia '
        'solicitud', old.solicitante_id;
    end if;

    if not public.has_role(old.tenant_id, array['administrador']::public.tenant_role_t[]) then
      raise exception 'SOLICITUD_ROL_INSUFICIENTE: aprobar o rechazar una solicitud de uso '
        'exige rol administrador';
    end if;

    if new.estado = 'aprobada' then
      -- Modelo §20: no aprobar si el monto supera el disponible. La validación
      -- definitiva sigue siendo R9 en fondo_compromisos al comprometer — esta
      -- es la exigida explícitamente en el paso de aprobación, no la sustituye.
      select fs.disponible into v_disponible from public.fn_fondo_saldos(old.fondo_id) fs;

      if old.monto_solicitado > v_disponible then
        raise exception 'SOLICITUD_EXCEDE_DISPONIBLE: % excede el disponible del fondo (%) — '
          'Modelo §20', old.monto_solicitado, v_disponible;
      end if;

      new.aprobador_id := v_actor;
      new.fecha_aprobacion := now();
    else
      if new.motivo_rechazo is null or btrim(new.motivo_rechazo) = '' then
        raise exception 'SOLICITUD_MOTIVO_REQUERIDO: rechazar una solicitud exige motivo_rechazo';
      end if;
    end if;
  end if;

  if new.estado = 'comprometida' then
    -- D-37: quien aprobó no puede ser quien ejecuta el compromiso.
    if v_actor is not null and v_actor = old.aprobador_id then
      raise exception 'SOLICITUD_AUTOEJECUCION: el aprobador % no puede comprometer su propia '
        'decisión', old.aprobador_id;
    end if;

    if not public.has_role(old.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
      raise exception 'SOLICITUD_ROL_INSUFICIENTE: comprometer una solicitud exige rol auxiliar';
    end if;

    insert into public.fondo_compromisos (
      tenant_id, fondo_id, concepto, monto, estado, solicitud_id, documento_id
    )
    values (
      old.tenant_id, old.fondo_id, old.objetivo, old.monto_solicitado, 'comprometido',
      old.id, old.documento_id
    )
    returning id into new.compromiso_id;
  end if;

  -- 'ejecutada' solo la deriva propagar_solicitud_ejecutada — bloquea
  -- cualquier UPDATE manual, incluido el de service_role fuera de ese
  -- contexto (mismo mecanismo de bandera que fn_resetear_copropiedad).
  if new.estado = 'ejecutada'
     and current_setting('aquila.propagacion_solicitud', true) is distinct from 'true' then
    raise exception 'SOLICITUD_EJECUTADA_NO_MANUAL: el estado ejecutada solo se deriva de que el '
      'compromiso vinculado se ejecute por completo — no se asigna a mano';
  end if;

  return new;
end;
$$;

create trigger guard_fondo_solicitud_uso_transicion
  before update of estado on public.fondo_solicitudes_uso
  for each row execute function public.guard_fondo_solicitud_uso_transicion();

-- ── 7. Propagación: compromiso ejecutado → solicitud ejecutada ─────────
create function public.propagar_solicitud_ejecutada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = 'ejecutado' and new.solicitud_id is not null
     and old.estado is distinct from 'ejecutado' then
    perform set_config('aquila.propagacion_solicitud', 'true', true);

    update public.fondo_solicitudes_uso
       set estado = 'ejecutada'
     where id = new.solicitud_id
       and estado = 'comprometida';

    perform set_config('aquila.propagacion_solicitud', 'false', true);
  end if;

  return new;
end;
$$;

create trigger propagar_solicitud_ejecutada
  after update of estado on public.fondo_compromisos
  for each row execute function public.propagar_solicitud_ejecutada();
