-- ═══════════════════════════════════════════════════════════════════════
--  Mantenimiento → Activos, Fase 5 — galería de imágenes del activo
--  Propietario: PROMPT_IMPLEMENTACION_MANTENIMIENTO_ACTIVOS_AQUILA.md §23
--  (Documentos), pedido explícito del usuario de poder capturar varias
--  fotos del activo (no solo la única `imagen_documento_id` que MANT-0
--  dejó sembrada). Ver DECISIONES.md D-92.
--
--  Quinta vez que se añade una FK de dominio a `documentos` (después de
--  pago_id/caso_juridico_id, envio_id, anuncio_id+publicacion_id,
--  tercero_perfil_id) — mismo patrón exacto que
--  20260933810000_exs4_fotos_directorio.sql: columna + índice parcial +
--  vista recreada EN LA MISMA MIGRACIÓN (v_documento_vigente es un
--  `select *` y no hereda columnas nuevas — ya pasó cuatro veces) + guard
--  con el tenant del activo validado desde el primer día.
--
--  SIN VERSIONADO entre fotos, igual que marketplace/anuncios/directorio:
--  un activo tiene VARIAS fotos (la Fase 2 pidió explícitamente "al menos
--  5"), no una que se corrige. `subir-documento` lo trata así (ver ajuste
--  en ese archivo).
--
--  Por qué no una tabla `activo_imagenes` propia: `documentos` ya es el
--  repositorio documental único del proyecto (§23 del prompt: "no crear
--  otro repositorio documental"); la columna FK por dominio es el patrón
--  establecido para colecciones de imágenes, no una tabla nueva.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.documentos
  add column activo_id uuid references public.activos (id) on delete cascade;

create index documentos_activo_idx
  on public.documentos (activo_id)
  where activo_id is not null;

comment on column public.documentos.activo_id is
  'Fase 5 de mantenimiento de activos (D-92) — foto de un activo físico. Sigue el patrón de '
  'columna FK por dominio de esta tabla; no se creó una tabla de media propia. Como el '
  'marketplace/anuncios/directorio, un activo tiene VARIAS fotos y `subir-documento` NO las '
  'versiona entre sí. El `on delete cascade` solo llega a ejercerse al borrar el activo o el '
  'tenant dueño: documentos es append-only (SEC-14) y su trigger rechaza cualquier otro DELETE.';

-- ── La vista, recreada para exponer la columna nueva ───────────────────
create or replace view public.v_documento_vigente
with (security_invoker = true) as
select distinct on (grupo_id) *
from public.documentos
order by grupo_id, version desc;

comment on view public.v_documento_vigente is
  'Última versión de cada grupo_id — derivado, no persistido (§4.2). security_invoker=true: '
  'respeta el RLS de documentos del usuario que consulta, no del dueño de la vista. '
  'RECREARLA ES OBLIGATORIO EN LA MISMA MIGRACIÓN QUE AÑADA UNA FK DE DOMINIO A `documentos`: un '
  '`select *` no hereda columnas agregadas después de crear la vista, y este repositorio ya ha '
  'tropezado con eso cinco veces (pago_id/caso_juridico_id en 20260903180000, envio_id en '
  '20260908180000, anuncio_id+publicacion_id en 20260933450000, tercero_perfil_id en '
  '20260933810000, y activo_id aquí).';

-- ── El guard, con el tenant del activo validado desde el primer día ────
create or replace function public.guard_documento_tipo_familia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_tenant_inmueble uuid;
  v_tenant_caso uuid;
  v_tenant_envio uuid;
  v_tenant_publicacion uuid;
  v_tenant_anuncio uuid;
  v_estado_anuncio public.anuncio_estado_t;
  v_tenant_perfil uuid;
  v_tenant_activo uuid;
begin
  select tipo into v_tipo from public.lista_tipos where id = new.tipo_documento_id;

  if v_tipo is distinct from 'TIPO_DOCUMENTO' then
    raise exception 'TIPO_DOCUMENTO_INVALIDO: tipo_documento_id % no pertenece a TIPO_DOCUMENTO (es %)',
      new.tipo_documento_id, coalesce(v_tipo, 'inexistente');
  end if;

  if new.inmueble_id is not null then
    select tenant_id into v_tenant_inmueble from public.inmuebles where id = new.inmueble_id;
    if v_tenant_inmueble is distinct from new.tenant_id then
      raise exception 'INMUEBLE_INVALIDO: % no pertenece al tenant %', new.inmueble_id, new.tenant_id;
    end if;
  end if;

  if new.caso_juridico_id is not null then
    select tenant_id into v_tenant_caso from public.casos_juridicos where id = new.caso_juridico_id;
    if v_tenant_caso is distinct from new.tenant_id then
      raise exception 'CASO_JURIDICO_INVALIDO: % no pertenece al tenant %', new.caso_juridico_id, new.tenant_id;
    end if;
  end if;

  if new.envio_id is not null then
    select tenant_id into v_tenant_envio from public.acciones_cobranza_envios where id = new.envio_id;
    if v_tenant_envio is distinct from new.tenant_id then
      raise exception 'ENVIO_INVALIDO: % no pertenece al tenant %', new.envio_id, new.tenant_id;
    end if;
  end if;

  if new.publicacion_id is not null then
    select tenant_id into v_tenant_publicacion
      from public.publicaciones where id = new.publicacion_id;
    if v_tenant_publicacion is distinct from new.tenant_id then
      raise exception 'PUBLICACION_INVALIDA: % no pertenece al tenant %',
        new.publicacion_id, new.tenant_id;
    end if;
  end if;

  if new.anuncio_id is not null then
    select tenant_id, estado into v_tenant_anuncio, v_estado_anuncio
      from public.anuncios where id = new.anuncio_id;

    if v_tenant_anuncio is distinct from new.tenant_id then
      raise exception 'ANUNCIO_INVALIDO: % no pertenece al tenant %',
        new.anuncio_id, new.tenant_id;
    end if;

    -- Lo publicado no se reescribe (20260933720000).
    if v_estado_anuncio in ('publicado', 'archivado', 'cancelado') then
      raise exception
        'ANUNCIO_NO_EDITABLE: el anuncio % está en estado % y ya no admite adjuntos; lo publicado no se reescribe',
        new.anuncio_id, v_estado_anuncio;
    end if;
  end if;

  if new.tercero_perfil_id is not null then
    select tenant_id into v_tenant_perfil
      from public.tercero_perfil where id = new.tercero_perfil_id;
    if v_tenant_perfil is distinct from new.tenant_id then
      raise exception 'TERCERO_PERFIL_INVALIDO: % no pertenece al tenant %',
        new.tercero_perfil_id, new.tenant_id;
    end if;
  end if;

  if new.activo_id is not null then
    select tenant_id into v_tenant_activo
      from public.activos where id = new.activo_id;
    if v_tenant_activo is distinct from new.tenant_id then
      raise exception 'ACTIVO_INVALIDO: % no pertenece al tenant %',
        new.activo_id, new.tenant_id;
    end if;
  end if;

  return new;
end;
$$;
