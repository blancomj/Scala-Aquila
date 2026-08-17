-- ═══════════════════════════════════════════════════════════════════════
--  tenants — campos de "Datos básicos" que faltaban para la ficha de la
--  copropiedad (nit/direccion/moneda/zona_horaria ya existían desde
--  20260814100100; esto completa el resto).
--  Propietario: conversación de diseño de esta sesión.
--
--  nit_digito_verificacion es columna GENERADA (fn_calcular_dv_nit,
--  immutable) — a diferencia de terceros.digito_verificacion
--  (20260817160000), que quedó calculado en el cliente y solo persistido.
--  Queda anotado como inconsistencia conocida, no se corrige retroactivo
--  aquí: terceros ya está entregado, backfillear ese campo es una
--  decisión aparte.
--
--  logo_storage_path: mismo criterio que documentos_inmueble — la subida
--  real necesita bucket de Storage + Edge Function, mismo gap que
--  PROMPT_FICHA_INMUEBLE.md §8.1, no se resuelve aquí, solo se deja la
--  columna lista para cuando exista.
-- ═══════════════════════════════════════════════════════════════════════

-- ── TIPO_DIVISION_PH — Ley 675 de 2001 ──────────────────────────────────
insert into public.tipos (codigo, nombre, descripcion) values
  ('TIPO_DIVISION_PH', 'Tipo de División de Propiedad Horizontal', 'Clasificación según la Ley 675 de 2001.');

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_DIVISION_PH', 'residencial', 'Residencial', 1),
  ('TIPO_DIVISION_PH', 'comercial', 'Comercial', 2),
  ('TIPO_DIVISION_PH', 'mixto', 'Mixto', 3),
  ('TIPO_DIVISION_PH', 'industrial', 'Industrial', 4);

-- ── fn_calcular_dv_nit — algoritmo DIAN, immutable ──────────────────────
create function public.fn_calcular_dv_nit(p_nit text)
returns text
language plpgsql
immutable
as $$
declare
  v_pesos int[] := array[71,67,59,53,47,43,41,37,29,23,19,17,13,7,3];
  v_limpio text := regexp_replace(coalesce(p_nit, ''), '\D', '', 'g');
  v_n int := length(v_limpio);
  v_suma int := 0;
  v_resto int;
  i int;
begin
  if v_n = 0 or v_n > array_length(v_pesos, 1) then
    return null;
  end if;

  for i in 1..v_n loop
    v_suma := v_suma + substring(v_limpio from i for 1)::int * v_pesos[array_length(v_pesos, 1) - v_n + i];
  end loop;

  v_resto := v_suma % 11;
  return case when v_resto in (0, 1) then v_resto::text else (11 - v_resto)::text end;
end;
$$;

comment on function public.fn_calcular_dv_nit is
  'Dígito de verificación DIAN — immutable, determinista. Usada como columna generada en '
  'tenants.nit_digito_verificacion; terceros.digito_verificacion (20260817160000) no la usa '
  'todavía, quedó calculada en el cliente — inconsistencia conocida, no corregida aquí.';

-- ── columnas nuevas en tenants ───────────────────────────────────────────
alter table public.tenants
  add column nit_digito_verificacion text generated always as (public.fn_calcular_dv_nit(nit)) stored,
  add column tipo_division_id  bigint,
  add column ciudad            text,
  add column telefono_1        text,
  add column telefono_2        text,
  add column email             extensions.citext,
  add column contacto_nombre   text,
  add column contacto_telefono text,
  add column contacto_email    extensions.citext,
  add column logo_storage_path text;

update public.tenants t
set tipo_division_id = lt.id
from public.lista_tipos lt
where lt.tipo = 'TIPO_DIVISION_PH' and lt.tenant_id is null and lt.codigo = 'residencial';

alter table public.tenants alter column tipo_division_id set not null;
alter table public.tenants
  add constraint tenants_tipo_division_id_fkey foreign key (tipo_division_id) references public.lista_tipos (id);
create index tenants_tipo_division_idx on public.tenants (tipo_division_id);

comment on column public.tenants.logo_storage_path is
  'Path en Supabase Storage — la subida real está bloqueada por el mismo gap que '
  'documentos_inmueble (PROMPT_FICHA_INMUEBLE.md §8.1): falta bucket + Edge Function.';

-- ── guard: tipo_division_id debe pertenecer a TIPO_DIVISION_PH ─────────
create function public.guard_tenant_catalogos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
begin
  select tipo into v_tipo from public.lista_tipos where id = new.tipo_division_id;
  if v_tipo is distinct from 'TIPO_DIVISION_PH' then
    raise exception 'TIPO_DIVISION_INVALIDO: tipo_division_id % no pertenece a TIPO_DIVISION_PH (es %)',
      new.tipo_division_id, coalesce(v_tipo, 'inexistente');
  end if;
  return new;
end;
$$;

create trigger guard_tenant_catalogos
  before insert or update on public.tenants
  for each row execute function public.guard_tenant_catalogos();
