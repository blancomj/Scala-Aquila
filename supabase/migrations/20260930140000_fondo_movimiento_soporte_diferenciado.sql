-- ═══════════════════════════════════════════════════════════════════════
--  Dominio Fondos — soporte documental diferenciado por tipo de movimiento
--  (Modelo Maestro §36 "sin soportes faltantes"), D-42.
--
--  QUÉ RESUELVE. `ANALISIS_FONDOS_BLOQUE_A.md` §11 (punto 3) dejaba anotado
--  que "soportes faltantes" no se hacía cumplir porque exigir documento_id
--  de forma UNIFORME rompería el aporte automático por recaudo de BLOQUE K
--  (`fn_aplicar_aporte_fondo` no adjunta documento — su respaldo real es
--  `pago_id`). Esa conclusión sigue siendo cierta; lo que se descartó por
--  criterio de diseño (no por infraestructura faltante) fue la solución
--  correcta: diferenciar a nivel de guard entre "movimiento automático"
--  (respaldo = la fila que lo originó) y "movimiento manual" (respaldo =
--  documento) en vez de una validación pareja para los ocho tipos.
--
--  QUÉ CUENTA COMO RESPALDO, POR TIPO:
--   - aporte: `pago_id` (automático, BLOQUE K) O `documento_id` (manual —
--     ej. una donación o traslado autorizado que no viene de un recaudo).
--   - rendimiento/ajuste/uso/traslado_entrada/traslado_salida: siempre
--     `documento_id` — no existe hoy ninguna ruta automática para estos
--     cinco tipos (verificado por grep: solo fn_aplicar_aporte_fondo y
--     fn_fondo_cerrar insertan fondo_movimientos fuera de un INSERT directo
--     del cliente).
--   - reversion: exenta — su respaldo ya es `reversion_de_id` (el propio
--     movimiento que corrige), exigido y validado por guard_fondo_movimiento
--     desde 20260929120000.
--   - cierre_remanente: exento — lo único que lo inserta es fn_fondo_cerrar,
--     y su respaldo real es la fila de fondo_remanentes que
--     guard_fondo_remanente_referencias ya exige que exista, enlazada por
--     movimiento_id, dentro de la misma transacción atómica.
--
--  EL traslado_entrada QUE fn_fondo_cerrar GENERA (destino "traslado") ES EL
--  CASO DIFÍCIL: nace en el fondo DESTINO, no en el que se cierra, y
--  fondo_remanentes no lo referencia (solo referencia el cierre_remanente
--  del fondo que se cierra) — no hay una fila que lo enlace igual que al
--  cierre_remanente. Se resuelve con la misma técnica de bandera de sesión
--  que ya usa propagar_solicitud_ejecutada (`aquila.propagacion_solicitud`):
--  fn_fondo_cerrar marca `aquila.fondo_cierre_movimiento` mientras hace sus
--  dos inserts, y el guard exime el chequeo de soporte mientras esa bandera
--  esté activa. Es seguro porque solo fn_fondo_cerrar la activa, dentro de
--  su propia transacción atómica — nunca queda "abierta" para un INSERT
--  posterior sin relación.
--
--  NO SE TOCA NADA DE BLOQUE K/O. fn_aplicar_aporte_fondo sigue sin adjuntar
--  documento (su respaldo sigue siendo pago_id, ya validado por el guard
--  desde 20260929120000) y fn_fondo_cerrar sigue aceptando p_documento_id
--  solo para fondo_remanentes.documento_id (la decisión), no para los
--  movimientos que genera — ambos quedan exentos por la bandera, no porque
--  se les exija nada nuevo.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Catálogo: tipo de documento para soportar un movimiento manual ───
insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_DOCUMENTO', 'soporte_movimiento_fondo', 'Soporte de movimiento de fondo', 17);

-- ── 2. guard_fondo_movimiento: soporte diferenciado por tipo ────────────
-- Reproducción íntegra de 20260929140000 (última versión) + el nuevo
-- bloque de soporte al final, antes de estampar registrado_por.
create or replace function public.guard_fondo_movimiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fondo public.fondos;
  v_original public.fondo_movimientos;
begin
  select * into v_fondo from public.fondos where id = new.fondo_id;

  if v_fondo.id is null then
    raise exception 'FONDO_NO_ENCONTRADO: % no existe', new.fondo_id;
  end if;

  if v_fondo.tenant_id <> new.tenant_id then
    raise exception 'FONDO_TENANT_INCONSISTENTE: el fondo % pertenece a otro tenant', new.fondo_id;
  end if;

  if v_fondo.estado in ('propuesto', 'pendiente_autorizacion', 'cerrado', 'cancelado')
     or (v_fondo.estado = 'en_cierre' and new.tipo <> 'cierre_remanente') then
    raise exception 'FONDO_ESTADO_NO_ADMITE_MOVIMIENTOS: el fondo % está % y no admite un '
      'movimiento de tipo %', v_fondo.codigo, v_fondo.estado, new.tipo;
  end if;

  if new.tipo in ('ajuste', 'reversion')
     and (new.motivo is null or btrim(new.motivo) = '') then
    raise exception 'FONDO_MOTIVO_REQUERIDO: un movimiento de tipo % exige motivo', new.tipo;
  end if;

  if new.tipo = 'reversion' then
    if new.reversion_de_id is null then
      raise exception 'FONDO_REVERSION_INVALIDA: una reversión debe indicar qué movimiento '
        'corrige (reversion_de_id)';
    end if;

    select * into v_original
      from public.fondo_movimientos where id = new.reversion_de_id;

    if v_original.id is null or v_original.fondo_id <> new.fondo_id then
      raise exception 'FONDO_REVERSION_INVALIDA: el movimiento % no existe o no es de este fondo',
        new.reversion_de_id;
    end if;

    if v_original.tipo = 'reversion' then
      raise exception 'FONDO_REVERSION_INVALIDA: una reversión no se revierte — corrige con un '
        'movimiento nuevo';
    end if;

    if new.monto is distinct from
       -public.fn_fondo_movimiento_efecto(v_original.tipo, v_original.monto) then
      raise exception 'FONDO_REVERSION_INVALIDA: una reversión debe valer % (lo contrario del '
        'movimiento que corrige), se recibió %',
        -public.fn_fondo_movimiento_efecto(v_original.tipo, v_original.monto), new.monto;
    end if;
  elsif new.reversion_de_id is not null then
    raise exception 'FONDO_REVERSION_INVALIDA: reversion_de_id solo aplica a un movimiento de '
      'tipo reversion';
  end if;

  if new.documento_id is not null and not exists (
    select 1 from public.documentos d
     where d.id = new.documento_id and d.tenant_id = new.tenant_id
  ) then
    raise exception 'DOCUMENTO_INVALIDO: % no pertenece al tenant %',
      new.documento_id, new.tenant_id;
  end if;

  if new.pago_id is not null and not exists (
    select 1 from public.pagos p where p.id = new.pago_id and p.tenant_id = new.tenant_id
  ) then
    raise exception 'PAGO_INVALIDO: % no pertenece al tenant %', new.pago_id, new.tenant_id;
  end if;

  if new.extracto_linea_id is not null and not exists (
    select 1 from public.extracto_linea el
     where el.id = new.extracto_linea_id and el.tenant_id = new.tenant_id
  ) then
    raise exception 'EXTRACTO_LINEA_INVALIDA: % no pertenece al tenant %',
      new.extracto_linea_id, new.tenant_id;
  end if;

  if new.compromiso_id is not null and not exists (
    select 1 from public.fondo_compromisos fc
     where fc.id = new.compromiso_id and fc.fondo_id = new.fondo_id
  ) then
    raise exception 'COMPROMISO_INVALIDO: % no es un compromiso de este fondo', new.compromiso_id;
  end if;

  if new.autorizacion_id is not null and not exists (
    select 1 from public.fondo_autorizaciones fa
     where fa.id = new.autorizacion_id and fa.fondo_id = new.fondo_id
  ) then
    raise exception 'AUTORIZACION_INVALIDA: % no es una autorización de este fondo',
      new.autorizacion_id;
  end if;

  -- Modelo §36 "sin soportes faltantes" (D-42) — diferenciado, no uniforme.
  -- La bandera solo la activa fn_fondo_cerrar, dentro de su propia
  -- transacción atómica, para los dos movimientos que genera (cierre_
  -- remanente y, si el destino es traslado, el traslado_entrada en el
  -- fondo destino) — su respaldo real es fondo_remanentes, no un documento.
  if current_setting('aquila.fondo_cierre_movimiento', true) is distinct from 'true' then
    if new.tipo = 'aporte' and new.pago_id is null and new.documento_id is null then
      raise exception 'FONDO_SOPORTE_REQUERIDO: un aporte manual exige documento_id — uno '
        'automático por recaudo (BLOQUE K) queda respaldado por pago_id';
    elsif new.tipo in ('rendimiento', 'ajuste', 'uso', 'traslado_entrada', 'traslado_salida')
          and new.documento_id is null then
      raise exception 'FONDO_SOPORTE_REQUERIDO: un movimiento de tipo % exige documento_id '
        '(Modelo §36)', new.tipo;
    end if;
  end if;

  new.registrado_por := coalesce(new.registrado_por, (select auth.uid()));

  return new;
end;
$$;

comment on function public.guard_fondo_movimiento() is
  'Coherencia del movimiento (fondo/tenant/estado/reversión/orígenes) + soporte documental '
  'diferenciado por tipo (D-42): automático (pago_id) vs manual (documento_id), nunca uniforme. '
  'La bandera aquila.fondo_cierre_movimiento exime lo que fn_fondo_cerrar genera.';

-- ── 3. fn_fondo_cerrar: marca sus dos inserts como exentos ──────────────
-- Reproducción íntegra de 20260930120000 + las dos set_config alrededor de
-- los inserts en fondo_movimientos (mismo patrón que propagar_solicitud_
-- ejecutada / aquila.propagacion_solicitud, 20260929150000).
create or replace function public.fn_fondo_cerrar(
  p_fondo_id uuid,
  p_destino text default null,
  p_organo_id bigint default null,
  p_decision text default null,
  p_fondo_destino_id uuid default null,
  p_documento_id uuid default null
)
returns public.fondos
language plpgsql
set search_path = ''
as $$
declare
  v_fondo public.fondos;
  v_saldo numeric(18, 2);
  v_movimiento_id uuid;
  v_actor uuid := (select auth.uid());
begin
  select * into v_fondo from public.fondos where id = p_fondo_id;
  if v_fondo.id is null then
    raise exception 'FONDO_NO_ENCONTRADO: % no existe', p_fondo_id;
  end if;
  if v_fondo.estado <> 'en_cierre' then
    raise exception 'FONDO_ESTADO_INVALIDO: el fondo % debe estar en_cierre para cerrarse, está %',
      v_fondo.codigo, v_fondo.estado;
  end if;

  if exists (
    select 1 from public.fondo_compromisos
     where fondo_id = p_fondo_id and estado in ('proyectado', 'comprometido', 'parcialmente_ejecutado')
  ) then
    raise exception 'FONDO_COMPROMISOS_PENDIENTES: el fondo % tiene compromisos sin resolver '
      '(Modelo §36)', v_fondo.codigo;
  end if;
  if exists (
    select 1 from public.fondo_solicitudes_uso
     where fondo_id = p_fondo_id and estado in ('borrador', 'en_revision', 'aprobada', 'comprometida')
  ) then
    raise exception 'FONDO_SOLICITUDES_PENDIENTES: el fondo % tiene solicitudes de uso sin '
      'resolver (Modelo §36)', v_fondo.codigo;
  end if;

  v_saldo := public.fn_fondo_saldo_derivado(p_fondo_id);

  if v_saldo > 0 then
    if p_destino is null or p_organo_id is null or p_decision is null or btrim(p_decision) = '' then
      raise exception 'FONDO_REMANENTE_SIN_DECISION: el fondo % tiene saldo % — decide destino, '
        'órgano y decisión antes de cerrar (Modelo §35/§36)', v_fondo.codigo, v_saldo;
    end if;
    if p_destino = 'traslado' and p_fondo_destino_id is null then
      raise exception 'FONDO_REMANENTE_SIN_DESTINO: el destino "traslado" exige un fondo destino';
    end if;
    if p_destino <> 'traslado' and p_fondo_destino_id is not null then
      raise exception 'FONDO_REMANENTE_DESTINO_INCONSISTENTE: solo "traslado" admite fondo destino';
    end if;

    perform set_config('aquila.fondo_cierre_movimiento', 'true', true);

    insert into public.fondo_movimientos (tenant_id, fondo_id, tipo, monto, registrado_por)
    values (v_fondo.tenant_id, p_fondo_id, 'cierre_remanente', v_saldo, v_actor)
    returning id into v_movimiento_id;

    if p_destino = 'traslado' then
      insert into public.fondo_movimientos (tenant_id, fondo_id, tipo, monto, registrado_por)
      values (v_fondo.tenant_id, p_fondo_destino_id, 'traslado_entrada', v_saldo, v_actor);
    end if;

    perform set_config('aquila.fondo_cierre_movimiento', 'false', true);

    insert into public.fondo_remanentes (
      tenant_id, fondo_id, monto, destino, fondo_destino_id, organo_id, decision,
      documento_id, movimiento_id, registrado_por
    ) values (
      v_fondo.tenant_id, p_fondo_id, v_saldo, p_destino, p_fondo_destino_id, p_organo_id, p_decision,
      p_documento_id, v_movimiento_id, v_actor
    );
  elsif v_saldo < 0 then
    raise exception 'FONDO_SALDO_NEGATIVO: el fondo % tiene saldo %, no se puede cerrar',
      v_fondo.codigo, v_saldo;
  end if;

  update public.fondos
     set estado = 'cerrado'
   where id = p_fondo_id and estado = 'en_cierre'
  returning * into v_fondo;

  if not found then
    raise exception 'FONDO_ESTADO_INVALIDO: % ya no está en_cierre — cierre concurrente', p_fondo_id;
  end if;

  return v_fondo;
end;
$$;
