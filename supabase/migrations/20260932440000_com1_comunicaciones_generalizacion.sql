-- ═══════════════════════════════════════════════════════════════════════
--  COM-1 (1/1) · Comunicaciones — histórico unificado de correo enviado
--
--  Puramente aditivo sobre acciones_cobranza_envios, ya generalizada por
--  GOB-9 (20260931950000) con origen_modulo/origen_entidad/origen_id/
--  origen_evento. No se crea tabla nueva: el compositor de correo, el
--  estado de cuenta y el recibo de caja pasan a escribir aquí (sesión
--  aparte, código) en vez de dejar solo un rastro pobre en audit_log —
--  esta migración solo abre las dos puertas que ese cierre necesita.
--
--  1. destinatario_tercero_id nullable: el compositor admite un correo
--     suelto (destinatario_email + destinatario_nombre libres, sin
--     inmueble_id) que no resuelve ninguna fila de terceros. Antes de
--     esto el FK not null lo habría bloqueado.
--
--  2. es_automatico: booleano explícito (no derivado de enviado_por is
--     null, que se puede desalinear en silencio; no lista_tipos, porque
--     no es vocabulario ampliable — es un flag binario real) para que
--     la vista unificada distinga un envío disparado por una persona de
--     uno disparado por un cron/batch sin intervención humana en el
--     momento.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.acciones_cobranza_envios
  alter column destinatario_tercero_id drop not null;

comment on column public.acciones_cobranza_envios.destinatario_tercero_id is
  'COM-1: nullable desde 20260932440000 — el compositor de correo admite un destinatario suelto '
  '(correo + nombre libres) que no resuelve ninguna fila de terceros. Cuando es null, el '
  'destinatario real y verificado del envío sigue viviendo en destinatario_contacto.';

alter table public.acciones_cobranza_envios
  add column es_automatico boolean not null default false;

comment on column public.acciones_cobranza_envios.es_automatico is
  'COM-1: true cuando el envío lo dispara un cron/batch sin intervención humana en el momento '
  '(enviar-estados-cuenta-pendientes con viaBatch, enviar-comunicacion vía cron de vencimientos); '
  'false cuando lo dispara una persona (acción de cobranza individual o por lote, compositor de '
  'correo, envío manual de estado de cuenta o recibo de caja). Cada emisor lo declara a propósito '
  '— no se deriva de enviado_por is null porque eso se puede desalinear en silencio.';

-- La página de Comunicaciones lista across-módulo ordenado por fecha, sin filtrar por accion_id
-- (el índice existente (tenant_id, accion_id, intento_numero) no cubre ese acceso).
create index acciones_cobranza_envios_tenant_enviado_idx
  on public.acciones_cobranza_envios (tenant_id, enviado_at desc);
