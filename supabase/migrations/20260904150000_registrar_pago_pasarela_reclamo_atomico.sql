-- ═══════════════════════════════════════════════════════════════════════
--  Corrige fn_registrar_pago_pasarela (20260904130000): la función chocaba
--  contra su propio guard.
--
--  Hacía DOS updates sobre la intención — primero el que la reclama
--  (estado='aprobada' ... where estado='pendiente') y después uno para anotar
--  pago_id, una vez insertado el pago. El segundo update disparaba
--  guard_intencion_transicion otra vez, ahora con old.estado='aprobada', y el
--  guard lo rechazaba con INTENCION_TERMINAL. La función nunca podía
--  completarse. Detectado por el test de doble webhook, que fue justo para
--  eso: verificar contra la base real, no por inspección.
--
--  Se corrige SIN debilitar el guard. La alternativa era permitir "updates
--  inocentes" sobre una intención aprobada, pero eso convierte un invariante
--  absoluto ("aprobada es terminal, punto") en uno con excepciones, que es
--  precisamente la clase de atajo que causó el hallazgo S1
--  (guard_novedad_transicion dejaba pasar aprobada→aprobada y se duplicó un
--  cargo).
--
--  En su lugar: UNA sola reclamación atómica que ya lleva el pago_id. El id
--  del pago se pre-genera con gen_random_uuid() y el INSERT en pagos ocurre
--  después, dentro de la misma transacción. Para que la FK no falle en ese
--  instante intermedio, se declara DEFERRABLE INITIALLY DEFERRED: Postgres la
--  verifica al COMMIT, cuando el pago ya existe.
--
--  Esto además refuerza la idempotencia: la fila queda reclamada con TODO su
--  desenlace (estado + pago_id) en una sola operación. No hay ventana en la
--  que una intención esté aprobada pero sin pago.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.intenciones_pago
  drop constraint intenciones_pago_pago_id_fkey;

alter table public.intenciones_pago
  add constraint intenciones_pago_pago_id_fkey
  foreign key (pago_id) references public.pagos (id)
  deferrable initially deferred;

comment on column public.intenciones_pago.pago_id is
  'Pago que materializó esta intención. La FK es DEFERRABLE INITIALLY DEFERRED a propósito: '
  'fn_registrar_pago_pasarela reclama la intención y anota el pago_id en un solo UPDATE atómico, '
  'antes de insertar el pago — así el guard de terminalidad no necesita excepciones y no existe '
  'un estado intermedio "aprobada sin pago". Postgres verifica la FK al COMMIT.';

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
  v_intencion  public.intenciones_pago;
  v_pago_id    uuid := gen_random_uuid();
  v_existente  uuid;
  v_aplicacion jsonb;
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

  insert into public.pagos (
    id, tenant_id, inmueble_id, monto, fecha_pago, referencia,
    forma_pago_id, intencion_pago_id, registrado_por
  ) values (
    v_pago_id, v_intencion.tenant_id, v_intencion.inmueble_id, p_monto, p_fecha_pago,
    v_intencion.referencia, p_forma_pago_id, v_intencion.id, v_intencion.creada_por
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
  'atómico de la intención (estado + pago_id) + pagos + pago_aplicaciones + recibo de caja. '
  'Idempotente por diseño (patrón S1, 20260831130000): el UPDATE exige estado=''pendiente'' en el '
  'WHERE, así que un webhook duplicado — que toda pasarela garantiza, entrega at-least-once — '
  'devuelve en silencio el pago ya existente en vez de crear un segundo. Llama '
  'fn_emitir_recibo_caja explícitamente porque el trigger automático se retiró en 20260903190000.';
