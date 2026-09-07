-- ═══════════════════════════════════════════════════════════════════════
--  GOB-1 · Obligatoriedad derivada del tipo de copropiedad
--  Ver GOB_01_organos_gobierno.md §4.4, pruebas 9-10
--
--  Calculado, no almacenado (marco §6.3: "el estado agregado se calcula, no
--  se almacena") — el consumidor (UI) llama esta función para pintar
--  advertencias, nunca bloqueantes ("el sistema no puede impedir que una
--  copropiedad incumpla, solo señalarlo").
--
--  Umbral del art. 53 VERIFICADO contra fuente primaria en esta sesión
--  (funcionpublica.gov.co/leyes.co): el consejo es obligatorio SOLO para
--  uso comercial o mixto con más de 30 unidades privadas (parqueaderos y
--  depósitos excluidos del conteo); para uso RESIDENCIAL nunca es
--  obligatorio, sin importar el número de unidades — confirmado
--  explícitamente, no asumido. Se implementa siguiendo esta verificación
--  (§4.4: "implementar solo si el umbral se verificó").
-- ═══════════════════════════════════════════════════════════════════════

create function public.gobierno_obligatoriedad_faltante(p_tenant_id uuid, p_fecha date default current_date)
returns table (
  obligacion  text,
  cumplida    boolean,
  motivo      text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_marco record;
  v_unidades int;
  v_tiene_revisoria boolean;
  v_tiene_consejo boolean;
begin
  select * into v_marco from public.tenant_marco_contable(p_tenant_id);

  -- Sin clasificar (CO-1): no se evalúa nada — el banner de CO-1 ya cubre este caso, no se
  -- duplica aquí (prueba 10).
  if v_marco.clasificado is not true then
    return;
  end if;

  if v_marco.uso_economico not in ('comercial', 'mixto') then
    return;
  end if;

  select exists (
    select 1 from public.gobierno_organos go
    join public.lista_tipos lt on lt.id = go.tipo_id
    where go.tenant_id = p_tenant_id
      and lt.codigo = 'revisoria_fiscal'
      and go.vigente_desde <= p_fecha
      and (go.vigente_hasta is null or go.vigente_hasta >= p_fecha)
  ) into v_tiene_revisoria;

  return query select
    'revisoria_fiscal'::text, v_tiene_revisoria,
    'Ley 675 art. 56: revisoría fiscal obligatoria en uso comercial o mixto'::text;

  select count(*) into v_unidades
  from public.inmuebles i
  join public.lista_tipos lt on lt.id = i.tipo_id
  where i.tenant_id = p_tenant_id
    and lt.codigo not in ('parqueadero', 'deposito');

  if v_unidades > 30 then
    select exists (
      select 1 from public.gobierno_organos go
      join public.lista_tipos lt on lt.id = go.tipo_id
      where go.tenant_id = p_tenant_id
        and lt.codigo = 'consejo_administracion'
        and go.vigente_desde <= p_fecha
        and (go.vigente_hasta is null or go.vigente_hasta >= p_fecha)
    ) into v_tiene_consejo;

    return query select
      'consejo_administracion'::text, v_tiene_consejo,
      'Ley 675 art. 53: consejo de administración obligatorio en uso comercial/mixto con más '
      'de 30 unidades privadas (parqueaderos y depósitos excluidos del conteo)'::text;
  end if;
end;
$$;

comment on function public.gobierno_obligatoriedad_faltante(uuid, date) is
  'GOB-1 §4.4: obligaciones de órgano derivadas de uso_economico/tamaño, calculadas en vivo. '
  'Nunca bloquea — solo señala. Vacío si el tenant no está clasificado (CO-1) o es residencial '
  '(nunca obligatorio, sea cual sea su tamaño — art. 53 verificado).';

-- ── Fundamentos legales — art. 51, 53, 54, 56, 58, 60 ────────────────────
-- Verificados contra fuente primaria (funcionpublica.gov.co / leyes.co, cruzados con el mirror
-- de secretariasenado.gov.co) en esta sesión.
insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por, estado)
values
  (null, 'ley', 'Ley 675 de 2001', 'Art. 51',
   'Funciones del administrador: tiene a su cargo la ejecución, conservación, representación y '
   'recaudo del edificio o conjunto; lleva los libros de actas de asamblea y registro de '
   'propietarios y residentes; lleva la contabilidad; convoca la asamblea y somete a su '
   'aprobación el inventario, el balance general del ejercicio anterior y el presupuesto '
   'detallado de ingresos y gastos del nuevo ejercicio.',
   'ley675_2001_art51_gob1',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — verificado contra funcionpublica.gov.co/leyes.co, GOB-1', 'activo'),

  (null, 'ley', 'Ley 675 de 2001', 'Art. 53',
   'Obligatoriedad del consejo de administración: obligatorio en edificios o conjuntos de uso '
   'comercial o mixto con más de treinta (30) unidades privadas (excluidos parqueaderos y '
   'depósitos), integrado por un número impar de tres (3) o más propietarios o sus delegados. '
   'Con 30 o menos unidades es opcional (a discreción del reglamento). Para uso RESIDENCIAL es '
   'siempre opcional, sin importar el número de unidades — verificado explícitamente.',
   'ley675_2001_art53_gob1',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — verificado contra funcionpublica.gov.co/leyes.co, GOB-1', 'activo'),

  (null, 'ley', 'Ley 675 de 2001', 'Art. 54',
   'Quórum y mayorías del consejo de administración: delibera y decide válidamente con la '
   'presencia y votos de la mayoría de sus miembros, salvo que el reglamento de propiedad '
   'horizontal estipule un quórum superior, con independencia de los coeficientes de '
   'copropiedad. PISO LEGAL: el reglamento puede exigir más, nunca menos.',
   'ley675_2001_art54_gob1',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — verificado contra funcionpublica.gov.co/leyes.co, GOB-1', 'activo'),

  (null, 'ley', 'Ley 675 de 2001', 'Art. 56',
   'Revisoría fiscal: los conjuntos de uso comercial o mixto están obligados a contar con '
   'revisor fiscal, contador público titulado con matrícula profesional vigente e inscrito en '
   'la Junta Central de Contadores, elegido por la asamblea general de propietarios. El '
   'revisor fiscal no puede ser propietario ni tenedor de bienes privados del edificio o '
   'conjunto, ni tener parentesco o vínculo comercial que le reste independencia.',
   'ley675_2001_art56_gob1',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — verificado contra funcionpublica.gov.co/leyes.co, GOB-1', 'activo'),

  (null, 'ley', 'Ley 675 de 2001', 'Art. 58',
   'Comité de convivencia: para resolver conflictos entre propietarios o tenedores, o entre '
   'estos y el administrador/consejo/cualquier otro órgano, se puede intentar la intervención '
   'de un comité de convivencia, integrado por un número impar de tres (3) o más personas, '
   'elegidas por la asamblea general para un período de un (1) año. Sus consideraciones '
   'constan en acta; la participación es ad honórem. Parágrafo: el comité NO puede, en ningún '
   'caso, imponer sanciones.',
   'ley675_2001_art58_gob1',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — verificado contra funcionpublica.gov.co/leyes.co, GOB-1', 'activo'),

  (null, 'ley', 'Ley 675 de 2001', 'Art. 60',
   'Las sanciones (art. 59) las impone la asamblea general o el consejo de administración, '
   'cuando este exista y el reglamento de propiedad horizontal le haya atribuido esa facultad. '
   'Se debe respetar el procedimiento del reglamento, el debido proceso, el derecho de defensa '
   'y contradicción, y criterios de proporcionalidad y graduación según gravedad, daño y '
   'reincidencia. REMISIÓN AL REGLAMENTO: la atribución sancionatoria del consejo solo existe '
   'si el reglamento la estipula.',
   'ley675_2001_art60_gob1',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — verificado contra funcionpublica.gov.co/leyes.co, GOB-1', 'activo');
