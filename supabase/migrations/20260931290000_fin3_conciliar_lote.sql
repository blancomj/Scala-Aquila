-- ═══════════════════════════════════════════════════════════════════════
--  FIN-3 · Programación y ejecución de pagos por lote (8/8)
--
--  El motor de conciliación bancaria existente (extracto_bancario/
--  extracto_linea/conciliacion_propuesta, 20260904170000) está construido
--  exclusivamente para RECAUDO entrante: conciliacion_propuesta.inmueble_id
--  es `not null` — no tiene ni puede tener noción de proveedor ni de lote.
--  El §3.7 del corte asume que ese motor "detecta la línea que
--  corresponde" a un pago saliente, lo cual es estructuralmente imposible
--  contra el esquema real sin modificarlo (fuera de alcance explícito,
--  §4). Confirmado con el usuario en el Plan del corte.
--
--  Se replica en cambio el ÚNICO patrón real que ya existe para que un
--  módulo aguas abajo referencie una línea del extracto sin tocar el
--  motor: fondo_movimientos.extracto_linea_id — una FK pasiva de solo
--  lectura (el propio comentario de esa columna: "el fondo no tiene ni
--  tendrá un motor de conciliación propio"). finanzas_lotes_pago.
--  extracto_linea_id sigue el mismo criterio, y fn_finanzas_conciliar_lote
--  es la única función que la asigna — nunca escribe en extracto_linea ni
--  en conciliacion_propuesta, mismo criterio de "el motor no se modifica".
--  La regla de oro del motor ("nunca aplica dinero por sí solo") se
--  cumple porque esta función exige una llamada explícita del usuario,
--  jamás automática.
--
--  Reutiliza EXTRACTO_LINEA_INVALIDA (ya registrado, usado por
--  fondo_movimientos/fondo_compromisos para la misma validación) en vez de
--  inventar un código nuevo.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.finanzas_lotes_pago
  add column extracto_linea_id uuid references public.extracto_linea (id);

comment on column public.finanzas_lotes_pago.extracto_linea_id is
  'Línea de extracto bancario que el usuario confirmó como la que corresponde a este pago — FK '
  'pasiva de solo lectura, mismo criterio que fondo_movimientos.extracto_linea_id. El motor de '
  'conciliación (extracto_bancario/extracto_linea/conciliacion_propuesta) no se modifica ni se '
  'escribe desde aquí.';

create unique index finanzas_lotes_pago_extracto_linea_unica
  on public.finanzas_lotes_pago (extracto_linea_id)
  where extracto_linea_id is not null;

create function public.fn_finanzas_conciliar_lote(p_lote_id uuid, p_extracto_linea_id uuid)
returns public.finanzas_lotes_pago
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote public.finanzas_lotes_pago;
begin
  select * into v_lote from public.finanzas_lotes_pago where id = p_lote_id;
  if v_lote.id is null then
    raise exception 'LOTE_INEXISTENTE: el lote % no existe', p_lote_id;
  end if;
  if not public.has_role(v_lote.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere membresía activa del tenant para conciliar un lote';
  end if;
  if v_lote.estado <> 'ejecutado' then
    raise exception 'LOTE_TRANSICION_INVALIDA: solo un lote ejecutado puede conciliarse (estado '
      'actual: %)', v_lote.estado;
  end if;

  if not exists (
    select 1 from public.extracto_linea el
    where el.id = p_extracto_linea_id and el.tenant_id = v_lote.tenant_id
  ) then
    raise exception 'EXTRACTO_LINEA_INVALIDA: % no pertenece al tenant %',
      p_extracto_linea_id, v_lote.tenant_id;
  end if;

  perform set_config('aquila.conciliando_lote', 'true', true);
  update public.finanzas_lotes_pago
  set estado = 'conciliado', extracto_linea_id = p_extracto_linea_id
  where id = p_lote_id
  returning * into v_lote;
  perform set_config('aquila.conciliando_lote', 'false', true);

  return v_lote;
end;
$$;

comment on function public.fn_finanzas_conciliar_lote(uuid, uuid) is
  'FIN-3 §3.7: único camino a estado=conciliado — el usuario confirma a propósito qué línea del '
  'extracto corresponde a este lote ya ejecutado. Nunca automático, nunca escribe en el motor de '
  'conciliación existente (ver cabecera de esta migración).';
