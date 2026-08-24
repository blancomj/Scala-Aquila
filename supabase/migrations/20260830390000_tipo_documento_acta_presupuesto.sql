-- ═══════════════════════════════════════════════════════════════════════
--  TIPO_DOCUMENTO.acta_presupuesto
--
--  Cierra el hallazgo de la investigación externa (Ley 675/2001 + software
--  del sector): el presupuesto lo aprueba la asamblea y esa aprobación
--  debe quedar respaldada por el acta correspondiente (art. 47 — firmada
--  por presidente y secretario). presupuestos.fecha_aprobacion/
--  vigente_desde/acta_asamblea existían desde el inicio pero ningún flujo
--  los capturaba — se cierran junto con "Activar presupuesto"
--  (stores/presupuesto.ts), que es el instante real en que el presupuesto
--  pasa de borrador a vigente.
--
--  El acta en sí se sube como documento de la copropiedad (documentos,
--  inmueble_id null — mismo mecanismo que CopropiedadDocumentos.vue), no
--  como texto libre: los aplicativos maduros del sector (AppFolio,
--  Enumerate) tratan el acta como documento adjunto con trazabilidad, no
--  como campo de texto.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_DOCUMENTO', 'acta_presupuesto', 'Acta de presupuesto', 16);
