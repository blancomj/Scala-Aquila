-- ═══════════════════════════════════════════════════════════════════════
--  GOB-1 (complemento) · terminar un órgano de gobierno exige motivo
--
--  Mismo patrón que motivo_revocacion en vehiculo_permiso (EXS-5) y en
--  atencion_tokens_consulta (GOB-8): el motivo se guarda junto con el
--  cierre, no aparte, y un CHECK impide fijar vigente_hasta sin él — la UI
--  ya no es la única barrera (pedido del usuario: el botón "Terminar" debe
--  pedir confirmación, fecha y motivo).
--
--  Backfill antes del CHECK: puede haber órganos ya terminados sin motivo
--  (creados antes de este cambio) — sin esto, ADD CONSTRAINT fallaría
--  contra datos existentes.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.gobierno_organos
  add column motivo_terminacion text;

update public.gobierno_organos
   set motivo_terminacion = 'Motivo no registrado (terminado antes de este cambio)'
 where vigente_hasta is not null
   and motivo_terminacion is null;

alter table public.gobierno_organos
  add constraint gobierno_organos_terminacion_con_motivo
  check (vigente_hasta is null or (motivo_terminacion is not null and btrim(motivo_terminacion) <> ''));

comment on column public.gobierno_organos.motivo_terminacion is
  'Por qué se dio por terminado el órgano (renuncia colectiva, disolución del comité ad hoc, fin '
  'de período sin renovación, etc.). Exigido por gobierno_organos_terminacion_con_motivo cuando '
  'se fija vigente_hasta.';
