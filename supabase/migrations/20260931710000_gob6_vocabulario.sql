-- ═══════════════════════════════════════════════════════════════════════
--  GOB-6 · Convivencia y régimen sancionatorio — vocabulario
--  Ver GOB_06_convivencia_sanciones.md §4.1-4.3.
--
--  gobierno_expediente_etapa_t gobierna transiciones reales (D-24): es la
--  columna vertebral del debido proceso (marco: "sin ella habría instinto
--  correcto pero cero modelo"). gobierno_expediente_calidad_t gobierna qué
--  función de GOB-0 resuelve al infractor (fn_tenedores_vigentes vs
--  fn_propietario_responsable vs ninguna para 'tercero').
--
--  Los fundamentos legales de este corte (Ley 675 art. 58, 59, 60) YA están
--  registrados: art. 58 por GOB-1 ('ley675_2001_art58_gob1'), art. 59 por
--  GOB-0 con el contenido REAL del régimen sancionatorio
--  ('ley675_2001_art59_gob0_tenedores' — nota: existe también una fila
--  'ley675_2001_art59' de otro módulo con contenido que NO corresponde al
--  art. 59 real, ya documentada como hallazgo ajeno en GOB_00_INFORME.md;
--  no se toca aquí), art. 60 por GOB-1 ('ley675_2001_art60_gob1'). Cero
--  inserts nuevos de fundamento legal en todo este corte.
-- ═══════════════════════════════════════════════════════════════════════

create type public.gobierno_expediente_etapa_t as enum (
  'reportado', 'conciliacion_comite', 'requerimiento_escrito', 'descargos',
  'decision_organo', 'sancion_impuesta', 'archivado', 'impugnacion', 'firme'
);

comment on type public.gobierno_expediente_etapa_t is
  'D-24: FSM del expediente de convivencia — la columna vertebral del debido proceso (marco §2).
  reportado→conciliacion_comite es opcional (el comité concilia, NUNCA sanciona, art. 58 par. 2,
  ya bloqueado en GOB-1). sancion_impuesta exige haber pasado por requerimiento_escrito Y
  descargos (SANCION_SIN_REQUERIMIENTO_PREVIO/SANCION_SIN_DEBIDO_PROCESO), verificado por
  gobierno_imponer_sancion() contra el historial de gobierno_expediente_actuaciones — la
  transición no se fuerza campo a campo, se exige el hito ya logueado. impugnacion es la etapa de
  GOB-7 (aquí solo se declara el valor); firme es terminal.';

create type public.gobierno_expediente_calidad_t as enum ('propietario', 'tenedor', 'tercero');

comment on type public.gobierno_expediente_calidad_t is
  'D-24: gobierna qué función de GOB-0 resuelve al presunto infractor y a quién responde por él
  (art. 59: "propietarios, tenedores o terceros por los que estos deban responder") —
  propietario/tenedor se resuelven contra fn_propietario_responsable()/fn_tenedores_vigentes(),
  tercero (p.ej. un contratista) no tiene propietario_responsable_ref que resolver.';

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_DOCUMENTO', 'soporte_convivencia', 'Soporte de expediente de convivencia', 25);
