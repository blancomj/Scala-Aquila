-- ═══════════════════════════════════════════════════════════════════════
--  CO-9 · Fundamentos normativos (§3 del corte) — sembrados globales
--  (tenant_id null), mismo patrón que 20260930170000_co1_fundamento_normativo.sql.
--
--  De las 9 filas de §3 del corte, 3 YA ESTÁN registradas por cortes
--  anteriores (verificado por grep antes de insertar, marco §3 — no
--  duplicar): 'Ley 675 de 2001' 'Art. 51' (CO-1, como "Art. 51 num. 5") y
--  'Art. 56' (GOB-1); 'DIAN Concepto 0347 de 2022' (CO-1, idéntico —
--  registro de libros ante la DIAN). No se reinsertan.
--
--  Solo se registran aquí las 2 realmente nuevas, verificadas por
--  WebSearch el 2026-09-08 (el acceso directo a .gov.co vuelve a fallar en
--  este entorno, mismo problema documentado desde CO-1/GOB-7): Ley 222
--  art. 37 contra funcionpublica.gov.co/eva/gestornormativo (fuente
--  primaria aceptada, marco §4); ET art. 632 contra el fallo del Consejo
--  de Estado 76001-23-31-000-2006-00242-01(18971) (fuente judicial
--  primaria) + normograma.dian.gov.co (oficio DIAN 20796/2006). Más una
--  tercera, Decreto 1625 art. 1.2.1.5.4.5, distinta del art. 1.2.1.5.3.2
--  que CO-8 ya registró — sin verificación de primer grado propia esta
--  sesión, pendiente igual que otros cortes dejaron puntos sin alcanzar
--  fuente primaria (mismo criterio que GOB-7 con suin-juriscol.gov.co).
--
--  No hay constraint de unicidad en fundamento_normativo (es un registro
--  de citas, no un catálogo con clave natural) — no se usa ON CONFLICT.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia)
values
  (
    null, 'ley', 'Ley 222 de 1995', 'art. 37',
    'Certificación de estados financieros: el representante legal y el contador público bajo cuya '
    'responsabilidad se prepararon deben certificar que las afirmaciones se verificaron y se '
    'tomaron fielmente de los libros, antes de ponerlos a disposición de asociados o terceros. '
    'Verificado por WebSearch el 2026-09-08 contra funcionpublica.gov.co/eva/gestornormativo '
    '(fuente primaria aceptada, marco §4) — soporta contable_certificacion (CO-9 §4.1).',
    'ley222_1995_art37'
  ),
  (
    null, 'decreto', 'Decreto 1625 de 2016', 'art. 1.2.1.5.4.5',
    'El libro de actas constituye prueba idónea de las decisiones. Distinto del art. 1.2.1.5.3.2 '
    'ya registrado por CO-8. Citado tal como lo trae el corte, sin verificación de primer grado '
    'propia esta sesión (WebFetch directo contra fuentes .gov.co no disponible en este entorno) — '
    'pendiente.',
    'decreto1625_2016_actas'
  ),
  (
    null, 'otra', 'Estatuto Tributario', 'art. 632',
    'Conservación de informaciones y pruebas: 5 años contados desde el 1 de enero del año '
    'siguiente a la elaboración, expedición o recibo del documento, para quien no esté obligado a '
    'llevar contabilidad; para quien sí lo está, junto con los soportes que dieron origen a los '
    'registros. Verificado por WebSearch el 2026-09-08 contra el fallo del Consejo de Estado '
    '76001-23-31-000-2006-00242-01(18971) y normograma.dian.gov.co (oficio DIAN 20796/2006) — '
    'valor sugerido en contable_politica_conservacion (CO-9 §4.6), nunca hard-coded en una '
    'función ni impuesto como mínimo bloqueante.',
    'et_art632_conservacion'
  );
