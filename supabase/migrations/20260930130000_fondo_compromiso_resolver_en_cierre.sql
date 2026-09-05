-- ═══════════════════════════════════════════════════════════════════════
--  BLOQUE O — corrige un candado que BLOQUE O mismo expuso al usar en_cierre
--  por primera vez para algo más que bloquear movimientos.
--
--  guard_fondo_compromiso (20260929140000, BLOQUE F) exige v_fondo.estado =
--  'activo' para CUALQUIER insert o update sobre fondo_compromisos — tenía
--  sentido cuando 'en_cierre' todavía no significaba nada más que "sin
--  movimientos nuevos" (guard_fondo_movimiento). Con guard_fondo_cierre_
--  completo (20260930120000) exigiendo que NO queden compromisos pendientes
--  (proyectado/comprometido/parcialmente_ejecutado) para poder cerrar, ese
--  "activo únicamente" se convierte en un candado real: un fondo en_cierre
--  con un compromiso pendiente no puede resolverlo (ni liberarlo ni
--  anularlo) porque la única vía para hacerlo — un UPDATE de estado —
--  también exige 'activo'. Bloqueado por su propia guarda de cierre.
--
--  Verificado en vivo (no solo en teoría): FON-CMP con un compromiso
--  'proyectado' heredado de una sesión de prueba anterior, puesto en_cierre,
--  y el intento de anularlo desde la UI devolvió exactamente
--  FONDO_ESTADO_NO_ADMITE_COMPROMISOS antes de esta migración.
--
--  Fix — la restricción de estado se separa por operación y por destino:
--    INSERT: sigue exigiendo 'activo' sin excepción (no se compromete nada
--      nuevo desde un fondo que se está cerrando o que no está operando).
--    UPDATE hacia 'liberado' o 'anulado' (dejar de pesar sobre el
--      disponible): se permite también en 'en_cierre' — es exactamente la
--      acción que Modelo §36 exige para poder cerrar.
--    UPDATE hacia cualquier otro estado (comprometido, parcialmente_
--      ejecutado, ejecutado — seguir comprometiendo/ejecutando dinero):
--      sigue exigiendo 'activo', sin cambios.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.guard_fondo_compromiso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fondo public.fondos;
  v_comprometido_otros numeric(18, 2);
  v_saldo numeric(18, 2);
begin
  select * into v_fondo from public.fondos where id = new.fondo_id;

  if v_fondo.id is null then
    raise exception 'FONDO_NO_ENCONTRADO: % no existe', new.fondo_id;
  end if;

  if v_fondo.tenant_id <> new.tenant_id then
    raise exception 'FONDO_TENANT_INCONSISTENTE: el fondo % no pertenece al tenant %',
      new.fondo_id, new.tenant_id;
  end if;

  if v_fondo.estado <> 'activo'
     and not (tg_op = 'UPDATE' and v_fondo.estado = 'en_cierre' and new.estado in ('liberado', 'anulado')) then
    raise exception 'FONDO_ESTADO_NO_ADMITE_COMPROMISOS: el fondo % está % y no admite '
      'compromisos nuevos ni cambios de estado (salvo liberar/anular durante en_cierre, Modelo §36)',
      v_fondo.codigo, v_fondo.estado;
  end if;

  -- Solo importa cuando el compromiso resta del disponible (Modelo §18).
  if new.estado in ('comprometido', 'parcialmente_ejecutado') then
    select coalesce(sum(fc.monto - fc.monto_ejecutado), 0) into v_comprometido_otros
      from public.fondo_compromisos fc
     where fc.fondo_id = new.fondo_id
       and fc.estado in ('comprometido', 'parcialmente_ejecutado')
       and fc.id <> new.id;

    v_saldo := public.fn_fondo_saldo_derivado(new.fondo_id);

    if v_comprometido_otros + (new.monto - new.monto_ejecutado) > v_saldo then
      raise exception 'COMPROMISO_EXCEDE_DISPONIBLE: comprometer % dejaría el disponible del '
        'fondo % en negativo (saldo %, ya comprometido %) — R9',
        new.monto - new.monto_ejecutado, v_fondo.codigo, v_saldo, v_comprometido_otros;
    end if;
  end if;

  if new.beneficiario_tercero_id is not null and not exists (
    select 1 from public.terceros t
     where t.id = new.beneficiario_tercero_id and t.tenant_id = new.tenant_id
  ) then
    raise exception 'TERCERO_INVALIDO: % no pertenece al tenant %',
      new.beneficiario_tercero_id, new.tenant_id;
  end if;

  if new.documento_id is not null and not exists (
    select 1 from public.documentos d
     where d.id = new.documento_id and d.tenant_id = new.tenant_id
  ) then
    raise exception 'DOCUMENTO_INVALIDO: % no pertenece al tenant %',
      new.documento_id, new.tenant_id;
  end if;

  new.registrado_por := coalesce(new.registrado_por, (select auth.uid()));

  return new;
end;
$$;

comment on function public.guard_fondo_compromiso() is
  'R9 + estado del fondo (Modelo §18). INSERT exige activo sin excepción. UPDATE exige activo '
  'salvo para liberar/anular durante en_cierre (Modelo §36) — resolver un compromiso pendiente es '
  'justo lo que guard_fondo_cierre_completo exige antes de poder cerrar, no tendría sentido '
  'impedirlo aquí.';
