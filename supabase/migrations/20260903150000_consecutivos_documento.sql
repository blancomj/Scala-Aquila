-- ═══════════════════════════════════════════════════════════════════════
--  RC-3 (1/2) · Consecutivos de documento, configurables con prefijo
--
--  ═══ POR QUÉ NO estados_cuenta_folio_seq ═══
--
--  Esa secuencia (20260901100000) es GLOBAL: la comparten TODOS los
--  tenants de la plataforma. Tolerable para un folio de autenticidad (su
--  único trabajo es no repetirse nunca, y con eso basta). Un recibo de caja
--  es un documento contable con numeración CONSECUTIVA POR COPROPIEDAD —
--  copiar ese patrón habría producido saltos en la numeración de cada
--  copropiedad cada vez que OTRA copropiedad emitiera un recibo. Señalado
--  como gap explícito al planear RC-3 y resuelto aquí, no repetido.
--
--  ═══ EL DISEÑO ═══
--
--  Una fila por (tenant, tipo_documento) — hoy solo 'recibo_caja', pero el
--  mismo mecanismo sirve para comprobante_ingreso/egreso cuando existan
--  (fuera de alcance de este plan, ver decisión del usuario 2026-08-27).
--  Prefijo y dígitos configurables desde una pantalla de Configuración —
--  pedido explícito del usuario ("Aprovechar y crear una página en
--  configuración para manejar los consecutivos de documentos").
--
--  fn_siguiente_consecutivo() hace SELECT ... FOR UPDATE antes de
--  incrementar: dos emisiones concurrentes del mismo tipo de documento en
--  el mismo tenant nunca pueden llevarse el mismo número — se serializan
--  en la fila, no hay ventana de carrera.
-- ═══════════════════════════════════════════════════════════════════════

create table public.consecutivos_documento (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  tipo_documento    text not null,
  prefijo           text not null default '',
  siguiente_numero  integer not null default 1 check (siguiente_numero > 0),
  digitos           smallint not null default 6 check (digitos between 1 and 10),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,

  constraint consecutivos_documento_unico unique (tenant_id, tipo_documento)
);

alter table public.consecutivos_documento enable row level security;
alter table public.consecutivos_documento force row level security;

create index consecutivos_documento_tenant_idx on public.consecutivos_documento (tenant_id);

comment on table public.consecutivos_documento is
  'Numeración consecutiva por copropiedad y tipo de documento (RC-3) — a diferencia de '
  'estados_cuenta_folio_seq (global, solo folio de autenticidad), aquí cada tenant lleva su '
  'propia numeración configurable (prefijo, dígitos). Se administra desde Configuración.';

comment on column public.consecutivos_documento.tipo_documento is
  'Código libre — "recibo_caja" hoy. Cada tipo de documento nuevo simplemente inserta su propia '
  'fila la primera vez que se emite (fn_siguiente_consecutivo la crea con default si no existe).';

create trigger consecutivos_documento_set_updated_at
  before update on public.consecutivos_documento
  for each row execute function public.set_updated_at();

-- Lectura: administrador (para configurar), auxiliar (para ver el próximo
-- número antes de emitir). Escritura de PREFIJO/DÍGITOS: solo administrador
-- — cambiar la numeración es una decisión de gobierno, no operativa.
create policy consecutivos_documento_select_agent
  on public.consecutivos_documento for select
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar', 'auditor']::public.tenant_role_t[]));

create policy consecutivos_documento_administrador_todo
  on public.consecutivos_documento for all
  to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

-- fn_siguiente_consecutivo es quien realmente incrementa (SECURITY DEFINER,
-- se invoca desde el motor del recibo) — la policy de administrador de
-- arriba es para la pantalla de Configuración (editar prefijo/dígitos a
-- mano), no para la emisión de cada documento.
create function public.fn_siguiente_consecutivo(p_tenant_id uuid, p_tipo_documento text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefijo text;
  v_digitos smallint;
  v_numero  integer;
begin
  insert into public.consecutivos_documento (tenant_id, tipo_documento)
  values (p_tenant_id, p_tipo_documento)
  on conflict (tenant_id, tipo_documento) do nothing;

  select prefijo, digitos, siguiente_numero
    into v_prefijo, v_digitos, v_numero
  from public.consecutivos_documento
  where tenant_id = p_tenant_id and tipo_documento = p_tipo_documento
  for update;

  update public.consecutivos_documento
  set siguiente_numero = siguiente_numero + 1, updated_at = now()
  where tenant_id = p_tenant_id and tipo_documento = p_tipo_documento;

  return v_prefijo || lpad(v_numero::text, v_digitos, '0');
end;
$$;

comment on function public.fn_siguiente_consecutivo(uuid, text) is
  'Consecutivo atómico por (tenant, tipo_documento) — SELECT...FOR UPDATE antes de incrementar '
  '(RC-3), así dos emisiones concurrentes nunca comparten número. Crea la fila con default si '
  'la copropiedad nunca emitió ese tipo de documento.';
