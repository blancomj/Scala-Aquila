-- ═══════════════════════════════════════════════════════════════════════
--  MANT-10 · Reservas de zonas comunes (5/5) — cargos.reserva_id
--
--  cargos_origen_unico (20260830650000) enumera exhaustivamente, por
--  origen_tipo, cuál columna de respaldo debe estar poblada — no conocía
--  'reserva' (agregado en 20260932710000). Se agrega reserva_id, la
--  columna de respaldo propia de este origen, y se extiende el CHECK con
--  esa cuarta rama — mismo patrón que siguió 'descuento' al agregarse.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.cargos add column reserva_id uuid references public.mant_reservas (id);

create index cargos_reserva_idx on public.cargos (reserva_id) where reserva_id is not null;

alter table public.cargos drop constraint cargos_origen_unico;
alter table public.cargos
  add constraint cargos_origen_unico check (
    (origen_tipo = 'liquidacion_linea' and liquidacion_linea_id is not null and novedad_id is null and cargo_capital_origen_id is null and reserva_id is null)
    or (origen_tipo = 'novedad' and novedad_id is not null and liquidacion_linea_id is null and cargo_capital_origen_id is null and reserva_id is null)
    or (origen_tipo = 'interes' and cargo_capital_origen_id is not null and liquidacion_linea_id is null and novedad_id is null and reserva_id is null)
    or (origen_tipo = 'descuento' and cargo_capital_origen_id is not null and liquidacion_linea_id is null and novedad_id is null and reserva_id is null)
    or (origen_tipo = 'reserva' and reserva_id is not null and liquidacion_linea_id is null and novedad_id is null and cargo_capital_origen_id is null)
  );

comment on column public.cargos.reserva_id is
  'MANT-10: la reserva de zona común que originó este cargo (fn_reserva_aprobar). Columna de '
  'respaldo de origen_tipo=reserva, exigida por cargos_origen_unico.';
