-- ═══════════════════════════════════════════════════════════════════════
--  EXS-2 · Notificaciones in-app (1/4) — vocabulario
--  Casos de uso/Experiencia y servicios/HOJA_DE_RUTA_EXS.md §2, corte 2.
--
--  Vocabulario puro (D-24): ni el tipo ni la prioridad de una notificación
--  gatillan transición de estado ni cálculo alguno — solo clasifican y
--  ordenan lo que se muestra. Por eso lista_tipos y no CREATE TYPE.
--
--  Este corte NO crea ningún enum: una notificación no tiene ciclo de
--  vida. Nace, se lee o no se lee, y caduca por antigüedad. El único
--  "estado" (leída) vive en notificacion_lectura, que es una fila que
--  existe o no existe — no una columna que transiciona.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre, descripcion) values
  ('TIPO_NOTIFICACION', 'Tipo de notificación',
   'Naturaleza del aviso in-app (EXS-2) — puramente descriptivo: agrupa e ilustra en la campana, '
   'no condiciona quién lo ve (eso lo decide notificaciones.modulo vía puede_ver_modulo) ni '
   'ninguna regla de negocio.'),
  ('PRIORIDAD_NOTIFICACION', 'Prioridad de notificación',
   'Urgencia relativa con la que se presenta un aviso in-app (EXS-2) — ordena y destaca en la '
   'campana. Deliberadamente separada del tipo: una notificación de mantenimiento puede ser '
   'informativa o crítica (prompt 02 §6, "la prioridad no debe confundirse con categoría").')
on conflict (codigo) do nothing;

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  -- Los tres tipos que este corte emite de verdad, uno por detección
  -- existente. Cada corte EXS posterior añade los suyos en su propia
  -- migración; sembrar aquí tipos sin emisor sería vocabulario muerto.
  ('TIPO_NOTIFICACION', 'alerta_liquidez', 'Alerta de liquidez', 10),
  ('TIPO_NOTIFICACION', 'alerta_inventario', 'Alerta de inventario', 20),
  ('TIPO_NOTIFICACION', 'vencimiento_gobierno', 'Vencimiento de gobierno', 30),

  ('PRIORIDAD_NOTIFICACION', 'informativa', 'Informativa', 10),
  ('PRIORIDAD_NOTIFICACION', 'importante', 'Importante', 20),
  ('PRIORIDAD_NOTIFICACION', 'critica', 'Crítica', 30);
