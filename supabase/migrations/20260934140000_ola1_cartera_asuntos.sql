-- ═══════════════════════════════════════════════════════════════════════
--  OLA 1 · §2.4 — superficie: cartera llega a "Mis asuntos".
--
--  Sin pantalla nueva (prohibido explícitamente por el prompt) — se
--  agrega novena rama a fn_mis_asuntos, misma bandeja de siempre.
--
--  Deriva de fn_alertas_cartera(tenant, current_date) EN VIVO, no de
--  cartera_alerta_emitida (20260934110000): la regla #1 de esta función
--  es que el asunto desaparece cuando el trabajo se resuelve porque deja
--  de cumplir el `where`, no porque algo lo recuerde. cartera_alerta_
--  emitida es un log append-only de lo que se notificó cada día — nunca
--  "se resuelve", así que no sirve como fuente de un asunto vivo. Fuentes
--  distintas para propósitos distintos: notificar (evento pasado, el
--  log) vs. bandeja de trabajo (estado presente, la función).
--
--  Granularidad por TENANT, no por inmueble: fn_alertas_cartera agrega,
--  no lista; y cartera ya tiene sus propias pantallas (dashboard,
--  escalamiento) para el detalle por inmueble — no se duplica eso en la
--  bandeja general.
--
--  Cuatro condiciones, no cuatro llamadas: una sola llamada a
--  fn_alertas_cartera en un `with`, desempaquetada con una VALUES lateral
--  — evita repetir la consulta cuatro veces en la misma corrida.
--
--  origen_id = p_tenant_id: no hay una fila específica que sea "la
--  alerta" (es un agregado), así que se usa el tenant mismo como
--  identidad del origen — no se inventa una tabla para tener un id que
--  apuntar.
--
--  created_at = now(): no hay una fecha real de "cuándo empezó" sin
--  persistir algo (que el prompt prohíbe salvo necesidad probada, DI-05).
--  Limitación conocida y documentada, no un descuido: estas filas
--  siempre ordenan al final de su grupo sin vencimiento (`order by 10
--  nulls last, 9 asc` de la función), nunca "más antiguas" que un
--  anuncio o solicitud real.
--
--  Reutiliza los mismos 4 códigos de TIPO_ALERTA_CARTERA (20260934100000)
--  como códigos de TIPO_SITUACION — misma condición real, dos catálogos
--  con propósitos distintos (uno clasifica notificaciones, el otro
--  asuntos), sin colisión posible: la unicidad de lista_tipos es
--  (tipo, codigo, tenant_id).
--
--  DROP + CREATE otra vez, mismo motivo que 20260934130000: Postgres no
--  permite tocar las columnas de RETURNS TABLE con REPLACE. Esta vez no
--  cambian las columnas — solo se agrega una novena rama al `union all` —
--  pero el cuerpo entero de la función se reescribe con REPLACE de forma
--  segura porque el `returns table` no cambia frente a 20260934130000.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_mis_asuntos(
  p_tenant_id         uuid,
  p_dias_anticipacion integer default 15
)
returns table (
  origen_modulo  text,
  origen_entidad text,
  origen_id      uuid,
  titulo         text,
  resumen        text,
  estado         text,
  accion         text,
  enlace         text,
  created_at     timestamptz,
  vence_at       timestamptz,
  asignado_a     uuid,
  tipo           text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_es_admin boolean;
  v_es_aux   boolean;
  v_limite   date := current_date + make_interval(days => greatest(p_dias_anticipacion, 0));
begin
  if not public.is_member(p_tenant_id) then
    raise exception 'ASUNTOS_NO_DISPONIBLES: no hay bandeja para esta copropiedad';
  end if;

  v_es_admin := public.has_role(p_tenant_id, array['administrador']::public.tenant_role_t[]);
  v_es_aux   := public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]);

  return query

  -- ── Anuncios esperando aprobación ────────────────────────────────────
  -- Solo administrador: guard_anuncio_transicion no deja aprobar a nadie más.
  select
    'anuncios', 'anuncio', a.id,
    a.titulo,
    'Redactado y esperando aprobación',
    a.estado::text,
    'Revisar',
    '/anuncios/' || a.id::text,
    a.created_at,
    null::timestamptz,
    null::uuid,
    'anuncio_pendiente_aprobacion'
  from public.anuncios a
  where a.tenant_id = p_tenant_id
    and a.estado = 'pendiente_revision'
    and v_es_admin
    and public.puede_ver_modulo(p_tenant_id, 'anuncios')

  union all

  -- ── Publicaciones esperando aprobación ───────────────────────────────
  -- La escalera de EXS-6, tal cual: lo que originó un residente lo aprueba
  -- cualquiera del equipo; lo de un auxiliar, solo un administrador. Así la
  -- bandeja de un auxiliar no se llena de cosas que no puede aprobar.
  select
    'marketplace', 'publicacion', p.id,
    p.titulo,
    'Aviso esperando aprobación · ' || p.identidad_publica,
    p.estado::text,
    'Aprobar',
    '/marketplace?publicacion=' || p.id::text,
    p.created_at,
    null::timestamptz,
    null::uuid,
    'publicacion_pendiente_aprobacion'
  from public.publicaciones p
  where p.tenant_id = p_tenant_id
    and p.estado = 'pendiente_aprobacion'
    and (
      case when p.origen = 'residente' then (v_es_admin or v_es_aux)
           else v_es_admin
      end
    )
    and public.puede_ver_modulo(p_tenant_id, 'marketplace')

  union all

  -- ── Interesados sin atender ──────────────────────────────────────────
  -- El interés es el único canal de contacto del marketplace (EXS-6 §15):
  -- si nadie lo atiende, las dos partes se quedan esperando.
  select
    'marketplace', 'publicacion_interes', i.id,
    coalesce(i.interesado_nombre, 'Alguien') || ' preguntó por «' || p.titulo || '»',
    coalesce(i.mensaje, 'Sin mensaje'),
    'sin_atender',
    'Poner en contacto',
    '/marketplace?publicacion=' || p.id::text,
    i.created_at,
    null::timestamptz,
    null::uuid,
    'publicacion_interes_sin_atender'
  from public.publicacion_interes i
  join public.publicaciones p on p.id = i.publicacion_id
  where i.tenant_id = p_tenant_id
    and not i.atendido
    and (v_es_admin or v_es_aux)
    and public.puede_ver_modulo(p_tenant_id, 'marketplace')

  union all

  -- ── Reportes sin resolver ────────────────────────────────────────────
  -- Solo administrador: resolver un reporte es un acto de moderación.
  select
    'marketplace', 'publicacion_reporte', r.id,
    'Reporte sobre «' || p.titulo || '»',
    lt.nombre || coalesce(' · ' || r.descripcion, ''),
    'sin_resolver',
    'Moderar',
    '/marketplace?publicacion=' || p.id::text,
    r.created_at,
    null::timestamptz,
    null::uuid,
    'publicacion_reporte_sin_resolver'
  from public.publicacion_reporte r
  join public.publicaciones p on p.id = r.publicacion_id
  join public.lista_tipos lt on lt.id = r.motivo_id
  where r.tenant_id = p_tenant_id
    and not r.resuelto
    and v_es_admin
    and public.puede_ver_modulo(p_tenant_id, 'marketplace')

  union all

  -- ── Permisos vehiculares por vencer ──────────────────────────────────
  -- Renovarlos exige administrador. Se incluyen los ya vencidos: un permiso
  -- caducado hace tres días sigue siendo trabajo por hacer, y ordenado por
  -- fecha aparece el primero.
  select
    'movilidad', 'vehiculo_permiso', vp.id,
    'Permiso de ' || v.placa || ' vence el ' || to_char(vp.vigente_hasta, 'DD/MM/YYYY'),
    lt.nombre || ' · ' || coalesce(v.marca || ' ' || v.modelo, v.placa),
    vp.estado::text,
    'Renovar',
    '/movilidad?vehiculo=' || v.id::text,
    vp.created_at,
    vp.vigente_hasta::timestamptz,
    null::uuid,
    'vehiculo_permiso_por_vencer'
  from public.vehiculo_permiso vp
  join public.vehiculos v on v.id = vp.vehiculo_id
  join public.lista_tipos lt on lt.id = vp.tipo_id
  where vp.tenant_id = p_tenant_id
    and vp.estado = 'vigente'
    and vp.vigente_hasta is not null
    and vp.vigente_hasta <= v_limite
    and v.estado <> 'retirado'
    and v_es_admin
    and public.puede_ver_modulo(p_tenant_id, 'movilidad')

  union all

  -- ── Publicaciones por expirar ────────────────────────────────────────
  -- Aviso ANTES de que el barrido las saque del tablón, para que a quien
  -- publicó le dé tiempo de renovar o cerrar.
  select
    'marketplace', 'publicacion', p.id,
    '«' || p.titulo || '» sale del tablón el ' || to_char(p.vigente_hasta, 'DD/MM/YYYY'),
    'Renovar la vigencia o cerrar el aviso',
    p.estado::text,
    'Renovar o cerrar',
    '/marketplace?publicacion=' || p.id::text,
    p.created_at,
    p.vigente_hasta::timestamptz,
    null::uuid,
    'publicacion_por_expirar'
  from public.publicaciones p
  where p.tenant_id = p_tenant_id
    and p.estado = 'publicada'
    and p.vigente_hasta is not null
    and p.vigente_hasta <= v_limite
    and (v_es_admin or v_es_aux)
    and public.puede_ver_modulo(p_tenant_id, 'marketplace')

  union all

  -- ── Solicitudes de Atención sin cerrar ───────────────────────────────
  -- `solicitudes` no se rige por puede_ver_modulo: su policy es is_member a
  -- secas (GOB-8), así que aquí tampoco se inventa un gate que la tabla no
  -- tiene. `sla_vence_at` entra como fecha límite: es la única fuente del
  -- corte que ya traía su propio reloj.
  --
  -- La ÚNICA rama con dueño: GOB-8 asigna la solicitud a una persona.
  select
    'atencion', 'solicitud', s.id,
    s.asunto,
    'Solicitud ' || s.anio::text || '-' || lpad(s.numero::text, 4, '0'),
    s.estado::text,
    'Atender',
    '/atencion/' || s.id::text,
    s.created_at,
    s.sla_vence_at,
    s.asignado_a,
    'solicitud_atencion_sin_cerrar'
  from public.solicitudes s
  where s.tenant_id = p_tenant_id
    and s.estado in ('nueva', 'asignada', 'en_atencion', 'en_espera')

  union all

  -- ── Visitantes que excedieron su tiempo ──────────────────────────────
  -- Solo aparece si la copropiedad definió un límite: sin
  -- horas_max_visitante, fn_movilidad_dentro nunca marca excedido.
  --
  -- El origen_id es el paso de ENTRADA, que es el hecho registrado; el
  -- lateral lo recupera porque fn_movilidad_dentro devuelve el momento,
  -- no el id de la fila.
  select
    'movilidad', 'vehiculo_paso', vp.id,
    'El visitante ' || d.placa || ' lleva ' || d.horas_dentro::text || ' horas dentro',
    'Superó el límite de permanencia de visitantes',
    'excedido',
    'Revisar',
    '/movilidad?tab=bitacora&placa=' || d.placa,
    d.desde,
    d.desde,
    null::uuid,
    'visitante_tiempo_excedido'
  from public.fn_movilidad_dentro(p_tenant_id) d
  join lateral (
    select p.id from public.vehiculo_paso p
     where p.tenant_id = p_tenant_id
       and p.placa_normalizada = public.fn_normalizar_placa(d.placa)
       and p.momento = d.desde
     limit 1
  ) vp on true
  where d.excedido
    and (v_es_admin or v_es_aux)
    and public.puede_ver_modulo(p_tenant_id, 'movilidad')

  union all

  -- ── Cartera: condiciones vigentes (Ola 1 §2.4, 20260934140000) ───────
  -- Derivado EN VIVO de fn_alertas_cartera — no del log de notificaciones
  -- (cartera_alerta_emitida), que nunca "se resuelve" por sí solo. Una
  -- sola llamada a la función, desempaquetada en hasta 4 filas.
  select
    'cartera', 'alerta_cartera', p_tenant_id,
    cond.etiqueta || ' (' || cond.cantidad::text || ')',
    'Monto total: $' || trim(to_char(cond.monto, 'FM999G999G999G990')),
    'activa',
    'Revisar',
    '/cartera',
    now(),
    null::timestamptz,
    null::uuid,
    cond.tipo_codigo
  from (select * from public.fn_alertas_cartera(p_tenant_id, current_date)) fa
  cross join lateral (
    values
      ('obligaciones_mayor_90', fa.obligaciones_mayor_90_cantidad, fa.obligaciones_mayor_90_monto,
       'Obligaciones con mora mayor a 90 días'),
      ('promesas_por_vencer', fa.promesas_por_vencer_cantidad, fa.promesas_por_vencer_monto,
       'Promesas de pago próximas a vencer'),
      ('cuotas_acuerdo_vencidas', fa.cuotas_acuerdo_vencidas_cantidad, fa.cuotas_acuerdo_vencidas_monto,
       'Cuotas de acuerdo de pago vencidas'),
      ('obligaciones_sin_vencimiento', fa.obligaciones_sin_vencimiento_cantidad,
       fa.obligaciones_sin_vencimiento_monto, 'Obligaciones sin fecha de vencimiento efectiva')
  ) as cond(tipo_codigo, cantidad, monto, etiqueta)
  where cond.cantidad > 0
    and (v_es_admin or v_es_aux)
    and public.puede_ver_modulo(p_tenant_id, 'cartera_cobranza')

  -- Lo que tiene fecha va primero, y antes lo que vence antes: es el orden
  -- en que conviene atenderlo. Lo que no tiene plazo se ordena por
  -- antigüedad, para que lo que lleva más tiempo parado no quede sepultado.
  -- Las posiciones siguen siendo 10 y 9: `asignado_a` y `tipo` se
  -- añadieron al final justamente para no tocar este orden.
  order by 10 asc nulls last, 9 asc;
end;
$$;

comment on function public.fn_mis_asuntos is
  'EXS-7 — bandeja de trabajo del miembro. AGREGACIÓN pura: no existe tabla `mis_asuntos` ni '
  'triggers que la sincronicen (prompt 06 §11). El asunto se deriva del estado vivo de cada '
  'dominio, así que resolver el trabajo lo saca de la bandeja por sí solo. NO lee `notificaciones`: '
  'asunto y notificación son cosas distintas (§13) — leer un aviso no es haber hecho el trabajo. '
  'Cada rama filtra por quien puede ACTUAR, no por quien puede mirar: un anuncio pendiente no es '
  'asunto de un auxiliar que no puede aprobarlo. `tipo` (Ola 1 §2.1/§2.3, 20260934130000): código '
  'de lista_tipos familia TIPO_SITUACION, uno por rama. Novena rama, cartera (Ola 1 §2.4, '
  '20260934140000): deriva en vivo de fn_alertas_cartera, no de cartera_alerta_emitida — esa '
  'tabla es un log de notificaciones ya emitidas, nunca "se resuelve" y por eso no sirve como '
  'fuente de un asunto vivo.';

revoke execute on function public.fn_mis_asuntos(uuid, integer) from public, anon;
grant execute on function public.fn_mis_asuntos(uuid, integer) to authenticated, service_role;

-- ── TIPO_SITUACION: mismos 4 códigos de TIPO_ALERTA_CARTERA, otra familia ──

insert into public.lista_tipos (tipo, codigo, nombre, descripcion, orden) values
  ('TIPO_SITUACION', 'obligaciones_mayor_90', 'Obligaciones con mora mayor a 90 días',
   'Deriva en vivo de fn_alertas_cartera — desaparece de la bandeja en cuanto la cartera se '
   'pone al día, sin necesidad de que nadie la marque resuelta.', 90),
  ('TIPO_SITUACION', 'promesas_por_vencer', 'Promesas de pago próximas a vencer',
   'Deriva en vivo de fn_alertas_cartera.', 100),
  ('TIPO_SITUACION', 'cuotas_acuerdo_vencidas', 'Cuotas de acuerdo de pago vencidas',
   'Deriva en vivo de fn_alertas_cartera.', 110),
  ('TIPO_SITUACION', 'obligaciones_sin_vencimiento', 'Obligaciones sin fecha de vencimiento efectiva',
   'Deriva en vivo de fn_alertas_cartera (GAP-CAR-001).', 120);
