-- ═══════════════════════════════════════════════════════════════════════
--  F5 · Corrige liquidacion_lineas.liquidacion_id: CASCADE → RESTRICT
--
--  Bug real detectado al probar la limpieza de fixtures de test: borrar una
--  fila de `liquidaciones` con ON DELETE CASCADE dispara un DELETE interno
--  sobre `liquidacion_lineas`, que el trigger append-only
--  (liquidacion_lineas_append_only) rechaza — el CASCADE nunca puede
--  completarse. Es, además, la semántica correcta: si `liquidaciones` es
--  inmutable (20 §69 RESULT IMMUTABILITY) y `liquidacion_lineas` es
--  append-only, ninguna de las dos debería poder desaparecer por CASCADE.
--  RESTRICT lo hace explícito: una liquidación con líneas queda
--  permanentemente protegida de DELETE, por diseño.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.liquidacion_lineas
  drop constraint liquidacion_lineas_liquidacion_id_fkey,
  add constraint liquidacion_lineas_liquidacion_id_fkey
    foreign key (liquidacion_id) references public.liquidaciones (id) on delete restrict;
