-- ═══════════════════════════════════════════════════════════════════════
--  acciones_cobranza.grupo_envio_id — hermanas de un mismo disparo
--
--  Decisión del propietario del producto (2026-08-28, CAR §34 / R2): con
--  varios copropietarios se notifica a TODOS los vigentes, uno por uno,
--  porque cada uno responde por la deuda (solidaridad, art. 29 L675) y
--  cada uno necesita su PROPIA evidencia acreditada.
--
--  Se resolvió creando una acción por destinatario en vez de una tabla
--  hija de destinatarios: así cada fila conserva su acuse, su contenido y
--  su estado por separado — que es lo que sirve en juicio. grupo_envio_id
--  las vuelve a unir para la interfaz y para los indicadores, sin
--  fusionar la evidencia.
--
--  Nullable a propósito: las acciones creadas antes de esta migración, y
--  las que se crean de a una desde la interfaz, no pertenecen a ningún
--  grupo. No se hace backfill inventando grupos que nunca existieron.
--
--  Sin FK ni tabla de grupos: el id lo genera quien crea el lote y solo
--  sirve para agrupar. Una tabla `grupos_envio` sin más columnas que su
--  propio id sería una tabla vacía de significado.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.acciones_cobranza add column grupo_envio_id uuid;

comment on column public.acciones_cobranza.grupo_envio_id is
  'Une las acciones hermanas creadas por un mismo disparo del job cuando el inmueble '
  'tiene varios destinatarios (CAR §34, R2 de resolverDestinatarios). NULL = acción '
  'suelta. Cada hermana conserva evidencia propia: agrupar es de presentación, no de prueba.';

create index acciones_cobranza_grupo_envio_idx
  on public.acciones_cobranza (tenant_id, grupo_envio_id)
  where grupo_envio_id is not null;

-- El grupo es parte de la identidad de la acción, igual que el
-- destinatario: reasignar una acción a otro grupo reescribiría a
-- posteriori a quién más se notificó ese día. Se congela con el resto
-- del contexto (CAR §10.3, REC-CAR-012).
create or replace function public.guard_accion_cobranza_contexto_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.clasificacion_codigo is distinct from old.clasificacion_codigo
     or new.politica_clasificacion_id is distinct from old.politica_clasificacion_id
     or new.politica_version is distinct from old.politica_version
     or new.dias_mora_al_momento is distinct from old.dias_mora_al_momento
     or new.deuda_total_al_momento is distinct from old.deuda_total_al_momento
     or new.tenant_id is distinct from old.tenant_id
     or new.inmueble_id is distinct from old.inmueble_id
     or new.tipo_accion is distinct from old.tipo_accion
     or new.fecha_programada is distinct from old.fecha_programada
     or new.alcance is distinct from old.alcance
     or new.cargo_id is distinct from old.cargo_id
     or new.destinatario_tercero_id is distinct from old.destinatario_tercero_id
     or new.destinatario_rol_codigo is distinct from old.destinatario_rol_codigo
     or new.grupo_envio_id is distinct from old.grupo_envio_id
     or new.creada_por is distinct from old.creada_por
  then
    raise exception 'ACCION_COBRANZA_CONTEXTO_INMUTABLE: la acción % no admite modificar su '
      'contexto congelado — solo estado/resultado/ejecución (CAR §10.3 REC-CAR-012)', old.id;
  end if;
  return new;
end;
$$;
