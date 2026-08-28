-- ═══════════════════════════════════════════════════════════════════════
--  Cierra un vacío real: fn_registrar_pago_pasarela (20260904130000/150000)
--  insertaba el pago SIN cuenta_bancaria_id. contable_movimientos() ante un
--  cuenta_bancaria_id nulo cae al evento genérico BANCO_RECAUDO en vez de
--  debitar la cuenta bancaria puntual del tenant — el mismo pago que un
--  auxiliar registrando a mano SÍ deja bien contabilizado (registrar-pago/
--  index.ts ya resuelve la cuenta es_recaudo=true cuando la forma de pago no
--  es efectivo y no se indicó una cuenta explícita).
--
--  Esto NO es la cuenta a la que Wompi liquida de verdad — eso lo configura
--  la copropiedad directamente en su panel de Wompi (D-31 §A: "la
--  copropiedad es el comercio, no AQUILA", el dinero nunca pasa por
--  nosotros). Es la cuenta bancaria que la propia copropiedad marcó dentro
--  de AQUILA como su cuenta de recaudo — el mismo dato que ya usa cualquier
--  otro pago no-efectivo para saber qué banco debitar en la contabilidad.
--
--  Se resuelve DENTRO de la función (no en TypeScript) porque
--  webhook-pasarela y expirar-intenciones-pago ya llaman a la misma función:
--  resolverlo una sola vez aquí evita duplicar la consulta en los dos
--  callers. Sin cuenta es_recaudo configurada, la columna simplemente queda
--  null — el mismo respaldo que ya tenía antes de esta migración.
--
--  guard_pago_medio_recaudo no se ve afectado: un pago de pasarela nunca es
--  efectivo (PSE/Nequi/tarjeta/transferencia), así que señalar una cuenta
--  bancaria no choca con esa guarda.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_registrar_pago_pasarela(
  p_intencion_id     uuid,
  p_transaction_id   text,
  p_monto            numeric,
  p_forma_pago_id    bigint,
  p_fecha_pago       date,
  p_aplicaciones     jsonb,
  p_revision_motivo  text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intencion         public.intenciones_pago;
  v_pago_id           uuid := gen_random_uuid();
  v_existente         uuid;
  v_aplicacion        jsonb;
  v_cuenta_bancaria_id uuid;
begin
  -- Reclamo atómico. El WHERE exige estado='pendiente' (patrón S1,
  -- 20260831130000): bajo concurrencia real Postgres serializa ambas
  -- transacciones sobre el lock de fila y la segunda encuentra cero filas.
  -- Se anota el pago_id aquí mismo — la FK es deferrable, el pago se inserta
  -- unas líneas más abajo, dentro de esta misma transacción.
  update public.intenciones_pago
     set estado = 'aprobada',
         pago_id = v_pago_id,
         transaction_id = coalesce(p_transaction_id, transaction_id),
         revision_motivo = p_revision_motivo
   where id = p_intencion_id and estado = 'pendiente'
  returning * into v_intencion;

  if not found then
    -- Webhook duplicado: es el comportamiento NORMAL de cualquier pasarela
    -- (entrega at-least-once), no un error. Se devuelve el pago que ya existe.
    select pago_id into v_existente
    from public.intenciones_pago
    where id = p_intencion_id;

    if v_existente is null then
      raise exception
        'INTENCION_NO_PENDIENTE: la intención % no está pendiente y no tiene pago asociado',
        p_intencion_id;
    end if;

    return v_existente;
  end if;

  -- Cuenta bancaria de recaudo del tenant — mismo criterio que
  -- registrar-pago/index.ts para cualquier forma de pago no-efectivo. Sin
  -- una cuenta marcada es_recaudo=true/activa, queda null (respaldo previo).
  select id into v_cuenta_bancaria_id
  from public.cuentas_bancarias
  where tenant_id = v_intencion.tenant_id and es_recaudo and activa
  limit 1;

  insert into public.pagos (
    id, tenant_id, inmueble_id, monto, fecha_pago, referencia,
    forma_pago_id, cuenta_bancaria_id, intencion_pago_id, registrado_por
  ) values (
    v_pago_id, v_intencion.tenant_id, v_intencion.inmueble_id, p_monto, p_fecha_pago,
    v_intencion.referencia, p_forma_pago_id, v_cuenta_bancaria_id, v_intencion.id, v_intencion.creada_por
  );

  -- Dispara trg_descuento_pronto_pago (statement-level sobre pago_aplicaciones).
  for v_aplicacion in select * from jsonb_array_elements(p_aplicaciones)
  loop
    insert into public.pago_aplicaciones (tenant_id, pago_id, cargo_id, monto)
    values (
      v_intencion.tenant_id,
      v_pago_id,
      (v_aplicacion ->> 'cargo_id')::uuid,
      (v_aplicacion ->> 'monto')::numeric
    );
  end loop;

  -- EL RECIBO DE CAJA NO SALE SOLO. El trigger trg_emitir_recibo_caja (AFTER
  -- INSERT ON pagos) fue RETIRADO en 20260903190000: emitía el snapshot antes
  -- de que existieran las pago_aplicaciones y el recibo salía con "por
  -- concepto de" vacío y todo el monto como anticipo. Por eso se llama aquí,
  -- explícitamente, DESPUÉS de las aplicaciones — que es lo que aquella
  -- migración dejó anotado para todo camino de escritura nuevo.
  perform public.fn_emitir_recibo_caja(v_pago_id);

  return v_pago_id;
end;
$$;

comment on function public.fn_registrar_pago_pasarela(uuid, text, numeric, bigint, date, jsonb, text) is
  'Materializa en el ledger un pago confirmado por una pasarela, en UNA transacción: reclamo '
  'atómico de la intención (estado + pago_id) + pagos (con la cuenta bancaria es_recaudo del '
  'tenant, si existe — 20260904210000) + pago_aplicaciones + recibo de caja. Idempotente por '
  'diseño (patrón S1, 20260831130000): el UPDATE exige estado=''pendiente'' en el WHERE, así que '
  'un webhook duplicado — que toda pasarela garantiza, entrega at-least-once — devuelve en '
  'silencio el pago ya existente en vez de crear uno segundo. Llama fn_emitir_recibo_caja '
  'explícitamente porque el trigger automático se retiró en 20260903190000.';
