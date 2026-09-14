-- ═══════════════════════════════════════════════════════════════════════
--  Estructura genérica de proveedor de IA por copropiedad — FASE DE
--  ESTRUCTURA, mismo alcance y mismo patrón que pasarela_pago_estructura
--  (20260904100000): esquema, configuración por tenant y activación. NO
--  hay todavía ningún consumo real de un servicio de IA — eso lo construye
--  cada módulo que lo necesite (p. ej. extracción asistida de extractos
--  bancarios en PDF), leyendo esta configuración cuando le haga falta.
--
--  Por qué POR TENANT y no una clave de plataforma (decisión explícita del
--  usuario, 2026-09-13): cada copropiedad trae y paga su propio proveedor,
--  modelo y API key — mismo criterio de autonomía que ya rige pasarela_config
--  (aquí no aplica la razón regulatoria de "la copropiedad es el comercio",
--  pero sí aplica el mismo resultado práctico: el costo y la elección de
--  proveedor son decisión de cada copropiedad, no de Aquila).
--
--  Vault (mismo mecanismo ya verificado para pasarela_credencial,
--  20260904100000): ia_credencial guarda un vault_secret_id y NUNCA el
--  valor de la clave.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Proveedor ────────────────────────────────────────────────────────────
create type public.ia_proveedor_t as enum ('anthropic', 'openai', 'google');

comment on type public.ia_proveedor_t is
  'Proveedor de servicios de IA. Enum nativo y no lista_tipos (D-24) porque el valor selecciona '
  'en tiempo de ejecución qué credenciales exigir y contra qué API hablar (packages/ai-providers/'
  'src/descriptores.ts) — mismo criterio exacto que pasarela_proveedor_t (20260904100000): un '
  'proveedor nuevo es un descriptor que alguien tiene que escribir, agregarlo al enum sin su '
  'descriptor es un error de compilación de TypeScript (Record exhaustivo), no un fallo en '
  'producción.';

-- ── ia_config — legible por cualquier miembro del tenant ────────────────
create table public.ia_config (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  proveedor    public.ia_proveedor_t not null,
  -- Texto libre y no un enum/lista_tipos a propósito: los proveedores
  -- publican modelos nuevos con más frecuencia de la que este repo se
  -- despliega. packages/ai-providers/src/descriptores.ts sugiere una lista
  -- por proveedor para la UI, pero no la hace cumplir server-side — mismo
  -- criterio de honestidad que parserBancolombia (conciliacion-parsers.ts):
  -- declarar explícitamente qué no se verifica, en vez de fingir un
  -- catálogo cerrado que se desactualiza en silencio.
  modelo       text not null,
  activa       boolean not null default false,
  verificada_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

comment on table public.ia_config is
  'Configuración de proveedor de IA POR COPROPIEDAD — cada tenant elige y paga su propio '
  'proveedor/modelo/clave. Un tenant puede tener varios proveedores configurados pero '
  'exactamente uno activo (índice parcial ia_config_una_activa) — cambiarlo va por '
  'fn_activar_ia_proveedor, nunca UPDATE directo (mismo motivo que pasarela_config: un UPDATE '
  'suelto desde el cliente puede violar el índice único parcial). NO contiene secretos: eso vive '
  'en ia_credencial, que no tiene política de lectura para authenticated.';

comment on column public.ia_config.verificada_at is
  'Última vez que se confirmó que las credenciales están en Vault y son descifrables '
  '(fn_credenciales_ia_descifrables) — fn_activar_ia_proveedor lo exige para activar. No implica '
  'que se haya hablado con la API real del proveedor: esa verificación la hace, si la necesita, '
  'el primer módulo que consuma esta configuración.';

alter table public.ia_config enable row level security;
alter table public.ia_config force row level security;

create index ia_config_tenant_idx on public.ia_config (tenant_id);

-- Una configuración por proveedor y tenant: se puede tener Anthropic y
-- OpenAI configurados a la vez, pero no dos filas de Anthropic.
create unique index ia_config_tenant_proveedor_unico
  on public.ia_config (tenant_id, proveedor);

-- EXACTAMENTE un proveedor de IA activo por tenant — patrón idéntico a
-- pasarela_config_una_activa (20260904100000) / cuentas_bancarias.es_recaudo.
create unique index ia_config_una_activa
  on public.ia_config (tenant_id)
  where activa;

-- RLS: mismo patrón que pasarela_config. 'auxiliar' (has_role() ya trata a
-- 'administrador' como superconjunto).
create policy ia_config_select_miembro on public.ia_config
  for select to authenticated
  using (public.is_member(tenant_id));

create policy ia_config_insert_auxiliar on public.ia_config
  for insert to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy ia_config_update_auxiliar on public.ia_config
  for update to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy ia_config_delete_auxiliar on public.ia_config
  for delete to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── ia_credencial — SOLO service_role, jamás authenticated ──────────────
create table public.ia_credencial (
  id               uuid primary key default gen_random_uuid(),
  config_id        uuid not null references public.ia_config (id) on delete cascade,
  -- Denormalizado a propósito, mismo criterio que pasarela_credencial:
  -- permite filtrar por tenant sin join.
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  nombre           text not null,
  vault_secret_id  uuid not null,
  created_at       timestamptz not null default now(),
  created_by       uuid references public.profiles (id) on delete set null
);

comment on table public.ia_credencial is
  'Credenciales secretas del proveedor de IA de cada copropiedad (api_key y, si el proveedor lo '
  'exige, organizacion_id/proyecto_id — todo bajo el mismo mecanismo genérico, igual que '
  'pasarela_credencial). LA AUSENCIA DE POLÍTICA PARA `authenticated` ES DELIBERADA, NO UN '
  'OLVIDO: RLS está enable+force y no hay ninguna policy, así que ningún usuario con sesión puede '
  'leer ni escribir esta tabla — solo service_role (que salta RLS) desde la Edge Function '
  'configurar-ia. Mismo criterio que pagos/pasarela_credencial (REQ-SEC-001): donde hay un efecto '
  'de seguridad que el cliente no debe poder eludir, no hay política de cliente. NO agregar una '
  'policy aquí "para que la UI pueda leerla" — la UI nunca lee una credencial de vuelta, muestra '
  'puntos y ofrece reemplazarla.';

comment on column public.ia_credencial.vault_secret_id is
  'Referencia a vault.secrets — EL VALOR NUNCA SE GUARDA EN ESTA TABLA. Cifrado en reposo vía '
  'Supabase Vault (mismo mecanismo verificado para pasarela_credencial, 20260904100000), no '
  'criptografía propia.';

alter table public.ia_credencial enable row level security;
alter table public.ia_credencial force row level security;

create index ia_credencial_config_idx on public.ia_credencial (config_id);

create unique index ia_credencial_config_nombre_unico
  on public.ia_credencial (config_id, nombre);

-- (Sin políticas — ver COMMENT ON TABLE. Es intencional.)

-- ── fn_activar_ia_proveedor — swap atómico + auditoría ──────────────────
-- SECURITY DEFINER: audita en audit_log, que no tiene política de INSERT
-- para authenticated — mismo patrón que fn_activar_pasarela.
create function public.fn_activar_ia_proveedor(
  p_config_id uuid,
  p_tenant_id uuid
)
returns public.ia_config
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.ia_config;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para activar un proveedor de IA';
  end if;

  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o administrador en esta copropiedad';
  end if;

  select * into v_row
  from public.ia_config
  where id = p_config_id and tenant_id = p_tenant_id;

  if not found then
    raise exception 'IA_NO_CONFIGURADA: la configuración % no existe en esta copropiedad',
      p_config_id;
  end if;

  -- Que nadie active un proveedor cuyas credenciales nunca se probaron: es
  -- justo lo que consumirán los módulos que pidan IA en tiempo real.
  if v_row.verificada_at is null then
    raise exception
      'IA_NO_VERIFICADA: no se puede activar un proveedor de IA cuyas credenciales nunca se '
      'probaron con éxito';
  end if;

  -- Swap en una sola transacción — dos UPDATE sueltos desde el cliente
  -- violarían el índice único parcial ia_config_una_activa.
  update public.ia_config
  set activa = false, updated_at = now()
  where tenant_id = p_tenant_id and activa and id <> p_config_id;

  update public.ia_config
  set activa = true, updated_at = now()
  where id = p_config_id and tenant_id = p_tenant_id
  returning * into v_row;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    (select auth.uid()),
    'ia_proveedor.activado',
    'ia_config',
    v_row.id,
    jsonb_build_object('proveedor', v_row.proveedor, 'modelo', v_row.modelo)
  );

  return v_row;
end;
$$;

comment on function public.fn_activar_ia_proveedor(uuid, uuid) is
  'Único camino para activar un proveedor de IA — swap atómico (desactiva el vigente, activa el '
  'nuevo) + auditoría. Exige verificada_at no nulo, mismo criterio que fn_activar_pasarela exige '
  'para producción. Nunca UPDATE directo desde el cliente.';

revoke execute on function public.fn_activar_ia_proveedor(uuid, uuid) from public, anon;
grant execute on function public.fn_activar_ia_proveedor(uuid, uuid) to authenticated;
