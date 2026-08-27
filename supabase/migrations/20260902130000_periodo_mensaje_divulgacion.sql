-- ═══════════════════════════════════════════════════════════════════════
--  Mensaje de divulgación por periodo (petición del usuario, 2026-08-27).
--
--  Antes de liquidar, el Auxiliar/Administrador puede escribir un mensaje
--  (aviso de asamblea, cambio de tarifa, recordatorio, etc.) que llega a
--  TODOS los destinatarios en su estado de cuenta de ese periodo. Vive en
--  `periodos` — no en `liquidaciones` — porque es del PERIODO, no de un
--  intento de liquidación puntual: sigue siendo el mismo mensaje aunque la
--  Pre-Liquidación se recalcule varias veces antes de aplicarse (mismo
--  criterio que `fecha_vencimiento`, columna ya existente en periodos con
--  el mismo ciclo de vida).
--
--  Se escribe directo por RLS (`periodos_update_agent`, ya existe desde
--  20260814100200) — sin Edge Function, igual que `crearPeriodo` en
--  liquidacion.ts. guard_periodo_transicion no lo toca: solo reacciona
--  cuando `estado` cambia (`if new.estado = old.estado then return new`),
--  así que actualizar este campo solo nunca dispara su lógica.
--
--  fn_emitir_estados_cuenta lo copia al jsonb de cada estado de cuenta —
--  mismo criterio que periodo_fecha_limite_pago (20260902120000): solo lo
--  llena el emisor por lote (nace de una liquidación con periodo concreto),
--  la ruta manual "a hoy" no lo incluye.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.periodos
  add column mensaje_divulgacion text;

comment on column public.periodos.mensaje_divulgacion is
  'Aviso opcional de la administración que se incluye en el estado de cuenta de TODAS las unidades '
  'cuando se liquide este periodo (20260902130000). Editable mientras el periodo esté "abierto" — '
  'una vez aplicada la liquidación, los documentos ya emitidos quedan sellados con el mensaje que '
  'tenían en ese momento.';

create or replace function public.fn_emitir_estados_cuenta(p_liquidacion_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_liq       public.liquidaciones%rowtype;
  v_tenant    public.tenants%rowtype;
  v_periodo   public.periodos%rowtype;
  v_inicio    date;
  v_fin       date;
  v_canales   jsonb;
  v_emitidos  int;
begin
  select * into v_liq from public.liquidaciones where id = p_liquidacion_id;
  if v_liq.id is null then
    raise exception 'LIQUIDACION_NO_ENCONTRADA: no existe la liquidación %', p_liquidacion_id;
  end if;

  select * into v_tenant from public.tenants where id = v_liq.tenant_id;
  select * into v_periodo from public.periodos where id = v_liq.periodo_id;

  -- periodos no tiene fecha_inicio/fecha_fin propias — es un mes calendario
  -- (anio, mes), así que los límites se derivan.
  v_inicio := make_date(v_periodo.anio, v_periodo.mes, 1);
  v_fin := (v_inicio + interval '1 month' - interval '1 day')::date;

  -- cuentas_bancarias.banco (texto) se reemplazó por entidad_financiera_id
  -- (FK a lista_tipos, catálogo ENTIDAD_FINANCIERA) en 20260822170000 — el
  -- nombre del banco/billetera sale de ahí, no de una columna propia.
  select coalesce(jsonb_agg(jsonb_build_object(
           'banco',         lt.nombre,
           'tipo_cuenta',   cb.tipo_cuenta,
           'numero_cuenta', cb.numero_cuenta
         ) order by lt.nombre), '[]'::jsonb)
    into v_canales
  from public.cuentas_bancarias cb
  join public.lista_tipos lt on lt.id = cb.entidad_financiera_id
  where cb.tenant_id = v_liq.tenant_id and cb.es_recaudo and cb.activa;

  -- Idempotencia: reemitir sustituye lo anterior de ESTA liquidación en vez
  -- de acumular duplicados. Los estados generados a mano (liquidacion_id
  -- null) no se tocan.
  delete from public.estados_cuenta_generados
   where liquidacion_id = p_liquidacion_id;

  with propietarios as (
    -- Mismo criterio que cuentaCorriente.ts::cargarPropietarios: rol
    -- 'copropietario' vigente (vigente_hasta null). Con varios copropietarios
    -- el nombre se concatena, pero el documento queda sin mostrar — no hay
    -- "el documento del inmueble" cuando hay más de un dueño.
    select ipr.inmueble_id,
           string_agg(distinct t.nombre_completo, ', ' order by t.nombre_completo) as nombres,
           count(distinct t.id) as num_propietarios,
           min(t.numero_documento) as documento_unico
    from public.inmueble_persona_rol ipr
    join public.terceros t on t.id = ipr.tercero_id
    join public.lista_tipos lt on lt.id = ipr.rol_id
    where ipr.tenant_id = v_liq.tenant_id
      and ipr.vigente_hasta is null
      and lt.codigo = 'copropietario'
    group by ipr.inmueble_id
  ),
  coeficiente_vigente as (
    select co.inmueble_id, co.valor
    from public.coeficientes co
    join public.coeficiente_sets cs on cs.id = co.set_id
    where cs.tenant_id = v_liq.tenant_id and cs.estado = 'vigente'
  ),
  saldo_previo as (
    -- Balance de TODO lo anterior al inicio del periodo — se convierte en el
    -- "saldo anterior" que arrastra el documento.
    select i.id as inmueble_id,
           coalesce(sum(case when x.es_cargo then x.monto else -x.monto end), 0) as saldo
    from public.inmuebles i
    left join (
      select c.inmueble_id, c.monto_original as monto, true as es_cargo
      from public.cargos c
      where c.tenant_id = v_liq.tenant_id and c.created_at::date < v_inicio
      union all
      select p.inmueble_id, p.monto, false
      from public.pagos p
      where p.tenant_id = v_liq.tenant_id and p.fecha_pago < v_inicio
    ) x on x.inmueble_id = i.id
    where i.tenant_id = v_liq.tenant_id and i.estado = 'activo'
    group by i.id
  ),
  eventos as (
    -- Solo movimientos DENTRO del periodo — antes traía todo el historial.
    -- Cargos: por periodo_id (vínculo directo y confiable). Pagos: no tienen
    -- periodo_id, se acotan por fecha_pago dentro del mes calendario.
    select c.inmueble_id,
           to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as fecha,
           case c.categoria
             when 'capital' then 'Capital'
             when 'interes' then 'Interés'
             else 'Otro'
           end as descripcion,
           null::text as documento,
           c.monto_original as monto,
           true as es_cargo
    from public.cargos c
    where c.tenant_id = v_liq.tenant_id and c.periodo_id = v_liq.periodo_id

    union all

    select p.inmueble_id,
           p.fecha_pago::text as fecha,
           case when p.referencia is not null and btrim(p.referencia) <> ''
                then 'Pago — ' || p.referencia
                else 'Pago' end as descripcion,
           p.referencia as documento,
           p.monto,
           false
    from public.pagos p
    where p.tenant_id = v_liq.tenant_id
      and p.fecha_pago between v_inicio and v_fin
  ),
  con_saldo as (
    select e.*,
           sp.saldo + sum(case when e.es_cargo then e.monto else -e.monto end)
             over (partition by e.inmueble_id order by e.fecha, e.es_cargo desc, e.descripcion
                   rows between unbounded preceding and current row) as saldo
    from eventos e
    join saldo_previo sp on sp.inmueble_id = e.inmueble_id
  ),
  por_inmueble as (
    select i.id as inmueble_id,
           i.codigo,
           coalesce(sp.saldo, 0) as saldo_anterior,
           coalesce(
             jsonb_agg(jsonb_build_object(
               'fecha',       cs.fecha,
               'descripcion', cs.descripcion,
               'documento',   cs.documento,
               'cargo',       case when cs.es_cargo then cs.monto else null end,
               'abono',       case when cs.es_cargo then null else cs.monto end,
               'saldo',       cs.saldo
             ) order by cs.fecha, cs.es_cargo desc, cs.descripcion)
             filter (where cs.inmueble_id is not null),
             '[]'::jsonb
           ) as movimientos,
           -- Sin movimiento este periodo: el saldo final es el anterior, tal
           -- cual — una unidad al día también recibe su estado de cuenta.
           coalesce(max(cs.saldo) filter (
             where cs.fecha = (select max(cs2.fecha) from con_saldo cs2
                               where cs2.inmueble_id = i.id)
           ), sp.saldo, 0) as saldo_final,
           pr.nombres as propietario_nombre,
           case when pr.num_propietarios = 1 and pr.documento_unico is not null
             then case when length(pr.documento_unico) > 4
               then '****' || right(pr.documento_unico, 4)
               else '****' || pr.documento_unico
             end
             else null
           end as propietario_documento_enmascarado,
           cv.valor as coeficiente
    from public.inmuebles i
    left join con_saldo cs on cs.inmueble_id = i.id
    left join saldo_previo sp on sp.inmueble_id = i.id
    left join propietarios pr on pr.inmueble_id = i.id
    left join coeficiente_vigente cv on cv.inmueble_id = i.id
    where i.tenant_id = v_liq.tenant_id and i.estado = 'activo'
    group by i.id, i.codigo, sp.saldo, pr.nombres, pr.num_propietarios, pr.documento_unico, cv.valor
  )
  insert into public.estados_cuenta_generados (
    tenant_id, inmueble_id, liquidacion_id, periodo_id, generado_por, datos
  )
  select v_liq.tenant_id, pi.inmueble_id, p_liquidacion_id, v_liq.periodo_id,
         (select auth.uid()),
         jsonb_build_object(
           -- La columna es `name` (esquema en inglés de la Fase I); la CLAVE del
           -- JSON sí va en español porque así la lee /comprobante-cuenta/[id].
           'tenant_nombre',    v_tenant.name,
           'tenant_nit',       v_tenant.nit,
           'tenant_direccion', v_tenant.direccion,
           'tenant_ciudad',    v_tenant.ciudad,
           'tenant_telefono',  v_tenant.telefono_1,
           'tenant_email',     v_tenant.email,
           'canales_pago',     v_canales,
           'inmueble_codigo',      pi.codigo,
           'inmueble_coeficiente', pi.coeficiente,
           'propietario_nombre',                pi.propietario_nombre,
           'propietario_documento_enmascarado', pi.propietario_documento_enmascarado,
           'periodo_inicio',            to_char(v_inicio, 'YYYY-MM-DD'),
           'periodo_fin',               to_char(v_fin, 'YYYY-MM-DD'),
           'periodo_fecha_limite_pago', to_char(v_periodo.fecha_vencimiento, 'YYYY-MM-DD'),
           'mensaje_divulgacion',       v_periodo.mensaje_divulgacion,
           'saldo_anterior',   pi.saldo_anterior,
           'movimientos',      pi.movimientos,
           'saldo_final',      pi.saldo_final,
           'generado_en',      to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
         )
  from por_inmueble pi;

  get diagnostics v_emitidos = row_count;
  return v_emitidos;
end;
$$;

comment on function public.fn_emitir_estados_cuenta(uuid) is
  'Emite el estado de cuenta de todas las unidades activas del tenant (L5), acotado al periodo de '
  'la liquidación con saldo_anterior explícito, más mensaje_divulgacion del periodo (20260902130000) '
  'y el resto del enriquecimiento de 20260902120000 (contacto, coeficiente, canales de pago, '
  'propietario). Idempotente: reemitir reemplaza los de esa misma liquidación, y nunca toca los '
  'generados a mano.';
