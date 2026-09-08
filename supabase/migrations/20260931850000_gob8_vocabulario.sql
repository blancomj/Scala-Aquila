-- ═══════════════════════════════════════════════════════════════════════
--  GOB-8 · Atención al propietario/residente — vocabulario
--  Ver GOB_08_atencion_consulta.md §2, §4.1.
--
--  Advertencia de encuadre (spec §2): NADA de este corte es obligación
--  legal, salvo el derecho a copia del acta (art. 47), ya cerrado por
--  GOB-4. Los SLA, la encuesta y la clasificación de PQRS son BUENA
--  PRÁCTICA — se registra así en fundamento_normativo (tipo='otra', el
--  enum fundamento_tipo_t es una decisión cerrada anterior a esta serie,
--  no se toca; 'otra' es el valor más cercano y la descripción deja
--  explícito que NO es exigencia legal).
--
--  Las cuatro familias (TIPO/CATEGORIA/ORIGEN/PRIORIDAD_SOLICITUD) son
--  vocabulario configurable → lista_tipos, cero filas precargadas (spec
--  §4.1, §8: "cada copropiedad las define" — mismo criterio que
--  gobierno_infracciones de GOB-6). solicitud_estado_t SÍ gobierna
--  transiciones reales (D-24) → enum con comment on type.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre, descripcion) values
  ('TIPO_SOLICITUD', 'Tipo de Solicitud', 'Clasificación de una PQRS (spec GOB-8 §4.1) — buena práctica, cero filas precargadas, cada copropiedad las define.'),
  ('CATEGORIA_SOLICITUD', 'Categoría de Solicitud', 'Agrupación temática de una PQRS (spec GOB-8 §4.1) — buena práctica, sin filas precargadas.'),
  ('ORIGEN_SOLICITUD', 'Origen de Solicitud', 'Canal por el que llegó la PQRS (mostrador, teléfono, correo, formulario...) — buena práctica, sin filas precargadas.'),
  ('PRIORIDAD_SOLICITUD', 'Prioridad de Solicitud', 'Prioridad asignada a una PQRS, usada para emparejar con solicitud_sla — buena práctica, sin filas precargadas.');

create type public.solicitud_estado_t as enum (
  'nueva', 'asignada', 'en_atencion', 'en_espera', 'resuelta', 'cerrada', 'anulada'
);

comment on type public.solicitud_estado_t is
  'D-24: FSM de solicitudes (atención al propietario/residente, GOB-8) — buena práctica, sin '
  'base legal (spec §2). en_espera pausa el reloj del SLA (solicitudes.en_espera_desde); '
  'resuelta exige al menos una actuación con es_respuesta=true '
  '(ATENCION_CIERRE_SIN_RESPUESTA); anulada exige motivo. resuelta/cerrada/anulada son '
  'terminales.';

insert into public.fundamento_normativo (tenant_id, tipo, norma, articulo, descripcion, referencia)
values (
  null, 'otra', 'N/A — buena práctica, no obligación legal', null,
  'GOB-8 (atención al propietario/residente): SLA de atención, encuesta de satisfacción y '
  'clasificación de PQRS son BUENA PRÁCTICA administrativa, no exigencia de la Ley 675 de 2001 '
  '(spec §2, marco §2) — a diferencia de las empresas de servicios públicos, una copropiedad no '
  'tiene régimen legal de PQRS. La única obligación legal relacionada de esta serie (derecho a '
  'copia del acta, art. 47) ya la cubrió GOB-4. Se registra esta fila explícitamente para que '
  'quien configure gobierno/solicitud_sla, referenciándola, vea marcado con claridad que ningún '
  'plazo de este corte es de origen legal.',
  'gob8_buena_practica_sin_base_legal'
);
