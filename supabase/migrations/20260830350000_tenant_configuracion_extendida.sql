-- ═══════════════════════════════════════════════════════════════════════
--  tenants.dia_facturacion / tenants.canal_notificacion — amplían el tab
--  Configuración de la ficha de copropiedad (hoy solo moneda/zona_horaria,
--  PROMPT_FICHA_COPROPIEDAD.md §7.4 v1).
--
--  Ambas columnas son informativas por ahora — sin proceso consumidor
--  todavía (mismo criterio ya usado en este proyecto para catálogos
--  sembrados antes que su consumidor, ej. ROL_CONCEJO_COPROPIEDAD).
--
--  dia_facturacion: 1-28, no 1-31, para no dejar un valor imposible en
--  meses de menos de 31 días (ej. febrero).
--
--  canal_notificacion: texto plano con 3 valores fijos, mismo patrón que
--  moneda/zona_horaria hoy (un <select> con opciones fijas en el frontend,
--  no un catálogo lista_tipos nuevo) — decisión explícita del usuario.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.tenants add column dia_facturacion smallint;
alter table public.tenants add constraint tenants_dia_facturacion_valido
  check (dia_facturacion is null or dia_facturacion between 1 and 28);

alter table public.tenants add column canal_notificacion text;
alter table public.tenants add constraint tenants_canal_notificacion_valido
  check (canal_notificacion is null or canal_notificacion in ('email', 'sms', 'whatsapp'));

comment on column public.tenants.dia_facturacion is
  'Día del mes (1-28) para el ciclo de facturación — informativo por ahora, sin proceso '
  'consumidor todavía (mismo criterio que otros catálogos sembrados antes que su consumidor).';
comment on column public.tenants.canal_notificacion is
  'Canal preferido para notificaciones de la copropiedad (email/sms/whatsapp) — selector '
  'simple, mismo patrón que moneda/zona_horaria, sin catálogo lista_tipos.';
