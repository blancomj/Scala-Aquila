-- ═══════════════════════════════════════════════════════════════════════
--  documentos — generaliza documentos_inmueble (inmueble_id nullable)
--  Propietario: Casos de uso/Barra de Busqueda/
--  20260817230000_documentos_generalizacion.sql — adaptado a los nombres
--  reales de constraints/índices/política (verificado contra
--  20260820100300_documentos_inmueble.sql): el original renombraba
--  documentos_inmueble_grupo_version_unico (real: ..._version_unica),
--  ..._version_valida (real: ..._version_positiva), ..._select_agent_auditor
--  (real: ..._select_miembro), y un índice ..._vencimiento_idx que nunca
--  se creó — los cuatro habrían hecho fallar la migración tal cual venía.
--
--  Resuelve la mitad "Documentos" del gap §8.1 de
--  PROMPT_FICHA_COPROPIEDAD.md — la búsqueda global necesita buscar sobre
--  documentos de la copropiedad Y del inmueble a la vez, lo que hacía más
--  caro mantener dos tablas paralelas que generalizar una. Histórico (la
--  otra mitad de ese gap) sigue sin resolver — no se infiere aquí.
--
--  inmueble_id nullable: null = pertenece a la copropiedad misma, no a
--  un inmueble puntual. El guard ahora también verifica que, cuando
--  inmueble_id no es null, pertenezca al mismo tenant_id.
--
--  TIPO_DOCUMENTO_PREDIO → TIPO_DOCUMENTO: el nombre ya no describe bien
--  la familia (sirve para predio Y copropiedad). Se renombra el `tipo`
--  en lista_tipos (todas las filas existentes) y se agregan los códigos
--  que el mockup de la copropiedad ya usaba sin tenerlos sembrados:
--  personeria_juridica, acta_constitucion, poliza_seguro.
-- ═══════════════════════════════════════════════════════════════════════

-- ── renombrar tabla y columna ────────────────────────────────────────────
alter table public.documentos_inmueble rename to documentos;
alter table public.documentos alter column inmueble_id drop not null;

alter table public.documentos rename constraint documentos_inmueble_pkey to documentos_pkey;
alter table public.documentos rename constraint documentos_inmueble_tenant_id_fkey to documentos_tenant_id_fkey;
alter table public.documentos rename constraint documentos_inmueble_inmueble_id_fkey to documentos_inmueble_id_fkey;
alter table public.documentos rename constraint documentos_inmueble_tipo_documento_id_fkey to documentos_tipo_documento_id_fkey;
alter table public.documentos rename constraint documentos_inmueble_version_unica to documentos_grupo_version_unico;
alter table public.documentos rename constraint documentos_inmueble_version_positiva to documentos_version_valida;
alter index documentos_inmueble_tenant_idx rename to documentos_tenant_idx;
alter index documentos_inmueble_inmueble_idx rename to documentos_inmueble_idx;
alter index documentos_inmueble_grupo_idx rename to documentos_grupo_idx;
alter trigger documentos_inmueble_append_only on public.documentos rename to documentos_append_only;
alter policy documentos_inmueble_select_miembro on public.documentos rename to documentos_select_agent_auditor;

comment on table public.documentos is
  'Generalizada desde `documentos_inmueble`: inmueble_id nullable — null = '
  'pertenece a la copropiedad (tenant), no a un inmueble puntual. Sigue append-only, sigue '
  'versionada por grupo_id+version.';

comment on column public.documentos.inmueble_id is
  'Nullable — null = documento de la copropiedad (reglamento, personería jurídica, actas '
  'de asamblea generales...), no de un inmueble específico.';

-- ── renombrar familia de catálogo TIPO_DOCUMENTO_PREDIO → TIPO_DOCUMENTO ─
-- No se puede hacer como un UPDATE in-place de tipos.codigo: lista_tipos.tipo
-- referencia tipos.codigo con una FK no diferible, y mientras existan filas
-- de lista_tipos apuntando al valor viejo, Postgres rechaza el UPDATE
-- (23503). Se inserta el código nuevo, se repunta lista_tipos, y solo
-- entonces se borra el código viejo (ya sin referencias).
insert into public.tipos (codigo, nombre) values ('TIPO_DOCUMENTO', 'Tipo de Documento');
update public.lista_tipos set tipo = 'TIPO_DOCUMENTO' where tipo = 'TIPO_DOCUMENTO_PREDIO';
delete from public.tipos where codigo = 'TIPO_DOCUMENTO_PREDIO';

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_DOCUMENTO', 'personeria_juridica', 'Personería jurídica', 13),
  ('TIPO_DOCUMENTO', 'acta_constitucion', 'Acta de constitución', 14),
  ('TIPO_DOCUMENTO', 'poliza_seguro', 'Póliza de seguro', 15);

-- ── guard: recreado con el nombre de familia nuevo + validación de tenant ─
create or replace function public.guard_documento_tipo_familia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_tenant_inmueble uuid;
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

  return new;
end;
$$;

-- No existía ningún trigger que use esta función (documentos_inmueble
-- nunca tuvo política de INSERT — gap §8.1, sigue así). Se adjunta ahora
-- para que quede lista en cuanto se agregue esa política; hoy es inerte
-- porque RLS bloquea el insert antes de que el trigger corra.
create trigger documentos_tipo_familia
  before insert or update on public.documentos
  for each row execute function public.guard_documento_tipo_familia();
