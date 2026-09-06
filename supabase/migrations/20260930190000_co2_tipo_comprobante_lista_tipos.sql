-- ═══════════════════════════════════════════════════════════════════════
--  CO-2 · Núcleo del libro contable — familia TIPO_COMPROBANTE
--  (CO_02_nucleo_libro_contable.md §3.2)
--
--  lista_tipos, no enum (D-24 + instrucción explícita del usuario de
--  priorizar lista_tipos sobre enums): es vocabulario que puede crecer
--  (un tipo de comprobante nuevo no cambia ninguna transición de estado),
--  mismo patrón exacto que EVENTO_CONTABLE (20260830460000).
--
--  "De sistema" vs. captura manual (APERTURA/CIERRE/DEPRECIACION/DETERIORO
--  los genera el motor; los demás admiten captura manual) se modela como
--  constante en el frontend (TIPOS_COMPROBANTE_DE_SISTEMA), NO como columna
--  nueva en lista_tipos ni como guard de servidor — decisión explícita del
--  usuario en el Plan del corte: ningún guard de este corte depende de esa
--  distinción, así que una columna en un catálogo compartido por decenas de
--  familias habría sido una columna sin invariante que la use.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre, descripcion) values (
  'TIPO_COMPROBANTE',
  'Tipo de comprobante contable',
  'Clasifica el comprobante contable (contable_comprobante.tipo_id) por el hecho que lo origina '
  '— apertura, ingreso, egreso, causación, ajuste, reclasificación, depreciación, deterioro o '
  'cierre. Vocabulario configurable (D-24): un tipo nuevo no gatilla ninguna transición de '
  'estado, así que es lista_tipos y no un enum.'
);

insert into public.lista_tipos (tipo, codigo, nombre, descripcion, orden) values
  ('TIPO_COMPROBANTE', 'APERTURA',        'Comprobante de apertura',            'De sistema — lo genera el motor al abrir un ejercicio', 10),
  ('TIPO_COMPROBANTE', 'INGRESO',         'Comprobante de ingreso',             'Captura manual', 20),
  ('TIPO_COMPROBANTE', 'EGRESO',          'Comprobante de egreso',              'Captura manual', 30),
  ('TIPO_COMPROBANTE', 'CAUSACION',       'Causación',                         'Captura manual', 40),
  ('TIPO_COMPROBANTE', 'AJUSTE',          'Ajuste',                            'Captura manual — también el tipo usado por fn_reversar_comprobante para las reversiones', 50),
  ('TIPO_COMPROBANTE', 'RECLASIFICACION', 'Reclasificación',                   'Captura manual', 60),
  ('TIPO_COMPROBANTE', 'DEPRECIACION',    'Depreciación y amortización',        'De sistema — lo genera el motor de activos (MANT-0/CO-4)', 70),
  ('TIPO_COMPROBANTE', 'DETERIORO',       'Deterioro',                         'De sistema — lo genera el motor de deterioro de cartera (CO-7)', 80),
  ('TIPO_COMPROBANTE', 'CIERRE',          'Comprobante de cierre',             'De sistema — lo genera el proceso de cierre de ejercicio (CO-6)', 90);
