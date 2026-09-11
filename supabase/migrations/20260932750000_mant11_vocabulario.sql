-- ═══════════════════════════════════════════════════════════════════════
--  MANT-11 · Visitantes y control de acceso (1/5) — vocabulario
--  Casos de uso/Solicitudes - Reservas - Visitantes/MANT_11_visitantes_acceso.md §4.1, §4.4
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre, descripcion) values
  ('TIPO_VISITA', 'Tipo de Visita', 'Clasificación de una autorización de visita (MANT-11 §4.1).');

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_VISITA', 'social', 'Social', 1),
  ('TIPO_VISITA', 'domicilio', 'Domicilio', 2),
  ('TIPO_VISITA', 'servicio_domestico', 'Servicio doméstico', 3),
  ('TIPO_VISITA', 'mudanza', 'Mudanza', 4),
  ('TIPO_VISITA', 'proveedor_puntual', 'Proveedor puntual', 5);

create type public.autorizacion_visita_estado_t as enum (
  'vigente', 'usada', 'vencida', 'revocada'
);

comment on type public.autorizacion_visita_estado_t is
  'Ciclo de vida de una autorización de visita (MANT-11 §4.1): vigente -> usada (consumida por '
  'portería vía fn_autorizacion_visita_consumir); vigente -> vencida (derivado de qr_expira_at, '
  'nunca escrito directamente — ver mant_autorizaciones_visita_vencidas); vigente -> revocada (el '
  'residente cambia de idea antes de que llegue el visitante). usada/revocada son terminales '
  '(AUTORIZACION_ESTADO_INMUTABLE).';

create type public.autorizacion_origen_t as enum ('externo', 'staff');

comment on type public.autorizacion_origen_t is
  'Quién autoriza la visita (MANT-11 §4.1): staff (un miembro operando por el inmueble) o externo '
  '(un actor_externo_vinculo, EXT-01). Gatilla el guard AUTORIZACION_INMUEBLE_NO_VINCULADO, que '
  'solo aplica cuando el origen es externo — mismo criterio que reserva_solicitante_t (MANT-10).';

-- ── rol funcional "Recepción" (decisión confirmada con el usuario) ─────────
insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('ROL_FUNCIONAL', 'recepcion', 'Recepción', 5);

insert into public.rol_funcional_modulo (lista_tipos_id, modulo)
select lt.id, 'porteria'
from public.lista_tipos lt
where lt.tipo = 'ROL_FUNCIONAL' and lt.codigo = 'recepcion' and lt.tenant_id is null;
