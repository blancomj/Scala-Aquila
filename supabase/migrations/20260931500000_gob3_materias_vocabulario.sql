-- ═══════════════════════════════════════════════════════════════════════
--  GOB-3 · Motor de quórum y votación — catálogo global de materias
--  Ver GOB_03_quorum_votacion.md §3, §4.1
--
--  HALLAZGO DEL PLAN DEL CORTE, confirmado con el usuario: el art. 46 de la
--  Ley 675 de 2001 tiene DIEZ numerales (verificado cruzando leyes.co,
--  revistapropiedadhorizontal.com y WebSearch — WebFetch directo contra
--  funcionpublica.gov.co/sic.gov.co falló por TLS, mismo problema ya
--  documentado en CO-1/MANT-0/GOB-2), no siete como decía el texto del
--  corte (probablemente escrito contra una versión desactualizada o
--  resumida). Se siembran los DIEZ reales, mismo criterio que D-60 (confiar
--  en la fuente verificada sobre el documento de planeación). El texto de
--  los numerales 2, 4 y 7 no pudo verificarse palabra por palabra contra el
--  Diario Oficial en este entorno (mismo límite de TLS) — el contenido
--  jurídico coincide entre las dos fuentes secundarias cruzadas, pero la
--  redacción exacta debería confirmarse antes de usarse en un acta con
--  valor probatorio (pregunta abierta para el abogado, GOB_03_INFORME.md).
--
--  'extincion_ph' es una materia APARTE de los diez numerales del art. 46 —
--  el propio art. 45 la exceptúa explícitamente del techo del 70%
--  ("para ninguna decisión, salvo la relativa a la extinción de la
--  propiedad horizontal, se podrá exigir mayoría superior al 70%"), lo que
--  significa que el reglamento SÍ puede exigir más del 70% para ella (sin
--  techo legal). No debe confundirse con el numeral 10 ("liquidación y
--  disolución" de la persona jurídica administradora), que sigue topado al
--  70% como el resto de la lista.
--
--  De las diez materias del art. 46, solo DOS tienen un código ya sembrado
--  en ATRIBUCION_ORGANO (GOB-1) que calza exactamente:
--   - expensas_extraordinarias      → aprobar_cuota_extraordinaria
--   - reforma_estatutos_reglamento  → reformar_reglamento
--  Las otras ocho (+ extincion_ph) quedan con organo_competente_atribucion_id
--  NULL — decisión confirmada con el usuario (Plan del corte): no se
--  inventan códigos ATRIBUCION_ORGANO nuevos no autorizados por GOB-1
--  (mismo criterio que D-61 con 'aprobar_gasto'). VOTACION_ORGANO_
--  INCOMPETENTE solo se valida cuando la materia sí tiene atribución
--  vinculada.
-- ═══════════════════════════════════════════════════════════════════════

create type public.mayoria_tipo_t as enum ('ordinaria', 'calificada_70', 'unanimidad');

comment on type public.mayoria_tipo_t is
  'D-24: determina el piso y el techo legal de gobierno_regla_mayoria.mayoria_pct — ordinaria: '
  'piso 50 (mitad+1 de los representados, art. 45), techo 70; calificada_70: piso=techo=70 (art. '
  '46, fijo, sin margen de configuración real); unanimidad: piso=techo=100. No es vocabulario '
  'descriptivo — cambia el cálculo del resultado de la votación.';

create type public.base_calculo_t as enum ('coeficientes_representados', 'coeficientes_totales');

comment on type public.base_calculo_t is
  'D-24: sobre qué universo se mide la mayoría de una votación en una reunión de tipo asamblea — '
  'coeficientes_representados (los presentes en la sesión, art. 45) o coeficientes_totales (los '
  'que integran el edificio o conjunto, art. 46). Confundir estas dos bases es el error más común '
  'del sector (GOB_03_quorum_votacion.md §2) — el enum lo hace imposible de confundir en código.';

create table public.gobierno_materia_decision (
  id                             bigint generated always as identity primary key,
  codigo                         text not null unique,
  nombre                         text not null,
  descripcion                    text not null,
  mayoria_tipo                   public.mayoria_tipo_t not null,
  base_calculo                   public.base_calculo_t not null,
  numeral_articulo               text,
  fundamento_normativo_id        bigint references public.fundamento_normativo (id),
  admite_no_presencial           boolean not null default true,
  admite_segunda_convocatoria    boolean not null default true,
  organo_competente_atribucion_id bigint references public.lista_tipos (id),
  created_at                     timestamptz not null default now()
);

alter table public.gobierno_materia_decision enable row level security;
alter table public.gobierno_materia_decision force row level security;

create policy gobierno_materia_decision_select_autenticado
  on public.gobierno_materia_decision for select to authenticated using (true);

comment on table public.gobierno_materia_decision is
  'GOB-3: catálogo GLOBAL de materias de decisión — sin tenant_id, cambia solo por migración '
  '(mismo criterio que contable_plan_cuenta). Las diez del art. 46 (LISTA LEGAL CERRADA, marco '
  '§3) más extincion_ph (art. 45, sin techo) y ordinaria (materia por defecto, art. 45). '
  'MATERIA_LEGAL_INMUTABLE bloquea cualquier insert/update/delete en runtime, sin excepción — '
  'incluso para service_role, por diseño (ver guard_gobierno_materia_decision).';

create function public.guard_gobierno_materia_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'MATERIA_LEGAL_INMUTABLE: gobierno_materia_decision es un catálogo legal — '
    'no se puede insertar, modificar ni eliminar en tiempo de ejecución, solo por migración '
    '(Ley 675 art. 46, lista taxativa)';
end;
$$;

comment on function public.guard_gobierno_materia_decision() is
  'GOB-3: MATERIA_LEGAL_INMUTABLE — ninguna materia se añade, modifica ni elimina en runtime, '
  'ni siquiera con service_role. El catálogo del art. 46 es taxativo (marco §3, LISTA LEGAL '
  'CERRADA).';

-- NOTA: el trigger se crea AL FINAL de esta migración, después de sembrar las 12 materias — si
-- se creara aquí, bloquearía el propio insert de siembra de más abajo (MATERIA_LEGAL_INMUTABLE
-- no distingue "migración" de "runtime", a propósito: es genuinamente inmutable siempre).

-- ── Fundamentos legales — art. 45 y 46 de la Ley 675 de 2001 ────────────
insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por, estado)
values
  (null, 'ley', 'Ley 675 de 2001', 'Art. 45',
   'Quórum y mayorías: la asamblea general sesiona con un número plural de propietarios de '
   'unidades privadas que representen, por lo menos, más de la mitad de los coeficientes de '
   'propiedad, y decide con el voto favorable de la mitad más uno de los coeficientes '
   'representados en la sesión. Para ninguna decisión, salvo la extinción de la propiedad '
   'horizontal, se podrá exigir una mayoría superior al 70% de los coeficientes que integran el '
   'edificio o conjunto — las mayorías superiores previstas en los reglamentos se entienden por '
   'no escritas, y las decisiones en contravención son absolutamente nulas. Fundamento del piso '
   '(quórum >50%, mayoría ordinaria mitad+1 de representados) y del techo (70% de totales, salvo '
   'extinción) de gobierno_regla_mayoria.',
   'ley675_2001_art45_gob3',
   'https://www.sic.gov.co/sites/default/files/normatividad/Ley_675_2001.pdf',
   current_date, 'Sesión de agente — verificado por WebSearch cruzando revistapropiedadhorizontal.com/'
   'gerencie.com/academia-lab.com (WebFetch directo falló por TLS contra dominios .gov.co), GOB-3', 'activo'),

  (null, 'ley', 'Ley 675 de 2001', 'Art. 46',
   'Decisiones que exigen mayoría calificada del 70% de los coeficientes de copropiedad que '
   'integran el edificio o conjunto (base: coeficientes TOTALES, no representados): (1) cambios '
   'que afecten la destinación de los bienes comunes o impliquen sensible disminución en uso y '
   'goce; (2) imposición de expensas extraordinarias cuya cuantía total supere 4 veces las '
   'expensas necesarias mensuales; (3) aprobación de expensas comunes diferentes de las '
   'necesarias; (4) asignación de uso y goce exclusivo de un bien común; (5) reforma a los '
   'estatutos y reglamento; (6) desafectación de un bien común no esencial; (7) reconstrucción '
   'del edificio o conjunto destruido en proporción ≥75%; (8) cambio de destinación genérica de '
   'bienes de dominio particular; (9) adquisición de inmuebles para el edificio o conjunto; '
   '(10) liquidación y disolución. Parágrafo: estas decisiones no pueden tomarse en reuniones no '
   'presenciales ni de segunda convocatoria, salvo que en este último caso se obtenga la mayoría '
   'exigida por esta ley (el 70% de los totales, ver §4.4 del corte). NOTA: el texto de los '
   'numerales 2, 4 y 7 no pudo verificarse palabra por palabra contra el Diario Oficial en este '
   'entorno (WebFetch falló por TLS); el contenido jurídico coincide entre las fuentes '
   'secundarias cruzadas, pero la redacción exacta debería confirmarse con el abogado antes de '
   'usarse en un acta con valor probatorio.',
   'ley675_2001_art46_gob3',
   'https://www.sic.gov.co/sites/default/files/normatividad/Ley_675_2001.pdf',
   current_date, 'Sesión de agente — verificado por WebSearch cruzando leyes.co/'
   'revistapropiedadhorizontal.com/gerencie.com (WebFetch directo falló por TLS contra dominios '
   '.gov.co), GOB-3', 'activo'),

  (null, 'ley', 'Ley 675 de 2001', 'Art. 54',
   'El consejo de administración delibera y decide válidamente con la presencia y los votos de '
   'la mayoría de sus miembros (mitad más uno), con independencia de los coeficientes de '
   'propiedad — el reglamento puede exigir un quórum superior, nunca inferior. Cada miembro del '
   'consejo tiene un voto (no se pondera por coeficiente). Fundamento de que gobierno_votaciones '
   'en una reunión de consejo_administracion se calcula por miembros, no por coeficientes '
   '(GOB-3, prueba 12).',
   'ley675_2001_art54_gob3',
   'https://www.sic.gov.co/sites/default/files/normatividad/Ley_675_2001.pdf',
   current_date, 'Sesión de agente — verificado por WebSearch cruzando revistapropiedadhorizontal.com/'
   'minvivienda.gov.co (WebFetch directo falló por TLS contra dominios .gov.co), GOB-3', 'activo');

-- ── Siembra: las diez materias del art. 46 + extincion_ph (art. 45) + ordinaria (art. 45) ──
do $seed$
declare
  v_fund_art46 bigint;
  v_atrib_cuota_extra bigint;
  v_atrib_reforma bigint;
begin
  select id into v_fund_art46 from public.fundamento_normativo where referencia = 'ley675_2001_art46_gob3';
  select id into v_atrib_cuota_extra from public.lista_tipos where tipo = 'ATRIBUCION_ORGANO' and codigo = 'aprobar_cuota_extraordinaria';
  select id into v_atrib_reforma from public.lista_tipos where tipo = 'ATRIBUCION_ORGANO' and codigo = 'reformar_reglamento';

  insert into public.gobierno_materia_decision
    (codigo, nombre, descripcion, mayoria_tipo, base_calculo, numeral_articulo,
     fundamento_normativo_id, admite_no_presencial, admite_segunda_convocatoria, organo_competente_atribucion_id)
  values
    ('cambio_destinacion_bien_comun', 'Cambio de destinación de bien común',
     'Cambios que afecten la destinación de los bienes comunes o impliquen una sensible '
     'disminución en uso y goce.', 'calificada_70', 'coeficientes_totales', '46.1',
     v_fund_art46, false, true, null),

    ('expensas_extraordinarias', 'Expensas extraordinarias > 4x mensuales',
     'Imposición de expensas extraordinarias cuya cuantía total, durante la vigencia '
     'presupuestal, supere cuatro (4) veces el valor de las expensas necesarias mensuales.',
     'calificada_70', 'coeficientes_totales', '46.2', v_fund_art46, false, true, v_atrib_cuota_extra),

    ('expensas_comunes_diferentes', 'Expensas comunes diferentes de las necesarias',
     'Aprobación de expensas comunes diferentes de las necesarias.',
     'calificada_70', 'coeficientes_totales', '46.3', v_fund_art46, false, true, null),

    ('asignacion_uso_exclusivo', 'Asignación de uso exclusivo de bien común',
     'Asignación de un bien común al uso y goce exclusivo de un determinado bien privado, '
     'cuando así lo haya solicitado un copropietario.', 'calificada_70', 'coeficientes_totales',
     '46.4', v_fund_art46, false, true, null),

    ('reforma_estatutos_reglamento', 'Reforma a los estatutos y reglamento',
     'Reforma a los estatutos y reglamento.', 'calificada_70', 'coeficientes_totales', '46.5',
     v_fund_art46, false, true, v_atrib_reforma),

    ('desafectacion_bien_comun', 'Desafectación de bien común no esencial',
     'Desafectación de un bien común no esencial.', 'calificada_70', 'coeficientes_totales',
     '46.6', v_fund_art46, false, true, null),

    ('reconstruccion_edificio', 'Reconstrucción del edificio o conjunto',
     'Reconstrucción del edificio o conjunto destruido en proporción que represente por lo '
     'menos el setenta y cinco por ciento (75%).', 'calificada_70', 'coeficientes_totales',
     '46.7', v_fund_art46, false, true, null),

    ('cambio_destinacion_bien_privado', 'Cambio de destinación genérica de bien privado',
     'Cambio de destinación genérica de los bienes de dominio particular, siempre y cuando se '
     'ajuste a la normatividad urbanística vigente.', 'calificada_70', 'coeficientes_totales',
     '46.8', v_fund_art46, false, true, null),

    ('adquisicion_inmuebles', 'Adquisición de inmuebles',
     'Adquisición de inmuebles para el edificio o conjunto.', 'calificada_70',
     'coeficientes_totales', '46.9', v_fund_art46, false, true, null),

    ('liquidacion_disolucion', 'Liquidación y disolución',
     'Liquidación y disolución.', 'calificada_70', 'coeficientes_totales', '46.10',
     v_fund_art46, false, true, null),

    ('extincion_ph', 'Extinción de la propiedad horizontal',
     'Extinción de la propiedad horizontal — única decisión que el art. 45 exceptúa '
     'explícitamente del techo del 70%: el reglamento puede exigir una mayoría superior. No '
     'confundir con "liquidación y disolución" (numeral 10), que sí está topada al 70%.',
     'calificada_70', 'coeficientes_totales', '45', null, false, true, null),

    ('ordinaria', 'Decisión ordinaria',
     'Cualquier decisión no listada en el art. 46 ni la extinción de la PH — mayoría de la '
     'mitad más uno de los coeficientes representados en la sesión (art. 45).', 'ordinaria',
     'coeficientes_representados', '45', null, true, true, null);
end;
$seed$;

-- Ahora sí: el catálogo queda genuinamente inmutable, incluida esta misma migración si se
-- reintentara.
create trigger guard_gobierno_materia_decision
  before insert or update or delete on public.gobierno_materia_decision
  for each row execute function public.guard_gobierno_materia_decision();
