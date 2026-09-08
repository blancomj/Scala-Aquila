-- ═══════════════════════════════════════════════════════════════════════
--  GOB-8 · solicitudes + solicitud_sla + gobierno_sumar_horas_habiles
--  Ver GOB_08_atencion_consulta.md §4.1, §4.2.
--
--  `solicitudes` sin prefijo `gobierno_` a propósito: es transversal (mismo
--  criterio que `documentos`/`novedades`) — escala hacia convivencia
--  (GOB-6), decisión (GOB-5) y agenda (GOB-2), no es un concepto exclusivo
--  del dominio de gobierno.
--
--  `calidad` reutiliza gobierno_expediente_calidad_t de GOB-6 tal cual — es
--  exactamente el mismo concepto (quién es el solicitante frente al
--  inmueble: propietario/tenedor/tercero), no se inventa un enum nuevo.
--
--  solicitud_sla: cero filas precargadas (spec §4.2, criterio de
--  aceptación) — la copropiedad las define. Sin `unique` estricta sobre
--  (tipo,categoria,prioridad): permite que una fila nueva con
--  vigente_desde posterior reemplace la vigente anterior sin borrarla,
--  mismo espíritu que coeficiente_sets (histórico, no se sobreescribe).
-- ═══════════════════════════════════════════════════════════════════════

create table public.solicitud_sla (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants (id) on delete cascade,
  tipo_id                  bigint not null references public.lista_tipos (id),
  categoria_id             bigint not null references public.lista_tipos (id),
  prioridad_id             bigint not null references public.lista_tipos (id),
  horas_primera_respuesta  numeric(6, 2) not null,
  horas_resolucion         numeric(6, 2) not null,
  horario_habil            boolean not null default false,
  vigente_desde            date not null default current_date,
  vigente_hasta            date,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz,

  constraint solicitud_sla_horas_positivas check (horas_primera_respuesta > 0 and horas_resolucion > 0),
  constraint solicitud_sla_vigencia_valida check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

alter table public.solicitud_sla enable row level security;
alter table public.solicitud_sla force row level security;

create index solicitud_sla_tenant_idx on public.solicitud_sla (tenant_id);
create index solicitud_sla_match_idx on public.solicitud_sla (tenant_id, tipo_id, categoria_id, prioridad_id);

create trigger set_updated_at before update on public.solicitud_sla
  for each row execute function public.set_updated_at();

comment on table public.solicitud_sla is
  'GOB-8 §4.2: horas de primera respuesta/resolución por (tipo, categoría, prioridad) —'
  ' BUENA PRÁCTICA, sin base legal (ver fundamento_normativo.referencia='
  '''gob8_buena_practica_sin_base_legal''). Cero filas precargadas: cada copropiedad las define. '
  'Sin SLA configurado para una combinación dada, la solicitud simplemente no rastrea '
  'vencimiento (sla_id/sla_vence_at quedan null) — el SLA nunca bloquea la operación.';
comment on column public.solicitud_sla.horario_habil is
  'Si es true, el reloj del SLA solo corre en días hábiles colombianos '
  '(gobierno_es_dia_habil, GOB-4) — gobierno_sumar_horas_habiles() lo aplica.';

create policy solicitud_sla_select_miembro
  on public.solicitud_sla for select
  to authenticated
  using (public.is_member(tenant_id));

create policy solicitud_sla_insert_auxiliar
  on public.solicitud_sla for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy solicitud_sla_update_auxiliar
  on public.solicitud_sla for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── gobierno_sumar_horas_habiles — el reloj del SLA en horario hábil ────
-- Grano-hora, análoga a gobierno_sumar_dias_habiles (GOB-4) pero para un
-- SLA expresado en horas, no en días. Reutiliza gobierno_es_dia_habil()
-- tal cual — cero lógica de festivos nueva.
create function public.gobierno_sumar_horas_habiles(p_desde timestamptz, p_horas numeric)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_fecha timestamptz := p_desde;
  v_restantes numeric := p_horas;
begin
  if p_horas < 0 then
    raise exception 'HORAS_HABILES_NEGATIVO: p_horas % debe ser >= 0', p_horas;
  end if;
  while v_restantes > 0 loop
    v_fecha := v_fecha + interval '1 hour';
    if public.gobierno_es_dia_habil(v_fecha::date) then
      v_restantes := v_restantes - 1;
    end if;
  end loop;
  return v_fecha;
end;
$$;

comment on function public.gobierno_sumar_horas_habiles(timestamptz, numeric) is
  'GOB-8: suma p_horas horas al reloj del SLA, contando solo horas dentro de un día hábil '
  '(sábados, domingos y festivos colombianos aportan cero — el vencimiento "salta" esos días '
  'enteros, spec §6 prueba 4). Reutiliza gobierno_es_dia_habil (GOB-4).';

-- ── solicitudes ──────────────────────────────────────────────────────────
create table public.solicitud_consecutivo (
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  anio          smallint not null,
  ultimo_numero integer not null default 0,
  updated_at    timestamptz,

  primary key (tenant_id, anio)
);

alter table public.solicitud_consecutivo enable row level security;
alter table public.solicitud_consecutivo force row level security;

create policy solicitud_consecutivo_select_miembro
  on public.solicitud_consecutivo for select
  to authenticated
  using (public.is_member(tenant_id));

create function public.fn_siguiente_numero_solicitud(p_tenant_id uuid, p_anio smallint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero integer;
begin
  insert into public.solicitud_consecutivo (tenant_id, anio, ultimo_numero, updated_at)
  values (p_tenant_id, p_anio, 1, now())
  on conflict (tenant_id, anio)
  do update set ultimo_numero = public.solicitud_consecutivo.ultimo_numero + 1, updated_at = now()
  returning ultimo_numero into v_numero;

  return v_numero;
end;
$$;

create table public.solicitudes (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants (id) on delete cascade,
  numero                    integer not null,
  anio                      smallint not null,
  tipo_id                   bigint not null references public.lista_tipos (id),
  categoria_id              bigint not null references public.lista_tipos (id),
  origen_id                 bigint not null references public.lista_tipos (id),
  prioridad_id              bigint not null references public.lista_tipos (id),
  solicitante_ref           uuid not null references public.terceros (id),
  inmueble_id               uuid not null references public.inmuebles (id),
  calidad                   public.gobierno_expediente_calidad_t not null,
  asunto                    text not null,
  descripcion               text,
  creada_por                uuid references public.profiles (id),
  estado                    public.solicitud_estado_t not null default 'nueva',
  asignado_a                uuid references public.profiles (id),
  asignado_at               timestamptz,
  sla_id                    uuid references public.solicitud_sla (id),
  sla_vence_at              timestamptz,
  en_espera_desde           timestamptz,
  resuelta_at               timestamptz,
  cerrada_at                timestamptz,
  anulada_motivo            text,
  decision_id               uuid references public.gobierno_decisiones (id),
  expediente_convivencia_id uuid references public.gobierno_expedientes_convivencia (id),
  agenda_punto_id           uuid references public.gobierno_agenda_puntos (id),
  orden_trabajo_referencia  text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz,

  constraint solicitudes_numero_unico unique (tenant_id, anio, numero),
  constraint solicitudes_anulacion_con_motivo check (
    estado is distinct from 'anulada' or (anulada_motivo is not null and btrim(anulada_motivo) <> '')
  )
);

alter table public.solicitudes enable row level security;
alter table public.solicitudes force row level security;

create index solicitudes_tenant_idx on public.solicitudes (tenant_id);
create index solicitudes_inmueble_idx on public.solicitudes (inmueble_id);

comment on table public.solicitudes is
  'GOB-8: petición/queja/reclamo/sugerencia de un propietario/tenedor/tercero — BUENA PRÁCTICA '
  '(spec §2), no obligación legal. Nace numerada (nunca borrador, mismo criterio que expediente '
  'de GOB-6). Puede escalar a decisión_id/expediente_convivencia_id/agenda_punto_id (todos '
  'disponibles); orden_trabajo_referencia es texto libre sin FK a propósito — el módulo de '
  'mantenimiento (órdenes de trabajo) no existe todavía (spec §4.3, vinculante).';
comment on column public.solicitudes.orden_trabajo_referencia is
  'Campo previsto por el spec §4.3 para un futuro enlace a una orden de trabajo de '
  'mantenimiento — sin FK porque ese módulo no existe (fuera de alcance, vinculante). Texto '
  'libre mientras tanto.';
comment on column public.solicitudes.sla_vence_at is
  'Calculado al crear (created_at + horas_resolucion del solicitud_sla que empareja, hábil si '
  'corresponde) y desplazado hacia adelante cada vez que sale de en_espera (spec §6 prueba 2) — '
  'null si no hay solicitud_sla configurado para (tipo,categoria,prioridad). "Vencida" se '
  'consulta en caliente comparando contra now(), nunca se persiste como booleano (spec §4.2, '
  'marco §6.3).';
comment on column public.solicitudes.en_espera_desde is
  'Momento en que entró a en_espera — null cuando no está en_espera. Al salir, el tiempo '
  'transcurrido aquí se suma a sla_vence_at (pausa/reanuda el reloj, spec §6 prueba 2).';

create policy solicitudes_select_miembro
  on public.solicitudes for select
  to authenticated
  using (public.is_member(tenant_id));

-- Sin política insert/update para `authenticated`: toda escritura pasa por
-- gobierno_crear_solicitud()/gobierno_registrar_actuacion_solicitud() (security definer),
-- mismo criterio que gobierno_expedientes_convivencia/gobierno_impugnaciones.

create trigger set_updated_at before update on public.solicitudes
  for each row execute function public.set_updated_at();
