-- ═══════════════════════════════════════════════════════════════════════
--  EXS-6 · Marketplace (1/4) — vocabulario
--  Casos de uso/Experiencia y servicios/EXS_06_INFORME.md
--
--  Tres familias descriptivas a lista_tipos (D-24) y dos enums que sí
--  gobiernan reglas duras.
--
--  DECISIÓN DE PRODUCTO QUE ENMARCA TODO EL CORTE (Johnny, 2026-09-12):
--  los vecinos se arreglan por fuera y la copropiedad NO interviene en la
--  transacción; el precio es informativo y el inmueble no participa. De ahí
--  que no haya —ni deba haber— orden, carrito, pago, comisión ni asiento.
--  Esto es un TABLÓN DE ANUNCIOS, no un e-commerce (prompt 05 §3).
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre, descripcion) values
  ('TIPO_PUBLICACION_MARKETPLACE', 'Tipo de publicación',
   'Qué clase de aviso es: venta, compra, regalo, intercambio, servicio o promoción '
   '(EXS-6 §5) — descriptivo. Puede crecer sin tocar código.'),
  ('CATEGORIA_MARKETPLACE', 'Categoría del marketplace',
   'De qué trata el aviso (EXS-6 §6). Familia propia y NO CATEGORIA_COMERCIO: aquella dice qué '
   'clase de negocio es un tercero del directorio, esta de qué trata un aviso puntual. Un '
   'residente que vende una bicicleta no es un negocio de bicicletas.'),
  ('CONDICION_ARTICULO', 'Condición del artículo',
   'Estado físico de lo que se ofrece (EXS-6 §11). Opcional: un servicio o una promoción no '
   'tienen condición, y forzarles una obligaría a inventar el valor "no aplica" para todos.'),
  ('MOTIVO_REPORTE_MARKETPLACE', 'Motivo de reporte',
   'Por qué alguien reporta una publicación (EXS-6 §14) — descriptivo.')
on conflict (codigo) do nothing;

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_PUBLICACION_MARKETPLACE', 'venta', 'Venta', 10),
  ('TIPO_PUBLICACION_MARKETPLACE', 'compra', 'Compra / Busco', 20),
  ('TIPO_PUBLICACION_MARKETPLACE', 'regalo', 'Regalo', 30),
  ('TIPO_PUBLICACION_MARKETPLACE', 'intercambio', 'Intercambio', 40),
  ('TIPO_PUBLICACION_MARKETPLACE', 'servicio', 'Servicio', 50),
  ('TIPO_PUBLICACION_MARKETPLACE', 'promocion', 'Promoción', 60),

  ('CATEGORIA_MARKETPLACE', 'hogar', 'Hogar y muebles', 10),
  ('CATEGORIA_MARKETPLACE', 'electrodomesticos', 'Electrodomésticos', 20),
  ('CATEGORIA_MARKETPLACE', 'tecnologia', 'Tecnología', 30),
  ('CATEGORIA_MARKETPLACE', 'vehiculos', 'Vehículos y accesorios', 40),
  ('CATEGORIA_MARKETPLACE', 'ninos', 'Niños y bebés', 50),
  ('CATEGORIA_MARKETPLACE', 'ropa', 'Ropa y accesorios', 60),
  ('CATEGORIA_MARKETPLACE', 'mascotas', 'Mascotas', 70),
  ('CATEGORIA_MARKETPLACE', 'servicios_hogar', 'Servicios para el hogar', 80),
  ('CATEGORIA_MARKETPLACE', 'clases', 'Clases y tutorías', 90),
  ('CATEGORIA_MARKETPLACE', 'otros', 'Otros', 100),

  ('CONDICION_ARTICULO', 'nuevo', 'Nuevo', 10),
  ('CONDICION_ARTICULO', 'como_nuevo', 'Como nuevo', 20),
  ('CONDICION_ARTICULO', 'usado_excelente', 'Usado — excelente', 30),
  ('CONDICION_ARTICULO', 'usado_bueno', 'Usado — bueno', 40),
  ('CONDICION_ARTICULO', 'usado_aceptable', 'Usado — aceptable', 50),
  ('CONDICION_ARTICULO', 'para_reparar', 'Para reparar', 60),

  ('MOTIVO_REPORTE_MARKETPLACE', 'fraude', 'Posible fraude', 10),
  ('MOTIVO_REPORTE_MARKETPLACE', 'inapropiado', 'Contenido inapropiado', 20),
  ('MOTIVO_REPORTE_MARKETPLACE', 'prohibido', 'Producto o servicio prohibido', 30),
  ('MOTIVO_REPORTE_MARKETPLACE', 'falsa', 'Información falsa', 40),
  ('MOTIVO_REPORTE_MARKETPLACE', 'spam', 'Spam o duplicada', 50),
  ('MOTIVO_REPORTE_MARKETPLACE', 'contacto_abusivo', 'Contacto abusivo', 60),
  ('MOTIVO_REPORTE_MARKETPLACE', 'otro', 'Otro', 70);

-- ── Estados: enums, porque gobiernan reglas duras ─────────────────────

create type public.publicacion_estado_t as enum (
  'borrador',
  'pendiente_aprobacion',
  'publicada',
  'rechazada',
  'pausada',
  'cerrada',
  'expirada'
);

comment on type public.publicacion_estado_t is
  'Ciclo de vida de una publicación del marketplace (EXS-6 §12). Enum y no lista_tipos (D-24) '
  'porque gobierna transiciones reales: guard_publicacion_transicion define la lista cerrada de '
  'pasos legales y quién puede darlos, y solo ''publicada'' entra en el listado visible. '
  '''expirada'' la escribe el barrido de vencimiento, no una persona.';

-- Quién originó la publicación. Se SELLA al crearla y decide quién puede
-- aprobarla — la escalera que cerró Johnny el 2026-09-12:
--
--    residente      → aprueba auxiliar o administrador
--    auxiliar       → aprueba administrador
--    administrador  → nace publicada
--
-- Es un enum y no una consulta viva a la membresía a propósito: el rol de
-- una persona puede cambiar entre que publica y que alguien la revisa, y la
-- regla de aprobación debe ser la que regía cuando se creó, no la de hoy.
create type public.publicacion_origen_t as enum ('residente', 'auxiliar', 'administrador');

comment on type public.publicacion_origen_t is
  'Quién originó una publicación, sellado al crearla. Gobierna la escalera de aprobación de '
  'EXS-6: nadie aprueba lo suyo salvo el administrador, que publica directo. Enum y no lectura '
  'viva de la membresía porque el rol puede cambiar entre la creación y la revisión, y debe '
  'mandar el que regía al crear. ''residente'' queda preparado y NO ejercido: en esta serie los '
  'residentes no tienen login (§0.1 A de la hoja de ruta); llega con la capa externa sin que el '
  'modelo se rehaga.';
