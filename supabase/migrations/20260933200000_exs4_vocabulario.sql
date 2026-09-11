-- ═══════════════════════════════════════════════════════════════════════
--  EXS-4 · Directorio de la copropiedad (1/3) — vocabulario
--  Casos de uso/Experiencia y servicios/EXS_04_INFORME.md
--
--  CATEGORIA_COMERCIO es vocabulario puro (D-24): clasifica y agrupa en el
--  directorio, no gatilla ninguna regla.
--
--  No reutiliza CATEGORIA_ACTIVO, que es lo que ya guarda
--  categorias_servicio en el perfil: esa familia dice "en qué categorías de
--  ACTIVO trabaja este proveedor" (bombas, ascensores, redes) y sirve para
--  asignarle órdenes de trabajo. La categoría comercial dice "qué clase de
--  negocio es" (restaurante, papelería, consultorio). Un proveedor de
--  ascensores y un restaurante del local 12 no se clasifican con la misma
--  lista, y mezclarlas dejaría el selector de mantenimiento lleno de
--  categorías que no sirven para una orden de trabajo.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre, descripcion) values
  ('CATEGORIA_COMERCIO', 'Categoría de comercio',
   'Qué clase de negocio o servicio ofrece un tercero con perfil visible en el directorio '
   '(EXS-4). Puramente descriptivo: agrupa y filtra, no condiciona visibilidad ni permisos. '
   'Distinto de CATEGORIA_ACTIVO (MANT-0), que clasifica en qué activos trabaja un proveedor.')
on conflict (codigo) do nothing;

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('CATEGORIA_COMERCIO', 'alimentacion', 'Alimentación', 10),
  ('CATEGORIA_COMERCIO', 'tienda', 'Tienda y abarrotes', 20),
  ('CATEGORIA_COMERCIO', 'salud', 'Salud y consultorios', 30),
  ('CATEGORIA_COMERCIO', 'belleza', 'Belleza y cuidado personal', 40),
  ('CATEGORIA_COMERCIO', 'educacion', 'Educación', 50),
  ('CATEGORIA_COMERCIO', 'profesional', 'Servicios profesionales', 60),
  ('CATEGORIA_COMERCIO', 'tecnico', 'Servicios técnicos', 70),
  ('CATEGORIA_COMERCIO', 'mantenimiento', 'Mantenimiento y reparaciones', 80),
  ('CATEGORIA_COMERCIO', 'transporte', 'Transporte', 90),
  ('CATEGORIA_COMERCIO', 'mascotas', 'Mascotas', 100),
  ('CATEGORIA_COMERCIO', 'otros', 'Otros', 110);
