-- ═══════════════════════════════════════════════════════════════════════
--  fuente_financiacion.tipo: enum nativo → lista_tipos (familia
--  TIPO_FUENTE_FINANCIACION), y se retira 'saldo_aplicable'.
--
--  Investigación (sesión de usuario, respaldada en
--  Docs/Motor presupuestal/AQUILA_SAAS_E07_Motor_Financiacion_Presupuestal.md
--  §3 + Casos de uso/Presupuesto/sesion_presupuesto_copropiedad_AQUILA.md):
--  el enum `fuente_financiacion_tipo_t` (20260814200000) nunca recibió el
--  `COMMENT ON TYPE` que exige D-24 — quedó exento solo por estar congelado
--  en ENUMS_LEGADO antes de que la regla existiera, no porque alguien lo
--  evaluara. Al aplicar el criterio real de D-24 contra el código:
--    - 'fondo_imprevistos' SÍ gatilla lógica (guard_fuente_financiacion,
--      FI-003) — pero la lógica depende del *código*, no de que sea un
--      enum de Postgres; una fila de lista_tipos sirve igual.
--    - 'otros_ingresos' SÍ gatilla lógica (snapshot-supabase.ts resuelve
--      PARAMETER.OTROS_INGRESOS_ANUAL) — mismo caso.
--    - 'cuota_extraordinaria' es descriptivo hoy (GAP-CAR-011: el esquema
--      todavía no distingue una cuota extraordinaria de una ordinaria a
--      nivel de cargo).
--    - 'saldo_aplicable' no tiene ningún uso fuera del propio enum y no
--      aparece nombrado en ninguno de los presupuestos reales investigados
--      (Palmar del Viento, Tesoro I, CTCP-15, modelo académico) — se
--      retira por decisión del usuario.
--
--  Se convierte a lista_tipos (mismo patrón que 20260814160000) para que
--  cada copropiedad pueda ampliar el catálogo sin una migración nueva
--  (lista_tipos_insert_agent ya lo permite) — el motivo explícito de esta
--  migración. La lógica de negocio (FI-003, neteo de otros_ingresos) sigue
--  funcionando: pasa de comparar contra un label de enum a comparar contra
--  lista_tipos.codigo, que es estable independientemente de qué tenant
--  haya creado la fila (plataforma o propia).
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. familia + catálogo (solo 3: se retira 'saldo_aplicable') ─────────
insert into public.tipos (codigo, nombre, descripcion) values
  ('TIPO_FUENTE_FINANCIACION', 'Tipo de Fuente de Financiación',
   'Recursos presupuestados distintos de la cuota ordinaria (Ley 675, E-07) — '
   'la cuota ordinaria misma no es una fila aquí: es el residual implícito.');

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_FUENTE_FINANCIACION', 'otros_ingresos', 'Otros ingresos', 1),
  ('TIPO_FUENTE_FINANCIACION', 'cuota_extraordinaria', 'Cuota extraordinaria', 2),
  ('TIPO_FUENTE_FINANCIACION', 'fondo_imprevistos', 'Fondo de imprevistos', 3);

-- ── 2. columna nueva + backfill ──────────────────────────────────────────
-- El guard_fuente_financiacion vigente (BEFORE UPDATE) rechaza cualquier UPDATE contra un
-- presupuesto vigente/cerrado (IMMUTABLE_BUDGET) — el backfill de abajo toca TODAS las filas,
-- incluidas las de presupuestos ya vigentes, así que se desactiva el trigger solo para este
-- UPDATE puntual (mismo criterio que 20260815000000_seed_gc001_otros_ingresos.sql: fixture/
-- backfill retroactivo, no un bypass general).
alter table public.fuente_financiacion disable trigger guard_fuente_financiacion;

alter table public.fuente_financiacion add column tipo_id bigint;

update public.fuente_financiacion f
set tipo_id = lt.id
from public.lista_tipos lt
where lt.tipo = 'TIPO_FUENTE_FINANCIACION' and lt.tenant_id is null and lt.codigo = f.tipo::text;

alter table public.fuente_financiacion enable trigger guard_fuente_financiacion;

-- Salvaguarda: si hay filas con 'saldo_aplicable' (o cualquier valor sin fila equivalente
-- sembrada arriba), esta migración se detiene en vez de dejarlas con tipo_id NULL en
-- silencio — no se decidió qué hacer con datos reales que usen el valor retirado.
do $$
declare
  v_huerfanas int;
begin
  select count(*) into v_huerfanas from public.fuente_financiacion where tipo_id is null;
  if v_huerfanas > 0 then
    raise exception 'FUENTE_FINANCIACION_TIPO_SIN_MAPEO: % fila(s) con tipo (probablemente '
      'saldo_aplicable) sin equivalente en TIPO_FUENTE_FINANCIACION — decidir qué hacer con '
      'esos datos antes de continuar esta migración', v_huerfanas;
  end if;
end $$;

alter table public.fuente_financiacion alter column tipo_id set not null;
alter table public.fuente_financiacion
  add constraint fuente_financiacion_tipo_id_fkey foreign key (tipo_id) references public.lista_tipos (id);
create index fuente_financiacion_tipo_id_idx on public.fuente_financiacion (tipo_id);

comment on column public.fuente_financiacion.tipo_id is
  'FK a lista_tipos, familia TIPO_FUENTE_FINANCIACION — reemplaza el enum '
  'fuente_financiacion_tipo_t (20260830210000). Ampliable por tenant sin migración '
  '(lista_tipos_insert_agent); el guard y snapshot-supabase.ts siguen ramificando por '
  'codigo (fondo_imprevistos, otros_ingresos), no por id, así que una fila propia del '
  'tenant con el mismo codigo se comporta igual que la de plataforma.';

-- ── 3. guard_fuente_financiacion: valida tipo_id + FI-003 vía codigo ────
create or replace function public.guard_fuente_financiacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado public.presupuesto_estado_t;
  v_saldo_fondo numeric(18, 2);
  v_tipo_familia text;
  v_tipo_tenant uuid;
  v_tipo_codigo text;
begin
  select estado into v_estado
    from public.presupuestos
   where id = new.presupuesto_id;

  if v_estado in ('vigente', 'cerrado') then
    raise exception 'IMMUTABLE_BUDGET: el presupuesto % es inmutable en estado % '
      '— corrige creando una versión nueva (16 §111)', new.presupuesto_id, v_estado;
  end if;

  -- Mismo patrón que guard_novedad_tipo_presupuesto (20260826100000): plataforma
  -- (tenant_id null) sirve para cualquier tenant; una fila propia del tenant sirve solo
  -- para él mismo.
  select tipo, tenant_id, codigo into v_tipo_familia, v_tipo_tenant, v_tipo_codigo
    from public.lista_tipos where id = new.tipo_id;

  if v_tipo_familia is null then
    raise exception 'TIPO_FUENTE_INEXISTENTE: tipo_id % no existe', new.tipo_id;
  end if;

  if v_tipo_familia is distinct from 'TIPO_FUENTE_FINANCIACION' then
    raise exception 'TIPO_FUENTE_INVALIDO: tipo_id % no pertenece a TIPO_FUENTE_FINANCIACION '
      '(es %)', new.tipo_id, v_tipo_familia;
  end if;

  if v_tipo_tenant is not null and v_tipo_tenant <> new.tenant_id then
    raise exception 'TIPO_FUENTE_TENANT_INCONSISTENTE: tipo_id % pertenece a otro tenant',
      new.tipo_id;
  end if;

  if v_tipo_codigo = 'fondo_imprevistos' then
    select saldo_actual into v_saldo_fondo
      from public.fondos
     where tenant_id = new.tenant_id
       and tipo = 'imprevistos';

    if v_saldo_fondo is null then
      raise exception 'FONDO_IMPREVISTOS_NO_EXISTE: el tenant % no tiene fondo de imprevistos '
        'configurado', new.tenant_id;
    end if;

    if new.valor_disponible > v_saldo_fondo then
      raise exception 'FONDO_INSUFICIENTE: valor_disponible (%) excede el saldo actual del '
        'fondo de imprevistos (%) — FI-003', new.valor_disponible, v_saldo_fondo;
    end if;
  end if;

  return new;
end;
$$;

-- ── 4. fn_registrar_fuente_financiacion: p_tipo enum → p_tipo_id bigint ──
drop function public.fn_registrar_fuente_financiacion(
  uuid, public.fuente_financiacion_tipo_t, numeric, numeric, text, bigint
);

create function public.fn_registrar_fuente_financiacion(
  p_presupuesto_id uuid,
  p_tipo_id bigint,
  p_valor_disponible numeric,
  p_valor_aplicado numeric default 0,
  p_descripcion text default null,
  p_fundamento_normativo_id bigint default null
)
returns public.fuente_financiacion
language plpgsql
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_fuente public.fuente_financiacion;
begin
  select tenant_id into v_tenant_id
    from public.presupuestos
   where id = p_presupuesto_id;

  if v_tenant_id is null then
    raise exception 'PRESUPUESTO_NO_ENCONTRADO: % no existe o no es accesible', p_presupuesto_id;
  end if;

  insert into public.fuente_financiacion (
    tenant_id, presupuesto_id, tipo_id, valor_disponible, valor_aplicado,
    descripcion, fundamento_normativo_id
  )
  values (
    v_tenant_id, p_presupuesto_id, p_tipo_id, p_valor_disponible, p_valor_aplicado,
    p_descripcion, p_fundamento_normativo_id
  )
  returning * into v_fuente;

  return v_fuente;
end;
$$;

revoke execute on function public.fn_registrar_fuente_financiacion(
  uuid, bigint, numeric, numeric, text, bigint
) from public, anon;

grant execute on function public.fn_registrar_fuente_financiacion(
  uuid, bigint, numeric, numeric, text, bigint
) to authenticated;

-- ── 5. retirar la columna/enum viejos — ya nada los referencia ──────────
alter table public.fuente_financiacion drop column tipo;
drop type public.fuente_financiacion_tipo_t;

comment on table public.fuente_financiacion is
  'Recursos presupuestados distintos de la cuota ordinaria (E-07/E-16 §8.4): otros ingresos, '
  'cuota extraordinaria, fondo de imprevistos (catálogo ampliable, ver tipo_id). '
  'valor_aplicado es tope de uso declarado — todavía no reduce presupuestos.monto_total ni '
  'conceptos.CUOTA_ADMIN (alcance diferido, ver 20260814200000).';
