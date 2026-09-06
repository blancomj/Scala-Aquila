-- ═══════════════════════════════════════════════════════════════════════
--  CO-2 · Núcleo del libro contable — comprobante, detalle y consecutivo
--  (CO_02_nucleo_libro_contable.md §3.3-§3.6)
--
--  Crea la estructura de partida doble persistida. NO contabiliza todavía
--  ni una sola operación real — eso es CO-3. contable_movimientos() (la
--  proyección de solo lectura desde cargos/pagos/presupuesto_ejecucion/
--  fondo_movimientos) sigue funcionando exactamente igual hasta entonces.
--
--  Decisión de simplificación deliberada frente al prompt maestro original
--  (registrada como D-45 en DECISIONES.md): 3 estados en vez de 6.
--  `reversado` no es un estado sino una relación (reversado_por_id);
--  `aprobado`/`pendiente_aprobacion` son decorativos sin segregación de
--  funciones implementada hoy (marco §4.4). Las columnas aprobado_por/
--  aprobado_at quedan en el esquema, sin usar todavía, para el corte
--  posterior que sí implemente el flujo de aprobación con su permiso
--  propio — no se rellenan ni se validan aquí.
-- ═══════════════════════════════════════════════════════════════════════

create type public.contable_comprobante_estado_t as enum ('borrador', 'contabilizado', 'anulado');

comment on type public.contable_comprobante_estado_t is
  'D-24 + D-45: estado del comprobante contable. Invariante de transición real —'
  'borrador → contabilizado (asigna número, inmutable desde ahí salvo anulación) → anulado '
  '(terminal). Simplificado de los 6 estados del prompt original a 3 (D-45): reversado es una '
  'relación (reversado_por_id), no un estado; aprobado/pendiente_aprobacion se posponen a un '
  'corte con segregación de funciones real.';

-- ── contable_comprobante ─────────────────────────────────────────────────
create table public.contable_comprobante (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete cascade,
  periodo_id             uuid not null references public.periodos (id),
  tipo_id                bigint not null references public.lista_tipos (id),
  -- Nullable a propósito: el consecutivo legal se asigna al pasar a
  -- contabilizado (§3.5), nunca al crear el borrador. NULL <> NULL en la
  -- unicidad de Postgres, así que varios borradores conviven sin número.
  numero                 integer,
  anio                   smallint not null,
  fecha                  date not null,
  descripcion            text not null,
  estado                 public.contable_comprobante_estado_t not null default 'borrador',
  -- origen (idempotencia, prompt maestro §17)
  origen_modulo          text,
  origen_entidad         text,
  origen_id              uuid,
  origen_evento          text,
  -- reversión
  reversa_comprobante_id uuid references public.contable_comprobante (id),
  reversado_por_id       uuid references public.contable_comprobante (id),
  -- trazabilidad
  creado_por             uuid references public.profiles (id),
  created_at             timestamptz not null default now(),
  -- Sin usar en este corte (D-45) — reservadas para el flujo de aprobación de un corte
  -- posterior, con su propio permiso; ningún guard de CO-2 las lee ni las escribe.
  aprobado_por           uuid references public.profiles (id),
  aprobado_at            timestamptz,
  contabilizado_at       timestamptz,
  anulado_por            uuid references public.profiles (id),
  anulado_at             timestamptz,
  anulado_motivo         text,

  constraint contable_comprobante_numero_unico unique (tenant_id, anio, tipo_id, numero)
);

-- El índice de idempotencia es el que hace físicamente imposible contabilizar dos veces el
-- mismo hecho de otro módulo — parcial porque 'manual' no participa (dos comprobantes manuales
-- no comparten origen).
create unique index contable_comprobante_origen_unico
  on public.contable_comprobante (tenant_id, origen_modulo, origen_entidad, origen_id, origen_evento)
  where origen_modulo is not null and origen_modulo <> 'manual';

create index contable_comprobante_tenant_periodo_idx
  on public.contable_comprobante (tenant_id, periodo_id);
create index contable_comprobante_tenant_estado_idx
  on public.contable_comprobante (tenant_id, estado);

alter table public.contable_comprobante enable row level security;
alter table public.contable_comprobante force row level security;

comment on table public.contable_comprobante is
  'CO-2: comprobante contable con partida doble persistida. Aún no contabiliza ninguna '
  'operación real de otro módulo (CO-3 lo conecta). numero es NULL hasta contabilizar '
  '(fn_contabilizar_comprobante) — nunca se asigna a mano (COMPROBANTE_NUMERO_NO_ASIGNABLE, '
  'guard_contable_comprobante_transicion).';
comment on column public.contable_comprobante.origen_modulo is
  '''cartera'' | ''presupuesto'' | ''fondos'' | ''manual'' (u otro módulo futuro) — texto libre, '
  'no lista_tipos ni enum: quien contabiliza automáticamente declara su propio nombre de '
  'módulo, y no hay ninguna transición de estado que dependa de cuál sea.';

create policy contable_comprobante_select_miembro
  on public.contable_comprobante for select to authenticated
  using (public.is_member(tenant_id));

create policy contable_comprobante_insert_auxiliar
  on public.contable_comprobante for insert to authenticated
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and estado = 'borrador'
  );

-- USING sin restricción de estado (un auxiliar debe poder alcanzar un comprobante contabilizado
-- para anularlo); WITH CHECK es lo que de verdad cierra la puerta: 'contabilizado' es
-- inalcanzable por una escritura directa del cliente — solo fn_contabilizar_comprobante() y
-- fn_reversar_comprobante() (security definer) llegan ahí.
create policy contable_comprobante_update_auxiliar
  on public.contable_comprobante for update to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and estado in ('borrador', 'anulado')
  );

create policy contable_comprobante_delete_auxiliar
  on public.contable_comprobante for delete to authenticated
  using (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and estado = 'borrador'
  );

-- ── contable_comprobante_detalle ─────────────────────────────────────────
create table public.contable_comprobante_detalle (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  comprobante_id        uuid not null references public.contable_comprobante (id) on delete cascade,
  linea                 smallint not null,
  cuenta_id             uuid not null references public.contable_cuenta (id),
  debito                numeric(18,2) not null default 0 check (debito >= 0),
  credito               numeric(18,2) not null default 0 check (credito >= 0),
  descripcion           text,
  -- dimensiones analíticas (prompt maestro §35/§59)
  tercero_id            uuid references public.terceros (id),
  inmueble_id           uuid references public.inmuebles (id),
  centro_costo_id       bigint references public.lista_tipos (id),
  agrupacion_id         uuid references public.agrupaciones (id),
  fondo_id              uuid references public.fondos (id),
  presupuesto_cuenta_id uuid references public.presupuesto_cuenta (id),
  -- origen a nivel línea, para trazar hasta el cargo o pago concreto
  origen_entidad        text,
  origen_id             uuid,

  constraint contable_comprobante_detalle_linea_unica unique (comprobante_id, linea),
  constraint contable_comprobante_detalle_un_solo_lado check (
    (debito > 0 and credito = 0) or (credito > 0 and debito = 0)
  )
);

create index contable_comprobante_detalle_comprobante_idx
  on public.contable_comprobante_detalle (comprobante_id);
create index contable_comprobante_detalle_cuenta_idx
  on public.contable_comprobante_detalle (tenant_id, cuenta_id);

alter table public.contable_comprobante_detalle enable row level security;
alter table public.contable_comprobante_detalle force row level security;

comment on table public.contable_comprobante_detalle is
  'CO-2: líneas de un comprobante. El check un_solo_lado prohíbe una línea con ambos lados o '
  'con ambos en cero — importes siempre positivos, una reversión intercambia los lados, nunca '
  'genera negativos (mismo criterio que contable_movimientos()).';

create policy contable_comprobante_detalle_select_miembro
  on public.contable_comprobante_detalle for select to authenticated
  using (public.is_member(tenant_id));

create policy contable_comprobante_detalle_insert_auxiliar
  on public.contable_comprobante_detalle for insert to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy contable_comprobante_detalle_update_auxiliar
  on public.contable_comprobante_detalle for update to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy contable_comprobante_detalle_delete_auxiliar
  on public.contable_comprobante_detalle for delete to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- Nota: la RLS de arriba solo filtra por rol, no por estado del comprobante padre — la
-- inmutabilidad real (COMPROBANTE_CONTABILIZADO_INMUTABLE con nombre propio, no un 0 filas
-- silencioso de RLS) la impone guard_contable_comprobante_detalle_inmutable en
-- 20260930210000_co2_comprobante_funciones.sql.

-- ── contable_consecutivo ─────────────────────────────────────────────────
create table public.contable_consecutivo (
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  anio          smallint not null,
  tipo_id       bigint not null references public.lista_tipos (id),
  ultimo_numero integer not null default 0,
  updated_at    timestamptz,

  primary key (tenant_id, anio, tipo_id)
);

alter table public.contable_consecutivo enable row level security;
alter table public.contable_consecutivo force row level security;

comment on table public.contable_consecutivo is
  'CO-2: último número consecutivo asignado por (tenant, año, tipo de comprobante). '
  'Deliberadamente sin `sequence` (ET art. 774: la numeración no puede tener huecos, y una '
  'sequence los deja al abortar una transacción) — fn_contable_siguiente_numero() usa '
  '`insert ... on conflict do update ... returning`, que serializa por fila. Sin política de '
  'escritura para authenticated: solo fn_contable_siguiente_numero (security definer) escribe '
  'aquí.';

create policy contable_consecutivo_select_miembro
  on public.contable_consecutivo for select to authenticated
  using (public.is_member(tenant_id));
