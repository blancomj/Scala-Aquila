-- ═══════════════════════════════════════════════════════════════════════
--  Builder de roles funcionales — habilita crear/editar roles y sus
--  módulos sin migración (PROMPT_PERMISOS_CAPA2.md §A3), y corrige la
--  prosa de tenant_role_t (§B1, decisión del usuario: auxiliar SÍ
--  administra, el código está bien — lo que estaba mal era el comentario).
--
--  ── Por qué se ALTERA la policy existente, en vez de sumar una nueva ──
--  lista_tipos_insert/update/delete_agent (20260814160000) ya permiten a
--  cualquier auxiliar escribir CUALQUIER fila de su tenant en lista_tipos
--  (es el catálogo tenant-extensible: TIPO_INMUEBLE, TIPO_ZONA_COMUN...).
--  Las políticas RLS del mismo comando se combinan con OR: agregar una
--  policy nueva y más estricta para ROL_FUNCIONAL no restringe nada,
--  porque la vieja (sin filtro de `tipo`) la sigue permitiendo. Sin este
--  ALTER, cualquier auxiliar puede hoy insertar una fila tenant_id propio
--  con tipo='ROL_FUNCIONAL' directamente contra PostgREST — no otorga
--  módulos por sí sola (rol_funcional_modulo no tenía policy de escritura
--  hasta esta migración), pero es ruido de catálogo que nadie pidió.
--  Administrar roles es administrar (mismo criterio del prompt): se
--  estrecha la policy existente para que, específicamente para
--  ROL_FUNCIONAL, exija administrador.
--
--  Los roles de PLATAFORMA (tenant_id is null) siguen sin política de
--  escritura que los alcance — ninguna de las tres exige tenant_id is not
--  null como condición previa, así que siguen siendo de solo lectura para
--  cualquier tenant, como ya lo eran.
-- ═══════════════════════════════════════════════════════════════════════

alter policy lista_tipos_insert_agent on public.lista_tipos
  with check (
    tenant_id is not null
    and public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and (
      tipo <> 'ROL_FUNCIONAL'
      or public.has_role(tenant_id, array['administrador']::public.tenant_role_t[])
    )
  );

alter policy lista_tipos_update_agent on public.lista_tipos
  using (
    tenant_id is not null
    and public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and (
      tipo <> 'ROL_FUNCIONAL'
      or public.has_role(tenant_id, array['administrador']::public.tenant_role_t[])
    )
  )
  with check (
    tenant_id is not null
    and public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and (
      tipo <> 'ROL_FUNCIONAL'
      or public.has_role(tenant_id, array['administrador']::public.tenant_role_t[])
    )
  );

alter policy lista_tipos_delete_agent on public.lista_tipos
  using (
    tenant_id is not null
    and public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and (
      tipo <> 'ROL_FUNCIONAL'
      or public.has_role(tenant_id, array['administrador']::public.tenant_role_t[])
    )
  );

-- ── rol_funcional_modulo.lista_tipos_id — agrega ON DELETE CASCADE ──────
--  20260830120000 la dejó sin acción de borrado explícita porque hasta hoy
--  nada podía borrar un rol funcional (solo lo creaban migraciones de
--  plataforma). El builder (§A3) es la primera vez que un DELETE real
--  sobre lista_tipos es posible — sin este ALTER, eliminar un rol con al
--  menos un módulo marcado (el caso normal) falla con una violación de FK
--  en vez del mensaje claro que ya da el guard de "rol asignado" (ese sí
--  se queda igual: membership_roles_funcionales.rol_funcional_id NO lleva
--  cascade a propósito — un rol con personas asignadas debe seguir sin
--  poder borrarse).
alter table public.rol_funcional_modulo
  drop constraint rol_funcional_modulo_lista_tipos_id_fkey,
  add constraint rol_funcional_modulo_lista_tipos_id_fkey
    foreign key (lista_tipos_id) references public.lista_tipos (id) on delete cascade;

-- ── rol_funcional_modulo — hasta hoy solo tenía SELECT ─────────────────
--  Sin estas dos policies, "marcar qué módulos cubre un rol" (el builder)
--  no tiene forma de escribir: FORCE RLS + ninguna policy permisiva de
--  insert/delete = denegado para todos, incluido administrador. El join a
--  lista_tipos exige que el rol sea del TENANT del administrador (nunca
--  tenant_id is null): los roles de plataforma quedan de solo lectura
--  también desde este lado del mapeo.

create policy rol_funcional_modulo_insert_administrador
  on public.rol_funcional_modulo for insert
  to authenticated
  with check (
    exists (
      select 1 from public.lista_tipos lt
      where lt.id = lista_tipos_id
        and lt.tipo = 'ROL_FUNCIONAL'
        and lt.tenant_id is not null
        and public.has_role(lt.tenant_id, array['administrador']::public.tenant_role_t[])
    )
  );

create policy rol_funcional_modulo_delete_administrador
  on public.rol_funcional_modulo for delete
  to authenticated
  using (
    exists (
      select 1 from public.lista_tipos lt
      where lt.id = lista_tipos_id
        and lt.tipo = 'ROL_FUNCIONAL'
        and lt.tenant_id is not null
        and public.has_role(lt.tenant_id, array['administrador']::public.tenant_role_t[])
    )
  );

-- ── Auditoría de la DEFINICIÓN de un rol funcional ──────────────────────
--  20260830170000 ya audita la ASIGNACIÓN (a quién se le da/quita un rol).
--  Esto audita el otro lado: crear/renombrar/desactivar el rol mismo, y
--  agregarle o quitarle un módulo. Mismo patrón (trigger AFTER, no en el
--  store) para que quede registrado sin importar qué UI lo dispare.

create function public.audit_rol_funcional_definicion_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- entity_id es uuid (audit_log.entity_id) y lista_tipos.id es bigint —
  -- no hay cast razonable entre los dos, así que el id numérico va en
  -- metadata (igual que rol_funcional_codigo abajo), no en entity_id.
  insert into public.audit_log (tenant_id, actor_id, action, entity_type, metadata)
  values (
    coalesce(new.tenant_id, old.tenant_id),
    (select auth.uid()),
    case tg_op
      when 'INSERT' then 'rol_funcional.creado'
      when 'DELETE' then 'rol_funcional.eliminado'
      else 'rol_funcional.actualizado'
    end,
    'lista_tipos',
    jsonb_build_object(
      'lista_tipos_id', coalesce(new.id, old.id),
      'codigo', coalesce(new.codigo, old.codigo),
      'nombre', coalesce(new.nombre, old.nombre),
      'activo', coalesce(new.activo, old.activo)
    )
  );
  return coalesce(new, old);
end;
$$;

-- Dos triggers, no uno combinado: el WHEN de un trigger DELETE no puede
-- referenciar NEW (ni el de INSERT referenciar OLD), aunque la función que
-- ambos ejecutan sí puede leer coalesce(new, old) sin problema (eso es
-- una restricción de PL/pgSQL en el WHEN, no en el cuerpo de la función).
create trigger audit_rol_funcional_definicion_change_iu
  after insert or update on public.lista_tipos
  for each row
  when (new.tipo = 'ROL_FUNCIONAL')
  execute function public.audit_rol_funcional_definicion_change();

create trigger audit_rol_funcional_definicion_change_d
  after delete on public.lista_tipos
  for each row
  when (old.tipo = 'ROL_FUNCIONAL')
  execute function public.audit_rol_funcional_definicion_change();

create function public.audit_rol_funcional_modulo_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lista_tipos_id bigint := coalesce(new.lista_tipos_id, old.lista_tipos_id);
  v_modulo         text   := coalesce(new.modulo, old.modulo);
  v_tenant_id      uuid;
  v_codigo         text;
begin
  select lt.tenant_id, lt.codigo into v_tenant_id, v_codigo
  from public.lista_tipos lt
  where lt.id = v_lista_tipos_id;

  -- Mismo motivo que audit_rol_funcional_definicion_change: entity_id es
  -- uuid, lista_tipos_id es bigint — va en metadata, no en entity_id.
  insert into public.audit_log (tenant_id, actor_id, action, entity_type, metadata)
  values (
    v_tenant_id,
    (select auth.uid()),
    case tg_op when 'INSERT' then 'rol_funcional_modulo.agregado' else 'rol_funcional_modulo.quitado' end,
    'lista_tipos',
    jsonb_build_object('lista_tipos_id', v_lista_tipos_id, 'rol_funcional_codigo', v_codigo, 'modulo', v_modulo)
  );

  return coalesce(new, old);
end;
$$;

create trigger audit_rol_funcional_modulo_change
  after insert or delete on public.rol_funcional_modulo
  for each row execute function public.audit_rol_funcional_modulo_change();

-- ── B1 — corrige la prosa, no el código ─────────────────────────────────
--  Verificado (PROMPT_PERMISOS_CAPA2.md §1.5, decisión del usuario): el
--  código está bien — auxiliar SÍ administra (settings:manage y
--  tenant:delete en su matriz, tenants_update_agent lo permite). Lo que
--  estaba mal era este comentario, que decía lo contrario. Se corrige el
--  comment on type (comentario vivo en la base, no el texto del archivo
--  histórico 20260830100000, que no se edita).
comment on type public.tenant_role_t is
  'Roles dentro de una copropiedad. administrador = rol máximo del tenant (quien lo crea lo '
  'recibe automáticamente). auxiliar = mismo conjunto de permisos que administrador '
  '(ROLE_PERMISSIONS, apps/web/app/types/permissions.ts) — incluida la administración del tenant '
  '(settings:manage, tenant:delete) — salvo la aprobación de acciones de cobranza de alto impacto '
  '(guard_accion_cobranza_transicion, CAR §9.4/§21.3), la única capacidad exclusiva de '
  'administrador hoy. También es el único que puede definir roles funcionales del tenant '
  '(lista_tipos/rol_funcional_modulo con tipo=ROL_FUNCIONAL, PROMPT_PERMISOS_CAPA2.md §A3). El '
  'rename de 20260830100000 preservó el nivel de acceso real, no lo redujo — confirmado y cerrado '
  'en PROMPT_PERMISOS_CAPA2.md §B1, la prosa de esa migración quedó desactualizada. auditor = '
  'solo lectura, incluida auditoría. El admin de plataforma vive aparte, en '
  'profiles.is_platform_admin (AD-09).';
