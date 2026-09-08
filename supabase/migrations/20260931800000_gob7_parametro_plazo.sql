-- ═══════════════════════════════════════════════════════════════════════
--  GOB-7 · gobierno_parametro_impugnacion — el plazo, parametrizado, no
--  constante
--  Ver GOB_07_impugnacion.md §3, §4.3, pruebas 7 y 8.
--
--  Mismo patrón que gobierno_config_expensa_necesaria (GOB-6): cero filas
--  precargadas, el tenant configura explícitamente. fundamento_normativo_id
--  es NULLABLE a propósito — el spec exige que su ausencia NO bloquee
--  (IMPUGNACION_PLAZO_SIN_FUNDAMENTO es una advertencia visible, nunca una
--  excepción), pero sin ninguna fila configurada para el objeto_tipo no hay
--  plazo_dias que aplicar — eso sí es bloqueante
--  (IMPUGNACION_PLAZO_NO_CONFIGURADO), porque ahí no falta el fundamento:
--  falta el dato completo.
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_parametro_impugnacion (
  tenant_id               uuid not null references public.tenants (id) on delete cascade,
  objeto_tipo             public.impugnacion_objeto_t not null,
  plazo_dias              integer not null,
  fundamento_normativo_id bigint references public.fundamento_normativo (id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz,

  primary key (tenant_id, objeto_tipo),
  constraint gobierno_parametro_impugnacion_plazo_positivo check (plazo_dias > 0)
);

alter table public.gobierno_parametro_impugnacion enable row level security;
alter table public.gobierno_parametro_impugnacion force row level security;

create trigger set_updated_at before update on public.gobierno_parametro_impugnacion
  for each row execute function public.set_updated_at();

comment on table public.gobierno_parametro_impugnacion is
  'GOB-7 §4.3: plazo (en días hábiles) para impugnar una decisión (art. 49) o una sanción '
  '(art. 62), configurado explícitamente por tenant — nunca inferido, nunca constante de código '
  '(spec §3: ambos plazos están "por verificar" contra fuente primaria). '
  'fundamento_normativo_id nullable: su ausencia solo advierte '
  '(IMPUGNACION_PLAZO_SIN_FUNDAMENTO), no bloquea.';
comment on column public.gobierno_parametro_impugnacion.fundamento_normativo_id is
  'Nullable a propósito (spec §3): sin fundamento registrado, gobierno_presentar_impugnacion() '
  'calcula igual el plazo_limite pero marca plazo_fundamento_valido=false — la ley ya fija el '
  'plazo, lo que puede faltar es solo la verificación documental, y un vencimiento mal fundado '
  'nunca debe cerrar el derecho de nadie (spec §3, marco §2).';

create policy gobierno_parametro_impugnacion_select_miembro
  on public.gobierno_parametro_impugnacion for select
  to authenticated
  using (public.is_member(tenant_id));

create policy gobierno_parametro_impugnacion_insert_auxiliar
  on public.gobierno_parametro_impugnacion for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy gobierno_parametro_impugnacion_update_auxiliar
  on public.gobierno_parametro_impugnacion for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
