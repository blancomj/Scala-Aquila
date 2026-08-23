-- ═══════════════════════════════════════════════════════════════════════
--  documentos.descripcion — nota libre opcional sobre el documento
--  Propietario: pestaña Documentos (copropiedad/inmueble), UiLibreriaDocumentos.vue
--
--  Append-only (documentos_append_only sigue bloqueando UPDATE/DELETE):
--  la descripción se fija al subir el documento, igual que nombre_archivo o
--  fecha_vencimiento — "corregirla" es subir una nueva versión, no editar
--  la fila existente.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.documentos add column descripcion text;

comment on column public.documentos.descripcion is
  'Nota libre opcional capturada al subir el documento — append-only como el resto de la fila, '
  'no editable después (subir nueva versión en su lugar).';
