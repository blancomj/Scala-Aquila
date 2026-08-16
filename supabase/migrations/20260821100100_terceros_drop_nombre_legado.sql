-- ═══════════════════════════════════════════════════════════════════════
--  Terceros — elimina la columna `nombre` heredada de `personas`
--
--  Se me pasó en 20260821100000: nombre_completo (generada) reemplaza a
--  `nombre`, pero la columna vieja seguía NOT NULL y sin nada que la
--  poblara — el primer insert real la habría reventado. `nombre_completo`
--  ya reconstruye el valor a partir de primer_nombre/segundo_nombre/
--  primer_apellido/segundo_apellido (natural) o razon_social (jurídica).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.terceros drop column nombre;
