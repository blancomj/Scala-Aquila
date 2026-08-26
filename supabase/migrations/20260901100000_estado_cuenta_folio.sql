-- ═══════════════════════════════════════════════════════════════════════════
--  Estado de cuenta — folio consecutivo de autenticidad (D-27)
--  Propietario: Docs/evaluacion/13-evaluacion-estado-de-cuenta.md §B/§I
--
--  Cada estado de cuenta emitido recibe un folio legible e irrepetible que se
--  imprime en el documento (papel incluido) y sirve como clave pública de
--  verificación: con el folio + el hash SHA-256 del contenido, cualquier
--  tercero (consejo, revisor fiscal, juez en un proceso monitorio del art.
--  54 de la Ley 675) puede confirmar que el documento que tiene en la mano es
--  exactamente el que emitió el sistema.
--
--  El folio vive en su propia columna y NO dentro de `datos`: `datos` es el
--  snapshot inmutable del ledger producido por DOS generadores (TS manual y
--  fn_emitir_estados_cuenta en plpgsql) que deben mantenerse byte-idénticos;
--  tocar ese contrato para los dos productores a la vez es un riesgo
--  innecesario. El folio lo asigna la base al INSERT, sin importar quién
--  inserte.
--
--  La deduplicación de envíos de correo NO usa una columna `notificado_en`
--  (rompería el carácter append-only de la tabla): se registra cada envío en
--  audit_log ('estado_cuenta.enviado', entity_id = id del estado) y la
--  consulta de pendientes/duplicados lee ese rastro. Ver D-28.
-- ═══════════════════════════════════════════════════════════════════════════

create sequence public.estados_cuenta_folio_seq start 1;

alter table public.estados_cuenta_generados
  add column folio text;

-- Único: dos emisiones jamás comparten folio — es la identidad pública del
-- documento. NULL permitido transitoriamente solo durante este backfill.
alter table public.estados_cuenta_generados
  add constraint estados_cuenta_generados_folio_unica unique (folio);

-- Los registros previos a esta migración conservan su id como referencia
-- (no se re-folian históricos: un documento ya entregado no cambia).
comment on column public.estados_cuenta_generados.folio is
  'Folio público de autenticidad (EDC-YYYYMM-NNNNNN), asignado por default de BD al INSERT. '
  'Se imprime en el documento junto al hash SHA-256 del contenido; verificación contra '
  'Docs/evaluacion/13 §B. Los anteriores a esta migración quedan sin folio a propósito: '
  're-foliar documentos ya entregados rompería su trazabilidad.';

alter table public.estados_cuenta_generados
  alter column folio set default
    'EDC-' || to_char(now(), 'YYYYMM') || '-' ||
    lpad(nextval('public.estados_cuenta_folio_seq')::text, 6, '0');
