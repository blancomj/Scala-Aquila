-- ═══════════════════════════════════════════════════════════════════════
--  CO-8 · ReteIVA y ReteICA como agentes de retención distintos de
--  ReteFuente — gap encontrado en auditoría de configurabilidad contable
--  (2026-09-14).
--
--  Hoy `agente_retencion` (CO-1) es un solo booleano, pero en la práctica
--  la DIAN/el municipio nombran agente de retención en la fuente (renta),
--  agente de retención de IVA y agente de retención de ICA por separado,
--  con tarifas y conceptos propios de cada uno. El mecanismo de
--  tributario_concepto_retencion + finanzas_factura_retencion (CO-8 §4.2)
--  ya es genérico (concepto -> tarifa -> cuenta contable, aplicado sobre
--  una base cualquiera) — no hace falta una tabla nueva, solo distinguir
--  DE QUÉ TIPO es cada concepto y exigir el agente correcto según el tipo
--  (mismo espíritu de "no inventar una entidad duplicada" ya aplicado en
--  20260931920000).
--
--  tipo_id nace NOT NULL con backfill a 'fuente' para cualquier concepto
--  ya creado (todo lo que existía antes de este corte SOLO podía ser
--  retención en la fuente) — 3 pasos (columna nullable -> backfill ->
--  set not null) por disciplina, aunque CO-8 documenta que la tabla nace
--  vacía en producción; no vale la pena apostar a que ningún tenant real
--  haya cargado un concepto todavía.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre, descripcion) values
  ('TIPO_RETENCION_CONCEPTO', 'Tipo de retención de un concepto',
   'Clasifica un tributario_concepto_retencion según el impuesto que retiene — cada tipo exige '
   'un agente de retención distinto en tenants (agente_retencion/agente_reteiva/agente_reteica), '
   'validado por guard_finanzas_factura_retencion.');

insert into public.lista_tipos (tipo, codigo, nombre, descripcion, orden) values
  ('TIPO_RETENCION_CONCEPTO', 'fuente', 'Retención en la fuente', 'Retención a título de renta sobre pagos a terceros (CO-8 §4.2)', 10),
  ('TIPO_RETENCION_CONCEPTO', 'iva',    'ReteIVA',                'Retención a título de IVA — habitualmente un % del IVA, no de la base', 20),
  ('TIPO_RETENCION_CONCEPTO', 'ica',    'ReteICA',                'Retención a título de ICA, practicada por quien designe el municipio', 30);

alter table public.tenants
  add column agente_reteiva boolean not null default false,
  add column agente_reteica boolean not null default false;

comment on column public.tenants.agente_reteiva is
  'Si la copropiedad practica retención de IVA (ReteIVA) — distinto de agente_retencion '
  '(retención en la fuente por renta). Hecho declarado por el tenant, sin valor por defecto, '
  'mismo criterio que agente_retencion.';
comment on column public.tenants.agente_reteica is
  'Si la copropiedad practica retención de ICA (ReteICA), designada por el municipio — '
  'distinta de ica_aplica (que es el ICA que la PROPIA copropiedad declara como '
  'contribuyente). Hecho declarado por el tenant, sin valor por defecto.';

-- ── tributario_concepto_retencion.tipo_id ────────────────────────────────
alter table public.tributario_concepto_retencion
  add column tipo_id bigint references public.lista_tipos (id);

update public.tributario_concepto_retencion tcr
set tipo_id = (
  select id from public.lista_tipos where tipo = 'TIPO_RETENCION_CONCEPTO' and codigo = 'fuente'
)
where tipo_id is null;

alter table public.tributario_concepto_retencion
  alter column tipo_id set not null;

comment on column public.tributario_concepto_retencion.tipo_id is
  'Gap ReteIVA/ReteICA (2026-09-14): de qué impuesto es este concepto (lista_tipos '
  'TIPO_RETENCION_CONCEPTO) — gobierna qué columna de tenants exige '
  'guard_finanzas_factura_retencion (fuente->agente_retencion, iva->agente_reteiva, '
  'ica->agente_reteica). Backfill = fuente para cualquier concepto creado antes de esta '
  'columna (solo podía ser retención en la fuente). Sin default de columna (Postgres no '
  'admite subquery en DEFAULT) — el store siempre lo envía explícito al crear un concepto.';

-- ── guard_finanzas_factura_retencion: + chequeo por tipo (diff mínimo sobre 20260931920000) ──
create or replace function public.guard_finanzas_factura_retencion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_factura uuid;
  v_tipo_codigo    text;
  v_habilitado     boolean;
begin
  if to_regclass('public.tributario_concepto_retencion') is null then
    raise exception 'RETENCION_CATALOGO_TRIBUTARIO_AUSENTE: el catálogo de conceptos de '
      'retención (CO-8) todavía no existe — no se pueden registrar retenciones hasta entonces';
  end if;

  select lt.codigo into v_tipo_codigo
  from public.tributario_concepto_retencion tcr
  join public.lista_tipos lt on lt.id = tcr.tipo_id
  where tcr.id = new.concepto_id;

  select case coalesce(v_tipo_codigo, 'fuente')
      when 'iva' then t.agente_reteiva
      when 'ica' then t.agente_reteica
      else t.agente_retencion
    end
    into v_habilitado
  from public.tenants t where t.id = new.tenant_id;

  if not coalesce(v_habilitado, false) then
    raise exception 'TRIBUTARIO_SIN_AGENTE_RETENCION: el tenant % no está habilitado como agente '
      'de retención para conceptos tipo % (CO-8 §4.2)', new.tenant_id, coalesce(v_tipo_codigo, 'fuente');
  end if;

  select tenant_id into v_tenant_factura from public.finanzas_facturas_proveedor where id = new.factura_id;
  if v_tenant_factura is null or v_tenant_factura <> new.tenant_id then
    raise exception 'FACTURA_TENANT_INCONSISTENTE: la factura % no pertenece al tenant', new.factura_id;
  end if;

  if new.valor is distinct from round(new.base * new.tarifa / 100, 2) then
    raise exception 'FACTURA_ARITMETICA_INCONSISTENTE: valor (%) debe ser base (%) × tarifa (%) / 100',
      new.valor, new.base, new.tarifa;
  end if;

  return new;
end;
$$;

comment on function public.guard_finanzas_factura_retencion() is
  'FIN-2/CO-8 §4.2 + gap ReteIVA/ReteICA (2026-09-14): TRIBUTARIO_SIN_AGENTE_RETENCION ahora '
  'revisa la columna de tenants correspondiente al tipo del concepto usado '
  '(fuente->agente_retencion, iva->agente_reteiva, ica->agente_reteica), además de lo ya '
  'validado por FIN-2/CO-8 (RETENCION_CATALOGO_TRIBUTARIO_AUSENTE, FACTURA_TENANT_INCONSISTENTE, '
  'FACTURA_ARITMETICA_INCONSISTENTE).';

-- ── Reportes: + filtro opcional por tipo ─────────────────────────────────
-- Agregar un parámetro (incluso con default) cambia la aridad y crea un SEGUNDO overload en vez
-- de reemplazar el existente (lección ya documentada en memoria de sesión) — hace falta un DROP
-- explícito de la firma vieja antes de recrear, o PostgREST no puede elegir entre las dos
-- (PGRST203, encontrado corriendo tests/contabilidad/tributario.test.ts #6).
drop function if exists public.tributario_certificado_retencion(uuid, uuid, date, date);
drop function if exists public.tributario_resumen_retenciones_mensual(uuid, int, int);

create function public.tributario_certificado_retencion(
  p_tenant_id   uuid,
  p_tercero_id  uuid,
  p_desde       date,
  p_hasta       date,
  p_tipo_codigo text default null
)
returns table (
  concepto_codigo text,
  concepto_nombre text,
  tarifa          numeric,
  total_base      numeric,
  total_valor     numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select tcr.codigo, tcr.nombre, ffr.tarifa, sum(ffr.base), sum(ffr.valor)
  from public.finanzas_factura_retencion ffr
  join public.finanzas_facturas_proveedor f on f.id = ffr.factura_id
  join public.tributario_concepto_retencion tcr on tcr.id = ffr.concepto_id
  join public.lista_tipos lt on lt.id = tcr.tipo_id
  where ffr.tenant_id = p_tenant_id
    and f.proveedor_id = p_tercero_id
    and f.fecha_emision between p_desde and p_hasta
    and (p_tipo_codigo is null or lt.codigo = p_tipo_codigo)
  group by tcr.codigo, tcr.nombre, ffr.tarifa
  order by tcr.codigo;
$$;

comment on function public.tributario_certificado_retencion(uuid, uuid, date, date, text) is
  'CO-8 §4.2 + gap ReteIVA/ReteICA: certificado de retención de un tercero en un periodo, '
  'opcionalmente filtrado por tipo (fuente/iva/ica) — sin filtro, junta los tres tipos como '
  'antes de este corte (retrocompatible).';

create or replace function public.tributario_resumen_retenciones_mensual(
  p_tenant_id   uuid,
  p_anio        int,
  p_mes         int,
  p_tipo_codigo text default null
)
returns table (
  concepto_codigo text,
  concepto_nombre text,
  total_base      numeric,
  total_valor     numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select tcr.codigo, tcr.nombre, sum(ffr.base), sum(ffr.valor)
  from public.finanzas_factura_retencion ffr
  join public.finanzas_facturas_proveedor f on f.id = ffr.factura_id
  join public.tributario_concepto_retencion tcr on tcr.id = ffr.concepto_id
  join public.lista_tipos lt on lt.id = tcr.tipo_id
  where ffr.tenant_id = p_tenant_id
    and extract(year from f.fecha_emision) = p_anio
    and extract(month from f.fecha_emision) = p_mes
    and (p_tipo_codigo is null or lt.codigo = p_tipo_codigo)
  group by tcr.codigo, tcr.nombre
  order by tcr.codigo;
$$;

comment on function public.tributario_resumen_retenciones_mensual(uuid, int, int, text) is
  'CO-8 §4.2 + gap ReteIVA/ReteICA: resumen mensual de retenciones por concepto, opcionalmente '
  'filtrado por tipo (fuente/iva/ica) — sin filtro, junta los tres tipos como antes de este '
  'corte (retrocompatible).';
