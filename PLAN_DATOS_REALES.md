# PLAN — De GC-001 a un tenant real (liquidar con datos reales)

## 1. Contexto

Barrido amplio (2026-08-15) sobre el estado del repo para identificar qué
bloquea pasar de "el motor funciona contra el golden case sembrado (GC-001)"
a "un administrador real puede dar de alta su copropiedad y liquidar un
periodo real". Hallazgo central: **el motor de liquidación, cuenta
corriente, intereses y novedades ya está probado con tenants "frescos"**
(`tests/tenancy/*` no usa GC-001, arma sus propios fixtures) — el bloqueo
no es el motor, es que **no existe ninguna ruta que un admin real pueda
usar para cargar los datos de entrada**. Hoy esos datos solo existen vía
script SQL de seed.

Este documento no reabre `AD-23` (pipeline Artifact/VM sigue diferido) ni
toca AEL — es la continuación natural de F0-F6
(`PLAN_MAESTRO_IMPLEMENTACION.md`), cerrando la brecha entre "el motor
calcula bien" y "un admin real puede operarlo".

## 2. Qué ya existe (confirmado por código, no supuesto)

Antes de diseñar nada, se verificó el estado real de schema/RLS para no
proponer trabajo que ya está hecho:

| Tabla | Migración | RLS `agent` (CRUD) | UI que la use |
| --- | --- | --- | --- |
| `inmuebles` | `20260814100100_domain_tables.sql:26` | ✅ completo (`20260814100200...sql:20-34`) | ❌ ninguna |
| `zonas_comunes` | íd. `:51` | ✅ completo | ❌ ninguna |
| `coeficiente_sets` / `coeficientes` | íd. `:84`/`:107` | ✅ INSERT/SELECT (sin UPDATE en set — inmutable por diseño, ver guard) | ❌ ninguna |
| `propietarios` | íd. `:126` | ✅ completo | ❌ ninguna |
| `inmueble_propietario` | íd. `:149` | ✅ completo | ❌ ninguna |
| `periodos` | íd. `:171` | ✅ INSERT/UPDATE (sin DELETE — transiciona, no se borra) | ❌ ninguna (solo `cargarPeriodos`, sin `crearPeriodo`) |
| `tenants` (nit/dirección/moneda/zona_horaria) | íd. `:19-23` | ✅ `tenants_update_agent` (`20260813190300...sql:36`) | ❌ solo lectura en el store; `configuracion/index.vue` es placeholder explícito |
| `pagos` / `pago_aplicaciones` | `20260816100000_cuenta_corriente_ledger.sql:64`/`:90` | ✅ (vía `registrar-pago` Edge Function, no directo) | ✅ registro manual ya existe |

**Implicación importante para el diseño**: para los ítems 1 y 2, **no hace
falta ninguna migración nueva ni Edge Function** — el schema y las
políticas RLS de escritura para `agent` ya están completas y ya pasaron
`db:types`. Es estrictamente trabajo de UI + store, exactamente el mismo
patrón ya usado en `presupuesto/index.vue` y `politicas/index.vue`
("UI mínima... alcanza para probar el flujo completo"). Esto cambia
sustancialmente el tamaño estimado de los ítems 1 y 2 frente al barrido
inicial.

## 3. Los 5 alcances

### 3.1 — Onboarding de datos maestros (inmuebles, propietarios, coeficientes, periodos)

**Qué falta**: páginas (o una sola página con secciones, siguiendo el
patrón de `presupuesto/index.vue`) + store Pinia para cada entidad, con
CRUD directo contra Supabase (sin Edge Function — mismo patrón que
`presupuestoStore`/`politicaFinancieraStore`, no el patrón `create-tenant`
que usa `service_role` porque esa sí cruza el límite de autenticación).

**Orden de dependencia** (cada uno depende del anterior):

1. **Inmuebles** — CRUD simple: código, tipo, matrícula, área privada/común,
   estado. Sin dependencias.
2. **Propietarios** — CRUD simple: tipo/número documento, nombre, email,
   teléfono. Sin dependencias (AD-26: no crea `auth.users`, es dato puro).
3. **`inmueble_propietario`** — vincula 1-2, con `porcentaje`/`desde`/`hasta`.
   Requiere ya tener al menos un inmueble y un propietario.
4. **`coeficiente_sets` + `coeficientes`** — un set por versión, con una fila
   de `coeficientes` por inmueble existente. `suma_total` la calcula el
   cliente (Σ valores) y se envía tal cual — el motor no la recalcula (16
   §82: "no se asume 1.0"). **Punto abierto real**: ¿el modal de creación
   debe **bloquear** si Σ ≠ 1.0000000000, o solo advertir? El motor de
   liquidación probablemente sí lo exige en algún guard — hay que revisar
   `guard_coeficiente_set_inmutable`/el motor antes de decidir UX (no
   asumir, igual que se hizo con GAP-19 en presupuesto).
5. **Periodos** — falta hasta el método de store `crearPeriodo` (no existe
   ninguno hoy). CRUD mínimo: año, mes, fecha de vencimiento. Sin
   dependencias de los anteriores, pero es el último input antes de poder
   ejecutar `liquidar-periodo`.

**Riesgo/decisión abierta explícita** (ya señalada en el propio schema,
`zonas_comunes` comment, línea 78-81): *"un mismo bien nunca existe en las
dos tablas [inmuebles / zonas_comunes] debe validarse por constraint...
requiere decisión antes de F6"* — F6 ya pasó. Si se construye este ítem, se
puede seguir sin esa validación cruzada (igual que el motor hoy), pero
debe quedar anotado como deuda conocida, no descubierto a mitad de
implementación.

**Tamaño estimado**: el más grande de los 5 en superficie (5 entidades),
pero el de menor riesgo técnico — no hay decisiones de arquitectura, solo
repetir un patrón ya validado 2 veces en este repo.

### 3.2 — Configuración del tenant

**Qué falta**: reemplazar el placeholder de `apps/web/app/pages/configuracion/index.vue`
por un formulario real: `nombre` (ya existe desde `create-tenant`), `nit`,
`direccion`, `moneda` (select ISO-4217, default `COP`), `zona_horaria`
(select IANA, default `America/Bogota`). Guardar vía `UPDATE tenants` — RLS
ya lo permite (`tenants_update_agent`).

**Decisión abierta**: ¿`moneda`/`zona_horaria` deben poder cambiarse
*después* de que ya existan `presupuestos`/`liquidaciones` en esa moneda?
Cambiar la moneda de un tenant con historial ya calculado en COP sería
incoherente con todo lo persistido. Sugerencia: permitir edición libre
solo mientras el tenant no tenga ningún presupuesto `vigente`/`cerrado`
(mismo criterio de inmutabilidad progresiva que ya usa el resto del
dominio) — pero es una decisión de producto, no una que deba tomar
unilateralmente.

**Tamaño estimado**: el más pequeño de los 5 — un formulario, sin tablas
nuevas, sin Edge Function.

### 3.3 — Generación de documento (estado de cuenta / factura)

**Qué falta**: todo. No hay ninguna dependencia de PDF en `package.json` de
ningún paquete (`jsPDF`, `puppeteer`, `pdfkit`, nada). Dos enfoques
posibles, con trade-offs reales:

- **A. Cliente (jsPDF/similar) desde `cuenta-corriente/index.vue`** — cero
  infraestructura nueva, pero el documento nunca pasa por el servidor
  (no se puede archivar/reenviar de forma confiable, y la maquetación con
  jsPDF puro es limitada para algo con tabla + logo + totales).
- **B. Server-side (Edge Function que renderiza HTML→PDF, o un servicio
  externo tipo Puppeteer-as-a-service)** — permite archivar el PDF generado
  (relevante si más adelante se quiere adjuntar al email del ítem 3.4),
  pero Supabase Edge Functions corren en Deno/V8 aislado — Puppeteer no
  corre ahí sin un servicio externo (Browserless, un microservicio propio,
  etc.), lo que agrega una dependencia operativa nueva.

**No se puede decidir A vs. B sin el usuario** — es una decisión de
arquitectura con costo operativo distinto, no un detalle de
implementación. Ninguna opción tiene código previo en el repo del que
partir.

**Prerrequisito de datos**: el documento necesita mostrar `nombre`/`nit`
del tenant (→ depende de 3.2 para tener datos reales, no placeholder) y el
detalle de cargos por inmueble (`cuenta-corriente/index.vue` ya tiene esa
consulta — es reutilizable).

**Tamaño estimado**: mediano-grande, y el único de los 5 con una decisión
de arquitectura genuina pendiente antes de estimar en detalle.

### 3.4 — Notificación real a residentes

**Qué falta**: hoy Brevo (`supabase/functions/invite-user/index.ts:33-35`)
solo envía invitaciones de **usuarios de plataforma** (agent/auditor,
tienen `auth.users`). Los propietarios/residentes son **datos, no
usuarios** (`AD-26` — `propietarios` no tiene FK a `auth.users`, sin login,
sin sesión). Esto tiene una implicación de diseño real: **no se les puede
enviar nada a través del mismo mecanismo de sesión/RLS que usa
`invite-user`** — el envío tiene que ser un job/Edge Function con
`service_role` que lea `propietarios.email` directamente (columna que ya
existe: `20260814100100_domain_tables.sql:132`, tipo `citext`).

**Sub-alcances posibles, cada uno un incremento independiente**:

1. Email de estado de cuenta al cerrar un periodo (necesita 3.3 si se
   adjunta el PDF, pero puede ir solo con un resumen en texto/HTML primero).
2. Recordatorio de mora (cuándo dispara: ¿al vencer `fecha_vencimiento` del
   periodo? ¿cada corrida de `calcular-intereses`? — necesita definir
   cadencia, no solo el envío).
3. Reutilizar la infraestructura de rate-limiting/plantillas de `invite-user`
   (`supabase/functions/_shared/rate_limit.ts`) — aplica igual aquí, un
   tenant no debería poder disparar 500 emails por accidente en un loop.

**Decisión abierta**: `propietarios.email` es opcional (nullable) — ¿qué
pasa con un propietario sin email? Silenciosamente no se le notifica, o
se marca visible en la UI como "sin contacto"? Es una decisión de UX de
producto, no técnica.

**Tamaño estimado**: mediano — la infraestructura de Brevo ya existe y es
reutilizable, pero el disparador (cuándo se envía cada tipo de
notificación) es una decisión funcional que falta tomar.

### 3.5 — Pasarela de pago real

**Qué falta**: todo — `registrar-pago` hoy es 100% manual (un `agent`
transcribe `{monto, fecha_pago, referencia}` de lo que sea que haya
recibido por fuera). No hay cliente HTTP hacia ninguna pasarela, ni
columnas para modelarlo: `pagos` (línea 64-73) no tiene `medio_pago`,
`pasarela_transaccion_id`, ni `estado_conciliacion` — habría que
extender la tabla (migración nueva) antes de cualquier código.

**Esto es, con diferencia, el ítem de mayor riesgo/superficie de los 5**:

- Requiere elegir proveedor (PSE/Wompi son las opciones típicas para
  Colombia — no hay ninguna pista en el repo de cuál prefiere el negocio).
- Requiere un **webhook público** (Edge Function sin `verify_jwt`, como
  ya se corrigió una vez en D-19 para `create-tenant` por error — aquí
  sería *intencional*, pero exige verificación de firma HMAC del
  proveedor para no aceptar webhooks falsificados — superficie de
  seguridad nueva que no existe hoy en ningún otro punto del sistema).
- Requiere reconciliación: qué pasa si el webhook llega duplicado, fuera
  de orden, o para un pago que ya se registró manualmente por error.
  `pagos` es *append-only* (trigger `pagos_append_only`) — un pago
  duplicado no se puede corregir con UPDATE, tendría que ser una
  `novedad` de ajuste (mismo patrón que ya usa el motor para
  descuentos), lo cual es coherente con el diseño existente pero hay
  que decidirlo explícitamente antes de escribir el webhook.

**Tamaño estimado**: el más grande y el más riesgoso — es el único ítem de
los 5 que introduce una dependencia externa real (una pasarela de pago) y
una superficie de ataque nueva (webhook público). No se puede planear en
más detalle sin decidir primero el proveedor.

## 4. Orden de ejecución recomendado

```
3.1 Onboarding de datos maestros   ← sin esto nada más importa; cero riesgo de diseño
3.2 Configuración del tenant       ← trivial, se puede hacer junto con 3.1
──────────────────────────────────  (con 3.1+3.2 ya se puede liquidar un tenant real)
3.4 Notificación a residentes      ← infraestructura ya existe, solo falta decidir disparadores
3.3 Generación de documento        ← necesita decisión A/B antes de estimar
3.5 Pasarela de pago                ← el más grande; necesita decisión de proveedor primero
```

3.1 y 3.2 no tienen ninguna decisión de producto pendiente — son
implementables ya, siguiendo un patrón que este repo ya usó dos veces. Los
otros tres SÍ tienen al menos una decisión que solo el usuario puede
tomar (arquitectura de PDF, disparadores de notificación, proveedor de
pasarela) — no se pueden planear a más detalle sin esas respuestas.

## 5. Próxima acción

Ninguna todavía. Este documento es el plan, no una entrega en curso —
mismo criterio que se usó para `PLAN_AEL004_RULE_WORKSPACE.md`: se espera
confirmación de por dónde empezar antes de tocar código.
