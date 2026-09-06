-- ═══════════════════════════════════════════════════════════════════════
--  CO-1 · Marco contable y tributario de la copropiedad
--  (Casos de uso/Tres Modulos/Contabilidad/CO_01_marco_contable_tenant.md)
--
--  Por qué existe: `tenants` no tenía ninguna columna que registrara bajo
--  qué marco de información financiera (Grupo 2/3 del DUR 2420 de 2015) ni
--  bajo qué régimen tributario opera cada copropiedad. Sin ese dato no se
--  puede decidir el juego de estados financieros a emitir (CO-5) ni si la
--  copropiedad es contribuyente de renta por explotación de bienes comunes
--  (ET art. 19-5).
--
--  Decisión de diseño (Plan del corte, aprobado): las 8 columnas se agregan
--  directamente a `tenants` en vez de crear `tenant_configuracion_contable`.
--  `tenants_update_agent` (20260813190300_rls_policies.sql) ya equivale, tras
--  el rename de 20260830100000, a has_role(id, ['auxiliar']) — exactamente
--  el permiso que este corte necesita — y las tres extensiones previas de
--  `tenants` (nit/contacto, logo, dia_facturacion/canal_notificacion) siguen
--  el mismo patrón de config incremental sin tabla propia.
--
--  Qué queda deliberadamente fuera de este corte (CO-1 §5):
--    - Cualquier cálculo tributario (CO-8) y la emisión de estados
--      financieros (CO-5): esta migración solo registra el dato clasificador.
--    - Backfill automático de los 32 tenants existentes: clasificarlos por
--      inferencia sería la misma suposición que este corte existe para
--      evitar. Quedan con marco_grupo/uso_economico = NULL a propósito.
--    - Comprobantes, asientos y periodos contables (CO-2).
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Enums — D-24: gobiernan qué estados financieros se emiten y qué
--    obligaciones fiscales se activan; no son vocabulario descriptivo ──────

create type public.marco_contable_grupo_t as enum ('grupo_2', 'grupo_3');

comment on type public.marco_contable_grupo_t is
  'D-24: marco técnico normativo aplicable a la copropiedad (DUR 2420 de 2015). Grupo 3 exige '
  'estado de situación financiera, estado de resultados y notas; Grupo 2 exige además estado de '
  'cambios en el patrimonio y estado de flujos de efectivo (CO-1 §4.3, consumido por CO-5). '
  'Varias citas del CTCP ya validadas en el catálogo (p.ej. concepto 0146, fondo de imprevistos) '
  'son explícitamente para Grupo 3 — aplicarlas a un Grupo 2 sin esta clasificación sería un '
  'error de marco, no solo de dato.';

create type public.copropiedad_uso_t as enum ('residencial', 'comercial', 'mixto');

comment on type public.copropiedad_uso_t is
  'D-24: uso económico de la copropiedad. Determina si puede ser contribuyente del régimen '
  'ordinario de renta por explotación comercial o mixta (ET art. 19-5) y si aplica ICA — '
  'gobierna una obligación fiscal real (CO-8), no es una etiqueta descriptiva.';

-- ── 2. Columnas nuevas en tenants (CO-1 §4.1) ────────────────────────────

alter table public.tenants
  add column marco_grupo             public.marco_contable_grupo_t,
  add column uso_economico           public.copropiedad_uso_t,
  add column explota_bienes_comunes  boolean not null default false,
  add column responsable_iva         boolean not null default false,
  add column agente_retencion        boolean not null default false,
  add column marco_clasificado_por   uuid references public.profiles (id),
  add column marco_clasificado_at    timestamptz,
  add column marco_fundamento        text;

comment on column public.tenants.marco_grupo is
  'Grupo 2 o 3 del DUR 2420 de 2015. NULL = sin clasificar — ninguna copropiedad se clasifica '
  'automáticamente (CO-1 §5); es una decisión de producto/contador que excede una migración. '
  'Inmutable una vez existe un periodo cerrado (guard_marco_contable_tenant, '
  'MARCO_GRUPO_INMUTABLE_CON_CIERRE) — se endurecerá cuando CO-6 introduzca el cierre real.';
comment on column public.tenants.uso_economico is
  'Residencial, comercial o mixto. NULL = sin clasificar. Determina el régimen de renta e ICA '
  '(ET art. 19-5) — no se infiere de ningún otro dato del tenant.';
comment on column public.tenants.explota_bienes_comunes is
  'Si hay explotación económica de bienes comunes (parqueaderos, salones, publicidad). Habilita '
  'la clase 6 (Costos) del plan de cuentas — ver instanciar_clase6_al_explotar_bienes_comunes(). '
  'Independiente de uso_economico: una copropiedad residencial puede explotar bienes comunes '
  '(guard_marco_contable_tenant exige entonces marco_fundamento explícito, MARCO_USO_INCOHERENTE).';
comment on column public.tenants.responsable_iva is
  'Si la copropiedad es responsable de IVA. Independiente de uso_economico: la exclusión del ET '
  'art. 19-5 cubre renta e ICA, nunca IVA — una PH residencial que cobra parqueadero puede ser '
  'responsable de IVA sin dejar de ser residencial.';
comment on column public.tenants.agente_retencion is
  'Si la copropiedad practica retención en la fuente. Hecho declarado por el tenant, sin valor '
  'por defecto — CO-8 es quien calcula, esta columna solo registra el hecho habilitante.';
comment on column public.tenants.marco_clasificado_por is
  'Quién hizo la clasificación (o su último cambio) — se estampa automáticamente en cada '
  'escritura que toque cualquiera de las columnas de marco (guard_marco_contable_tenant).';
comment on column public.tenants.marco_clasificado_at is
  'Cuándo se hizo la clasificación (o su último cambio) — mismo trigger que marco_clasificado_por.';
comment on column public.tenants.marco_fundamento is
  'Nota del contador que soporta la clasificación. Obligatoria cuando uso_economico=residencial '
  'y explota_bienes_comunes=true (MARCO_USO_INCOHERENTE): no es imposible, pero es una '
  'combinación que merece justificarse explícitamente en vez de pasar desapercibida.';

-- ── 3. Guard: inmutabilidad con cierre + coherencia de uso + estampado ───
--    automático de quién/cuándo clasificó (CO-1 §4.2) ─────────────────────

create function public.guard_marco_contable_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cambia_clasificacion boolean;
begin
  v_cambia_clasificacion :=
    new.marco_grupo is distinct from old.marco_grupo
    or new.uso_economico is distinct from old.uso_economico
    or new.explota_bienes_comunes is distinct from old.explota_bienes_comunes
    or new.responsable_iva is distinct from old.responsable_iva
    or new.agente_retencion is distinct from old.agente_retencion
    or new.marco_fundamento is distinct from old.marco_fundamento;

  if not v_cambia_clasificacion then
    return new;
  end if;

  -- Solo evaluable hoy contra periodos.estado = 'cerrado' (CO-2 aún no existe el cierre
  -- real de CO-6); se endurecerá cuando CO-6 introduzca la semántica completa de cierre.
  if new.marco_grupo is distinct from old.marco_grupo
     and exists (
       select 1 from public.periodos p
       where p.tenant_id = old.id and p.estado = 'cerrado'
     )
  then
    raise exception 'MARCO_GRUPO_INMUTABLE_CON_CIERRE: la copropiedad % ya tiene periodos '
      'contables cerrados; el marco de información financiera no se puede cambiar', old.id;
  end if;

  if new.uso_economico = 'residencial'
     and new.explota_bienes_comunes
     and coalesce(btrim(new.marco_fundamento), '') = ''
  then
    raise exception 'MARCO_USO_INCOHERENTE: uso_economico=residencial con '
      'explota_bienes_comunes=true requiere marco_fundamento explicando la explotación';
  end if;

  if (select auth.uid()) is not null then
    new.marco_clasificado_por := (select auth.uid());
    new.marco_clasificado_at := now();
  end if;

  return new;
end;
$$;

comment on function public.guard_marco_contable_tenant() is
  'CO-1: valida MARCO_GRUPO_INMUTABLE_CON_CIERRE y MARCO_USO_INCOHERENTE, y estampa '
  'marco_clasificado_por/at en cualquier escritura que cambie la clasificación.';

create trigger guard_marco_contable_tenant
  before update on public.tenants
  for each row execute function public.guard_marco_contable_tenant();

-- ── 4. Clase 6 condicional (CO-1 §4.4) ───────────────────────────────────
--    fn_instanciar_plan_contable ya soporta p_incluir_opcionales y es
--    idempotente (ON CONFLICT DO NOTHING) — no hace falta tocar su firma.
--    create_tenant() la llama SIN opcionales al alta (explota_bienes_comunes
--    nace en false), así que la conexión real es al RECLASIFICAR un tenant
--    existente a true, no en el alta.

create function public.instanciar_clase6_al_explotar_bienes_comunes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.explota_bienes_comunes and not old.explota_bienes_comunes then
    perform public.fn_instanciar_plan_contable(new.id, true);
  end if;
  return new;
end;
$$;

comment on function public.instanciar_clase6_al_explotar_bienes_comunes() is
  'CO-1 §4.4: al reclasificar explota_bienes_comunes de false a true, instala la clase 6 '
  '(Costos) que fn_instanciar_plan_contable ya sabe agregar de forma idempotente. No actúa en '
  'el alta (create_tenant siembra explota_bienes_comunes=false por defecto) sino en la '
  'reclasificación posterior, que es el caso real que CO-1 §4.4 pide conectar.';

create trigger instanciar_clase6_al_explotar_bienes_comunes
  after update on public.tenants
  for each row execute function public.instanciar_clase6_al_explotar_bienes_comunes();

-- ── 5. Función de consulta — único lugar que codifica grupo → estados ────
--    requeridos (CO-1 §4.3); CO-5 la consume, no la reimplementa ──────────

create function public.tenant_marco_contable(p_tenant_id uuid)
returns table (
  marco_grupo             text,
  uso_economico           text,
  explota_bienes_comunes  boolean,
  responsable_iva         boolean,
  agente_retencion        boolean,
  clasificado             boolean,
  estados_requeridos      text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.marco_grupo::text,
    t.uso_economico::text,
    t.explota_bienes_comunes,
    t.responsable_iva,
    t.agente_retencion,
    (t.marco_grupo is not null and t.uso_economico is not null) as clasificado,
    case t.marco_grupo
      when 'grupo_2' then array[
        'estado_situacion_financiera', 'estado_resultados', 'notas',
        'estado_cambios_patrimonio', 'estado_flujos_efectivo'
      ]
      when 'grupo_3' then array[
        'estado_situacion_financiera', 'estado_resultados', 'notas'
      ]
      else array[]::text[]
    end as estados_requeridos
  from public.tenants t
  where t.id = p_tenant_id;
$$;

comment on function public.tenant_marco_contable(uuid) is
  'CO-1: único lugar que traduce marco_grupo a los estados financieros exigidos (DUR 2420). '
  'CO-5 consume estados_requeridos para decidir qué emitir; no la reimplementa. SECURITY '
  'INVOKER: la lectura de tenants pasa por tenants_select_miembro (RLS), igual que cualquier '
  'otra consulta de este patrón (fn_instanciar_plan_contable, contable_parametrizacion_pendiente).';
