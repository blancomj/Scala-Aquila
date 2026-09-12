-- ═══════════════════════════════════════════════════════════════════════
--  EXS-6 · Marketplace — las fotos, de verdad
--
--  20260933410000 añadió `documentos.publicacion_id`, pero una columna no
--  basta para que nadie pueda subir una foto. Faltaban dos cosas, y una de
--  ellas afecta también a los anuncios de EXS-3:
--
--  1. `v_documento_vigente` es un `select *`, y una vista NO hereda las
--     columnas agregadas después de crearla. Ya pasó dos veces en este
--     repositorio (pago_id/caso_juridico_id en 20260903180000, envio_id en
--     20260908180000) y ha vuelto a pasar: hoy la vista no expone NI
--     `anuncio_id` (EXS-3) NI `publicacion_id` (EXS-6). Se recrea, y ambas
--     quedan visibles.
--
--  2. `guard_documento_tipo_familia` valida que el inmueble, el caso
--     jurídico y el envío citados pertenezcan al mismo tenant. La
--     publicación no se validaba, así que un documento podía apuntar a una
--     publicación de otra copropiedad.
-- ═══════════════════════════════════════════════════════════════════════

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

  return new;
end;
$$;

-- Recreada para exponer anuncio_id (EXS-3) y publicacion_id (EXS-6): un
-- `select *` no hereda columnas agregadas después de crear la vista.
create or replace view public.v_documento_vigente
with (security_invoker = true) as
select distinct on (grupo_id) *
from public.documentos
order by grupo_id, version desc;

comment on view public.v_documento_vigente is
  'Última versión de cada grupo_id — derivado, no persistido (§4.2). security_invoker=true: '
  'respeta el RLS de documentos del usuario que consulta, no del dueño de la vista. Recreada en '
  '20260933450000 para exponer anuncio_id (EXS-3) y publicacion_id (EXS-6) — select * en una '
  'vista no hereda columnas agregadas después de su creación, y este repositorio ya ha tropezado '
  'con eso tres veces: al añadir pago_id/caso_juridico_id, al añadir envio_id, y ahora. Quien '
  'agregue una FK de dominio a documentos tiene que recrear esta vista en la misma migración.';
