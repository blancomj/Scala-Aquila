-- ═══════════════════════════════════════════════════════════════════════
--  MANT-4 · Incidencias y órdenes de trabajo (1/9)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_04_incidencias_ordenes_trabajo.md
--
--  Vocabulario puro (D-24): ninguno de estos catálogos gatilla una
--  transición o un cálculo por sí solo — la lógica real vive en los guards
--  de las tablas que los consumen, no en cuál código tenga la fila.
--
--  AD-26 aplicado en este corte (ver informe): mientras no exista
--  GOB_00_DECISION_AD26.md, toda incidencia la registra un usuario CON
--  sesión (auxiliar/administrador) — el reportante (residente, vigilancia)
--  queda como texto libre en mant_incidencias, nunca como principal de
--  autenticación. La escritura anónima por QR queda fuera de alcance.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre, descripcion) values
  ('TIPO_INCIDENCIA', 'Tipo de incidencia',
   'Naturaleza de lo reportado (MANT-4 §3.1) — puramente descriptivo.'),
  ('ORIGEN_REPORTE', 'Origen del reporte',
   'Quién o qué originó la incidencia (MANT-4 §3.1) — puramente descriptivo.'),
  ('SEVERIDAD_INCIDENCIA', 'Severidad de la incidencia',
   'Gravedad del hecho reportado (MANT-4 §3.2) — entrada de mant_prioridad_sugerida junto con '
   'la criticidad del activo; no gatilla ninguna transición por sí sola, la prioridad resultante '
   'la decide la matriz configurable, no esta tabla.'),
  ('PRIORIDAD', 'Prioridad de atención',
   'Prioridad sugerida o asignada a una incidencia/OT (MANT-4 §3.2) — puramente descriptiva, la '
   'matriz de prioridad decide el valor, no el catálogo en sí.'),
  ('MANT_SERIE_CONSECUTIVO', 'Serie de consecutivo de mantenimiento',
   'Distingue la numeración de incidencias de la de órdenes de trabajo dentro de '
   'mant_consecutivo (MANT-4) — cada serie lleva su propio correlativo por año y tenant.')
on conflict (codigo) do nothing;

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_INCIDENCIA', 'falla', 'Falla', 10),
  ('TIPO_INCIDENCIA', 'anomalia', 'Anomalía', 20),
  ('TIPO_INCIDENCIA', 'solicitud', 'Solicitud', 30),
  ('TIPO_INCIDENCIA', 'riesgo', 'Riesgo', 40),

  ('ORIGEN_REPORTE', 'residente', 'Residente', 10),
  ('ORIGEN_REPORTE', 'vigilancia', 'Vigilancia', 20),
  ('ORIGEN_REPORTE', 'inspeccion', 'Inspección', 30),
  ('ORIGEN_REPORTE', 'ronda', 'Ronda', 40),
  ('ORIGEN_REPORTE', 'qr', 'Consulta QR', 50),
  ('ORIGEN_REPORTE', 'medicion', 'Medición fuera de rango', 60),

  ('SEVERIDAD_INCIDENCIA', 'leve', 'Leve', 10),
  ('SEVERIDAD_INCIDENCIA', 'moderada', 'Moderada', 20),
  ('SEVERIDAD_INCIDENCIA', 'grave', 'Grave', 30),
  ('SEVERIDAD_INCIDENCIA', 'critica', 'Crítica', 40),

  ('PRIORIDAD', 'baja', 'Baja', 10),
  ('PRIORIDAD', 'media', 'Media', 20),
  ('PRIORIDAD', 'alta', 'Alta', 30),
  ('PRIORIDAD', 'urgente', 'Urgente', 40),

  ('MANT_SERIE_CONSECUTIVO', 'incidencia', 'Incidencia', 10),
  ('MANT_SERIE_CONSECUTIVO', 'orden_trabajo', 'Orden de trabajo', 20);
