-- ═══════════════════════════════════════════════════════════════════════
--  MANT-4 · Incidencias y órdenes de trabajo (9/9)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_04_incidencias_ordenes_trabajo.md §3.4
--
--  mant_ot_evidencias.documento_id exige una fila de `documentos` (la librería general), y
--  subir-documento (Edge Function) exige un tipo_documento_id de la familia TIPO_DOCUMENTO —
--  ningún código existente (personeria_juridica, comprobante_pago, soporte_movimiento_fondo...)
--  sirve para "foto/firma de una OT". Se añade uno propio, mismo criterio que cada corte anterior
--  que necesitó subir un documento nuevo (D-42, soporte_movimiento_fondo).
--
--  No confundir con EVIDENCIA_OT_TIPO (20260930950000): esa familia clasifica QUÉ representa el
--  archivo dentro de la OT (foto_antes/foto_despues/firma/otro); esta clasifica el documento en
--  la librería general, junto con el resto de tipos de documento del tenant.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_DOCUMENTO', 'evidencia_ot', 'Evidencia de orden de trabajo', 18)
on conflict (tipo, codigo, tenant_id) do nothing;
