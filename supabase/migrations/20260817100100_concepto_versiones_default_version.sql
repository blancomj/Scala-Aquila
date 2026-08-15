-- Fix de la migración anterior (20260817100000): el Insert generado exigía
-- `version` porque la columna era `not null` sin default — el valor real
-- siempre lo pone asignar_version_concepto() antes del check, así que la
-- columna debe tener un default cualquiera para que el cliente pueda omitirla.
alter table public.concepto_versiones alter column version set default 0;
