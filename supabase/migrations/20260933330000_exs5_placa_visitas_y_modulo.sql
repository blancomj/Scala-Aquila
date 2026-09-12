-- ═══════════════════════════════════════════════════════════════════════
--  EXS-5 · Vehículos (4/4) — la visita que llega en carro, y el módulo
--
--  La otra mitad de la decisión de alcance: el visitante puntual sigue
--  siendo de MANT-11, pero hasta ahora no había dónde anotar en qué carro
--  llega. Es una columna, no una tabla: la autorización ya existe, solo le
--  faltaba ese dato.
--
--  Deliberadamente NO es una FK a vehiculos. El carro de un visitante no
--  pertenece a la copropiedad y no debe crear una fila en el inventario de
--  vehículos — si la creara, acabaría contando como "vehículo de la
--  copropiedad" en cualquier listado y compitiendo por la unicidad de
--  placa con los que sí lo son.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.mant_autorizaciones_visita
  add column vehiculo_placa text,
  add column vehiculo_placa_normalizada text
    generated always as (
      case
        when vehiculo_placa is null then null
        else public.fn_normalizar_placa(vehiculo_placa)
      end
    ) stored;

create index mant_autorizaciones_visita_placa_idx
  on public.mant_autorizaciones_visita (tenant_id, vehiculo_placa_normalizada)
  where vehiculo_placa_normalizada is not null;

comment on column public.mant_autorizaciones_visita.vehiculo_placa is
  'EXS-5 — placa del vehículo en el que llega el visitante, cuando llega en uno. Texto y NO una '
  'FK a vehiculos a propósito: el carro de un visitante no pertenece a la copropiedad, y '
  'registrarlo como vehículo lo metería en el inventario y le haría competir por la unicidad de '
  'placa con los que sí son de aquí.';

comment on column public.mant_autorizaciones_visita.vehiculo_placa_normalizada is
  'Columna generada con la misma fn_normalizar_placa que usa vehiculos: portería busca una placa '
  'una sola vez y encuentra tanto al residente como al visitante esperado, sin depender de cómo '
  'la tecleó cada quien.';

-- ── El módulo 'movilidad' ─────────────────────────────────────────────
--
--  Mismo criterio que 'anuncios' en EXS-3: quién puede ver el módulo lo
--  decide puede_ver_modulo(), y sembrar los roles existentes evita el
--  efecto perverso de que asignar un rol funcional cualquiera oculte los
--  vehículos. Aquí, además, el caso es claro: portería y administración
--  necesitan consultar una placa sin importar su especialidad.

insert into public.rol_funcional_modulo (lista_tipos_id, modulo)
select lt.id, 'movilidad'
from public.lista_tipos lt
where lt.tipo = 'ROL_FUNCIONAL'
on conflict (lista_tipos_id, modulo) do nothing;
