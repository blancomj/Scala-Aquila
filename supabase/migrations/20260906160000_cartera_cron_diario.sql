-- ═══════════════════════════════════════════════════════════════════════
--  CAR §18 · Agendamiento del job diario de cartera (bloque 2, PRQ-CAR-010)
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §18
--
--  ALCANCE DECIDIDO POR EL PROPIETARIO DEL PRODUCTO (2026-08-29): la
--  corrida diaria SOLO CALCULA. Clasifica la cartera, evalúa escalamientos
--  y crea las acciones en la bandeja; NO despacha ningún mensaje. Nada sale
--  hasta que una persona lo apruebe o lo envíe desde /cartera/acciones.
--
--  Por qué importa que esté escrito aquí y no solo en un ticket: la
--  diferencia entre este cron y uno que despache es una sola llamada más.
--  Quien la agregue debe saber que está cambiando "el sistema prepara el
--  trabajo" por "el sistema le escribe a los residentes sin que nadie
--  mire", y que eso cuesta dinero por mensaje. El worker de despacho
--  (cartera-ejecutar-lote) existe y simula por defecto; agendarlo en modo
--  'ejecucion' es una decisión de negocio, no de infraestructura.
--
--  Horario: 11:00 UTC = 6:00 a. m. en Colombia. pg_cron programa en UTC;
--  si algún día la copropiedad opera en otro huso, esto hay que revisarlo
--  — no hay conversión automática.
--
--  Secretos en Vault, no en esta migración: la URL del proyecto y la
--  service_role key se leen de vault.decrypted_secrets. Una migración es un
--  archivo versionado en git (SEC-02) y una service key ahí sería una fuga
--  permanente. Si los secretos no existen, la corrida no falla: no hace
--  nada y lo deja dicho en los logs — un cron que revienta cada mañana en
--  un entorno sin configurar es ruido que acaba ignorándose.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pg_net;

-- ── Bitácora de disparos ──────────────────────────────────────────────
-- cron.job_run_details dice si el JOB corrió; esto dice a qué copropiedad
-- se le disparó la corrida y con qué fecha de corte. Sin ella, "¿por qué
-- esta copropiedad no tiene acciones hoy?" no tiene respuesta.
create table public.cartera_corridas_diarias (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  fecha_corte   date not null,
  -- id de la petición en net._http_response: ahí queda el status y el
  -- cuerpo de la respuesta, que llegan después de forma asíncrona.
  request_id    bigint,
  origen        text not null default 'cron',
  disparado_at  timestamptz not null default now(),

  constraint corrida_diaria_unica unique (tenant_id, fecha_corte, origen)
);

alter table public.cartera_corridas_diarias enable row level security;
alter table public.cartera_corridas_diarias force row level security;

create index cartera_corridas_diarias_tenant_idx
  on public.cartera_corridas_diarias (tenant_id, fecha_corte desc);

create policy cartera_corridas_diarias_select_miembro
  on public.cartera_corridas_diarias for select
  to authenticated
  using (public.is_member(tenant_id));

comment on table public.cartera_corridas_diarias is
  'CAR §18 — bitácora de la corrida diaria de cartera, una fila por copropiedad y fecha de '
  'corte. La respuesta HTTP llega asíncrona a net._http_response; aquí queda el request_id '
  'para poder rastrearla. Solo service_role escribe.';

-- ── El disparo ────────────────────────────────────────────────────────
create function public.cron_cartera_recalcular_diario()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url         text;
  v_service_key text;
  v_fecha       date := current_date;
  v_tenant      record;
  v_request_id  bigint;
  v_disparados  int := 0;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'cartera_cron_supabase_url';

  select decrypted_secret into v_service_key
  from vault.decrypted_secrets where name = 'cartera_cron_service_key';

  if v_url is null or v_service_key is null then
    raise notice 'CARTERA_CRON_SIN_CONFIGURAR: faltan los secretos cartera_cron_supabase_url / '
      'cartera_cron_service_key en Vault. No se dispara nada.';
    return;
  end if;

  for v_tenant in
    select id from public.tenants where status = 'active' order by created_at
  loop
    -- Una petición por copropiedad, no una que las procese todas: si una
    -- falla (política sin tramos, datos a medias), las demás siguen. El
    -- job diario no puede caerse entero por una copropiedad mal cargada.
    select net.http_post(
      url := v_url || '/functions/v1/cartera-recalcular',
      body := jsonb_build_object(
        'tenant_id', v_tenant.id,
        -- REC-CAR-008: fecha de corte EXPLÍCITA. La corrida de hoy queda
        -- reproducible aunque se re-ejecute mañana.
        'fecha_corte', v_fecha,
        -- 'ejecucion' calcula y CREA acciones; no despacha nada. El envío
        -- es cartera-ejecutar-lote y no está agendado a propósito.
        'modo', 'ejecucion'
      ),
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      timeout_milliseconds := 120000
    ) into v_request_id;

    insert into public.cartera_corridas_diarias (tenant_id, fecha_corte, request_id, origen)
    values (v_tenant.id, v_fecha, v_request_id, 'cron')
    -- Re-ejecutar el mismo día no duplica la bitácora ni oculta el intento.
    on conflict (tenant_id, fecha_corte, origen) do update
      set request_id = excluded.request_id, disparado_at = now();

    v_disparados := v_disparados + 1;
  end loop;

  raise notice 'CARTERA_CRON: % copropiedades disparadas para la fecha de corte %', v_disparados, v_fecha;
end;
$$;

-- Nadie la invoca desde el cliente: la barrera es el revoke, no la
-- convención. Mismo criterio que purge_audit_log_antiguo().
revoke execute on function public.cron_cartera_recalcular_diario() from public, anon, authenticated;

comment on function public.cron_cartera_recalcular_diario() is
  'CAR §18 PRQ-CAR-010 — dispara cartera-recalcular (modo ejecución: calcula y crea acciones, '
  'NO despacha) para cada copropiedad activa, con la fecha de corte del día. Corre vía pg_cron '
  '(job "cartera-recalcular-diario", 11:00 UTC = 6:00 a. m. Colombia). Lee URL y service key de '
  'Vault; sin ellas no hace nada y lo dice en los logs.';

select cron.schedule(
  'cartera-recalcular-diario',
  '0 11 * * *',
  $$select public.cron_cartera_recalcular_diario()$$
);
