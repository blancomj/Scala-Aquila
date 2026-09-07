-- ═══════════════════════════════════════════════════════════════════════
--  GOB-1 · Órganos de gobierno y sus miembros — vocabulario
--  Ver Casos de uso/Tres Modulos/Gobierno/GOB_01_organos_gobierno.md §4.1, §4.2
--
--  ORGANO_GOBIERNO y ATRIBUCION_ORGANO son vocabulario descriptivo →
--  lista_tipos (D-24), no enum: no gobiernan transiciones de estado, son
--  catálogos de qué tipo de órgano/atribución existe. `atribucion_origen_t`
--  SÍ es enum (comment on type abajo): gobierna qué validación aplica
--  (origen='reglamento' exige reglamento_referencia, origen='ley' exige
--  fundamento_normativo_id) — invariante real, no descripción.
--
--  `ROL_CONCEJO_COPROPIEDAD` (ya sembrada: presidente/vicepresidente/
--  secretario/vocal/suplente) se reutiliza TAL CUAL para los miembros de
--  cualquier órgano, incluido el comité de convivencia — no hace falta
--  ampliarla: un miembro del comité sin cargo de dirección es 'vocal'
--  (Ley 675 art. 58 par. 1 no exige presidente/secretario para el comité,
--  solo "un número impar de tres o más personas"). Se cumple el criterio
--  de aceptación #3 del corte ("se reutilizó ROL_CONCEJO_COPROPIEDAD en
--  lugar de crear un catálogo nuevo") sin añadir ningún valor.
-- ═══════════════════════════════════════════════════════════════════════

create type public.atribucion_origen_t as enum ('ley', 'reglamento');

comment on type public.atribucion_origen_t is
  'D-24: gobierna qué validación aplica a gobierno_atribucion — origen=reglamento exige '
  'reglamento_referencia no vacía (ATRIBUCION_SIN_REFERENCIA_REGLAMENTO), origen=ley exige '
  'fundamento_normativo_id (ATRIBUCION_SIN_FUNDAMENTO). No es vocabulario descriptivo: cambia '
  'qué columna es obligatoria (GOB-1 §4.2).';

insert into public.tipos (codigo, nombre) values
  ('ORGANO_GOBIERNO', 'Tipo de Órgano de Gobierno'),
  ('ATRIBUCION_ORGANO', 'Atribución de un Órgano de Gobierno');

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('ORGANO_GOBIERNO', 'asamblea_general', 'Asamblea General', 1),
  ('ORGANO_GOBIERNO', 'consejo_administracion', 'Consejo de Administración', 2),
  ('ORGANO_GOBIERNO', 'comite_convivencia', 'Comité de Convivencia', 3),
  ('ORGANO_GOBIERNO', 'comite', 'Comité ad hoc', 4),
  ('ORGANO_GOBIERNO', 'administracion', 'Administración', 5),
  ('ORGANO_GOBIERNO', 'revisoria_fiscal', 'Revisoría Fiscal', 6);

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('ATRIBUCION_ORGANO', 'aprobar_estados_financieros', 'Aprobar estados financieros', 1),
  ('ATRIBUCION_ORGANO', 'aprobar_presupuesto', 'Aprobar presupuesto', 2),
  ('ATRIBUCION_ORGANO', 'elegir_consejo', 'Elegir consejo de administración', 3),
  ('ATRIBUCION_ORGANO', 'elegir_revisor_fiscal', 'Elegir revisor fiscal', 4),
  ('ATRIBUCION_ORGANO', 'elegir_comite_convivencia', 'Elegir comité de convivencia', 5),
  ('ATRIBUCION_ORGANO', 'imponer_sanciones', 'Imponer sanciones', 6),
  ('ATRIBUCION_ORGANO', 'autorizar_castigo_cartera', 'Autorizar castigo de cartera', 7),
  ('ATRIBUCION_ORGANO', 'autorizar_uso_fondo', 'Autorizar uso de fondo', 8),
  ('ATRIBUCION_ORGANO', 'aprobar_cuota_extraordinaria', 'Aprobar cuota extraordinaria', 9),
  ('ATRIBUCION_ORGANO', 'reformar_reglamento', 'Reformar el reglamento', 10),
  ('ATRIBUCION_ORGANO', 'conciliar_conflictos', 'Conciliar conflictos', 11);
