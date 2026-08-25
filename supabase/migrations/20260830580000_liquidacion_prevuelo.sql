-- ═══════════════════════════════════════════════════════════════════════
--  L1 · Verificación previa a liquidar (pre-vuelo)
--  Propietario: plan "Liquidación en dos tiempos" (2026-08-24), §6/L1 + D4
--
--  Una sola función responde "¿este periodo está en condiciones de
--  liquidarse?" y la respuesta alimenta tres consumidores distintos:
--
--    · la pantalla de Pre-Liquidación, que la pinta como checklist;
--    · fn_aplicar_liquidacion (L3), que la vuelve a correr dentro de la
--      transacción y aborta si aparece un bloqueo — porque entre revisar y
--      aprobar pueden pasar horas;
--    · quien audite después, vía los avisos que se guardan al aplicar.
--
--  Tener UNA fuente para los tres es el punto: si la pantalla dijera una
--  cosa y la función de aplicar validara otra, el usuario vería un botón
--  habilitado que revienta al pulsarlo.
--
--  ═══ BLOQUEO vs. AVISO (decisión D4, confirmada con el usuario) ═══
--
--  El criterio, y la prueba práctica que lo resuelve caso por caso:
--
--    BLOQUEA  lo que produciría un resultado incorrecto o irreparable.
--    AVISA    lo que produciría un resultado correcto pero incompleto.
--
--    → ¿esto se arregla después SIN deshacer la liquidación?
--         sí  → aviso        no → bloqueo
--
--  Los bloqueos comparten que producen plata mal calculada. Los avisos
--  producen plata bien calculada con un registro incompleto: una cuenta sin
--  mapeo contable se mapea después y contable_movimientos() —que es
--  derivada, PC-5— recoge el asiento retroactivamente; una unidad sin
--  responsable vigente igual debe la cuota (debe la unidad, no la persona);
--  una novedad pendiente entra en el periodo siguiente.
--
--  ═══ UN CASO QUE PARECÍA BLOQUEO Y NO LO ES ═══
--
--  "Los coeficientes no suman 100 %" entró en el diseño como bloqueo, con
--  el razonamiento de que la diferencia quedaría sin cobrar. Es falso:
--  allocate() (packages/financial-kernel/src/allocation.ts) divide por la
--  suma REAL de los pesos, así que un set que suma 0,998 reparte el total
--  exacto igual, solo que proporcionalmente. El esquema ya lo decía —
--  coeficiente_sets.suma_total existe porque "16 §82: NO se asume 1.0".
--  Queda como aviso: el cálculo es correcto, pero el dato de origen delata
--  un defecto del reglamento o un error de digitación (Ley 675 art. 26).
--
--  ═══ LO QUE NO SE VERIFICA AQUÍ, Y POR QUÉ ═══
--
--    · Las reconciliaciones R1/R3/R4 — las hace el propio motor al
--      ensamblar el resultado (packages/liquidation-engine/src/result.ts) y
--      LANZAN en vez de devolver: si fallan no hay Pre-Liquidación que
--      revisar. Repetirlas aquí sería una segunda implementación de la
--      misma regla, que es exactamente lo que se desincroniza con el
--      tiempo.
--    · El snapshot desactualizado — no es una propiedad del periodo sino
--      de una Pre-Liquidación concreta frente a la base viva. Lo compara
--      fn_aplicar_liquidacion (L3) recalculando el hash.
-- ═══════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════
--  1. Los avisos que se aceptaron al aplicar
-- ═══════════════════════════════════════════════════════════════════════
-- Decisión del usuario (2026-08-24): un aviso ámbar que alguien acepta
-- debe quedar registrado. Meses después "¿sabíamos que la TO4-302 no tenía
-- responsable cuando liquidamos?" se responde con un sí o un no
-- verificable, no con una reconstrucción.
--
-- Se llena en la transición a 'aplicada' (L3), congelando el resultado de
-- fn_liquidacion_prevuelo de ese instante — no antes: los avisos vigentes
-- al solicitar pueden no ser los mismos que al aprobar.

alter table public.liquidaciones add column avisos_aceptados jsonb;

comment on column public.liquidaciones.avisos_aceptados is
  'Avisos (severidad=aviso) vigentes en el momento exacto de aplicar, congelados por '
  'fn_aplicar_liquidacion (L3). Null en las liquidaciones anteriores a esta migración y en las '
  'que nunca llegaron a aplicarse.';


-- ═══════════════════════════════════════════════════════════════════════
--  2. El pre-vuelo
-- ═══════════════════════════════════════════════════════════════════════
-- SECURITY INVOKER (el default, sin `security definer`) a propósito, mismo
-- criterio que contable_parametrizacion_pendiente: RLS del llamador decide
-- qué ve, así que no hace falta verificar la membresía a mano ni existe
-- riesgo de que la función filtre datos de otro tenant.
--
-- `p_liquidacion_id` es opcional porque hay dos momentos distintos: antes
-- de calcular solo se puede revisar el periodo; con una Pre-Liquidación ya
-- calculada se suma lo que depende del resultado (hoy, la variación contra
-- el periodo anterior).

create function public.fn_liquidacion_prevuelo(
  p_tenant_id      uuid,
  p_periodo_id     uuid,
  p_liquidacion_id uuid default null
)
returns table (
  severidad text,
  codigo    text,
  titulo    text,
  detalle   text
)
language sql
stable
set search_path = ''
as $$
  with periodo as (
    select * from public.periodos
    where id = p_periodo_id and tenant_id = p_tenant_id
  ),
  -- Último día del periodo — el corte para "¿esta novedad pertenece a este mes?".
  corte as (
    select (make_date(anio, mes, 1) + interval '1 month - 1 day')::date as fin
    from periodo
  ),
  set_vigente as (
    select id from public.coeficiente_sets
    where tenant_id = p_tenant_id and estado = 'vigente'
  ),
  presupuesto as (
    select pr.id, pr.monto_total
    from public.presupuestos pr, periodo p
    where pr.tenant_id = p_tenant_id and pr.anio = p.anio and pr.estado = 'vigente'
  )

  -- ══ BLOQUEOS ════════════════════════════════════════════════════════

  -- El periodo ya fue liquidado o está bloqueado. Sin esto, el error solo
  -- aparecería al final, cuando el guard rechace la transición.
  select 'bloqueo', 'PERIODO_NO_ABIERTO',
         'El periodo no está abierto',
         format('Está en estado "%s" — solo un periodo abierto puede liquidarse.', p.estado)
  from periodo p where p.estado <> 'abierto'

  union all
  -- GAP-CAR-001. Es el bloqueo más irreparable de todos: sin fecha de
  -- vencimiento, la antigüedad de cartera de esos cargos queda indefinida
  -- para siempre y ninguna corrección posterior la recupera.
  select 'bloqueo', 'PERIODO_SIN_VENCIMIENTO',
         'El periodo no tiene fecha de vencimiento',
         'Sin ella no se puede calcular la mora de los cargos que genere esta liquidación, '
         'ni ahora ni después (CAR §7.1, GAP-CAR-001).'
  from periodo p where p.fecha_vencimiento is null

  union all
  -- Liquidar fuera de orden calcula mal la mora: los intereses de este
  -- periodo se computarían sobre una cartera que todavía no incluye los
  -- cargos del anterior. El resultado es numéricamente incorrecto y solo
  -- se arregla anulando ambos.
  select 'bloqueo', 'PERIODO_ANTERIOR_SIN_LIQUIDAR',
         format('Hay %s periodo(s) anterior(es) sin liquidar', count(*)),
         format('%s — la mora de este periodo se calcularía sobre una cartera incompleta.',
                string_agg(format('%s-%s', anterior.anio, lpad(anterior.mes::text, 2, '0')),
                           ', ' order by anterior.anio, anterior.mes))
  from periodo p
  join public.periodos anterior
    on anterior.tenant_id = p_tenant_id
   and (anterior.anio, anterior.mes) < (p.anio, p.mes)
   and not exists (
     select 1 from public.liquidaciones l
     where l.periodo_id = anterior.id and l.estado = 'aplicada'
   )
  having count(*) > 0

  union all
  -- El motor exige un set vigente (snapshot-supabase.ts usa .single()). Que
  -- haya DOS es imposible: coeficiente_sets_vigente_unico (índice parcial en
  -- 20260814100100) ya lo impide. Así que este chequeo solo cubre el cero.
  select 'bloqueo', 'COEFICIENTES_SIN_SET_VIGENTE',
         'No hay una tabla de coeficientes vigente',
         'La liquidación reparte el presupuesto entre las unidades según sus coeficientes; '
         'sin una tabla vigente no hay con qué repartir.'
  from periodo p
  where not exists (select 1 from set_vigente)

  union all
  -- Una unidad activa fuera del set no paga, y su parte la absorben las
  -- demás. Es el caso anterior visto por el otro lado, y el motor lo
  -- rechaza igual (snapshot-supabase.ts) — pero aquí se dice cuál.
  select 'bloqueo', 'INMUEBLE_SIN_COEFICIENTE',
         format('%s unidad(es) activa(s) sin coeficiente', count(*)),
         format('%s — no se les cobraría nada y su parte la absorberían las demás.',
                string_agg(i.codigo, ', ' order by i.codigo))
  from public.inmuebles i
  where i.tenant_id = p_tenant_id
    and i.estado = 'activo'
    and exists (select 1 from set_vigente)
    and not exists (
      select 1 from public.coeficientes c, set_vigente sv
      where c.inmueble_id = i.id and c.set_id = sv.id
    )
  having count(*) > 0

  union all
  -- Cobrar más que lo aprobado en asamblea, o dejar gastos sin financiar.
  select 'bloqueo', 'PRESUPUESTO_DESCUADRADO',
         'El presupuesto vigente no cuadra',
         format('Los rubros de egreso suman %s frente a un monto aprobado de %s.',
                to_char(coalesce(eg.total, 0), 'FM999G999G999G990D00'),
                to_char(pre.monto_total, 'FM999G999G999G990D00'))
  from presupuesto pre
  cross join lateral (
    select sum(r.monto_anual) as total
    from public.presupuesto_rubros r
    join public.presupuesto_cuenta pc on pc.id = r.cuenta_id
    where r.presupuesto_id = pre.id and pc.naturaleza = 'egreso'
  ) eg
  where coalesce(eg.total, 0) <> pre.monto_total

  -- ══ AVISOS ══════════════════════════════════════════════════════════

  union all
  -- AVISO, no bloqueo, y la razón importa: allocate() (financial-kernel)
  -- normaliza por la suma REAL de los pesos —`dividir(intermedio,
  -- totalBasis)`— así que un set que suma 0,998 reparte igual el total
  -- exacto, proporcionalmente. No se deja de recaudar nada. El propio
  -- esquema ya lo dice: coeficiente_sets.suma_total existe porque "16 §82:
  -- NO se asume 1.0 — se persiste el valor real".
  --
  -- Se avisa igual porque Ley 675 art. 26 sí exige que sumen la unidad: un
  -- set que no lo hace delata un defecto del reglamento de propiedad
  -- horizontal o un error de digitación, y cada unidad termina pagando una
  -- fracción distinta de la que su coeficiente legal indica. El cálculo es
  -- correcto; el dato de origen, sospechoso.
  select 'aviso', 'COEFICIENTES_NO_SUMAN_UNO',
         'Los coeficientes no suman 100 %',
         format('Suman %s. El reparto es proporcional y se recauda el total completo, pero '
                'revisa la tabla: la ley exige que sumen la unidad (Ley 675 art. 26).',
                to_char(sum(c.valor), 'FM990D99999999'))
  from public.coeficientes c
  join set_vigente sv on sv.id = c.set_id
  having sum(c.valor) <> 1

  union all
  -- El motor tolera que no haya (usa .maybeSingle()); solo falla si algún
  -- concepto referencia PRESUPUESTO, y en ese caso el error viene del
  -- motor con su propio mensaje. Aquí se avisa porque casi siempre es un
  -- olvido: el presupuesto quedó en borrador y nadie lo puso vigente.
  select 'aviso', 'PRESUPUESTO_SIN_VIGENTE',
         format('No hay presupuesto vigente para %s', p.anio),
         'Los conceptos que se calculan sobre el presupuesto anual no encontrarán su base. '
         'Revisa si el presupuesto del año quedó en borrador.'
  from periodo p
  where not exists (select 1 from presupuesto)

  union all
  -- El cargo se crea bien y el residente debe lo correcto; solo el asiento
  -- sale sin imputar. Como contable_movimientos() deriva (PC-5), mapear la
  -- cuenta después hace aparecer el asiento retroactivamente.
  select 'aviso', 'CUENTA_SIN_MAPEO_CONTABLE',
         format('%s elemento(s) sin cuenta contable', count(*)),
         format('%s — los movimientos saldrán sin imputación contable hasta que se mapeen.',
                string_agg(pp.referencia, ', ' order by pp.referencia))
  from public.contable_parametrizacion_pendiente(p_tenant_id) pp
  having count(*) > 0

  union all
  -- Se liquida igual: debe la unidad, no la persona. Lo que falta es a
  -- quién enviarle el aviso de cobro.
  select 'aviso', 'INMUEBLE_SIN_RESPONSABLE',
         format('%s unidad(es) sin responsable vigente', count(*)),
         format('%s — se liquidan igual, pero no hay a quién dirigir el estado de cuenta.',
                string_agg(i.codigo, ', ' order by i.codigo))
  from public.inmuebles i
  where i.tenant_id = p_tenant_id
    and i.estado = 'activo'
    and not exists (
      select 1 from public.inmueble_persona_rol r
      where r.inmueble_id = i.id and r.vigente_hasta is null
    )
  having count(*) > 0

  union all
  -- Avisa, no bloquea (D4): una novedad puede estar pendiente por razones
  -- legítimas —falta el soporte, está en discusión con el residente— y
  -- frenar la liquidación de toda la copropiedad por una multa en disputa
  -- es desproporcionado. Entra en el periodo siguiente.
  select 'aviso', 'NOVEDADES_PENDIENTES',
         format('%s novedad(es) pendiente(s) de aprobación', count(*)),
         'No entran en esta liquidación. Si alguna debía entrar, apruébala antes de aplicar.'
  from public.novedades n, corte c
  where n.tenant_id = p_tenant_id
    and n.estado = 'pendiente'
    and n.inhabilitada_at is null
    and n.fecha_efectiva <= c.fin
  having count(*) > 0

  union all
  -- Solo con una Pre-Liquidación ya calculada. Es el aviso que más veces
  -- evita un desastre, y justamente por eso no puede bloquear: una subida
  -- del 40 % es legítima cuando entra una cuota extraordinaria.
  select 'aviso', 'VARIACION_ALTA',
         format('El total varía %s%% frente al periodo anterior',
                to_char(round(((actual.tenant_total - previa.tenant_total)
                               / nullif(previa.tenant_total, 0)) * 100, 1), 'FM990D0')),
         format('Antes %s, ahora %s. Verifica que el cambio sea intencional.',
                to_char(previa.tenant_total, 'FM999G999G999G990D00'),
                to_char(actual.tenant_total, 'FM999G999G999G990D00'))
  from public.liquidaciones actual
  join periodo p on p.id = actual.periodo_id
  join lateral (
    select l.tenant_total
    from public.liquidaciones l
    join public.periodos pa on pa.id = l.periodo_id
    where l.tenant_id = p_tenant_id
      and l.estado = 'aplicada'
      and (pa.anio, pa.mes) < (p.anio, p.mes)
    order by pa.anio desc, pa.mes desc
    limit 1
  ) previa on true
  where actual.id = p_liquidacion_id
    and previa.tenant_total <> 0
    and abs((actual.tenant_total - previa.tenant_total) / previa.tenant_total) > 0.15
$$;

comment on function public.fn_liquidacion_prevuelo(uuid, uuid, uuid) is
  'Verificación previa a liquidar (plan 2026-08-24 §6/L1, decisión D4). Devuelve una fila por '
  'hallazgo con severidad bloqueo|aviso. Fuente única para la pantalla, para '
  'fn_aplicar_liquidacion (que la re-corre dentro de la transacción) y para el registro de '
  'avisos aceptados. Bloquea lo que produce un resultado incorrecto o irreparable; avisa lo que '
  'produce un resultado correcto pero incompleto. No repite las reconciliaciones R1/R3/R4 (las '
  'hace el motor, y lanzan) ni la validación del snapshot (esa compara contra la base viva en L3).';

grant execute on function public.fn_liquidacion_prevuelo(uuid, uuid, uuid) to authenticated;
