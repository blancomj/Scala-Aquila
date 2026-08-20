-- ═══════════════════════════════════════════════════════════════════════
--  Conceptos avanzados Fase 3 — taxonomía real de novedades + componente
--  presupuestal
--
--  Dos preguntas distintas que hoy `novedades.tipo` (CHARGE/DISCOUNT/
--  ADJUSTMENT/REFUND/CREDIT/DEBIT) no responde:
--   - tipo_novedad_id: ¿QUÉ es esto de negocio? (sanción, reparación,
--     servicio público...) — catálogo TIPO_NOVEDAD, ya sembrado en
--     20260814180000 pero huérfano hasta ahora (nada lo referenciaba).
--   - presupuesto_cuenta_id: ¿bajo qué componente presupuestal se explica
--     este cobro? — reusa el árbol E8 (presupuesto_cuenta) ya construido,
--     no se inventa una entidad "Componente Presupuestal" nueva.
--
--  Ambas nullable: una novedad existente (o nueva sin clasificar todavía)
--  sigue siendo válida sin ellas — igual criterio que
--  presupuesto_cuenta.concepto_id (20260823290000) y novedades.concepto_id
--  (ya nullable desde el origen).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.novedades
  add column tipo_novedad_id bigint references public.lista_tipos (id),
  add column presupuesto_cuenta_id uuid references public.presupuesto_cuenta (id);

comment on column public.novedades.tipo_novedad_id is
  'FK lista_tipos, familia TIPO_NOVEDAD (sanción, reparaciones, servicios...) — clasificación de '
  'negocio, independiente de novedades.tipo (efecto contable CHARGE/DISCOUNT/...). '
  'NULL = sin clasificar todavía.';
comment on column public.novedades.presupuesto_cuenta_id is
  'FK presupuesto_cuenta (árbol E8) — bajo qué componente presupuestal se explica este cobro. '
  'Solo cuenta hoja + naturaleza=ingreso (guard_novedad_tipo_presupuesto), mismo criterio que '
  'presupuesto_cuenta.concepto_id (20260823290000). NULL = sin vincular todavía.';

create index novedades_tipo_novedad_idx on public.novedades (tipo_novedad_id)
  where tipo_novedad_id is not null;
create index novedades_presupuesto_cuenta_idx on public.novedades (presupuesto_cuenta_id)
  where presupuesto_cuenta_id is not null;

-- ── guard: mismo patrón exacto que guard_documento_tipo_familia
--    (20260822130000) para tipo_novedad_id, y guard_presupuesto_cuenta_concepto
--    (20260823290000) para presupuesto_cuenta_id. ─────────────────────────
create function public.guard_novedad_tipo_presupuesto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo_familia text;
  v_tipo_tenant uuid;
  v_cuenta public.presupuesto_cuenta%rowtype;
begin
  if new.tipo_novedad_id is not null then
    select tipo, tenant_id into v_tipo_familia, v_tipo_tenant
    from public.lista_tipos where id = new.tipo_novedad_id;

    if v_tipo_familia is distinct from 'TIPO_NOVEDAD' then
      raise exception 'TIPO_NOVEDAD_INVALIDO: tipo_novedad_id % no pertenece a TIPO_NOVEDAD (es %)',
        new.tipo_novedad_id, coalesce(v_tipo_familia, 'inexistente');
    end if;

    if v_tipo_tenant is not null and v_tipo_tenant <> new.tenant_id then
      raise exception 'TIPO_NOVEDAD_TENANT_INCONSISTENTE: % pertenece a otro tenant',
        new.tipo_novedad_id;
    end if;
  end if;

  if new.presupuesto_cuenta_id is not null then
    select * into v_cuenta from public.presupuesto_cuenta where id = new.presupuesto_cuenta_id;

    if v_cuenta.id is null then
      raise exception 'CUENTA_INEXISTENTE: presupuesto_cuenta_id % no existe',
        new.presupuesto_cuenta_id;
    end if;

    if v_cuenta.tenant_id <> new.tenant_id then
      raise exception 'CUENTA_TENANT_INCONSISTENTE: la cuenta % pertenece a otro tenant',
        new.presupuesto_cuenta_id;
    end if;

    if not v_cuenta.es_hoja then
      raise exception 'CUENTA_NO_ES_HOJA: % agrupa subcuentas — una novedad solo puede vincularse '
        'a una cuenta hoja', new.presupuesto_cuenta_id;
    end if;

    if v_cuenta.naturaleza <> 'ingreso' then
      raise exception 'CUENTA_NATURALEZA_INVALIDA: % es egreso — una novedad (cobro) solo puede '
        'vincularse a una cuenta de ingreso', new.presupuesto_cuenta_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger guard_novedad_tipo_presupuesto
  before insert or update of tipo_novedad_id, presupuesto_cuenta_id on public.novedades
  for each row execute function public.guard_novedad_tipo_presupuesto();
