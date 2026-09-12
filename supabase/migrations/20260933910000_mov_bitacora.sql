-- ═══════════════════════════════════════════════════════════════════════
--  MOV-1 (2/3) · La bitácora: qué cruzó el portón y cuándo
--
--  UNA FILA POR PASO, y el paso es el hecho: no se actualiza una fila de
--  "visita en curso" al salir. Una bitácora que se edita deja de ser
--  bitácora — si la salida corrigiera la fila de entrada, nadie podría
--  reconstruir después qué se registró en su momento. La permanencia se
--  DERIVA emparejando (misma placa, salida posterior a la entrada), igual
--  que `autorizado` se deriva en EXS-5 en vez de guardarse.
--
--  SE REGISTRA TAMBIÉN LO NO AUTORIZADO. Es la decisión que define esta
--  tabla: una bitácora que solo anota lo permitido no sirve para
--  seguridad, porque el evento que se quiere reconstruir es justamente el
--  inesperado. Por eso `vehiculo_id` es NULLABLE —la placa puede no estar
--  registrada— y `autorizado` se guarda como FOTO del momento.
--
--  `autorizado` ES LA EXCEPCIÓN A "no guardar lo derivado", y conviene
--  dejar escrito por qué: en EXS-5 se calcula en vivo desde los permisos
--  vigentes, y eso es correcto para "¿puede entrar ahora?". Pero la
--  pregunta de una bitácora es otra: "¿estaba autorizado CUANDO entró?".
--  Un permiso revocado la semana pasada cambiaría hoy la respuesta sobre
--  un hecho de hace un mes, que es exactamente lo que un registro no debe
--  permitir. Se guarda la foto, no la fórmula.
--
--  La placa se guarda como TEXTO y no como FK: mismo criterio que
--  `mant_autorizaciones_visita.vehiculo_placa` (EXS-5). Un carro que nunca
--  se registró debe poder quedar anotado sin crear un vehículo fantasma en
--  el inventario. La normalizada va en columna GENERADA, así que ningún
--  camino —ni service_role— puede guardar una sin normalizar.
-- ═══════════════════════════════════════════════════════════════════════

create table public.vehiculo_paso (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants (id) on delete cascade,
  placa                   text not null,
  placa_normalizada       text generated always as (public.fn_normalizar_placa(placa)) stored,
  -- Nullable a propósito: lo interesante es poder anotar la placa que NO
  -- está en el inventario.
  vehiculo_id             uuid references public.vehiculos (id) on delete set null,
  -- La visita que llegó en carro: se apunta a la misma autorización de
  -- MANT-11 en vez de copiar sus datos.
  autorizacion_visita_id  uuid references public.mant_autorizaciones_visita (id) on delete set null,
  sentido                 public.vehiculo_sentido_t not null,
  momento                 timestamptz not null default now(),
  -- Foto, no fórmula (ver cabecera).
  autorizado              boolean not null,
  es_visitante            boolean not null default false,
  registrado_por          uuid references auth.users (id) on delete set null,
  observaciones           text,
  created_at              timestamptz not null default now(),
  constraint vehiculo_paso_placa_no_vacia check (btrim(placa) <> '')
);

alter table public.vehiculo_paso enable row level security;
alter table public.vehiculo_paso force row level security;

-- Lo ve cualquier miembro que pueda ver el módulo: la bitácora es
-- información de seguridad de la copropiedad, no de una persona.
create policy vehiculo_paso_select_miembro on public.vehiculo_paso
  for select to authenticated
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'movilidad'));

-- Sin policy de INSERT, UPDATE ni DELETE para `authenticated`, y es
-- deliberado: la escritura entra por `fn_vehiculo_registrar_paso`, que es
-- quien decide si estaba autorizado y aplica la capacidad. Un insert
-- directo podría afirmar "autorizado = true" sobre cualquier placa, que es
-- justo lo que la bitácora no debe permitir. Sin DELETE tampoco: un
-- registro de portería que se puede borrar no prueba nada.

create index vehiculo_paso_tenant_momento_idx
  on public.vehiculo_paso (tenant_id, momento desc);

create index vehiculo_paso_placa_idx
  on public.vehiculo_paso (tenant_id, placa_normalizada, momento desc);

-- "Qué hay dentro ahora" se resuelve buscando el último paso de cada
-- placa; el índice parcial acota el barrido a las entradas, que es el
-- extremo que importa.
create index vehiculo_paso_entradas_idx
  on public.vehiculo_paso (tenant_id, placa_normalizada, momento desc)
  where sentido = 'entrada';

comment on table public.vehiculo_paso is
  'MOV-1 — bitácora de portería: un registro por cada paso de un vehículo, en los dos sentidos. '
  'Append-only por construcción (no hay policy de escritura para authenticated: se escribe por '
  'fn_vehiculo_registrar_paso). Registra TAMBIÉN lo no autorizado — una bitácora que solo anota '
  'lo permitido no sirve para reconstruir un incidente. No duplica mant_registros_acceso, que '
  'registra el ingreso de PERSONAS contra una autorización: cuando una visita llega en carro, '
  'este paso apunta a la misma autorización.';

comment on column public.vehiculo_paso.autorizado is
  'Si el vehículo estaba autorizado EN ESE MOMENTO. Se guarda, a diferencia del `autorizado` '
  'derivado de fn_vehiculo_por_placa, porque la pregunta es distinta: revocar hoy un permiso no '
  'puede cambiar lo que se registró hace un mes.';

comment on column public.vehiculo_paso.vehiculo_id is
  'Nullable: una placa que no está en el inventario también se anota. Sin esto, el vehículo '
  'desconocido —el caso interesante— no dejaría rastro.';

comment on column public.vehiculo_paso.es_visitante is
  'Marca el paso como de visitante, que es lo que cuenta contra los cupos de movilidad_config. '
  'Se decide al registrar: hay autorización de visita, o la placa no pertenece al inventario.';
