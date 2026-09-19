-- ═══════════════════════════════════════════════════════════════════════
--  Roles funcionales — dimensión ver/actuar (Fase 1 de 3 sobre el mockup
--  de referencia que el usuario volvió a traer). El mismo mockup ya se
--  evaluó al diseñar esta capa (20260830120000): su alcance cross-tenant/
--  regional se descartó (AD-24/GAP-17), pero quedó anotado como evolución
--  futura la dimensión que sí falta — puede_ver_modulo() solo gatea
--  SELECT; un rol funcional puede ocultar un módulo pero nunca pudo decir
--  "lo ve, pero no puede crear/editar ahí".
--
--  Un rol cubre un módulo con UNA sola fila (lista_tipos_id, modulo) —
--  `accion` es un atributo de esa fila, no una segunda fila ni una tabla
--  aparte. 'actuar' implica 'ver' de forma natural: puede_ver_modulo() NO
--  cambia (sigue mirando solo si la fila existe, nunca su `accion`), así
--  que un rol en 'actuar' se sigue viendo sin tocar esa función.
--
--  D-24: enum y no lista_tipos porque gatilla lógica real (qué función SQL
--  aplica sobre las policies de escritura), no es vocabulario descriptivo.
-- ═══════════════════════════════════════════════════════════════════════

create type public.rol_funcional_accion_t as enum ('ver', 'actuar');

comment on type public.rol_funcional_accion_t is
  'Nivel de acceso que un rol funcional otorga sobre UN módulo que cubre (rol_funcional_modulo.accion). '
  '''ver'' (default, compat con todo lo sembrado antes de esta migración) solo habilita '
  'puede_ver_modulo() — el módulo es visible pero las políticas de insert/update siguen exigiendo el '
  'rol base (auxiliar/administrador) sin más. ''actuar'' además satisface puede_actuar_en_modulo(), que '
  'las políticas de escritura de los módulos con portón real (financiero, cartera_cobranza, '
  'estado_cuenta, juridico) exigen. No gatilla nada por sí solo en los módulos que hoy no tienen '
  'portón de escritura (mantenimiento, porteria, anuncios, movilidad, marketplace, gobierno).';

alter table public.rol_funcional_modulo
  add column accion public.rol_funcional_accion_t not null default 'ver';

comment on column public.rol_funcional_modulo.accion is
  'ver = solo visibilidad (default). actuar = además habilita escritura vía puede_actuar_en_modulo() '
  'en los módulos que la exigen. Ver comment on type rol_funcional_accion_t.';

-- ── puede_actuar_en_modulo() — hermana de puede_ver_modulo(), mismo ─────
--    esqueleto exacto (20260830130000), única diferencia: exige
--    accion = 'actuar' en vez de solo existencia de la fila.
create function public.puede_actuar_en_modulo(p_tenant uuid, p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.has_role(p_tenant, array['administrador']::public.tenant_role_t[])
    or not exists (
      select 1
      from public.membership_roles_funcionales mrf
      join public.memberships m on m.id = mrf.membership_id
      where m.user_id = (select auth.uid())
        and m.tenant_id = p_tenant
        and m.status = 'active'
    )
    or exists (
      select 1
      from public.membership_roles_funcionales mrf
      join public.memberships m on m.id = mrf.membership_id
      join public.rol_funcional_modulo rfm on rfm.lista_tipos_id = mrf.rol_funcional_id
      where m.user_id = (select auth.uid())
        and m.tenant_id = p_tenant
        and m.status = 'active'
        and rfm.modulo = p_modulo
        and rfm.accion = 'actuar'
    )
$$;

comment on function public.puede_actuar_en_modulo is
  'Gate restrictivo para policies de insert/update de un módulo sensible — hermana de '
  'puede_ver_modulo() (20260830130000), mismo criterio de compatibilidad: administrador siempre true; '
  'sin ningún rol funcional asignado, true (nada cambia); con al menos uno, exige que ALGUNO cubra '
  'p_modulo con accion=''actuar'' específicamente (no basta con ''ver'').';

-- ── rol_funcional_modulo gana su primera policy de UPDATE ───────────────
--  Hasta hoy solo se podía agregar/quitar un módulo (insert/delete,
--  20260950000000) — cambiar accion sin esto exigiría borrar y reinsertar,
--  perdiendo la fecha de asignación original si algún día se audita eso.
--  Mismo `exists` contra lista_tipos que insert/delete: solo administrador
--  del tenant dueño del rol, nunca sobre roles de plataforma.
create policy rol_funcional_modulo_update_administrador
  on public.rol_funcional_modulo for update
  to authenticated
  using (
    exists (
      select 1 from public.lista_tipos lt
      where lt.id = lista_tipos_id
        and lt.tipo = 'ROL_FUNCIONAL'
        and lt.tenant_id is not null
        and public.has_role(lt.tenant_id, array['administrador']::public.tenant_role_t[])
    )
  )
  with check (
    exists (
      select 1 from public.lista_tipos lt
      where lt.id = lista_tipos_id
        and lt.tipo = 'ROL_FUNCIONAL'
        and lt.tenant_id is not null
        and public.has_role(lt.tenant_id, array['administrador']::public.tenant_role_t[])
    )
  );

-- ── Auditoría — audit_rol_funcional_modulo_change (20260950000000) ──────
--    se extiende a UPDATE para que un cambio de accion también quede
--    registrado. drop+recreate del trigger (los eventos que dispara no se
--    pueden ALTER); create or replace de la función, mismo nombre.
drop trigger audit_rol_funcional_modulo_change on public.rol_funcional_modulo;

create or replace function public.audit_rol_funcional_modulo_change()
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

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, metadata)
  values (
    v_tenant_id,
    (select auth.uid()),
    case tg_op
      when 'INSERT' then 'rol_funcional_modulo.agregado'
      when 'DELETE' then 'rol_funcional_modulo.quitado'
      else 'rol_funcional_modulo.accion_cambiada'
    end,
    'lista_tipos',
    jsonb_build_object(
      'lista_tipos_id', v_lista_tipos_id,
      'rol_funcional_codigo', v_codigo,
      'modulo', v_modulo,
      'accion', coalesce(new.accion, old.accion)
    )
  );

  return coalesce(new, old);
end;
$$;

create trigger audit_rol_funcional_modulo_change
  after insert or update or delete on public.rol_funcional_modulo
  for each row execute function public.audit_rol_funcional_modulo_change();
