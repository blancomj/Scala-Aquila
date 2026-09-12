-- ═══════════════════════════════════════════════════════════════════════
--  EXS-6 · Marketplace — default de `origen`
--
--  `origen` lo decide el servidor: el guard lo sella a partir del rol real
--  de quien inserta, y precisamente por eso el cliente no debe estar
--  obligado a enviarlo. Sin default, el tipo generado lo marcaba requerido
--  y cada insert tenía que mandar un valor que el guard iba a sobrescribir
--  de todos modos — un campo ceremonial, de los que acaban copiándose mal.
--
--  El default es 'auxiliar' y no 'residente' a propósito: es el escalón MÁS
--  estricto de la escalera (exige administrador para aprobar). Una fila
--  creada fuera de banda que no declare su origen debe quedar en el camino
--  que pide más control, nunca en el que pide menos.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.publicaciones
  alter column origen set default 'auxiliar'::public.publicacion_origen_t;

comment on column public.publicaciones.origen is
  'Quién originó la publicación, sellado por el guard al crearla a partir del rol REAL de quien '
  'inserta — el cliente no lo controla. Gobierna quién puede aprobarla. El default ''auxiliar'' es '
  'el escalón más estricto: lo creado fuera de banda sin declarar origen exige administrador.';
