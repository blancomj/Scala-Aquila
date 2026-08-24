-- ═══════════════════════════════════════════════════════════════════════
--  PC-7a · Solo el valor de enum nuevo, en su propia migración
--
--  ALTER TYPE ... ADD VALUE no puede usarse en la misma transacción en la
--  que se agrega (PostgreSQL lo rechaza con "unsafe use of new value" —
--  SQLSTATE 55P04): el valor no queda visible al planificador hasta que la
--  transacción que lo creó confirma. Como cada migración corre en su propia
--  transacción, separarlo en su propio archivo es la forma estándar de
--  resolverlo, no un rodeo.
-- ═══════════════════════════════════════════════════════════════════════

alter type public.fundamento_tipo_t add value 'orientacion_tecnica';
