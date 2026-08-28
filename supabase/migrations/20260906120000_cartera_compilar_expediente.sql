-- ═══════════════════════════════════════════════════════════════════════
--  CAR §34.5 (2/2) · fn_compilar_expediente — el artefacto que se radica
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §34.5
--
--  REC-CAR-019: composición sobre datos existentes. NO calcula nada nuevo,
--  reúne. Criterio de terminación de la sección: el abogado debe poder
--  radicar con esto sin pedir nada más.
--
--  REPRODUCIBILIDAD (PH-C44) — la razón de casi todas las decisiones raras
--  de esta función. La misma fecha_corte debe producir el MISMO hash
--  mañana, con pagos y gestiones posteriores ya en la base. Por eso:
--
--    · el saldo NO sale de v_cargo_saldo (que descuenta todos los pagos,
--      incluidos los posteriores al corte) sino de monto_original menos
--      las aplicaciones de pagos con fecha_pago <= corte;
--    · toda acción, envío y acuse se filtra por su fecha propia <= corte;
--    · cada lista lleva un ORDER BY explícito y determinista — sin él,
--      Postgres puede devolver el mismo conjunto en otro orden y cambiar
--      el hash sin que nada de fondo haya cambiado;
--    · generado_at queda FUERA del objeto que se hashea. Es la única
--      forma de que dos compilaciones del mismo corte coincidan.
--
--  El hash es del expediente, no de cada documento: acredita que ESTE
--  conjunto de piezas es el que se compiló ese día. Los documentos
--  conservan además su propio contenido íntegro (§34.3).
--
--  GAP-CAR-001 (opción B de §4.4): cargos.fecha_vencimiento es un OVERRIDE
--  nullable; la fecha efectiva es coalesce(cargo, periodo), igual que en
--  20260823180000. Un cargo sin override no está sin vencimiento.
--
--  Lo que esta función NO hace: el PDF. La materialización paginada es
--  capa de aplicación (§34.5) y el PDF no es fuente de verdad — es una
--  foto fechada de esta función.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_compilar_expediente(
  p_tenant_id   uuid,
  p_inmueble_id uuid,
  p_fecha_corte date
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_identificacion    jsonb;
  v_titulo            jsonb;
  v_deuda             jsonb;
  v_cronologia        jsonb;
  v_promesas          jsonb;
  v_acuerdos          jsonb;
  v_trazabilidad      jsonb;
  v_fallidos          jsonb;
  v_caso              jsonb;
  v_cuerpo            jsonb;
begin
  -- ── 1. IDENTIFICACIÓN ──────────────────────────────────────────────
  -- Deudores vigentes A LA FECHA DE CORTE, no hoy: si el inmueble se
  -- vendió después, el expediente debe seguir señalando a quien respondía
  -- entonces (REC-CAR-008).
  select jsonb_build_object(
    'copropiedad', (
      select jsonb_build_object(
        'nombre', t.name, 'nit', t.nit, 'direccion', t.direccion, 'ciudad', t.ciudad
      )
      from public.tenants t where t.id = p_tenant_id
    ),
    'inmueble', (
      select jsonb_build_object(
        'id', i.id,
        'codigo', i.codigo,
        'matricula_inmobiliaria', i.matricula_inmobiliaria,
        'area_privada', i.area_privada,
        'coeficiente', (
          select c.valor
          from public.coeficientes c
          join public.coeficiente_sets cs on cs.id = c.set_id
          where c.inmueble_id = i.id
            and c.tenant_id = p_tenant_id
            and cs.vigente_desde <= p_fecha_corte
            and (cs.vigente_hasta is null or cs.vigente_hasta >= p_fecha_corte)
          order by cs.vigente_desde desc, cs.version desc
          limit 1
        )
      )
      from public.inmuebles i
      where i.id = p_inmueble_id and i.tenant_id = p_tenant_id
    ),
    'obligados', coalesce((
      select jsonb_agg(x order by x->>'documento')
      from (
        select jsonb_build_object(
          'tercero_id', te.id,
          'nombre', te.nombre_completo,
          'documento', te.numero_documento,
          'rol', lt.codigo,
          'porcentaje', ipr.porcentaje,
          'vigente_desde', ipr.vigente_desde,
          'vigente_hasta', ipr.vigente_hasta,
          'direccion_notificacion', te.direccion,
          'municipio', te.municipio,
          'email', te.email
        ) as x
        from public.inmueble_persona_rol ipr
        join public.terceros te on te.id = ipr.tercero_id
        join public.lista_tipos lt on lt.id = ipr.rol_id
        where ipr.tenant_id = p_tenant_id
          and ipr.inmueble_id = p_inmueble_id
          and ipr.vigente_desde <= p_fecha_corte
          and (ipr.vigente_hasta is null or ipr.vigente_hasta >= p_fecha_corte)
      ) s
    ), '[]'::jsonb)
  ) into v_identificacion;

  -- ── 2. TÍTULO EJECUTIVO (art. 48) ──────────────────────────────────
  -- La certificación vigente más reciente cuyo corte no sea posterior al
  -- del expediente. Una certificación anulada no sirve de título, pero se
  -- reporta su ausencia explícitamente en vez de callar.
  select coalesce(
    (
      select jsonb_build_object(
        'certificacion_id', cd.id,
        'consecutivo', cd.consecutivo,
        'fecha_expedicion', cd.fecha_expedicion,
        'fecha_corte', cd.fecha_corte,
        'monto_expensas_ordinarias', cd.monto_expensas_ordinarias,
        'monto_expensas_extraordinarias', cd.monto_expensas_extraordinarias,
        'monto_intereses_mora', cd.monto_intereses_mora,
        'monto_sanciones', cd.monto_sanciones,
        'monto_otros', cd.monto_otros,
        'monto_total', cd.monto_total,
        'detalle_cargos', cd.detalle_cargos,
        'politica_financiera_id', cd.politica_financiera_id,
        'politica_version', cd.politica_version,
        'certificacion_hash', cd.certificacion_hash,
        'cargo_firmante', cd.cargo_firmante,
        'estado', cd.estado
      )
      from public.certificaciones_deuda cd
      where cd.tenant_id = p_tenant_id
        and cd.inmueble_id = p_inmueble_id
        and cd.estado = 'vigente'
        and cd.fecha_corte <= p_fecha_corte
      order by cd.fecha_corte desc, cd.fecha_expedicion desc, cd.id desc
      limit 1
    ),
    jsonb_build_object(
      'certificacion_id', null,
      'faltante', 'Sin certificación de deuda vigente al corte — no hay título ejecutivo (art. 48 L675)'
    )
  ) into v_titulo;

  -- ── 3. COMPOSICIÓN DE LA DEUDA ─────────────────────────────────────
  -- Saldo RECONSTRUIDO al corte, no el saldo de hoy (ver cabecera).
  select coalesce(jsonb_agg(x order by (x->>'fecha_vencimiento'), (x->>'cargo_id')), '[]'::jsonb)
  into v_deuda
  from (
    select jsonb_build_object(
      'cargo_id', c.id,
      'categoria', c.categoria,
      'concepto_id', c.concepto_id,
      'fecha_vencimiento', coalesce(c.fecha_vencimiento, per.fecha_vencimiento),
      'monto_original', c.monto_original,
      'saldo_al_corte', c.monto_original - coalesce((
        select sum(pa.monto)
        from public.pago_aplicaciones pa
        join public.pagos pg on pg.id = pa.pago_id
        where pa.cargo_id = c.id
          and pg.fecha_pago <= p_fecha_corte
      ), 0),
      'dias_mora', (p_fecha_corte - coalesce(c.fecha_vencimiento, per.fecha_vencimiento))
    ) as x
    from public.cargos c
    left join public.periodos per on per.id = c.periodo_id
    where c.tenant_id = p_tenant_id
      and c.inmueble_id = p_inmueble_id
      and coalesce(c.fecha_vencimiento, per.fecha_vencimiento) is not null
      and coalesce(c.fecha_vencimiento, per.fecha_vencimiento) < p_fecha_corte
      and c.monto_original - coalesce((
        select sum(pa.monto)
        from public.pago_aplicaciones pa
        join public.pagos pg on pg.id = pa.pago_id
        where pa.cargo_id = c.id
          and pg.fecha_pago <= p_fecha_corte
      ), 0) > 0
  ) s;

  -- ── 4. CRONOLOGÍA DE GESTIÓN ───────────────────────────────────────
  -- Cada acción con lo que realmente se envió: texto íntegro, plantilla y
  -- versión, destinatario, canal y el acuse con su fecha. Esta es la parte
  -- del expediente que contesta «acredítelo».
  select coalesce(jsonb_agg(x order by (x->>'fecha_programada'), (x->>'accion_id')), '[]'::jsonb)
  into v_cronologia
  from (
    select jsonb_build_object(
      'accion_id', ac.id,
      'tipo_accion', ac.tipo_accion,
      'canal', ac.canal,
      'fecha_programada', ac.fecha_programada,
      'fecha_ejecucion', ac.fecha_ejecucion,
      'estado', ac.estado,
      'destinatario', jsonb_build_object(
        'tercero_id', ac.destinatario_tercero_id,
        'rol', ac.destinatario_rol_codigo,
        'contacto', ac.destinatario_contacto
      ),
      'grupo_envio_id', ac.grupo_envio_id,
      'contexto_congelado', jsonb_build_object(
        'clasificacion', ac.clasificacion_codigo,
        'dias_mora', ac.dias_mora_al_momento,
        'deuda_total', ac.deuda_total_al_momento,
        'politica_id', ac.politica_clasificacion_id,
        'politica_version', ac.politica_version
      ),
      'envios', coalesce((
        select jsonb_agg(e order by (e->>'intento_numero'))
        from (
          select jsonb_build_object(
            'envio_id', en.id,
            'intento_numero', en.intento_numero,
            'canal', en.canal,
            'destinatario_contacto', en.destinatario_contacto,
            'plantilla_codigo', en.plantilla_codigo,
            'plantilla_version', en.plantilla_version,
            'asunto', en.asunto,
            'contenido_renderizado', en.contenido_renderizado,
            'contenido_hash', en.contenido_hash,
            'proveedor', en.proveedor,
            'referencia_externa', en.referencia_externa,
            'enviado_at', en.enviado_at,
            'acuses', coalesce((
              select jsonb_agg(a order by (a->>'ocurrido_at'))
              from (
                select jsonb_build_object(
                  'estado', acu.estado,
                  'ocurrido_at', acu.ocurrido_at,
                  'origen', acu.origen,
                  'motivo', acu.motivo,
                  'documento_id', acu.documento_id
                ) as a
                from public.acciones_cobranza_acuses acu
                where acu.envio_id = en.id
                  and acu.tenant_id = p_tenant_id
                  and acu.ocurrido_at < (p_fecha_corte + 1)
              ) sa
            ), '[]'::jsonb)
          ) as e
          from public.acciones_cobranza_envios en
          where en.accion_id = ac.id
            and en.tenant_id = p_tenant_id
            and en.enviado_at < (p_fecha_corte + 1)
        ) se
      ), '[]'::jsonb),
      -- Acreditación AL CORTE. No se reutiliza fn_acreditacion_accion
      -- aquí: esa función responde '¿está acreditada hoy?' y mira todos
      -- los acuses, incluidos los posteriores. Un expediente de febrero
      -- que dijera 'acreditada' por un acuse de marzo sería falso, y
      -- además rompería el hash reproducible.
      'acreditada', coalesce((
        select bool_or(u.estado in ('entregado', 'leido'))
        from public.acciones_cobranza_envios en2
        join lateral (
          select acu.estado
          from public.acciones_cobranza_acuses acu
          where acu.envio_id = en2.id
            and acu.tenant_id = p_tenant_id
            and acu.ocurrido_at < (p_fecha_corte + 1)
          order by acu.ocurrido_at desc, acu.recibido_at desc, acu.id desc
          limit 1
        ) u on true
        where en2.accion_id = ac.id
          and en2.tenant_id = p_tenant_id
          and en2.enviado_at < (p_fecha_corte + 1)
      ), false)
    ) as x
    from public.acciones_cobranza ac
    where ac.tenant_id = p_tenant_id
      and ac.inmueble_id = p_inmueble_id
      and ac.fecha_programada <= p_fecha_corte
  ) s;

  -- ── 5. PROMESAS Y ACUERDOS ─────────────────────────────────────────
  select coalesce(jsonb_agg(x order by (x->>'fecha_promesa'), (x->>'promesa_id')), '[]'::jsonb)
  into v_promesas
  from (
    select jsonb_build_object(
      'promesa_id', pp.id,
      'fecha_promesa', pp.fecha_promesa,
      'monto_prometido', pp.monto_prometido,
      'fecha_pago_prometida', pp.fecha_pago_prometida,
      'estado', pp.estado,
      'monto_cumplido', pp.monto_cumplido,
      'accion_cobranza_id', pp.accion_cobranza_id
    ) as x
    from public.promesas_pago pp
    where pp.tenant_id = p_tenant_id
      and pp.inmueble_id = p_inmueble_id
      and pp.fecha_promesa <= p_fecha_corte
  ) s;

  select coalesce(jsonb_agg(x order by (x->>'fecha_acuerdo'), (x->>'acuerdo_id')), '[]'::jsonb)
  into v_acuerdos
  from (
    select jsonb_build_object(
      'acuerdo_id', ap.id,
      'consecutivo', ap.consecutivo,
      'fecha_acuerdo', ap.fecha_acuerdo,
      'monto_total', ap.monto_total,
      'monto_capital', ap.monto_capital,
      'monto_interes', ap.monto_interes,
      'numero_cuotas', ap.numero_cuotas,
      'condona_interes', ap.condona_interes,
      'monto_condonado', ap.monto_condonado,
      'estado', ap.estado,
      'fecha_incumplimiento', ap.fecha_incumplimiento,
      'motivo_incumplimiento', ap.motivo_incumplimiento,
      'cuotas', coalesce((
        select jsonb_agg(c order by (c->>'numero_cuota')::int)
        from (
          select jsonb_build_object(
            'numero_cuota', cu.numero_cuota,
            'fecha_vencimiento', cu.fecha_vencimiento,
            'monto', cu.monto,
            'monto_pagado', cu.monto_pagado,
            'estado', cu.estado,
            'fecha_pago', cu.fecha_pago
          ) as c
          from public.acuerdo_pago_cuotas cu
          where cu.acuerdo_id = ap.id and cu.tenant_id = p_tenant_id
        ) sc
      ), '[]'::jsonb)
    ) as x
    from public.acuerdos_pago ap
    where ap.tenant_id = p_tenant_id
      and ap.inmueble_id = p_inmueble_id
      and ap.fecha_acuerdo <= p_fecha_corte
  ) s;

  -- ── 6. TRAZABILIDAD ────────────────────────────────────────────────
  -- Quién aprobó qué. Un escalamiento sin aprobante identificado es
  -- exactamente lo que el art. 48 no perdona.
  select jsonb_build_object(
    'etapa_actual', (
      select ce.etapa from public.cartera_etapas ce
      where ce.tenant_id = p_tenant_id and ce.inmueble_id = p_inmueble_id
    ),
    'aprobaciones', coalesce((
      select jsonb_agg(x order by (x->>'aprobada_at'), (x->>'accion_id'))
      from (
        select jsonb_build_object(
          'accion_id', ac.id,
          'tipo_accion', ac.tipo_accion,
          'aprobada_por', ac.aprobada_por,
          'aprobada_at', ac.aprobada_at,
          'propuesta_por', ac.propuesta_por
        ) as x
        from public.acciones_cobranza ac
        where ac.tenant_id = p_tenant_id
          and ac.inmueble_id = p_inmueble_id
          and ac.aprobada_at is not null
          and ac.aprobada_at < (p_fecha_corte + 1)
      ) s
    ), '[]'::jsonb)
  ) into v_trazabilidad;

  -- ── 7. INTENTOS FALLIDOS ───────────────────────────────────────────
  -- No son un vacío del expediente: son la prueba de que se intentó. Un
  -- «dirección inexistente» documentado vale ante un juez (PH-C43).
  select coalesce(jsonb_agg(x order by (x->>'enviado_at'), (x->>'envio_id')), '[]'::jsonb)
  into v_fallidos
  from (
    select jsonb_build_object(
      'envio_id', en.id,
      'accion_id', en.accion_id,
      'canal', en.canal,
      'destinatario_contacto', en.destinatario_contacto,
      'enviado_at', en.enviado_at,
      'estado_final', ult.estado,
      'motivo', ult.motivo,
      'documento_id', ult.documento_id
    ) as x
    from public.acciones_cobranza_envios en
    join public.acciones_cobranza ac on ac.id = en.accion_id
    join lateral (
      select acu.estado, acu.motivo, acu.documento_id
      from public.acciones_cobranza_acuses acu
      where acu.envio_id = en.id
        and acu.tenant_id = p_tenant_id
        and acu.ocurrido_at < (p_fecha_corte + 1)
      order by acu.ocurrido_at desc, acu.recibido_at desc, acu.id desc
      limit 1
    ) ult on true
    where en.tenant_id = p_tenant_id
      and ac.inmueble_id = p_inmueble_id
      and en.enviado_at < (p_fecha_corte + 1)
      and ult.estado in ('rebotado', 'fallido', 'no_entregable')
  ) s;

  -- ── Caso jurídico, si ya existe ────────────────────────────────────
  select coalesce(
    (
      select jsonb_build_object(
        'caso_id', cj.id,
        'consecutivo', cj.consecutivo,
        'fecha_remision', cj.fecha_remision,
        'numero_radicado', cj.numero_radicado,
        'juzgado', cj.juzgado,
        'estado', cj.estado,
        'monto_pretension', cj.monto_pretension,
        'actuaciones', coalesce((
          select jsonb_agg(a order by (a->>'fecha'), (a->>'actuacion_id'))
          from (
            select jsonb_build_object(
              'actuacion_id', act.id,
              'fecha', act.fecha,
              'descripcion', act.descripcion,
              'estado_desde', act.estado_desde,
              'estado_hasta', act.estado_hasta
            ) as a
            from public.caso_juridico_actuaciones act
            where act.caso_id = cj.id
              and act.tenant_id = p_tenant_id
              and act.fecha <= p_fecha_corte
          ) sa
        ), '[]'::jsonb)
      )
      from public.casos_juridicos cj
      where cj.tenant_id = p_tenant_id
        and cj.inmueble_id = p_inmueble_id
        and cj.fecha_remision <= p_fecha_corte
      order by cj.fecha_remision desc, cj.id desc
      limit 1
    ),
    'null'::jsonb
  ) into v_caso;

  -- ── Ensamblaje ─────────────────────────────────────────────────────
  -- El orden de las claves es el de §34.5 y no es decorativo: el PDF se
  -- pagina en este orden.
  v_cuerpo := jsonb_build_object(
    'fecha_corte', p_fecha_corte,
    'tenant_id', p_tenant_id,
    'inmueble_id', p_inmueble_id,
    'identificacion', v_identificacion,
    'titulo_ejecutivo', v_titulo,
    'composicion_deuda', v_deuda,
    'cronologia_gestion', v_cronologia,
    'promesas', v_promesas,
    'acuerdos', v_acuerdos,
    'trazabilidad', v_trazabilidad,
    'intentos_fallidos', v_fallidos,
    'caso_juridico', v_caso
  );

  -- generado_at va FUERA del cuerpo hasheado: es lo único que cambia
  -- entre dos compilaciones idénticas (PH-C44).
  return v_cuerpo || jsonb_build_object(
    'expediente_hash', encode(extensions.digest(v_cuerpo::text, 'sha256'), 'hex'),
    'generado_at', now()
  );
end;
$$;

comment on function public.fn_compilar_expediente(uuid, uuid, date) is
  'CAR §34.5 REC-CAR-019 — reúne el expediente probatorio de un inmueble a una fecha de '
  'corte: identificación, título ejecutivo, composición de deuda, cronología de gestión con '
  'el texto íntegro de cada envío y su acuse, promesas y acuerdos, trazabilidad de '
  'aprobaciones e intentos fallidos. No calcula nada nuevo. Reproducible: el mismo corte '
  'produce el mismo expediente_hash aunque después entren pagos y gestiones (PH-C44), '
  'porque todo se filtra por fecha propia <= corte y generado_at queda fuera del hash.';
