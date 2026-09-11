-- ═══════════════════════════════════════════════════════════════════════
--  CO-9 · Conservación documental (§4.6) — ET art. 632: 5 años desde el 1
--  de enero del año siguiente a la elaboración/expedición/recepción del
--  documento (verificado vía WebSearch contra el fallo del Consejo de
--  Estado 76001-23-31-000-2006-00242-01(18971) y funcionpublica.gov.co;
--  fecha_validacion de hoy en fundamento_normativo, próxima migración).
--
--  Tabla simple, sin vigencia_estado_t: a diferencia de gobierno_politica_
--  semaforo (una regla de cálculo que necesita historial auditable de
--  versiones), esto es un plazo por tipo de documento que se corrige
--  editando la fila — mismo peso que mant_habilitacion_requerida (MANT-5),
--  no el de una política financiera.
--
--  fundamento_normativo_id es bigint, no uuid: el marco (§3) describe esta
--  tabla con columnas tipo_fundamento/ambito/fecha_validacion/fuente_url
--  que NO existen — verificado leyendo 20260814200000 (creación) y
--  20260902100000 (rediseño posterior). Las columnas reales son
--  id bigint, tipo (enum ley/decreto/reglamento_ph/decision_asamblea/otra),
--  norma, articulo, descripcion, fecha_vigencia, referencia — se siembra
--  con esas, mismo patrón exacto que 20260930170000_co1_fundamento_normativo.sql.
--
--  NO duplica documentos_legal_holds (§4.6, vinculante) — la función de
--  abajo excluye explícitamente cualquier documento bajo hold activo.
-- ═══════════════════════════════════════════════════════════════════════

create table public.contable_politica_conservacion (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  tipo_documento_id   bigint not null references public.lista_tipos (id),
  plazo_anios         smallint not null check (plazo_anios > 0),
  fundamento_normativo_id bigint references public.fundamento_normativo (id),
  actualizado_por     uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint contable_politica_conservacion_tipo_unico unique (tenant_id, tipo_documento_id)
);

alter table public.contable_politica_conservacion enable row level security;
alter table public.contable_politica_conservacion force row level security;

create index contable_politica_conservacion_tenant_idx
  on public.contable_politica_conservacion (tenant_id);

comment on table public.contable_politica_conservacion is
  'CO-9 §4.6: plazo de retención por tipo de documento contable, parametrizable por tenant. El '
  'plazo legal (ET art. 632: 5 años) es solo el valor sugerido al crear la fila desde la UI — el '
  'fundamento queda visible vía fundamento_normativo_id, nunca hard-coded en una función. Sin '
  'fila para un tipo_documento_id = sin alerta para ese tipo (nunca bloquea, nunca purga).';

create policy contable_politica_conservacion_select_miembro
  on public.contable_politica_conservacion for select
  to authenticated
  using (public.is_member(tenant_id));

create policy contable_politica_conservacion_administrador_todo
  on public.contable_politica_conservacion for all
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

create trigger contable_politica_conservacion_updated_at
  before update on public.contable_politica_conservacion
  for each row execute function public.set_updated_at();

-- ── diagnóstico de solo lectura: documentos próximos a vencer su retención
--    (mismo criterio que mant_inventario_pendientes_contabilizar — nunca
--    bloqueante, nunca purga) ───────────────────────────────────────────
create function public.contable_documentos_proximos_vencer_retencion(
  p_tenant_id uuid, p_dias_anticipacion int default 90
)
returns table (
  documento_id      uuid,
  tipo_documento    text,
  fecha_origen      date,
  fecha_limite      date,
  dias_restantes    int,
  bajo_legal_hold   boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    d.id,
    lt.nombre,
    d.created_at::date,
    fecha_limite,
    (fecha_limite - current_date)::int,
    exists (
      select 1 from public.documentos_legal_holds h
      where h.tenant_id = d.tenant_id and h.documento_grupo_id = d.grupo_id and h.activo
    )
  from public.documentos d
  join public.contable_politica_conservacion pc
    on pc.tenant_id = d.tenant_id and pc.tipo_documento_id = d.tipo_documento_id
  join public.lista_tipos lt on lt.id = d.tipo_documento_id
  cross join lateral (
    select (d.created_at::date + make_interval(years => pc.plazo_anios::int))::date as fecha_limite
  ) l
  where d.tenant_id = p_tenant_id
    and fecha_limite <= current_date + p_dias_anticipacion
  order by fecha_limite;
$$;

comment on function public.contable_documentos_proximos_vencer_retencion(uuid, int) is
  'CO-9 §4.6: diagnóstico de solo lectura, nunca purga automática. bajo_legal_hold=true significa '
  'que documentos_legal_holds ya protege ese documento — la UI lo muestra distinto, no lo excluye '
  'de la lista, para que quede visible que hay un motivo para no actuar sobre él.';
