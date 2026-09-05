-- ═══════════════════════════════════════════════════════════════════════
--  Mismo bug que 20260823250000, sin retrofit: recibos_caja
--  (20260903160000, posterior a ese fix) se creó con el `forbid_mutation()`
--  plano en vez de `forbid_mutation_salvo_tenant_borrado()` — su
--  `tenant_id ... on delete cascade` (20260903160000_recibos_caja.sql:54)
--  hace que `DELETE FROM tenants` falle con
--  "APPEND_ONLY: recibos_caja no admite DELETE (SEC-14)" en cuanto el
--  tenant tiene al menos un pago real (todo pago real emite un recibo vía
--  trg_emitir_recibo_caja) — un tenant así no puede volver a borrarse.
--
--  Fix: mismo patrón exacto que 20260823250000 — reusar
--  forbid_mutation_salvo_tenant_borrado() (deja pasar únicamente el DELETE
--  que la FK dispara al borrar el tenant dueño; UPDATE sigue prohibido
--  siempre). No hace falta una función nueva, la compartida ya cubre este
--  caso.
-- ═══════════════════════════════════════════════════════════════════════

drop trigger recibos_caja_append_only on public.recibos_caja;

create trigger recibos_caja_append_only
  before update or delete on public.recibos_caja
  for each row execute function public.forbid_mutation_salvo_tenant_borrado();
