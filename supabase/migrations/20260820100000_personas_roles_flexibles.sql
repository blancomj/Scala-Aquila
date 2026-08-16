-- ═══════════════════════════════════════════════════════════════════════
--  Ficha de inmueble — personas con rol flexible (T0.1)
--  Propietario: PROMPT_FICHA_INMUEBLE.md §4.2, §7.1-7.3
--
--  `propietarios`/`inmueble_propietario` solo modelaban copropietarios con
--  porcentaje. La ficha de inmueble necesita cualquier persona asociada
--  (inquilino, apoderado, codeudor...) con un rol tomado del catálogo
--  PERSONA_PREDIO (ya sembrado en 20260814180000) y, de forma independiente
--  del rol, quién es el pagador (recibe la factura) y quién recibe
--  notificaciones — cualquier persona puede ser pagador, no tiene que ser
--  copropietario.
--
--  Rename seguro: grep confirmado (apps/web, supabase/functions, packages)
--  — ningún código de aplicación referencia `propietarios`/
--  `inmueble_propietario` todavía, solo los tipos generados (que se
--  regeneran en T1). El rename no rompe nada existente.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.propietarios rename to personas;
alter index propietarios_pkey rename to personas_pkey;
alter index propietarios_tenant_idx rename to personas_tenant_idx;
alter table public.personas rename constraint propietarios_documento_unico to personas_documento_unico;

alter policy propietarios_select_miembro on public.personas rename to personas_select_miembro;
alter policy propietarios_insert_agent on public.personas rename to personas_insert_agent;
alter policy propietarios_update_agent on public.personas rename to personas_update_agent;
alter policy propietarios_delete_agent on public.personas rename to personas_delete_agent;

comment on table public.personas is
  'Datos del dominio, no usuarios (AD-26): sin FK a auth.users, sin política RLS propia '
  'de identidad — se leen a través del tenant (PLAN §7.5). Antes "propietarios" — '
  'renombrada porque modela cualquier persona asociada a un inmueble, no solo dueños '
  '(PROMPT_FICHA_INMUEBLE.md §4.2).';

alter table public.inmueble_propietario rename to inmueble_persona_rol;
alter index inmueble_propietario_pkey rename to inmueble_persona_rol_pkey;
alter index inmueble_propietario_tenant_idx rename to inmueble_persona_rol_tenant_idx;
alter index inmueble_propietario_inmueble_idx rename to inmueble_persona_rol_inmueble_idx;

alter table public.inmueble_persona_rol rename column propietario_id to persona_id;
alter table public.inmueble_persona_rol rename column desde to vigente_desde;
alter table public.inmueble_persona_rol rename column hasta to vigente_hasta;

alter table public.inmueble_persona_rol
  rename constraint inmueble_propietario_porcentaje_valido to inmueble_persona_rol_porcentaje_valido;
alter table public.inmueble_persona_rol
  rename constraint inmueble_propietario_fechas_validas to inmueble_persona_rol_fechas_validas;

alter policy inmueble_propietario_select_miembro on public.inmueble_persona_rol
  rename to inmueble_persona_rol_select_miembro;
alter policy inmueble_propietario_insert_agent on public.inmueble_persona_rol
  rename to inmueble_persona_rol_insert_agent;
alter policy inmueble_propietario_update_agent on public.inmueble_persona_rol
  rename to inmueble_persona_rol_update_agent;
alter policy inmueble_propietario_delete_agent on public.inmueble_persona_rol
  rename to inmueble_persona_rol_delete_agent;

-- ── rol flexible: rol_id contra el catálogo PERSONA_PREDIO ─────────────
-- Toda fila existente hoy es, por construcción de la tabla vieja, un
-- copropietario (única semántica que `inmueble_propietario` modelaba).
alter table public.inmueble_persona_rol add column rol_id bigint;

update public.inmueble_persona_rol ipr
set rol_id = lt.id
from public.lista_tipos lt
where lt.tipo = 'PERSONA_PREDIO' and lt.tenant_id is null and lt.codigo = 'copropietario';

alter table public.inmueble_persona_rol alter column rol_id set not null;
alter table public.inmueble_persona_rol
  add constraint inmueble_persona_rol_rol_id_fkey foreign key (rol_id) references public.lista_tipos (id);
create index inmueble_persona_rol_rol_idx on public.inmueble_persona_rol (rol_id);

-- ── porcentaje ahora es nullable — solo aplica a copropietario ─────────
-- La suma ≤100% entre copropietarios se valida en cliente al guardar
-- (§4.2), no como constraint — mismo criterio que otros campos
-- condicionales por rol en este documento.
alter table public.inmueble_persona_rol drop constraint inmueble_persona_rol_porcentaje_valido;
alter table public.inmueble_persona_rol alter column porcentaje drop not null;
alter table public.inmueble_persona_rol
  add constraint inmueble_persona_rol_porcentaje_valido
  check (porcentaje is null or (porcentaje > 0 and porcentaje <= 100));

-- ── pagador / notificaciones — independientes del rol ──────────────────
alter table public.inmueble_persona_rol add column es_pagador boolean not null default false;
alter table public.inmueble_persona_rol add column recibe_notificaciones boolean not null default true;

-- Un solo pagador vigente por inmueble. fn_marcar_pagador (T0.2) es la
-- única vía prevista para poner es_pagador=true sin violar este índice —
-- un UPDATE directo desde el cliente puede chocar contra él si ya hay
-- otro pagador vigente, que es exactamente la protección buscada.
create unique index inmueble_persona_rol_un_pagador_vigente
  on public.inmueble_persona_rol (inmueble_id)
  where es_pagador and vigente_hasta is null;

comment on table public.inmueble_persona_rol is
  'Relación persona↔inmueble con rol flexible (PERSONA_PREDIO). porcentaje solo aplica '
  'cuando rol=copropietario. es_pagador/recibe_notificaciones son independientes del rol '
  '— cualquier persona puede ser pagador. vigente_hasta IS NULL = relación activa; '
  '"terminar" una relación es poner vigente_hasta, nunca DELETE. Antes '
  '"inmueble_propietario" (PROMPT_FICHA_INMUEBLE.md §4.2).';
