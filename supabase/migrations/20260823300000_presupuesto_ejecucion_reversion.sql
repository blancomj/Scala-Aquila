-- ═══════════════════════════════════════════════════════════════════════
--  E9 seguimiento · Corrección de un movimiento mal registrado
--
--  Gap real: presupuesto_ejecucion es append-only (16 §68, mismo criterio
--  que pagos/cargos) — sin UPDATE ni DELETE para ningún rol. Un monto mal
--  digitado no tenía forma de corregirse. Fix: mismo patrón contable que
--  ya usa el resto del proyecto para esto — nunca mutar el historial,
--  agregar una fila de reversión que compensa la original (nunca un
--  UPDATE, nunca un DELETE).
--
--  monto pasa de "> 0" a "<> 0": una reversión es un monto negativo. Para
--  que un monto negativo tenga sentido SIEMPRE debe apuntar a qué
--  movimiento corrige (ajusta_movimiento_id) — nunca se admite un
--  negativo "suelto". La reversión debe ser contra la MISMA cuenta que el
--  movimiento original (si el destino real era otra cuenta, eso es una
--  reclasificación — dos movimientos nuevos, no una "corrección").
--
--  presupuesto_cuenta_ejecucion() no necesita cambios: ya suma
--  presupuesto_ejecucion.monto sin importar el signo, así que una
--  reversión se neta sola en el rollup.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.presupuesto_ejecucion
  drop constraint presupuesto_ejecucion_monto_check,
  add constraint presupuesto_ejecucion_monto_no_cero check (monto <> 0),
  add column ajusta_movimiento_id uuid references public.presupuesto_ejecucion (id);

comment on column public.presupuesto_ejecucion.ajusta_movimiento_id is
  'Cuando está poblado, esta fila es una reversión/corrección de otro movimiento — nunca se '
  'edita ni se borra el original (append-only, 16 §68), se compensa con una fila nueva de monto '
  'negativo. guard_presupuesto_ejecucion_cuenta exige monto<0 ⟹ ajusta_movimiento_id no nulo, y '
  'que apunte a un movimiento de la MISMA cuenta y tenant.';

create or replace function public.guard_presupuesto_ejecucion_cuenta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuenta public.presupuesto_cuenta%rowtype;
  v_periodo_tenant uuid;
  v_original public.presupuesto_ejecucion%rowtype;
begin
  select * into v_cuenta from public.presupuesto_cuenta where id = new.cuenta_id;

  if v_cuenta.id is null then
    raise exception 'CUENTA_INEXISTENTE: cuenta_id % no existe', new.cuenta_id;
  end if;

  if v_cuenta.tenant_id <> new.tenant_id then
    raise exception 'CUENTA_TENANT_INCONSISTENTE: la cuenta % pertenece a otro tenant',
      new.cuenta_id;
  end if;

  if not v_cuenta.es_hoja then
    raise exception 'CUENTA_NO_ES_HOJA: % agrupa subcuentas — un movimiento de ejecución solo '
      'puede registrarse contra una cuenta hoja (E9)', new.cuenta_id;
  end if;

  if v_cuenta.concepto_id is not null then
    raise exception 'CUENTA_CONCEPTO_AUTOMATICO: % ya recibe su ejecutado automáticamente del '
      'concepto % — no admite movimientos manuales (evita doble conteo)', new.cuenta_id,
      v_cuenta.concepto_id;
  end if;

  select tenant_id into v_periodo_tenant from public.periodos where id = new.periodo_id;

  if v_periodo_tenant is null then
    raise exception 'PERIODO_INEXISTENTE: periodo_id % no existe', new.periodo_id;
  end if;

  if v_periodo_tenant <> new.tenant_id then
    raise exception 'PERIODO_TENANT_INCONSISTENTE: el periodo % pertenece a otro tenant',
      new.periodo_id;
  end if;

  if new.monto < 0 and new.ajusta_movimiento_id is null then
    raise exception 'REVERSION_SIN_ORIGEN: un monto negativo debe corregir un movimiento '
      'existente (ajusta_movimiento_id) — no se admite un negativo suelto';
  end if;

  if new.ajusta_movimiento_id is not null then
    select * into v_original
    from public.presupuesto_ejecucion where id = new.ajusta_movimiento_id;

    if v_original.id is null then
      raise exception 'MOVIMIENTO_INEXISTENTE: ajusta_movimiento_id % no existe',
        new.ajusta_movimiento_id;
    end if;

    if v_original.tenant_id <> new.tenant_id then
      raise exception 'MOVIMIENTO_TENANT_INCONSISTENTE: % pertenece a otro tenant',
        new.ajusta_movimiento_id;
    end if;

    if v_original.cuenta_id <> new.cuenta_id then
      raise exception 'REVERSION_CUENTA_DISTINTA: % corrige un movimiento de otra cuenta (%) — '
        'una reversión debe ser contra la misma cuenta; para mover el gasto a otra cuenta, '
        'registra dos movimientos nuevos', new.ajusta_movimiento_id, v_original.cuenta_id;
    end if;
  end if;

  return new;
end;
$$;
