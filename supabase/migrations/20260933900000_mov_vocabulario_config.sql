-- ═══════════════════════════════════════════════════════════════════════
--  MOV-1 (1/3) · Bitácora de portería — vocabulario y configuración
--
--  Tercer corte sobre movilidad, después de EXS-5 (vehículos y permisos).
--  Lo que aquí empieza es el REGISTRO DE MOVIMIENTO, que EXS-5 no tenía:
--  quién entró, cuándo salió, y si en ese momento estaba autorizado.
--
--  QUÉ NO SE CREA, Y POR QUÉ IMPORTA
--
--  · **No hay tabla de cupos de parqueadero.** El cupo ya está modelado dos
--    veces en este repositorio, y las dos son legítimas porque son dos
--    figuras jurídicas distintas: el parqueadero como BIEN PRIVADO es un
--    `inmuebles` de tipo `parqueadero` (tiene matrícula y coeficiente
--    propios, se vende), y el parqueadero COMÚN DE USO EXCLUSIVO es una
--    `zonas_comunes` con `uso_exclusivo_inmueble_id`. Una tercera tabla
--    sería una tercera verdad sobre el mismo espacio físico. Movilidad
--    referencia el inventario que ya existe; no lo administra.
--
--  · **No se duplica `mant_registros_acceso`.** MANT-11 registra el ingreso
--    de PERSONAS contra una autorización de visita. Esto registra el paso
--    de VEHÍCULOS, en los dos sentidos, con o sin autorización previa. Son
--    hechos distintos sobre el mismo portón, y cuando coinciden —una visita
--    que llega en carro— el paso apunta a la misma autorización, sin copiar
--    sus datos.
--
--  EL SENTIDO ES UN ENUM, y bajo D-24 hay que justificarlo: no es
--  vocabulario descriptivo. Gobierna el índice parcial que responde "qué
--  hay dentro ahora" y el emparejamiento entrada→salida del que sale la
--  permanencia. Con un `lista_tipos` esa consulta dependería de un join por
--  una fila que cualquiera puede renombrar o desactivar.
-- ═══════════════════════════════════════════════════════════════════════

create type public.vehiculo_sentido_t as enum ('entrada', 'salida');

comment on type public.vehiculo_sentido_t is
  'Sentido del paso de un vehículo por la portería (MOV-1). Enum nativo y no lista_tipos (D-24) '
  'porque no describe: gobierna el índice parcial de "vehículos dentro ahora" y el '
  'emparejamiento entrada→salida del que se deriva la permanencia de un visitante. Solo hay dos '
  'valores posibles y añadir un tercero cambiaría esa lógica, no solo una etiqueta.';

-- ── Configuración de movilidad por copropiedad ─────────────────────────
--
--  Una fila por tenant, y las dos columnas son NULLABLE con un
--  significado deliberado: null = "esta copropiedad no controla eso". Un
--  conjunto residencial sin parqueadero de visitantes no debe verse
--  obligado a inventar un número, y un cero significaría "no cabe nadie",
--  que es una afirmación distinta.
--
--  Va en tabla propia y no en columnas de `tenants` —donde sí viven
--  `dia_facturacion` o `canal_notificacion`— siguiendo el patrón de
--  `gobierno_vencimiento_config`: `tenants` ya pasa de treinta columnas y
--  mezclar ahí la configuración de cada módulo la vuelve ilegible.

create table public.movilidad_config (
  tenant_id               uuid primary key references public.tenants (id) on delete cascade,
  cupos_visitante         integer,
  horas_max_visitante     integer,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint movilidad_config_cupos_positivos
    check (cupos_visitante is null or cupos_visitante > 0),
  constraint movilidad_config_horas_positivas
    check (horas_max_visitante is null or horas_max_visitante > 0)
);

alter table public.movilidad_config enable row level security;
alter table public.movilidad_config force row level security;

create policy movilidad_config_select_miembro on public.movilidad_config
  for select to authenticated
  using (public.is_member(tenant_id));

-- Configurar capacidad es decisión de administración, no de operación:
-- subir el tope de visitantes cambia a quién se le niega la entrada.
create policy movilidad_config_write_admin on public.movilidad_config
  for all to authenticated
  using (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['administrador']::public.tenant_role_t[]));

comment on table public.movilidad_config is
  'MOV-1 — parámetros de movilidad de una copropiedad. Una fila por tenant. Las dos columnas son '
  'nullable con significado: null = esta copropiedad no controla eso, que es distinto de cero '
  '(= no cabe nadie). Solo el administrador escribe: subir el tope de visitantes cambia a quién '
  'se le niega la entrada.';

comment on column public.movilidad_config.cupos_visitante is
  'Cuántos vehículos de visitante caben a la vez. Null = sin control de capacidad.';

comment on column public.movilidad_config.horas_max_visitante is
  'Horas que puede permanecer dentro un vehículo de visitante antes de considerarse excedido. '
  'Null = sin límite. No expulsa a nadie: genera un asunto para que alguien lo mire.';

create trigger movilidad_config_updated_at
  before update on public.movilidad_config
  for each row execute function public.set_updated_at();
