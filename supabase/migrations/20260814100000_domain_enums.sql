-- ═══════════════════════════════════════════════════════════════════════
--  F2 · Tipos enumerados del dominio PH
--  Propietario: PLAN_MAESTRO_IMPLEMENTACION.md §4
-- ═══════════════════════════════════════════════════════════════════════

create type public.inmueble_tipo_t as enum (
  'apartamento', 'casa', 'local', 'oficina', 'parqueadero', 'deposito', 'otro'
);

create type public.inmueble_estado_t as enum ('activo', 'inactivo');

create type public.zona_comun_tipo_t as enum (
  'recreativa', 'tecnica', 'transito', 'servicio', 'parqueadero', 'deposito', 'otra'
);

-- Reutilizado por coeficiente_sets y politicas_financieras (§4.3): ambos son
-- "versionado con vigencia histórica inmutable" — la misma semántica, un
-- solo tipo (21 §6 anti-redundancia).
create type public.vigencia_estado_t as enum ('borrador', 'vigente', 'historica');

create type public.periodo_estado_t as enum (
  'abierto', 'en_liquidacion', 'cerrado', 'bloqueado'
);

create type public.concepto_tipo_base_t as enum (
  'fijo', 'coeficiente', 'cantidad', 'porcentaje', 'saldo'
);

-- §4.3.2: resuelve la incompatibilidad entre 16 §22 y 19 (paso0/INFORME_PASO_0.md §2).
create type public.concepto_modo_calculo_t as enum ('directo', 'distribucion');

create type public.concepto_estado_t as enum ('borrador', 'activo', 'archivado');

create type public.redondeo_modo_t as enum ('half_up', 'half_even', 'down', 'up');

create type public.residual_metodo_t as enum ('mayor_resto');

create type public.fondo_base_calculo_t as enum ('presupuesto_anual', 'cuota_administracion');

create type public.presupuesto_estado_t as enum ('borrador', 'aprobado', 'vigente', 'cerrado');

create type public.presupuesto_rubro_categoria_t as enum (
  'administracion', 'vigilancia', 'aseo', 'mantenimiento', 'servicios_publicos', 'seguros', 'otros'
);

create type public.fondo_tipo_t as enum ('imprevistos', 'otro');

create type public.fondo_movimiento_tipo_t as enum ('aporte', 'uso');

comment on type public.concepto_modo_calculo_t is
  'directo: la fórmula AEL devuelve el importe del inmueble. distribucion: la fórmula '
  'devuelve el TOTAL a repartir y el motor de allocation (19) hace el reparto — '
  'prohibido calcular el importe por inmueble en la fórmula cuando modo_calculo = '
  'distribucion (PLAN §4.3.2, verificado por test).';
