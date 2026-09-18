-- ═══════════════════════════════════════════════════════════════════════
--  EXT-12 (Ola 2, M17) · Mi Copropiedad — correspondencia/paquetería
--  Ver PROMPT_MI_COPROPIEDAD_FASE2.md §4.1/§7.7/§8.4.
--
--  D-24: TIPO_CORRESPONDENCIA es vocabulario configurable → lista_tipos,
--  cero filas precargadas (cada copropiedad define carta/paquete/
--  encomienda/... según le sirva) — mismo criterio que TIPO_SOLICITUD
--  (GOB-8, 20260931850000). `tipo_id` es nullable: un tenant que aún no
--  definió su taxonomía no debe quedar bloqueado para registrar algo tan
--  simple como "llegó un paquete".
--
--  Solo lectura para el residente (§7.7, §6.1): quien marca `entregada`
--  es SIEMPRE staff en portería (§8.4 paso 3, "al recogerlo, staff marca
--  entregada=true") — el residente nunca escribe esta tabla, ni directo
--  ni vía Edge Function.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre, descripcion) values
  ('TIPO_CORRESPONDENCIA', 'Tipo de Correspondencia', 'Clasificación de un envío recibido en portería (carta, paquete, encomienda...) — buena práctica, cero filas precargadas, cada copropiedad las define (D-24).');

create table public.correspondencia (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  inmueble_id    uuid not null references public.inmuebles (id) on delete cascade,
  tipo_id        bigint references public.lista_tipos (id),
  destino        text not null,
  remitente      text not null,
  descripcion    text,
  registrado_por uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  entregada      boolean not null default false,
  entregada_a    text,
  entregada_at   timestamptz,

  constraint correspondencia_entrega_consistente check (
    (entregada = false and entregada_a is null and entregada_at is null)
    or
    (entregada = true and entregada_a is not null and entregada_at is not null)
  )
);

alter table public.correspondencia enable row level security;
alter table public.correspondencia force row level security;

create index correspondencia_tenant_idx on public.correspondencia (tenant_id);
create index correspondencia_inmueble_idx on public.correspondencia (inmueble_id);

comment on table public.correspondencia is
  'EXT-12 (Ola 2, M17): un envío recibido en portería para un inmueble. El residente SOLO lee '
  '(external-correspondencia-listar) — el alta y el marcado de entrega los hace SIEMPRE staff '
  '(correspondencia-registrar, service_role); sin política RLS de escritura para `authenticated`.';

create policy correspondencia_select_miembro
  on public.correspondencia for select
  to authenticated
  using (public.is_member(tenant_id));

-- Sin política de INSERT/UPDATE para `authenticated`: tanto el alta como marcar entregada pasan
-- SIEMPRE por correspondencia-registrar con service_role — mismo criterio que documentos
-- (subir-documento) y mant_autorizaciones_visita.
