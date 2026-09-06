-- ═══════════════════════════════════════════════════════════════════════
--  MANT-5 · Proveedores, contratos y garantías (1/9)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_05_proveedores_contratos_garantias.md
--
--  Este archivo: vocabulario puro (D-24) — familias TIPO_HABILITACION,
--  TIPO_CONTRATO, PERIODICIDAD_CONTRATO, ESTADO_COMERCIAL_PROVEEDOR,
--  RESULTADO_RECLAMACION_GARANTIA — más los códigos TIPO_DOCUMENTO que
--  necesitan las tablas de este corte para adjuntar soporte.
--
--  §4.1 del corte es explícito: terceros + tenant_tercero_rol YA EXISTEN,
--  con 'proveedor'/'contratista' ya sembrados en PERSONA_COPROPIEDAD
--  (20260830480000) — verificado, cero tablas de proveedor nuevas.
-- ═══════════════════════════════════════════════════════════════════════

-- ── TIPO_HABILITACION — qué puede exigirse a un contratista (§4.1) ───────
insert into public.tipos (codigo, nombre, descripcion) values
  ('TIPO_HABILITACION', 'Tipo de habilitación',
   'Documento o certificación que acredita a un contratista/proveedor (MANT-5 §4.1) — '
   'puramente descriptivo; el guard de asignación de OT solo mira si existe una fila vigente '
   'de este tipo, nunca ramifica por cuál código sea.')
on conflict (codigo) do nothing;

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_HABILITACION', 'camara_comercio', 'Cámara de comercio', 10),
  ('TIPO_HABILITACION', 'rut', 'RUT', 20),
  ('TIPO_HABILITACION', 'seguridad_social', 'Seguridad social', 30),
  ('TIPO_HABILITACION', 'arl', 'ARL', 40),
  ('TIPO_HABILITACION', 'poliza_responsabilidad_civil', 'Póliza de responsabilidad civil', 50),
  ('TIPO_HABILITACION', 'poliza_cumplimiento', 'Póliza de cumplimiento', 60),
  ('TIPO_HABILITACION', 'certificacion_alturas', 'Certificación de trabajo en alturas', 70),
  ('TIPO_HABILITACION', 'acreditacion_onac', 'Acreditación ONAC', 80),
  ('TIPO_HABILITACION', 'certificacion_fabricante', 'Certificación del fabricante', 90);

-- ── TIPO_CONTRATO — vocabulario, sembrado con tipos comunes (§4.3) ───────
insert into public.tipos (codigo, nombre, descripcion) values
  ('TIPO_CONTRATO', 'Tipo de contrato',
   'Naturaleza del contrato con un tercero (MANT-5 §4.3) — puramente descriptivo, sin ningún '
   'guard que dependa de cuál sea.')
on conflict (codigo) do nothing;

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_CONTRATO', 'mantenimiento_preventivo', 'Mantenimiento preventivo', 10),
  ('TIPO_CONTRATO', 'obra_civil', 'Obra civil', 20),
  ('TIPO_CONTRATO', 'prestacion_servicios', 'Prestación de servicios', 30),
  ('TIPO_CONTRATO', 'suministro', 'Suministro', 40),
  ('TIPO_CONTRATO', 'vigilancia', 'Vigilancia', 50),
  ('TIPO_CONTRATO', 'aseo', 'Aseo', 60),
  ('TIPO_CONTRATO', 'otro', 'Otro', 70);

-- ── PERIODICIDAD_CONTRATO — vocabulario (§4.3) ───────────────────────────
insert into public.tipos (codigo, nombre, descripcion) values
  ('PERIODICIDAD_CONTRATO', 'Periodicidad de contrato',
   'Cada cuánto se paga el valor periódico de un contrato (MANT-5 §4.3) — puramente '
   'descriptivo.')
on conflict (codigo) do nothing;

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('PERIODICIDAD_CONTRATO', 'mensual', 'Mensual', 10),
  ('PERIODICIDAD_CONTRATO', 'bimestral', 'Bimestral', 20),
  ('PERIODICIDAD_CONTRATO', 'trimestral', 'Trimestral', 30),
  ('PERIODICIDAD_CONTRATO', 'semestral', 'Semestral', 40),
  ('PERIODICIDAD_CONTRATO', 'anual', 'Anual', 50),
  ('PERIODICIDAD_CONTRATO', 'unica', 'Pago único', 60);

-- ── ESTADO_COMERCIAL_PROVEEDOR — distinto de ESTADO_TERCERO (§4.1) ───────
-- ESTADO_TERCERO (activo/inactivo, 20260821100000) ya dice si el tercero está activo en el
-- sistema. Esto es otra cosa: la relación comercial de la copropiedad con ese proveedor
-- (preferido, en evaluación, no recomendado...) — no se reutiliza porque el significado no es
-- el mismo, aunque comparta un valor 'activo'/'inactivo' en la superficie.
insert into public.tipos (codigo, nombre, descripcion) values
  ('ESTADO_COMERCIAL_PROVEEDOR', 'Estado comercial de proveedor',
   'Relación comercial de la copropiedad con el proveedor (MANT-5 §4.1) — puramente '
   'descriptivo, distinto de ESTADO_TERCERO (que dice si el tercero está activo en el sistema).')
on conflict (codigo) do nothing;

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('ESTADO_COMERCIAL_PROVEEDOR', 'nuevo', 'Nuevo', 10),
  ('ESTADO_COMERCIAL_PROVEEDOR', 'activo', 'Activo', 20),
  ('ESTADO_COMERCIAL_PROVEEDOR', 'preferido', 'Preferido', 30),
  ('ESTADO_COMERCIAL_PROVEEDOR', 'en_evaluacion', 'En evaluación', 40),
  ('ESTADO_COMERCIAL_PROVEEDOR', 'no_recomendado', 'No recomendado', 50),
  ('ESTADO_COMERCIAL_PROVEEDOR', 'inactivo', 'Inactivo', 60);

-- ── RESULTADO_RECLAMACION_GARANTIA — vocabulario (§4.5) ──────────────────
insert into public.tipos (codigo, nombre, descripcion) values
  ('RESULTADO_RECLAMACION_GARANTIA', 'Resultado de reclamación de garantía',
   'Estado de una reclamación de garantía sobre un activo (MANT-5 §4.5) — puramente '
   'descriptivo.')
on conflict (codigo) do nothing;

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('RESULTADO_RECLAMACION_GARANTIA', 'pendiente', 'Pendiente', 10),
  ('RESULTADO_RECLAMACION_GARANTIA', 'aceptada', 'Aceptada', 20),
  ('RESULTADO_RECLAMACION_GARANTIA', 'rechazada', 'Rechazada', 30),
  ('RESULTADO_RECLAMACION_GARANTIA', 'parcial', 'Aceptada parcialmente', 40);

-- ── TIPO_DOCUMENTO — soporte de habilitación/contrato/garantía ──────────
-- Mismo criterio que D-56 (evidencia_ot): ningún código existente describe estos tres nuevos
-- tipos de soporte documental.
insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_DOCUMENTO', 'habilitacion_proveedor', 'Habilitación de proveedor', 19),
  ('TIPO_DOCUMENTO', 'contrato_servicio', 'Contrato de servicio', 20),
  ('TIPO_DOCUMENTO', 'garantia', 'Garantía', 21)
on conflict (tipo, codigo, tenant_id) do nothing;
