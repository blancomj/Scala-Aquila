-- ═══════════════════════════════════════════════════════════════════════
--  Estado de cuenta: HTML autocontenido + link firmado, no PDF externo
--  Propietario: seguimiento de 20260822100000_estados_cuenta_generados.sql
--
--  Decisión revisada (conversación de diseño): en vez de un servicio
--  externo (PDFShift) que rasteriza HTML→PDF, se archiva el HTML
--  autocontenido tal cual y se envía por correo como link firmado
--  (90 días) — nunca como adjunto .html, que muchos proveedores de correo
--  bloquean por riesgo de phishing. El HTML mismo trae un botón
--  "Imprimir / Descargar PDF" (window.print(), 100% cliente) para quien
--  quiera el PDF real. Elimina la dependencia externa por completo.
--
--  El bucket solo aceptaba application/pdf — se amplía a text/html. No se
--  quita application/pdf: no hace daño dejarlo, por si en el futuro se
--  retoma la generación server-side de PDF con otro criterio.
-- ═══════════════════════════════════════════════════════════════════════

update storage.buckets
set allowed_mime_types = array['application/pdf', 'text/html']
where id = 'estados-cuenta';
