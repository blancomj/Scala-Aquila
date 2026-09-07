-- ═══════════════════════════════════════════════════════════════════════
--  FIN-2 · Factura de proveedor y retenciones aplicadas (1/7)
--  Casos de uso/Tres Modulos/Financiero/FIN_02_factura_proveedor.md
--
--  Este archivo: vocabulario puro (D-24) — factura_estado_t es el único
--  enum nativo del corte (gobierna transiciones reales, ver comment on
--  type más abajo); todo lo demás es lista_tipos.
--
--  Confirmado con el usuario (Plan del corte): la integración contable de
--  la factura se resuelve extendiendo contable_hechos()/
--  fn_contabilizar_periodo() de CO-3 (no una función paralela que CO-3
--  desconozca) — ver 20260931170000. Esto exige una cuenta contable
--  predeterminada nueva para el IVA descontable, que se añade aquí como
--  un valor más de EVENTO_CONTABLE (familia ya existente, 20260830460000)
--  — mismo mecanismo que PROVEEDOR_SERVICIOS/BANCO_RECAUDO, sin tabla
--  nueva ni lógica nueva de resolución.
-- ═══════════════════════════════════════════════════════════════════════

-- ── factura_estado_t — gobierna qué se puede pagar y qué transiciones son válidas (D-24) ──
create type public.factura_estado_t as enum (
  'borrador', 'registrada', 'en_revision', 'en_disputa',
  'aprobada', 'programada', 'pagada_parcial', 'pagada', 'anulada'
);

comment on type public.factura_estado_t is
  'FIN-2 §3.1: gobierna qué transición es válida y qué puede pagarse. borrador→registrada→'
  'en_revision→aprobada→programada→pagada_parcial→pagada; en_revision↔en_disputa; cualquiera '
  'salvo pagada→anulada. "pagada" es terminal e inmutable en sus campos sustantivos '
  '(FACTURA_PAGADA_INMUTABLE).';

-- ── EVENTO_CONTABLE: cuenta predeterminada para el IVA descontable de una factura ──────────
-- Sin esta fila, contable_hechos() (20260931170000) reporta la línea de IVA descontable como
-- 'sin_contrapartida' hasta que el tenant configure contable_cuenta_default para este evento —
-- mismo comportamiento que cualquier otro evento sin configurar, no un caso especial.
insert into public.lista_tipos (tipo, codigo, nombre, descripcion, orden) values
  ('EVENTO_CONTABLE', 'IVA_DESCONTABLE', 'IVA descontable',
   'Débito del IVA descontable de una factura de proveedor (FIN-2 §3.3)', 200);

-- ── TIPO_DOCUMENTO: el soporte de la factura recibida (documento_soporte_id) ───────────────
-- Mismo criterio que D-56 (evidencia_ot) y MANT-5 (habilitacion_proveedor/contrato_servicio/
-- garantia): ningún código existente describe "la factura recibida del proveedor".
insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_DOCUMENTO', 'factura_proveedor', 'Factura de proveedor', 22)
on conflict (tipo, codigo, tenant_id) do nothing;
