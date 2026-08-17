-- ═══════════════════════════════════════════════════════════════════════
--  CAR F8 (1/2) · eventos_cartera — bitácora de dominio del bloque de
--  cartera (§19)
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §19
--
--  Append-only (forbid_mutation, reutilizado — mismo criterio que
--  audit_log/certificaciones_deuda/posiciones_cartera_snapshot). Sin
--  política INSERT para authenticated: la escribe el job/Edge Function
--  privilegiada vía service_role, igual que posiciones_cartera_snapshot
--  ("un snapshot con un hash inventado a mano no significa nada" —
--  aplica igual a un historial de eventos fabricado a mano).
--
--  tipo_evento_cartera_t incluye el catálogo COMPLETO de §19.1, no solo
--  los que produce esta pieza (F8) — otros tipos ya existen en el código
--  de F4-F7 y podrán emitir hacia esta tabla más adelante sin otra
--  migración de enum.
-- ═══════════════════════════════════════════════════════════════════════

create type public.tipo_evento_cartera_t as enum (
  'CARGO_VENCIDO', 'CARGO_SALDADO',
  'CARTERA_CLASIFICACION_CAMBIO', 'CARTERA_ETAPA_CAMBIO', 'CARTERA_POSICION_CONGELADA',
  'COBRANZA_ACCION_PROGRAMADA', 'COBRANZA_ACCION_APROBADA', 'COBRANZA_ACCION_RECHAZADA',
  'COBRANZA_ACCION_EJECUTADA', 'COBRANZA_ACCION_FALLIDA', 'COBRANZA_ACCION_OMITIDA',
  'COBRANZA_ACCION_CANCELADA', 'COBRANZA_RESULTADO_REGISTRADO',
  'PROMESA_REGISTRADA', 'PROMESA_CUMPLIDA', 'PROMESA_INCUMPLIDA',
  'ACUERDO_CREADO', 'ACUERDO_APROBADO', 'ACUERDO_CUOTA_VENCIDA', 'ACUERDO_CUOTA_PAGADA',
  'ACUERDO_CUMPLIDO', 'ACUERDO_INCUMPLIDO',
  'CERTIFICACION_DEUDA_EXPEDIDA', 'CERTIFICACION_DEUDA_ANULADA',
  'CASO_JURIDICO_CREADO', 'CASO_JURIDICO_ACTUACION', 'CASO_JURIDICO_ESTADO_CAMBIO',
  'CASO_JURIDICO_CERRADO', 'COSTA_JUDICIAL_REGISTRADA',
  'PAGO_REGISTRADO', 'PAGO_IMPUTADO', 'INTERES_CALCULADO', 'NOVEDAD_APROBADA',
  'LIQUIDACION_COMPLETADA'
);

create type public.origen_evento_t as enum ('job', 'usuario', 'sistema', 'integracion');

create table public.eventos_cartera (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  tipo              public.tipo_evento_cartera_t not null,
  inmueble_id       uuid references public.inmuebles (id),
  entidad_tipo      text,
  entidad_id        uuid,

  fecha_corte       date not null,
  ocurrido_at       timestamptz not null default now(),

  -- ANTES/DESPUÉS — I-C13: un evento sin motivo legible es un evento incompleto.
  estado_anterior   jsonb,
  estado_nuevo      jsonb,
  motivo            text not null,

  -- REPRODUCIBILIDAD — con qué política se decidió, cuando aplica.
  politica_id       uuid,
  politica_version  int,

  -- AUTORÍA
  origen            public.origen_evento_t not null,
  actor_id          uuid references public.profiles (id),
  ejecucion_id      uuid,

  dedup_key         text,
  created_at        timestamptz not null default now(),

  constraint evento_dedup unique nulls not distinct (tenant_id, dedup_key)
);

alter table public.eventos_cartera enable row level security;
alter table public.eventos_cartera force row level security;

create index eventos_cartera_tenant_inmueble_idx
  on public.eventos_cartera (tenant_id, inmueble_id, ocurrido_at desc);
create index eventos_cartera_tenant_tipo_fecha_idx
  on public.eventos_cartera (tenant_id, tipo, fecha_corte);
create index eventos_cartera_ejecucion_idx
  on public.eventos_cartera (ejecucion_id)
  where ejecucion_id is not null;

comment on table public.eventos_cartera is
  'Bitácora de dominio del bloque de cartera (CAR §19) — I-C13: toda transición debe ser '
  'explicable con antes/después/motivo. dedup_key (único por tenant, IDEM-03) hace que '
  're-ejecutar el job diario con la misma fecha_corte no duplique eventos (PH-C33). Solo '
  'service_role escribe — mismo criterio que posiciones_cartera_snapshot.';

comment on column public.eventos_cartera.dedup_key is
  'CAR §18.3 IDEM-03 — convención sugerida: "{tipo}:{inmueble_id}:{fecha_corte}:{entidad_id}". '
  'null permitido (eventos que no participan de la idempotencia del job diario).';

create trigger eventos_cartera_append_only
  before update or delete on public.eventos_cartera
  for each row execute function public.forbid_mutation();

create policy eventos_cartera_select_miembro
  on public.eventos_cartera for select
  to authenticated
  using (public.is_member(tenant_id));
