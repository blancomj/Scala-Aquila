-- ═══════════════════════════════════════════════════════════════════════
--  EXS-5 · Vehículos y movilidad (1/4) — vocabulario
--  Casos de uso/Experiencia y servicios/EXS_05_INFORME.md
--
--  Cuatro familias descriptivas a lista_tipos (D-24) y dos enums, cada uno
--  porque gobierna una regla dura.
--
--  TIPO y SERVICIO van separados a propósito (prompt 04 §8): "automóvil"
--  y "particular" son dos dimensiones distintas, y colapsarlas en una sola
--  categoría obligaría a inventar valores como "automóvil-público" que se
--  multiplican con cada combinación.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre, descripcion) values
  ('TIPO_VEHICULO', 'Tipo de vehículo',
   'Qué clase de vehículo es (EXS-5 §7) — descriptivo. Puede crecer sin tocar código.'),
  ('SERVICIO_VEHICULO', 'Servicio del vehículo',
   'Particular, público u oficial (EXS-5 §8). Dimensión separada del tipo: un automóvil puede '
   'ser particular o de servicio público, y mezclarlas multiplicaría el catálogo.'),
  ('ROL_VEHICULO', 'Relación con el vehículo',
   'En qué calidad un tercero o un inmueble se relaciona con un vehículo (EXS-5 §10). No se '
   'reutiliza PERSONA_PREDIO: aquella dice cómo se relaciona alguien con un INMUEBLE '
   '(copropietario, arrendatario), y el propietario de un carro no tiene por qué serlo del '
   'apartamento — el prompt 04 §10 lo advierte explícitamente.'),
  ('TIPO_PERMISO_VEHICULO', 'Tipo de permiso vehicular',
   'Qué habilita un permiso (EXS-5 §17) — descriptivo; la vigencia y el estado son columnas.')
on conflict (codigo) do nothing;

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_VEHICULO', 'automovil', 'Automóvil', 10),
  ('TIPO_VEHICULO', 'motocicleta', 'Motocicleta', 20),
  ('TIPO_VEHICULO', 'camioneta', 'Camioneta', 30),
  ('TIPO_VEHICULO', 'camion', 'Camión', 40),
  ('TIPO_VEHICULO', 'furgon', 'Furgón', 50),
  ('TIPO_VEHICULO', 'bicicleta', 'Bicicleta', 60),
  ('TIPO_VEHICULO', 'otro', 'Otro', 70),

  ('SERVICIO_VEHICULO', 'particular', 'Particular', 10),
  ('SERVICIO_VEHICULO', 'publico', 'Público', 20),
  ('SERVICIO_VEHICULO', 'oficial', 'Oficial', 30),

  ('ROL_VEHICULO', 'propietario', 'Propietario del vehículo', 10),
  ('ROL_VEHICULO', 'responsable', 'Responsable', 20),
  ('ROL_VEHICULO', 'conductor', 'Conductor autorizado', 30),
  ('ROL_VEHICULO', 'empleado', 'Empleado', 40),
  ('ROL_VEHICULO', 'proveedor', 'Proveedor', 50),
  ('ROL_VEHICULO', 'empresa', 'Empresa', 60),

  ('TIPO_PERMISO_VEHICULO', 'acceso', 'Acceso vehicular', 10),
  ('TIPO_PERMISO_VEHICULO', 'parqueadero', 'Uso de parqueadero', 20),
  ('TIPO_PERMISO_VEHICULO', 'carga_descarga', 'Carga y descarga', 30);

-- ── Estados: enums, porque gobiernan reglas duras ─────────────────────

create type public.vehiculo_estado_t as enum ('activo', 'inactivo', 'retirado');

comment on type public.vehiculo_estado_t is
  'Estado de un vehículo (EXS-5). Enum y no lista_tipos (D-24) porque gobierna la unicidad de la '
  'placa: el índice único solo aplica a los NO retirados, de modo que una placa puede volver a '
  'registrarse cuando el vehículo anterior salió de la copropiedad, sin borrar su historia. '
  '''inactivo'' es una pausa reversible (el carro sigue siendo de la unidad pero no circula); '
  '''retirado'' es terminal y libera la placa.';

create type public.permiso_vehiculo_estado_t as enum ('vigente', 'revocado');

comment on type public.permiso_vehiculo_estado_t is
  'Estado de un permiso vehicular (EXS-5). Dos valores y no tres: "vencido" NO es un estado '
  'almacenado sino una consecuencia de vigente_hasta < hoy, derivada al consultar. Guardarlo '
  'exigiría un job que recorriera la tabla a diario solo para cambiar una columna que la fecha '
  'ya dice — el mismo criterio con que v_cargo_saldo deriva la mora en vez de persistirla.';
