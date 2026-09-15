-- ═══════════════════════════════════════════════════════════════════════
--  ENFOQUE_CONSOLIDACION, Ola 3 (primera rebanada) — presupuesto y uso del
--  gateway de modelo real.
--
--  Todo lo demás que Ola 3 necesita (selección de proveedor por tenant,
--  credenciales en Vault, activación) ya existe desde IA-01/D-121
--  (20260935000000..20260935040000) y no se toca aquí (DI-01: consolidar,
--  no construir). Lo único genuinamente nuevo es el techo de gasto y el
--  acumulador de uso — confirmado por exploración exhaustiva del repo que
--  no existe ningún patrón de "presupuesto/costo acumulado por tenant y
--  periodo" para consolidar sobre él.
--
--  presupuesto_mensual_usd vive en ia_config (no en tabla aparte): es
--  configuración del proveedor activo de ese tenant, mismo criterio que ya
--  fija D-121 de "cada copropiedad paga y decide su propio proveedor" —
--  agregar una columna a una tabla ya per-tenant consolida mejor que crear
--  una tabla de configuración paralela para un solo número.
--
--  ia_uso_mensual sí es tabla nueva: acumula, no configura. Mismo patrón de
--  RLS que ia_credencial en el sentido de "sin política de escritura para
--  authenticated" — a diferencia de ia_credencial, aquí SÍ hay política de
--  SELECT (el tenant puede ver cuánto ha gastado), pero ninguna de
--  INSERT/UPDATE/DELETE: solo fn_registrar_uso_ia (service_role) escribe,
--  desde la Edge Function ia-redactar-explicacion, después de cada llamada
--  real al proveedor.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.ia_config
  add column presupuesto_mensual_usd numeric(10,2)
  check (presupuesto_mensual_usd is null or presupuesto_mensual_usd >= 0);

comment on column public.ia_config.presupuesto_mensual_usd is
  'Ola 3 §2: techo de gasto mensual en USD, estimado (ver estimarCosto en packages/ai-providers) '
  'para el proveedor activo de este tenant. NULL = sin techo explícito — el rate limiter de actor '
  '(ia_redaccion:<actorId> en ia-redactar-explicacion) sigue aplicando igual. Configurable en '
  'configuracion/ia.vue junto al resto de esta fila.';

-- ── ia_uso_mensual — acumulador, no configuración ───────────────────────

create table public.ia_uso_mensual (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  -- 'YYYY-MM', to_char(now(), 'YYYY-MM') — un mes calendario, no una
  -- ventana rodante: simple de leer para un humano y de resetear (una fila
  -- nueva por mes, ninguna tarea de "reset" que correr).
  periodo            text not null,
  llamadas           int not null default 0,
  tokens_entrada     bigint not null default 0,
  tokens_salida      bigint not null default 0,
  costo_estimado_usd numeric(10,4) not null default 0,
  actualizado_at     timestamptz not null default now(),
  unique (tenant_id, periodo)
);

comment on table public.ia_uso_mensual is
  'Ola 3 §2: uso acumulado del gateway de IA por tenant y mes calendario — tokens y costo '
  'ESTIMADO (packages/ai-providers::estimarCosto, no facturación real del proveedor). Solo '
  'fn_registrar_uso_ia (service_role) escribe, tras cada llamada real; ningún cliente autenticado '
  'puede insertar/actualizar/borrar directamente — mismo criterio de "sin ruta de escritura para '
  'el cliente donde hay un invariante que proteger" que ia_credencial, aunque aquí SÍ hay '
  'select: el tenant puede ver cuánto ha gastado.';

alter table public.ia_uso_mensual enable row level security;
alter table public.ia_uso_mensual force row level security;

create index ia_uso_mensual_tenant_idx on public.ia_uso_mensual (tenant_id);

create policy ia_uso_mensual_select_miembro on public.ia_uso_mensual
  for select to authenticated
  using (public.is_member(tenant_id));

-- (Sin políticas de insert/update/delete — ver COMMENT ON TABLE.)

-- ── fn_registrar_uso_ia — única escritura, tras una llamada real ────────

create function public.fn_registrar_uso_ia(
  p_tenant_id uuid,
  p_tokens_entrada bigint,
  p_tokens_salida bigint,
  p_costo_estimado_usd numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ia_uso_mensual (tenant_id, periodo, llamadas, tokens_entrada, tokens_salida, costo_estimado_usd)
  values (p_tenant_id, to_char(now(), 'YYYY-MM'), 1, p_tokens_entrada, p_tokens_salida, p_costo_estimado_usd)
  on conflict (tenant_id, periodo) do update set
    llamadas           = public.ia_uso_mensual.llamadas + 1,
    tokens_entrada     = public.ia_uso_mensual.tokens_entrada + excluded.tokens_entrada,
    tokens_salida      = public.ia_uso_mensual.tokens_salida + excluded.tokens_salida,
    costo_estimado_usd = public.ia_uso_mensual.costo_estimado_usd + excluded.costo_estimado_usd,
    actualizado_at     = now();
end;
$$;

comment on function public.fn_registrar_uso_ia(uuid, bigint, bigint, numeric) is
  'Ola 3 §2 — única escritura de ia_uso_mensual. Se llama SOLO tras una llamada real y exitosa al '
  'gateway de modelo (nunca por adelantado, nunca especulativamente): el acumulador refleja uso '
  'real, no intentos. service_role únicamente, desde ia-redactar-explicacion.';

revoke execute on function public.fn_registrar_uso_ia(uuid, bigint, bigint, numeric)
  from public, anon, authenticated;
grant execute on function public.fn_registrar_uso_ia(uuid, bigint, bigint, numeric) to service_role;

-- ── fn_presupuesto_ia_disponible — lectura simple para el Edge Function ─

create function public.fn_presupuesto_ia_disponible(p_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_techo   numeric(10,2);
  v_gastado numeric(10,4);
begin
  if not public.is_member(p_tenant_id) then
    raise exception 'FORBIDDEN: se requiere membresía en esta copropiedad';
  end if;

  select presupuesto_mensual_usd into v_techo
  from public.ia_config
  where tenant_id = p_tenant_id and activa
  limit 1;

  -- Sin proveedor activo, o activo sin techo configurado: esta función solo
  -- responde la pregunta de presupuesto, no si hay proveedor — eso lo
  -- decide el Edge Function leyendo ia_config directo (DI-09-like: cada
  -- pieza responde una sola pregunta).
  if v_techo is null then
    return true;
  end if;

  select costo_estimado_usd into v_gastado
  from public.ia_uso_mensual
  where tenant_id = p_tenant_id and periodo = to_char(now(), 'YYYY-MM');

  return coalesce(v_gastado, 0) < v_techo;
end;
$$;

comment on function public.fn_presupuesto_ia_disponible(uuid) is
  'Ola 3 §2 — true si el tenant puede seguir consumiendo el gateway de IA este mes calendario '
  '(sin techo configurado, o gasto acumulado por debajo del techo). No verifica que haya un '
  'proveedor activo/verificado — eso lo decide ia-redactar-explicacion aparte, leyendo ia_config '
  '(cuya policy de SELECT ya autoriza a cualquier miembro).';

revoke execute on function public.fn_presupuesto_ia_disponible(uuid) from public, anon;
grant execute on function public.fn_presupuesto_ia_disponible(uuid) to authenticated, service_role;
