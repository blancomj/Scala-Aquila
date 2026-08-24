-- ═══════════════════════════════════════════════════════════════════════
--  PC-4b · Purga de los movimientos de ejecución anteriores a PC-4
--
--  PC-4 introdujo `liquidacion` (de dónde salió el dinero) y la exige en
--  todo registro nuevo, pero dejó sin ella los movimientos ya capturados.
--  Esos movimientos no se pueden exportar —tendrían débito y ningún
--  crédito— y mantenían contable_parametrizacion_pendiente() permanentemente
--  en rojo, ocultando cualquier pendiente REAL que apareciera después.
--
--  Se borran, por decisión explícita del propietario del producto: son
--  datos de relleno de desarrollo, no historia contable de una copropiedad
--  real. La alternativa —asignarles una contrapartida— habría sido inventar
--  datos contables, que es peor.
--
--  ═══ EXCEPCIÓN AL APPEND-ONLY: leer antes de replicar este patrón ═══
--
--  presupuesto_ejecucion es append-only por diseño (16 §68): corregir es
--  insertar una reversión, nunca borrar. Esta migración deshabilita ese
--  trigger durante una sola sentencia. Es admisible aquí y NO debe tomarse
--  como precedente, por tres razones:
--
--    1. El filtro `liquidacion is null` es autolimitado: desde PC-4 el
--       guard rechaza cualquier INSERT sin liquidación, así que la
--       condición solo puede ser cierta para filas anteriores a PC-4. Esta
--       migración no puede alcanzar ningún movimiento futuro.
--    2. Son movimientos que el sistema ya no considera válidos: no existe
--       forma de exportarlos ni de repararlos por la vía normal.
--    3. Ninguna reversión posterior los referencia (verificado: 0 filas con
--       ajusta_movimiento_id apuntando a uno de ellos), así que el borrado
--       no deja huérfanos.
--
--  ⚠ Al desplegar a producción, revisar primero si existen filas con
--    liquidacion is null que SÍ sean historia real. Si las hubiera, la vía
--    correcta es completarlas, no purgarlas.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_borradas integer;
begin
  alter table public.presupuesto_ejecucion disable trigger presupuesto_ejecucion_append_only;

  delete from public.presupuesto_ejecucion where liquidacion is null;
  get diagnostics v_borradas = row_count;

  alter table public.presupuesto_ejecucion enable trigger presupuesto_ejecucion_append_only;

  raise notice 'PC-4b: % movimientos sin contrapartida purgados', v_borradas;
end $$;

-- A partir de aquí la columna puede exigirse en el esquema, no solo en el guard: ya no queda
-- ninguna fila que la incumpla. Es la garantía más fuerte disponible —una restricción de tabla
-- no depende de que el trigger siga instalado ni de que nadie lo deshabilite.
alter table public.presupuesto_ejecucion
  alter column liquidacion set not null;

comment on column public.presupuesto_ejecucion.liquidacion is
  'De dónde salió el dinero (PC-4, PRE-02). Determina la contrapartida del asiento: banco, caja '
  'o cuenta por pagar. NOT NULL desde PC-4b, una vez purgados los movimientos anteriores que no '
  'la tenían — sin contrapartida el movimiento no es exportable.';
