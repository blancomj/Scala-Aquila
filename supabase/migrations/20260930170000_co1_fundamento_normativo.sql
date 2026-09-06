-- ═══════════════════════════════════════════════════════════════════════
--  CO-1 · Fundamentos normativos citados en el corte (CO_01 §3)
--
--  IMPORTANTE — validación de primer grado NO realizada en esta sesión:
--  WebFetch falló con "unable to verify the first certificate" contra
--  funcionpublica.gov.co y suin-juriscol.gov.co (error de entorno, no de las
--  fuentes) y no fue posible cotejar el texto exacto de los artículos contra
--  la fuente primaria. Siguiendo MARCO_MAESTRO.md §1.6/§7: lo que no se pudo
--  verificar no se inventa. Estos 6 fundamentos se registran con
--  fecha_validacion = NULL (estado "sin_validar" en
--  fundamento_validacion_pendiente()) y fuente_url = NULL salvo que ya
--  existiera en el catálogo — quedan como pregunta abierta para quien tenga
--  acceso a internet o para el contador, no como validación dada por hecha.
--  La cita (norma/artículo) es la que trae CO_01_marco_contable_tenant.md
--  §3, no una invención de esta sesión.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia)
values
  (
    null, 'decreto', 'Decreto Único Reglamentario 2420 de 2015 (MinComercio/CTCP)', null,
    'Define los grupos 1/2/3 de aplicación de los marcos técnicos normativos de información '
    'financiera. tenants.marco_grupo (CO-1) solo modela grupo_2/grupo_3 — grupo 1 (NIIF plenas) '
    'no aplica a copropiedades. Pendiente de validar el artículo exacto contra fuente primaria.',
    'dur2420_2015_grupos'
  ),
  (
    null, 'ley', 'Estatuto Tributario (D.B.C. 624/1989)', 'Art. 19-5',
    'Solo las copropiedades de uso comercial o mixto pueden ser contribuyentes del régimen '
    'ordinario de renta por explotación de sus bienes o áreas comunes. Base de '
    'tenants.uso_economico (CO-1), consumido por CO-8.',
    'et_art19_5'
  ),
  (
    null, 'ley', 'Estatuto Tributario (D.B.C. 624/1989)', 'Arts. 420 y ss.',
    'La exclusión de renta e ICA del art. 19-5 NO cubre IVA — una copropiedad puede ser '
    'responsable de IVA (tenants.responsable_iva) sin ser contribuyente de renta. Norma + '
    'doctrina (CO-1 §3); pendiente de validar contra fuente primaria.',
    'et_art420ss_iva_no_excluido'
  ),
  (
    null, 'ley', 'Ley 675 de 2001', 'Art. 51 num. 5',
    'Obligación del administrador de llevar la contabilidad de la copropiedad y su '
    'responsabilidad sobre ella. Fundamento de por qué tenants necesita un marco contable '
    'explícito (CO-1). Distinto del Art. 51 ya sembrado en 20260902100000 (disolución de la '
    'persona jurídica) — mismo artículo, numeral distinto; pendiente de confirmar contra '
    'fuente primaria si el numeral 5 corresponde efectivamente a este artículo.',
    'ley675_2001_art51_num5_contabilidad'
  ),
  (
    null, 'orientacion_tecnica', 'CTCP Concepto 0812 de 2019', null,
    'Doctrina del CTCP sobre la obligación de llevar contabilidad en propiedad horizontal '
    '(complementa Ley 675 art. 51 num. 5). Citada en CO-1 §3.',
    'ctcp_concepto_0812_2019'
  ),
  (
    null, 'orientacion_tecnica', 'DIAN Concepto 0347 de 2022', null,
    'Registro de libros de contabilidad ante la DIAN: solo aplica a copropiedades de régimen '
    'ordinario (uso comercial o mixto, ET art. 19-5), no a toda PH indistintamente.',
    'dian_concepto_0347_2022'
  );

-- No existe PUC obligatorio para propiedad horizontal (CO-1 §3, "ausencia de norma") — ya
-- validado en PC-01 §1.1 (informe interno, no requiere fuente_url externa). No se registra un
-- fundamento nuevo aquí para no duplicar esa validación ya hecha.
