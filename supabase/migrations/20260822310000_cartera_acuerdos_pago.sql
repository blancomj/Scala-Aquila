-- ═══════════════════════════════════════════════════════════════════════
--  CAR F5 (2/2) · Acuerdos de pago
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §12
--
--  A diferencia de promesas_pago, un acuerdo SÍ es un negocio jurídico
--  formal (CAR §12.1: "Aprobación de consejo/administración", "Documento
--  firmado") — lleva el mismo maker-checker que acciones_cobranza
--  (20260822280000): propuesto_por/aprobado_por se estampan desde
--  auth.uid(), la transición a 'vigente' exige rol administrador
--  explícito y bloquea auto-aprobación.
--
--  GAP-CAR-008 (CAR §12.4) — decisión explícita del usuario (2026-08-17):
--  asociación explícita (pagos.acuerdo_cuota_id nullable) + inferencia de
--  respaldo. Esta migración agrega la columna; la función de inferencia
--  (buscar cuotas pendientes por monto+fecha cuando no hay asociación
--  explícita) es responsabilidad de quien reconcilie — fuera de alcance
--  de esta pieza de esquema, no se inventa aquí sin un caso de uso real
--  que la ejercite.
--
--  I-C08 (CAR §12.4): un acuerdo NUNCA reescribe cargos. Un pago de cuota
--  entra por registrar-pago/imputarPago() como cualquier otro pago — el
--  acuerdo no tiene su propio imputador.
-- ═══════════════════════════════════════════════════════════════════════

create type public.estado_acuerdo_t as enum (
  'borrador', 'pendiente_aprobacion', 'vigente', 'cumplido', 'incumplido', 'cancelado'
);

create type public.estado_cuota_acuerdo_t as enum (
  'pendiente', 'parcial', 'pagada', 'vencida', 'incumplida', 'cancelada'
);

create table public.acuerdos_pago (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants (id) on delete cascade,
  inmueble_id             uuid not null references public.inmuebles (id),
  consecutivo             text not null,
  fecha_acuerdo           date not null,
  fecha_inicio            date not null,
  fecha_fin               date not null,

  -- COMPOSICIÓN DE LO ACORDADO — discriminada, art. 48 L675
  monto_capital           numeric(18, 2) not null default 0,
  monto_interes           numeric(18, 2) not null default 0,
  monto_otros             numeric(18, 2) not null default 0,
  monto_total             numeric(18, 2) not null,

  -- CONDICIONES
  numero_cuotas           int not null check (numero_cuotas > 0),
  cuota_inicial           numeric(18, 2) not null default 0,
  condona_interes         boolean not null default false,
  monto_condonado         numeric(18, 2) not null default 0,
  interes_durante_acuerdo boolean not null default true,

  -- ESTADO
  estado                  public.estado_acuerdo_t not null default 'borrador',
  etapa_congelada         public.etapa_cobranza_t,
  fecha_incumplimiento    date,
  motivo_incumplimiento   text,

  -- PROPUESTA / APROBACIÓN — estampados por trigger, nunca del cliente
  propuesto_por           uuid references public.profiles (id),
  aprobado_por            uuid references public.profiles (id),
  aprobado_at             timestamptz,
  acta_referencia         text,
  documento_url           text,

  created_at              timestamptz not null default now(),

  constraint acuerdo_consecutivo_unico unique (tenant_id, consecutivo),
  constraint acuerdo_total_coherente check (monto_total = monto_capital + monto_interes + monto_otros),
  constraint acuerdo_periodo_valido check (fecha_fin >= fecha_inicio),
  constraint acuerdo_montos_no_negativos
    check (monto_capital >= 0 and monto_interes >= 0 and monto_otros >= 0 and cuota_inicial >= 0 and monto_condonado >= 0),
  -- CAR §12.6 [VERIFICAR]: condonar exige acta (quién autorizó) — aprobado_por
  -- ya lo exige el guard de transición a 'vigente', no hace falta repetirlo aquí.
  constraint acuerdo_condonacion_requiere_soporte
    check (not condona_interes or (monto_condonado > 0 and acta_referencia is not null))
);

alter table public.acuerdos_pago enable row level security;
alter table public.acuerdos_pago force row level security;

create index acuerdos_pago_tenant_idx on public.acuerdos_pago (tenant_id);
create index acuerdos_pago_inmueble_idx on public.acuerdos_pago (tenant_id, inmueble_id);
-- CAR §12.5: "acuerdo vigente" es la consulta que evaluarAccionesAplicables()
-- necesita para tieneAcuerdoVigente (cartera-cobranza.ts) — un solo acuerdo
-- vigente por inmueble a la vez, mismo criterio que politicas_*_vigente_unica.
create unique index acuerdos_pago_vigente_unico
  on public.acuerdos_pago (tenant_id, inmueble_id)
  where estado = 'vigente';

comment on table public.acuerdos_pago is
  'Negocio jurídico formal de refinanciación (CAR §12.1/§12.3) — a diferencia de '
  'promesas_pago, congela la etapa de cobranza mientras está vigente (§12.5) y su '
  'incumplimiento dispara reevaluación de escalamiento. NUNCA reescribe cargos (I-C08, §12.4).';

comment on column public.acuerdos_pago.propuesto_por is
  'Quién creó el acuerdo — asignado por guard_acuerdo_propuesta() desde auth.uid().';
comment on column public.acuerdos_pago.aprobado_por is
  'Quién aprobó la transición pendiente_aprobacion→vigente — asignado por '
  'guard_acuerdo_transicion(), exige rol administrador explícito y bloquea autoaprobación '
  '(mismo patrón que acciones_cobranza, 20260822280000).';

create table public.acuerdo_pago_cuotas (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  acuerdo_id        uuid not null references public.acuerdos_pago (id) on delete cascade,
  numero_cuota      int not null,
  fecha_vencimiento date not null,
  monto             numeric(18, 2) not null check (monto > 0),
  monto_pagado      numeric(18, 2) not null default 0,
  estado            public.estado_cuota_acuerdo_t not null default 'pendiente',
  fecha_pago        date,
  created_at        timestamptz not null default now(),

  constraint cuota_numero_unico unique (acuerdo_id, numero_cuota),
  constraint cuota_pagado_no_excede check (monto_pagado <= monto),
  constraint cuota_pagado_no_negativo check (monto_pagado >= 0)
);

alter table public.acuerdo_pago_cuotas enable row level security;
alter table public.acuerdo_pago_cuotas force row level security;

create index acuerdo_pago_cuotas_tenant_idx on public.acuerdo_pago_cuotas (tenant_id);
create index acuerdo_pago_cuotas_acuerdo_idx on public.acuerdo_pago_cuotas (acuerdo_id);
create index acuerdo_pago_cuotas_pendientes_idx
  on public.acuerdo_pago_cuotas (tenant_id, fecha_vencimiento)
  where estado in ('pendiente', 'parcial', 'vencida');

comment on table public.acuerdo_pago_cuotas is
  'Calendario de recaudo esperado de un acuerdo_pago (CAR §12.3-12.4) — el pago real entra '
  'por registrar-pago/imputarPago() como cualquier otro pago; una cuota se marca pagada por '
  'conciliación (pagos.acuerdo_cuota_id o inferencia), no por escritura directa aquí.';

-- ── GAP-CAR-008: asociación explícita pago↔cuota ────────────────────────
alter table public.pagos
  add column acuerdo_cuota_id uuid references public.acuerdo_pago_cuotas (id);

comment on column public.pagos.acuerdo_cuota_id is
  'GAP-CAR-008 (CAR §12.4) — asociación explícita opcional a la cuota de acuerdo que este '
  'pago cubre. null = sin asociar explícitamente (la inferencia por monto+fecha, si se '
  'construye, es responsabilidad de quien reconcilie, fuera de esta pieza de esquema).';

-- ── trazabilidad de condonación (CAR §12.6): novedad tipo DISCOUNT ──────
alter table public.novedades
  add column acuerdo_pago_id uuid references public.acuerdos_pago (id);

comment on column public.novedades.acuerdo_pago_id is
  'CAR §12.6 — cuando esta novedad (tipo DISCOUNT) es la condonación de intereses de un '
  'acuerdo de pago, referencia cuál. null para el resto de novedades. La condonación misma '
  'sigue el flujo existente de novedades (fn_aprobar_novedad → cargo otro negativo), sin '
  'duplicar lógica (REC-CAR-004).';

-- ── quién propuso (solo en creación) ────────────────────────────────────
create function public.guard_acuerdo_propuesta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.propuesto_por := (select auth.uid());
  return new;
end;
$$;

create trigger guard_acuerdo_propuesta
  before insert on public.acuerdos_pago
  for each row execute function public.guard_acuerdo_propuesta();

-- ── transiciones de estado + aprobación (maker-checker) ─────────────────
create function public.guard_acuerdo_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = old.estado then
    return new;
  end if;

  if not (
    (old.estado = 'borrador' and new.estado in ('pendiente_aprobacion', 'cancelado'))
    or (old.estado = 'pendiente_aprobacion' and new.estado in ('vigente', 'borrador', 'cancelado'))
    or (old.estado = 'vigente' and new.estado in ('cumplido', 'incumplido', 'cancelado'))
  ) then
    raise exception 'ACUERDO_TRANSICION_INVALIDA: el acuerdo % no puede pasar de % a %',
      old.id, old.estado, new.estado;
  end if;

  if old.estado = 'pendiente_aprobacion' and new.estado = 'vigente' then
    if (select auth.uid()) is not null then
      if not public.has_role(new.tenant_id, array['administrador']::public.tenant_role_t[]) then
        raise exception 'ACUERDO_REQUIERE_ADMINISTRADOR: activar el acuerdo % requiere rol '
          'administrador (CAR §12.1 — aprobación de consejo/administración)', old.id;
      end if;
      if old.propuesto_por is not null and old.propuesto_por = (select auth.uid()) then
        raise exception 'ACUERDO_AUTOAPROBACION: no puedes aprobar un acuerdo de pago que tú '
          'mismo propusiste (%)', old.id;
      end if;
    end if;
    new.aprobado_por := (select auth.uid());
    new.aprobado_at := now();
    -- El llamador puede fijar etapa_congelada explícitamente en el mismo UPDATE
    -- (p.ej. resuelta en TS vía clasificarCartera(), REC-CAR-008); si no lo
    -- hace, se completa con el snapshot más reciente como respaldo — puede
    -- quedar null si el inmueble no tiene ningún snapshot todavía.
    if new.etapa_congelada is null then
      new.etapa_congelada := (
        select ppc.etapa_cobranza
        from public.posiciones_cartera_snapshot pcs
        join public.politicas_clasificacion_cartera pol on pol.id = pcs.politica_clasificacion_id
        join public.politica_clasificacion_tramos ppc
          on ppc.politica_id = pol.id and ppc.codigo = pcs.clasificacion_codigo
        where pcs.tenant_id = new.tenant_id and pcs.inmueble_id = new.inmueble_id
        order by pcs.fecha_corte desc
        limit 1
      );
    end if;
  end if;

  if old.estado = 'vigente' and new.estado = 'incumplido' then
    new.fecha_incumplimiento := coalesce(new.fecha_incumplimiento, current_date);
  end if;

  return new;
end;
$$;

create trigger guard_acuerdo_transicion
  before update on public.acuerdos_pago
  for each row execute function public.guard_acuerdo_transicion();

-- ── transiciones de estado de cuota ──────────────────────────────────────
create function public.guard_cuota_acuerdo_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = old.estado then
    return new;
  end if;

  if not (
    (old.estado = 'pendiente' and new.estado in ('parcial', 'pagada', 'vencida', 'cancelada'))
    or (old.estado = 'parcial' and new.estado in ('pagada', 'vencida', 'cancelada'))
    or (old.estado = 'vencida' and new.estado in ('parcial', 'pagada', 'incumplida', 'cancelada'))
  ) then
    raise exception 'CUOTA_ACUERDO_TRANSICION_INVALIDA: la cuota % no puede pasar de % a %',
      old.id, old.estado, new.estado;
  end if;

  return new;
end;
$$;

create trigger guard_cuota_acuerdo_transicion
  before update on public.acuerdo_pago_cuotas
  for each row execute function public.guard_cuota_acuerdo_transicion();

-- ── RLS ──────────────────────────────────────────────────────────────────
create policy acuerdos_pago_select_miembro
  on public.acuerdos_pago for select
  to authenticated
  using (public.is_member(tenant_id));

create policy acuerdos_pago_insert_agent
  on public.acuerdos_pago for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy acuerdos_pago_update_agent
  on public.acuerdos_pago for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy acuerdo_pago_cuotas_select_miembro
  on public.acuerdo_pago_cuotas for select
  to authenticated
  using (public.is_member(tenant_id));

create policy acuerdo_pago_cuotas_insert_agent
  on public.acuerdo_pago_cuotas for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy acuerdo_pago_cuotas_update_agent
  on public.acuerdo_pago_cuotas for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));
