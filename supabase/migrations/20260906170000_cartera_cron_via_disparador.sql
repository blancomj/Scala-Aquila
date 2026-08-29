-- ═══════════════════════════════════════════════════════════════════════
--  CAR §18 · El cron pasa a llamar a cartera-cron-diario
--
--  20260906160000 hacía que pg_cron llamara a cartera-recalcular una vez
--  por copropiedad, con la service_role key. Falló en el primer disparo
--  real: 63 peticiones, 63 respuestas 401. cartera-recalcular se autentica
--  con withSupabase({auth:'user'}), que exige un JWT de USUARIO — y la
--  service key no lo es. No hay persona detrás de un cron.
--
--  Correcciones, y por qué cada una:
--
--  1. Un único disparo a cartera-cron-diario, que hace el fan-out por
--     copropiedad. La credencial que sirve para el modo 'secret'
--     (SUPABASE_SECRET_KEYS) vive dentro de las Edge Functions: leerla ahí
--     evita copiarla a Vault, y evita que una clave del proyecto quede
--     guardada en la base.
--
--  2. Solo se disparan copropiedades con política de clasificación
--     VIGENTE — el filtro lo aplica el disparador. Sin política,
--     cartera-recalcular aborta por PH-C26/I-C14: en el primer intento se
--     gastaron 63 invocaciones para copropiedades que en su mayoría son
--     restos de tests sin cartera configurada.
--
--  3. La bitácora la escribe el disparador, que sí conoce el resultado de
--     cada copropiedad. Registrarla aquí solo probaba que se envió una
--     petición, no que sirviera de algo.
--
--  El secreto que se guarda en Vault ya no es la service key sino el token
--  del disparador (cartera_cron_token), que no da acceso a nada más.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.cron_cartera_recalcular_diario()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url        text;
  v_token      text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'cartera_cron_supabase_url';

  select decrypted_secret into v_token
  from vault.decrypted_secrets where name = 'cartera_cron_token';

  if v_url is null or v_token is null then
    raise notice 'CARTERA_CRON_SIN_CONFIGURAR: faltan los secretos cartera_cron_supabase_url / '
      'cartera_cron_token en Vault. No se dispara nada.';
    return;
  end if;

  -- Una sola petición: el fan-out por copropiedad lo hace el disparador,
  -- que puede leer la clave interna del proyecto y decidir a quién le toca.
  select net.http_post(
    url := v_url || '/functions/v1/cartera-cron-diario/' || v_token,
    -- Cuerpo vacío = fecha de corte de hoy. Se puede re-correr un día
    -- concreto llamando al disparador con {"fecha_corte":"YYYY-MM-DD"}.
    body := '{}'::jsonb,
    params := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    -- El fan-out es secuencial y puede tardar con muchas copropiedades.
    timeout_milliseconds := 600000
  ) into v_request_id;

  raise notice 'CARTERA_CRON: disparador invocado, request_id %', v_request_id;
end;
$$;

revoke execute on function public.cron_cartera_recalcular_diario() from public, anon, authenticated;

comment on function public.cron_cartera_recalcular_diario() is
  'CAR §18 PRQ-CAR-010 — invoca cartera-cron-diario, que recalcula la cartera de cada '
  'copropiedad con política vigente y CREA las acciones. No despacha mensajes: eso exige una '
  'persona en /cartera/acciones o agendar cartera-ejecutar-lote, que es otra decisión. Corre a '
  'las 11:00 UTC = 6:00 a. m. Colombia (job "cartera-recalcular-diario").';

-- La service key ya no hace falta en Vault: el disparador se autentica con
-- su propio token, que solo sirve para esa ruta.
delete from vault.secrets where name = 'cartera_cron_service_key';

-- request_id la llenaba el SQL cuando era él quien hacía el POST por
-- copropiedad. Ahora el disparador escribe la bitácora y no tiene ese id
-- (su propia petición es una sola, para todas). Una columna que ya nadie
-- llena es una promesa vacía: se quita en vez de dejarla siempre null.
alter table public.cartera_corridas_diarias drop column if exists request_id;
