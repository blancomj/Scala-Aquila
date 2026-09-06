-- ═══════════════════════════════════════════════════════════════════════
--  CO-5 · Catálogo de notas a los estados financieros (§4.3) — 14 notas
--  obligatorias, con cuerpo generado a partir de cifras reales y editable
--  por el usuario sin perder la marca de edición.
--
--  Fundamento nuevo de esta serie: Ley 675 de 2001 art. 35 (fondo de imprevistos, nota 5) —
--  citado en comentarios de código desde PC-7/fondos pero nunca registrado como fila de
--  fundamento_normativo. Las demás notas reutilizan citas ya registradas (CTCP 0146/0270/0330/
--  0331, DUR 2420) — no se duplican.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.fundamento_normativo
  (tenant_id, tipo, norma, articulo, descripcion, referencia, fecha_validacion)
values
  (null, 'ley', 'Ley 675 de 2001', '35',
   'Obliga a toda copropiedad a constituir un fondo de imprevistos — base legal de la nota 5 '
   '(fondo de imprevistos) de los estados financieros.',
   'ley_675_2001_art_35', null);

create table public.contable_nota_plantilla (
  id                      uuid primary key default gen_random_uuid(),
  codigo                  text not null unique,
  numero                  smallint not null unique,
  titulo                  text not null,
  -- Placeholders {{token}} sustituidos por fn_generar_notas() con cifras reales del ejercicio.
  cuerpo_plantilla        text not null,
  -- null = ambos grupos (la mayoría); las notas exclusivas de un grupo (ninguna hoy) usarían esto.
  marco_grupo             public.marco_contable_grupo_t,
  obligatoria             boolean not null default true,
  orden                   smallint not null,
  fundamento_normativo_id bigint references public.fundamento_normativo (id),
  created_at              timestamptz not null default now()
);

alter table public.contable_nota_plantilla enable row level security;
alter table public.contable_nota_plantilla force row level security;

comment on table public.contable_nota_plantilla is
  'Catálogo global de las 14 notas obligatorias (CO-5 §4.3) — sin tenant_id, no editable por el '
  'tenant. numero se corresponde en ambos sentidos con contable_estado_linea.nota_referencia.';

create policy contable_nota_plantilla_select_authenticated
  on public.contable_nota_plantilla for select
  to authenticated
  using (true);

create table public.contable_nota (
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  id           uuid primary key default gen_random_uuid(),
  ejercicio    int not null,
  plantilla_id uuid not null references public.contable_nota_plantilla (id),
  numero       smallint not null,
  titulo       text not null,
  cuerpo       text not null,
  estado       text not null default 'generada' check (estado in ('generada', 'editada')),
  generada_at  timestamptz not null default now(),
  editada_por  uuid references public.profiles (id),
  editada_at   timestamptz,

  constraint contable_nota_unica unique (tenant_id, ejercicio, plantilla_id)
);

alter table public.contable_nota enable row level security;
alter table public.contable_nota force row level security;

create index contable_nota_tenant_ejercicio_idx on public.contable_nota (tenant_id, ejercicio);

comment on table public.contable_nota is
  'La nota concreta de un tenant y ejercicio, generada con cifras reales por fn_generar_notas() '
  'y editable después — una nota editada conserva la marca de edición (estado=editada, '
  'editada_por/editada_at estampados por trigger, nunca por el cliente) y no se pierde al '
  'regenerar el resto (CO-5 §4.3, prueba 12).';

-- Estampa estado/editada_por/editada_at cuando el cuerpo cambia — igual criterio que
-- acuerdos_pago (aprobado_por/aprobado_at): el cliente nunca fija estos campos a mano.
create function public.guard_nota_edicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cuerpo is distinct from old.cuerpo then
    new.estado := 'editada';
    new.editada_por := (select auth.uid());
    new.editada_at := now();
  else
    new.estado := old.estado;
    new.editada_por := old.editada_por;
    new.editada_at := old.editada_at;
  end if;
  return new;
end;
$$;

create trigger guard_nota_edicion
  before update on public.contable_nota
  for each row execute function public.guard_nota_edicion();

create policy contable_nota_select_miembro
  on public.contable_nota for select
  to authenticated
  using (public.is_member(tenant_id));

create policy contable_nota_update_auxiliar
  on public.contable_nota for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

insert into public.contable_nota_plantilla (codigo, numero, titulo, cuerpo_plantilla, orden)
values
  ('entidad_reportante', 1, 'Entidad reportante',
   '{{nombre}}, NIT {{nit}}, con domicilio en {{direccion}}, {{ciudad}}, es una copropiedad '
   'sometida al régimen de propiedad horizontal (Ley 675 de 2001), de uso {{uso_economico}}.', 1),

  ('bases_preparacion', 2, 'Bases de preparación',
   'Los presentes estados financieros se prepararon de acuerdo con el marco técnico normativo '
   'aplicable a las entidades del {{marco_grupo_nombre}} (Decreto Único Reglamentario 2420 de '
   '2015). Se expresan en pesos colombianos (COP). Se prepararon bajo la hipótesis de negocio '
   'en marcha.', 2),

  ('politicas_contables', 3, 'Políticas contables significativas',
   'Las expensas comunes se reconocen como ingreso al causarse, según el presupuesto aprobado '
   'por la asamblea. Los intereses de mora se causan sobre la cartera vencida según la '
   'política financiera vigente. El deterioro de cartera se reconoce según la política de '
   'deterioro vigente de la copropiedad. La propiedad, planta y equipo se deprecia por el '
   'método de línea recta según su vida útil estimada.', 3),

  ('efectivo_equivalentes', 4, 'Efectivo y equivalentes',
   'El efectivo y equivalentes de efectivo suman {{total_efectivo}} a la fecha de corte, '
   'discriminados por cuenta bancaria: {{desglose_cuentas_bancarias}}. De este total, '
   '{{saldo_fondo_imprevistos}} corresponde al fondo de imprevistos, que se presenta dentro '
   'del efectivo como restringido — nunca como pasivo ni patrimonio (CTCP Concepto 2025-0146).', 4),

  ('fondo_imprevistos', 5, 'Fondo de imprevistos',
   'El fondo de imprevistos, constituido en cumplimiento del artículo 35 de la Ley 675 de 2001, '
   'presentó el siguiente movimiento durante el ejercicio: saldo inicial {{saldo_inicial}}, '
   'recaudos {{recaudos}}, usos {{usos}}, rendimientos financieros {{rendimientos}}, saldo '
   'final {{saldo_final}}. Los rendimientos financieros del fondo se reconocen en el estado de '
   'resultados (CTCP Concepto 2025-0270/2025-0331), no como mayor valor del fondo.', 5),

  ('cuentas_por_cobrar', 6, 'Cuentas por cobrar',
   'La cartera por cobrar a copropietarios, clasificada por antigüedad de vencimiento, es: '
   '{{cartera_por_antiguedad}}. El deterioro de cartera reconocido acumulado a la fecha de '
   'corte es {{deterioro_reconocido}}, calculado según la política de deterioro vigente: '
   '{{politica_deterioro_resumen}}.', 6),

  ('propiedad_planta_equipo', 7, 'Propiedad, planta y equipo',
   'El saldo de propiedad, planta y equipo a la fecha de corte es {{saldo_ppe}}. '
   '{{advertencia_ppe}}', 7),

  ('cuentas_por_pagar', 8, 'Cuentas por pagar y proveedores',
   'Las cuentas por pagar y obligaciones con proveedores y contratistas, por naturaleza, son: '
   '{{cuentas_por_pagar_por_naturaleza}}.', 8),

  ('patrimonio', 9, 'Patrimonio',
   'La composición y movimiento del patrimonio durante el ejercicio se detalla en el estado de '
   'cambios en el patrimonio (Grupo 2) o se resume así: patrimonio social {{patrimonio_social}}, '
   'resultados de ejercicios anteriores {{resultados_anteriores}}, excedente (déficit) del '
   'ejercicio {{resultado_ejercicio}}.', 9),

  ('ingresos', 10, 'Ingresos',
   'Los ingresos del ejercicio, por naturaleza, son: {{ingresos_por_naturaleza}}.', 10),

  ('gastos', 11, 'Gastos',
   'Los gastos del ejercicio, por naturaleza, son: {{gastos_por_naturaleza}}.', 11),

  ('ejecucion_presupuestal', 12, 'Ejecución presupuestal frente a lo aprobado',
   'La ejecución del presupuesto aprobado para el ejercicio, por cuenta presupuestal, frente a '
   'lo presupuestado, es: {{ejecucion_presupuestal}}.', 12),

  ('hechos_posteriores', 13, 'Hechos posteriores',
   'No se han identificado hechos posteriores a la fecha de corte que requieran ajuste o '
   'revelación en estos estados financieros.', 13),

  ('litigios_contingencias', 14, 'Litigios y contingencias',
   'Los procesos jurídicos activos de cobro de cartera a la fecha de corte son: '
   '{{litigios_activos}}. Monto total en pretensión: {{total_pretension}}.', 14);

update public.contable_nota_plantilla
   set fundamento_normativo_id = (select id from public.fundamento_normativo where referencia = 'ley_675_2001_art_35')
 where codigo = 'fondo_imprevistos';
