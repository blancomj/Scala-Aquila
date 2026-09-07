-- ═══════════════════════════════════════════════════════════════════════
--  GOB-0 · Fundamentos legales — art. 18, 47 y 59 de la Ley 675 de 2001
--  Ver GOB_00_prerrequisitos_bloqueantes.md §3.1, §4.1, entregable #4.
--
--  Verificados contra fuente primaria (funcionpublica.gov.co / leyes.co,
--  cruzados con el mirror de secretariasenado.gov.co) en esta sesión.
--
--  NOTA: ya existe una fila con articulo='Art. 59' (referencia
--  'ley675_2001_art59', migración 20260902100000) cuya descripción habla de
--  "decisiones de asamblea por mayoría de asistentes" — contenido que NO
--  corresponde al art. 59 real (que es el régimen de sanciones por
--  incumplimiento de obligaciones no pecuniarias). No se corrige aquí: está
--  fuera del alcance de este corte tocar fundamentos de otro módulo, se deja
--  reportado en GOB_00_INFORME.md como hallazgo para quien revise ese
--  fundamento. Esta migración inserta su propia fila con `referencia`
--  distinta para no generar ambigüedad.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por, estado)
values
  (null, 'ley', 'Ley 675 de 2001', 'Art. 18',
   'Obligaciones de los propietarios respecto de los bienes de dominio particular: usarlos '
   'según su naturaleza y destinación conforme al reglamento de propiedad horizontal, sin '
   'comprometer la seguridad o solidez del edificio ni perturbar la tranquilidad de los demás '
   'propietarios u ocupantes. En uso comercial o mixto, la unidad solo puede destinarse a los '
   'fines convenidos en el reglamento salvo autorización de la asamblea. Fundamento de que el '
   'reglamento (y por extensión el sistema) obliga tanto a propietarios como a tenedores.',
   'ley675_2001_art18_gob0',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — verificado contra funcionpublica.gov.co/leyes.co, GOB-0', 'activo'),

  (null, 'ley', 'Ley 675 de 2001', 'Art. 47',
   'Derecho del propietario a copia del acta de asamblea: el administrador debe ponerla a '
   'disposición dentro de los 20 días hábiles siguientes a la reunión. Si se le niega la '
   'entrega, el propietario puede reclamar ante el Alcalde Municipal o Distrital (o su '
   'delegado), quien ordena la entrega so pena de sanción policiva. Fundamento de la '
   'obligación de dar acceso a información a quien, por AD-26, no tiene sesión en el sistema.',
   'ley675_2001_art47_gob0',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — verificado contra funcionpublica.gov.co/leyes.co, GOB-0', 'activo'),

  (null, 'ley', 'Ley 675 de 2001', 'Art. 59',
   'Clases de sanciones por incumplimiento de obligaciones no pecuniarias: aplican a '
   '"los propietarios, tenedores o terceros por los que estos deban responder", previo '
   'requerimiento escrito con plazo para cumplir. Sanciones: publicación de infractores en '
   'lugares de amplia circulación, multas sucesivas (máx. dos veces las expensas necesarias '
   'mensuales cada una, tope acumulado diez veces), y restricción de uso de bienes comunes NO '
   'esenciales (nunca de bienes esenciales ni de dominio privado). Fundamento de que existe un '
   'sujeto "tenedor" sancionable, y de que el propietario responde por él.',
   'ley675_2001_art59_gob0_tenedores',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — verificado contra funcionpublica.gov.co/leyes.co, GOB-0', 'activo');
