-- ═══════════════════════════════════════════════════════════════════════
--  RPT-05 (1/n) · El compilador filtra por copropiedad, siempre
--
--  HALLAZGO QUE OBLIGA A ESTE CAMBIO
--  ─────────────────────────────────
--  RPT-01 apoyó TODA la separación entre copropiedades en la RLS de las
--  vistas `vr_*` (security_invoker). Para un usuario con sesión eso es
--  correcto y elegante: no hay matriz de seguridad duplicada.
--
--  Pero RPT-05 introduce un ejecutor que NO es un usuario: la Edge Function
--  que envía los reportes programados corre con `service_role`, y
--  `service_role` tiene BYPASSRLS. Comprobado contra la base:
--
--      set role service_role;
--      select count(distinct tenant_id) from public.vr_recaudos;  -->  11
--
--  Once copropiedades. Es decir: tal como estaba, el primer reporte
--  programado habría salido por correo con los datos de TODAS las
--  copropiedades del proyecto. No es una hipótesis — es lo que devuelve la
--  vista hoy con ese rol.
--
--  LA CORRECCIÓN VA EN EL COMPILADOR, NO EN LA EDGE FUNCTION
--  ────────────────────────────────────────────────────────
--  Un filtro escrito en Deno se puede olvidar en la próxima función que
--  llame a esta RPC; uno que pone el compilador, no. Por eso:
--
--  · `p_tenant_id` pasa a ser OBLIGATORIO (sin default) y va antes del
--    límite. Cambia la aridad, así que hay que borrar la firma vieja
--    explícitamente o quedarían dos sobrecargas ambiguas.
--  · La condición `tenant_id = ($1->>'tenant')::uuid` se antepone SIEMPRE
--    a las demás. Para un usuario con sesión es redundante con la RLS —y no
--    cuesta nada—; para el servidor es lo único que lo separa todo.
--  · El valor viaja por `$1`, como todos: el compilador sigue sin
--    interpolar un solo dato del cliente.
--  · Una fuente cuya vista no exponga `tenant_id` se rechaza con
--    `RPT_FUENTE_SIN_TENANT` antes de compilar nada. Sin esta guarda, la
--    próxima vista `vr_*` que alguien añada sin esa columna reabriría el
--    agujero en silencio. Las tres actuales la tienen.
--
--  Un cliente malicioso que pase el tenant de otro no gana nada: la RLS de
--  las vistas sigue aplicando para `authenticated` y devuelve cero filas.
-- ═══════════════════════════════════════════════════════════════════════

drop function public.fn_reporte_ejecutar(jsonb, int);

create function public.fn_reporte_ejecutar(
  p_definicion jsonb,
  p_tenant_id  uuid,
  p_limite     int default 1000
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  -- Tope absoluto: ni el llamador ni una definición guardada pueden subirlo.
  c_limite_maximo  constant int  := 5000;
  c_timeout        constant text := '20s';

  v_fuente         public.reporte_fuentes%rowtype;
  v_limite         int;
  v_campo          jsonb;
  v_filtro         jsonb;
  v_orden          jsonb;
  v_def            public.reporte_campos%rowtype;
  v_codigo         text;
  v_agregacion     text;
  v_operador       text;
  v_expresion      text;
  v_columna        text;

  v_seleccion      text[] := '{}';
  v_grupos         text[] := '{}';
  v_condiciones    text[] := '{}';
  v_ordenes        text[] := '{}';
  v_vistos         text[] := '{}';
  v_agrupar        text[] := '{}';

  v_valores        jsonb := '{}'::jsonb;
  v_indice         int := 0;
  v_marcador       text;
  v_hay_agregacion boolean := false;
  v_filtrados      text[] := '{}';

  v_sql            text;
  v_filas          jsonb;
  v_inicio         timestamptz := clock_timestamp();
begin
  -- ── Fuente ───────────────────────────────────────────────────────────
  select * into v_fuente
    from public.reporte_fuentes
   where codigo = p_definicion->>'fuente'
     and activa;

  if not found then
    raise exception 'RPT_FUENTE_NO_ENCONTRADA: la fuente % no existe o no está activa',
      coalesce(p_definicion->>'fuente', '(sin fuente)');
  end if;

  -- La frontera entre copropiedades de este compilador es el filtro de
  -- tenant que se añade siempre abajo. Una fuente cuya vista no exponga
  -- tenant_id lo dejaría sin efecto y, ejecutada por el servidor, mezclaría
  -- copropiedades. Se rechaza antes de compilar nada.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = v_fuente.objeto_sql
       and column_name = 'tenant_id'
  ) then
    raise exception 'RPT_FUENTE_SIN_TENANT: la fuente % no expone tenant_id y no puede ejecutarse',
      v_fuente.codigo;
  end if;

  if jsonb_typeof(p_definicion->'campos') <> 'array'
     or jsonb_array_length(p_definicion->'campos') = 0 then
    raise exception 'RPT_DEFINICION_INVALIDA: el reporte no selecciona ningún campo';
  end if;

  v_limite := least(greatest(coalesce(p_limite, 1000), 1), c_limite_maximo);

  -- ── Agrupación declarada (se valida contra el catálogo más abajo) ─────
  if jsonb_typeof(p_definicion->'agrupar') = 'array' then
    for v_codigo in select jsonb_array_elements_text(p_definicion->'agrupar') loop
      select * into v_def
        from public.reporte_campos
       where fuente_id = v_fuente.id and codigo = v_codigo;

      if not found then
        raise exception 'RPT_CAMPO_NO_ENCONTRADO: el campo % no existe en la fuente %',
          v_codigo, v_fuente.codigo;
      end if;

      if not v_def.agrupable then
        raise exception 'RPT_CAMPO_NO_AGRUPABLE: el campo % no se puede agrupar', v_codigo;
      end if;

      v_agrupar := v_agrupar || v_codigo;
    end loop;
  end if;

  -- ── Campos ───────────────────────────────────────────────────────────
  for v_campo in select * from jsonb_array_elements(p_definicion->'campos') loop
    v_codigo     := v_campo->>'campo';
    v_agregacion := v_campo->>'agregacion';

    select * into v_def
      from public.reporte_campos
     where fuente_id = v_fuente.id and codigo = v_codigo;

    if not found then
      raise exception 'RPT_CAMPO_NO_ENCONTRADO: el campo % no existe en la fuente %',
        coalesce(v_codigo, '(vacío)'), v_fuente.codigo;
    end if;

    -- Un campo repetido produciría dos columnas con el mismo nombre y un
    -- resultado ambiguo al ordenar.
    if v_codigo = any(v_vistos) then
      raise exception 'RPT_DEFINICION_INVALIDA: el campo % está seleccionado dos veces', v_codigo;
    end if;
    v_vistos := v_vistos || v_codigo;

    -- Una métrica sin agregación explícita usa la del catálogo (R-09: la
    -- definición oficial de la cifra es la del catálogo, no la del reporte).
    if v_agregacion is null and v_def.clase = 'metrica' and array_length(v_agrupar, 1) > 0 then
      v_agregacion := v_def.agregacion_default;
    end if;

    if v_agregacion is not null then
      if v_def.clase <> 'metrica' then
        raise exception 'RPT_AGREGACION_INVALIDA: % es una dimensión y no se puede agregar', v_codigo;
      end if;

      v_expresion := case v_agregacion
        when 'suma'     then 'sum('    || format('%I', v_codigo) || ')'
        when 'conteo'   then 'count('  || format('%I', v_codigo) || ')'
        when 'promedio' then 'avg('    || format('%I', v_codigo) || ')'
        when 'minimo'   then 'min('    || format('%I', v_codigo) || ')'
        when 'maximo'   then 'max('    || format('%I', v_codigo) || ')'
        else null
      end;

      if v_expresion is null then
        raise exception 'RPT_AGREGACION_INVALIDA: agregación % no reconocida', v_agregacion;
      end if;

      v_hay_agregacion := true;
    else
      v_expresion := format('%I', v_codigo);

      -- En modo agregado, toda columna sin agregar tiene que estar agrupada:
      -- es la regla de SQL, dicha con un mensaje que un humano entienda.
      if array_length(v_agrupar, 1) > 0 and not (v_codigo = any(v_agrupar)) then
        raise exception
          'RPT_DEFINICION_INVALIDA: el campo % no está agrupado ni agregado; agrúpalo o quítalo',
          v_codigo;
      end if;
    end if;

    -- El nombre de la columna de salida SIEMPRE es el código del catálogo,
    -- nunca el alias que escriba el usuario: la etiqueta amigable la pone
    -- la UI desde reporte_campos.etiqueta. Así ningún texto libre entra al
    -- SQL, ni siquiera como nombre de columna.
    v_seleccion := v_seleccion || (v_expresion || ' as ' || format('%I', v_codigo));
  end loop;

  foreach v_codigo in array v_agrupar loop
    v_grupos := v_grupos || format('%I', v_codigo);
  end loop;

  -- ── Filtros ──────────────────────────────────────────────────────────
  if jsonb_typeof(p_definicion->'filtros') = 'array' then
    for v_filtro in select * from jsonb_array_elements(p_definicion->'filtros') loop
      v_codigo   := v_filtro->>'campo';
      v_operador := v_filtro->>'operador';

      select * into v_def
        from public.reporte_campos
       where fuente_id = v_fuente.id and codigo = v_codigo;

      if not found then
        raise exception 'RPT_CAMPO_NO_ENCONTRADO: el campo % no existe en la fuente %',
          coalesce(v_codigo, '(vacío)'), v_fuente.codigo;
      end if;

      if not v_def.filtrable then
        raise exception 'RPT_FILTRO_INVALIDO: el campo % no admite filtros', v_codigo;
      end if;

      v_columna   := format('%I', v_codigo);
      v_filtrados := v_filtrados || v_codigo;

      -- Tipo destino del valor, tomado del catálogo — no del cliente.
      v_expresion := case v_def.tipo_dato
        when 'fecha'    then '::date'
        when 'numero'   then '::numeric'
        when 'dinero'   then '::numeric'
        when 'porcentaje' then '::numeric'
        when 'booleano' then '::boolean'
        else '::text'
      end;

      if v_operador in ('es_nulo', 'no_es_nulo') then
        v_condiciones := v_condiciones || (
          v_columna || case v_operador when 'es_nulo' then ' is null' else ' is not null' end
        );

      elsif v_operador = 'entre' then
        v_marcador := 'v' || v_indice;  v_indice := v_indice + 1;
        v_valores  := v_valores || jsonb_build_object(v_marcador, v_filtro->'desde');
        v_condiciones := v_condiciones || (
          v_columna || ' >= ($1->>' || quote_literal(v_marcador) || ')' || v_expresion
        );

        v_marcador := 'v' || v_indice;  v_indice := v_indice + 1;
        v_valores  := v_valores || jsonb_build_object(v_marcador, v_filtro->'hasta');
        v_condiciones := v_condiciones || (
          v_columna || ' <= ($1->>' || quote_literal(v_marcador) || ')' || v_expresion
        );

      elsif v_operador in ('en', 'no_en') then
        if jsonb_typeof(v_filtro->'valor') <> 'array' then
          raise exception 'RPT_FILTRO_INVALIDO: el operador % requiere una lista de valores',
            v_operador;
        end if;
        v_marcador := 'v' || v_indice;  v_indice := v_indice + 1;
        v_valores  := v_valores || jsonb_build_object(v_marcador, v_filtro->'valor');
        v_condiciones := v_condiciones || (
          v_columna || '::text ' || case v_operador when 'en' then '' else 'not ' end
          || '= any(select jsonb_array_elements_text($1->' || quote_literal(v_marcador) || '))'
        );

      else
        v_marcador := 'v' || v_indice;  v_indice := v_indice + 1;
        v_valores  := v_valores || jsonb_build_object(v_marcador, v_filtro->'valor');

        v_condiciones := v_condiciones || case v_operador
          when 'igual'       then v_columna || ' = ($1->>'  || quote_literal(v_marcador) || ')' || v_expresion
          when 'distinto'    then v_columna || ' <> ($1->>' || quote_literal(v_marcador) || ')' || v_expresion
          when 'mayor'       then v_columna || ' > ($1->>'  || quote_literal(v_marcador) || ')' || v_expresion
          when 'mayor_igual' then v_columna || ' >= ($1->>' || quote_literal(v_marcador) || ')' || v_expresion
          when 'menor'       then v_columna || ' < ($1->>'  || quote_literal(v_marcador) || ')' || v_expresion
          when 'menor_igual' then v_columna || ' <= ($1->>' || quote_literal(v_marcador) || ')' || v_expresion
          -- Los de texto comparan siempre como texto, sin importar el tipo
          -- del campo, y con ILIKE: buscar "torre a" debe encontrar "Torre A".
          when 'contiene'    then v_columna || '::text ilike (''%'' || ($1->>' || quote_literal(v_marcador) || ') || ''%'')'
          when 'empieza_por' then v_columna || '::text ilike (($1->>'          || quote_literal(v_marcador) || ') || ''%'')'
          else null
        end;

        if v_condiciones[array_length(v_condiciones, 1)] is null then
          raise exception 'RPT_OPERADOR_INVALIDO: el operador % no está permitido',
            coalesce(v_operador, '(vacío)');
        end if;
      end if;
    end loop;
  end if;

  -- Fuente que exige acotar (§58): sin ese filtro, no se ejecuta.
  if v_fuente.filtro_obligatorio is not null
     and not (v_fuente.filtro_obligatorio = any(v_filtrados)) then
    raise exception 'RPT_FILTRO_OBLIGATORIO: la fuente % exige filtrar por %',
      v_fuente.codigo, v_fuente.filtro_obligatorio;
  end if;

  -- ── Orden ────────────────────────────────────────────────────────────
  if jsonb_typeof(p_definicion->'orden') = 'array' then
    for v_orden in select * from jsonb_array_elements(p_definicion->'orden') loop
      v_codigo := v_orden->>'campo';

      select * into v_def
        from public.reporte_campos
       where fuente_id = v_fuente.id and codigo = v_codigo;

      if not found then
        raise exception 'RPT_CAMPO_NO_ENCONTRADO: el campo % no existe en la fuente %',
          coalesce(v_codigo, '(vacío)'), v_fuente.codigo;
      end if;

      if not v_def.ordenable then
        raise exception 'RPT_ORDEN_INVALIDO: el campo % no se puede ordenar', v_codigo;
      end if;

      -- Se ordena por la columna de SALIDA, que siempre existe porque solo
      -- se admite ordenar por un campo seleccionado.
      if not (v_codigo = any(v_vistos)) then
        raise exception 'RPT_ORDEN_INVALIDO: no se puede ordenar por %, que no está en el reporte',
          v_codigo;
      end if;

      v_ordenes := v_ordenes || (
        format('%I', v_codigo) ||
        case when lower(coalesce(v_orden->>'direccion', 'asc')) = 'desc' then ' desc' else ' asc' end
      );
    end loop;
  end if;

  -- ── Ensamblado ───────────────────────────────────────────────────────
  v_sql := 'select ' || array_to_string(v_seleccion, ', ')
        || format(' from public.%I', v_fuente.objeto_sql);

  -- El filtro de copropiedad va SIEMPRE, lo pone el compilador y no sale
  -- de la definición. Para un usuario con sesión es redundante con la RLS
  -- de las vistas vr_* (security_invoker) y no cuesta nada; para el
  -- servidor —que ejecuta con service_role y por tanto ATRAVIESA la RLS—
  -- es lo único que separa una copropiedad de otra. El valor viaja por $1,
  -- como todos los demás.
  v_valores     := v_valores || jsonb_build_object('tenant', p_tenant_id);
  v_condiciones := array_prepend('tenant_id = ($1->>''tenant'')::uuid', v_condiciones);

  v_sql := v_sql || ' where ' || array_to_string(v_condiciones, ' and ');

  if array_length(v_grupos, 1) > 0 then
    v_sql := v_sql || ' group by ' || array_to_string(v_grupos, ', ');
  end if;

  if array_length(v_ordenes, 1) > 0 then
    v_sql := v_sql || ' order by ' || array_to_string(v_ordenes, ', ');
  end if;

  -- El límite es un literal de la propia función, ya acotado por
  -- c_limite_maximo: nunca llega como texto del cliente.
  v_sql := v_sql || ' limit ' || v_limite::text;

  -- Un reporte no puede degradar la operación transaccional (§58).
  perform set_config('statement_timeout', c_timeout, true);

  execute
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (' || v_sql || ') t'
    into v_filas
    using v_valores;

  return jsonb_build_object(
    'filas',       v_filas,
    'total_filas', jsonb_array_length(v_filas),
    'truncado',    jsonb_array_length(v_filas) >= v_limite,
    'duracion_ms', (extract(epoch from (clock_timestamp() - v_inicio)) * 1000)::int,
    'fuente',      v_fuente.codigo
  );
end;
$fn$;


revoke execute on function public.fn_reporte_ejecutar(jsonb, uuid, int) from public, anon;
grant execute on function public.fn_reporte_ejecutar(jsonb, uuid, int) to authenticated;

comment on function public.fn_reporte_ejecutar(jsonb, uuid, int) is
  'Compilador de consultas del Motor de Reportes (RPT-01 D-136 R-06; filtro de tenant añadido en '
  'RPT-05, D-141). SECURITY INVOKER, pero YA NO depende solo de la RLS: antepone siempre '
  'tenant_id = ($1->>''tenant'')::uuid, porque el ejecutor programado corre con service_role, que '
  'atraviesa la RLS. Ningún identificador llega del cliente —se resuelven contra '
  'reporte_fuentes/reporte_campos, que nadie escribe en runtime, y solo entonces se interpolan '
  'con format(%I)— y ningún valor se interpola: todos viajan en $1 jsonb. Tope duro de 5000 '
  'filas y statement_timeout de 20s.';
