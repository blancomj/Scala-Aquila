-- ═══════════════════════════════════════════════════════════════════════
--  GOB-5 · TIPO_DOCUMENTO.evidencia_compromiso
--
--  gobierno_compromiso_avances.documento_id necesita un tipo de documento
--  para la evidencia que exige COMPROMISO_CUMPLIDO_SIN_EVIDENCIA — mismo
--  criterio que 'evidencia_ot' (MANT-4, 20260931010000): un código nuevo en
--  el catálogo abierto TIPO_DOCUMENTO, no una tabla ni una regla nueva.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_DOCUMENTO', 'evidencia_compromiso', 'Evidencia de compromiso', 24);
