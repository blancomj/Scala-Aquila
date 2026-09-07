-- ═══════════════════════════════════════════════════════════════════════
--  GOB-2 · fn_gobierno_registrar_salida
--
--  Hallazgo durante las pruebas: si el cliente envía salida_at calculado con
--  su propio reloj (new Date() en el navegador), un desfase de reloj entre
--  el cliente y el servidor de Supabase puede producir un salida_at
--  ANTERIOR al ingreso_at que la BD ya persistió con su propio now() —
--  gobierno_asistencia_salida_valida lo rechaza correctamente, pero el
--  usuario (el auxiliar marcando la salida en la puerta) vería un error
--  de guard confuso por un problema de reloj, no por un error suyo.
--  Esta función deja que sea el propio servidor quien calcule salida_at
--  (now()), eliminando la dependencia del reloj del cliente — mismo tipo de
--  problema ya documentado para fetch de Node contra Supabase.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_gobierno_registrar_salida(p_asistencia_id uuid)
returns public.gobierno_asistencia
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fila public.gobierno_asistencia;
begin
  update public.gobierno_asistencia
  set salida_at = now()
  where id = p_asistencia_id
  returning * into v_fila;

  if v_fila.id is null then
    raise exception 'ASISTENCIA_INEXISTENTE: no existe la asistencia %', p_asistencia_id;
  end if;

  return v_fila;
end;
$$;

comment on function public.fn_gobierno_registrar_salida(uuid) is
  'GOB-2: registra la salida de un asistente usando now() del servidor, evitando que un desfase '
  'de reloj del cliente produzca un salida_at anterior a ingreso_at (gobierno_asistencia_'
  'salida_valida). security invoker: la RLS de gobierno_asistencia (update_auxiliar) sigue '
  'aplicando normalmente.';
