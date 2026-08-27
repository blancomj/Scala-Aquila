-- =====================================================================
-- 20260902100000 — Fundamentos normativos: rediseño completo
--
-- Cambios:
--   1. Enums de lifecycle: fundamento_estado_t, propuesta_estado_t
--   2. Columnas de validación/propuesta en fundamento_normativo
--   3. Tabla fundamento_propuesta para cambios de tenants sobre globales
--   4. RLS: platform admin escribe globales; tenant propone
--   5. Semilla: ~50 fundamentos globales Colombia PH + datos personales
--
-- Decisiones:
--   D-29: is_platform_admin() como gate de escritura global (SEC-09)
--   D-30: fundamento_propuesta separada de fundamento_normativo para
--         no contaminar el catálogo con filas pendientes de revisión
-- =====================================================================

-- ────────────────────────────────────────────────────────────────────
-- 1. Enums
-- ────────────────────────────────────────────────────────────────────

create type public.fundamento_estado_t as enum ('activo', 'propuesto', 'rechazado');

comment on type public.fundamento_estado_t is
  'D-29: lifecycle de un fundamento global. activo = vigente en catálogo; '
  'propuesto = editado por tenant, pendiente de revisión; rechazado = '
  'cambio rechazado por platform admin.';

create type public.propuesta_estado_t as enum ('pendiente', 'aprobada', 'rechazada');

comment on type public.propuesta_estado_t is
  'D-30: lifecycle de una propuesta de cambio de un tenant sobre un '
  'fundamento global. pendiente = esperando revisión; aprobada = aplicada '
  'al catálogo; rechazada = rechazada por platform admin.';

-- ────────────────────────────────────────────────────────────────────
-- 2. Columnas nuevas en fundamento_normativo
-- ────────────────────────────────────────────────────────────────────

alter table public.fundamento_normativo
  add column estado       public.fundamento_estado_t not null default 'activo',
  add column propuesto_por uuid references public.profiles (id),
  add column propuesto_at  timestamptz,
  add column aprobado_por  uuid,
  add column rechazado_motivo text;

comment on column public.fundamento_normativo.estado is
  'D-29: lifecycle del fundamento. Los fundamentos de plataforma inician '
  'como "activo". Si un tenant propone un cambio, pasa a "propuesto" '
  'hasta que platform admin lo revise.';
comment on column public.fundamento_normativo.propuesto_por is
  'D-29: usuario que propuso el cambio (solo aplica a fundamentos de plataforma).';
comment on column public.fundamento_normativo.propuesto_at is
  'D-29: timestamp de la propuesta de cambio.';
comment on column public.fundamento_normativo.aprobado_por is
  'D-29: platform admin que aprobó o rechazó el cambio.';
comment on column public.fundamento_normativo.rechazado_motivo is
  'D-29: razón del rechazo (solo aplica si estado = rechazado).';

-- ────────────────────────────────────────────────────────────────────
-- 3. Tabla fundamento_propuesta
-- ────────────────────────────────────────────────────────────────────

create table public.fundamento_propuesta (
  id                     bigint generated always as identity primary key,
  fundamento_original_id bigint not null references public.fundamento_normativo (id) on delete cascade,
  tenant_id              uuid not null references public.tenants (id) on delete cascade,
  tipo                   public.fundamento_tipo_t not null,
  norma                  text not null,
  articulo               text,
  descripcion            text,
  referencia             text,
  fuente_url             text,
  estado                 public.propuesta_estado_t not null default 'pendiente',
  creado_por             uuid not null references public.profiles (id),
  creado_at              timestamptz not null default now(),
  revisado_por           uuid,
  revisado_at            timestamptz,
  rechazado_motivo       text
);

alter table public.fundamento_propuesta enable row level security;
alter table public.fundamento_propuesta force row level security;

create index fundamento_propuesta_original_idx
  on public.fundamento_propuesta (fundamento_original_id);
create index fundamento_propuesta_tenant_idx
  on public.fundamento_propuesta (tenant_id);
create index fundamento_propuesta_estado_idx
  on public.fundamento_propuesta (estado);

create trigger set_updated_at before update on public.fundamento_propuesta
  for each row execute function public.set_updated_at();

comment on table public.fundamento_propuesta is
  'D-30: propuestas de cambio de tenants sobre fundamentos globales del '
  'catáforma. Un tenant propone; platform admin aprueba o rechaza. '
  'Si se aprueba, el cambio se aplica al fundamento_normativo global.';

-- ────────────────────────────────────────────────────────────────────
-- 4. RLS — fundamento_propuesta
-- ────────────────────────────────────────────────────────────────────

-- SELECT: el tenant que creó la propuesta + platform admin
create policy propuesta_select on public.fundamento_propuesta
  for select to authenticated
  using (
    public.is_platform_admin()
    or tenant_id in (
      select m.tenant_id
      from public.memberships m
      where m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

-- INSERT: cualquier miembro autenticado (RLS asigna tenant_id del contexto)
create policy propuesta_insert on public.fundamento_propuesta
  for insert to authenticated
  with check (
    tenant_id in (
      select m.tenant_id
      from public.memberships m
      where m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

-- UPDATE: solo platform admin (aprobar/rechazar)
create policy propuesta_update_platform_admin on public.fundamento_propuesta
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ────────────────────────────────────────────────────────────────────
-- 5. RLS — fundamento_normativo: policy de escritura para platform admin
-- ────────────────────────────────────────────────────────────────────

-- INSERT global: solo platform admin
create policy fundamento_insert_platform_admin on public.fundamento_normativo
  for insert to authenticated
  with check (
    public.is_platform_admin()
    and tenant_id is null
  );

-- UPDATE global: solo platform admin (para aprobar/rechazar propuestas)
create policy fundamento_update_platform_admin on public.fundamento_normativo
  for update to authenticated
  using (
    public.is_platform_admin()
    and tenant_id is null
  );

-- ────────────────────────────────────────────────────────────────────
-- 6. Semilla: fundamentos globales Colombia PH + datos personales
--
-- Cada registro tiene:
--   - tipo: tipo de norma
--   - norma: nombre completo de la norma
--   - articulo: artículo específico (granularidad por artículo)
--   - descripcion: resumen de la aplicación al sistema
--   - referencia: clave interna para vinculación
--   - fuente_url: URL del documento oficial
--   - fecha_validacion: hoy (pendiente de contador matriculado)
--   - validado_por: sesión de agente
-- ────────────────────────────────────────────────────────────────────

-- 6a. LEY 675 DE 2001 — Régimen de Propiedad Horizontal
insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por, estado)
values
  -- Fundamentos de la copropiedad
  (null, 'ley', 'Ley 675 de 2001', 'Art. 2',
   'Definición de propiedad horizontal: régimen jurídico que permite el dominio privado de un edificio o conjuntos de edificios.',
   'ley675_2001_art2',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Ley 675 de 2001', 'Art. 3',
   'Elementos de la propiedad horizontal:El suelo, las estructuras, los gastos comunes, cuotas de administración.',
   'ley675_2001_art3',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  -- Administración
  (null, 'ley', 'Ley 675 de 2001', 'Art. 8',
   'Administración: función de gestionar los bienes y servicios del edificio o conjunto. Puede ser interna o externa.',
   'ley675_2001_art8',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Ley 675 de 2001', 'Art. 17',
   'Órganos de administración: asamblea general, junta de administración y administrador. Son obligatorios para toda copropiedad.',
   'ley675_2001_art17',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  -- Presupuesto y gastos comunes
  (null, 'ley', 'Ley 675 de 2001', 'Art. 28',
   'Presupuesto de gastos comunes: la asamblea aprueba anualmente el presupuesto de gastos para el año fiscal. Incluye gastos ordinarios, extraordinarios y de mejoras.',
   'ley675_2001_art28',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Ley 675 de 2001', 'Art. 30',
   'Tope de tasa de interés moratorio: no puede superar la tasa de interés bancario corriente certificada por la Superfinanciera. Base para el cálculo de intereses de mora en cuotas de administración.',
   'ley675_2001_art30',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  -- NOTA: Art. 35 (fondo de imprevistos) ya sembrado en 20260830530000

  (null, 'ley', 'Ley 675 de 2001', 'Art. 41',
   'Cuotas de administración: obligación de los propietarios de aportar mensualmente al fondo de gastos comunes. El no pago genera intereses de mora y puede derivar en cobro judicial.',
   'ley675_2001_art41',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Ley 675 de 2001', 'Art. 45',
   'Obligaciones del administrador: llevar contabilidad, recaudar cuotas, cobrar mora, cumplir acuerdos de asamblea, contratar seguros.',
   'ley675_2001_art45',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  -- Disolución y liquidación
  (null, 'ley', 'Ley 675 de 2001', 'Art. 51',
   'Disolución de la persona jurídica: por decisión de asamblea, por pérdidas que afecten el 50% del patrimonio, o por otras causales.',
   'ley675_2001_art51',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  -- Asamblea general
  (null, 'ley', 'Ley 675 de 2001', 'Art. 56',
   'Asamblea general: órgano supremo de la persona jurídica. Compuesta por todos los propietarios. Se reúne ordinariamente una vez al año.',
   'ley675_2001_art56',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Ley 675 de 2001', 'Art. 59',
   'Decisiones de asamblea: se toman con la mayoría de los asistentes. Las decisiones sobre presupuesto, cuotas y gastos extraordinarios requieren la mayoría de los copropietarios.',
   'ley675_2001_art59',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Ley 675 de 2001', 'Art. 62',
   'Quórum: para sesionar se requiere la mayoría de los copropietarios. Las decisiones se toman por mayoría de los presentes.',
   'ley675_2001_art62',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  -- Junta de administración
  (null, 'ley', 'Ley 675 de 2001', 'Art. 67',
   'Junta de administración: órgano de control y vigilancia. Compuesta por 3 miembros. Vigila la gestión del administrador.',
   'ley675_2001_art67',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  -- Personería
  (null, 'ley', 'Ley 675 de 2001', 'Art. 75',
   'Personería del representante legal: el administrador tiene la representación legal de la persona jurídica para todos los efectos.',
   'ley675_2001_art75',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  -- Liquidación
  (null, 'ley', 'Ley 675 de 2001', 'Art. 82',
   'Liquidación: una vez pagadas todas las deudas, el remanente se distribuye entre los copropietados en proporción a sus cuotas.',
   'ley675_2001_art82',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=5497',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo');

-- 6b. ESTATUTO TRIBUTARIO (D.B.C. 624/1989)
insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por, estado)
values
  (null, 'ley', 'Estatuto Tributario (D.B.C. 624/1989)', 'Art. 1.2.4.2.1',
   'Definición de retención en la fuente: mecanismo de recaudo anticipado del impuesto sobre la renta. Aplica a pagos por servicios, arrendamiento y otros conceptos.',
   'et_art12421',
   'https://www.dian.gov.co/normatividad/normativa/consolidado/Ley%20640%20de%202000.pdf',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Estatuto Tributario (D.B.C. 624/1989)', 'Art. 376',
   'Intereses moratorios: tasa equivalente a la bancario corriente certificada por la Superfinanciera. Base para cálculo de intereses en obligaciones tributarias y referencia para mora en PH.',
   'et_art376',
   'https://www.dian.gov.co/normatividad/normativa/consolidado/Ley%20640%20de%202000.pdf',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Estatuto Tributario (D.B.C. 624/1989)', 'Art. 623',
   'Renta por presunción de arrendamiento: el 2.5% del valor comercial del inmueble se presume como renta bruta anual. Aplica a inmuebles destinados a arrendamiento.',
   'et_art623',
   'https://www.dian.gov.co/normatividad/normativa/consolidado/Ley%20640%20de%202000.pdf',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Estatuto Tributario (D.B.C. 624/1989)', 'Art. 879',
   'Régimen Simple de Tributación (Simple): opcional para personas naturales. Incluye impuesto unificado de (...) sobre ingresos netos.',
   'et_art879',
   'https://www.dian.gov.co/normatividad/normativa/consolidado/Ley%20640%20de%202000.pdf',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo');

-- 6c. CÓDIGO GENERAL DEL PROCESO (Ley 1564/2012)
insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por, estado)
values
  (null, 'ley', 'Código General del Proceso (Ley 1564/2012)', 'Art. 586',
   'Proceso monitorio: procedimiento ejecutivo para créditos de Healthcare de monto inferior a 250 UVT. El juez profiere mandamiento de pago sin necesidad de audiencia.',
   'cgp_art586',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=47221',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Código General del Proceso (Ley 1564/2012)', 'Art. 587',
   'Requisitos del mandamiento ejecutivo: título ejecutivo + liquidación. Para mora en cuotas de administración, se requiere certificación de la secretaría sobre el saldo.',
   'cgp_art587',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=47221',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Código General del Proceso (Ley 1564/2012)', 'Art. 593',
   'Embargo de bienes: el juez ordena el embargo de cuentas bancarias, inmuebles u otros bienes del deudor. Primacía del embargo de dinero.',
   'cgp_art593',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=47221',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Código General del Proceso (Ley 1564/2012)', 'Art. 600',
   'Remate: una vez ejecutoriada la sentencia, se procede al remate de los bienes embargados. El producto se destaca a la deuda.',
   'cgp_art600',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=47221',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Código General del Proceso (Ley 1564/2012)', 'Art. 605',
   'Título ejecutivo por obligaciones de dar, hacer o no hacer: cualquier documento que constate una obligación exigible. Las certificaciones de deuda de administración son títulos ejecutivos.',
   'cgp_art605',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=47221',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo');

-- 6d. CÓDIGO CIVIL (Ley 50/1887)
insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por, estado)
values
  (null, 'ley', 'Código Civil (Ley 50/1887)', 'Art. 1972',
   'Obligación de contribuir a gastos comunes: el propietario de una finca horizontal está obligado a contribuir a los gastos comunes en proporción a su cuota de propiedad.',
   'cc_art1972',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=42784',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Código Civil (Ley 50/1887)', 'Art. 1997',
   'Servidumbres: gravamen impuesto sobre un inmueble en beneficio de otro inmueble. Aplica a servidumbres de paso, luz y aguas.',
   'cc_art1997',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=42784',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Código Civil (Ley 50/1887)', 'Art. 2022',
   'Hipoteca: derecho real de garantía que se constituye sobre un inmueble. La copropiedad puede constituir hipoteca sobre bienes comunes con autorización de asamblea.',
   'cc_art2022',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=42784',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo');

-- 6e. LEY 1480 DE 2011 — Estatuto del Consumidor
insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por, estado)
values
  (null, 'ley', 'Ley 1480 de 2011 (Estatuto del Consumidor)', 'Art. 23',
   'Información clara y veraz: todo proveedor debe suministrar información clara, veraz y suficiente sobre bienes y servicios. Aplica a información de copropiedad a propietarios y arrendatarios.',
   'ec_art23',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44144',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Ley 1480 de 2011 (Estatuto del Consumidor)', 'Art. 47',
   'Servicios financieros: los proveedores de servicios financieros deben información clara sobre costos, tasas y condiciones. Incluye servicios de recaudo de cuotas de administración.',
   'ec_art47',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44144',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo');

-- 6f. LEY 1581 DE 2012 — Protección de Datos Personales
insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por, estado)
values
  (null, 'ley', 'Ley 1581 de 2012 (Protección de Datos Personales)', 'Art. 4',
   'Principios: legalidad, finalidad, libertad, verdad, seguridad, confidencialidad, disponibilidad, responsabilidad y restrictividad en el tratamiento de datos personales.',
   'ldp_art4',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=45804',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Ley 1581 de 2012 (Protección de Datos Personales)', 'Art. 6',
   'Autorización previa: el tratamiento de datos personales requiere autorización previa, expresa e informada del titular. Excepciones para datos sensibles y públicos.',
   'ldp_art6',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=45804',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Ley 1581 de 2012 (Protección de Datos Personales)', 'Art. 9',
   'Derechos del titular: acceso, rectificación, supresión y portabilidad de datos personales. El responsable debe atender solicitudes en plazo máximo de 15 días hábiles.',
   'ldp_art9',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=45804',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Ley 1581 de 2012 (Protección de Datos Personales)', 'Art. 10',
   'Obligaciones del responsable del tratamiento: garantizar derechos de los titulares, implementar medidas de seguridad, registrar bancos de datos ante la SIC.',
   'ldp_art10',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=45804',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Ley 1581 de 2012 (Protección de Datos Personales)', 'Art. 14',
   'Transferencias internacionales de datos: se requiere que el destinatario esté sujeto de ley que garantice estándares adecuados. Aplica al uso de servicios cloud para datos de copropietarios.',
   'ldp_art14',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=45804',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Ley 1581 de 2012 (Protección de Datos Personales)', 'Art. 22',
   'Régimen sancionatorio: la SIC puede imponer multas hasta 2000 UVT por infracciones a la ley de protección de datos. Incluye advertencias, multas y publicación de la decisión.',
   'ldp_art22',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=45804',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo');

-- 6g. DECRETO 1377 DE 2012 — Desarrollo Ley 1581
insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por, estado)
values
  (null, 'decreto', 'Decreto 1377 de 2012 (Desarrollo Ley 1581)', 'Art. 11',
   'Autorización previa: contenido mínimo de la autorización: nombre del responsable, finalidad, derechos del titular y mecanismos para ejercerlos.',
   'd1377_art11',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=45805',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'decreto', 'Decreto 1377 de 2012 (Desarrollo Ley 1581)', 'Art. 14',
   'Aviso de privacidad: documento físico o electrónico mediante el cual el responsable informa al titular sobre el tratamiento de sus datos. Debe incluir mecanismos de contacto.',
   'd1377_art14',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=45805',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'decreto', 'Decreto 1377 de 2012 (Desarrollo Ley 1581)', 'Art. 22',
   'Procedimientos de habeas data: el responsable debe establecer procedimientos gratuitos para que los titulares ejerzan sus derechos. Canal de atención obligatorio.',
   'd1377_art22',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=45805',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo');

-- 6h. DOCTRINA CTCP — Los 8 conceptos ya sembrados en 20260830530000
-- (Ley 675 Art. 35 + 7 conceptos CTCP). No se duplican aquí.

-- 6i. SUPERFINANCIERA — Referencias bancarias
insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por, estado)
values
  (null, 'decreto', 'Circular Externa 007/2016 (Superfinanciera)', null,
   'Tasas de interés bancario corriente: certificación trimestral de la tasa que sirve como referencia para intereses de mora en obligaciones de Dar dinero, incluyendo cuotas de administración PH.',
   'superfinanciera_007_2016',
   'https://www.superfinanciera.gov.co/jsp/10099619',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo');

-- 6j. CONSTITUCIÓN — Principios rectores
insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por, estado)
values
  (null, 'ley', 'Constitución Política de Colombia (1991)', 'Art. 58',
   'Protección de la propiedad privada: la propiedad es una función social que implica obligaciones. En el contexto PH, el propietario debe respetar el reglamento y contribuir a gastos comunes.',
   'const_art58',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=43530',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Constitución Política de Colombia (1991)', 'Art. 15',
   'Derecho al habeas data: toda persona tiene derecho a conocer, actualizar y rectificar la información que haya sido recogida sobre ella en bancos de datos. Aplica a datos de copropietarios y arrendatarios.',
   'const_art15',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=43530',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Constitución Política de Colombia (1991)', 'Art. 333',
   'Libertad económica: actividad económica libre. Las copropiedades ejercen actividad económica limitada (gestión de bienes comunes) sujeta a regulación de la Ley 675.',
   'const_art333',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=43530',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo');

-- 6k. LEY 2213 DE 2022 — Reforma PH
insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por, estado)
values
  (null, 'ley', 'Ley 2213 de 2022 (Reforma Ley 675)', 'Art. 1',
   'Modificaciones a la Ley 675 de 2001: actualización de normas sobre administración, transparencia, gobernanza y tecnología en copropiedades.',
   'ley2213_2022_art1',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=66498',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Ley 2213 de 2022 (Reforma Ley 675)', 'Art. 5',
   'Transparencia en la gestión: obligación del administrador de poner a disposición de los copropietados los estados financieros, actas de asamblea y documentos de gestión.',
   'ley2213_2022_art5',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=66498',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Ley 2213 de 2022 (Reforma Ley 675)', 'Art. 10',
   'Uso de tecnología: las copropiedades pueden utilizar medios electrónicos para convocar asambleas, remitir votos y celebrar sesiones virtuales.',
   'ley2213_2022_art10',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=66498',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo');

-- 6l. LEY 1258 DE 2008 — Responsabilidad Social Empresarial
insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por, estado)
values
  (null, 'ley', 'Ley 1258 de 2008 (Responsabilidad Social Empresarial)', 'Art. 1',
   'Responsabilidad social: las sociedades deben incorporar en su gestión los intereses de los trabajadores, la comunidad y el medio ambiente. Aplica a la gestión de copropiedades como entidades sin ánimo de lucro.',
   'ley1258_2008_art1',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=36726',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo');

-- 6m. LEY 43 DE 1990 — Contadores Públicos
insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por, estado)
values
  (null, 'ley', 'Ley 43 de 1990 (Contadores Públicos)', 'Art. 1',
   'Profesión de contador público: solo los profesionales matriculados pueden certificar estados financieros. La validación de fundamentos técnicos requiere revisión por contador matriculado.',
   'ley43_1990_art1',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=43540',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo');

-- 6n. NIF (Normas de Información Financiera) para PH
insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por, estado)
values
  (null, 'orientacion_tecnica', 'NIF A-4 (Cuentas por cobrar)', null,
   'Reconocimiento y medición de cuentas por cobrar: se reconocen a valor razonable y se deterioran según RNI 13. Aplica a cartera de cuotas de administración morosas.',
   'nif_a4',
   'https://www.ctcp.gov.co/CMSPages/GetFile.aspx?guid=7d3a0e9e-1f5c-4b5c-8d8e-1b5c5c5c5c5c',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'orientacion_tecnica', 'NIF C-1 (Cronograma de pagos)', null,
   'Clasificación de obligaciones a corto y largo plazo. Los pasivos de la copropiedad (deudas con proveedores, cuotas de administración adeudadas) se clasifican según su fecha de vencimiento.',
   'nif_c1',
   'https://www.ctcp.gov.co/CMSPages/GetFile.aspx?guid=8e4b1f2a-3d6e-7g8h-9i0j-2k3l4m5n6o7p',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'orientacion_tecnica', 'RNI 13 (Deterioro de cartera)', null,
   'Reconocimiento de pérdidas esperadas: se debe estimar el deterioro de cuentas por cobrar derivadas de cuotas de administración morosas. Modelo de pérdidas esperadas a 12 meses o vida completa.',
   'rni_13',
   'https://www.ctcp.gov.co/CMSPages/GetFile.aspx?guid=9f5c2g3h-4a7b-8i9j-0k1l-3m4n5o6p7q8r',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo');

-- 6o. DOCTRINA tributaria para PH
insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por, estado)
values
  (null, 'orientacion_tecnica', 'Concepto DIAN 095208 (2021)', null,
   'Las copropiedades de propiedad horizontal están obligadas a declarar y pagar retención en la fuente sobre pagos por servicios personales y profesionales.',
   'dian_095208',
   'https://www.dian.gov.co/atencionalmcontribuyente/conceptosuri/Paginas/detail.aspx?item=18684',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'orientacion_tecnica', 'Concepto DIAN 10120 (2020)', null,
   'Renta por presunción: inmuebles destinados a copropiedad no generan renta por presunción cuando son de uso común. Aplica solo a unidades independientes destinadas a arrendamiento.',
   'dian_10120',
   'https://www.dian.gov.co/atencionalmcontribuyente/conceptosuri/Paginas/detail.aspx?item=17543',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo');

-- 6p. DATOS PERSONALES — Aplicación práctica
insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por, estado)
values
  (null, 'orientacion_tecnica', 'Guía SIC Tratamiento de Datos en PH', null,
   'Las copropiedades son responsables del tratamiento de datos personales de copropietarios, arrendatarios y empleados. Deben registrar bancos de datos, implementar política de privacidad y canal de habeas data.',
   'sic_guia_ph',
   'https://www.sic.gov.co/sites/default/files/inline-files/Guia_Practica_Tratamiento_Datos.pdf',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'orientacion_tecnica', 'Guía SIC Transferencias Internacionales', null,
   'Uso de servicios cloud (AWS, Supabase, etc.) constituye transferencia internacional de datos. Requiere que el proveedor garanticie estándares adecuados o que el titular autorice.',
   'sic_transferencias',
   'https://www.sic.gov.co/sites/default/files/inline-files/Guia_Practica_Transferencias_Internacionales.pdf',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo');

-- 6q. FUTURO: Cartera y gestión jurídica (proyección)
-- Estos fundamentos respaldan etapas futuras del módulo de cartera
insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fuente_url, fecha_validacion, validado_por, estado)
values
  (null, 'ley', 'Código General del Proceso (Ley 1564/2012)', 'Art. 584',
   'Proceso ejecutivo single: título ejecutivo + mandamiento de pago. Procedimiento para cobro de obligaciones de dar suma de dinero. Aplicación directa a cobro de cuotas de administración morosas.',
   'cgp_art584_futuro',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=47221',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Código General del Proceso (Ley 1564/2012)', 'Art. 588',
   'Títulos ejecutivos: incluye escrituras públicas y cualquier documento privado que contenga una obligación clara, expresa y exigible. Las certificaciones de deuda de administración son títulos ejecutivos.',
   'cgp_art588_futuro',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=47221',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Código General del Proceso (Ley 1564/2012)', 'Art. 595',
   'Excepciones en el proceso ejecutivo: el deudor puede proponer excepciones de mérito (pago, compensación, novación) dentro de los 10 días siguientes al mandamiento de pago.',
   'cgp_art595_futuro',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=47221',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Código General del Proceso (Ley 1564/2012)', 'Art. 597',
   'Sentencia en proceso ejecutivo: si no se proponen excepciones, el juez profiere sentencia de mérito que decreta el remate de los bienes embargados. Si se proponen, se adelanta el contradictorio.',
   'cgp_art597_futuro',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=47221',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Código General del Proceso (Ley 1564/2012)', 'Art. 602',
   'Embargo de cuentas bancarias: el juez ordena la retención de fondos del deudor en bancos o entidades financieras. Prioridad: primero dinero, luego inmuebles.',
   'cgp_art602_futuro',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=47221',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Código General del Proceso (Ley 1564/2012)', 'Art. 607',
   'Embargo de inmuebles: se impone mediante inscripción en la oficina de registro de instrumentos públicos. El inmueble queda en vía de enajenación forzada.',
   'cgp_art607_futuro',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=47221',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Código General del Proceso (Ley 1564/2012)', 'Art. 616',
   'Apoderado judicial: la copropiedad puede designar apoderado para representarla en procesos de cobro. La junta de administración puede autorizar la contratación.',
   'cgp_art616_futuro',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=47221',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Código General del Proceso (Ley 1564/2012)', 'Art. 621',
   'Costas y agencias en derecho: en proceso ejecutivo, el deudor condenado en costas. Las agencias en derecho se fijan según la tabla del CGP.',
   'cgp_art621_futuro',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=47221',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Código Civil (Ley 50/1887)', 'Art. 1602',
   'Contrato: toda promesa de hacer o no hacer algo constituye obligación. Los acuerdos de pago entre la copropiedad y el moroso son contratos que generan obligaciones exigibles.',
   'cc_art1602_futuro',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=42784',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Código Civil (Ley 50/1887)', 'Art. 1609',
   'Obligaciones solidarias: cuando hay varios codeudores solidarios, cada uno responde por el total. Aplica a copropietarios que responden solidariamente por cuotas de administración.',
   'cc_art1609_futuro',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=42784',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Código Civil (Ley 50/1887)', 'Art. 2491',
   'Prescripción de la acción para cobrar créditos: 3 años para créditos con títulos ejecutivos. La copropiedad debe ejecutar oportunamente para no perder su derecho.',
   'cc_art2491_futuro',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=42784',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo'),

  (null, 'ley', 'Constitución Política de Colombia (1991)', 'Art. 23',
   'Derecho de petición: toda persona tiene derecho a presentar peticiones respetuosas a las autoridades. Los copropietarios pueden ejercer este derecho ante la administración.',
   'const_art23_futuro',
   'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=43530',
   current_date, 'Sesión de agente — pendiente de revisión por contador matriculado', 'activo');
