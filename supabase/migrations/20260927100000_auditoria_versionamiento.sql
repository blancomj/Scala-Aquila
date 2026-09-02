-- PROMPT AUDITORÍA §64 — Versionamiento: "versionar matriz de riesgos,
-- controles, programas, procedimientos, criterios, plantillas, políticas.
-- Un informe debe quedar vinculado a las versiones utilizadas."
--
-- Alcance real de este corte: de las 7 cosas listadas, HOY solo
-- auditoria_riesgos tiene una vía de edición (`actualizarRiesgo`, §61 —
-- probabilidad/impacto/prioridad). Controles, procedimientos y engagements
-- ("programas") son create-only en todo el módulo — no existe UPDATE para
-- ellos en ningún store ni UI — y "criterios"/"plantillas"/"políticas" no
-- son entidades propias del esquema de auditoría (viven como texto dentro
-- de otras filas, o corresponden a fundamento_normativo, que ya tiene su
-- propio mecanismo de propuesta/aprobación, D-29/D-30, fuera de este
-- módulo). Versionar algo que no puede cambiar todavía sería esquema
-- muerto — el mismo patrón (columna `version` + trigger de bump) se puede
-- repetir el día que cualquiera de esos otros gane una vía de edición real.
--
-- "Un informe debe quedar vinculado a las versiones utilizadas": la
-- versión relevante es la que estaba vigente CUANDO se levantó el
-- hallazgo, no la versión actual del riesgo si éste cambió después — por
-- eso se congela en auditoria_hallazgos al crear (trigger BEFORE INSERT),
-- nunca se actualiza retroactivamente si el riesgo cambia más tarde.

alter table public.auditoria_riesgos
  add column version integer not null default 1;

comment on column public.auditoria_riesgos.version is
  'Se incrementa automáticamente cuando cambia nombre/descripcion/categoria/probabilidad/impacto/prioridad (PROMPT AUDITORÍA §64).';

create or replace function public.auditoria_riesgos_bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.nombre, new.descripcion, new.categoria, new.probabilidad, new.impacto, new.prioridad)
     is distinct from
     (old.nombre, old.descripcion, old.categoria, old.probabilidad, old.impacto, old.prioridad) then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create trigger auditoria_riesgos_bump_version_trigger
  before update on public.auditoria_riesgos
  for each row execute function public.auditoria_riesgos_bump_version();

-- ── Congelar en el hallazgo la versión del riesgo vigente al crearlo ────
alter table public.auditoria_hallazgos
  add column riesgo_version_utilizada integer;

comment on column public.auditoria_hallazgos.riesgo_version_utilizada is
  'Versión de auditoria_riesgos.version vigente cuando se creó este hallazgo (PROMPT AUDITORÍA §64) — se congela al insertar y nunca se actualiza después, aunque el riesgo cambie. Null si el hallazgo no tiene riesgo_id (p. ej. viene solo de un control automático).';

create or replace function public.auditoria_hallazgos_congelar_version_riesgo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.riesgo_id is not null then
    select version into new.riesgo_version_utilizada
    from public.auditoria_riesgos
    where id = new.riesgo_id;
  end if;
  return new;
end;
$$;

create trigger auditoria_hallazgos_congelar_version_riesgo_trigger
  before insert on public.auditoria_hallazgos
  for each row execute function public.auditoria_hallazgos_congelar_version_riesgo();
