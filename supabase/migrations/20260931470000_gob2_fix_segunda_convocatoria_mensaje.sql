-- ═══════════════════════════════════════════════════════════════════════
--  GOB-2 · fix: SEGUNDA_CONVOCATORIA_SIN_ANTECEDENTE debe ser un mensaje
--  de error propio (raise exception), no un CHECK constraint plano.
--
--  Bug encontrado ANTES de correr ninguna prueba (revisión propia, no un
--  fallo de test): 20260931420000 modelaba la ausencia de antecedente con
--  `constraint gobierno_reuniones_segunda_con_antecedente check (...)` — el
--  mensaje de Postgres para una violación de CHECK constraint es
--  "violates check constraint \"gobierno_reuniones_segunda_con_antecedente\""
--  (minúsculas), que NUNCA contiene el código SCREAMING_SNAKE_CASE que el
--  resto del repositorio usa y que las pruebas verifican por
--  `.toContain('SEGUNDA_CONVOCATORIA_SIN_ANTECEDENTE')`. Se reemplaza por
--  un `raise exception` en el guard, mismo patrón que todo el resto del
--  repositorio (marco §5.4).
--
--  De paso se distingue el caso "antecedente ausente" de "antecedente
--  presente pero de otro tenant" con un código propio
--  (REUNION_ANTECEDENTE_INVALIDO) — son fallos distintos.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.gobierno_reuniones
  drop constraint gobierno_reuniones_segunda_con_antecedente;

create or replace function public.guard_gobierno_reunion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_organo uuid;
  v_tipo_codigo text;
  v_set_id uuid;
  v_suma_total numeric(12, 10);
  v_asistencia_total numeric(12, 10);
  v_antecedente_tenant uuid;
begin
  select tenant_id into v_tenant_organo from public.gobierno_organos where id = new.organo_id;
  if v_tenant_organo is distinct from new.tenant_id then
    raise exception 'REUNION_ORGANO_INVALIDO: organo_id % no pertenece al tenant %', new.organo_id, new.tenant_id;
  end if;

  select codigo into v_tipo_codigo from public.lista_tipos where id = new.tipo_id and tipo = 'TIPO_REUNION';
  if v_tipo_codigo is null then
    raise exception 'REUNION_TIPO_INVALIDO: tipo_id % no pertenece a TIPO_REUNION', new.tipo_id;
  end if;

  if new.convocatoria_regimen = 'segunda' and new.convocatoria_antecedente_id is null then
    raise exception 'SEGUNDA_CONVOCATORIA_SIN_ANTECEDENTE: convocatoria_regimen=segunda exige '
      'convocatoria_antecedente_id (Ley 675 art. 41)';
  end if;

  if new.convocatoria_antecedente_id is not null then
    select tenant_id into v_antecedente_tenant
    from public.gobierno_reuniones where id = new.convocatoria_antecedente_id;
    if v_antecedente_tenant is distinct from new.tenant_id then
      raise exception 'REUNION_ANTECEDENTE_INVALIDO: convocatoria_antecedente_id % no pertenece al tenant',
        new.convocatoria_antecedente_id;
    end if;
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  -- cerrada es terminal e inmutable, sin excepción.
  if old.estado = 'cerrada' then
    raise exception 'REUNION_CERRADA_INMUTABLE: la reunión % está cerrada y es inmutable', old.id;
  end if;

  -- coeficiente_set_id congelado: inmutable una vez fijado (test 3).
  if old.coeficiente_set_id is not null and new.coeficiente_set_id is distinct from old.coeficiente_set_id then
    raise exception 'REUNION_COEFICIENTE_SET_INMUTABLE: el coeficiente_set de la reunión % ya está '
      'congelado en %', old.id, old.coeficiente_set_id;
  end if;

  if old.estado is distinct from new.estado then
    if not (
      (old.estado = 'convocada' and new.estado in ('instalada', 'cancelada'))
      or (old.estado = 'instalada' and new.estado = 'cerrada')
    ) then
      raise exception 'REUNION_TRANSICION_INVALIDA: % → % no es una transición válida', old.estado, new.estado;
    end if;

    if new.estado in ('instalada', 'cerrada') and (select auth.uid()) is not null then
      if not public.has_role(new.tenant_id, array['administrador']::public.tenant_role_t[]) then
        raise exception 'REUNION_TRANSICION_REQUIERE_ADMINISTRADOR: instalar o cerrar la reunión % '
          'requiere rol administrador', old.id;
      end if;
    end if;

    if new.estado = 'instalada' then
      if new.presidente_miembro_id is null or new.secretario_miembro_id is null then
        raise exception 'REUNION_SIN_PRESIDENTE_O_SECRETARIO: instalar exige presidente_miembro_id '
          'y secretario_miembro_id (Ley 675 art. 47)';
      end if;

      v_set_id := public.fn_coeficiente_set_vigente(new.tenant_id, new.fecha_hora::date);
      new.coeficiente_set_id := v_set_id;

      if new.convocatoria_regimen = 'universal_sin_convocatoria' then
        select suma_total into v_suma_total from public.coeficiente_sets where id = v_set_id;
        select coalesce(sum(a.coeficiente), 0) into v_asistencia_total
        from public.gobierno_asistencia a
        where a.reunion_id = new.id and a.calidad <> 'invitado' and a.salida_at is null;
        if v_set_id is null or v_asistencia_total < v_suma_total then
          raise exception 'REUNION_UNIVERSAL_SIN_TOTALIDAD_COEFICIENTES: la asistencia (%) no '
            'representa el 100%% de los coeficientes (%) — Ley 675 art. 40', v_asistencia_total, v_suma_total;
        end if;
      end if;

      new.instalada_at := now();
    end if;

    if new.estado = 'cerrada' then
      new.cerrada_at := now();
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_gobierno_reunion() is
  'GOB-2: REUNION_ORGANO_INVALIDO/REUNION_TIPO_INVALIDO, SEGUNDA_CONVOCATORIA_SIN_ANTECEDENTE/'
  'REUNION_ANTECEDENTE_INVALIDO, FSM (REUNION_TRANSICION_INVALIDA, REUNION_CERRADA_INMUTABLE), '
  'REUNION_TRANSICION_REQUIERE_ADMINISTRADOR (instalar/cerrar), '
  'REUNION_SIN_PRESIDENTE_O_SECRETARIO y congelamiento de coeficiente_set_id al instalar '
  '(REUNION_COEFICIENTE_SET_INMUTABLE después), REUNION_UNIVERSAL_SIN_TOTALIDAD_COEFICIENTES.';
