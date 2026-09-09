-- ═══════════════════════════════════════════════════════════════════════
--  MANT-7 · Inspecciones, hallazgos y acciones correctivas (1/7)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_07_inspecciones_hallazgos.md
--
--  Vocabulario puro (D-24): TIPO_INSPECCION/TIPO_ACTUACION_HALLAZGO no
--  gatillan ninguna transición ni cálculo por sí solos.
--
--  severidad_t/respuesta_valor_t/hallazgo_estado_t SÍ son enums (no
--  lista_tipos): cada uno condiciona una regla real de este corte —
--  ver comment on type de cada uno para el detalle exacto.
--
--  SEVERIDAD_INCIDENCIA (MANT-4, lista_tipos: leve/moderada/grave/critica)
--  no se reutiliza aquí a propósito: dominio distinto (severidad de una
--  incidencia reportada vs. severidad de un hallazgo de inspección) y
--  valores distintos (el prompt exige crítico/mayor/menor/observación).
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre, descripcion) values
  ('TIPO_INSPECCION', 'Tipo de inspección',
   'Naturaleza de la inspección (MANT-7 §3.1) — puramente descriptivo.'),
  ('TIPO_ACTUACION_HALLAZGO', 'Tipo de actuación sobre un hallazgo',
   'Qué ocurrió en la bitácora de un hallazgo (MANT-7 §3.4) — puramente descriptivo, el estado '
   'real vive en mant_hallazgos.estado/hallazgo_estado_t, no en este catálogo.')
on conflict (codigo) do nothing;

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_INSPECCION', 'preventiva', 'Preventiva', 10),
  ('TIPO_INSPECCION', 'legal', 'Legal/normativa', 20),
  ('TIPO_INSPECCION', 'aseguradora', 'Aseguradora', 30),
  ('TIPO_INSPECCION', 'interna', 'Interna', 40),

  ('TIPO_ACTUACION_HALLAZGO', 'apertura', 'Apertura', 10),
  ('TIPO_ACTUACION_HALLAZGO', 'asignacion_ot', 'Asignación de OT', 20),
  ('TIPO_ACTUACION_HALLAZGO', 'tratamiento', 'Tratamiento', 30),
  ('TIPO_ACTUACION_HALLAZGO', 'aceptacion', 'Aceptación sin tratamiento', 40),
  ('TIPO_ACTUACION_HALLAZGO', 'cierre', 'Cierre', 50),
  ('TIPO_ACTUACION_HALLAZGO', 'reapertura', 'Reapertura', 60);

create type public.severidad_t as enum ('critico', 'mayor', 'menor', 'observacion');
comment on type public.severidad_t is
  'Severidad de un hallazgo de inspección (MANT-7). Gatilla reglas duras: critico/mayor exigen '
  'fecha_limite al crear el hallazgo (HALLAZGO_SIN_FECHA_LIMITE) y evidencia verificada para '
  'cerrarlo (HALLAZGO_CIERRE_SIN_EVIDENCIA); critico exige además aprobación del órgano '
  'competente al aceptar, si el tenant tiene GOB-1 vigente. No es vocabulario descriptivo suelto '
  '— condiciona bloqueos reales, D-24.';

create type public.respuesta_valor_t as enum ('conforme', 'no_conforme', 'no_aplica');
comment on type public.respuesta_valor_t is
  'Valor de la respuesta a un ítem de un formato de inspección (MANT-7). Gatilla si se genera un '
  'hallazgo automáticamente: solo ''no_conforme'' lo dispara. No es vocabulario suelto — '
  'condiciona una creación real de fila.';

create type public.hallazgo_estado_t as enum ('abierto', 'en_tratamiento', 'aceptado', 'cerrado');
comment on type public.hallazgo_estado_t is
  'Ciclo de vida de un hallazgo (MANT-7). Gobierna qué guard aplica en cada transición: aceptar '
  'exige motivo (y órgano si es crítico y el tenant tiene GOB-1 vigente) y nunca lo permite si el '
  'hallazgo es de origen legal (HALLAZGO_LEGAL_NO_ACEPTABLE); cerrar exige evidencia verificada '
  'si es crítico/mayor. Mismo criterio que ot_estado_t/incidencia_estado_t — no es vocabulario '
  'descriptivo suelto.';
