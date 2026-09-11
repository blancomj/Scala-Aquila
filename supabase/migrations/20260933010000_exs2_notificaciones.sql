-- ═══════════════════════════════════════════════════════════════════════
--  EXS-2 · Notificaciones in-app (2/4) — el dominio
--  Casos de uso/Experiencia y servicios/EXS_02_INFORME.md
--
--  Lo que faltaba en AQUILA, verificado antes de construirlo: existen tres
--  tablas de DETECCIÓN por dominio (finanzas_alerta_emitida,
--  mant_inventario_alertas, gobierno_vencimiento_notificaciones) y existe
--  el ledger de ENVÍO (acciones_cobranza_envios/_acuses, COM-1). No existía
--  la pieza intermedia: un aviso dirigido, con estado de lectura y enlace
--  al contexto. La campana (NavNotificaciones.vue) lo suplía leyendo
--  audit_log y comparando contra una cookie — exactamente el anti-patrón
--  que el prompt 06 §13 prohíbe.
--
--  DIRECCIONAMIENTO POR MÓDULO, NO POR PERSONA (decisión del usuario,
--  D-73). Una notificación se dirige a `modulo`, y la ve quien pueda ver
--  ese módulo según puede_ver_modulo() — que ya implementa exactamente
--  "quien tenga el rol funcional correspondiente", más administradores,
--  más (retrocompatible) quien no tenga ningún rol funcional asignado.
--  Por eso no hay destinatario_usuario_id ni destinatario_rol_id: el
--  mecanismo de autorización que ya existe ES el direccionamiento, y
--  duplicarlo en una columna crearía dos fuentes de verdad.
--
--  Consecuencia directa: la lectura NO puede ser una columna de esta
--  tabla. Varios miembros ven la misma notificación y cada uno la lee por
--  su cuenta — de ahí notificacion_lectura, una fila por (aviso, usuario)
--  que existe o no existe. Es además la estrategia B del prompt 02 §18
--  ("registrar únicamente lecturas") aplicada aquí: nada se materializa
--  por destinatario en el momento de emitir.
-- ═══════════════════════════════════════════════════════════════════════

create table public.notificaciones (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,

  -- Destino: quien pueda ver este módulo. Texto libre a propósito, igual
  -- que rol_funcional_modulo.modulo — no hay catálogo de módulos en el
  -- esquema y crear uno ahora desincronizaría ambas tablas.
  modulo         text not null,

  tipo_id        bigint not null references public.lista_tipos (id),
  prioridad_id   bigint not null references public.lista_tipos (id),

  titulo         text not null,
  cuerpo         text,

  -- Deep link relativo dentro de apps/web (EXS-1 §4: en esta serie los
  -- enlaces son internos y no necesitan token; basta sesión + RLS).
  enlace         text,

  -- Mismo trío que COM-1 usa en acciones_cobranza_envios, a propósito:
  -- permite cruzar un aviso in-app con su envío por correo cuando algún
  -- día se construya el puente, sin inventar una correspondencia nueva.
  origen_modulo  text not null,
  origen_entidad text not null,
  origen_id      uuid,
  origen_evento  text not null,

  created_at     timestamptz not null default now(),

  constraint notificaciones_titulo_no_vacio check (btrim(titulo) <> ''),
  constraint notificaciones_modulo_no_vacio check (btrim(modulo) <> '')
);

-- Idempotencia (prompt 02 §30, prompt 06 §17): los emisores son crons
-- diarios que vuelven a detectar lo mismo cada día. La identidad de un
-- aviso es su origen, no su momento. `origen_id` entra en la clave con
-- coalesce porque hay eventos de tenant completo, sin entidad concreta,
-- y en SQL dos NULL no colisionan — sin esto, un evento sin origen_id se
-- duplicaría en cada corrida.
create unique index notificaciones_origen_idx
  on public.notificaciones (
    tenant_id, origen_entidad, coalesce(origen_id, '00000000-0000-0000-0000-000000000000'::uuid), origen_evento
  );

create index notificaciones_tenant_modulo_idx on public.notificaciones (tenant_id, modulo, created_at desc);

alter table public.notificaciones enable row level security;
alter table public.notificaciones force row level security;

-- Lectura: miembro del tenant Y con acceso al módulo. Misma composición
-- que el resto de módulos sensibles (juridico, financiero…).
create policy notificaciones_select_miembro on public.notificaciones
  for select
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, modulo));

-- Sin policy de insert/update/delete a propósito: una notificación la
-- emite el sistema (fn_notificar, security definer, desde triggers) o
-- service_role. Un cliente que pudiera insertarlas podría fabricar avisos
-- que parecen del sistema. Con FORCE RLS y sin policy, nadie más escribe.

comment on table public.notificaciones is
  'EXS-2 — aviso in-app dirigido a un MÓDULO (no a una persona): lo ve quien pase '
  'puede_ver_modulo(tenant, modulo). Reemplaza el uso de audit_log como sustituto de '
  'notificaciones (prompt 06 §13). La lectura vive en notificacion_lectura, por usuario, porque '
  'varios miembros ven el mismo aviso. Solo el sistema escribe aquí: no hay policy de insert.';

comment on column public.notificaciones.modulo is
  'Módulo destino, mismo vocabulario que rol_funcional_modulo.modulo (financiero, '
  'cartera_cobranza, juridico, mantenimiento, estado_cuenta, gobierno…). No es FK porque ese '
  'catálogo no existe como tabla; mantener ambos en texto evita una fuente de verdad partida.';

comment on column public.notificaciones.origen_evento is
  'Qué ocurrió, en el vocabulario del dominio emisor (p. ej. alerta_emitida, stock_minimo). '
  'Junto a origen_entidad/origen_id forma la clave de idempotencia: reemitir la misma detección '
  'no duplica el aviso.';

-- ── Lectura, por usuario ───────────────────────────────────────────────

create table public.notificacion_lectura (
  notificacion_id uuid not null references public.notificaciones (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  leida_at        timestamptz not null default now(),

  primary key (notificacion_id, user_id)
);

alter table public.notificacion_lectura enable row level security;
alter table public.notificacion_lectura force row level security;

create policy notificacion_lectura_select_propia on public.notificacion_lectura
  for select
  using (user_id = (select auth.uid()));

-- Marcar leído es la única escritura que hace un cliente en todo el corte.
-- Solo sobre sí mismo, y solo si la notificación le es visible — sin el
-- exists, cualquiera podría sondear qué ids existen marcándolos leídos.
create policy notificacion_lectura_insert_propia on public.notificacion_lectura
  for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.notificaciones n
      where n.id = notificacion_id
        and public.is_member(n.tenant_id)
        and public.puede_ver_modulo(n.tenant_id, n.modulo)
    )
  );

-- Sin update ni delete: "no leído de nuevo" no es un caso de uso pedido, y
-- append-only mantiene la evidencia de cuándo se vio algo.

comment on table public.notificacion_lectura is
  'EXS-2 — una fila por (notificación, usuario) que la leyó. Append-only: no hay update ni '
  'delete. Su ausencia es el "no leído"; no existe columna booleana que mantener sincronizada.';
