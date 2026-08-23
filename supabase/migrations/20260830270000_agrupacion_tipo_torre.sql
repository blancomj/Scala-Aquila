-- Nuevo tipo de agrupación: Torre (ej. Torre 1, Torre Norte — común en
-- conjuntos con varias torres bajo una misma etapa/bloque).
insert into public.lista_tipos (tipo, codigo, nombre, orden, activo)
values ('AGRUPACION_PREDIOS', 'torre', 'Torre', 11, true)
on conflict (tipo, codigo, tenant_id) do nothing;
