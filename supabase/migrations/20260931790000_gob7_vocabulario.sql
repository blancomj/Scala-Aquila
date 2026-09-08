-- ═══════════════════════════════════════════════════════════════════════
--  GOB-7 · Impugnación — vocabulario
--  Ver GOB_07_impugnacion.md §3, §4.1.
--
--  Los tres enums gobiernan transiciones/efectos reales (D-24):
--  impugnacion_objeto_t decide qué FK se resuelve y qué efecto aplica al
--  resolver; impugnacion_estado_t es la FSM de gobierno_impugnaciones;
--  impugnacion_resultado_t gatilla el efecto sobre el objeto impugnado
--  (§4.2) — ninguno es vocabulario descriptivo.
--
--  Los dos plazos del corte (art. 49 y art. 62) siguen "por verificar"
--  (spec §3): se registran aquí como fundamento_normativo con
--  fecha_vigencia/descripcion marcando ese estado explícitamente, NO como
--  constantes de código — el valor real (plazo_dias) lo configura cada
--  tenant en gobierno_parametro_impugnacion (migración siguiente).
-- ═══════════════════════════════════════════════════════════════════════

create type public.impugnacion_objeto_t as enum ('decision', 'sancion');

comment on type public.impugnacion_objeto_t is
  'D-24: gatilla qué FK de gobierno_impugnaciones está poblada (decision_id | expediente_id, '
  'exactamente una, check gobierno_impugnaciones_objeto_check) y qué efecto aplica '
  'gobierno_resolver_impugnacion() sobre el objeto — decisión (art. 49, Ley 675) o expediente '
  'sancionatorio de convivencia (art. 62, Ley 675). "sancion" resuelve sobre el EXPEDIENTE '
  '(gobierno_expedientes_convivencia), no sobre gobierno_sanciones directamente — el expediente '
  'es el objeto que efectivamente transiciona (spec §4.2: "el expediente a la etapa impugnacion").';

create type public.impugnacion_estado_t as enum ('presentada', 'en_tramite', 'resuelta', 'desistida');

comment on type public.impugnacion_estado_t is
  'D-24: FSM de gobierno_impugnaciones. presentada la asigna gobierno_presentar_impugnacion(); '
  'en_tramite y desistida las asigna gobierno_registrar_actuacion_impugnacion() (reservadas para '
  'gobierno_resolver_impugnacion(): presentada y resuelta, mismo criterio de reserva que '
  'gobierno_registrar_actuacion de GOB-6). desistida queda declarada sin más regla operativa que '
  'la del spec (retiro voluntario del impugnante) — ninguna de las 12 pruebas del corte la '
  'ejercita más allá de existir como valor válido (mismo criterio que "anulada" en '
  'gobierno_decision_estado_t, GOB-5: ver pregunta abierta en GOB_07_INFORME.md).';

create type public.impugnacion_resultado_t as enum ('confirmada', 'revocada', 'modificada', 'inadmitida');

comment on type public.impugnacion_resultado_t is
  'D-24: gatilla el efecto sobre el objeto impugnado al resolver (spec §4.2). Para objeto '
  '''decision'': confirmada/modificada/inadmitida → vigente, revocada → anulada. Para objeto '
  '''sancion'' (vía expediente): confirmada/revocada → etapa firme (revocada además marca la '
  'sanción sin efecto y reversa el cargo si fue multa), modificada/inadmitida → etapa vuelve a '
  'sancion_impuesta.';

-- ── Fundamentos legales de este corte — art. 49 y art. 62, aún sin registrar ──
-- Mismo patrón que fundamento_normativo de GOB-0..6: tenant_id NULL = norma de plataforma.
-- fecha_vigencia queda NULL y la descripción marca explícitamente "plazo por verificar" (spec
-- §3) — NUNCA se inventa una fecha de validación que no ocurrió.
insert into public.fundamento_normativo (tenant_id, tipo, norma, articulo, descripcion, referencia)
values
  (null, 'ley', 'Ley 675 de 2001', 'art. 49',
   'Impugnación de decisiones de la asamblea, con remisión al procedimiento del Código de '
   'Comercio. GOB-7 §3: plazo por verificar — las fuentes secundarias no coinciden con el texto '
   'ni la remisión vigente. No usar como fecha_vigencia validada hasta confirmar contra fuente '
   'primaria (suin-juriscol.gov.co).',
   'ley675_2001_art49_gob7'),
  (null, 'ley', 'Ley 675 de 2001', 'art. 62',
   'Impugnación de las sanciones por incumplimiento de obligaciones no pecuniarias. GOB-7 §3: '
   'plazo por verificar — las fuentes secundarias discrepan entre uno y dos meses. No usar como '
   'fecha_vigencia validada hasta confirmar contra fuente primaria (suin-juriscol.gov.co).',
   'ley675_2001_art62_gob7');

-- ── Extiende GOB-6: reserva las etapas que este corte gobierna ──────────
-- gobierno_registrar_actuacion() (20260931750000) no bloqueaba 'impugnacion' ni 'firme' porque
-- GOB-6 las declaró pero no las usaba — GOB-7 sí las usa desde funciones propias
-- (gobierno_presentar_impugnacion/gobierno_resolver_impugnacion), así que deben quedar
-- reservadas aquí igual que 'reportado'/'sancion_impuesta'/'archivado' ya lo estaban.
create or replace function public.gobierno_registrar_actuacion(
  p_expediente_id uuid,
  p_etapa public.gobierno_expediente_etapa_t,
  p_fecha date,
  p_descripcion text,
  p_documento_id uuid default null,
  p_plazo_dias integer default null
)
returns public.gobierno_expediente_actuaciones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expediente public.gobierno_expedientes_convivencia;
  v_fecha_limite date;
  v_actuacion public.gobierno_expediente_actuaciones;
begin
  select * into v_expediente from public.gobierno_expedientes_convivencia where id = p_expediente_id;
  if not found then
    raise exception 'EXPEDIENTE_INEXISTENTE: expediente % no existe', p_expediente_id;
  end if;

  if (select auth.uid()) is not null
     and not public.has_role(v_expediente.tenant_id, array['auxiliar']::public.tenant_role_t[])
  then
    raise exception 'EXPEDIENTE_TRANSICION_REQUIERE_AUXILIAR: registrar una actuación exige rol '
      'auxiliar';
  end if;

  if v_expediente.etapa in ('archivado', 'firme') then
    raise exception 'EXPEDIENTE_ETAPA_TERMINAL: el expediente % ya está en % (terminal), no '
      'admite nuevas actuaciones', p_expediente_id, v_expediente.etapa;
  end if;

  if p_etapa in ('reportado', 'sancion_impuesta', 'archivado', 'impugnacion', 'firme') then
    raise exception 'ACTUACION_ETAPA_RESERVADA: la etapa % no se registra con esta función — '
      'reportado se crea al reportar el expediente, sancion_impuesta exige '
      'gobierno_imponer_sancion(), archivado exige gobierno_archivar_expediente(), '
      'impugnacion/firme exigen las funciones de GOB-7 (gobierno_presentar_impugnacion/'
      'gobierno_resolver_impugnacion)', p_etapa;
  end if;

  if p_plazo_dias is not null then
    v_fecha_limite := p_fecha + p_plazo_dias;
  end if;

  insert into public.gobierno_expediente_actuaciones (
    tenant_id, expediente_id, etapa, fecha, descripcion, documento_id, plazo_dias, fecha_limite
  ) values (
    v_expediente.tenant_id, p_expediente_id, p_etapa, p_fecha, p_descripcion, p_documento_id,
    p_plazo_dias, v_fecha_limite
  )
  returning * into v_actuacion;

  update public.gobierno_expedientes_convivencia set etapa = p_etapa, updated_at = now()
  where id = p_expediente_id;

  return v_actuacion;
end;
$$;

comment on function public.gobierno_registrar_actuacion(uuid, public.gobierno_expediente_etapa_t, date, text, uuid, integer) is
  'GOB-6: registra un hito procesal (conciliacion_comite/requerimiento_escrito/descargos) y '
  'avanza gobierno_expedientes_convivencia.etapa al mismo valor — el log ES el mecanismo de '
  'avance, no hay un UPDATE directo aparte. GOB-7 amplía la lista de etapas reservadas con '
  'impugnacion/firme.';
