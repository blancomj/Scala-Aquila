-- ═══════════════════════════════════════════════════════════════════════
--  CAR F7 · Jurídico — certificación de deuda (art. 48), caso judicial,
--  expediente y costas
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §15-16
--
--  GAP-CAR-007 (storage) — VERIFICADO RESUELTO, no bloqueaba: ya existe
--  `documentos` (generalizada en 20260822130000, antes documentos_inmueble),
--  el bucket `documentos-inmueble` y la Edge Function subir-documento con
--  upload+rollback reales, probados (tests/tenancy/subir-documento.test.ts).
--  En vez de crear caso_juridico_documentos como tabla paralela (violaría
--  REC-CAR-004), se generaliza `documentos` una vez más con caso_
--  juridico_id nullable — mismo patrón que inmueble_id nullable. subir-
--  documento todavía NO acepta caso_juridico_id (solo inmueble_id) — la
--  extensión de esa Edge Function y del frontend quedan pendientes,
--  documentado como pieza siguiente (mismo criterio que F4-F6: esquema
--  primero, orquestación/integración después).
--
--  GAP-CAR-011 (nuevo, decisión explícita del usuario 2026-08-17): el
--  esquema no distingue una cuota extraordinaria ni una sanción a nivel de
--  cargo (ver cabecera de packages/liquidation-engine/src/cartera-
--  juridico.ts). fn_certificar_deuda vive en TS (construirCertificacionDeuda
--  + registrarCertificacionDeuda), no en SQL — mismo motivo que
--  calcularPosicionHash/registrarSnapshotPosicion: el hash de
--  reproducibilidad (certificacion_hash) debe ser una función pura
--  testeable, no md5() inline en PL/pgSQL.
--
--  Decisión deliberada de alcance: NO se construye una matriz de
--  transiciones rígida para estado_caso_juridico_t (12 valores) ni para
--  estado_costa_t (5 valores) — a diferencia de etapa_cobranza_t (CAR
--  §11.3, F6), el documento NUNCA definió los bordes válidos de estas dos
--  máquinas de estado, y el trámite judicial real no sigue un único orden
--  lineal (una diligencia puede repetirse, una conciliación puede ocurrir
--  antes o después de sentencia, etc.). Inventar esa matriz sería fabricar
--  una regla de procedimiento sin respaldo. estado se deja libremente
--  actualizable por cualquier agent, con UNA excepción gobernada: CERRAR
--  el caso (terminado/desistido/archivado, o fijar fecha_cierre) exige
--  administrador — es la decisión de alto impacto real, igual que
--  REC-CAR-013 en F6. caso_juridico_actuaciones (append-only) es el
--  registro histórico verificable de qué pasó y cuándo, exista o no una
--  matriz que lo valide.
-- ═══════════════════════════════════════════════════════════════════════

-- ── enums ────────────────────────────────────────────────────────────
create type public.estado_certificacion_t as enum ('vigente', 'anulada');

create type public.estado_caso_juridico_t as enum (
  'remitido', 'documentacion', 'radicado', 'admitido', 'en_tramite',
  'medidas_cautelares', 'conciliacion', 'sentencia', 'ejecucion',
  'terminado', 'desistido', 'archivado'
);

create type public.tipo_costa_t as enum (
  'gasto_proceso', 'agencias_en_derecho', 'honorario_auxiliar', 'otro_costo_aprobado'
);

create type public.estado_costa_t as enum (
  'liquidada', 'impugnada', 'en_firme', 'recuperada', 'no_recuperable'
);

-- ═══════════════════════════════════════════════════════════════════════
--  certificaciones_deuda (CAR §15.2) — el artefacto del art. 48
-- ═══════════════════════════════════════════════════════════════════════

create table public.certificaciones_deuda (
  id                              uuid primary key default gen_random_uuid(),
  tenant_id                       uuid not null references public.tenants (id) on delete cascade,
  inmueble_id                     uuid not null references public.inmuebles (id),
  consecutivo                     text not null,
  fecha_expedicion                date not null,
  fecha_corte                     date not null,

  -- DISCRIMINACIÓN EXIGIDA POR EL ART. 48 — ver GAP-CAR-011 en la cabecera:
  -- monto_expensas_extraordinarias y monto_sanciones son siempre 0 hoy.
  monto_expensas_ordinarias       numeric(18, 2) not null default 0,
  monto_expensas_extraordinarias  numeric(18, 2) not null default 0,
  monto_intereses_mora            numeric(18, 2) not null default 0,
  monto_sanciones                 numeric(18, 2) not null default 0,
  monto_otros                     numeric(18, 2) not null default 0,
  monto_total                     numeric(18, 2) not null,

  -- TRAZABILIDAD Y REPRODUCIBILIDAD
  detalle_cargos                  jsonb not null,
  politica_financiera_id          uuid not null references public.politicas_financieras (id),
  politica_version                int not null,
  certificacion_hash              text not null,

  -- RESPONSABILIDAD — expedida_por lo estampa guard_certificacion_insert desde auth.uid().
  expedida_por                    uuid not null references public.profiles (id),
  cargo_firmante                  text not null,
  documento_url                   text,

  estado                          public.estado_certificacion_t not null default 'vigente',
  anulada_por                     uuid references public.profiles (id),
  anulada_at                      timestamptz,
  anulada_motivo                  text,

  created_at                      timestamptz not null default now(),
  constraint certificacion_consecutivo_unico unique (tenant_id, consecutivo),
  constraint certificacion_total_coherente check (
    monto_total = monto_expensas_ordinarias + monto_expensas_extraordinarias
                + monto_intereses_mora + monto_sanciones + monto_otros
  ),
  constraint certificacion_monto_total_positivo check (monto_total > 0),
  constraint certificacion_anulacion_coherente check (
    (estado = 'vigente' and anulada_por is null and anulada_at is null and anulada_motivo is null)
    or (estado = 'anulada' and anulada_por is not null and anulada_at is not null and anulada_motivo is not null)
  )
);

alter table public.certificaciones_deuda enable row level security;
alter table public.certificaciones_deuda force row level security;

create index certificaciones_deuda_tenant_idx on public.certificaciones_deuda (tenant_id);
create index certificaciones_deuda_inmueble_idx on public.certificaciones_deuda (tenant_id, inmueble_id);

comment on table public.certificaciones_deuda is
  'Artefacto del art. 48 Ley 675 (CAR §15.2) — presta mérito ejecutivo. Inmutable salvo la '
  'única transición vigente→anulada (REC-CAR-014): un error se anula y se expide una nueva, '
  'nunca se corrige en el sitio. detalle_cargos congela el desglose exacto a la fecha de '
  'corte — sin esto la certificación no es reproducible ni resiste objeción en juicio (PH-C27).';

comment on column public.certificaciones_deuda.monto_expensas_extraordinarias is
  'GAP-CAR-011 — siempre 0: el esquema no distingue una cuota extraordinaria a nivel de cargo '
  '(fuente_financiacion.cuota_extraordinaria es del presupuesto, no del cargo). No se inventa.';
comment on column public.certificaciones_deuda.monto_sanciones is
  'GAP-CAR-011 — siempre 0: novedades.tipo es CHARGE/DISCOUNT/ADJUSTMENT/REFUND/CREDIT/DEBIT, '
  'sin sub-clasificación de sanción. TIPO_NOVEDAD en lista_tipos existe sembrado pero ninguna '
  'tabla/código lo referencia — no se inventa una lectura de un catálogo huérfano.';

-- ── INSERT: expedida_por estampado, rol administrador exigido (firmante identificado) ──
create function public.guard_certificacion_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para expedir una certificación de deuda';
  end if;
  if not public.has_role(new.tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'CERTIFICACION_REQUIERE_ADMINISTRADOR: expedir una certificación de deuda '
      'exige rol administrador (CAR §15.2 — art. 48 exige firmante identificado)';
  end if;
  if new.estado <> 'vigente' or new.anulada_por is not null or new.anulada_at is not null or new.anulada_motivo is not null then
    raise exception 'CERTIFICACION_INMUTABLE: una certificación nace vigente y sin anular';
  end if;
  new.expedida_por := (select auth.uid());
  return new;
end;
$$;

create trigger guard_certificacion_insert
  before insert on public.certificaciones_deuda
  for each row execute function public.guard_certificacion_insert();

-- ── UPDATE: solo vigente→anulada, todo lo demás queda congelado ────────
create function public.guard_certificacion_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if new.tenant_id is distinct from old.tenant_id
     or new.inmueble_id is distinct from old.inmueble_id
     or new.consecutivo is distinct from old.consecutivo
     or new.fecha_expedicion is distinct from old.fecha_expedicion
     or new.fecha_corte is distinct from old.fecha_corte
     or new.monto_expensas_ordinarias is distinct from old.monto_expensas_ordinarias
     or new.monto_expensas_extraordinarias is distinct from old.monto_expensas_extraordinarias
     or new.monto_intereses_mora is distinct from old.monto_intereses_mora
     or new.monto_sanciones is distinct from old.monto_sanciones
     or new.monto_otros is distinct from old.monto_otros
     or new.monto_total is distinct from old.monto_total
     or new.detalle_cargos is distinct from old.detalle_cargos
     or new.politica_financiera_id is distinct from old.politica_financiera_id
     or new.politica_version is distinct from old.politica_version
     or new.certificacion_hash is distinct from old.certificacion_hash
     or new.expedida_por is distinct from old.expedida_por
     or new.cargo_firmante is distinct from old.cargo_firmante
  then
    raise exception 'CERTIFICACION_INMUTABLE: una certificación de deuda no admite modificar su '
      'contenido (%), solo anularse (REC-CAR-014) — documento_url es la única excepción', old.id;
  end if;

  if new.estado = old.estado then
    return new; -- no-op de contenido (p.ej. solo documento_url) — ya validado arriba.
  end if;

  if not (old.estado = 'vigente' and new.estado = 'anulada') then
    raise exception 'CERTIFICACION_TRANSICION_INVALIDA: % no puede pasar a %', old.estado, new.estado;
  end if;
  if new.anulada_motivo is null then
    raise exception 'CERTIFICACION_ANULACION_SIN_MOTIVO: anular exige explicar el motivo';
  end if;
  if not public.has_role(new.tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'CERTIFICACION_REQUIERE_ADMINISTRADOR: anular una certificación de deuda '
      'exige rol administrador';
  end if;

  new.anulada_por := v_actor;
  new.anulada_at := now();
  return new;
end;
$$;

create trigger guard_certificacion_transicion
  before update on public.certificaciones_deuda
  for each row execute function public.guard_certificacion_transicion();

-- ── RLS ──────────────────────────────────────────────────────────────
create policy certificaciones_deuda_select_miembro
  on public.certificaciones_deuda for select
  to authenticated
  using (public.is_member(tenant_id));

create policy certificaciones_deuda_insert_administrador
  on public.certificaciones_deuda for insert
  to authenticated
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

create policy certificaciones_deuda_update_administrador
  on public.certificaciones_deuda for update
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

-- ═══════════════════════════════════════════════════════════════════════
--  casos_juridicos (CAR §15.3) — certificacion_id NOT NULL: sin
--  certificación vigente no hay mérito ejecutivo, no hay caso.
-- ═══════════════════════════════════════════════════════════════════════

create table public.casos_juridicos (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants (id) on delete cascade,
  inmueble_id             uuid not null references public.inmuebles (id),
  consecutivo             text not null,
  certificacion_id        uuid not null references public.certificaciones_deuda (id),

  fecha_remision          date not null,
  fecha_apertura          date,
  abogado_tercero_id      uuid references public.terceros (id),
  numero_radicado         text,
  juzgado                 text,
  ciudad                  text,

  monto_pretension        numeric(18, 2) not null check (monto_pretension > 0),
  fecha_pretension        date not null,

  estado                  public.estado_caso_juridico_t not null default 'remitido',
  fecha_ultima_actuacion  date,
  fecha_proxima_actuacion date,

  fecha_cierre            date,
  motivo_cierre           text,
  monto_recuperado        numeric(18, 2) not null default 0,

  aprobado_por            uuid not null references public.profiles (id),
  aprobado_at             timestamptz not null default now(),

  created_at              timestamptz not null default now(),
  updated_at              timestamptz,
  constraint caso_consecutivo_unico unique (tenant_id, consecutivo),
  constraint caso_monto_recuperado_no_negativo check (monto_recuperado >= 0),
  constraint caso_cierre_coherente check (
    (estado not in ('terminado', 'desistido', 'archivado') and fecha_cierre is null)
    or (estado in ('terminado', 'desistido', 'archivado') and fecha_cierre is not null)
  )
);

alter table public.casos_juridicos enable row level security;
alter table public.casos_juridicos force row level security;

create index casos_juridicos_tenant_idx on public.casos_juridicos (tenant_id);
create index casos_juridicos_inmueble_idx on public.casos_juridicos (tenant_id, inmueble_id);
create index casos_juridicos_certificacion_idx on public.casos_juridicos (certificacion_id);

comment on table public.casos_juridicos is
  'Proceso ejecutivo (CAR §15.3) — certificacion_id NOT NULL convierte el requisito del art. 48 '
  'en una restricción de integridad referencial, no en una recomendación. Sin matriz de '
  'transiciones para estado (decisión deliberada, ver cabecera de la migración) — solo CERRAR '
  'el caso exige administrador.';

create trigger set_updated_at
  before update on public.casos_juridicos
  for each row execute function public.set_updated_at();

create function public.guard_caso_juridico_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_certificacion record;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para remitir un caso jurídico';
  end if;
  if not public.has_role(new.tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'CASO_JURIDICO_REQUIERE_ADMINISTRADOR: remitir un inmueble a proceso '
      'jurídico exige rol administrador';
  end if;

  select tenant_id, estado into v_certificacion
  from public.certificaciones_deuda
  where id = new.certificacion_id;
  if v_certificacion.tenant_id is distinct from new.tenant_id or v_certificacion.estado <> 'vigente' then
    raise exception 'CASO_JURIDICO_CERTIFICACION_INVALIDA: certificacion_id % no es una '
      'certificación vigente de este tenant', new.certificacion_id;
  end if;

  if new.abogado_tercero_id is not null and not exists (
    select 1 from public.tenant_tercero_rol ttr
    join public.lista_tipos lt on lt.id = ttr.rol_id
    where ttr.tenant_id = new.tenant_id
      and ttr.tercero_id = new.abogado_tercero_id
      and lt.tipo = 'PERSONA_COPROPIEDAD' and lt.codigo = 'abogado'
      and (ttr.vigente_hasta is null or ttr.vigente_hasta >= new.fecha_remision)
  ) then
    raise exception 'CASO_JURIDICO_ABOGADO_INVALIDO: % no tiene un rol de abogado vigente en '
      'esta copropiedad', new.abogado_tercero_id;
  end if;

  new.aprobado_por := (select auth.uid());
  new.aprobado_at := now();
  return new;
end;
$$;

create trigger guard_caso_juridico_insert
  before insert on public.casos_juridicos
  for each row execute function public.guard_caso_juridico_insert();

create function public.guard_caso_juridico_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cierra boolean;
begin
  if new.tenant_id is distinct from old.tenant_id
     or new.inmueble_id is distinct from old.inmueble_id
     or new.certificacion_id is distinct from old.certificacion_id
  then
    raise exception 'CASO_JURIDICO_CONTEXTO_INMUTABLE: tenant_id/inmueble_id/certificacion_id '
      'no se pueden modificar (caso %)', old.id;
  end if;
  -- aprobado_por/aprobado_at nunca se confían del cliente en un UPDATE.
  new.aprobado_por := old.aprobado_por;
  new.aprobado_at := old.aprobado_at;

  v_cierra := (new.estado in ('terminado', 'desistido', 'archivado') and old.estado not in ('terminado', 'desistido', 'archivado'))
    or (new.fecha_cierre is not null and old.fecha_cierre is null);

  if v_cierra and not public.has_role(new.tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'CASO_JURIDICO_CIERRE_REQUIERE_ADMINISTRADOR: cerrar el caso % exige rol '
      'administrador', old.id;
  end if;

  if new.abogado_tercero_id is distinct from old.abogado_tercero_id and new.abogado_tercero_id is not null and not exists (
    select 1 from public.tenant_tercero_rol ttr
    join public.lista_tipos lt on lt.id = ttr.rol_id
    where ttr.tenant_id = new.tenant_id
      and ttr.tercero_id = new.abogado_tercero_id
      and lt.tipo = 'PERSONA_COPROPIEDAD' and lt.codigo = 'abogado'
      and (ttr.vigente_hasta is null or ttr.vigente_hasta >= coalesce(new.fecha_remision, current_date))
  ) then
    raise exception 'CASO_JURIDICO_ABOGADO_INVALIDO: % no tiene un rol de abogado vigente en '
      'esta copropiedad', new.abogado_tercero_id;
  end if;

  return new;
end;
$$;

create trigger guard_caso_juridico_transicion
  before update on public.casos_juridicos
  for each row execute function public.guard_caso_juridico_transicion();

-- ── RLS: insert exige administrador (guard también lo exige — defensa en profundidad) ──
create policy casos_juridicos_select_miembro
  on public.casos_juridicos for select
  to authenticated
  using (public.is_member(tenant_id));

create policy casos_juridicos_insert_administrador
  on public.casos_juridicos for insert
  to authenticated
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

create policy casos_juridicos_update_agent
  on public.casos_juridicos for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- ═══════════════════════════════════════════════════════════════════════
--  caso_juridico_actuaciones (CAR §15.4) — expediente, append-only
-- ═══════════════════════════════════════════════════════════════════════

-- Catálogo abierto (lista_tipos), no un enum cerrado: los tipos de
-- actuación procesal son mucho más un vocabulario descriptivo extensible
-- que una máquina de estados con lógica propia — mismo criterio que
-- TIPO_DOCUMENTO (20260814160000 §0).
insert into public.tipos (codigo, nombre) values ('TIPO_ACTUACION_JURIDICA', 'Tipo de Actuación Jurídica');
insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_ACTUACION_JURIDICA', 'memorial', 'Memorial', 1),
  ('TIPO_ACTUACION_JURIDICA', 'notificacion', 'Notificación', 2),
  ('TIPO_ACTUACION_JURIDICA', 'auto_judicial', 'Auto judicial', 3),
  ('TIPO_ACTUACION_JURIDICA', 'audiencia', 'Audiencia', 4),
  ('TIPO_ACTUACION_JURIDICA', 'medida_cautelar', 'Medida cautelar (embargo/secuestro)', 5),
  ('TIPO_ACTUACION_JURIDICA', 'conciliacion_diligencia', 'Diligencia de conciliación', 6),
  ('TIPO_ACTUACION_JURIDICA', 'sentencia_judicial', 'Sentencia', 7),
  ('TIPO_ACTUACION_JURIDICA', 'recurso', 'Recurso (reposición/apelación)', 8),
  ('TIPO_ACTUACION_JURIDICA', 'otro_documento', 'Otra actuación', 9);

create table public.caso_juridico_actuaciones (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  caso_id        uuid not null references public.casos_juridicos (id) on delete cascade,
  fecha          date not null,
  tipo_actuacion_id bigint not null references public.lista_tipos (id),
  descripcion    text not null,
  estado_desde   public.estado_caso_juridico_t,
  estado_hasta   public.estado_caso_juridico_t,
  registrada_por uuid not null references public.profiles (id),
  created_at     timestamptz not null default now()
);

alter table public.caso_juridico_actuaciones enable row level security;
alter table public.caso_juridico_actuaciones force row level security;

create index caso_juridico_actuaciones_tenant_idx on public.caso_juridico_actuaciones (tenant_id);
create index caso_juridico_actuaciones_caso_idx on public.caso_juridico_actuaciones (caso_id);

comment on table public.caso_juridico_actuaciones is
  'Bitácora append-only del expediente (CAR §15.4) — es la fuente de verdad histórica de qué '
  'pasó y cuándo, exista o no una matriz de transiciones para casos_juridicos.estado (decisión '
  'deliberada, ver cabecera de la migración).';

create function public.guard_caso_juridico_actuacion_registrada_por()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.registrada_por := (select auth.uid());
  return new;
end;
$$;

create trigger guard_caso_juridico_actuacion_registrada_por
  before insert on public.caso_juridico_actuaciones
  for each row execute function public.guard_caso_juridico_actuacion_registrada_por();

create trigger caso_juridico_actuaciones_append_only
  before update or delete on public.caso_juridico_actuaciones
  for each row execute function public.forbid_mutation();

create policy caso_juridico_actuaciones_select_miembro
  on public.caso_juridico_actuaciones for select
  to authenticated
  using (public.is_member(tenant_id));

create policy caso_juridico_actuaciones_insert_agent
  on public.caso_juridico_actuaciones for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- ═══════════════════════════════════════════════════════════════════════
--  costas_judiciales (CAR §16) — I-C11: nunca sin documento_fuente/fecha_decision
-- ═══════════════════════════════════════════════════════════════════════

create table public.costas_judiciales (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  caso_id           uuid not null references public.casos_juridicos (id) on delete cascade,
  tipo_costa        public.tipo_costa_t not null,
  monto             numeric(18, 2) not null check (monto > 0),

  -- EVIDENCIA OBLIGATORIA — sin esto no existe la costa (I-C11)
  documento_fuente  text not null,
  fecha_decision    date not null,
  autoridad         text not null,

  estado            public.estado_costa_t not null default 'liquidada',
  monto_recuperado  numeric(18, 2) not null default 0,
  registrada_por    uuid not null references public.profiles (id),
  created_at        timestamptz not null default now(),
  constraint costa_monto_recuperado_no_excede check (monto_recuperado <= monto),
  constraint costa_monto_recuperado_no_negativo check (monto_recuperado >= 0)
);

alter table public.costas_judiciales enable row level security;
alter table public.costas_judiciales force row level security;

create index costas_judiciales_tenant_idx on public.costas_judiciales (tenant_id);
create index costas_judiciales_caso_idx on public.costas_judiciales (caso_id);

comment on table public.costas_judiciales is
  'CAR §16.1 — NUNCA calculadas por antigüedad ni automáticamente: las liquida el juez (CGP '
  'art. 366). documento_fuente/fecha_decision/autoridad son evidencia obligatoria, not null. '
  'Separadas de politicas_gastos_cobranza (gastos extrajudiciales, CAR §16.3) — no se mezclan.';

create function public.guard_costa_judicial_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para registrar una costa judicial';
  end if;
  new.registrada_por := (select auth.uid());
  return new;
end;
$$;

create trigger guard_costa_judicial_insert
  before insert on public.costas_judiciales
  for each row execute function public.guard_costa_judicial_insert();

-- ── UPDATE: solo estado/monto_recuperado pueden cambiar — la evidencia queda congelada ──
create function public.guard_costa_judicial_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id
     or new.caso_id is distinct from old.caso_id
     or new.tipo_costa is distinct from old.tipo_costa
     or new.monto is distinct from old.monto
     or new.documento_fuente is distinct from old.documento_fuente
     or new.fecha_decision is distinct from old.fecha_decision
     or new.autoridad is distinct from old.autoridad
     or new.registrada_por is distinct from old.registrada_por
  then
    raise exception 'COSTA_JUDICIAL_INMUTABLE: la evidencia de una costa judicial (%) no se '
      'puede modificar — solo estado y monto_recuperado (I-C11)', old.id;
  end if;
  return new;
end;
$$;

create trigger guard_costa_judicial_transicion
  before update on public.costas_judiciales
  for each row execute function public.guard_costa_judicial_transicion();

create policy costas_judiciales_select_miembro
  on public.costas_judiciales for select
  to authenticated
  using (public.is_member(tenant_id));

create policy costas_judiciales_insert_agent
  on public.costas_judiciales for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy costas_judiciales_update_agent
  on public.costas_judiciales for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- ═══════════════════════════════════════════════════════════════════════
--  documentos — generalización #2: caso_juridico_id nullable (GAP-CAR-007)
-- ═══════════════════════════════════════════════════════════════════════

alter table public.documentos
  add column caso_juridico_id uuid references public.casos_juridicos (id);

comment on column public.documentos.caso_juridico_id is
  'GAP-CAR-007/CAR §15.4 — nullable, igual que inmueble_id: un documento puede pertenecer al '
  'expediente de un caso jurídico en vez de (o además de) un inmueble/la copropiedad. '
  'subir-documento todavía no acepta este campo (pendiente, ver cabecera de la migración).';

create or replace function public.guard_documento_tipo_familia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_tenant_inmueble uuid;
  v_tenant_caso uuid;
begin
  select tipo into v_tipo from public.lista_tipos where id = new.tipo_documento_id;

  if v_tipo is distinct from 'TIPO_DOCUMENTO' then
    raise exception 'TIPO_DOCUMENTO_INVALIDO: tipo_documento_id % no pertenece a TIPO_DOCUMENTO (es %)',
      new.tipo_documento_id, coalesce(v_tipo, 'inexistente');
  end if;

  if new.inmueble_id is not null then
    select tenant_id into v_tenant_inmueble from public.inmuebles where id = new.inmueble_id;
    if v_tenant_inmueble is distinct from new.tenant_id then
      raise exception 'INMUEBLE_INVALIDO: % no pertenece al tenant %', new.inmueble_id, new.tenant_id;
    end if;
  end if;

  if new.caso_juridico_id is not null then
    select tenant_id into v_tenant_caso from public.casos_juridicos where id = new.caso_juridico_id;
    if v_tenant_caso is distinct from new.tenant_id then
      raise exception 'CASO_JURIDICO_INVALIDO: % no pertenece al tenant %', new.caso_juridico_id, new.tenant_id;
    end if;
  end if;

  return new;
end;
$$;
