-- ═══════════════════════════════════════════════════════════════════════
--  FND-PR-09 · fondo_movimientos.extracto_linea_id deja de ser inerte
--
--  La columna existe desde 20260929110000 ("línea de extracto bancario
--  conciliada que respalda el movimiento") pero nunca fue exigida ni
--  aceptada como soporte válido por guard_fondo_movimiento, y ninguna
--  pantalla la llena — verificado por grep, cero referencias en
--  apps/web/app/{stores,components,pages}/fondos. Modelo §36 "sin
--  movimientos no conciliados" seguía sin cumplirse a nivel de fondo.
--
--  Alcance deliberadamente acotado a los dos tipos que pueden nacer de un
--  movimiento bancario real sin pasar por pagos/lote_pago:
--  - aporte: una contribución extraordinaria que entra por transferencia
--    directa, sin cargo de propietario detrás (si viniera de un propietario
--    ya tiene pago_id, BLOQUE K).
--  - rendimiento: intereses que el banco acredita — el caso citado
--    literalmente en el diagnóstico del prompt de conciliación bancaria
--    contable (comisiones/intereses que "nadie vuelve a mirar").
--  `uso` queda fuera: ya tiene su propio origen automático (lote_pago_id,
--  BLOQUE H) y el manual pasa por fondo_solicitudes_uso (D-37) — no se abre
--  un tercer camino. `ajuste`/`traslado_entrada`/`traslado_salida` quedan
--  fuera: son reasignaciones contables internas a la misma cuenta
--  operativa (fondos no tienen cuenta bancaria propia, verificado — cero FK
--  fondos↔cuentas_bancarias), no hay una línea de extracto distinta que
--  las respalde.
--
--  No se construye ningún motor de conciliación nuevo — se reutiliza
--  extracto_linea tal cual, mismo criterio que finanzas_lotes_pago.
--  extracto_linea_id (20260931290000): "el fondo no tiene ni tendrá un
--  motor de conciliación propio" (Modelo §22/§46).
-- ═══════════════════════════════════════════════════════════════════════

-- Una línea de extracto respalda como máximo un movimiento de fondo — mismo
-- patrón que extracto_linea_pago_unico / finanzas_lotes_pago_extracto_linea_unica.
create unique index fondo_movimientos_extracto_linea_unica
  on public.fondo_movimientos (extracto_linea_id)
  where extracto_linea_id is not null;

-- Reproducción íntegra de 20260935050000 + extracto_linea_id como soporte
-- alternativo para aporte/rendimiento (Postgres exige recrear la función
-- completa, no admite parchear un solo branch).
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

  if new.lote_pago_id is not null and not exists (
    select 1 from public.finanzas_lotes_pago l
     where l.id = new.lote_pago_id and l.tenant_id = new.tenant_id
  ) then
    raise exception 'LOTE_PAGO_INVALIDO: % no pertenece al tenant %',
      new.lote_pago_id, new.tenant_id;
  end if;

  -- Modelo §36 "sin soportes faltantes" (D-42) — diferenciado, no uniforme.
  -- La bandera solo la activa fn_fondo_cerrar, dentro de su propia
  -- transacción atómica, para los dos movimientos que genera (cierre_
  -- remanente y, si el destino es traslado, el traslado_entrada en el
  -- fondo destino) — su respaldo real es fondo_remanentes, no un documento.
  if current_setting('aquila.fondo_cierre_movimiento', true) is distinct from 'true' then
    if new.tipo = 'aporte'
       and new.pago_id is null and new.documento_id is null and new.extracto_linea_id is null then
      raise exception 'FONDO_SOPORTE_REQUERIDO: un aporte manual exige documento_id o '
        'extracto_linea_id — uno automático por recaudo (BLOQUE K) queda respaldado por pago_id';
    elsif new.tipo = 'uso' and new.documento_id is null and new.lote_pago_id is null then
      raise exception 'FONDO_SOPORTE_REQUERIDO: un uso manual exige documento_id — uno '
        'automático por ejecución de lote de pago (BLOQUE H) queda respaldado por lote_pago_id';
    elsif new.tipo = 'rendimiento'
          and new.documento_id is null and new.extracto_linea_id is null then
      raise exception 'FONDO_SOPORTE_REQUERIDO: un rendimiento exige documento_id o '
        'extracto_linea_id (Modelo §36)';
    elsif new.tipo in ('ajuste', 'traslado_entrada', 'traslado_salida')
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
  'diferenciado por tipo (D-42/BLOQUE H, FND-PR-09): automático (pago_id / lote_pago_id) vs '
  'manual (documento_id), vs bancario ya conciliado (extracto_linea_id, solo aporte/rendimiento) '
  '— nunca uniforme. La bandera aquila.fondo_cierre_movimiento exime lo que fn_fondo_cerrar genera.';

comment on column public.fondo_movimientos.extracto_linea_id is
  'Línea de extracto bancario que el usuario confirmó como la que corresponde a este movimiento '
  '(FND-PR-09) — FK pasiva de solo lectura, mismo criterio que finanzas_lotes_pago.'
  'extracto_linea_id. El motor de conciliación (extracto_bancario/extracto_linea/'
  'conciliacion_propuesta) no se modifica ni se escribe desde aquí; el fondo no tiene ni tendrá '
  'un motor de conciliación propio (Modelo §22/§46). Válida como soporte único (sin documento_id '
  'ni pago_id) solo para aporte/rendimiento — ver guard_fondo_movimiento.';
