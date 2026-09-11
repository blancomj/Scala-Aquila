-- ═══════════════════════════════════════════════════════════════════════
--  CO-9 · Ciclo de vida de contable_rendicion_cuentas (§4.3) —
--  borrador → presentada → aprobada/rechazada.
--
--  crear/presentar: auxiliar (igual que "generar" el acta en GOB-4).
--  aprobar/rechazar: administrador (mismo peso que "suscribir" el acta) —
--  aprobar tiene efecto legal real (bloquea el ejercicio si no lo estaba).
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_contable_crear_rendicion(
  p_tenant_id     uuid,
  p_ejercicio     int,
  p_periodo_desde date,
  p_periodo_hasta date,
  p_certificacion_id uuid,
  p_dictamen_id   uuid default null,
  p_presupuesto_ejecutado_resumen jsonb default null
)
returns public.contable_rendicion_cuentas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_certificacion public.contable_certificacion;
  v_row           public.contable_rendicion_cuentas;
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o superior para crear una rendición';
  end if;

  select * into v_certificacion
  from public.contable_certificacion
  where id = p_certificacion_id and tenant_id = p_tenant_id;
  if v_certificacion.id is null then
    raise exception 'CERTIFICACION_INEXISTENTE: % no existe para este tenant', p_certificacion_id;
  end if;
  if v_certificacion.invalidada then
    raise exception 'CERTIFICACION_INVALIDADA: la certificación % ya fue invalidada — no admite '
      'una rendición nueva', p_certificacion_id;
  end if;

  insert into public.contable_rendicion_cuentas (
    tenant_id, ejercicio, periodo_desde, periodo_hasta, certificacion_id, dictamen_id,
    presupuesto_ejecutado_resumen, creado_por
  ) values (
    p_tenant_id, p_ejercicio, p_periodo_desde, p_periodo_hasta, p_certificacion_id, p_dictamen_id,
    p_presupuesto_ejecutado_resumen, (select auth.uid())
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.fn_contable_crear_rendicion(
  uuid, int, date, date, uuid, uuid, jsonb
) is
  'CO-9 §4.3: crea el borrador de rendición sobre una certificación vigente. '
  'CERTIFICACION_INVALIDADA si la certificación ya fue invalidada.';

-- ── presentar: borrador → presentada ─────────────────────────────────────
create function public.fn_contable_presentar_rendicion(
  p_id                   uuid,
  p_decision_id          uuid default null,
  p_acta_referencia_texto text default null,
  p_observaciones        text default null
)
returns public.contable_rendicion_cuentas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rendicion     public.contable_rendicion_cuentas;
  v_certificacion public.contable_certificacion;
  v_tenant        public.tenants;
  v_row           public.contable_rendicion_cuentas;
begin
  select * into v_rendicion from public.contable_rendicion_cuentas where id = p_id;
  if v_rendicion.id is null then
    raise exception 'RENDICION_INEXISTENTE: % no existe', p_id;
  end if;

  if not public.has_role(v_rendicion.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o superior para presentar una rendición';
  end if;

  if v_rendicion.estado <> 'borrador' then
    raise exception 'RENDICION_ESTADO_INVALIDO: % está en estado % — solo un borrador puede '
      'presentarse', p_id, v_rendicion.estado;
  end if;

  if p_decision_id is not null and coalesce(btrim(p_acta_referencia_texto), '') <> '' then
    raise exception 'RENDICION_ORIGEN_DUPLICADO: no puede indicar decision_id y '
      'acta_referencia_texto a la vez';
  end if;
  if p_decision_id is null and coalesce(btrim(p_acta_referencia_texto), '') = '' then
    raise exception 'RENDICION_ORIGEN_FALTANTE: presentar exige decision_id o '
      'acta_referencia_texto';
  end if;

  select * into v_certificacion from public.contable_certificacion where id = v_rendicion.certificacion_id;
  if v_certificacion.invalidada then
    raise exception 'CERTIFICACION_INVALIDADA: la certificación % de esta rendición ya fue '
      'invalidada — no puede presentarse como vigente', v_certificacion.id;
  end if;

  select * into v_tenant from public.tenants where id = v_rendicion.tenant_id;
  if (v_tenant.uso_economico in ('comercial', 'mixto') or v_tenant.tiene_revisor_fiscal is true)
     and v_rendicion.dictamen_id is null then
    raise exception 'RENDICION_SIN_DICTAMEN_OBLIGATORIO: el revisor fiscal es obligatorio para '
      'este tenant (uso_economico=%, tiene_revisor_fiscal=%) y la rendición % no tiene dictamen',
      v_tenant.uso_economico, v_tenant.tiene_revisor_fiscal, p_id;
  end if;

  update public.contable_rendicion_cuentas
  set estado = 'presentada', decision_id = p_decision_id,
      acta_referencia_texto = nullif(btrim(p_acta_referencia_texto), ''),
      observaciones = coalesce(p_observaciones, observaciones),
      presentada_at = now()
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.fn_contable_presentar_rendicion(uuid, uuid, text, text) is
  'CO-9 §4.3: borrador → presentada. RENDICION_ORIGEN_DUPLICADO/FALTANTE (exactamente una fuente); '
  'RENDICION_SIN_DICTAMEN_OBLIGATORIO si uso_economico exige revisor fiscal (Ley 675 art. 56) o el '
  'tenant lo marcó manualmente y no hay dictamen; CERTIFICACION_INVALIDADA si la certificación '
  'base ya no es vigente.';

-- ── aprobar: presentada → aprobada (bloquea el ejercicio si no lo estaba) ─
create function public.fn_contable_aprobar_rendicion(p_id uuid)
returns public.contable_rendicion_cuentas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rendicion public.contable_rendicion_cuentas;
  v_row       public.contable_rendicion_cuentas;
begin
  select * into v_rendicion from public.contable_rendicion_cuentas where id = p_id;
  if v_rendicion.id is null then
    raise exception 'RENDICION_INEXISTENTE: % no existe', p_id;
  end if;

  if not public.has_role(v_rendicion.tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol administrador para aprobar una rendición';
  end if;

  if v_rendicion.estado <> 'presentada' then
    raise exception 'RENDICION_ESTADO_INVALIDO: % está en estado % — solo una rendición '
      'presentada puede aprobarse', p_id, v_rendicion.estado;
  end if;

  -- El ejercicio ya está 'bloqueado' desde que se certificó (CERTIFICACION_
  -- EJERCICIO_ABIERTO lo exige antes de certificar) — este update es
  -- idempotente, no un paso nuevo: §4.3 lo describe como "si no lo estaba".
  update public.periodos
  set contable_estado = 'bloqueado'
  where tenant_id = v_rendicion.tenant_id and anio = v_rendicion.ejercicio
    and contable_estado <> 'bloqueado';

  update public.contable_rendicion_cuentas
  set estado = 'aprobada', aprobada_at = now()
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.fn_contable_aprobar_rendicion(uuid) is
  'CO-9 §4.3: presentada → aprobada. El paquete queda congelado (sin más transiciones de '
  'escritura definidas sobre esta fila) y el ejercicio pasa a bloqueado si no lo estaba — en la '
  'práctica siempre lo estaba ya, porque certificar exige CERTIFICACION_EJERCICIO_ABIERTO.';

-- ── rechazar: presentada → rechazada ──────────────────────────────────────
create function public.fn_contable_rechazar_rendicion(p_id uuid, p_motivo text)
returns public.contable_rendicion_cuentas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rendicion public.contable_rendicion_cuentas;
  v_row       public.contable_rendicion_cuentas;
begin
  select * into v_rendicion from public.contable_rendicion_cuentas where id = p_id;
  if v_rendicion.id is null then
    raise exception 'RENDICION_INEXISTENTE: % no existe', p_id;
  end if;

  if not public.has_role(v_rendicion.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o superior para rechazar una rendición';
  end if;

  if v_rendicion.estado <> 'presentada' then
    raise exception 'RENDICION_ESTADO_INVALIDO: % está en estado % — solo una rendición '
      'presentada puede rechazarse', p_id, v_rendicion.estado;
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'RENDICION_RECHAZO_SIN_MOTIVO: rechazar % exige motivo', p_id;
  end if;

  update public.contable_rendicion_cuentas
  set estado = 'rechazada', observaciones = p_motivo
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.fn_contable_rechazar_rendicion(uuid, text) is
  'CO-9 §4.3: presentada → rechazada, exige motivo (RENDICION_RECHAZO_SIN_MOTIVO). No bloquea el '
  'ejercicio ni invalida la certificación — una rendición rechazada puede volver a prepararse '
  'como una rendición nueva (fuera de alcance re-versionar esta misma fila).';

-- ── vincular el paquete PDF exportado (mismo patrón que fn_gobierno_
--    vincular_documento_acta, GOB-4) ──────────────────────────────────────
create function public.fn_contable_vincular_documento_rendicion(p_id uuid, p_documento_id uuid)
returns public.contable_rendicion_cuentas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rendicion public.contable_rendicion_cuentas;
  v_documento_tenant uuid;
  v_row public.contable_rendicion_cuentas;
begin
  select * into v_rendicion from public.contable_rendicion_cuentas where id = p_id;
  if v_rendicion.id is null then
    raise exception 'RENDICION_INEXISTENTE: % no existe', p_id;
  end if;

  if not public.has_role(v_rendicion.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o superior para vincular el documento';
  end if;

  select tenant_id into v_documento_tenant from public.documentos where id = p_documento_id;
  if v_documento_tenant is distinct from v_rendicion.tenant_id then
    raise exception 'RENDICION_DOCUMENTO_INVALIDO: documento_id % no pertenece al tenant % de '
      'la rendición', p_documento_id, v_rendicion.tenant_id;
  end if;

  update public.contable_rendicion_cuentas set documento_id = p_documento_id, updated_at = now()
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.fn_contable_vincular_documento_rendicion(uuid, uuid) is
  'CO-9 §4.3: vincula el paquete PDF exportado (subido vía subir-documento) a una rendición ya '
  'existente, en cualquier estado — mismo criterio que fn_gobierno_vincular_documento_acta (GOB-4).';

-- ── registro informativo de trámite ante la DIAN (§4.5) ───────────────────
create function public.fn_contable_registrar_libros_dian(
  p_id uuid, p_fecha date, p_radicado text
)
returns public.contable_rendicion_cuentas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rendicion public.contable_rendicion_cuentas;
  v_row       public.contable_rendicion_cuentas;
begin
  select * into v_rendicion from public.contable_rendicion_cuentas where id = p_id;
  if v_rendicion.id is null then
    raise exception 'RENDICION_INEXISTENTE: % no existe', p_id;
  end if;

  if not public.has_role(v_rendicion.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o superior para registrar el trámite';
  end if;

  update public.contable_rendicion_cuentas
  set libros_dian_registrado = true, libros_dian_fecha = p_fecha, libros_dian_radicado = p_radicado
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.fn_contable_registrar_libros_dian(uuid, date, text) is
  'CO-9 §4.5: registro puramente informativo de que el trámite de registro de libros ante la DIAN '
  'se hizo fuera del sistema (DIAN Concepto 0347 de 2022) — el sistema no ejecuta el trámite, '
  'fuera de alcance vinculante del corte.';
