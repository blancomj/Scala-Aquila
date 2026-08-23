-- `tipos.descripcion` se muestra tal cual al usuario final en Configuración →
-- Catálogos (catalogos.vue). Varias filas seedeadas en 20260814160000 y
-- 20260830120000 arrastraban una referencia interna al documento de
-- planeación ("PLAN §4.3", "PLAN 2026-08-20") que no tiene sentido para un
-- administrador de copropiedad — se limpia el texto, sin tocar nombre/codigo.
update public.tipos set descripcion = 'Clasificación de un inmueble como destino de cobro.'
  where codigo = 'TIPO_INMUEBLE';
update public.tipos set descripcion = 'Clasificación de un bien común descriptivo.'
  where codigo = 'TIPO_ZONA_COMUN';
update public.tipos set descripcion = 'Agrupación informativa de un rubro del presupuesto anual.'
  where codigo = 'CATEGORIA_RUBRO_PRESUPUESTAL';
update public.tipos set descripcion = 'Etiqueta de acceso por módulo, adicional al nivel de tenant_role_t.'
  where codigo = 'ROL_FUNCIONAL';
