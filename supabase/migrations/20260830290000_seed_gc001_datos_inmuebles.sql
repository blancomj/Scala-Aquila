-- Completa datos de ficha técnica de los 66 inmuebles de GC-001 — el
-- inventario original solo traía código/tipo/área privada, así que matrícula,
-- área común, habitabilidad, uso del predio y estado legal estaban vacíos en
-- las 66 filas. Para poder probar filtros, orden y la ficha con datos
-- realistas se rellenan con una distribución variada (no todo "habitado" /
-- "residencial" parejo) — datos de ejemplo, no un predio real.
do $$
declare
  v_tenant_id uuid := 'e19a71e3-1b6e-43ca-8307-975ad108eb75';
  v_habitado bigint := 55;             -- HABITABILIDAD_PREDIO.habitado
  v_mantenimiento bigint := 56;        -- HABITABILIDAD_PREDIO.en_mantenimiento
  v_no_habitado bigint := 58;          -- HABITABILIDAD_PREDIO.no_habitado
  v_inactivo bigint := 59;             -- HABITABILIDAD_PREDIO.inactivo_sin_titular
  v_residencial bigint := 61;          -- USO_PREDIO.residencial
  v_turistico bigint := 63;            -- USO_PREDIO.turistico
  v_litigio_legal bigint := 272;       -- ESTADO_LEGAL_PREDIO.litigio
  v_embargo bigint := 273;             -- ESTADO_LEGAL_PREDIO.embargo
  v_sucesion bigint := 274;            -- ESTADO_LEGAL_PREDIO.sucesion_iliquida
begin
  if not exists (select 1 from public.tenants where id = v_tenant_id) then
    return;
  end if;

  with numeradas as (
    select id, tipo_id, area_privada, row_number() over (order by codigo) as n
    from public.inmuebles
    where tenant_id = v_tenant_id
  )
  update public.inmuebles i
  set
    matricula_inmobiliaria = '050-' || lpad((100000 + numeradas.n)::text, 6, '0'),
    area_comun = round(
      case when numeradas.tipo_id = 1 then numeradas.area_privada * 0.06
           else numeradas.area_privada * 0.15
      end, 2
    ),
    habitabilidad_id = case
      when numeradas.tipo_id <> 1 then null
      when numeradas.n % 17 = 0 then v_inactivo
      when numeradas.n % 11 = 0 then v_mantenimiento
      when numeradas.n % 7 = 0 then v_no_habitado
      else v_habitado
    end,
    uso_predio_id = case
      when numeradas.tipo_id = 1 and numeradas.n % 19 = 0 then v_turistico
      else v_residencial
    end
  from numeradas
  where i.id = numeradas.id;

  -- Un puñado de novedades legales para poder probar ese estado en la ficha.
  update public.inmuebles
  set estado_legal_id = v_litigio_legal,
      estado_legal_observaciones = 'Proceso judicial radicado 2025-0341, Juzgado 12 Civil Municipal.'
  where tenant_id = v_tenant_id and codigo = 'INM-301';

  update public.inmuebles
  set estado_legal_id = v_embargo,
      estado_legal_observaciones = 'Embargo por mora registrado en folio de matrícula.'
  where tenant_id = v_tenant_id and codigo = 'INM-702';

  update public.inmuebles
  set estado_legal_id = v_sucesion,
      estado_legal_observaciones = 'Sucesión en trámite — herederos pendientes de partición.'
  where tenant_id = v_tenant_id and codigo = 'INM-1401';
end $$;
