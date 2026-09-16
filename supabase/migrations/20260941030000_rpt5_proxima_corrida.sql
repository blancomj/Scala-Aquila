-- ═══════════════════════════════════════════════════════════════════════
--  RPT-05 (4/n) · Cuándo toca la próxima corrida
--
--  Función PURA a propósito: recibe frecuencia, día, hora, zona y un
--  instante de referencia, y devuelve el siguiente instante. No lee ni
--  escribe una sola tabla, así que se puede probar con `select` desde una
--  prueba y sin montar fixtures — que es lo único que hace revisable un
--  cálculo de calendario, donde los errores no se ven hasta el mes que
--  viene.
--
--  LA ZONA HORARIA ES EL PUNTO ENTERO
--  ──────────────────────────────────
--  «Todos los días a las 7:00» significa 7:00 EN LA COPROPIEDAD. El cron
--  corre en UTC y el `TimeZone` de su sesión no es de fiar, así que la
--  hora local se construye con `at time zone`, dos veces:
--
--    (fecha + hora) at time zone 'America/Bogota'
--
--  El primer `at time zone` sobre un `timestamp` SIN zona lo interpreta EN
--  esa zona y devuelve un `timestamptz`. Es la dirección correcta; al
--  revés (`timestamptz at time zone`) devolvería la hora de pared, que es
--  lo que se necesita para comparar, no para agendar.
--
--  DECISIONES QUE PARECEN DETALLE Y NO LO SON
--  ──────────────────────────────────────────
--  · El horario de verano no aplica en Colombia, pero la función no lo
--    asume: si un día se usa una zona con DST, `at time zone` resuelve la
--    hora real y no hay que tocar nada.
--  · 'una_vez' devuelve NULL cuando su fecha ya pasó: una programación que
--    ya corrió no vuelve a tener próxima, y el cron la ignora por el índice
--    parcial en vez de recalcularla cada pasada.
--  · El día del mes está acotado a 1..28 por CHECK en la tabla, así que
--    aquí no hay que inventar qué hacer con el 31 de febrero.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_reporte_proxima_corrida(
  p_frecuencia   text,
  p_hora         time,
  p_zona         text,
  p_dia_semana   smallint default null,
  p_dia_mes      smallint default null,
  p_fecha_unica  date     default null,
  p_desde        timestamptz default now()
)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
declare
  -- El "hoy" de la copropiedad, que puede no ser el de UTC.
  v_hoy_local  date;
  v_candidata  timestamptz;
  v_dias       int;
begin
  v_hoy_local := (p_desde at time zone p_zona)::date;

  case p_frecuencia
    when 'una_vez' then
      v_candidata := (p_fecha_unica + p_hora) at time zone p_zona;
      -- Ya pasó: no hay próxima. El cron deja de mirarla.
      return case when v_candidata > p_desde then v_candidata else null end;

    when 'diaria' then
      v_candidata := (v_hoy_local + p_hora) at time zone p_zona;
      -- Si la hora de hoy ya pasó, toca mañana.
      if v_candidata <= p_desde then
        v_candidata := ((v_hoy_local + 1) + p_hora) at time zone p_zona;
      end if;
      return v_candidata;

    when 'semanal' then
      -- Días hasta el próximo día-de-semana pedido (0 si es hoy).
      v_dias := (p_dia_semana - extract(dow from v_hoy_local)::int + 7) % 7;
      v_candidata := ((v_hoy_local + v_dias) + p_hora) at time zone p_zona;
      -- Es hoy pero la hora ya pasó: la semana que viene.
      if v_candidata <= p_desde then
        v_candidata := ((v_hoy_local + v_dias + 7) + p_hora) at time zone p_zona;
      end if;
      return v_candidata;

    when 'mensual' then
      v_candidata := (date_trunc('month', v_hoy_local)::date + (p_dia_mes - 1) + p_hora)
                     at time zone p_zona;
      -- El día de este mes ya pasó: el mes que viene, mismo día.
      if v_candidata <= p_desde then
        v_candidata := ((date_trunc('month', v_hoy_local) + interval '1 month')::date
                        + (p_dia_mes - 1) + p_hora) at time zone p_zona;
      end if;
      return v_candidata;

    else
      raise exception 'RPT_FRECUENCIA_INVALIDA: frecuencia % no reconocida', p_frecuencia;
  end case;
end;
$$;

comment on function public.fn_reporte_proxima_corrida(text, time, text, smallint, smallint, date, timestamptz) is
  'RPT-05 — siguiente instante en que toca una programación, en la zona horaria de la '
  'copropiedad. Pura (IMMUTABLE, no toca tablas) para que el cálculo de calendario se pueda '
  'probar con un select. Devuelve NULL para una programación de una sola vez que ya pasó.';

revoke execute on function public.fn_reporte_proxima_corrida(text, time, text, smallint, smallint, date, timestamptz)
  from public, anon;
grant execute on function public.fn_reporte_proxima_corrida(text, time, text, smallint, smallint, date, timestamptz)
  to authenticated;

-- ── Mantener `proxima_at` al día sin que nadie tenga que acordarse ─────
-- Calcularlo en la aplicación significaría recalcularlo en cada sitio que
-- cree o edite una programación, y olvidarlo en uno. El disparador lo hace
-- una vez, en el único lugar por el que pasan todas.
create function public.trg_reporte_programacion_proxima()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- La zona por defecto es la de la copropiedad, no la del servidor.
  if new.zona_horaria is null or new.zona_horaria = '' then
    select t.zona_horaria into new.zona_horaria
      from public.tenants t where t.id = new.tenant_id;
  end if;

  if not new.activa then
    new.proxima_at := null;
  else
    new.proxima_at := public.fn_reporte_proxima_corrida(
      new.frecuencia, new.hora, new.zona_horaria,
      new.dia_semana, new.dia_mes, new.fecha_unica,
      -- Desde la última corrida si la hubo: así una programación diaria que
      -- acaba de ejecutarse apunta a mañana y no vuelve a entrar hoy.
      coalesce(new.ultima_at, now())
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.trg_reporte_programacion_proxima() from public, anon, authenticated;

comment on function public.trg_reporte_programacion_proxima() is
  'RPT-05 — recalcula proxima_at en cada alta/edición de una programación, y toma la zona horaria '
  'de la copropiedad si no viene. Vive en un disparador y no en la aplicación para que no haya un '
  'camino que se olvide de actualizarlo.';

create trigger reporte_programaciones_proxima
  before insert or update on public.reporte_programaciones
  for each row execute function public.trg_reporte_programacion_proxima();
