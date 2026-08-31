-- ═══════════════════════════════════════════════════════════════════════
--  PRQ-CAR-022 — documentos.envio_id (CAR §24.1, "cargue del acuse
--  escaneado" para el canal físico). GAP-CAR-007 (documento a nivel del
--  expediente completo, caso_juridico_id) ya se cerró por separado
--  (20260822340000 + subir-documento 2026-08-30) — esto es distinto:
--  un documento que evidencia UN envío puntual (constancia de entrega,
--  acuse firmado, comprobante de correo certificado), no el expediente
--  completo.
--
--  Por qué es una columna más en documentos, no una tabla nueva: mismo
--  criterio que inmueble_id/pago_id/caso_juridico_id — documentos ya es
--  el único punto de escritura versionado (grupo_id/version) con Storage
--  + subir-documento como único camino de INSERT. Duplicar esa
--  infraestructura para "documentos_envio" sería la misma tabla paralela
--  que REC-CAR-004 ya rechazó para caso_juridico_documentos.
--
--  No sustituye a acciones_cobranza_acuses.documento_id (20260906100000):
--  esa columna cuelga del ACUSE (el evento — "el 14/03 alguien confirmó
--  que llegó"), exige origen='manual' y ya existía. documentos.envio_id
--  cuelga del ENVÍO (el intento — "esto es lo que se mandó/lo que volvió
--  firmado"). Un acuse manual normalmente citará un documento que también
--  tiene envio_id, pero son dos relaciones distintas: la del acuse puede
--  apuntar a cualquier documento ya subido, con cualquier alcance.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.documentos
  add column envio_id uuid references public.acciones_cobranza_envios (id);

comment on column public.documentos.envio_id is
  'PRQ-CAR-022 — nullable, mismo criterio que inmueble_id/pago_id/caso_juridico_id: un '
  'documento puede evidenciar un envío puntual de cobranza (constancia de entrega, acuse '
  'firmado del canal físico). subir-documento resuelve el tenant contra el envío cuando '
  'viene este campo (ver index.ts).';

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

  return new;
end;
$$;

-- select * en una vista no hereda columnas agregadas después de su creación
-- (mismo incidente que pago_id/caso_juridico_id, 20260903180000) — se
-- recrea aquí de una vez.
create or replace view public.v_documento_vigente
with (security_invoker = true) as
select distinct on (grupo_id) *
from public.documentos
order by grupo_id, version desc;

comment on view public.v_documento_vigente is
  'Última versión de cada grupo_id — derivado, no persistido (§4.2). security_invoker=true: '
  'respeta el RLS de documentos del usuario que consulta, no del dueño de la vista. Recreada '
  'en 20260908180000 para exponer envio_id (PRQ-CAR-022) — select * en una vista no hereda '
  'columnas agregadas después de su creación original.';
