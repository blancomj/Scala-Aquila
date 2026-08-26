-- ═══════════════════════════════════════════════════════════════════════
--  S1 (auditoría externa 2026-08-26, Docs/evaluacion/02) —
--  fn_aprobar_novedad no era idempotente: cargo duplicado en doble
--  aprobación concurrente
--
--  Verificado empíricamente antes de tocar nada (dos llamadas concurrentes
--  reales a la RPC, no solo lectura de código): las dos tienen éxito y se
--  crean DOS cargos. La razón exacta no es la que parecía a simple vista —
--  guard_novedad_transicion (20260816110000) sí existe y sí valida
--  transiciones, pero tiene un atajo explícito para no-ops:
--  `if new.estado = old.estado then return new`. La segunda llamada,
--  después de que la primera ya comprometió estado='aprobada', hace
--  exactamente ese "cambio" de aprobada→aprobada — el guard lo deja pasar
--  sin excepción, y fn_aprobar_novedad inserta un segundo cargo sin
--  volver a comprobar nada.
--
--  Fix: el propio UPDATE exige estado='pendiente' en el WHERE — bajo
--  concurrencia real, Postgres serializa ambas transacciones sobre el
--  lock de fila; cuando la segunda por fin corre, la fila ya no cumple el
--  WHERE (columna ya en 'aprobada') y el UPDATE afecta cero filas. `FOUND`
--  (variable implícita de plpgsql, true si el último UPDATE/DELETE/INSERT
--  afectó al menos una fila) lo detecta sin variables ni GET DIAGNOSTICS
--  aparte. No depende de guard_novedad_transicion en absoluto — es un
--  segundo cinturón, correcto incluso si el guard cambia en el futuro.
--
--  Mismo criterio aplicado a fn_rechazar_novedad: sin el guard de estado,
--  una segunda invocación no duplica un cargo (no inserta ninguno), pero
--  sí sobrescribe `rejected_reason` en silencio — corregido por
--  consistencia, no por severidad financiera.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_aprobar_novedad(p_novedad_id uuid, p_actor_id uuid)
returns public.novedades
language plpgsql
set search_path = ''
as $$
declare
  v_novedad public.novedades;
  v_anio int;
  v_mes int;
  v_periodo_id uuid;
  v_monto_base numeric(18, 2);
  i int;
begin
  select * into v_novedad from public.novedades where id = p_novedad_id;
  if v_novedad.id is null then
    raise exception 'NOVEDAD_NO_ENCONTRADA: % no existe', p_novedad_id;
  end if;

  v_anio := extract(year from v_novedad.fecha_efectiva);
  v_mes := extract(month from v_novedad.fecha_efectiva);

  select id into v_periodo_id
    from public.periodos
   where tenant_id = v_novedad.tenant_id and anio = v_anio and mes = v_mes;
  if v_periodo_id is null then
    raise exception 'PERIODO_NO_ENCONTRADO_PARA_FECHA_EFECTIVA: no existe periodo %-% para el '
      'tenant % (novedad %)', v_anio, v_mes, v_novedad.tenant_id, p_novedad_id;
  end if;

  update public.novedades
     set estado = 'aprobada', approved_by = p_actor_id, approved_at = now()
   where id = p_novedad_id and estado = 'pendiente'
  returning * into v_novedad;

  if not found then
    raise exception 'NOVEDAD_NO_PENDIENTE: % ya no está pendiente — aprobación duplicada o '
      'carrera con otra transición', p_novedad_id;
  end if;

  if v_novedad.permanente or v_novedad.prorrateable then
    -- Ninguna: el cargo (o los cargos) los genera fn_generar_cargos_novedades_periodo,
    -- periodo a periodo — no aquí, para no duplicar con esa función.
    if v_novedad.prorrateable then
      v_monto_base := round(v_novedad.monto / v_novedad.cuotas_totales, 2);
      for i in 1 .. (v_novedad.cuotas_totales - 1) loop
        insert into public.novedad_cuotas (tenant_id, novedad_id, numero_cuota, monto_cuota)
        values (v_novedad.tenant_id, v_novedad.id, i, v_monto_base);
      end loop;
      -- La última cuota absorbe el residual del redondeo — la suma de
      -- cuotas siempre reconcilia exacto con el monto total (mismo
      -- principio que allocate()/mayor_resto, aplicado a mano aquí porque
      -- allocate() vive en TypeScript, no en plpgsql).
      insert into public.novedad_cuotas (tenant_id, novedad_id, numero_cuota, monto_cuota)
      values (
        v_novedad.tenant_id, v_novedad.id, v_novedad.cuotas_totales,
        v_novedad.monto - v_monto_base * (v_novedad.cuotas_totales - 1)
      );
    end if;
  else
    -- AD-33: el cargo hereda el signo de novedades.monto (AD-30) — un
    -- DISCOUNT/CREDIT/REFUND negativo reduce el saldo del inmueble sin pasar
    -- por pago_aplicaciones (imputarPago() ya ignora cargos con
    -- montoPendiente <= 0, packages/liquidation-engine/src/cuenta-corriente.ts).
    insert into public.cargos (
      tenant_id, inmueble_id, periodo_id, categoria, origen_tipo, novedad_id, concepto_id, monto_original
    ) values (
      v_novedad.tenant_id, v_novedad.inmueble_id, v_periodo_id, 'otro', 'novedad', v_novedad.id,
      v_novedad.concepto_id, v_novedad.monto
    );
  end if;

  return v_novedad;
end;
$$;

create or replace function public.fn_rechazar_novedad(p_novedad_id uuid, p_motivo text)
returns public.novedades
language plpgsql
set search_path = ''
as $$
declare
  v_novedad public.novedades;
begin
  update public.novedades
     set estado = 'rechazada', rejected_reason = p_motivo
   where id = p_novedad_id and estado = 'pendiente'
  returning * into v_novedad;

  if not found then
    if exists (select 1 from public.novedades where id = p_novedad_id) then
      raise exception 'NOVEDAD_NO_PENDIENTE: % ya no está pendiente', p_novedad_id;
    end if;
    raise exception 'NOVEDAD_NO_ENCONTRADA: % no existe', p_novedad_id;
  end if;

  return v_novedad;
end;
$$;

comment on function public.fn_aprobar_novedad(uuid, uuid) is
  'Aprueba una novedad pendiente y materializa su efecto financiero (AD-33). El UPDATE exige '
  'estado=''pendiente'' en el WHERE (S1, auditoría 2026-08-26): bajo doble invocación '
  'concurrente, la segunda encuentra 0 filas y falla con NOVEDAD_NO_PENDIENTE en vez de '
  'duplicar el cargo.';
