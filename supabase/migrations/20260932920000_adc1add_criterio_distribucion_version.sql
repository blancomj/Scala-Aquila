-- ADC-01-ADD (§14 / §28 auditoría): concepto_versiones ya versiona todo campo
-- editable de un concepto (nombre, modo_calculo, alcance, alcance_condiciones,
-- etc.) salvo criterio_distribucion, agregado en 20260932900000 después de
-- que esta tabla existiera. Sin esto, cambiar el criterio de distribución de
-- un concepto no quedaría en el historial de versiones.
alter table public.concepto_versiones
  add column criterio_distribucion public.concepto_criterio_distribucion_t not null default 'coeficiente';

comment on column public.concepto_versiones.criterio_distribucion is
  'ADC-01-ADD: copia de conceptos.criterio_distribucion al momento de esta versión, ver comentario en esa columna.';
