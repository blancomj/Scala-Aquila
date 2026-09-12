-- ═══════════════════════════════════════════════════════════════════════
--  EXS-6 · Marketplace — qué significa de verdad el CASCADE de las fotos
--
--  Hallazgo al probar en navegador: borrar una publicación con fotos falla
--  con `APPEND_ONLY: documentos no admite DELETE (SEC-14)`. El
--  `on delete cascade` de `documentos.publicacion_id` intenta borrar filas
--  de una tabla append-only, y el trigger lo impide.
--
--  NO es un defecto que haya que corregir cambiando la FK, y conviene
--  dejarlo escrito para que nadie "arregle" lo que funciona:
--
--  · `forbid_mutation_salvo_tenant_borrado` deja pasar el DELETE
--    exactamente cuando el tenant dueño ya no existe (20260823250000). Es
--    decir: al borrar un tenant, la cascada SÍ funciona — que es el único
--    borrado real que este sistema ejecuta.
--  · Una publicación no se borra nunca: `publicaciones` no tiene policy
--    DELETE. Se cierra, porque lo que se publicó en el tablón es historia.
--
--  Así que el CASCADE describe con precisión el único caso en que se
--  ejerce. Lo mismo vale para `documentos.anuncio_id` (EXS-3), que tiene la
--  misma forma. Lo que cambia aquí es solo el comentario: que la garantía
--  quede explicada en la columna y no haya que redescubrirla probando.
-- ═══════════════════════════════════════════════════════════════════════

comment on column public.documentos.publicacion_id is
  'EXS-6 — foto de un aviso del marketplace. Sigue el patrón de columna FK por dominio de esta '
  'tabla; no se creó una tabla de media propia. El `on delete cascade` solo llega a ejercerse al '
  'borrar el tenant dueño: documentos es append-only (SEC-14) y su trigger rechaza cualquier otro '
  'DELETE, y una publicación no se borra nunca —se cierra—. A diferencia del resto de alcances, '
  'una publicación tiene VARIAS fotos, así que subir-documento NO las versiona entre sí: cada foto '
  'es un documento propio, no la corrección de la anterior.';
