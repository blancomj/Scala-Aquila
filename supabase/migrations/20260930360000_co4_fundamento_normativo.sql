-- ═══════════════════════════════════════════════════════════════════════
--  CO-4 · Fundamentos normativos citados en el corte (CO_04 §2)
--
--  DUR 2420 de 2015 y DIAN Concepto 0347 de 2022 ya están registrados
--  (CO-1, 20260930170000) — no se duplican. Nuevos aquí: Decreto 2500 de
--  1986 (libros obligatorios de PH) y ET art. 774 (requisitos para que la
--  contabilidad constituya prueba).
--
--  VALIDACIÓN DE PRIMER GRADO — NO realizada en esta sesión: mismo
--  problema de entorno documentado en 20260930170000 (CO-1) y
--  20260930340000 (MANT-0) — sin acceso confiable a fuente primaria
--  (funcionpublica.gov.co / suin-juriscol.gov.co) en este entorno. Se
--  registran con fecha_validacion = NULL, como pregunta abierta para el
--  contador matriculado, no como validación dada por hecha.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia)
values
  (
    null, 'decreto', 'Decreto 2500 de 1986', null,
    'Libros obligatorios de contabilidad (registro, diligenciamiento) de los que se desprenden, '
    'junto con la Ley 675 de 2001, los libros exigibles a una propiedad horizontal (CO-4 §2). '
    'Pendiente de validar el artículo exacto contra fuente primaria.',
    'decreto2500_1986_libros_ph'
  ),
  (
    null, 'ley', 'Estatuto Tributario (D.B.C. 624/1989)', 'Art. 774',
    'Requisitos para que los libros de contabilidad constituyan prueba: llevados en debida '
    'forma, registrados si hay obligación de registro, sin sitios en blanco ni alteraciones. '
    'Fundamento de por qué el Libro Diario/Mayor/Balance de prueba deben ser vistas de solo '
    'lectura sobre lo ya contabilizado, nunca datos paralelos editables (CO-4 §1).',
    'et_art774_libros_prueba'
  );
