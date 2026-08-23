-- Siembra de propietarios para GC-001 — los 66 inmuebles nunca tuvieron un
-- tercero asociado (solo se sembró el inventario), así que /inmuebles
-- mostraba "Sin propietario" en todas las filas. Un copropietario natural
-- por inmueble, vigente desde hoy, marcado como pagador — datos de ejemplo
-- (nombres/cédulas/teléfonos ficticios, no personas reales).
do $$
declare
  v_tenant_id uuid := 'e19a71e3-1b6e-43ca-8307-975ad108eb75';
  v_cedula_id bigint := 45;             -- TIPO_IDENTIFICACION.cedula
  v_activo_id bigint := 289;            -- ESTADO_TERCERO.activo
  v_rol_copropietario_id bigint := 24;  -- PERSONA_PREDIO.copropietario
  v_primeros text[] := array['Ana','Carlos','María','Jorge','Luisa','Andrés','Camila','Diego','Valentina','Santiago','Laura','Felipe','Paula','Julián','Daniela','Óscar','Natalia','Ricardo','Sofía','Mateo'];
  v_segundos text[] := array['María','José','Elena','Andrés','Fernanda','Alejandro','Isabel','Eduardo','Cristina','Rafael'];
  v_apellidos1 text[] := array['Gómez','Rodríguez','Martínez','López','García','Hernández','Restrepo','Betancur','Ospina','Cárdenas','Zuluaga','Vélez','Correa','Mejía','Londoño','Jaramillo','Arango','Uribe','Salazar','Giraldo'];
  v_apellidos2 text[] := array['Pérez','Sánchez','Ramírez','Torres','Flórez','Castaño','Duque','Muñoz','Palacio','Escobar'];
  r record;
  v_i int := 0;
  v_tercero_id uuid;
  v_primer_nombre text;
  v_apellido1 text;
begin
  if not exists (select 1 from public.tenants where id = v_tenant_id) then
    return;
  end if;

  for r in
    select id from public.inmuebles where tenant_id = v_tenant_id order by codigo
  loop
    v_i := v_i + 1;
    v_primer_nombre := v_primeros[1 + (v_i % array_length(v_primeros, 1))];
    v_apellido1 := v_apellidos1[1 + (v_i % array_length(v_apellidos1, 1))];

    insert into public.terceros (
      tenant_id, numero_documento, tipo_persona, tipo_identificacion_id,
      primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
      estado_id, email, telefono
    ) values (
      v_tenant_id,
      (1000000000 + v_i * 137)::text,
      'natural',
      v_cedula_id,
      v_primer_nombre,
      v_segundos[1 + (v_i % array_length(v_segundos, 1))],
      v_apellido1,
      v_apellidos2[1 + ((v_i + 3) % array_length(v_apellidos2, 1))],
      v_activo_id,
      lower(unaccent(v_primer_nombre) || '.' || unaccent(v_apellido1) || v_i || '@example.com'),
      '300' || lpad((1000000 + v_i * 977)::text, 7, '0')
    )
    returning id into v_tercero_id;

    insert into public.inmueble_persona_rol (
      tenant_id, inmueble_id, tercero_id, rol_id, vigente_desde, es_pagador, recibe_notificaciones
    ) values (
      v_tenant_id, r.id, v_tercero_id, v_rol_copropietario_id, current_date, true, true
    );
  end loop;
end $$;
