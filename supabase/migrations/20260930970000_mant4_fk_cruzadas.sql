-- ═══════════════════════════════════════════════════════════════════════
--  MANT-4 · Incidencias y órdenes de trabajo (9/9)
--
--  FK que no se pudieron declarar en el CREATE TABLE original por
--  dependencia circular (mant_incidencias <-> mant_ordenes_trabajo) o
--  porque la tabla referenciada no existía todavía en el corte anterior
--  (mant_programaciones.orden_trabajo_id, MANT-3).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.mant_incidencias
  add constraint mant_incidencias_orden_trabajo_fk
  foreign key (orden_trabajo_id) references public.mant_ordenes_trabajo (id);

alter table public.mant_ordenes_trabajo
  add constraint mant_ordenes_trabajo_incidencia_fk
  foreign key (incidencia_id) references public.mant_incidencias (id);

alter table public.mant_programaciones
  add constraint mant_programaciones_orden_trabajo_fk
  foreign key (orden_trabajo_id) references public.mant_ordenes_trabajo (id);

comment on column public.mant_programaciones.orden_trabajo_id is
  'MANT-3: se puebla al cerrar la OT que la generó (fn_mant_cerrar_ot, MANT-4). FK agregada '
  'aquí — mant_ordenes_trabajo no existía cuando se creó esta columna (20260930850000).';
