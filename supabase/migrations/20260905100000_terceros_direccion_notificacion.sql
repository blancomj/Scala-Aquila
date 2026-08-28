-- ═══════════════════════════════════════════════════════════════════════
--  GAP-CAR-012 — el canal físico de cobranza no podía producir una guía
--  postal despachable (CAR_00_Guia_Oficial.md §4.4, §34.2).
--
--  Lo que YA existía y no se toca: terceros.direccion (20260821100000, la
--  generalización desde `propietarios`). El gap detectado al implementar
--  resolverDestinatarios() era más acotado de lo que pareció al principio:
--
--    (a) Ningún operador postal admite una guía sin municipio de destino,
--        y el municipio no estaba en ninguna parte de `terceros`.
--    (b) No había forma de saber si esa dirección fue verificada alguna
--        vez. Una notificación despachada a una dirección que nadie
--        confirmó es lo primero que ataca la defensa en un ejecutivo —
--        y es exactamente la alerta que el diseño de la ficha del
--        expediente ya anticipaba ("la dirección registrada no tiene
--        confirmación").
--
--  Deliberadamente NO se crea una `direccion_notificacion` separada de
--  `direccion`: serían dos verdades sobre el mismo hecho, y la segunda
--  quedaría desactualizada. Se enriquece la que existe.
--
--  Sin constraint que exija municipio cuando hay dirección: rompería las
--  filas actuales, que tienen dirección sin municipio y son válidas para
--  todo lo demás. Quien lo exige es resolverDestinatarios(), que devuelve
--  `contacto_faltante` en vez de despachar a ciegas — mismo criterio que
--  la suma de porcentajes de inmueble_persona_rol (20260820100000 §4.2).
-- ═══════════════════════════════════════════════════════════════════════

--  `municipio` es texto y no FK a un catalogo: el tipo MUNICIPIO no existe
--  en lista_tipos y sembrar los ~1.100 municipios del DANE es un trabajo
--  con su propia decision (normalizacion, codigo DANE, actualizacion).
--  Referenciar un catalogo vacio seria inventar un prerrequisito que nadie
--  pidio; el operador postal necesita el nombre, no un id.
alter table public.terceros
  add column municipio               text,
  add column direccion_verificada_at timestamptz,
  add column direccion_verificada_por uuid references public.profiles (id);

-- La verificación es un hecho con autor y fecha, no un booleano: "quién
-- dijo que esta dirección sirve, y cuándo" es la pregunta que hay que
-- poder responder. Las dos columnas viajan juntas o no viajan.
alter table public.terceros
  add constraint terceros_verificacion_direccion_completa check (
    (direccion_verificada_at is null and direccion_verificada_por is null)
    or (direccion_verificada_at is not null and direccion_verificada_por is not null)
  );

comment on column public.terceros.municipio is
  'Municipio de la direccion, texto libre. Requisito del operador postal para '
  'despachar una guia rastreable: sin el, resolverDestinatarios() rechaza el canal '
  'fisico (GAP-CAR-012, CAR §34.2). Normalizar contra el catalogo DANE queda como '
  'decision aparte — no se referencia un catalogo que todavia no existe.';

comment on column public.terceros.direccion_verificada_at is
  'Momento en que se constato que la direccion es real y corresponde al tercero. '
  'NULL = nunca verificada: se puede despachar, pero la accion queda marcada como '
  'notificacion a direccion no verificada y eso debilita su valor probatorio '
  '(CAR §34.2).';

comment on column public.terceros.direccion_verificada_por is
  'Quien verifico la direccion. Va siempre acompanado de direccion_verificada_at '
  '(constraint terceros_verificacion_direccion_completa).';
