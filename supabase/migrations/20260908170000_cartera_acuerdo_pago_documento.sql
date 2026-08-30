-- ═══════════════════════════════════════════════════════════════════════
--  Evidencia del acuerdo de pago — acuerdos_pago.documento_id
--  Propietario: análisis de evidencia documental del proceso de cartera
--  (2026-08-29) — CAR §12.1.
--
--  Hueco encontrado: CAR §12.1 define el acuerdo de pago como negocio
--  jurídico formal cuya formalidad es "Documento firmado" — pero la única
--  columna que existía para eso, documento_url (20260822310000), es texto
--  libre: sin hash, sin append-only, sin poder protegerse con
--  documentos_legal_holds (20260908120000), y confirmado sin ningún uso —
--  ni en el store (promesasAcuerdos.ts) ni en el formulario
--  (promesas-acuerdos.vue) ni en ningún test. acta_referencia (sí usada,
--  exigida por acuerdo_condonacion_requiere_soporte) queda intacta: es la
--  referencia legible al acta, no el documento mismo.
--
--  Se elimina documento_url en vez de dejarla en paralelo (CLAUDE.md: no
--  se conservan columnas muertas ni shims de compatibilidad para algo que
--  nunca se pobló) y se agrega documento_id con el mismo patrón evidencial
--  que el resto del módulo: prescripcion_actos_interruptivos.documento_id
--  (20260907140000), inmueble_transferencias.documento_id (20260908100000),
--  caso_juridico_actuaciones.documento_id (20260908160000).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.acuerdos_pago
  drop column documento_url,
  add column documento_id uuid references public.documentos (id);

comment on column public.acuerdos_pago.documento_id is
  'El acuerdo firmado (CAR §12.1: "Documento firmado"), en documentos — no un enlace de texto '
  'libre. Nullable: el acuerdo puede crearse en borrador antes de tener el escaneo firmado, '
  'pero sin esto el negocio jurídico más formal del módulo queda sin respaldo documental real.';

-- CREATE OR REPLACE sobre la función de 20260907110000 (que a su vez
-- preservó el chequeo de estado inicial de 20260822320000) — se conservan
-- estado inicial y estampado de consecutivo íntegros, solo se agrega la
-- validación de documento_id.
create or replace function public.guard_acuerdo_propuesta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado <> 'borrador' then
    raise exception 'ACUERDO_ESTADO_INICIAL_INVALIDO: un acuerdo de pago solo puede crearse en '
      'borrador, no %', new.estado;
  end if;

  if new.documento_id is not null and not exists (
    select 1 from public.documentos where id = new.documento_id and tenant_id = new.tenant_id
  ) then
    raise exception 'DOCUMENTO_INVALIDO: % no pertenece al tenant %', new.documento_id, new.tenant_id;
  end if;

  new.consecutivo := public.fn_siguiente_consecutivo(new.tenant_id, 'acuerdo_pago');
  new.propuesto_por := (select auth.uid());
  return new;
end;
$$;
