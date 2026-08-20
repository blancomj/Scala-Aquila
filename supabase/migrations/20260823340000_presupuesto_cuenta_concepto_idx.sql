-- Advisor de performance (get_advisors): FK presupuesto_cuenta.concepto_id sin índice —
-- presupuesto_cuenta_ejecucion() la usa en el JOIN automático (cargos.concepto_id = c.concepto_id)
-- en cada consulta de la pestaña Ejecución presupuestal. ajusta_movimiento_id y registrado_por
-- (mismo advisor) se dejan sin índice a propósito: son columnas de auditoría/trazabilidad de
-- bajo tráfico, mismo criterio que fondo_movimientos.autorizado_por y pagos.registrado_por
-- (tampoco indexadas en todo el proyecto) — el lookup real de una reversión es por id (PK, ya
-- indexado), no por ajusta_movimiento_id.
create index presupuesto_cuenta_concepto_idx on public.presupuesto_cuenta (concepto_id)
  where concepto_id is not null;
