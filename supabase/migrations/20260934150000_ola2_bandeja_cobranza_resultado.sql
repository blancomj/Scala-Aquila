-- ═══════════════════════════════════════════════════════════════════════
--  Ola 2 §4 (ENFOQUE_CONSOLIDACION) · verificación del resultado
--
--  acciones_cobranza.resultado (resultado_accion_cobranza_t: sin_respuesta,
--  contacto_efectivo, contacto_no_efectivo, promesa_de_pago,
--  acuerdo_solicitado, pago_recibido, rechazo_deudor, datos_incorrectos,
--  no_aplica) existe desde 20260822270000 y nunca la escribe nadie — ni
--  fn_bandeja_cobranza la devolvía, ni ningún store la actualiza. El
--  despacho (acciones_cobranza_envios/_acuses) responde "¿salió el
--  mensaje y llegó?"; `resultado` responde la pregunta distinta que el
--  prompt exige poder cerrar: "¿la gestión sirvió de algo?" — nunca se
--  afirma «se realizó» sin evidencia (§4), y sin este campo lo único
--  verificable era el envío, no la gestión.
--
--  No se reinterpreta nada del dominio (DI-04): la columna y su enum ya
--  existían, completos, desde F4. Solo se expone en la bandeja para que
--  la UI pueda mostrarla y ofrecer registrarla.
--
--  DROP + CREATE, no CREATE OR REPLACE: cambia RETURNS TABLE (columna
--  nueva al final, mismo criterio que 20260934130000/fn_mis_asuntos —
--  Postgres no permite CREATE OR REPLACE cuando cambian las columnas de
--  retorno).
-- ═══════════════════════════════════════════════════════════════════════

drop function if exists public.fn_bandeja_cobranza(uuid, public.estado_accion_cobranza_t[], int);

create function public.fn_bandeja_cobranza(
  p_tenant_id uuid,
  p_estados   public.estado_accion_cobranza_t[] default null,
  p_limite    int default 100
) returns table (
  accion_id             uuid,
  inmueble_id           uuid,
  inmueble_codigo       text,
  tipo_accion           public.tipo_accion_cobranza_t,
  canal                 public.canal_cobranza_t,
  estado                public.estado_accion_cobranza_t,
  fecha_programada      date,
  fecha_ejecucion       timestamptz,
  clasificacion_codigo  text,
  dias_mora             int,
  deuda_total           numeric,
  destinatario_id       uuid,
  destinatario_nombre   text,
  destinatario_contacto text,
  destinatario_rol      text,
  grupo_envio_id        uuid,
  creada_por            public.origen_accion_cobranza_t,
  propuesta_por         uuid,
  aprobada_por          uuid,
  aprobada_at           timestamptz,
  envios_total          int,
  ultimo_estado_acuse   public.estado_acuse_t,
  acreditada            boolean,
  notas                 text,
  resultado             public.resultado_accion_cobranza_t
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    ac.id,
    ac.inmueble_id,
    i.codigo,
    ac.tipo_accion,
    ac.canal,
    ac.estado,
    ac.fecha_programada,
    ac.fecha_ejecucion,
    ac.clasificacion_codigo,
    ac.dias_mora_al_momento,
    ac.deuda_total_al_momento,
    ac.destinatario_tercero_id,
    te.nombre_completo,
    coalesce(ac.destinatario_contacto, te.email, te.telefono),
    ac.destinatario_rol_codigo,
    ac.grupo_envio_id,
    ac.creada_por,
    ac.propuesta_por,
    ac.aprobada_por,
    ac.aprobada_at,
    coalesce(acr.envios_total, 0),
    acr.ultimo_estado,
    coalesce(acr.acreditada, false),
    ac.notas,
    ac.resultado
  from public.acciones_cobranza ac
  join public.inmuebles i on i.id = ac.inmueble_id
  join public.terceros te on te.id = ac.destinatario_tercero_id
  left join lateral public.fn_acreditacion_accion(p_tenant_id, ac.id) acr on true
  where ac.tenant_id = p_tenant_id
    and (p_estados is null or ac.estado = any(p_estados))
  order by
    case ac.estado
      when 'pendiente_aprobacion' then 0
      when 'aprobada' then 1
      when 'programada' then 2
      when 'fallida' then 3
      else 4
    end,
    ac.fecha_programada asc,
    ac.dias_mora_al_momento desc,
    ac.id
  limit least(coalesce(p_limite, 100), 500);
$$;

comment on function public.fn_bandeja_cobranza(uuid, public.estado_accion_cobranza_t[], int) is
  'CAR §23.5 — filas de la cola de cobranza con su estado probatorio ya derivado (§34.4), para '
  'la bandeja de acciones y aprobaciones. Ordena por urgencia: primero lo que espera aprobación, '
  'luego por fecha programada y días de mora. No devuelve el contenido de los envíos — eso es '
  'del detalle y del expediente. `resultado` (Ola 2 §4) es el desenlace de la gestión, distinto '
  'del estado de despacho: un envío puede acreditarse (llegó) sin que la gestión haya servido de '
  'nada (resultado null o sin_respuesta), o viceversa (el deudor llamó antes de que llegara el '
  'acuse del proveedor).';

grant execute on function public.fn_bandeja_cobranza(uuid, public.estado_accion_cobranza_t[], int) to authenticated;

-- ── quién puede registrar el resultado ──────────────────────────────────
-- Mismo rol mínimo que propone/despacha (agent), no el de aprobar
-- (administrador): registrar qué contestó el deudor es trabajo operativo
-- de gestión, no una decisión de alto impacto — la política ya distingue
-- estos dos niveles en guard_accion_cobranza_transicion (aprobar exige
-- administrador explícito; el resto de columnas mutables, agent basta,
-- vía la policy de UPDATE existente en acciones_cobranza_update_agent,
-- 20260822270000). No hace falta un guard nuevo: `resultado` no está en
-- la lista de columnas congeladas de guard_accion_cobranza_contexto_
-- inmutable (20260822280000) y guard_accion_cobranza_transicion solo
-- vigila cambios de `estado` — un UPDATE que solo toca `resultado` ya
-- pasaba limpio antes de esta migración. Se documenta aquí, no se
-- construye, porque no había nada que construir del lado de la base.
