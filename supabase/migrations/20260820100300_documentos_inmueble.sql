-- ═══════════════════════════════════════════════════════════════════════
--  documentos_inmueble — librería de documentos del inmueble (T0.4)
--  Propietario: PROMPT_FICHA_INMUEBLE.md §4.2, §8.1
--
--  Append-only y versionado por (grupo_id, version) — mismo patrón que
--  cargos/pagos/fondo_movimientos (Anti-Redundancia: reutiliza
--  forbid_mutation(), no un trigger nuevo). Un documento "nuevo" es una
--  fila con grupo_id nuevo y version=1; "reemplazar" un documento
--  existente es una fila con el mismo grupo_id y version+1 — nunca UPDATE.
--
--  GAP §8.1 — deliberado, no un olvido: esta tabla NO tiene política de
--  INSERT para `authenticated`. Calcular la siguiente versión bajo
--  concurrencia y coordinar con Storage necesita una Edge Function
--  (subir-documento) que todavía no existe, y el bucket de Storage
--  tampoco. Esta migración solo habilita LECTURA — el tab Documentos de
--  la ficha se implementa de solo lectura, el botón "Subir" queda
--  deshabilitado. No se agrega política INSERT aquí ni se debe agregar
--  desde el frontend con un insert directo — es exactamente la condición
--  de carrera que esta decisión evita.
-- ═══════════════════════════════════════════════════════════════════════

create table public.documentos_inmueble (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  inmueble_id         uuid not null references public.inmuebles (id) on delete cascade,
  tipo_documento_id   bigint not null references public.lista_tipos (id),
  grupo_id            uuid not null default gen_random_uuid(),
  version             int not null default 1,
  nombre_archivo      text not null,
  storage_path        text not null,
  tamano_bytes        bigint,
  fecha_vencimiento   date,
  subido_por          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),

  constraint documentos_inmueble_version_unica unique (grupo_id, version),
  constraint documentos_inmueble_version_positiva check (version > 0)
);

alter table public.documentos_inmueble enable row level security;
alter table public.documentos_inmueble force row level security;

create index documentos_inmueble_tenant_idx on public.documentos_inmueble (tenant_id);
create index documentos_inmueble_inmueble_idx on public.documentos_inmueble (inmueble_id);
create index documentos_inmueble_grupo_idx on public.documentos_inmueble (grupo_id);

create policy documentos_inmueble_select_miembro
  on public.documentos_inmueble for select
  to authenticated
  using (public.is_member(tenant_id));

comment on table public.documentos_inmueble is
  'Append-only, versionado por (grupo_id, version) — nunca UPDATE, "reemplazar" es una fila '
  'nueva con version+1. Sin política INSERT (gap §8.1 deliberado): la escritura real espera '
  'una Edge Function + bucket de Storage que todavía no existen. Solo lectura por ahora.';

create trigger documentos_inmueble_append_only
  before update or delete on public.documentos_inmueble
  for each row execute function public.forbid_mutation();

-- ── v_documento_vigente — última versión de cada grupo_id ──────────────
create view public.v_documento_vigente
with (security_invoker = true) as
select distinct on (grupo_id) *
from public.documentos_inmueble
order by grupo_id, version desc;

comment on view public.v_documento_vigente is
  'Última versión de cada grupo_id — derivado, no persistido (§4.2). security_invoker=true: '
  'respeta el RLS de documentos_inmueble del usuario que consulta, no del dueño de la vista.';

-- ── amplía TIPO_DOCUMENTO_PREDIO con los 4 códigos del mockup ──────────
-- Los 8 valores ya sembrados (20260814180000) no coinciden con las
-- opciones del mockup ficha-inmueble.html — decisión explícita del
-- usuario: se suman, no se reemplazan.
insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_DOCUMENTO_PREDIO', 'reglamento_ph', 'Reglamento de propiedad horizontal', 9),
  ('TIPO_DOCUMENTO_PREDIO', 'contrato', 'Contrato', 10),
  ('TIPO_DOCUMENTO_PREDIO', 'acta_asamblea', 'Acta de asamblea', 11),
  ('TIPO_DOCUMENTO_PREDIO', 'fotografia', 'Fotografía', 12);
