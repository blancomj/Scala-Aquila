-- ═══════════════════════════════════════════════════════════════════════
--  GOB-7 · gobierno_impugnaciones — entidad única para los dos objetos
--  impugnables (decisión de asamblea, sanción de convivencia)
--  Ver GOB_07_impugnacion.md §4.1, pruebas 1, 3, 4, 9, 11, 12.
--
--  Nace numerada al presentarse (gobierno_presentar_impugnacion, migración
--  siguiente) — nunca hay borrador, mismo criterio que el expediente de
--  GOB-6: presentar una impugnación ya es un hecho procesal formal.
--
--  suspension_fundamento no está en la lista literal de columnas del spec
--  §4.1 pero la exige su propia regla del §4.2 ("obligación de justificar
--  cuando se marque [suspende_efectos] true") — no hay dónde más guardar
--  esa justificación sin sobrecargar causal/fundamento, que son los de la
--  impugnación misma, no los de la suspensión.
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_impugnacion_consecutivo (
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  anio          smallint not null,
  ultimo_numero integer not null default 0,
  updated_at    timestamptz,

  primary key (tenant_id, anio)
);

alter table public.gobierno_impugnacion_consecutivo enable row level security;
alter table public.gobierno_impugnacion_consecutivo force row level security;

create policy gobierno_impugnacion_consecutivo_select_miembro
  on public.gobierno_impugnacion_consecutivo for select
  to authenticated
  using (public.is_member(tenant_id));

create function public.fn_gobierno_siguiente_numero_impugnacion(p_tenant_id uuid, p_anio smallint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero integer;
begin
  insert into public.gobierno_impugnacion_consecutivo (tenant_id, anio, ultimo_numero, updated_at)
  values (p_tenant_id, p_anio, 1, now())
  on conflict (tenant_id, anio)
  do update set ultimo_numero = public.gobierno_impugnacion_consecutivo.ultimo_numero + 1, updated_at = now()
  returning ultimo_numero into v_numero;

  return v_numero;
end;
$$;

comment on function public.fn_gobierno_siguiente_numero_impugnacion(uuid, smallint) is
  'GOB-7: consecutivo atómico por (tenant, año), mismo mecanismo (INSERT...ON CONFLICT...'
  'RETURNING) que fn_gobierno_siguiente_numero_decision/_expediente.';

create table public.gobierno_impugnaciones (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references public.tenants (id) on delete cascade,
  numero                      integer not null,
  anio                        smallint not null,
  objeto_tipo                 public.impugnacion_objeto_t not null,
  decision_id                 uuid references public.gobierno_decisiones (id),
  expediente_id               uuid references public.gobierno_expedientes_convivencia (id),
  impugnante_ref              uuid not null references public.terceros (id),
  calidad                     text,
  presentada_por              uuid references public.profiles (id),
  fecha_notificacion_objeto   date not null,
  fecha_presentacion          date not null,
  plazo_limite                date not null,
  plazo_fundamento_valido     boolean not null default false,
  presentada_en_plazo         boolean not null,
  causal                      text not null,
  fundamento                  text,
  documento_id                uuid references public.documentos (id),
  estado                      public.impugnacion_estado_t not null default 'presentada',
  instancia                   text,
  suspende_efectos            boolean not null default false,
  suspension_fundamento       text,
  resultado                   public.impugnacion_resultado_t,
  resultado_detalle           text,
  resuelta_at                 timestamptz,
  resolucion_documento_id     uuid references public.documentos (id),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz,

  constraint gobierno_impugnaciones_numero_unico unique (tenant_id, anio, numero),
  constraint gobierno_impugnaciones_objeto_check check (
    (objeto_tipo = 'decision' and decision_id is not null and expediente_id is null)
    or
    (objeto_tipo = 'sancion' and expediente_id is not null and decision_id is null)
  ),
  constraint gobierno_impugnaciones_causal_no_vacia check (btrim(causal) <> ''),
  constraint gobierno_impugnaciones_suspension_fundamentada check (
    not suspende_efectos or (suspension_fundamento is not null and btrim(suspension_fundamento) <> '')
  ),
  constraint gobierno_impugnaciones_modificada_con_detalle check (
    resultado is distinct from 'modificada' or (resultado_detalle is not null and btrim(resultado_detalle) <> '')
  )
);

alter table public.gobierno_impugnaciones enable row level security;
alter table public.gobierno_impugnaciones force row level security;

create index gobierno_impugnaciones_tenant_idx on public.gobierno_impugnaciones (tenant_id);
create index gobierno_impugnaciones_decision_idx
  on public.gobierno_impugnaciones (decision_id) where decision_id is not null;
create index gobierno_impugnaciones_expediente_idx
  on public.gobierno_impugnaciones (expediente_id) where expediente_id is not null;

comment on table public.gobierno_impugnaciones is
  'GOB-7: registro de la impugnación de una decisión de asamblea (art. 49) o de una sanción de '
  'convivencia (art. 62, vía su expediente) — AQUILA la registra, calcula su plazo y marca sus '
  'efectos; NO la resuelve (spec §2, §5). objeto_tipo gatilla cuál de decision_id/expediente_id '
  'está poblada (check) y qué efecto aplica gobierno_resolver_impugnacion().';
comment on column public.gobierno_impugnaciones.plazo_limite is
  'fecha_notificacion_objeto + plazo_dias hábiles (gobierno_sumar_dias_habiles, GOB-4) según '
  'gobierno_parametro_impugnacion del tenant para este objeto_tipo — informativo (spec §4.3): '
  'quien decide si una impugnación extemporánea se admite es la instancia, no el software.';
comment on column public.gobierno_impugnaciones.plazo_fundamento_valido is
  'false cuando gobierno_parametro_impugnacion.fundamento_normativo_id era nulo al presentar '
  '(IMPUGNACION_PLAZO_SIN_FUNDAMENTO, advertencia visible en UI, spec §3) — el plazo igual se '
  'calculó y se muestra, nunca bloquea.';
comment on column public.gobierno_impugnaciones.presentada_en_plazo is
  'Informativo (spec §4.3, prueba 9): una impugnación extemporánea se registra igual con este '
  'campo en false — admitirla o no es decisión de la instancia, no del software.';
comment on column public.gobierno_impugnaciones.suspende_efectos is
  'Default false (spec §4.2): la impugnación NO suspende automáticamente los efectos del objeto '
  'impugnado — si suspende o no depende del caso y de la instancia, AQUILA no decide por el '
  'usuario. true exige suspension_fundamento (check, IMPUGNACION_SUSPENSION_SIN_FUNDAMENTO).';
comment on column public.gobierno_impugnaciones.resultado_detalle is
  'Obligatorio cuando resultado=modificada (check, spec §4.2: "modificada → exige registrar en '
  'qué"); libre en los demás resultados.';
comment on column public.gobierno_impugnaciones.presentada_por is
  'Quién presentó la impugnación (coalesce(auth.uid(), p_actor_id) en gobierno_presentar_'
  'impugnacion) — mismo criterio de auditoría que gobierno_expedientes_convivencia.reportado_por '
  '(GOB-6).';
comment on column public.gobierno_impugnaciones.calidad is
  'Texto libre a propósito, mismo criterio que gobierno_decisiones.prioridad (GOB-5): el spec '
  '(§4.1) no fija un vocabulario cerrado y ninguna de las 12 pruebas del corte lo ejercita — no '
  'gobierna ninguna transición ni cálculo, así que no amerita lista_tipos ni enum (D-24).';

create trigger set_updated_at before update on public.gobierno_impugnaciones
  for each row execute function public.set_updated_at();

create policy gobierno_impugnaciones_select_miembro
  on public.gobierno_impugnaciones for select
  to authenticated
  using (public.is_member(tenant_id));

-- Sin política insert/update para `authenticated`: toda escritura pasa por
-- gobierno_presentar_impugnacion()/gobierno_registrar_actuacion_impugnacion()/
-- gobierno_resolver_impugnacion() (security definer), mismo criterio que
-- gobierno_actas/gobierno_decisiones/gobierno_expedientes_convivencia.

create table public.gobierno_impugnacion_actuaciones (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  impugnacion_id  uuid not null references public.gobierno_impugnaciones (id) on delete cascade,
  estado          public.impugnacion_estado_t not null,
  fecha           date not null,
  descripcion     text not null,
  documento_id    uuid references public.documentos (id),
  registrado_por  uuid references public.profiles (id),
  created_at      timestamptz not null default now()
);

alter table public.gobierno_impugnacion_actuaciones enable row level security;
alter table public.gobierno_impugnacion_actuaciones force row level security;

create index gobierno_impugnacion_actuaciones_tenant_idx
  on public.gobierno_impugnacion_actuaciones (tenant_id);
create index gobierno_impugnacion_actuaciones_impugnacion_idx
  on public.gobierno_impugnacion_actuaciones (impugnacion_id);

comment on table public.gobierno_impugnacion_actuaciones is
  'GOB-7: bitácora append-only de la impugnación, mismo patrón que gobierno_expediente_'
  'actuaciones (GOB-6) y caso_juridico_actuaciones — cada fila es un hito (p.ej. cambio a '
  'en_tramite con su instancia, o desistimiento); resuelta la asigna SOLO '
  'gobierno_resolver_impugnacion() (prueba 10).';

create policy gobierno_impugnacion_actuaciones_select_miembro
  on public.gobierno_impugnacion_actuaciones for select
  to authenticated
  using (public.is_member(tenant_id));

create trigger gobierno_impugnacion_actuaciones_append_only
  before update or delete on public.gobierno_impugnacion_actuaciones
  for each row execute function public.forbid_mutation();
