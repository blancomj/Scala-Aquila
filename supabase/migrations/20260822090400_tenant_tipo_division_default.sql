-- ═══════════════════════════════════════════════════════════════════════
--  Fix: tenants.tipo_division_id sin default rompía create_tenant()
--  Propietario: seguimiento de 20260822090300_tenant_datos_basicos.sql
--
--  Esa migración (provista por el usuario) puso tipo_division_id NOT NULL
--  con backfill solo para filas existentes — pero create_tenant() (RPC de
--  onboarding real, 20260814120000_tenancy_rpc.sql) y el helper de tests
--  crearTenant() (tests/rls/helpers.ts, insert directo) nunca la setean.
--  Confirmado con la corrida completa de tests: 26 archivos fallando,
--  todos con "TIPO_DIVISION_INVALIDO: tipo_division_id <NULL>" como causa
--  raíz — esto también rompía el onboarding real, no solo los tests.
--
--  Fix a nivel de esquema en vez de tocar create_tenant() y el helper de
--  tests por separado: un DEFAULT respaldado por función cubre cualquier
--  camino de inserción presente o futuro que no especifique
--  tipo_division_id, sin modificar la RPC ni el código de tests. Mismo
--  mecanismo que gen_random_uuid()/now() como default — Postgres no exige
--  que el default sea IMMUTABLE (eso solo aplica a columnas GENERATED),
--  una función que hace SELECT adentro es válida como DEFAULT.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_tipo_division_default()
returns bigint
language sql
stable
set search_path = ''
as $$
  select id from public.lista_tipos
  where tipo = 'TIPO_DIVISION_PH' and tenant_id is null and codigo = 'residencial'
  limit 1
$$;

alter table public.tenants
  alter column tipo_division_id set default public.fn_tipo_division_default();

comment on function public.fn_tipo_division_default() is
  'Default de tenants.tipo_division_id (residencial) — usado quien no especifique el '
  'campo al crear un tenant (create_tenant() RPC, helpers de tests). Ver 20260822090400.';
