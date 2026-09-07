-- ═══════════════════════════════════════════════════════════════════════
--  GOB-2 · Fundamentos legales — arts. 39, 40, 41 y 47 de la Ley 675 de 2001
--  Ver GOB_02_reunion_convocatoria_asistencia.md §3.
--
--  WebFetch contra funcionpublica.gov.co/sic.gov.co falló en esta sesión con
--  "unable to verify the first certificate" — mismo problema de entorno ya
--  documentado en CO-1/MANT-0 (TLS contra dominios .gov.co). Verificado en
--  su lugar por WebSearch, cruzando 3+ fuentes independientes convergentes
--  (actualicese.com, minvivienda.gov.co — concepto jurídico oficial en PDF,
--  leyes.co, revistapropiedadhorizontal.com) — mismo criterio de "cruce de
--  fuentes" ya usado en GOB-0 cuando el mirror directo falló.
--
--  Solo se registran los fundamentos de lo EFECTIVAMENTE implementado en
--  este corte:
--   - art. 40: la regla de "reunión sin convocatoria previa cuando los
--     asistentes representan la totalidad de los coeficientes" — implementada
--     como PISO LEGAL fijo (100%), no parametrizable.
--   - art. 41: segunda convocatoria exige un antecedente (reunión previa que
--     no alcanzó quórum) — implementado como integridad referencial
--     (convocatoria_antecedente_id). El % de quórum reducido en sí (el
--     antecedente confirma: "sesiona válidamente con cualquier número de
--     copropietarios, sin importar el porcentaje de coeficientes") es de
--     GOB-3, no de este corte.
--   - art. 47: el acta debe ir firmada por presidente y secretario —
--     implementado como REUNION_SIN_PRESIDENTE_O_SECRETARIO al instalar.
--  NO se registra el art. 39 (plazo exacto de convocatoria) ni la remisión a
--  la Ley 222/1995 (reuniones no presenciales) — ambos quedan explícitamente
--  sin validar en el sistema (marcados "verificar" por el propio corte;
--  fecha_limite_respuesta se almacena como dato libre, sin exigir un mínimo
--  de días). Preguntas abiertas para el abogado, no resueltas aquí.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por, estado)
values
  (null, 'ley', 'Ley 675 de 2001', 'Art. 40',
   'Reuniones por derecho propio: si la asamblea no fue convocada, se reúne de pleno derecho el '
   'primer día hábil del cuarto mes siguiente al vencimiento de cada período presupuestal. Además, '
   'es igualmente válida la reunión celebrada en cualquier día, hora o lugar, sin previa '
   'convocatoria, cuando en ella estuviere representada la totalidad de los coeficientes de '
   'propiedad del edificio o conjunto. Fundamento de gobierno_reuniones.convocatoria_regimen = '
   '''universal_sin_convocatoria'' — el 100%% de asistencia es PISO LEGAL fijo, no parametrizable '
   '(marco §3): REUNION_UNIVERSAL_SIN_TOTALIDAD_COEFICIENTES.',
   'ley675_2001_art40_gob2',
   'https://www.sic.gov.co/sites/default/files/normatividad/Ley_675_2001.pdf',
   current_date, 'Sesión de agente — verificado por WebSearch cruzando actualicese.com/'
   'minvivienda.gov.co/leyes.co (WebFetch directo falló por TLS contra dominios .gov.co, mismo '
   'problema documentado en CO-1/MANT-0), GOB-2', 'activo'),

  (null, 'ley', 'Ley 675 de 2001', 'Art. 41',
   'Reuniones de segunda convocatoria: si la asamblea general convocada no puede sesionar por '
   'falta de quórum, se convoca una nueva reunión para el tercer día hábil siguiente a la '
   'convocatoria inicial, la cual sesiona y decide válidamente con cualquier número plural de '
   'propietarios, sin importar el porcentaje de coeficientes representado. Fundamento de que '
   'gobierno_reuniones con convocatoria_regimen = ''segunda'' exige convocatoria_antecedente_id '
   '(la reunión previa que no alcanzó quórum) — SEGUNDA_CONVOCATORIA_SIN_ANTECEDENTE. El '
   'porcentaje reducido de quórum en sí no se valida en este corte (es competencia de GOB-3).',
   'ley675_2001_art41_gob2',
   'https://www.sic.gov.co/sites/default/files/normatividad/Ley_675_2001.pdf',
   current_date, 'Sesión de agente — verificado por WebSearch cruzando actualicese.com/'
   'minvivienda.gov.co/leyes.co (WebFetch directo falló por TLS contra dominios .gov.co), GOB-2', 'activo'),

  (null, 'ley', 'Ley 675 de 2001', 'Art. 47',
   'Las decisiones de la asamblea deben constar en actas firmadas por el presidente y el '
   'secretario de la misma, que expresarán con claridad y exactitud lo acontecido en las '
   'reuniones. Fundamento de que gobierno_reuniones exige presidente_miembro_id y '
   'secretario_miembro_id (ambos → gobierno_miembros) para pasar a instalada — sin ellos la '
   'reunión no puede producir un acta válida: REUNION_SIN_PRESIDENTE_O_SECRETARIO. Distinto del '
   'fundamento art. 47 ya registrado por GOB-0 (ley675_2001_art47_gob0, derecho del propietario '
   'a copia del acta) — misma norma, cláusula distinta, referencia separada para no generar '
   'ambigüedad.',
   'ley675_2001_art47_gob2_firma',
   'https://www.sic.gov.co/sites/default/files/normatividad/Ley_675_2001.pdf',
   current_date, 'Sesión de agente — verificado por WebSearch cruzando revistapropiedadhorizontal.com/'
   'minvivienda.gov.co (WebFetch directo falló por TLS contra dominios .gov.co), GOB-2', 'activo');
