-- ═══════════════════════════════════════════════════════════════════════
--  CO-8 · Obligaciones tributarias — vocabulario y fundamento normativo
--  Ver Casos de uso/Tres Modulos/Contabilidad/CO_08_tributario.md §3, §4.1, §4.3.
--
--  Advertencia de encuadre (spec §2): nada de este corte se activa por
--  defecto. Los cuatro valores de NATURALEZA_TRIBUTARIA_CUENTA y los dos de
--  PERIODICIDAD_IVA son vocabulario CERRADO definido por el propio corte
--  (no por norma directa) — se siembran GLOBALES (tenant_id null), mismo
--  criterio que EVENTO_CONTABLE/TIPO_DOCUMENTO: no es política de tenant
--  que deba nacer vacía (a diferencia de tributario_concepto_retencion,
--  que sí nace vacía en la siguiente migración — esa es la tarifa/base,
--  aquí solo la etiqueta clasificatoria).
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre, descripcion) values
  ('NATURALEZA_TRIBUTARIA_CUENTA', 'Naturaleza tributaria de una cuenta contable',
   'Clasifica una cuenta de clase 1/4/5 según si sus movimientos están gravados de renta y/o '
   'IVA (CO-8 §4.1) — exigido por el ET art. 19-5, que obliga a separar en la contabilidad los '
   'ingresos gravados de los no gravados.'),
  ('PERIODICIDAD_IVA', 'Periodicidad de declaración de IVA',
   'Bimestral o cuatrimestral según el tamaño del responsable ante la DIAN (CO-8 §4.3) — '
   'REMISIÓN A LA COPROPIEDAD/CONTADOR: la resolución de la DIAN fija el criterio de '
   'asignación, no este catálogo.');

insert into public.lista_tipos (tipo, codigo, nombre, descripcion, orden) values
  ('NATURALEZA_TRIBUTARIA_CUENTA', 'no_gravado',        'No gravado',                 'Ingreso o costo/gasto asociado sin efecto tributario (ingresos por cuotas de administración, ET art. 19-5)', 10),
  ('NATURALEZA_TRIBUTARIA_CUENTA', 'gravado_renta',      'Gravado de renta',           'Ingreso por explotación de bienes comunes sujeto al régimen ordinario de renta (ET art. 19-5)', 20),
  ('NATURALEZA_TRIBUTARIA_CUENTA', 'gravado_iva',        'Gravado de IVA',             'Ingreso sujeto a IVA (ET arts. 420 y 429) — independiente de si está gravado de renta', 30),
  ('NATURALEZA_TRIBUTARIA_CUENTA', 'gravado_renta_iva',  'Gravado de renta e IVA',     'Ingreso sujeto simultáneamente a renta e IVA', 40),
  ('PERIODICIDAD_IVA', 'bimestral',    'Bimestral',    'Declaración de IVA cada dos meses', 10),
  ('PERIODICIDAD_IVA', 'cuatrimestral','Cuatrimestral','Declaración de IVA cada cuatro meses', 20);

-- ── Fundamento normativo (CO-8 §3) ───────────────────────────────────────
-- fundamento_normativo no tiene columnas fecha_validacion/fuente_url (a diferencia de lo que
-- describe MARCO_MAESTRO.md §4/§8 — mismo vacío documental ya señalado en GOB-7/D-67 y
-- GOB-8/D-68): se sigue el patrón ya establecido, URL y fecha de consulta como texto dentro de
-- `referencia`. `articulo` lleva el artículo/concepto citado; `descripcion` el alcance real.
insert into public.fundamento_normativo (tenant_id, tipo, norma, articulo, descripcion, referencia)
values
  (null, 'ley', 'Estatuto Tributario', 'art. 19-5',
   'Solo las copropiedades de uso comercial o mixto pueden ser contribuyentes del impuesto de '
   'renta, y únicamente por la explotación comercial de bienes comunes; deben separar en la '
   'contabilidad los ingresos gravados de los no gravados y los activos que los generan. '
   'CO-8 §4.1 modela esta separación vía contable_cuenta.naturaleza_tributaria_id.',
   'co8_et_19_5_renta_explotacion; texto consultado en función.gov.co/eva/estatuto-tributario, '
   'sin poder confirmar fecha de última actualización por falla de TLS contra .gov.co (mismo '
   'problema documentado en CO-1/MANT-2) — no bloqueante, dejado como pregunta abierta'),
  (null, 'ley', 'Estatuto Tributario', 'arts. 420 y 429',
   'La exclusión de renta del art. 19-5 NO cubre IVA: una copropiedad residencial que cobra '
   'parqueadero a terceros puede ser responsable de IVA sin dejar de ser residencial. Gobierna '
   'que responsable_iva (CO-1) sea independiente de uso_economico.',
   'co8_et_420_429_iva_independiente_uso; misma limitación de validación de fuente primaria que '
   'la fila anterior'),
  (null, 'decreto', 'Decreto 1625 de 2016', 'art. 1.2.1.5.3.2',
   'Renta presuntiva sobre el patrimonio líquido destinado a la explotación de bienes comunes — '
   'CO-8 no calcula renta presuntiva (fuera de alcance §5); esta fila deja registrado el '
   'fundamento para cuando ese cálculo se implemente en un corte posterior.',
   'co8_decreto_1625_2016_renta_presuntiva; no validado contra fuente primaria por la misma '
   'limitación de TLS — pregunta abierta'),
  (null, 'otra', 'DIAN Concepto 0347 de 2022', null,
   'Doctrina (no norma): el registro de libros ante la DIAN solo aplica al régimen ordinario. '
   'CO-8 no implementa ese registro (fuera de alcance §5); fila informativa para no perder la '
   'referencia si un corte futuro lo retoma.',
   'co8_dian_concepto_0347_2022_registro_libros; doctrina, no exige verificación de vigencia '
   'como una norma');

comment on column public.fundamento_normativo.referencia is
  'Texto libre reutilizado también como bitácora de validación (URL/fecha consultada, o motivo '
  'por el que no se pudo validar) — fundamento_normativo no tiene columnas fecha_validacion/'
  'fuente_url pese a que MARCO_MAESTRO.md las menciona; ningún corte anterior las tiene tampoco '
  '(mismo vacío documental de GOB-7/D-67, GOB-8/D-68).';
