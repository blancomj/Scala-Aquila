-- ═══════════════════════════════════════════════════════════════════════
--  GOB-9 (1/7) · Generalización de comunicaciones — origen polimórfico
--  Ver GOB_09_comunicaciones_workflow.md §3.1, prueba 3.
--
--  Cero regresión (spec §3.1, prueba 1): este archivo es PURAMENTE
--  ADITIVO sobre acciones_cobranza_envios/acuses — ninguna columna,
--  constraint, índice ni política existentes se toca. accion_id pasa a
--  ser nullable (antes NOT NULL) para abrir la puerta al origen
--  polimórfico, pero cualquier fila de cobranza ya escrita sigue
--  cumpliendo accion_id is not null, y el envío por accion_id sigue
--  funcionando exactamente igual (mismas columnas, mismo unique,
--  ejecutar-accion-cobranza/cartera-ejecutar-lote no cambian).
--
--  Patrón de origen: idéntico al de contable_comprobante (CO-2,
--  20260930200000) — origen_modulo/origen_entidad/origen_id(+evento),
--  nullable, con un índice único parcial para idempotencia. plantillas_
--  email/sms/compositor y su versionado YA eran genéricos en esquema
--  (tenant_id + event_type, sin ninguna referencia a cobranza) — lo único
--  acoplado a cobranza era el envío/acuse, y es lo único que se toca aquí.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.acciones_cobranza_envios
  alter column accion_id drop not null;

alter table public.acciones_cobranza_envios
  add column origen_modulo  text,
  add column origen_entidad text,
  add column origen_id      uuid,
  add column origen_evento  text;

-- Exactamente un camino: el histórico de cobranza (accion_id) o el
-- genérico (los 3 origen_* obligatorios juntos). Ninguna fila puede
-- quedar sin ancla de procedencia, ni tener las dos a la vez (evitaría
-- que un mismo envío se contara doble en dos auditorías distintas).
alter table public.acciones_cobranza_envios
  add constraint envio_origen_exclusivo check (
    (accion_id is not null and origen_modulo is null and origen_entidad is null and origen_id is null)
    or
    (accion_id is null and origen_modulo is not null and origen_entidad is not null and origen_id is not null)
  );

-- IDEM: mismo origen no genera dos envíos para el mismo evento (prueba 3).
-- origen_evento distingue reintentos legítimos (un recordatorio de
-- vencimiento a 5 días y otro a 1 día son eventos distintos del mismo
-- origen_id) de un reenvío accidental del mismo evento.
create unique index acciones_cobranza_envios_origen_unico
  on public.acciones_cobranza_envios (tenant_id, origen_modulo, origen_entidad, origen_id, origen_evento);

comment on column public.acciones_cobranza_envios.accion_id is
  'GOB-9: nullable desde 20260931950000 — NOT NULL solo para envíos que nacen de una acción de '
  'cobranza (CAR §34). Cualquier otro módulo usa origen_modulo/origen_entidad/origen_id en su '
  'lugar (envio_origen_exclusivo exige exactamente uno de los dos caminos).';

comment on column public.acciones_cobranza_envios.origen_modulo is
  'GOB-9 §3.1: ''gobierno'' (u otro módulo futuro) para envíos que no nacen de acciones_cobranza. '
  'Mismo patrón que contable_comprobante.origen_modulo (CO-2, 20260930200000) — texto libre, no '
  'lista_tipos ni enum, porque quien envía declara su propio nombre de módulo.';

comment on column public.acciones_cobranza_envios.origen_entidad is
  'GOB-9 §3.1: la tabla de origen (''gobierno_expediente_actuaciones'', ''gobierno_vencimiento_'
  'notificaciones'', ''gobierno_agenda'', etc.) — junto con origen_id localiza el hecho que '
  'disparó el envío.';

comment on column public.acciones_cobranza_envios.origen_evento is
  'GOB-9 §3.1 IDEM: distingue eventos distintos sobre el mismo origen_id (dos umbrales de '
  'recordatorio del mismo vencimiento, o dos hitos del mismo expediente) — el índice único '
  '(tenant_id, origen_modulo, origen_entidad, origen_id, origen_evento) es lo que impide que el '
  'mismo evento se despache dos veces.';

comment on table public.acciones_cobranza_envios is
  'CAR §34.3, generalizada por GOB-9 §3.1 — el hecho material de un envío, de cobranza '
  '(accion_id) o de cualquier otro módulo (origen_modulo/entidad/id). Append-only. Solo '
  'service_role escribe.';
