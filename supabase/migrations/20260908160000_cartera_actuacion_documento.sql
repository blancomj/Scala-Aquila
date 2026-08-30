-- ═══════════════════════════════════════════════════════════════════════
--  Evidencia de actuaciones judiciales — caso_juridico_actuaciones.documento_id
--  Propietario: análisis de evidencia documental del proceso de cartera
--  (2026-08-29) — CAR §15.4.
--
--  Hueco encontrado: cada fila de caso_juridico_actuaciones (admisión de la
--  demanda, mandamiento de pago, embargo, sentencia...) es hoy solo
--  `descripcion text` — no hay dónde colgar el auto o la sentencia real que
--  la respalda. fn_compilar_expediente (20260906120000) incluye estas filas
--  en el expediente probatorio con su descripción, pero sin ningún soporte
--  adjunto: el juez recibe la narración, no el documento.
--
--  Mismo patrón que prescripcion_actos_interruptivos.documento_id
--  (20260907140000) e inmueble_transferencias.documento_id (20260908100000):
--  columna nullable — no toda actuación llega con el escaneo el mismo día
--  que se registra — validada contra el tenant por el guard existente.
--  Nullable también porque esta pieza es puramente registral (mismo
--  criterio que esas dos): no arbitra qué actuaciones "necesitan" evidencia,
--  solo abre el lugar donde colgarla cuando exista.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.caso_juridico_actuaciones
  add column documento_id uuid references public.documentos (id);

comment on column public.caso_juridico_actuaciones.documento_id is
  'Auto, oficio o sentencia que respalda esta actuación, en documentos. Nullable: la actuación '
  'se registra el mismo día en el expediente aunque el escaneo llegue después. Sin esto, '
  'fn_compilar_expediente reporta la actuación solo como descripción narrativa, sin soporte.';

create or replace function public.guard_caso_juridico_actuacion_registrada_por()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.documento_id is not null and not exists (
    select 1 from public.documentos where id = new.documento_id and tenant_id = new.tenant_id
  ) then
    raise exception 'DOCUMENTO_INVALIDO: % no pertenece al tenant %', new.documento_id, new.tenant_id;
  end if;

  new.registrada_por := (select auth.uid());
  return new;
end;
$$;
