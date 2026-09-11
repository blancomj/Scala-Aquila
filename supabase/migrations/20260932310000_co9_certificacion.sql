-- ═══════════════════════════════════════════════════════════════════════
--  CO-9 · Certificación de estados financieros (CO_09_gobierno_y_asamblea.md §4.1)
--
--  Toda escritura vía fn_contable_certificar_estados (RPC) — sin policy
--  insert/update para authenticated, mismo criterio que gobierno_actas/
--  documentos: el hash y el congelamiento de datos del contador no pueden
--  quedar a merced de un insert directo del cliente.
--
--  invalidada (boolean) en vez de un estado 'vigente'/'invalidada' con
--  enum: es una transición de un solo sentido, sin ida y vuelta, mismo
--  criterio que documentos_legal_holds.activo — no hace falta un tipo
--  nuevo para dos valores con una sola dirección de cambio.
-- ═══════════════════════════════════════════════════════════════════════

create table public.contable_certificacion (
  id                           uuid primary key default gen_random_uuid(),
  tenant_id                    uuid not null references public.tenants (id) on delete cascade,
  ejercicio                    int      not null check (ejercicio > 2000),
  fecha_corte                  date not null,
  estados_incluidos            text[] not null check (array_length(estados_incluidos, 1) > 0),
  hash_contenido               text not null,
  certificado_por              uuid not null references public.profiles (id),
  administrador_nombre         text not null,
  administrador_documento      text,
  contador_tercero_id          uuid references public.terceros (id),
  contador_nombre              text,
  contador_tarjeta_profesional text,
  texto_certificacion          text not null,
  documento_id                 uuid references public.documentos (id),
  invalidada                   boolean not null default false,
  invalidada_motivo            text,
  invalidada_at                timestamptz,
  certificado_at               timestamptz not null default now(),

  constraint contable_certificacion_invalidada_con_motivo
    check (not invalidada or (invalidada_motivo is not null and invalidada_at is not null))
);

alter table public.contable_certificacion enable row level security;
alter table public.contable_certificacion force row level security;

create index contable_certificacion_tenant_idx
  on public.contable_certificacion (tenant_id);

-- Solo una certificación vigente (no invalidada) por ejercicio: impide las
-- "certificaciones zombis" del criterio de aceptación §8.
create unique index contable_certificacion_vigente_unica
  on public.contable_certificacion (tenant_id, ejercicio)
  where not invalidada;

comment on table public.contable_certificacion is
  'CO-9 §4.1 (Ley 222 de 1995 art. 37): certificación anual de estados financieros. hash_contenido '
  'se calcula sobre las cifras (contable_estado_financiero de cada código en estados_incluidos), '
  'nunca sobre el binario del PDF — estable si las cifras no cambian. administrador_nombre/'
  'documento y contador_nombre/tarjeta_profesional se congelan al certificar: si el tercero '
  'contador cambia después, esta fila sigue mostrando quién certificó en su momento. Escritura '
  'exclusivamente vía fn_contable_certificar_estados — sin policy insert/update.';

create policy contable_certificacion_select_miembro
  on public.contable_certificacion for select
  to authenticated
  using (public.is_member(tenant_id));
