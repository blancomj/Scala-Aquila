-- ═══════════════════════════════════════════════════════════════════════
--  CO-2 · Comprobantes — observaciones + soporte documental
--
--  Gap real señalado por el usuario tras revisar el modal "Nuevo
--  comprobante" (D-130 ya cerró las dimensiones analíticas; esto cierra los
--  otros dos huecos identificados en la misma auditoría):
--
--  1. Sin campo de observaciones — descripcion es el concepto obligatorio
--     del comprobante, pero no hay dónde anotar contexto libre (ej. por qué
--     se hizo este ajuste manual, qué acordó el comité con el proveedor).
--
--  2. Sin soporte documental — un comprobante manual (ajuste/reclasifica-
--     ción/etc.) no tenía forma de adjuntar la factura/recibo escaneado que
--     lo sustenta. Los comprobantes AUTOGENERADOS no lo necesitan (su
--     soporte vive en el módulo de origen vía origen_modulo/origen_entidad/
--     origen_id), pero los manuales son justo los que un revisor fiscal más
--     querría poder trazar hasta un soporte.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. observaciones ──────────────────────────────────────────────────────
alter table public.contable_comprobante
  add column observaciones text;

comment on column public.contable_comprobante.observaciones is
  'Nota libre sobre el comprobante (contexto para quien lo revisa — ej. un revisor fiscal), '
  'distinta de descripcion (el concepto, obligatorio, fijado al crear). No participa en la '
  'inmutabilidad de guard_contable_comprobante_transicion: es una anotación, no un hecho '
  'financiero, así que se puede seguir editando incluso después de contabilizado — mediante '
  'fn_actualizar_observaciones_comprobante (ver abajo), no con un UPDATE directo del cliente '
  '(contable_comprobante_update_auxiliar exige estado in (borrador, anulado) a propósito: eso '
  'evita que un cliente alcance ''contabilizado'' o toque numero por fuera de '
  'fn_contabilizar_comprobante).';

-- RPC dedicada: el único camino para anotar un comprobante ya contabilizado o anulado. No usa
-- la política UPDATE normal (que bloquea 'contabilizado' a propósito — ver comentario arriba)
-- porque SECURITY DEFINER + un UPDATE que toca EXCLUSIVAMENTE `observaciones` no reabre el hueco
-- que esa política cierra: guard_contable_comprobante_transicion ya permite implícitamente que
-- observaciones cambie en cualquier transición (no está en su lista de campos inmutables).
create function public.fn_actualizar_observaciones_comprobante(
  p_comprobante_id uuid,
  p_observaciones text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.contable_comprobante where id = p_comprobante_id;
  if v_tenant_id is null then
    raise exception 'COMPROBANTE_ESTADO_INVALIDO: % no existe', p_comprobante_id;
  end if;

  if not public.has_role(v_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o administrador para anotar un comprobante';
  end if;

  update public.contable_comprobante
  set observaciones = nullif(btrim(p_observaciones), '')
  where id = p_comprobante_id;
end;
$$;

comment on function public.fn_actualizar_observaciones_comprobante(uuid, text) is
  'CO-2: anota un comprobante (nota libre) sin pasar por la política UPDATE de '
  'contable_comprobante, que exige estado in (borrador, anulado) a propósito. Como RPC dedicada '
  'y SECURITY DEFINER, funciona en cualquier estado (incluido contabilizado) y solo puede tocar '
  '`observaciones` — nunca numero, estado ni ningún campo financiero.';

-- ── 2. soporte documental — generalización #9 de `documentos` ────────────
-- (después de pago_id/caso_juridico_id, envio_id, publicacion_id+anuncio_id, tercero_perfil_id,
-- activo_id — mismo patrón exacto, ver 20260903170000).
alter table public.documentos
  add column comprobante_id uuid references public.contable_comprobante (id);

create index documentos_comprobante_idx
  on public.documentos (comprobante_id)
  where comprobante_id is not null;

comment on column public.documentos.comprobante_id is
  'Nullable, mismo patrón que pago_id/caso_juridico_id/envio_id: el soporte documental (factura, '
  'recibo escaneado) de un comprobante contable de captura MANUAL (CO-2). Solo tiene sentido '
  'para esos — los comprobantes autogenerados por otros módulos ya citan su soporte real en el '
  'módulo de origen (origen_modulo/origen_entidad/origen_id). Versionado como cualquier otro '
  'alcance de esta tabla: subir de nuevo con el mismo tipo_documento_id reemplaza (version+1), no '
  'duplica.';

-- La vista, recreada para exponer la columna nueva — v_documento_vigente es un `select *` y no
-- hereda columnas agregadas después de crearla (ya ha pasado seis veces, ver comentario de
-- 20260934040000).
create or replace view public.v_documento_vigente
with (security_invoker = true) as
select distinct on (grupo_id) *
from public.documentos
order by grupo_id, version desc;

-- El guard, con TODAS las validaciones anteriores + comprobante_id nuevo. De paso se restaura la
-- validación de pago_id: se perdió en silencio a partir de 20260908180000 (cada "create or
-- replace" reemplaza el cuerpo completo, y esa migración no la copió al agregar envio_id) —
-- encontrado al leer esta función para extenderla, no explotable hoy porque subir-documento/
-- index.ts ya valida pago.tenant_id === tenantId antes del insert (documentos no tiene política
-- INSERT para authenticated, así que ese es el único camino de escritura real), pero es defensa
-- en profundidad que no debía haberse perdido.
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
  v_tenant_pago uuid;
  v_tenant_envio uuid;
  v_tenant_publicacion uuid;
  v_tenant_anuncio uuid;
  v_estado_anuncio public.anuncio_estado_t;
  v_tenant_perfil uuid;
  v_tenant_activo uuid;
  v_tenant_comprobante uuid;
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

  if new.pago_id is not null then
    select tenant_id into v_tenant_pago from public.pagos where id = new.pago_id;
    if v_tenant_pago is distinct from new.tenant_id then
      raise exception 'PAGO_INVALIDO: % no pertenece al tenant %', new.pago_id, new.tenant_id;
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
      raise exception 'ACTIVO_INVALIDO: % no pertenece al tenant %', new.activo_id, new.tenant_id;
    end if;
  end if;

  if new.comprobante_id is not null then
    select tenant_id into v_tenant_comprobante
      from public.contable_comprobante where id = new.comprobante_id;
    if v_tenant_comprobante is distinct from new.tenant_id then
      raise exception 'COMPROBANTE_INVALIDO: % no pertenece al tenant %', new.comprobante_id, new.tenant_id;
    end if;
  end if;

  return new;
end;
$$;

-- ── nuevo código de catálogo: ninguno de los existentes describe un soporte de comprobante
--    contable (comprobante_pago es de un pago, no de un asiento manual).
insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_DOCUMENTO', 'soporte_comprobante', 'Soporte de comprobante contable', 29);
