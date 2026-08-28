-- ═══════════════════════════════════════════════════════════════════════
--  BUG DE MULTI-TENANCY — el folio del recibo de caja era único GLOBALMENTE
--  pero el consecutivo que lo genera es POR COPROPIEDAD.
--
--  20260903160000 (RC-3) definió:
--      constraint recibos_caja_folio_unica unique (folio)
--  mientras el folio sale de
--      fn_siguiente_consecutivo(tenant_id, 'recibo_caja')
--  que numera por (tenant, tipo_documento) — cada copropiedad arranca en
--  RC000001. Es decir: la SEGUNDA copropiedad del sistema que emitiera un
--  recibo chocaba contra el RC000001 de la primera y la emisión fallaba con
--  "duplicate key value violates unique constraint recibos_caja_folio_unica".
--
--  Como fn_emitir_recibo_caja corre dentro de la transacción que registra el
--  pago, el fallo no era cosmético: tumbaba el registro del pago entero. Un
--  cliente nuevo no habría podido recaudar.
--
--  Estaba latente porque en desarrollo solo una copropiedad (Los Lareles)
--  había emitido recibos. Se detectó 2026-08-27 construyendo los tests de
--  intenciones de pago (fase 2), que crean tenants nuevos y emiten recibos en
--  cada corrida — el segundo tenant reventó de inmediato.
--
--  Corrección: la unicidad es (tenant_id, folio). RC000001 de Los Lareles y
--  RC000001 de otro conjunto son documentos distintos y ambos legítimos —
--  eso es exactamente lo que significa "consecutivo por copropiedad".
--
--  NO afecta a estados_cuenta_generados: su folio sale de una SECUENCIA
--  GLOBAL (estados_cuenta_folio_seq, 20260901100000), así que allí la
--  unicidad global sí es coherente y se deja como está.
--
--  Relajar una restricción única nunca puede fallar por datos existentes.
--  recibos_caja sigue siendo append-only: esto es DDL, no toca ninguna fila.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.recibos_caja
  drop constraint recibos_caja_folio_unica;

alter table public.recibos_caja
  add constraint recibos_caja_folio_unica unique (tenant_id, folio);

comment on constraint recibos_caja_folio_unica on public.recibos_caja is
  'Único POR COPROPIEDAD, no globalmente: el folio lo genera '
  'fn_siguiente_consecutivo(tenant_id, ''recibo_caja''), que numera por tenant — cada '
  'copropiedad tiene su propio RC000001. Con unicidad global (como estaba hasta '
  '20260904140000) la segunda copropiedad del sistema no podía emitir su primer recibo.';
