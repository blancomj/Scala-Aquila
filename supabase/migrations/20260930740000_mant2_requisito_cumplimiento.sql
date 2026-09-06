-- ═══════════════════════════════════════════════════════════════════════
--  MANT-2 · Cumplimiento normativo — requisitos, no resolución automática
--
--  Plan del corte (aprobado 2026-09-06, ver DECISIONES.md D-53): el sistema
--  NUNCA afirma solo qué norma aplica a una copropiedad. En vez del diseño
--  original de dos tablas (`mant_requisito_catalogo` global e inmutable +
--  `mant_requisito_tenant` propio, resueltos por `mant_requisitos_aplicables()`
--  cruzando municipio/ámbito), se usa UNA sola tabla: `mant_requisito`, con
--  `tenant_id` nullable.
--
--  Las filas con `tenant_id is null` son semilla: los ~10 requisitos que la
--  investigación previa al corte verificó contra fuente primaria (ver
--  `Casos de uso/Tres Modulos/Mantenimiento/MANT_02_INVESTIGACION_NORMATIVA.md`).
--  Nunca se muestran en ninguna UI ni las toca ningún cliente autenticado —
--  no hay policy de RLS que las exponga a `authenticated`. Su único lector es
--  `fn_instanciar_requisitos_cumplimiento()` (SECURITY DEFINER, como
--  `create_tenant()`), que las copia a filas propias de cada tenant en el
--  momento del alta. Desde ese instante son 100% del tenant: editar la norma,
--  la fuente, la frecuencia o el acreditador, o quitarlas, no depende de que
--  el sistema haya adivinado bien el municipio — exactamente lo que pidió el
--  usuario ("quiero poder configurar todo de forma que no se dependa de
--  nadie").
--
--  Caso ejemplar: `ASCENSOR_REVISION_ANUAL` (NTC 5926) se siembra con
--  `norma_referencia`/`fuente_url` en null a propósito — la investigación
--  confirmó que esa norma nunca fue de obligatoriedad nacional (un proyecto
--  de ley de 2021 para lograrlo fue archivado) y depende de que cada
--  municipio la adopte por decreto propio. El administrador completa el
--  decreto de su municipio al editar la fila; el sistema no lo asume.
-- ═══════════════════════════════════════════════════════════════════════

create type public.requisito_tipo_t as enum (
  'legal_nacional', 'legal_territorial', 'tecnico_fabricante', 'contractual', 'interno'
);
comment on type public.requisito_tipo_t is
  'Origen de un requisito de cumplimiento de mantenimiento. legal_nacional/legal_territorial '
  'vienen de una norma pública (verificada o no contra fuente primaria — el campo '
  'norma_referencia/fuente_url de mant_requisito dice cuánto); tecnico_fabricante/contractual/'
  'interno son del propio tenant y exigen mant_requisito.norma_referencia no vacío '
  '(REQUISITO_SIN_REFERENCIA) porque no hay una norma pública detrás que los respalde solos. '
  'Gatilla la validación de guard_requisito_referencia — D-24: no es vocabulario descriptivo '
  'suelto, condiciona una regla real.';

create table public.mant_requisito (
  id                          uuid primary key default gen_random_uuid(),
  -- null = fila semilla global (nunca propiedad de ningún tenant real). No hay FK a tenants
  -- porque una fila semilla no tiene tenant; las filas de un tenant real sí lo tienen.
  tenant_id                   uuid references public.tenants (id) on delete cascade,
  -- Identificador estable de la semilla, para poder hacer ON CONFLICT DO NOTHING al
  -- instanciar (idempotente, igual que contable_cuenta_default). Null en requisitos propios
  -- que el tenant escribe a mano — nunca chocan con la semilla.
  codigo                      text,
  nombre                      text not null,
  tipo_fundamento             public.requisito_tipo_t not null,
  -- A qué tipo de activo aplica (lista_tipos TIPO_ACTIVO) — null si el requisito se evalúa a
  -- nivel de copropiedad y no de un activo físico registrado (p. ej. piscinas: MANT-0 no tiene
  -- un TIPO_ACTIVO 'piscina' sembrado; ampliar el catálogo de activos queda fuera de este corte).
  tipo_activo_id              bigint references public.lista_tipos (id),
  -- El "origen" que pidió el usuario: qué norma, decreto o resolución (o manual del
  -- fabricante/cláusula del contrato) — texto libre, no una FK a un catálogo cerrado.
  norma_referencia            text,
  fuente_url                  text,
  frecuencia_meses            integer,
  requiere_tercero_acreditado boolean not null default false,
  detalle                     text,
  -- "Quitar de mi copropiedad" = false, nunca DELETE físico: mant_cumplimiento puede haber
  -- registrado evidencia contra este id, y un registro de cumplimiento no se invalida porque
  -- el tenant deje de rastrear el requisito hacia adelante.
  activo                      boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint mant_requisito_frecuencia_positiva check (frecuencia_meses is null or frecuencia_meses > 0),
  constraint mant_requisito_nombre_no_vacio check (btrim(nombre) <> '')
);

-- Idempotencia de la instanciación: una semilla (codigo not null) no se duplica dos veces para
-- el mismo tenant. Parcial porque los requisitos propios (codigo null) no tienen ese concepto.
create unique index mant_requisito_tenant_codigo_idx
  on public.mant_requisito (tenant_id, codigo)
  where codigo is not null;

create index mant_requisito_tenant_idx on public.mant_requisito (tenant_id) where tenant_id is not null;
create index mant_requisito_tipo_activo_idx on public.mant_requisito (tipo_activo_id) where tipo_activo_id is not null;

alter table public.mant_requisito enable row level security;
alter table public.mant_requisito force row level security;

-- Sin policy que exponga tenant_id is null a `authenticated`: las filas semilla solo las lee
-- fn_instanciar_requisitos_cumplimiento (SECURITY DEFINER, corre como el dueño de la función).
create policy mant_requisito_select_miembro
  on public.mant_requisito for select
  to authenticated
  using (tenant_id is not null and public.is_member(tenant_id));

create policy mant_requisito_insert_auxiliar
  on public.mant_requisito for insert
  to authenticated
  with check (tenant_id is not null and public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_requisito_update_auxiliar
  on public.mant_requisito for update
  to authenticated
  using (tenant_id is not null and public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (tenant_id is not null and public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- Sin policy de delete: "quitar" es activo = false por UPDATE, nunca DELETE (ver comentario de
-- la columna `activo`). Sin policy para tenant_id is null bajo ningún verbo — intencional.

create function public.guard_requisito_referencia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo_fundamento in ('tecnico_fabricante', 'contractual', 'interno')
     and (new.norma_referencia is null or btrim(new.norma_referencia) = '') then
    raise exception 'REQUISITO_SIN_REFERENCIA: un requisito propio (%) exige norma_referencia — '
      'manual del fabricante, cláusula del contrato o acta', new.tipo_fundamento;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_requisito_referencia() is
  'Un requisito de origen tecnico_fabricante/contractual/interno no tiene una norma pública '
  'detrás — sin una referencia propia (manual, cláusula, acta) sería una invención. '
  'legal_nacional/legal_territorial pueden llegar sin norma_referencia (semilla sin verificar, '
  'p. ej. ASCENSOR_REVISION_ANUAL) porque el propio catálogo ya documenta que no se pudo '
  'verificar — no es una invención, es una `norma_referencia` pendiente de que el '
  'administrador la complete.';

create trigger mant_requisito_guard_referencia
  before insert or update on public.mant_requisito
  for each row execute function public.guard_requisito_referencia();

-- ═══════════════════════════════════════════════════════════════════════
--  Semilla global (tenant_id null) — las ~10 verificadas en la investigación
--  previa al corte. Fuente y fecha de verificación en cada comentario y en
--  MANT_02_INVESTIGACION_NORMATIVA.md / MANT_02_INFORME.md.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.mant_requisito
  (tenant_id, codigo, nombre, tipo_fundamento, tipo_activo_id, norma_referencia, fuente_url,
   frecuencia_meses, requiere_tercero_acreditado, detalle)
select null, v.codigo, v.nombre, v.tipo_fundamento::public.requisito_tipo_t,
       (select id from public.lista_tipos where tipo = 'TIPO_ACTIVO' and codigo = v.tipo_activo_codigo and tenant_id is null),
       v.norma_referencia, v.fuente_url, v.frecuencia_meses, v.requiere_tercero_acreditado, v.detalle
from (values
  ('PISCINA_CALIDAD_AGUA', 'Calidad de agua en piscinas', 'legal_nacional', null,
   'Resolución 000234 de 2026 · Minsalud, Art. 6 y 9',
   'https://www.minsalud.gov.co/Normatividad_Nuevo/Resolucion%20No%20234%20de%202026.pdf',
   3, true, 'Laboratorio acreditado ONAC'),
  ('PISCINA_SEGURIDAD', 'Seguridad en piscinas de uso restringido', 'legal_nacional', null,
   'Ley 1209/2008 + Decreto 554/2015, Art. 15 y 17',
   'https://sidn.ramajudicial.gov.co/SIDN/NORMATIVA/TEXTOS_COMPLETOS/5_DECRETOS/DECRETOS%202015/DECRETO%20554%20DE%202015%20(MEDIDAS%20DE%20SEGURIDAD%20EN%20LAS%20PISCINAS).PDF',
   null, false, 'Plan de seguridad + reglamento de uso'),
  ('TANQUE_LAVADO', 'Lavado de tanques de agua potable', 'legal_nacional', 'tanque',
   'Decreto 1575 de 2007, Art. 10',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=25322',
   6, false, null),
  ('EXTINTOR_MANTENIMIENTO', 'Mantenimiento de extintores portátiles', 'legal_nacional', 'extintor',
   'NTC 2885 · ICONTEC',
   'https://www.extingman.com/web/descargas/norma-icontec-extintores.pdf',
   12, true, 'Prueba hidrostática: 5 o 12 años según el agente'),
  ('INCENDIO_INSPECCION_ANUAL', 'Inspección anual de sistemas contra incendio', 'legal_nacional', null,
   'Ley 1575/2012 Art. 42, mod. Ley 1796/2016',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=78234',
   12, false, 'Cuerpo de bomberos: por definir según el municipio'),
  ('ASCENSOR_REVISION_ANUAL', 'Revisión anual de ascensores', 'legal_territorial', 'ascensor',
   null, null,
   12, true, 'La NTC 5926 no es de obligatoriedad nacional (proyecto de ley 109/2021C '
             'archivado) — completa el decreto de tu municipio y su enlace'),
  ('RETIE_INSTALACION_ELECTRICA', 'Certificado RETIE de instalación eléctrica', 'legal_nacional', 'tablero',
   'Resolución 40117 de 2024 · Min. Minas y Energía',
   'https://www.minenergia.gov.co/es/misional/energia-electrica-2/reglamentos-tecnicos/reglamento-t%C3%A9cnico-de-instalaciones-el%C3%A9ctricas-retie/',
   120, true, '10 años si la instalación es básica, 5 si es especial — confírmalo con tu instalador'),
  ('RETILAP_ILUMINACION', 'Revisión RETILAP de iluminación común', 'legal_nacional', 'luminaria',
   'Resolución 40150 de 2024 · Min. Minas y Energía',
   'https://www.minenergia.gov.co/es/misional/energia-electrica-2/reglamentos-tecnicos/reglamento-t%C3%A9cnico-de-iluminaci%C3%B3n-y-alumbrado-p%C3%BAblico-retilap/',
   null, false, 'No se encontró periodicidad de reinspección verificada'),
  ('GAS_REVISION_INSTALACION', 'Revisión de instalación interna de gas', 'legal_nacional', null,
   'NTC 2505 + Resolución 90902/2013',
   'https://normativa.colpensiones.gov.co/colpens/docs/resolucion_mininterior_0661_2014.htm',
   60, true, 'Empresa distribuidora local: por definir'),
  ('INCENDIO_ROCIADORES', 'Mantenimiento de redes y rociadores contra incendio', 'legal_nacional', null,
   'NSR-10, Título J.4.3 (remite a NFPA 25, sin verificar)',
   'https://idrd.gov.co/sites/default/files/documentos/Construcciones/10titulo-j-nsr-100.pdf',
   null, false, null)
) as v(codigo, nombre, tipo_fundamento, tipo_activo_codigo, norma_referencia, fuente_url,
       frecuencia_meses, requiere_tercero_acreditado, detalle);

-- ═══════════════════════════════════════════════════════════════════════
--  Instanciación — mismo contrato que fn_instanciar_cuentas_default
--  (20260903120000): idempotente, devuelve cuántas creó/ya existían. A
--  diferencia de aquella (SECURITY INVOKER), esta corre SECURITY DEFINER:
--  copiar filas semilla fijas no necesita que RLS re-autorice nada — es un
--  acto de sistema (como el propio create_tenant()), no una escritura que
--  el usuario esté formulando.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_instanciar_requisitos_cumplimiento(p_tenant_id uuid)
returns table (creadas integer, existentes integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creadas integer := 0;
  v_total   integer;
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'TENANT_INEXISTENTE: %', p_tenant_id;
  end if;

  insert into public.mant_requisito
    (tenant_id, codigo, nombre, tipo_fundamento, tipo_activo_id, norma_referencia, fuente_url,
     frecuencia_meses, requiere_tercero_acreditado, detalle)
  select p_tenant_id, r.codigo, r.nombre, r.tipo_fundamento, r.tipo_activo_id, r.norma_referencia,
         r.fuente_url, r.frecuencia_meses, r.requiere_tercero_acreditado, r.detalle
  from public.mant_requisito r
  where r.tenant_id is null
  on conflict (tenant_id, codigo) where codigo is not null do nothing;

  get diagnostics v_creadas = row_count;

  select count(*) into v_total from public.mant_requisito where tenant_id = p_tenant_id;

  return query select v_creadas, (v_total - v_creadas)::integer;
end;
$$;

comment on function public.fn_instanciar_requisitos_cumplimiento(uuid) is
  'Copia los requisitos semilla (mant_requisito.tenant_id is null) a filas propias del tenant. '
  'Idempotente por (tenant_id, codigo) — nunca duplica ni pisa un requisito que el tenant ya '
  'haya editado o cuya semilla ya haya sido copiada. Llamada desde create_tenant() en el alta; '
  'también sirve de backfill para tenants creados antes de este corte.';
