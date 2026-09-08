-- ═══════════════════════════════════════════════════════════════════════
--  GOB-6 · gobierno_clase_sancion — catálogo GLOBAL, cerrado, art. 59
--  Ver GOB_06_convivencia_sanciones.md §4.1.
--
--  Mismo criterio que gobierno_materia_decision (GOB-3)/contable_plan_
--  cuenta: catálogo global sin tenant_id, sembrado por migración, cerrado
--  con un trigger creado DESPUÉS de la siembra (si se creara antes,
--  bloquearía el propio insert de siembra).
-- ═══════════════════════════════════════════════════════════════════════

create table public.gobierno_clase_sancion (
  id                      bigint generated always as identity primary key,
  codigo                  text not null unique,
  nombre                  text not null,
  descripcion             text not null,
  numeral_articulo        text not null,
  fundamento_normativo_id bigint references public.fundamento_normativo (id),
  requiere_monto          boolean not null default false,
  tope_multiplo_expensas  numeric(6, 2),
  tope_acumulado_multiplo numeric(6, 2),
  created_at              timestamptz not null default now()
);

alter table public.gobierno_clase_sancion enable row level security;
alter table public.gobierno_clase_sancion force row level security;

create policy gobierno_clase_sancion_select_autenticado
  on public.gobierno_clase_sancion for select to authenticated using (true);

comment on table public.gobierno_clase_sancion is
  'GOB-6: catálogo GLOBAL de clases de sanción — sin tenant_id, cambia solo por migración (mismo '
  'criterio que gobierno_materia_decision). Las tres del art. 59 (LISTA LEGAL CERRADA, marco §3), '
  'copiadas textualmente. SANCION_CLASE_NO_EXTENSIBLE bloquea cualquier insert/update/delete en '
  'runtime, sin excepción — el sistema no debe ofrecer siquiera la posibilidad de una clase de '
  'sanción que la ley no autoriza (corte de servicios, restricción de acceso a la vivienda, etc.).';

do $seed$
declare
  v_fund bigint;
begin
  select id into v_fund from public.fundamento_normativo where referencia = 'ley675_2001_art59_gob0_tenedores';

  insert into public.gobierno_clase_sancion
    (codigo, nombre, descripcion, numeral_articulo, fundamento_normativo_id, requiere_monto, tope_multiplo_expensas, tope_acumulado_multiplo)
  values
    ('publicacion_infractores', 'Publicación de infractores',
     'Publicación en lugares de amplia circulación de la lista de infractores con indicación '
     'expresa del hecho o acto que dio lugar a la sanción.', '59.1', v_fund, false, null, null),

    ('multa', 'Multas sucesivas',
     'Multas sucesivas mientras persista el incumplimiento, sin que cada una supere dos veces '
     'las expensas necesarias mensuales a cargo del infractor a la fecha de su imposición, ni '
     'la sumatoria exceda diez veces esas expensas.', '59.2', v_fund, true, 2, 10),

    ('restriccion_uso', 'Restricción de uso de bienes comunes no esenciales',
     'Restricción al uso y goce de bienes de uso común no esenciales, tales como salones '
     'comunales y zonas de recreación y deporte.', '59.3', v_fund, false, null, null);
end;
$seed$;

-- ── Ahora sí: el catálogo queda genuinamente inmutable ───────────────────
create function public.guard_gobierno_clase_sancion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'SANCION_CLASE_NO_EXTENSIBLE: el catálogo de clases de sanción (art. 59) es '
    'taxativo — no se puede insertar, modificar ni eliminar en runtime, ni siquiera con '
    'service_role';
end;
$$;

comment on function public.guard_gobierno_clase_sancion() is
  'GOB-6: SANCION_CLASE_NO_EXTENSIBLE — el catálogo del art. 59 es taxativo (marco §3, LISTA '
  'LEGAL CERRADA), igual que MATERIA_LEGAL_INMUTABLE en GOB-3.';

create trigger guard_gobierno_clase_sancion
  before insert or update or delete on public.gobierno_clase_sancion
  for each row execute function public.guard_gobierno_clase_sancion();
