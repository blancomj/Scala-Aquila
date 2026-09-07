-- ═══════════════════════════════════════════════════════════════════════
--  GOB-0 · Parte A (tenedor) — funciones de resolución histórica
--  Ver GOB_00_prerrequisitos_bloqueantes.md §3.4 y §6 (pruebas 2, 3, 4, 5)
--
--  Corrección sobre el Plan del corte: la Parte A se apoyaba en `personas`,
--  pero esa tabla fue renombrada a `terceros` un día después
--  (20260821100000_terceros_generalizacion.sql, previa a este corte) y
--  `inmueble_persona_rol.persona_id` pasó a llamarse `tercero_id`. Es la
--  MISMA tabla `terceros` que ya usan proveedores/contratistas (MANT-5,
--  FIN-2) — el tenedor es, con esta corrección, un tercero más con rol
--  PERSONA_PREDIO. No cambia el diseño, solo los nombres reales.
--
--  "Familia tenedor" de PERSONA_PREDIO — decisión de modelado que se deja
--  explícita aquí porque no es un dato, es una interpretación: arrendatario,
--  inquilino, locatario y usufructuario SON tenencia (ocupan el inmueble sin
--  ser dueños). apoderado y codeudor NO lo son (representan o garantizan,
--  no ocupan) y quedan fuera de esta familia a propósito. visitante tampoco
--  (no es sujeto de las obligaciones del art. 18/59, es transitorio).
--  copropietario nunca puede ser "tenedor" de su propio inmueble.
--
--  Ambas funciones son STABLE (leen, no escriben) y reciben la fecha como
--  parámetro — mismo criterio que coeficiente_sets: "quién era tenedor/
--  propietario el día D" debe ser reproducible después, sin importar qué
--  vigencias cambiaron desde entonces.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_tenedores_vigentes(p_inmueble_id uuid, p_fecha date)
returns table (
  persona_rol_id    uuid,
  tercero_id        uuid,
  numero_documento  text,
  nombre_completo   text,
  rol_codigo        text,
  vigente_desde     date,
  vigente_hasta      date
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    ipr.id,
    ter.id,
    ter.numero_documento,
    ter.nombre_completo,
    lt.codigo,
    ipr.vigente_desde,
    ipr.vigente_hasta
  from public.inmueble_persona_rol ipr
  join public.lista_tipos lt on lt.id = ipr.rol_id
  join public.terceros ter on ter.id = ipr.tercero_id
  where ipr.inmueble_id = p_inmueble_id
    and lt.tipo = 'PERSONA_PREDIO'
    and lt.codigo in ('arrendatario', 'inquilino', 'locatario', 'usufructuario')
    and ipr.vigente_desde <= p_fecha
    and (ipr.vigente_hasta is null or ipr.vigente_hasta >= p_fecha)
$$;

comment on function public.fn_tenedores_vigentes(uuid, date) is
  'Tenedores (art. 18/59 Ley 675) de un inmueble vigentes a una fecha dada — histórico, '
  'reproducible. Familia de roles considerada "tenedor": arrendatario, inquilino, '
  'locatario, usufructuario (GOB-0 §3.4). Puede devolver varias filas: un inmueble admite '
  'varios tenedores simultáneos.';

create or replace function public.fn_propietario_responsable(p_inmueble_id uuid, p_fecha date)
returns table (
  tercero_id        uuid,
  numero_documento  text,
  nombre_completo   text,
  porcentaje        numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    ter.id,
    ter.numero_documento,
    ter.nombre_completo,
    ipr.porcentaje
  from public.inmueble_persona_rol ipr
  join public.lista_tipos lt on lt.id = ipr.rol_id
  join public.terceros ter on ter.id = ipr.tercero_id
  where ipr.inmueble_id = p_inmueble_id
    and lt.tipo = 'PERSONA_PREDIO'
    and lt.codigo = 'copropietario'
    and ipr.vigente_desde <= p_fecha
    and (ipr.vigente_hasta is null or ipr.vigente_hasta >= p_fecha)
$$;

comment on function public.fn_propietario_responsable(uuid, date) is
  'Copropietario(s) vigente(s) de un inmueble a una fecha dada — resuelve, desde una '
  'infracción de un tenedor, quién responde por ella (art. 59 Ley 675: "el propietario '
  'responde por el tenedor"). Puede devolver varias filas cuando hay copropiedad '
  'compartida (porcentaje).';
