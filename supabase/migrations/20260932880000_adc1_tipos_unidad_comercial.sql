-- ═══════════════════════════════════════════════════════════════════════
--  ADC-01 · Adaptación comercial del Core (1/1) — tipos de unidad que
--  faltaban para representar una PH comercial o mixta.
--  Ver PROMPT_01_ADAPTACION_COMERCIAL_CORE.md §5 y §32.
--
--  ═══ POR QUÉ SOLO DOS VALORES, Y POR QUÉ GLOBALES ═══
--
--  lista_tipos ya permite que un tenant cree sus propios valores
--  (lista_tipos_insert_agent, 20260814160000) — así que un centro comercial
--  PODRÍA crear "bodega" por su cuenta, sin esta migración. Se siembran
--  globales igual por una razón concreta: un alcance de concepto declara
--  `tipo_inmueble = 'bodega'` por CÓDIGO. Si cada tenant crea el suyo, el
--  mismo código convive con semánticas distintas y una plantilla de
--  concepto deja de ser portable entre copropiedades.
--
--  El criterio para que un valor entre aquí y no lo cree el tenant: que sea
--  universal en la PH colombiana. `bodega` y `consultorio` lo son (Ley 675
--  no los distingue, pero cualquier PH mixta los tiene). `restaurante`,
--  `farmacia`, `gimnasio` NO entran: son USO, no tipo — y además son la
--  cola larga que justifica precisamente que el tenant pueda crear los
--  suyos. Ver §32 del prompt: `local` es tipo, `restaurante` es uso; no se
--  mezclan las dos dimensiones.
--
--  USO_PREDIO no se toca. Sus 5 valores (residencial/comercial/turistico/
--  industrial/institucional) ya cubren la clasificación gruesa; el detalle
--  ("restaurante") es exactamente lo que el tenant debe poder añadir sin
--  pedir una migración.
-- ═══════════════════════════════════════════════════════════════════════

-- orden 9/10: el 8 ya lo ocupa 'terreno', añadido por 20260814180000 DESPUÉS
-- del seed inicial de la familia — leer solo el CREATE/seed original de un
-- catálogo no basta, hay que buscar los insert posteriores sobre esa familia.
insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_INMUEBLE', 'bodega', 'Bodega', 9),
  ('TIPO_INMUEBLE', 'consultorio', 'Consultorio', 10);

comment on column public.inmuebles.tipo_id is
  'Qué ES la unidad (apartamento, local, oficina, bodega, consultorio...) — familia '
  'TIPO_INMUEBLE. Dimensión distinta de uso_predio_id, que es a qué se dedica: '
  'tipo=local + uso=restaurante son dos hechos independientes y ambos condicionables '
  'desde el alcance de un concepto (ADC-01, alcance.ts).';
