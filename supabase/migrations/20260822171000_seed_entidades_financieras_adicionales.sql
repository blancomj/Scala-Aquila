-- ═══════════════════════════════════════════════════════════════════════
--  Completa el catálogo ENTIDAD_FINANCIERA (20260822170000) con los
--  neobancos/billeteras que faltaban — verificado por búsqueda web en
--  esta sesión: Nu (Nubank Colombia), Lulo Bank y Powwi ya operan como
--  entidades vigiladas SFC independientes, y Mercado Pago es una billetera
--  de uso extendido. No se edita la migración anterior porque ya se
--  aplicó (Supabase registra el historial de migraciones aplicadas).
-- ═══════════════════════════════════════════════════════════════════════

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('ENTIDAD_FINANCIERA', 'nu_colombia', 'Nu (Nubank Colombia)', 21),
  ('ENTIDAD_FINANCIERA', 'lulo_bank', 'Lulo Bank', 22),
  ('ENTIDAD_FINANCIERA', 'powwi', 'Powwi', 23),
  ('ENTIDAD_FINANCIERA', 'mercado_pago', 'Mercado Pago', 24);

update public.lista_tipos
set orden = 25
where tipo = 'ENTIDAD_FINANCIERA' and codigo = 'otra' and tenant_id is null;
