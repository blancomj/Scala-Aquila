-- ═══════════════════════════════════════════════════════════════════════
--  CAR §23.5 / bloque 16 · Bandeja de acciones de cobranza
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §23.5
--
--  La pantalla que faltaba para que lo construido en F4-F7 y §34 sea
--  usable: la cola de trabajo del administrador. Hoy `acciones_cobranza`
--  solo se toca invocando funciones a mano.
--
--  Por qué una función y no una consulta desde el frontend: cada fila
--  necesita su ESTADO PROBATORIO (§34.4), que se deriva del último acuse
--  de cada envío. Resolverlo desde el cliente serían dos consultas por
--  acción — N+1 sobre la pantalla que más filas muestra del módulo.
--  fn_panel_acciones_cartera (20260823140000) da los CONTEOS de las colas;
--  esta da las FILAS de la cola de cobranza, con la prueba ya resuelta.
--
--  security invoker: RLS decide qué ve cada quien. p_tenant_id no es un
--  permiso, es un filtro — un miembro de otro tenant no obtiene filas
--  aunque lo pase.
--
--  No expone `contenido_renderizado`: el texto íntegro de cada envío es
--  para el detalle y para el expediente, no para una lista de 100 filas.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_bandeja_cobranza(
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
  notas                 text
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
    -- El contacto congelado en la acción; si todavía no se despachó, el
    -- vigente del tercero, que es a dónde iría hoy.
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
    ac.notas
  from public.acciones_cobranza ac
  join public.inmuebles i on i.id = ac.inmueble_id
  join public.terceros te on te.id = ac.destinatario_tercero_id
  -- §34.4: la acreditación se deriva, nunca se lee de una columna.
  left join lateral public.fn_acreditacion_accion(p_tenant_id, ac.id) acr on true
  where ac.tenant_id = p_tenant_id
    and (p_estados is null or ac.estado = any(p_estados))
  -- Lo que espera aprobación primero, y dentro de cada grupo lo más
  -- vencido: la cola se lee de arriba abajo y arriba está lo urgente.
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
  'del detalle y del expediente.';
