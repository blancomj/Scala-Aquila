-- ═══════════════════════════════════════════════════════════════════════
--  MANT-4 · Incidencias y órdenes de trabajo (6/9)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_04_incidencias_ordenes_trabajo.md §3.3
--
--  `acreditacion_referencia` no está en la lista de columnas del corte
--  original, pero es necesaria: sin ella no hay dónde guardar lo que
--  mant_cumplimiento (MANT-2) exige cuando el requisito pide tercero
--  acreditado, y la prueba 8 (OT_CUMPLIMIENTO_SIN_ACREDITACION) sería
--  irrepresentable. Documentado como adición, no como omisión.
--
--  Cerrar una OT (estado = 'cerrada') NUNCA es un UPDATE directo: la
--  transición exige que fn_mant_cerrar_ot (20260930960000) la dispare —
--  esa función marca la bandera de sesión `aquila.cerrando_ot` antes del
--  UPDATE real (mismo mecanismo que `aquila.propagacion_solicitud`,
--  Fondos D-37), porque cerrar tiene efectos colaterales atómicos
--  (cumplimiento, encadenamiento de MANT-3, resolución de la incidencia)
--  que ningún trigger de esta tabla puede orquestar por sí solo.
-- ═══════════════════════════════════════════════════════════════════════

create type public.ot_origen_t as enum ('programacion', 'incidencia', 'inspeccion', 'manual');
comment on type public.ot_origen_t is
  'De dónde nace una orden de trabajo (MANT-4 §3.3). Gatilla guard_mant_ot (qué columna de '
  'origen debe estar poblada: programacion_id/incidencia_id/inspeccion_id) — no es vocabulario '
  'descriptivo suelto.';

create type public.ot_estado_t as enum (
  'borrador', 'programada', 'asignada', 'en_ejecucion', 'ejecutada',
  'pendiente_aprobacion', 'cerrada', 'cancelada'
);
comment on type public.ot_estado_t is
  'Ciclo de vida de una OT (MANT-4 §3.3): borrador -> programada -> asignada -> en_ejecucion -> '
  'ejecutada -> [pendiente_aprobacion] -> cerrada; cualquiera salvo cerrada puede cancelarse. '
  '''cerrada'' es terminal para CUALQUIER columna (OT_CERRADA_INMUTABLE) y solo se alcanza vía '
  'fn_mant_cerrar_ot, nunca por UPDATE directo. Gatilla la máquina de estados completa, no es '
  'vocabulario descriptivo.';

create type public.tarea_estado_t as enum ('pendiente', 'ejecutada', 'no_aplica');
comment on type public.tarea_estado_t is
  'Estado de una tarea de OT (MANT-4 §3.4). ''no_aplica'' exige motivo '
  '(TAREA_NO_APLICA_SIN_MOTIVO) y una tarea obligatoria en ''pendiente'' bloquea el cierre de la '
  'OT (OT_CIERRE_INCOMPLETO) — gatilla esas dos reglas, no es vocabulario suelto.';

create table public.mant_ordenes_trabajo (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants (id) on delete cascade,
  numero                   integer not null,
  anio                     smallint not null,

  activo_id                uuid references public.activos (id),
  tipo_mantenimiento_id    bigint not null references public.lista_tipos (id),

  origen                   public.ot_origen_t not null,
  programacion_id          uuid references public.mant_programaciones (id),
  incidencia_id            uuid,
  -- MANT-7 no existe todavía: sin FK a propósito.
  inspeccion_id            uuid,

  requisito_id             uuid references public.mant_requisito (id),

  titulo                   text not null,
  descripcion              text,
  prioridad_id             bigint references public.lista_tipos (id),

  estado                   public.ot_estado_t not null default 'borrador',

  asignado_tercero_id      uuid references public.terceros (id),
  asignado_usuario_id      uuid references public.profiles (id),
  -- MANT-5 no existe todavía: sin FK a propósito.
  contrato_id              uuid,
  -- Necesaria para OT_CUMPLIMIENTO_SIN_ACREDITACION — ver cabecera.
  acreditacion_referencia  text,

  fecha_programada         date,
  fecha_limite             date,
  ventana_hasta            date,
  iniciada_at              timestamptz,
  ejecutada_at             timestamptz,
  cerrada_at               timestamptz,

  requiere_aprobacion      boolean not null default false,
  aprobada_por             uuid references public.profiles (id),
  aprobada_at              timestamptz,

  costo_estimado           numeric(18, 2),
  requiere_parada_servicio boolean not null default false,
  cancelada_motivo         text,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz,

  constraint mant_ordenes_trabajo_numero_unico unique (tenant_id, anio, numero),
  constraint mant_ordenes_trabajo_titulo_no_vacio check (btrim(titulo) <> ''),
  constraint mant_ordenes_trabajo_costo_valido check (costo_estimado is null or costo_estimado >= 0)
);

create index mant_ordenes_trabajo_tenant_idx on public.mant_ordenes_trabajo (tenant_id);
create index mant_ordenes_trabajo_activo_idx on public.mant_ordenes_trabajo (activo_id) where activo_id is not null;
create index mant_ordenes_trabajo_estado_idx on public.mant_ordenes_trabajo (tenant_id, estado);
create index mant_ordenes_trabajo_programacion_idx on public.mant_ordenes_trabajo (programacion_id) where programacion_id is not null;
create index mant_ordenes_trabajo_incidencia_idx on public.mant_ordenes_trabajo (incidencia_id) where incidencia_id is not null;

alter table public.mant_ordenes_trabajo enable row level security;
alter table public.mant_ordenes_trabajo force row level security;

comment on table public.mant_ordenes_trabajo is
  'MANT-4 §3.3: orden de trabajo — el corte central de la serie. Nace de una programación '
  '(MANT-3), una incidencia, una inspección (MANT-7) o manual. cerrada es terminal e '
  'inalcanzable por UPDATE directo (ver guard_mant_ot_transicion) — solo fn_mant_cerrar_ot.';
comment on column public.mant_ordenes_trabajo.incidencia_id is
  'Sin FK — mant_incidencias.orden_trabajo_id apunta hacia acá y ninguna de las dos tablas '
  'puede referenciar a la otra con FK en el mismo CREATE TABLE (dependencia circular). La FK '
  'real de esta columna y la de mant_incidencias.orden_trabajo_id se agregan juntas en '
  '20260930970000.';

create policy mant_ordenes_trabajo_select_miembro
  on public.mant_ordenes_trabajo for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_ordenes_trabajo_insert_auxiliar
  on public.mant_ordenes_trabajo for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_ordenes_trabajo_update_auxiliar
  on public.mant_ordenes_trabajo for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── Historial de estado, append-only (§3.3) ──────────────────────────────
create table public.mant_ot_estado_historial (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  ot_id           uuid not null references public.mant_ordenes_trabajo (id) on delete cascade,
  estado_anterior public.ot_estado_t,
  estado_nuevo    public.ot_estado_t not null,
  motivo          text,
  registrado_por  uuid references public.profiles (id),
  created_at      timestamptz not null default now()
);

alter table public.mant_ot_estado_historial enable row level security;
alter table public.mant_ot_estado_historial force row level security;

create index mant_ot_estado_historial_ot_idx on public.mant_ot_estado_historial (ot_id);

comment on table public.mant_ot_estado_historial is
  'Append-only (mismo patrón que activo_estado_historial, MANT-0) — el INSERT inicial de la OT '
  'no genera fila, solo las transiciones posteriores.';

create policy mant_ot_estado_historial_select_miembro
  on public.mant_ot_estado_historial for select
  to authenticated
  using (public.is_member(tenant_id));

create trigger mant_ot_estado_historial_append_only
  before update or delete on public.mant_ot_estado_historial
  for each row execute function public.forbid_mutation();

-- ── Guard de la ficha + máquina de estados ───────────────────────────────
create function public.guard_mant_ot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo_mant text;
  v_prioridad text;
  v_politica public.mant_politica_aprobacion_ot;
  v_permitida boolean := false;
begin
  if tg_op = 'UPDATE' and old.estado = 'cerrada' then
    raise exception 'OT_CERRADA_INMUTABLE: la OT % ya está cerrada y no admite cambios', old.id;
  end if;

  select tipo into v_tipo_mant from public.lista_tipos where id = new.tipo_mantenimiento_id;
  if v_tipo_mant is distinct from 'TIPO_MANTENIMIENTO' then
    raise exception 'OT_TIPO_MANTENIMIENTO_INVALIDO: tipo_mantenimiento_id % no pertenece a '
      'TIPO_MANTENIMIENTO (es %)', new.tipo_mantenimiento_id, coalesce(v_tipo_mant, 'inexistente');
  end if;

  if new.prioridad_id is not null then
    select tipo into v_prioridad from public.lista_tipos where id = new.prioridad_id;
    if v_prioridad is distinct from 'PRIORIDAD' then
      raise exception 'INCIDENCIA_PRIORIDAD_INVALIDA: prioridad_id % no pertenece a PRIORIDAD (es %)',
        new.prioridad_id, coalesce(v_prioridad, 'inexistente');
    end if;
  end if;

  -- ── Consistencia de origen (§3.3) ──
  case new.origen
    when 'programacion' then
      if new.programacion_id is null or new.incidencia_id is not null or new.inspeccion_id is not null then
        raise exception 'OT_ORIGEN_INCONSISTENTE: origen = ''programacion'' exige solo programacion_id';
      end if;
    when 'incidencia' then
      if new.incidencia_id is null or new.programacion_id is not null or new.inspeccion_id is not null then
        raise exception 'OT_ORIGEN_INCONSISTENTE: origen = ''incidencia'' exige solo incidencia_id';
      end if;
    when 'inspeccion' then
      if new.inspeccion_id is null or new.programacion_id is not null or new.incidencia_id is not null then
        raise exception 'OT_ORIGEN_INCONSISTENTE: origen = ''inspeccion'' exige solo inspeccion_id';
      end if;
    when 'manual' then
      if new.programacion_id is not null or new.incidencia_id is not null or new.inspeccion_id is not null then
        raise exception 'OT_ORIGEN_INCONSISTENTE: origen = ''manual'' no admite programacion_id/incidencia_id/inspeccion_id';
      end if;
  end case;

  -- ── Consistencia de tenant ──
  if new.activo_id is not null
     and not exists (select 1 from public.activos where id = new.activo_id and tenant_id = new.tenant_id) then
    raise exception 'OT_TENANT_INCONSISTENTE: el activo % no pertenece al tenant', new.activo_id;
  end if;
  if new.programacion_id is not null
     and not exists (select 1 from public.mant_programaciones where id = new.programacion_id and tenant_id = new.tenant_id) then
    raise exception 'OT_TENANT_INCONSISTENTE: la programación % no pertenece al tenant', new.programacion_id;
  end if;
  if new.requisito_id is not null
     and not exists (select 1 from public.mant_requisito where id = new.requisito_id and tenant_id = new.tenant_id) then
    raise exception 'OT_TENANT_INCONSISTENTE: el requisito % no pertenece al tenant', new.requisito_id;
  end if;
  if new.asignado_tercero_id is not null
     and not exists (select 1 from public.terceros where id = new.asignado_tercero_id and tenant_id = new.tenant_id) then
    raise exception 'OT_TENANT_INCONSISTENTE: el tercero % no pertenece al tenant', new.asignado_tercero_id;
  end if;

  -- ── Umbral de aprobación (§3.3): piso, nunca techo — la política solo puede EXIGIR más, ──
  -- nunca relajar lo que el propio usuario ya marcó true.
  if tg_op = 'INSERT' then
    v_politica := public.fn_mant_politica_aprobacion_vigente(new.tenant_id);
    if v_politica.id is not null then
      if (v_politica.monto_umbral is not null and coalesce(new.costo_estimado, 0) > v_politica.monto_umbral)
         or (v_politica.exige_por_parada_servicio and new.requiere_parada_servicio) then
        new.requiere_aprobacion := true;
      end if;
    end if;
  end if;

  -- ── Cancelar exige motivo ──
  if new.estado = 'cancelada' and (new.cancelada_motivo is null or btrim(new.cancelada_motivo) = '') then
    raise exception 'OT_CANCELACION_SIN_MOTIVO: cancelar una OT exige cancelada_motivo';
  end if;

  -- ── Máquina de estados (solo en UPDATE) ──
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if new.estado = 'cerrada' then
      -- Cerrar SIEMPRE pasa por fn_mant_cerrar_ot, que marca esta bandera de sesión antes de
      -- su propio UPDATE controlado (mismo mecanismo que aquila.propagacion_solicitud, Fondos).
      if coalesce(current_setting('aquila.cerrando_ot', true), 'false') <> 'true' then
        raise exception 'OT_TRANSICION_INVALIDA: cerrar una OT exige fn_mant_cerrar_ot, no un UPDATE directo';
      end if;
    else
      v_permitida := case old.estado
        when 'borrador'              then new.estado in ('programada', 'asignada', 'cancelada')
        when 'programada'            then new.estado in ('asignada', 'cancelada')
        when 'asignada'              then new.estado in ('en_ejecucion', 'cancelada')
        when 'en_ejecucion'          then new.estado in ('ejecutada', 'cancelada')
        when 'ejecutada'             then new.estado in ('pendiente_aprobacion', 'cancelada')
        when 'pendiente_aprobacion'  then new.estado = 'cancelada'
        else false
      end;
      -- 'ejecutada' -> 'pendiente_aprobacion' solo tiene sentido si la OT lo exige; si no lo
      -- exige, 'ejecutada' es ya el estado final previo al cierre (fn_mant_cerrar_ot lo cierra
      -- directo desde ahí).
      if old.estado = 'ejecutada' and new.estado = 'pendiente_aprobacion' and not new.requiere_aprobacion then
        v_permitida := false;
      end if;
      if not v_permitida then
        raise exception 'OT_TRANSICION_INVALIDA: % -> % no está permitida', old.estado, new.estado;
      end if;
    end if;

    insert into public.mant_ot_estado_historial (tenant_id, ot_id, estado_anterior, estado_nuevo, motivo, registrado_por)
    values (new.tenant_id, new.id, old.estado, new.estado, new.cancelada_motivo, (select auth.uid()));
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_mant_ot() is
  'MANT-4 §3.3: valida catálogos/consistencia de tenant, la coherencia de origen, aplica el '
  'umbral de aprobación como piso (nunca relaja lo que el usuario ya marcó), exige motivo para '
  'cancelar, valida la máquina de estados y bloquea ''cerrada'' salvo que la dispare '
  'fn_mant_cerrar_ot. cerrada es terminal para cualquier columna (chequeo al inicio, antes de '
  'cualquier otra validación) — lección D-54/D-55 aplicada desde el arranque.';

create trigger mant_ordenes_trabajo_guard
  before insert or update on public.mant_ordenes_trabajo
  for each row execute function public.guard_mant_ot();
