-- ═══════════════════════════════════════════════════════════════════════
--  CO-6 · Cierre, apertura y corrección de errores — tabla contable_correccion
--  (Casos de uso/Tres Modulos/Contabilidad/CO_06_cierre_apertura_correccion.md §3.6)
--
--  Por qué existe: "un asiento contabilizado no se edita, se corrige con reversión +
--  comprobante nuevo" (CO_00_MARCO_OBLIGATORIO.md §5.8) ya se cumple mecánicamente desde CO-2
--  (fn_reversar_comprobante), pero no hay ningún registro que enlace el comprobante original,
--  su reversión y el comprobante correcto como UNA sola operación de corrección — sin esa traza
--  explícita, un revisor fiscal no puede reconstruir "por qué se corrigió esto" sin adivinar
--  cruzando fechas. `grep -rn "contable_correccion" supabase/migrations/` confirma que no existe
--  bajo ningún nombre.
--
--  tipo_correccion es texto libre (no lista_tipos): el corte no enumera una vocabulario cerrado
--  de "naturaleza del error" (valor equivocado, cuenta equivocada, omisión...) y D-24 exige que
--  el vocabulario de lista_tipos venga de un catálogo real, no inventado por este agente — se
--  deja como descripción libre que quien corrige redacta, igual que `motivo`.
--
--  Qué queda deliberadamente fuera de esta migración: la lógica de negocio de cuándo aplica cada
--  ruta (periodo abierto/cerrado, ejercicio abierto/cerrado, grupo del tenant) es
--  fn_contable_corregir_error, en una migración aparte.
-- ═══════════════════════════════════════════════════════════════════════

create table public.contable_correccion (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants (id) on delete cascade,
  comprobante_origen_id   uuid not null references public.contable_comprobante (id),
  -- NULL en la ruta de Grupo 3 con ejercicio cerrado (CTCP 0146/2025 corrige en el periodo
  -- corriente, sin reversar el original — el original queda intacto, con la traza de todos
  -- modos aquí). NOT NULL en la ruta de periodo cerrado con ejercicio abierto (reversión real).
  comprobante_reversion_id uuid references public.contable_comprobante (id),
  comprobante_correcto_id uuid not null references public.contable_comprobante (id),
  motivo                  text not null check (btrim(motivo) <> ''),
  tipo_correccion         text not null check (btrim(tipo_correccion) <> ''),
  fundamento_normativo_id bigint references public.fundamento_normativo (id),
  creado_por              uuid references public.profiles (id),
  created_at              timestamptz not null default now()
);

alter table public.contable_correccion enable row level security;
alter table public.contable_correccion force row level security;

create index contable_correccion_tenant_idx on public.contable_correccion (tenant_id);
create index contable_correccion_origen_idx on public.contable_correccion (comprobante_origen_id);

comment on table public.contable_correccion is
  'CO-6 §3.6: traza de cada corrección de un error en un periodo ya cerrado — enlaza el '
  'comprobante origen (el error), su reversión (NULL si la ruta no reversa, Grupo 3 con '
  'ejercicio cerrado) y el comprobante correcto. La escribe únicamente '
  'fn_contable_corregir_error (security definer); no hay policy de insert/update/delete para '
  'authenticated — es append-only por diseño, igual que audit_log (SEC-14), aunque no es la '
  'misma tabla porque necesita los tres FK tipados a contable_comprobante, no un metadata jsonb.';
comment on column public.contable_correccion.tipo_correccion is
  'Descripción libre de la naturaleza del error (valor, cuenta, tercero, omisión...) — texto, no '
  'lista_tipos: el corte no cierra un catálogo de valores y D-24 prohíbe inventarlo.';

create policy contable_correccion_select_miembro
  on public.contable_correccion for select to authenticated
  using (public.is_member(tenant_id));

comment on policy contable_correccion_select_miembro on public.contable_correccion is
  'Visible para cualquier miembro del tenant, incluido el rol auditor (CO-6 §3.7) — no hay '
  'policy de escritura para authenticated, solo fn_contable_corregir_error (security definer) '
  'inserta.';
