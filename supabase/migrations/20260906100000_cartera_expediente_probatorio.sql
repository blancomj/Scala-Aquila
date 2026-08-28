-- ═══════════════════════════════════════════════════════════════════════
--  CAR §34 (1/2) · Expediente probatorio — envíos y acuses
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §34
--
--  Principio (§34.1): «una gestión de cobro que no puede acreditarse no
--  ocurrió». El estado `ejecutada` de acciones_cobranza significa
--  DESPACHADA al proveedor, no recibida por el deudor (REC-CAR-016). El
--  tercer estado —acreditada— se DERIVA de los acuses y nunca se
--  persiste, mismo principio que la prohibición AP-01 de `esta_en_mora`.
--
--  Por qué el envío es entidad propia y no columnas en acciones_cobranza:
--  una acción admite varios intentos (§18.4 paso 7). El intento 1 rebota,
--  el 2 entrega, y el expediente debe mostrar AMBOS (PH-C41). Colapsarlos
--  en la acción borraría el primero, que es justamente la prueba de
--  diligencia.
--
--  Retención (§34.6, I-C25): estas tablas quedan fuera del alcance de
--  purgar_audit_log_antiguo() por construcción — forbid_mutation() solo
--  admite DELETE cuando tg_table_name = 'audit_log'. No hace falta una
--  exclusión explícita; hace falta no crear nunca una purga que las
--  incluya mientras VER-CAR-05 (prescripción) siga abierto.
--
--  documentos: la tabla nació como documentos_inmueble (20260820100300) y
--  se generalizó a documentos en 20260822130000 — inmueble_id quedó
--  nullable. Un acuse escaneado cuelga del inmueble, así que aquí se usa
--  con inmueble_id presente.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Catálogos ────────────────────────────────────────────────────────
create type public.estado_acuse_t as enum (
  'encolado',      -- aceptado por el proveedor, sin resolución todavía
  'entregado',     -- el proveedor confirma entrega
  'leido',         -- confirmación de lectura (no todos los canales)
  'rebotado',      -- rechazo permanente del destino
  'fallido',       -- error técnico del envío
  'no_entregable'  -- imposibilidad acreditada (dirección inexistente, etc.)
);

create type public.origen_acuse_t as enum (
  'proveedor',     -- webhook del proveedor de envío
  'manual'         -- constancia cargada por una persona, exige documento
);

-- D-24 (DECISIONES.md), exigido por tests/governance/enum-lista-tipos-coverage.test.ts
comment on type public.estado_acuse_t is
  'Por qué es enum nativo (D-24): catálogo CERRADO de resultados posibles de un envío, '
  'no vocabulario ampliable por tenant. Gatilla lógica de transición — fn_acreditacion_accion '
  'decide sobre (entregado, leido) y el escalamiento a prejurídica consulta esa derivación '
  '(I-C23) — así que un valor nuevo inventado por un tenant cambiaría silenciosamente qué '
  'cuenta como notificación probada ante un juez. Cerrado a propósito.';

comment on type public.origen_acuse_t is
  'Por qué es enum nativo (D-24): 2 valores fijos que separan acuse técnico verificable '
  '(webhook del proveedor) de constancia humana (la palabra de una persona). La distinción '
  'es estructural para REC-CAR-017 y la vigila un check constraint: origen=manual exige '
  'documento_id. No es vocabulario de negocio.';

-- ── Envío material de una acción de cobranza ─────────────────────────
create table public.acciones_cobranza_envios (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants (id) on delete cascade,
  accion_id               uuid not null references public.acciones_cobranza (id),

  intento_numero          int not null,
  canal                   public.canal_cobranza_t not null,

  -- DESTINATARIO RESUELTO EN EL MOMENTO DEL ENVÍO
  destinatario_tercero_id uuid not null references public.terceros (id),
  destinatario_contacto   text not null,     -- correo/teléfono/dirección usados

  -- CONTENIDO — lo que se aporta al proceso, no su huella
  plantilla_codigo        text not null,
  plantilla_version       int not null,
  asunto                  text,
  contenido_renderizado   text not null,     -- el texto exacto que se envió
  contenido_hash          text not null,     -- integridad, no sustituto

  -- PROVEEDOR
  proveedor               text not null,     -- 'brevo' | 'postal' | 'manual'
  referencia_externa      text,              -- id del proveedor
  enviado_at              timestamptz not null default now(),
  enviado_por             uuid references public.profiles (id),

  created_at              timestamptz not null default now(),

  constraint envio_intento_unico unique (tenant_id, accion_id, intento_numero),
  constraint envio_intento_positivo check (intento_numero > 0),
  constraint envio_plantilla_version_positiva check (plantilla_version > 0)
);

alter table public.acciones_cobranza_envios enable row level security;
alter table public.acciones_cobranza_envios force row level security;

create trigger acciones_cobranza_envios_append_only
  before update or delete on public.acciones_cobranza_envios
  for each row execute function public.forbid_mutation();

create index acciones_cobranza_envios_tenant_accion_idx
  on public.acciones_cobranza_envios (tenant_id, accion_id, intento_numero);

-- El webhook llega con la referencia del proveedor y nada más: este
-- índice es el que resuelve referencia_externa → envío.
create index acciones_cobranza_envios_referencia_idx
  on public.acciones_cobranza_envios (tenant_id, referencia_externa)
  where referencia_externa is not null;

create policy acciones_cobranza_envios_select_miembro
  on public.acciones_cobranza_envios for select
  to authenticated
  using (public.is_member(tenant_id));

comment on table public.acciones_cobranza_envios is
  'CAR §34.3 — el hecho material del envío de una acción de cobranza. Append-only. Una '
  'acción puede tener varios intentos y cada uno conserva su propia evidencia: el '
  'expediente muestra los intentos fallidos, que acreditan diligencia (PH-C41, PH-C43). '
  'Solo service_role escribe — un envío registrado a mano sin haber despachado nada sería '
  'prueba fabricada.';

comment on column public.acciones_cobranza_envios.contenido_renderizado is
  'El texto ÍNTEGRO que recibió el deudor. No es redundante con contenido_hash: el hash '
  'prueba que el texto no cambió, pero sin el texto no hay nada que probar. El juez pide '
  'el documento, no su huella (§34.1).';

comment on column public.acciones_cobranza_envios.destinatario_contacto is
  'El correo, teléfono o dirección EXACTOS usados en este envío. Se copia, no se lee de '
  'terceros al compilar el expediente: si el deudor cambia de correo en 2027, la prueba '
  'de 2026 debe seguir diciendo a dónde se envió entonces.';

-- ── Acuses recibidos sobre un envío ──────────────────────────────────
create table public.acciones_cobranza_acuses (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  envio_id        uuid not null references public.acciones_cobranza_envios (id),

  estado          public.estado_acuse_t not null,
  ocurrido_at     timestamptz not null,    -- momento reportado por la fuente
  recibido_at     timestamptz not null default now(),

  origen          public.origen_acuse_t not null,
  payload_crudo   jsonb,                   -- respuesta íntegra del proveedor
  documento_id    uuid references public.documentos (id),
  motivo          text,
  registrado_por  uuid references public.profiles (id),

  created_at      timestamptz not null default now(),

  -- I-C22: un acuse manual sin documento que lo respalde no prueba nada
  constraint acuse_manual_exige_documento check (
    origen <> 'manual' or documento_id is not null
  ),
  -- IDEM-05: deduplicación de webhooks reenviados
  constraint acuse_unico unique (tenant_id, envio_id, estado, ocurrido_at)
);

alter table public.acciones_cobranza_acuses enable row level security;
alter table public.acciones_cobranza_acuses force row level security;

create trigger acciones_cobranza_acuses_append_only
  before update or delete on public.acciones_cobranza_acuses
  for each row execute function public.forbid_mutation();

create index acciones_cobranza_acuses_tenant_envio_idx
  on public.acciones_cobranza_acuses (tenant_id, envio_id, ocurrido_at desc);

create policy acciones_cobranza_acuses_select_miembro
  on public.acciones_cobranza_acuses for select
  to authenticated
  using (public.is_member(tenant_id));

comment on table public.acciones_cobranza_acuses is
  'CAR §34.3 — lo que el proveedor (o una persona, con documento) reporta sobre un envío. '
  'Append-only y deduplicado por (envio_id, estado, ocurrido_at): un proveedor que reenvía '
  'el mismo webhook no duplica la prueba (PH-C45). Un acuse nunca se corrige: se registra '
  'otro posterior y gana el más reciente.';

comment on column public.acciones_cobranza_acuses.ocurrido_at is
  'Momento que reporta la FUENTE, no el momento en que lo recibimos (recibido_at). Los dos '
  'se conservan: la diferencia entre ambos es normal y explicable, y borrarla dejaría el '
  'expediente sin forma de justificar un acuse que llegó con retraso.';

comment on column public.acciones_cobranza_acuses.documento_id is
  'Acuse escaneado o guía del operador postal, en documentos. Obligatorio cuando '
  'origen = manual (I-C22) — REC-CAR-017: una constancia humana sin respaldo documental '
  'es la palabra del gestor, no prueba.';

-- ── §34.4 Estado de acreditación — derivado, nunca persistido ────────
-- REC-CAR-018: no hay columna `esta_acreditada`, igual que no hay
-- `esta_en_mora` (AP-01). Se calcula desde el último acuse de cada envío.
--
--   acreditada(accion) = ∃ envio : ultimo_acuse(envio).estado ∈ (entregado, leido)
--
-- 'no_entregable' NO acredita la notificación pero SÍ la diligencia: se
-- conserva y se reporta (PH-C43).
create or replace function public.fn_acreditacion_accion(
  p_tenant_id uuid,
  p_accion_id uuid
) returns table (
  envios_total       int,
  envios_acreditados int,
  ultimo_estado      public.estado_acuse_t,
  ultimo_acuse_at    timestamptz,
  acreditada         boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with envios as (
    select e.id
    from public.acciones_cobranza_envios e
    where e.tenant_id = p_tenant_id
      and e.accion_id = p_accion_id
  ),
  -- Un envío puede acumular varios acuses (encolado → entregado → leido).
  -- Solo el último cuenta; los anteriores son historia, no estado.
  ultimo_por_envio as (
    select distinct on (a.envio_id)
           a.envio_id,
           a.estado,
           a.ocurrido_at
    from public.acciones_cobranza_acuses a
    join envios en on en.id = a.envio_id
    where a.tenant_id = p_tenant_id
    order by a.envio_id, a.ocurrido_at desc, a.recibido_at desc, a.id desc
  )
  select
    (select count(*) from envios)::int,
    (select count(*) from ultimo_por_envio
      where estado in ('entregado', 'leido'))::int,
    (select estado from ultimo_por_envio
      order by ocurrido_at desc, envio_id desc limit 1),
    (select max(ocurrido_at) from ultimo_por_envio),
    exists (select 1 from ultimo_por_envio
             where estado in ('entregado', 'leido'));
$$;

comment on function public.fn_acreditacion_accion(uuid, uuid) is
  'CAR §34.4 REC-CAR-018 — deriva el estado de acreditación de una acción desde el último '
  'acuse de cada uno de sus envíos. Nunca se persiste (AP-01). Basta UN envío con acuse '
  'entregado/leido para acreditar: con varios copropietarios cada uno tiene su acción propia '
  '(grupo_envio_id), así que aquí no se mezclan destinatarios distintos.';
