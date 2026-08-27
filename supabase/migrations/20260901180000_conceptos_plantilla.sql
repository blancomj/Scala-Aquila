-- ═══════════════════════════════════════════════════════════════════════
--  Plantilla global de conceptos facturables + fn_instanciar_conceptos
--
--  Mismo patrón que presupuesto_cuenta_plantilla (PC-2b/PC-2c,
--  20260830550000/20260901160000) y contable_plan_cuenta (PC-2): una
--  tabla maestra tenant-agnostic + una función SECURITY INVOKER
--  idempotente que la copia al tenant, invocada desde create_tenant() —
--  sin paso manual de onboarding. Disparador: el usuario preguntó si
--  "la misma lógica" del plan presupuestal se puede aplicar a los
--  conceptos de cobro.
--
--  Se inspeccionaron en vivo los 9 conceptos reales de GC-001 (la
--  única copropiedad con datos genuinos, no de prueba). 6 son ruido de
--  QA (ALC5C, CUOTA_POR_PERIODO_UI, CUOTA_PRUEBA_FIJA, PRTES,
--  novedad1, y CUOTA_ADMIN — duplicado archivado de ADMINISTRACION).
--  Solo 3 filas son contenido real y se llevan a la plantilla:
--   - ADMINISTRACION: Cuota de administración, formulada, con la regla
--     AEL real (CUOTA_BASICA) — portable porque formula_ael solo
--     referencia PARAMETER.*/UNIT.*/CONCEPTO.*, nunca uuids de tenant.
--   - CUOTA_EXTRA: Cuota extraordinaria, por_periodo, sin configurar
--     (valor_fijo=0) — validada en uso real (en_revision en GC-001).
--   - NOVEDAD: el concepto singleton tipo_recurrencia='novedad' que
--     NovedadesEditor.vue exige para crear novedades permanentes o
--     prorrateables (conceptoNovedad/faltaConceptoNovedad); a nivel de
--     esquema lo respalda conceptos_novedad_singleton_idx
--     (20260827100000, un solo tipo_recurrencia='novedad' no archivado
--     por tenant). Ver la protección contra archivado más abajo.
--
--  Se descartó ampliar la lista con "Alquiler salón", "Parqueadero
--  adicional", "Bicicletero", "Sanción por inasistencia": esos
--  ingresos SÍ existen en el árbol presupuestal (PC-2c —
--  ing_alquiler_salon/ing_usufructo_vehiculos/ing_usufructo_motos/
--  ing_bicicletero/ing_sancion_inasistencia), pero en la app no se
--  cobran vía `conceptos` (fórmula/distribución periódica) sino vía
--  `novedades` + el catálogo novedad_tipo_cuenta (motivo → cuenta,
--  20260830240000) — un mecanismo distinto, que ya tiene sus 8 motivos
--  TIPO_NOVEDAD sembrados globalmente (20260814180000, incluye
--  'sancion' y 'uso_amenidad'). Meterlos aquí como conceptos habría
--  sido incorrecto: tipo_recurrencia='novedad' es un singleton (no
--  puede haber cinco más) y 'recurrente'/'por_periodo' los aplicaría
--  automáticamente cada periodo, cuando en realidad son cobros
--  puntuales por evento. Precargar ese catálogo (motivo → cuenta) es
--  un follow-up distinto, sobre novedad_tipo_cuenta, no sobre esta
--  tabla.
--
--  Fechas: conceptos_tipo_recurrencia_consistente (20260825100000)
--  exige fecha_inicio no nula para 'recurrente'/'por_periodo' — no hay
--  una fecha "genérica" razonable en una plantilla global compartida
--  por todos los tenants, así que fn_instanciar_conceptos las calcula
--  en el momento de instanciar (mes en curso para ADMINISTRACION; un
--  año calendario desde hoy para CUOTA_EXTRA — placeholder que el
--  administrador ajusta antes de activarla, sigue en borrador hasta
--  que alguien la revise).
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
--  1. conceptos_plantilla — catálogo global (sin tenant_id)
-- ═══════════════════════════════════════════════════════════════════════

create table public.conceptos_plantilla (
  id                        uuid primary key default gen_random_uuid(),
  codigo                    text not null unique,
  nombre                    text not null,
  modo_calculo              public.concepto_modo_calculo_t not null,
  formula_ael               text,
  prioridad                 int not null default 0,
  modo_valor                public.concepto_modo_valor_t not null,
  valor_fijo                numeric(18, 2),
  tipo_recurrencia          public.concepto_tipo_recurrencia_t not null,
  periodicidad              public.concepto_periodicidad_t,
  -- Se resuelve por código contra presupuesto_cuenta del tenant al instanciar —
  -- nunca un uuid crudo, porque presupuesto_cuenta es por-tenant (mismo criterio
  -- que fn_instanciar_presupuesto_cuenta resolviendo parent_id por código).
  presupuesto_cuenta_codigo text,
  created_at                timestamptz not null default now(),

  constraint conceptos_plantilla_modo_valor_consistente check (
    (modo_valor = 'fijo' and valor_fijo is not null and formula_ael is null)
    or (modo_valor = 'formulado' and valor_fijo is null)
  )
);

alter table public.conceptos_plantilla enable row level security;
alter table public.conceptos_plantilla force row level security;

create policy conceptos_plantilla_select_autenticado
  on public.conceptos_plantilla for select to authenticated using (true);

comment on table public.conceptos_plantilla is
  'Catálogo global de conceptos facturables (sin tenant_id) que fn_instanciar_conceptos copia a '
  'cada tenant — mismo patrón que presupuesto_cuenta_plantilla/contable_plan_cuenta. Deliberadamente '
  'corto (3 filas): solo lo validado como contenido real en uso, no ruido de prueba. Ver comentario '
  'de cabecera de 20260901180000 para el porqué de qué entra y qué no.';

insert into public.conceptos_plantilla
  (codigo, nombre, modo_calculo, formula_ael, prioridad, modo_valor, valor_fijo, tipo_recurrencia, periodicidad, presupuesto_cuenta_codigo)
values
  (
    'ADMINISTRACION', 'Cuota de administración', 'distribucion',
    'REGLA CUOTA_BASICA' || chr(10) ||
    'DEFINIR presupuesto_anual = PARAMETER.PRESUPUESTO_ANUAL' || chr(10) ||
    'DEFINIR otros_ingresos_anual = PARAMETER.OTROS_INGRESOS_ANUAL' || chr(10) ||
    'RETORNAR presupuesto_anual - otros_ingresos_anual',
    100, 'formulado', null, 'recurrente', 'mensual', 'cuotas_administracion'
  ),
  (
    'CUOTA_EXTRA', 'Cuota extraordinaria', 'distribucion', null,
    90, 'fijo', 0, 'por_periodo', null, null
  ),
  (
    'NOVEDAD', 'Novedad', 'directo', null,
    10, 'fijo', 0, 'novedad', null, null
  );

-- ═══════════════════════════════════════════════════════════════════════
--  2. fn_instanciar_conceptos
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_instanciar_conceptos(p_tenant_id uuid)
returns table (creadas integer, existentes integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_creadas integer := 0;
  v_total   integer;
  v_hoy     date := current_date;
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'TENANT_INEXISTENTE: %', p_tenant_id;
  end if;

  insert into public.conceptos (
    tenant_id, codigo, nombre, modo_calculo, formula_ael, prioridad,
    modo_valor, valor_fijo, tipo_recurrencia, periodicidad,
    fecha_inicio_anio, fecha_inicio_mes, fecha_fin_anio, fecha_fin_mes,
    presupuesto_cuenta_id, alcance, estado, version
  )
  select
    p_tenant_id, cp.codigo, cp.nombre, cp.modo_calculo, cp.formula_ael, cp.prioridad,
    cp.modo_valor, cp.valor_fijo, cp.tipo_recurrencia, cp.periodicidad,
    case when cp.tipo_recurrencia in ('recurrente', 'unico', 'por_periodo')
      then extract(year from v_hoy)::smallint end,
    case when cp.tipo_recurrencia in ('recurrente', 'unico', 'por_periodo')
      then extract(month from v_hoy)::smallint end,
    case when cp.tipo_recurrencia = 'por_periodo'
      then extract(year from v_hoy + interval '11 months')::smallint end,
    case when cp.tipo_recurrencia = 'por_periodo'
      then extract(month from v_hoy + interval '11 months')::smallint end,
    pc.id, 'todos', 'borrador', 1
  from public.conceptos_plantilla cp
  left join public.presupuesto_cuenta pc
    on pc.tenant_id = p_tenant_id and pc.codigo = cp.presupuesto_cuenta_codigo
  on conflict (tenant_id, codigo) do nothing;

  get diagnostics v_creadas = row_count;

  select count(*) into v_total from public.conceptos_plantilla;
  return query select v_creadas, (v_total - v_creadas)::integer;
end;
$$;

comment on function public.fn_instanciar_conceptos(uuid) is
  'Copia la plantilla global (conceptos_plantilla) al catálogo de conceptos de una copropiedad. '
  'Idempotente: ON CONFLICT DO NOTHING por (tenant_id, codigo). Todo nace en estado=''borrador'' '
  'version=1 sin importar el estado de la fila fuente — cada tenant corre su propio maker-checker '
  '(AEL-004), nadie hereda una aprobación ajena. SECURITY INVOKER: la autorización la resuelve '
  'conceptos_insert_agent, no la función.';

-- ═══════════════════════════════════════════════════════════════════════
--  3. Protección del concepto Novedad — no se puede archivar
--
--  guard_concepto_transicion (última versión: 20260830180000) no tenía
--  ninguna excepción para tipo_recurrencia='novedad'. El índice
--  conceptos_novedad_singleton_idx (20260827100000) impide que existan
--  DOS a la vez, pero nada impedía archivar el único que hay — y sin
--  él, NovedadesEditor bloquea la creación de novedades
--  permanentes/prorrateables. "No se puede borrar" ya era cierto sin
--  cambios: conceptos nunca tuvo política de DELETE (16 §19, comentario
--  en 20260814100200) ni función de borrado en el store.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.guard_concepto_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contenido_cambio boolean;
begin
  v_contenido_cambio := (
    new.nombre is distinct from old.nombre
    or new.modo_calculo is distinct from old.modo_calculo
    or new.formula_ael is distinct from old.formula_ael
    or new.prioridad is distinct from old.prioridad
    or new.modo_valor is distinct from old.modo_valor
    or new.valor_fijo is distinct from old.valor_fijo
    or new.tipo_recurrencia is distinct from old.tipo_recurrencia
    or new.fecha_inicio_anio is distinct from old.fecha_inicio_anio
    or new.fecha_inicio_mes is distinct from old.fecha_inicio_mes
    or new.fecha_fin_anio is distinct from old.fecha_fin_anio
    or new.fecha_fin_mes is distinct from old.fecha_fin_mes
    or new.periodicidad is distinct from old.periodicidad
    or new.alcance is distinct from old.alcance
    or new.alcance_condiciones is distinct from old.alcance_condiciones
  );

  if v_contenido_cambio and old.estado <> 'borrador' then
    raise exception 'CONCEPTO_INMUTABLE: % está en estado % — solo se puede editar el contenido en borrador (Doc 10 §27)',
      old.id, old.estado;
  end if;

  if new.estado = old.estado then
    return new;
  end if;

  if old.tipo_recurrencia = 'novedad' and new.estado = 'archivado' then
    raise exception 'CONCEPTO_NOVEDAD_PROTEGIDO: % es el concepto singleton tipo_recurrencia=''novedad'' — '
      'no se puede archivar, lo exige NovedadesEditor para novedades permanentes o prorrateables. '
      'Para reemplazarlo primero crea y aprueba un concepto nuevo con tipo_recurrencia=''novedad''.',
      old.id;
  end if;

  if not (
    (old.estado = 'borrador' and new.estado = 'en_revision')
    or (old.estado = 'en_revision' and new.estado = 'borrador')
    or (old.estado = 'en_revision' and new.estado = 'activo')
    or (old.estado = 'activo' and new.estado = 'borrador')
    or (old.estado = 'activo' and new.estado = 'archivado')
    or (old.estado = 'borrador' and new.estado = 'archivado')
  ) then
    raise exception 'INVALID_TRANSITION: concepto % no puede pasar de % a %',
      old.id, old.estado, new.estado;
  end if;

  if old.estado = 'borrador' and new.estado = 'en_revision' then
    new.enviado_a_revision_por := auth.uid();
    new.enviado_a_revision_at := now();
  end if;

  if old.estado = 'en_revision' and new.estado = 'activo' then
    if auth.uid() is not null and old.enviado_a_revision_por = auth.uid() then
      raise exception 'SELF_APPROVAL: no puedes aprobar tu propia solicitud de revisión (concepto %)',
        old.id;
    end if;
    new.aprobado_por := auth.uid();
    new.aprobado_at := now();
  end if;

  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
--  4. create_tenant() — siembra también el catálogo de conceptos
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.create_tenant(p_name text, p_slug text)
returns public.tenants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para crear una copropiedad';
  end if;

  insert into public.tenants (name, slug, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), (select auth.uid()))
  returning * into v_tenant;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id)
  values (v_tenant.id, (select auth.uid()), 'tenant.created', 'tenant', v_tenant.id);

  insert into public.memberships (user_id, tenant_id, role, status)
  values ((select auth.uid()), v_tenant.id, 'administrador', 'active');

  -- PC-2b/PC-2c: siembra los árboles presupuestal y contable. Conceptos depende de
  -- presupuesto_cuenta (ADMINISTRACION se liga a cuotas_administracion por código), así que
  -- tiene que ir después de fn_instanciar_presupuesto_cuenta, en la misma transacción de alta.
  perform public.fn_instanciar_presupuesto_cuenta(v_tenant.id);
  perform public.fn_instanciar_plan_contable(v_tenant.id);
  perform public.fn_instanciar_conceptos(v_tenant.id);

  update public.profiles
  set active_tenant_id = v_tenant.id
  where id = (select auth.uid());

  return v_tenant;
exception
  when unique_violation then
    raise exception 'SLUG_TAKEN: ya existe una copropiedad con ese slug';
  when check_violation then
    raise exception 'SLUG_INVALID: el nombre o el slug no cumplen el formato requerido';
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
--  5. Backfill — todos los tenants existentes reciben los conceptos que
--     les falten; idempotente, no toca ninguno que ya tenga esos códigos
--     (como GC-001, que ya tiene ADMINISTRACION/CUOTA_EXTRA/NOVEDAD).
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_tenant uuid;
begin
  for v_tenant in select id from public.tenants
  loop
    perform public.fn_instanciar_conceptos(v_tenant);
  end loop;
end $$;
