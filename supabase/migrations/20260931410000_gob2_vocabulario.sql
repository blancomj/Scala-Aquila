-- ═══════════════════════════════════════════════════════════════════════
--  GOB-2 · Reunión, convocatoria, asistencia y poderes — vocabulario
--  Ver Casos de uso/Tres Modulos/Gobierno/GOB_02_reunion_convocatoria_asistencia.md §4.1
--
--  TIPO_REUNION es vocabulario descriptivo (D-24) → lista_tipos: describe
--  qué clase de reunión es, no gobierna ninguna transición.
--
--  Los cuatro enums SÍ gobiernan lógica/transiciones (D-24, comment on type
--  en cada uno):
--   - reunion_modalidad_t: determina qué columnas son obligatorias (lugar/
--     medio) y, más adelante (GOB-3), si puede tomarse una decisión de
--     mayoría calificada (art. 46 par.).
--   - reunion_convocatoria_t: determina qué validación de instalación aplica
--     (antecedente para 'segunda', totalidad de coeficientes para
--     'universal_sin_convocatoria').
--   - reunion_estado_t: FSM de la reunión.
--   - asistencia_calidad_t: determina si aporta coeficiente/voto y si exige
--     poder_id.
-- ═══════════════════════════════════════════════════════════════════════

create type public.reunion_modalidad_t as enum ('presencial', 'no_presencial', 'mixta');

comment on type public.reunion_modalidad_t is
  'D-24: gobierna qué columnas son obligatorias en gobierno_reuniones (lugar si <> no_presencial, '
  'medio si <> presencial) y, en GOB-3, si la reunión puede tomar decisiones de mayoría '
  'calificada (Ley 675 art. 46 par.: no en no_presencial). No es vocabulario descriptivo.';

create type public.reunion_convocatoria_t as enum ('primera', 'segunda', 'universal_sin_convocatoria');

comment on type public.reunion_convocatoria_t is
  'D-24: gobierna la validación de instalación de gobierno_reuniones — segunda exige '
  'convocatoria_antecedente_id (SEGUNDA_CONVOCATORIA_SIN_ANTECEDENTE, Ley 675 art. 41); '
  'universal_sin_convocatoria exige asistencia con el 100% de los coeficientes al instalar '
  '(REUNION_UNIVERSAL_SIN_TOTALIDAD_COEFICIENTES, Ley 675 art. 40).';

create type public.reunion_estado_t as enum ('convocada', 'instalada', 'cerrada', 'cancelada');

comment on type public.reunion_estado_t is
  'D-24: FSM de gobierno_reuniones. Transiciones válidas: convocada→instalada, '
  'convocada→cancelada, instalada→cerrada. cerrada es terminal e inmutable '
  '(REUNION_CERRADA_INMUTABLE); cualquier otra transición → REUNION_TRANSICION_INVALIDA.';

create type public.asistencia_calidad_t as enum ('propietario', 'apoderado', 'invitado', 'organo');

comment on type public.asistencia_calidad_t is
  'D-24: gobierna si un registro de gobierno_asistencia aporta coeficiente/voto (invitado no '
  'aporta ninguno) y si exige poder_id (apoderado sí, PODER_SIN_SOPORTE si falta). No es '
  'vocabulario descriptivo — cambia el cálculo del quórum.';

insert into public.tipos (codigo, nombre) values
  ('TIPO_REUNION', 'Tipo de Reunión');

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_REUNION', 'asamblea_ordinaria', 'Asamblea Ordinaria', 1),
  ('TIPO_REUNION', 'asamblea_extraordinaria', 'Asamblea Extraordinaria', 2),
  ('TIPO_REUNION', 'consejo_ordinaria', 'Consejo de Administración — Ordinaria', 3),
  ('TIPO_REUNION', 'consejo_extraordinaria', 'Consejo de Administración — Extraordinaria', 4),
  ('TIPO_REUNION', 'comite', 'Reunión de Comité', 5);
