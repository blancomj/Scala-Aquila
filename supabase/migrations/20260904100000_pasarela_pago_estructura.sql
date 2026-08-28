-- ═══════════════════════════════════════════════════════════════════════
--  Estructura multi-pasarela de pago por copropiedad — FASE DE ESTRUCTURA.
--  Propietario: Docs/evaluacion/05-evaluacion-pagos-conciliacion.md §A/§B/§D
--
--  Principio no negociable (§A del documento propietario): LA COPROPIEDAD ES
--  EL COMERCIO, NO AQUILA. Cada tenant usa su propia cuenta de pasarela y el
--  dinero va directo a su cuenta de recaudo — AQUILA nunca custodia dinero,
--  lo que evita caer bajo regulación de la Superintendencia Financiera.
--  De ahí que las credenciales sean POR TENANT y no variables de entorno de
--  plataforma (que es lo único que existía hasta hoy, D-19/D-21).
--
--  Esta migración deja SOLO la estructura: esquema, configuración por tenant
--  y activación. NO hay cobro real, NO hay webhooks, NO hay registro de pagos
--  desde una pasarela — eso es la fase siguiente (§F: Wompi primero).
--
--  Vault (verificado 2026-08-27 contra el proyecto de desarrollo antes de
--  escribir esto, no asumido): supabase_vault 0.3.1 instalado, ciclo
--  create_secret → decrypted_secrets → delete funcionando. Por eso
--  pasarela_credencial guarda un vault_secret_id y NUNCA el valor.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Enums ──────────────────────────────────────────────────────────────
create type public.pasarela_proveedor_t as enum ('wompi', 'payu', 'epayco', 'bold');

comment on type public.pasarela_proveedor_t is
  'Proveedor de pasarela de pago. Enum nativo y no lista_tipos (D-24) porque el valor '
  'selecciona en tiempo de ejecución qué adaptador de código se ejecuta '
  '(packages/payment-gateways/src/registro.ts): cada proveedor tiene su propio esquema de '
  'firma de webhook, su propio contrato de API y su propio tipo de checkout (Wompi/PayU/ePayco '
  'redirigen a una URL; Bold renderiza un botón embebido con firma de integridad). ADAPTADORES '
  'es un Record<PasarelaProveedor, PaymentGatewayAdapter>: agregar un valor aquí sin escribir su '
  'adaptador es un error de compilación de TypeScript, no un fallo en producción. Un proveedor '
  'nuevo no es una fila más de catálogo, es una clase que alguien tiene que escribir.';

create type public.pasarela_modo_t as enum ('sandbox', 'produccion');

comment on type public.pasarela_modo_t is
  'Entorno de la pasarela. Enum nativo y no lista_tipos (D-24) porque el valor gatilla lógica: '
  'decide a qué host de API apunta el adaptador (sandbox del proveedor vs producción, con '
  'credenciales distintas), y fn_activar_pasarela lo usa como invariante — no se puede activar '
  'en produccion una configuración cuyas credenciales nunca se probaron (verificada_at null).';

-- ── Métodos de pago que las pasarelas pueden reportar ──────────────────
-- ERRATA 3: no se inventa un vocabulario paralelo en text[]. La familia
-- FORMA_PAGO de lista_tipos ya existe (20260814180000 + 20260903100000) y es
-- la que alimenta pagos.forma_pago_id (NOT NULL). La fase 2 tendrá que mapear
-- "lo que reportó la pasarela" a una forma de pago para poder insertar el
-- pago; si esta fase inventara códigos propios, alguien tendría que
-- reconciliar dos vocabularios. Se siembran ahora los que faltan.
insert into public.lista_tipos (tipo, codigo, nombre, orden)
select v.tipo, v.codigo, v.nombre, v.orden
from (values
  ('FORMA_PAGO', 'tarjeta_credito', 'Tarjeta de Crédito', 7),
  ('FORMA_PAGO', 'tarjeta_debito', 'Tarjeta Débito', 8),
  ('FORMA_PAGO', 'nequi', 'Nequi', 9),
  ('FORMA_PAGO', 'corresponsal_bancario', 'Corresponsal Bancario (Efecty/Baloto)', 10)
) as v(tipo, codigo, nombre, orden)
where not exists (
  select 1 from public.lista_tipos lt
  where lt.tipo = v.tipo and lt.codigo = v.codigo and lt.tenant_id is null
);

-- ── pasarela_config — legible por cualquier miembro del tenant ─────────
create table public.pasarela_config (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete cascade,
  proveedor              public.pasarela_proveedor_t not null,
  modo                   public.pasarela_modo_t not null default 'sandbox',
  activa                 boolean not null default false,
  identificador_publico  text,
  -- Resolución de tenant en el webhook (§6, opción 1). El webhook NO se
  -- construye en esta fase, pero la columna se crea ahora: agregarla después
  -- obligaría a regenerar tokens en tenants ya configurados.
  webhook_token          text not null default encode(gen_random_bytes(24), 'hex'),
  verificada_at          timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz
);

comment on table public.pasarela_config is
  'Configuración de pasarela de pago POR COPROPIEDAD (§A del documento propietario: la '
  'copropiedad es el comercio, no AQUILA). Un tenant puede tener varias configuradas pero '
  'exactamente una activa (índice parcial pasarela_config_una_activa) — cambiarla va por '
  'fn_activar_pasarela, nunca UPDATE directo, porque un UPDATE suelto desde el cliente puede '
  'violar el índice único parcial. NO contiene secretos: eso vive en pasarela_credencial, que '
  'no tiene política de lectura para authenticated.';

comment on column public.pasarela_config.identificador_publico is
  'Clave pública / merchant id / api_login según el proveedor — NO es secreto, viaja al '
  'navegador en el checkout. Los secretos van a pasarela_credencial (Vault).';

comment on column public.pasarela_config.webhook_token is
  'Token opaco que identifica al tenant en la URL del webhook (/webhook-pasarela/{proveedor}/'
  '{token}) SIN autenticarlo — resuelve el huevo-y-gallina de validar la firma de un webhook '
  'anónimo con el secreto del tenant dueño de la transacción. Identificar ≠ autenticar: la '
  'firma sigue siendo la que autoriza. Rotable. El webhook se construye en la fase siguiente.';

comment on column public.pasarela_config.verificada_at is
  'Última vez que las credenciales se probaron con éxito contra el proveedor. '
  'fn_activar_pasarela lo exige para activar en modo produccion.';

alter table public.pasarela_config enable row level security;
alter table public.pasarela_config force row level security;

create index pasarela_config_tenant_idx on public.pasarela_config (tenant_id);

-- Una configuración por proveedor y tenant: se puede tener Wompi y Bold
-- configurados a la vez, pero no dos filas de Wompi.
create unique index pasarela_config_tenant_proveedor_unico
  on public.pasarela_config (tenant_id, proveedor);

-- EXACTAMENTE una pasarela activa por tenant — patrón idéntico a
-- cuentas_bancarias.es_recaudo (20260822090100).
create unique index pasarela_config_una_activa
  on public.pasarela_config (tenant_id)
  where activa;

create unique index pasarela_config_webhook_token_unico
  on public.pasarela_config (webhook_token);

-- RLS: mismo patrón que el resto del dominio. 'auxiliar' (no 'agent': el
-- valor se renombró en 20260830100000) — has_role() ya trata a
-- 'administrador' como superconjunto de 'auxiliar', así que pedir 'auxiliar'
-- autoriza a ambos.
create policy pasarela_config_select_miembro on public.pasarela_config
  for select to authenticated
  using (public.is_member(tenant_id));

create policy pasarela_config_insert_agent on public.pasarela_config
  for insert to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy pasarela_config_update_agent on public.pasarela_config
  for update to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy pasarela_config_delete_agent on public.pasarela_config
  for delete to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── pasarela_config_metodo — qué métodos habilita esta copropiedad ─────
-- Tabla puente y no un array de ids: un bigint[] no admite FK por elemento,
-- así que el vocabulario quedaría sin integridad referencial contra
-- lista_tipos. El resto del dominio ya modela N:N con tablas puente.
create table public.pasarela_config_metodo (
  config_id      uuid   not null references public.pasarela_config (id) on delete cascade,
  tenant_id      uuid   not null references public.tenants (id) on delete cascade,
  forma_pago_id  bigint not null references public.lista_tipos (id),
  created_at     timestamptz not null default now(),
  primary key (config_id, forma_pago_id)
);

comment on table public.pasarela_config_metodo is
  'Métodos de pago que esta copropiedad habilita en su pasarela. Apunta a lista_tipos familia '
  'FORMA_PAGO — el MISMO vocabulario que consume pagos.forma_pago_id, para que la fase 2 pueda '
  'mapear lo que reporta la pasarela a un pago real sin reconciliar dos catálogos paralelos. '
  'El subconjunto ofrecible lo declara el adaptador (capacidades.metodosSoportados); esta tabla '
  'guarda cuáles de esos el administrador efectivamente encendió.';

alter table public.pasarela_config_metodo enable row level security;
alter table public.pasarela_config_metodo force row level security;

create index pasarela_config_metodo_tenant_idx on public.pasarela_config_metodo (tenant_id);

create policy pasarela_config_metodo_select_miembro on public.pasarela_config_metodo
  for select to authenticated
  using (public.is_member(tenant_id));

create policy pasarela_config_metodo_insert_agent on public.pasarela_config_metodo
  for insert to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy pasarela_config_metodo_delete_agent on public.pasarela_config_metodo
  for delete to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- Backstop: el método habilitado debe pertenecer a FORMA_PAGO y al mismo
-- tenant (o ser global) — mismo criterio que guard_pago_medio_recaudo.
create function public.guard_pasarela_metodo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_familia text;
  v_tenant  uuid;
begin
  select lt.tipo, lt.tenant_id into v_familia, v_tenant
  from public.lista_tipos lt
  where lt.id = new.forma_pago_id;

  if v_familia is distinct from 'FORMA_PAGO' then
    raise exception 'FORMA_PAGO_INVALIDA: forma_pago_id % no pertenece a FORMA_PAGO (es %)',
      new.forma_pago_id, coalesce(v_familia, 'inexistente');
  end if;

  if v_tenant is not null and v_tenant <> new.tenant_id then
    raise exception 'FORMA_PAGO_INVALIDA: la forma de pago % pertenece a otra copropiedad',
      new.forma_pago_id;
  end if;

  return new;
end;
$$;

create trigger pasarela_config_metodo_guard
  before insert on public.pasarela_config_metodo
  for each row execute function public.guard_pasarela_metodo();

-- ── pasarela_credencial — SOLO service_role, jamás authenticated ───────
create table public.pasarela_credencial (
  id               uuid primary key default gen_random_uuid(),
  config_id        uuid not null references public.pasarela_config (id) on delete cascade,
  -- Denormalizado a propósito: permite filtrar por tenant sin join, y deja la
  -- puerta abierta a una política por tenant si algún día hiciera falta.
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  nombre           text not null,
  vault_secret_id  uuid not null,
  created_at       timestamptz not null default now(),
  created_by       uuid references public.profiles (id) on delete set null
);

comment on table public.pasarela_credencial is
  'Credenciales secretas de la pasarela de cada copropiedad (private_key, integrity_secret, '
  'webhook_secret, api_key...). LA AUSENCIA DE POLÍTICA PARA `authenticated` ES DELIBERADA, NO '
  'UN OLVIDO: RLS está enable+force y no hay ninguna policy, así que ningún usuario con sesión '
  'puede leer ni escribir esta tabla — solo service_role (que salta RLS) desde la Edge Function '
  'configurar-pasarela. Mismo criterio que pagos/pago_aplicaciones (REQ-SEC-001, '
  '20260816100000): donde hay un efecto de seguridad que el cliente no debe poder eludir, no hay '
  'política de cliente. NO agregar una policy aquí "para que la UI pueda leerlas" — la UI nunca '
  'lee una credencial de vuelta, muestra puntos y ofrece reemplazarla.';

comment on column public.pasarela_credencial.vault_secret_id is
  'Referencia a vault.secrets — EL VALOR NUNCA SE GUARDA EN ESTA TABLA. El cifrado en reposo lo '
  'aporta Supabase Vault (verificado 2026-08-27: supabase_vault 0.3.1 en el proyecto de '
  'desarrollo), no criptografía propia: se lee con vault.decrypted_secrets desde la Edge '
  'Function con service_role.';

alter table public.pasarela_credencial enable row level security;
alter table public.pasarela_credencial force row level security;

create index pasarela_credencial_config_idx on public.pasarela_credencial (config_id);

create unique index pasarela_credencial_config_nombre_unico
  on public.pasarela_credencial (config_id, nombre);

-- (Sin políticas — ver COMMENT ON TABLE. Es intencional.)

-- ── fn_activar_pasarela — swap atómico + auditoría ─────────────────────
-- SECURITY DEFINER, no INVOKER: la función audita en audit_log, que no tiene
-- política de INSERT para authenticated (única policy: audit_log_select_agent_auditor,
-- 20260813190300). Con INVOKER el insert de auditoría fallaría por RLS. Es el
-- mismo patrón de fn_guardar_plantilla_sms (20260822240000): DEFINER + chequeo
-- explícito de has_role() adentro, porque al escalar privilegios la RLS de la
-- tabla ya no autoriza por sí sola.
create function public.fn_activar_pasarela(
  p_config_id uuid,
  p_tenant_id uuid
)
returns public.pasarela_config
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.pasarela_config;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para activar una pasarela';
  end if;

  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o administrador en esta copropiedad';
  end if;

  select * into v_row
  from public.pasarela_config
  where id = p_config_id and tenant_id = p_tenant_id;

  if not found then
    raise exception 'PASARELA_NO_CONFIGURADA: la configuración % no existe en esta copropiedad',
      p_config_id;
  end if;

  -- Que nadie ponga en producción credenciales que nunca se probaron. En
  -- sandbox sí se permite: es justamente donde se prueban.
  if v_row.modo = 'produccion' and v_row.verificada_at is null then
    raise exception
      'PASARELA_NO_VERIFICADA: no se puede activar en produccion una pasarela cuyas credenciales '
      'nunca se probaron con éxito';
  end if;

  -- Swap en una sola transacción: primero desactiva la vigente, después
  -- activa la nueva. Dos UPDATE sueltos desde el cliente violarían el índice
  -- único parcial pasarela_config_una_activa.
  update public.pasarela_config
  set activa = false, updated_at = now()
  where tenant_id = p_tenant_id and activa and id <> p_config_id;

  update public.pasarela_config
  set activa = true, updated_at = now()
  where id = p_config_id and tenant_id = p_tenant_id
  returning * into v_row;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    (select auth.uid()),
    'pasarela.activada',
    'pasarela_config',
    v_row.id,
    jsonb_build_object('proveedor', v_row.proveedor, 'modo', v_row.modo)
  );

  return v_row;
end;
$$;

revoke execute on function public.fn_activar_pasarela(uuid, uuid) from public, anon;
grant execute on function public.fn_activar_pasarela(uuid, uuid) to authenticated;

-- ── fn_cambiar_modo_pasarela — sandbox ⇄ produccion, auditado ──────────
create function public.fn_cambiar_modo_pasarela(
  p_config_id uuid,
  p_tenant_id uuid,
  p_modo      public.pasarela_modo_t
)
returns public.pasarela_config
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_modo_anterior public.pasarela_modo_t;
  v_row public.pasarela_config;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para cambiar el modo de una pasarela';
  end if;

  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o administrador en esta copropiedad';
  end if;

  select modo into v_modo_anterior
  from public.pasarela_config
  where id = p_config_id and tenant_id = p_tenant_id;

  if not found then
    raise exception 'PASARELA_NO_CONFIGURADA: la configuración % no existe en esta copropiedad',
      p_config_id;
  end if;

  -- Cambiar de entorno invalida la verificación: las credenciales de sandbox
  -- no son las de producción, así que "ya se probó" deja de ser cierto.
  update public.pasarela_config
  set modo = p_modo,
      verificada_at = case when p_modo = v_modo_anterior then verificada_at else null end,
      activa = case when p_modo = v_modo_anterior then activa else false end,
      updated_at = now()
  where id = p_config_id and tenant_id = p_tenant_id
  returning * into v_row;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    (select auth.uid()),
    'pasarela.modo_cambiado',
    'pasarela_config',
    v_row.id,
    jsonb_build_object(
      'proveedor', v_row.proveedor,
      'modo_anterior', v_modo_anterior,
      'modo_nuevo', p_modo
    )
  );

  return v_row;
end;
$$;

revoke execute on function public.fn_cambiar_modo_pasarela(uuid, uuid, public.pasarela_modo_t)
  from public, anon;
grant execute on function public.fn_cambiar_modo_pasarela(uuid, uuid, public.pasarela_modo_t)
  to authenticated;
