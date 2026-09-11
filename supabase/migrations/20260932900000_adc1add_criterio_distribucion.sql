-- ADC-01-ADD (§14 PROMPT_01_ADAPTACION_COMERCIAL_CORE): allocate() en
-- financial-kernel ya es genérico (basisType='coefficient' acepta cualquier
-- DecimalValue), pero ejecutarDistribucion() en executor.ts hardcodeaba
-- siempre coeficiente × fracciónActiva como basis. Esto agrega el campo que
-- permite a un concepto elegir repartirse por área privada en vez de
-- coeficiente ("aseo comercial por m²"), sin tocar el kernel.
--
-- Enum, no lista_tipos (D-24): gatilla una rama de código real en
-- executor.ts (qué fórmula de reparto usa allocate()), no es vocabulario
-- descriptivo que un tenant deba poder extender.
create type public.concepto_criterio_distribucion_t as enum ('coeficiente', 'area_privada');

comment on type public.concepto_criterio_distribucion_t is
  'Selecciona qué basis usa allocate() en ejecutarDistribucion (packages/liquidation-engine/src/executor.ts): "coeficiente" (default, comportamiento histórico) o "area_privada". Gatilla una rama de código real, no es catálogo descriptivo — por eso enum y no lista_tipos (D-24).';

alter table public.conceptos
  add column criterio_distribucion public.concepto_criterio_distribucion_t not null default 'coeficiente';

comment on column public.conceptos.criterio_distribucion is
  'ADC-01-ADD (§14): base proporcional del Paso 2 de reparto (solo aplica con modo_calculo=distribucion). "area_privada" excluye y reporta como dato ausente (mismo mecanismo que agrupacion/tipo_inmueble, ver avisosAlcance) a los inmuebles elegibles que no tengan area_privada diligenciada, en vez de tratarlos como área cero.';
