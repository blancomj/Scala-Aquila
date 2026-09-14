# Registro de decisiones de implementación

Decisiones tomadas durante la construcción que **desvían o completan** los documentos
canónicos. `21 §38` exige que ningún cambio arquitectónico sea silencioso.

Las decisiones AD-01…AD-28 viven en `PLAN_MAESTRO_IMPLEMENTACION.md`.
Aquí solo se registran las que surgen al implementar.

---

## D-08 — Supabase remoto en lugar de entorno local

|            |          |
| ---------- | -------- |
| **Fase**   | F0       |
| **Estado** | Aceptada |
| **Decide** | Usuario  |

**Contexto.** `24 §17` exige que una instalación limpia pueda `create database → apply
migrations → reach expected schema` de forma reproducible. Lo natural es Supabase local
vía CLI, que requiere Docker. La máquina de desarrollo no tiene Docker ni Supabase CLI
instalados.

**Decisión.** Usar un proyecto Supabase remoto de desarrollo.

**Consecuencias aceptadas.**

```text
− Se compromete la reproducibilidad que exige 24 §17
− Los tests RLS corren contra una base compartida, no aislada
− Riesgo de interferencia entre ejecuciones concurrentes de tests
+ No requiere Docker
+ Arranque inmediato
```

**Mitigación obligatoria.** Los tests RLS deben crear sus propios tenants con
identificadores únicos por ejecución y limpiarlos al terminar. Nunca asumir base vacía.

**Revisión.** Antes de F7 (hardening) debe existir un entorno reproducible desde cero,
o `24 §17` no puede aceptarse. Reevaluar cuando Docker esté disponible.

---

## D-09 — Paquete `financial-kernel` fuera de la lista de `01 §6`

|            |          |
| ---------- | -------- |
| **Fase**   | F0       |
| **Estado** | Aceptada |
| **Decide** | Agente   |

**Contexto.** `01 §6` enumera la granularidad recomendada: `ael-core`, `ael-language`,
`ael-runtime`, `ael-sdk`. El kernel financiero (Capa A de AD-20) no aparece.

**Decisión.** Crear `packages/financial-kernel` como paquete propio.

**Justificación.** AD-20 lo define como una de las tres capas y establece que es
independiente del lenguaje. `01 §6` prohíbe crear un paquete «para cada pequeña clase o
subsistema»; una de las tres capas de la arquitectura no es eso. AD-20 tiene precedencia
sobre `01` según `PLAN §0.1`.

---

## D-10 — `esbuild` autorizado a ejecutar su build script

|            |          |
| ---------- | -------- |
| **Fase**   | F0       |
| **Estado** | Aceptada |
| **Decide** | Agente   |

pnpm 11 bloquea build scripts por defecto. `esbuild` es dependencia de Vite/Vitest y su
`postinstall` enlaza el binario de plataforma; sin él el test runner no arranca.
Autorizado en `pnpm-workspace.yaml` → `allowBuilds`.

Ningún otro paquete queda autorizado. Toda nueva autorización se registra aquí.

---

## D-11 — `pnpm db:types` requiere Docker/Podman; resuelto vía Management API

|            |                  |
| ---------- | ---------------- |
| **Fase**   | F1               |
| **Estado** | **Resuelta**     |
| **Decide** | Agente + Usuario |

**Contexto.** Fase I §3.3: los tipos de BD se generan, nunca se escriben a mano.
`supabase gen types typescript --db-url` levanta un contenedor de introspección
(shadow database), igual que `db diff`. Bajo D-08 no hay Docker/Podman, así que falla con
`LegacyContainerRuntimeNotFoundError`.

**Resolución.** El usuario generó un personal access token de su cuenta Supabase
(`https://supabase.com/dashboard/account/tokens`) y lo puso en `.env` como
`SUPABASE_ACCESS_TOKEN`. `scripts/db-types.mjs` se reescribió para usar
`--project-id <ref>` vía Management API en lugar de `--db-url`: no requiere contenedor.
El token se pasa por variable de entorno al proceso hijo, nunca como argumento de línea
de comandos ni en texto de commit.

**Resultado.** `packages/shared/src/database.generated.ts` existe con los tipos reales
del esquema aplicado en F1. `packages/shared` se reconstruyó (ya no está prematuro:
ahora tiene un consumidor real) con `crearClienteAquila()` tipado sobre `Database`.
`tests/rls/helpers.ts` migró del `Cliente` con esquema `any` al tipo real; la excepción
de ESLint para `no-explicit-any` en ese archivo se retiró.

---

## D-12 — `REDONDEAR_DINERO` tenía la aridad equivocada en F4

|            |           |
| ---------- | --------- |
| **Fase**   | F4        |
| **Estado** | Corregida |
| **Decide** | Agente    |

**Contexto.** Al construir `packages/ael-runtime` (el evaluador), se contrastó cada
función del catálogo contra el corpus antes de implementarla. `07 §"FUNCTION EXAMPLE"`
y `06 §"REDONDEAR_DINERO(total, 0)"` definen la función con **dos** argumentos —
`REDONDEAR_DINERO(Money<C>, Number)`, donde el segundo es la escala — pero
`ael-language/src/analyzer.ts` (escrito antes, en la primera pasada de F4) la había
registrado con un solo parámetro (`MONEY`), y `paso0/reglas/INTERES_MORA.ael` la
invocaba como `REDONDEAR_DINERO(interes)`.

**Decisión.** Corregir ambos antes de construir el evaluador: `analyzer.ts` ahora exige
`(MONEY, NUMBER)`; `INTERES_MORA.ael` pasa `REDONDEAR_DINERO(interes, 0)`. El modo de
redondeo (HALF_UP/…) no es un argumento de la llamada — lo aporta
`ExecutionContext.modoRedondeoDinero`, consistente con `16 §44 ROUNDING`
("debe ser una política explícita... versionable").

**Consecuencias.** Se añadió un test de aridad dedicado a `REDONDEAR_DINERO` en
`analyzer.test.ts` (no existía ninguno antes, a diferencia de MIN/MAX/PORCENTAJE) para
que esta clase de desviación no vuelva a pasar sin que un test la señale.

---

## D-13 — F2 se implementa antes que F5; `liquidaciones`/`liquidacion_lineas`/`saldos`/`novedades`/`pagos` quedan fuera de su alcance

|            |                  |
| ---------- | ---------------- |
| **Fase**   | F2               |
| **Estado** | Aceptada         |
| **Decide** | Usuario + Agente |

**Contexto.** `PLAN_MAESTRO_IMPLEMENTACION.md §5.1` ordena `F0→F1→F2→(F3∥F4)→F5`. Se
construyeron F3 y F4 sin F2 (usando fixtures de test en memoria en vez de datos
persistidos), una desviación no anunciada del orden del plan. El usuario, al pedir
continuar con F5, decidió corregirla: F2 se hace ahora, antes de F5.

**Decisión sobre el alcance de F2.** `PLAN §4.3` lista `novedades`, `pagos`,
`liquidaciones`, `liquidacion_lineas`, `saldos` como "tablas nuevas de F2" pero dice
textualmente que "se especifican en detalle durante F2" citando `20 §5-18` — que es,
según la propia tabla de fases (`§5.3`), la documentación de **F5**, no de F2. Diseñar
`liquidaciones`/`liquidacion_lineas` (resultado, trace, `resultHash`) a ciegas antes de
que F5 defina el grafo de dependencias y el pipeline de cálculo arriesga tener que
rehacer el esquema. `novedades` y `pagos` son inputs de un GC-001 extendido
("con novedad, pago parcial e interés") que `paso0/INFORME_PASO_0.md §3.4` deja
explícitamente pospuesto — el GC-001 verificado hasta ahora solo cubre CUOTA_ADMIN base.

**Resolución.** F2 construye solo el dominio de **entrada**: extensión de `tenants`,
`inmuebles`, `zonas_comunes`, `coeficiente_sets`/`coeficientes`, `propietarios`/
`inmueble_propietario`, `periodos`, `conceptos`, `politicas_financieras`,
`presupuestos`/`presupuesto_rubros`, `fondos`/`fondo_movimientos` — todas con columnas ya
cerradas en `PLAN §4.2-4.3.2`, nada que inventar. `novedades`, `pagos`, `liquidaciones`,
`liquidacion_lineas`, `saldos` se diseñan en F5, junto con el grafo y el pipeline que los
llenan.

---

## D-14 — F5 "v0": núcleo mínimo de orquestación, no la especificación V1 completa de Docs 17/18/20

|            |          |
| ---------- | -------- |
| **Fase**   | F5       |
| **Estado** | Aceptada |
| **Decide** | Agente   |

**Contexto.** Docs 17 (Snapshot/Lifecycle), 18 (Grafo/Calculation Context) y 20
(Resultado/Trace/Audit) suman **~750 secciones**: idempotencia, locks de concurrencia,
timeout/cancelación, replay, streaming/paginación para tenants grandes, enmascarado de
PII, firma y exportación de paquetes de auditoría, localización de explicaciones. Es
especificación de nivel V1/producción — construirla entera ahora repite el error que
AD-21 ya evitó para AEL (evaluador completo con IR/bytecode/VM en vez del evaluador de
expresiones que el caso real pedía).

**Decisión.** F5 "v0" implementa solo lo que el criterio de salida exige
("primera liquidación real reconciliada", `PLAN §5.3`) y lo que ya está cerrado en
`PLAN §6.1-6.5`:

```text
DENTRO       DataSnapshot (tipo puro + builder desde Supabase)
             grafo de dependencias entre conceptos (parseo de CONCEPTO.X, orden
               topológico, desempate por prioridad, detección de ciclos)
             plan de cálculo secuencial (sin paralelismo — 18 §28 FINANCIAL DEFAULT)
             ejecución vía ael-runtime + allocate() de financial-kernel, replicando
               PLAN §6.5 (reparto anual→12 periodos→inmuebles, ambos pasos con
               allocate() y mayor resto)
             resultado con reconciliación R1/R3/R4/R6/R7 (PLAN §6.4-6.5)
             resultHash determinista (serialización canónica) — cierra la puerta
               F5→F6 ("mismo snapshot ⇒ mismo resultHash")
             persistencia mínima en liquidaciones/liquidacion_lineas (sin la máquina
               de estados de 15 transiciones de Doc 20 §61-68 — un estado simple)

FUERA        idempotencia/locks/timeout/cancelación/replay
             ejecución paralela
             pagos, novedades, saldo anterior (D-13: GC-001 extendido, pospuesto)
             enmascarado de PII, firma/exportación de auditoría, localización
             streaming/paginación para snapshots grandes
```

**Justificación de alcance cerrado (AD-23):** se amplía cuando un caso real lo exija, no
antes. Ningún caso real hoy necesita replay ni locks de concurrencia.

---

## D-15 — Nuxt 4 en vez de Nuxt 3

|            |          |
| ---------- | -------- |
| **Fase**   | F6       |
| **Estado** | Aceptada |
| **Decide** | Agente   |

**Contexto.** `PROMPT_MAESTRO_FASE1.md §4.1` fija "Nuxt 3 (Vue 3, Composition API)". Al
iniciar F6, el registro de npm ofrece Nuxt **4.5.2** como última estable — Nuxt 3 ya no es
la versión que un proyecto nuevo instalaría hoy.

**Decisión.** Usar Nuxt 4. La intención del documento es "framework moderno con SSR y
Composition API", no fijar un major concreto por razones técnicas — Nuxt 4 es
mayoritariamente compatible (cambios de defaults, no una reescritura) y es lo que
`@nuxt/ui` v4 (también citado en el plan) espera como peer. Instalar la 3 hoy sería
empezar un proyecto nuevo ya desactualizado.

**Consecuencias.** Si algún patrón de `PROMPT_MAESTRO_FASE1.md §10` (estructura de
carpetas) no aplica igual en Nuxt 4 (p. ej. `app/` como raíz por defecto en vez de la
raíz del proyecto), se adapta y se documenta en el propio código, no aquí.

---

## D-16 — `@nuxtjs/supabase` para la sesión SSR, en vez de `supabase-js` a pelo

|            |          |
| ---------- | -------- |
| **Fase**   | F6       |
| **Estado** | Aceptada |
| **Decide** | Agente   |

**Contexto.** `PROMPT_MAESTRO_FASE1.md §4.1/§10.1` exige SSR completo con rutas
protegidas por middleware — el middleware `auth.global.ts` necesita saber si hay sesión
**antes** de renderizar en el servidor. `supabase-js` puro guarda la sesión en
`localStorage`, invisible en el servidor: sin sincronía de sesión vía cookies, el SSR de
rutas protegidas no funciona correctamente (parpadeo de contenido no autenticado, o
redirecciones incorrectas en el primer render).

**Decisión.** Usar `@nuxtjs/supabase` (envuelve `@supabase/ssr`, el paquete oficial de
Supabase para exactamente este problema) en vez de instanciar `supabase-js` a mano con
un plugin casero. No contradice el stack del plan —sigue siendo Supabase Auth +
`supabase-js` por debajo— solo evita reimplementar la sincronía de cookies
servidor/cliente, que es fácil de hacer mal de forma sutil.

**Consecuencias.** Los composables `useSupabaseClient()` / `useSupabaseUser()` que trae
el módulo sustituyen a un `composables/useAuth.ts` casero para el acceso al cliente; la
lógica de negocio propia (perfil, tenant activo, permisos) sigue viviendo en
`stores/auth.ts`/`stores/tenant.ts` como especifica el plan.

---

## D-17 — `unrs-resolver` y `vue-demi` autorizados a ejecutar su build script

|            |          |
| ---------- | -------- |
| **Fase**   | F6       |
| **Estado** | Aceptada |
| **Decide** | Agente   |

Mismo patrón que D-10 (`esbuild`). `unrs-resolver` es el resolutor nativo (oxc) del que
depende `@nuxt/eslint`; sin su postinstall, `nuxt typecheck` y el lint de `apps/web` no
arrancan. `vue-demi` es el shim de compatibilidad de Pinia (detecta la versión de Vue
instalada); postinstall inocuo, requerido por `@pinia/nuxt`. Autorizados en
`pnpm-workspace.yaml` → `allowBuilds`.

---

## D-18 — `create_tenant()` como RPC de Postgres, no como Edge Function (AD-05)

|            |                                             |
| ---------- | ------------------------------------------- |
| **Fase**   | F6 (E3)                                     |
| **Estado** | Aceptada                                    |
| **Decide** | Usuario (confirmado vía pregunta explícita) |

AD-05 exige que toda operación que cruce el límite de un tenant o use `service_role`
viva en una Edge Function. `create-tenant` está en esa lista (§6.3), y la política RLS
de `tenants`/`memberships` deniega INSERT a todo rol salvo Edge Function (comentario
explícito en `20260813190300_rls_policies.sql`). apps/web no tiene infraestructura de
Edge Functions todavía — D-08 fijó "sin stack local, sin `supabase link`, sin token de
CLI" para las migraciones, y eso mismo bloquea `supabase functions deploy`.

`create_tenant(p_name, p_slug)` se implementó en su lugar como función
`SECURITY DEFINER` (`20260814120000_tenancy_rpc.sql`) que inserta `tenant` +
`membership(role='agent')` + `profiles.active_tenant_id` en una sola transacción,
forzando `created_by`/`user_id`/`role` desde `auth.uid()` (nunca desde el payload del
cliente). No usa `service_role` ni cruza un tenant ya existente — en el momento de la
llamada el usuario todavía no pertenece a ninguno — así que la propiedad de seguridad
que AD-05 protege (que el cliente no pueda fabricar tenant/membership arbitrarios)
queda igual de garantizada.

`switch_tenant(p_tenant_id)` sí se implementó fiel al plan (RPC, `20260814120000_...`),
pero sin `SECURITY DEFINER`: `profiles_update_propio` (RLS) ya autoriza `id = auth.uid()`
y el trigger `guard_active_tenant` ya valida la membresía activa, así que envolverlo en
`SECURITY DEFINER` sería una escalada de privilegios innecesaria.

**Revisar cuando E5 (invitaciones) llegue** — `invite-user` sí necesita `service_role`
de verdad (envío de email vía Brevo, AD-07), momento en el que habrá que levantar la
infraestructura de Edge Functions de cualquier forma; evaluar entonces si migrar
`create-tenant` a Edge Function por consistencia, o dejar el precedente de RPC para
operaciones que no requieran secretos de servidor.

**Resuelto por D-19** — se adelantó la revisión: el usuario pidió levantar la
infraestructura de Edge Functions de inmediato en vez de esperar a E5.

---

## D-19 — Infraestructura de Edge Functions levantada; `create-tenant` migrado

|            |                                                        |
| ---------- | ------------------------------------------------------ |
| **Fase**   | F6 (E3)                                                |
| **Estado** | Aceptada                                               |
| **Decide** | Usuario (pidió adelantar la infraestructura, ver D-18) |

El usuario cuestionó por qué D-18 dejaba `create-tenant` como RPC en vez de Edge
Function, dado que AD-05 las marca como pieza central de la arquitectura. La causa
real: D-08 (F1) evitó `supabase link`/token de CLI para simplificar el push de
migraciones (conexión directa por `DATABASE_URL`), pero ese mismo atajo bloqueaba
también el despliegue de Edge Functions — que sí requiere el CLI autenticado. No fue
una decisión de "no hacen falta", fue un efecto colateral no anticipado de D-08.

**Resuelto:**

1. Usuario autenticó el CLI (`npx supabase login`, token de cuenta, nunca visto por el
   agente) y se corrió `supabase link --project-ref hwjmlyzzvpmhadldavbq`. Las 14
   migraciones ya aplicadas por `db-push.mjs` coincidían exactamente con el historial
   remoto — sin conflicto.
2. `create-tenant` migrado de RPC-directa-desde-cliente a Edge Function real
   (`supabase/functions/create-tenant/`), usando `@supabase/server`'s `withSupabase({
auth: 'user' })`: JWT verificado por la plataforma, cliente `ctx.supabase` con el
   JWT del usuario (RLS aplica, sin `service_role`), payload validado con Zod (mismo
   patrón de slug que la constraint SQL, pero con mensajes tempranos y claros),
   respuesta con el contrato uniforme de §8 (`{ error: { code, message, details } }`).
   La función sigue invocando la RPC `create_tenant()` de D-18 internamente — el patrón
   "RPC invocada por la Edge Function" que el propio plan pide para `accept-invitation`
   (§8) resultó ser exactamente el correcto aquí también.
3. Se agregó `20260814130000_create_tenant_audit.sql`: `create_tenant()` no registraba
   `tenant.created` en `audit_log` (el trigger `audit_membership_change` solo cubre
   `membership.created`). Corregido con `CREATE OR REPLACE FUNCTION`, dentro de la
   misma transacción atómica.
4. `apps/web/app/stores/tenant.ts`: `crearTenant()` ahora llama
   `cliente.functions.invoke('create-tenant', ...)` en vez de `.rpc()` directo.
5. `eslint.config.js`: `supabase/functions/**` excluido del lint de raíz (corre en
   Deno, fuera de todo tsconfig del workspace pnpm).

**Bug real encontrado y corregido:** `supabase functions new` escribió
`verify_jwt = false` en `supabase/config.toml` (default genérico del scaffold, pensado
para `auth: 'apikey'`/`'publishable'`). Con `auth: 'user'` eso es incorrecto — deja que
cualquier request sin JWT llegue al código de la función antes de ser rechazada (el
chequeo de `@supabase/server` seguía bloqueándola, así que no era un hueco de
seguridad real, pero sí una capa de defensa de menos). Corregido a `verify_jwt = true`
y redesplegado; verificado que ahora el rechazo ocurre en la plataforma
(`UNAUTHORIZED_NO_AUTH_HEADER`) antes de invocar la función.

**`switch_tenant` se queda como RPC** (no como Edge Function) — el razonamiento de
D-18 sigue vigente: no necesita `service_role`, RLS + `guard_active_tenant` ya lo
protegen, y envolverlo sería ceremonia sin ganancia de seguridad real.

Probado en vivo contra la función desplegada: creación exitosa (`{tenant, membership}`
exacto al contrato de §8), `SLUG_TAKEN` (409, slug duplicado), `SLUG_INVALID` (400, Zod
antes de tocar la base), `INVALID_CREDENTIALS` (401, sin JWT), y el registro de
`tenant.created` en `audit_log` confirmado por consulta directa.

---

## D-20 — T-MATRIX (E4) cubre solo los permisos con operación RLS 1:1 hoy

|            |          |
| ---------- | -------- |
| **Fase**   | F6 (E4)  |
| **Estado** | Aceptada |
| **Decide** | Agente   |

`types/permissions.ts` implementa la matriz completa de §7.3/§7.4 (los 12 permisos de
copropiedad + 3 de plataforma). El test T-MATRIX (`tests/rbac/t-matrix.test.ts`,
§12.2) que valida TS↔SQL solo cubre 5: `users:read`, `users:manage`, `data:read`,
`settings:manage`, `audit:view` — los que hoy tienen una tabla/operación RLS concreta
contra la cual ejecutar el permiso real y comparar con `hasPermission()`.

Fuera de esa cobertura, por razones concretas (no pereza):

- `users:invite` — solo existe vía Edge Function (E5, no construida todavía); no hay
  política RLS de INSERT sobre `invitations` que probar directamente.
- `tenant:delete` — la matriz TS lo otorga a `agent`, pero no existe ninguna política
  DELETE sobre `tenants` para ningún rol (ver `20260813190300_rls_policies.sql`, "Sin
  INSERT ni DELETE"). Es una operación aspiracional del plan, no implementada aún —
  divergencia real y conocida, no oculta.
- `data:create/update/delete` — "data" no es una tabla única; ya se prueba por tabla
  de dominio en `tests/rls/domain-isolation.test.ts` (SEC-11), no tiene sentido
  duplicarlo aquí.
- `dashboard:view`, `metrics:view` — visibilidad de UI, no una operación de BD.

**Revisar cuando E5 (invitaciones) o el CRUD de dominio con permisos granulares
lleguen** — en ese punto sí habrá una operación real contra la cual extender T-MATRIX
para `users:invite` y `data:*`. `tenant:delete` queda pendiente de una decisión propia
(¿se implementa alguna vez, o se retira de la matriz?) — no es responsabilidad de E4
resolverlo.

---

## D-21 — E5 (invitaciones): rate limiting diferido; Brevo configurado y verificado

|            |                                             |
| ---------- | ------------------------------------------- |
| **Fase**   | F6 (E5)                                     |
| **Estado** | Aceptada                                    |
| **Decide** | Usuario (confirmado vía pregunta explícita) |

**Rate limiting (Upstash Redis, SEC-09)** queda fuera del alcance de esta iteración,
por decisión explícita del usuario, no por omisión silenciosa. No está en la lista de
tests obligatorios del plan (T-SEC-01…T-SEC-10, T-MATRIX, T-INV-01 — §12.2), así que
`invite-user` no tiene throttling todavía. Punto de extensión: agregar un chequeo de
Upstash al inicio de `supabase/functions/invite-user/index.ts`, por actor y por
copropiedad, antes de llamar a la RPC.

**Brevo: configurado y probado con envío real.** El usuario puso las credenciales en
el `.env` raíz; ese archivo solo alimenta `scripts/db-push.mjs` (vía `dotenv`), no los
secrets de Edge Functions — hacía falta `supabase secrets set` explícito, que el
usuario pidió que se corriera por él (los valores nunca se pegaron en el chat, se
leyeron directo del `.env` local). Dos problemas reales en el camino:

1. `BREVO_SENDER_NAME=Scala - Aquila` (sin comillas, con espacios) se corrompía a solo
   `Scala` al leerse con `source .env` en Bash — el shell interpreta ` - Aquila` como
   un comando aparte. Corregido leyendo el valor completo con
   `grep '^KEY=' .env | cut -d '=' -f2-` en vez de `source`.
2. Aun con los tres `BREVO_*` configurados, `invite-user` seguía respondiendo "Brevo
   no está configurado": el código también exige `APP_URL` (o `NUXT_PUBLIC_APP_URL`)
   para construir el enlace `{APP_URL}/invite?token=...`, y esa variable solo vivía en
   `apps/web/.env` (config de Nuxt) — nunca se había puesto como secret de Edge
   Function. Corregido con `supabase secrets set APP_URL=http://localhost:3000`
   (**actualizar a la URL de producción real al desplegar**, ver AD-10/Hostinger).

Verificado con un envío real a una casilla de prueba (mailinator.com): remitente
`noreplay@construescala.com` / "Scala - Aquila" correctos, asunto y enlace de
"Aceptar invitación" presentes en el HTML recibido.

**Dos bugs reales encontrados por `tests/invitations/invitations.test.ts`** (no por
inspección — el test falló primero):

1. `accept_invitation()` original declaraba `RETURNS TABLE (tenant_id uuid, role
tenant_role_t)` — esos nombres colisionan con columnas reales de `memberships`
   usadas dentro del cuerpo de la función (el `INSERT ... ON CONFLICT (user_id,
tenant_id)`), y Postgres no podía resolver la ambigüedad (`42702`). Corregido
   renombrando las columnas de salida a `out_tenant_id`/`out_role`
   (`20260814140100_...`) — la Edge Function `accept-invitation` mapea de vuelta a
   `{tenant_id, role}` para no filtrar el nombre interno al contrato público (§8).
2. El intento de "marcar perezosamente" una invitación vencida como `status =
'expired'` antes de `RAISE EXCEPTION INV_EXPIRED` no funcionaba: un `RAISE
EXCEPTION` no capturado revierte toda la invocación de la función, incluido ese
   `UPDATE` — no hay sub-transacciones autónomas en PL/pgSQL. Corregido quitando el
   intento (`20260814140200_...`): el rechazo se basa solo en `expires_at < now()`,
   sin necesidad de mutar `status`.

**No implementado (a propósito):** `update-membership` — la tabla de Edge Functions
del plan (§8) lo lista, pero la propia fase E5 (línea "E5 · Invitaciones: invite-user,
accept-invitation, revoke, emails Brevo, rate limit Upstash") no lo incluye. Queda
para cuando se construya la gestión de usuarios existentes (editar rol, revocar
membership).

---

## D-22 — E6 (dashboard/auditoría/plataforma): alcance de métricas y guarda SELF_MODIFY

|            |                            |
| ---------- | -------------------------- |
| **Fase**   | F6 (E6)                    |
| **Estado** | Aceptada                   |
| **Decide** | Agente (ejecución de plan) |

**Métricas del dashboard limitadas a tenancy/auditoría.** No existe todavía capa de
dominio (presupuesto, cartera, motor de liquidación en producción para tenants reales),
así que "Bienvenido" solo muestra miembros activos y eventos de auditoría recientes —
los únicos datos con fuente real hasta E6. Punto de extensión: agregar tarjetas de
métricas financieras cuando esa capa exista.

**Nueva guarda `guard_self_modify` (SELF_MODIFY, `20260814150000_...`).** Ningún
miembro puede cambiar su propio `role` ni su propio `status` vía `UPDATE` directo sobre
`memberships` — ni siquiera un `agent`, y ni siquiera cuando la política RLS
`memberships_update_agent` ya lo permitiría. Esto es intencional y distinto de
`guard_last_agent` (SEC-07): `LAST_AGENT` protege contra dejar la copropiedad sin
`agent`; `SELF_MODIFY` protege contra que un agente se blindee o se saque a sí mismo
sin que otro lo apruebe, incluso en tenants con varios agents activos.

Consecuencia sobre un test preexistente: el control positivo de
`tests/rls/last-agent-guard.test.ts` ("permite degradar un agent si queda otro
activo") hacía que el propio usuario degradara su propia membresía — válido antes de
SELF_MODIFY, bloqueado después. Corregido para que sea el _segundo_ agent quien
degrade al primero, que es el escenario real que ese test pretendía cubrir.

**Test dedicado:** `tests/rls/self-modify-guard.test.ts` — 3 casos, todos con un tenant
de **2 agents activos** a propósito, para aislar `SELF_MODIFY` de `LAST_AGENT` (que de
otro modo dispararía primero en un tenant de 1 solo agent y ocultaría cuál guarda
realmente está bloqueando).

---

## D-23 — REQ-MORA-003 / REQ-NOVEDAD-003: day-count y orden descuento-interés, configurables por política

|            |                                             |
| ---------- | ------------------------------------------- |
| **Fase**   | F6 (cuenta corriente)                       |
| **Estado** | Aceptada                                    |
| **Decide** | Usuario (confirmado vía pregunta explícita) |

Los dos únicos requisitos que quedaban `Blocked` en la matriz de trazabilidad
(`PLAN_MAESTRO_IMPLEMENTACION.md` §12.2/§12.3) se cierran haciéndolos **configurables
por política** (`politicas_financieras`), en vez de fijar una única convención en el
código. Antes de decidir se investigó el estado real (no se asumió nada):

- `REQ-MORA-003` (day-count): `calcularInteresMora()` ya calculaba
  `tasaMensual/30 × días calendario reales` — una convención de facto sin nombre ISO
  estándar, pero de uso común en Colombia, nunca confirmada contra las 3 que lista
  `Docs/16 §56` (ACTUAL_365, ACTUAL_360, THIRTY_360).
- `REQ-NOVEDAD-003` (orden descuento-vs-interés): no era una ambigüedad de código —
  la interacción simplemente no existía. Un `DISCOUNT` aprobado crea su propio cargo
  (`categoria='otro'`, `fn_aprobar_novedad`) y `calcularInteresMora()` solo procesaba
  `categoria='capital'`, así que el interés de mora siempre ignoró los descuentos.

**Decisión del usuario: configurable, no una sola convención fija — "que se puedan usar
las 4" (day-count) y "cualquiera de los primeros" (orden descuento, es decir las dos
primeras opciones presentadas, sin la variante "depende del tipo de descuento").**

### Implementación

- `supabase/migrations/20260819110000_interes_day_count.sql` — enum
  `interes_day_count_t` (`mensual_30_dias_reales` default = comportamiento histórico,
  `actual_365`, `actual_360`, `treinta_360`) + columna en `politicas_financieras`.
- `supabase/migrations/20260819110100_interes_descuento_orden.sql` — enum
  `interes_descuento_orden_t` (`interes_sobre_capital_completo` default =
  comportamiento histórico, `descuento_antes_interes`) + columna.
- `packages/liquidation-engine/src/cuenta-corriente.ts::calcularInteresMora` —
  reescrito para leer ambos campos de `PoliticaMora`: `tasaDiariaPor()`/`diasVencido()`
  ramifican por `dayCount` (incluye `diasTreintaTrescientosSesenta()`, 30/360 Bond
  Basis); cuando `descuentoOrden==='descuento_antes_interes'`, `totalDescuentoPorPeriodo()`
  suma los cargos `categoria='otro'` con `novedadTipo==='DISCOUNT'` del mismo
  `periodoClave` y los resta (piso cero) de la base de capital antes de aplicar la
  tasa. La función ahora recibe **todos** los cargos abiertos del inmueble (no solo
  capital) — necesita ver los `DISCOUNT` para poder aplicar la política.
- `CargoAbierto` gana `novedadTipo: NovedadTipo | null` — `cuenta-corriente-supabase.ts`
  lo resuelve con una consulta aparte a `novedades.tipo` (no está en `v_cargo_saldo`).
- `supabase/functions/calcular-intereses/index.ts` — pasa capital (con el ajuste de
  idempotencia) + los cargos `otro` sin ajustar a `calcularInteresMora`; desplegado
  (`supabase functions deploy calcular-intereses`) y reverificado contra la función
  real, no solo contra el kernel puro.
- UI: `apps/web/app/pages/politicas/index.vue` — dos selects nuevos en "Crear nueva
  versión", y la tabla de versiones muestra el día-count/orden de cada una.

### Verificación

`packages/liquidation-engine/src/cuenta-corriente.test.ts` — 12 casos nuevos:
las 3 convenciones alternativas contra la histórica (incluye un caso que distingue
`treinta_360` de días calendario reales cruzando un mes de 31 días), las 2
estrategias de orden, piso-cero cuando el descuento excede el capital, y que un
`ADJUSTMENT`/`CREDIT` categoria='otro' NO se trata como `DISCOUNT`.
`tests/tenancy/calcular-intereses.test.ts` — caso end-to-end nuevo contra la Edge
Function desplegada (tenant/política/inmueble/capital/`DISCOUNT` reales), confirma
`700` = `(100.000 − 30.000) × (0,03/30) × 10 días`, exacto.

---

## D-24 — Todo enum nuevo exige `COMMENT ON TYPE` que lo justifique, o usa `lista_tipos`

|            |                                             |
| ---------- | ------------------------------------------- |
| **Fase**   | Cartera (cobranza/jurídico)                 |
| **Estado** | Aceptada                                    |
| **Decide** | Usuario (confirmado vía pregunta explícita) |

**Contexto.** `20260814160000_tipos_lista_tipos.sql` ya estableció el criterio: un
`CREATE TYPE ... AS ENUM` de Postgres es correcto para vocabulario cerrado que
**gatilla lógica** (máquina de estados, invariante, CHECK que depende del valor);
`lista_tipos` (tabla de catálogo genérico, ampliable por tenant sin migración) es
correcto para vocabulario puramente descriptivo. Esa migración migró 3 enums a
`lista_tipos` y dejó los otros 9 como enums, con la razón documentada inline.

Auditando el esquema actual (47 enums), el módulo de cobranza/jurídico agregó 14
enums nuevos sin ese comentario junto a la definición del tipo. Al investigar caso
por caso (código real: `packages/liquidation-engine/src/cartera-cobranza.ts`,
`supabase/functions/ejecutar-accion-cobranza/index.ts`, no solo las migraciones), se
confirmó que la mayoría sí gatilla lógica real (`estado_acuerdo_t`,
`estado_cuota_acuerdo_t`, `etapa_cobranza_t`, `estado_certificacion_t`,
`alcance_accion_cobranza_t`, `estado_accion_cobranza_t`, `canal_cobranza_t` — este
último decide en tiempo de ejecución si el worker de envío procesa la acción) — el
criterio se siguió cumpliendo en la práctica, pero **sin quedar registrado**, lo que
hace imposible distinguir a simple vista un enum "inevitable" de uno que simplemente
nadie se detuvo a evaluar contra `lista_tipos`.

**Decisión.** No se migran retroactivamente los enums existentes (costo/beneficio no
lo justifica: exigiría reescribir `cartera-cobranza-supabase.ts`/`cartera-supabase.ts`
y varios tests RLS por un problema que hoy es solo de documentación, no de
arquitectura). En su lugar, se formaliza y automatiza la regla hacia adelante:

**Principio de preferencia (por defecto, no opcional):** ante cualquier vocabulario
cerrado nuevo, **siempre se prefiere `lista_tipos` sobre un enum de Postgres**,
salvo que el diseño de lo que se está implementando exija el enum — es decir, que
el valor gatille lógica real (máquina de estados, invariante, CHECK, una rama de
código que decida algo según el valor). La carga de la prueba es del enum, no de
`lista_tipos`: si al escribir la migración no se puede señalar la lógica concreta
que depende del valor, es `lista_tipos`, sin excepción por comodidad o porque el
documento de diseño lo haya dado como bloque `CREATE TYPE` de ejemplo.

1. Todo `CREATE TYPE ... AS ENUM` nuevo debe venir acompañado, en la misma
   migración, de `COMMENT ON TYPE public.<nombre> IS '...'` explicando por qué es
   inevitable como enum nativo (qué lógica/transición/invariante gatilla) — o, si el
   vocabulario es descriptivo y ampliable, debe usar una familia de `lista_tipos` en
   vez de un enum nuevo.
2. `tests/governance/enum-lista-tipos-coverage.test.ts` (test-guardia, mismo patrón
   que `error-codes-coverage.test.ts`) hace cumplir el punto 1: escanea
   `supabase/migrations/*.sql`, y falla si aparece un enum nuevo sin su
   `COMMENT ON TYPE`. Los 47 enums existentes al 2026-08-17 quedan en una lista
   `ENUMS_LEGADO` congelada dentro del test — exenta, no se amplía nunca; un enum
   nuevo se justifica con el comentario, no agregando su nombre a esa lista.

**Consecuencia.** La próxima vez que alguien (agente o humano) cree un enum, el test
falla hasta que declare explícitamente por qué no es una entrada de `lista_tipos` —
la decisión queda en la propia base de datos (`COMMENT ON TYPE` es consultable desde
`psql`/el dashboard, no solo desde el código fuente), no solo en la cabeza de quien
lo escribió.

---

## D-25 — Separación de proyecto Supabase de desarrollo y producción

|            |                         |
| ---------- | ----------------------- |
| **Fase**   | Previo a hardening (F7) |
| **Estado** | Aceptada                |
| **Decide** | Usuario                 |

**Contexto.** Desde D-08, todo el desarrollo, los tests de CI (`verify`/`coverage`/
`e2e`) y el único entorno posible corrían contra un solo proyecto Supabase remoto
(`hwjmlyzzvpmhadldavbq`, sa-east-1). D-08 ya dejaba anotado que antes de F7
(hardening) hacía falta reevaluar el entorno. Esta decisión resuelve la mitad de
esa revisión — la separación entre datos de prueba y datos reales de una
copropiedad —, **no** la reproducibilidad local sin Docker, que sigue pendiente y
es un problema distinto.

**Decisión.**

1. El usuario crea un segundo proyecto Supabase, misma región sa-east-1 (residencia
   de datos, PLAN §11.3 / Ley 1581), dedicado a producción. El proyecto
   `hwjmlyzzvpmhadldavbq` existente pasa a ser exclusivamente el de desarrollo.
2. Las credenciales de producción viven en `.env.production` (raíz del repo,
   ignorado por git, plantilla versionada en `.env.production.example`) — mismas
   claves que `.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN` (este
   último es de la cuenta, no del proyecto — se reutiliza el mismo valor).
3. **Promoción de migraciones: manual, nunca automática.** `scripts/db-push.mjs`
   acepta un flag `--prod` que carga `.env.production` en vez de `.env` y pide
   confirmación explícita por stdin (mostrando solo el host de la cadena de
   conexión, nunca la contraseña) antes de aplicar cambios. Expuesto como
   `pnpm db:push:prod` / `pnpm db:push:prod:dry`. `pnpm db:push` sin flags sigue
   apuntando a desarrollo, sin cambios.
4. **CI no cambia.** `verify`/`coverage`/`e2e` siguen corriendo solo contra
   desarrollo, con los mismos GitHub Secrets de hoy. Producción nunca es tocada
   por un test automático.
5. **Edge Functions a producción:** sin script nuevo — igual que D-19 estableció
   para desarrollo, el deploy es manual (`supabase functions deploy <nombre>
--project-ref <ref-prod>`). El flag `--project-ref` sobreescribe el proyecto de
   destino sin alterar el `link` activo a desarrollo, así que no hace falta
   relinkear ida y vuelta.
6. **`pnpm db:types` no cambia** — los tipos siempre se generan desde el esquema de
   desarrollo (ahí se autoría y prueba primero); una vez promovido a producción el
   esquema coincide.

**Fuera de alcance (explícito).** No se toca `apps/web/nuxt.config.ts` ni
`apps/web/.env*`: AD-10 fija Hostinger como destino de despliegue de la app, pero
ese despliegue todavía no existe, así que no hay un runtime de producción de la
app que necesite estas credenciales hoy. Cuando exista, lo natural es que
Hostinger inyecte las variables de entorno directamente, no un `.env.production`
shippeado junto al build.

**Corrección 2026-08-19 — "promoción manual" significa autorización en el momento,
no en el plan.** Un agente ejecutó `db:push:prod` (y el deploy de Edge Functions a
producción) como parte de un plan ya aprobado, sin volver a pedir autorización en
el turno puntual en que corrió el comando — respondió él mismo la confirmación
"si" del script en vez de que la tipeara el usuario. El usuario corrigió: la base
de datos de producción se actualiza **únicamente** cuando el usuario lo determina
en ese momento, nunca por un plan aprobado con antelación ni por ningún modo de
trabajo autónomo. `scripts/db-push.mjs` ya documenta esto en su cabecera. Regla
para cualquier sesión futura (agente o humano): antes de correr `db:push:prod` o
`supabase functions deploy ... --project-ref <ref-prod>`, preguntar en el chat y
esperar una respuesta explícita del usuario en ese turno — un paso de "deploy a
producción" en un plan ya aprobado NO es esa autorización.

---

## D-26 — Design system único de UI (`DESIGN_SYSTEM.md`), sin paleta/tipografía paralela

|            |                                             |
| ---------- | ------------------------------------------- |
| **Fase**   | Post F7 (hardening visual)                  |
| **Estado** | Aceptada                                    |
| **Decide** | Usuario (confirmado vía pregunta explícita) |

**Contexto.** La app corría con la paleta/tipografía default de Nuxt UI, sin
theming propio, y con un segundo sistema visual completamente independiente
(`.ficha-inmueble`, `apps/web/app/assets/css/ficha-inmueble.css` — drawers, ficha
de inmueble, comprobante público) que traía su propia paleta con nombre
(`--sello`/`--oro`/`--ladrillo`/`--gris`/`--ink`/`--paper`) y su propia tipografía
(Source Serif 4 + IBM Plex Sans/Mono), documentado como "vinculante"
(`PROMPT_FICHA_INMUEBLE.md §5`) y aislado a propósito para no filtrar estilos al
resto de la app.

El usuario pidió integrar el design system "Northline" (`DESIGN_SYSTEM.md`,
`apps/web/app/assets/css/tokens.css`, `apps/web/app/app.config.ts`) — acento único
de marca (`brand`, oklch hue 255) + Inter/Inter Tight — y, en iteraciones
sucesivas, terminó pidiendo explícitamente que **absolutamente todo** el aspecto
de la aplicación se rigiera por un único estilo, incluido `ficha-inmueble.css`.

Auditando el proyecto completo se encontraron 3 clases de desvío:

1. `ficha-inmueble.css` con paleta/tipografía propia (arriba) — 2 elementos
   además tenían el bug de que "primario/interacción" (botón CTA, pestaña activa,
   enlace, foco, resaltado de combobox) compartía el mismo verde que "sello/
   estado" (certificado/activo) por casualidad del mockup original, no por
   diseño — quedaron separados: interacción → `brand`, estado → `success`.
2. Radios hardcodeados sueltos (`border-radius: 20px`/`16px`/`6px`/`3px`) en vez
   de token, en `ficha-inmueble.css` (tags/badges/chips/segmented) y en 2 páginas
   con `<style>` propio (`comprobante-cuenta/[id].vue`, tooltip de
   `AelEditor.vue`) — algunos con `Helvetica` hardcodeada en vez de Inter.
3. 904 usos de `gray-*` (paleta default de Tailwind) en 66 de 109 archivos `.vue`,
   contra 0 usos de `neutral-*` (la escala propia de `tokens.css`) — visualmente
   casi idéntico (`neutral-500` `#6b6b70` vs `gray-500` `#6b7280`), pero dos
   fuentes de verdad en vez de una.

**Decisión.**

1. `ficha-inmueble.css` deja de definir su propia paleta/tipografía: cada
   variable local (`--sello`, `--ink`, `--font-sans`...) ahora referencia el
   token equivalente de `tokens.css`/Nuxt UI (`--color-neutral-*`,
   `--ui-color-success-*`, `--font-sans`/`--font-display`) en vez de un valor
   literal — los ~180 usos por nombre en ese archivo no se tocan, solo a qué
   apunta cada nombre. Los 4 archivos de fuente IBM Plex/Source Serif que
   quedaron sin ningún uso se borraron de `public/fonts/`.
2. No se migran retroactivamente los 904 usos de `gray-*` existentes (mismo
   criterio costo/beneficio que D-24: la diferencia visual es marginal, tocar 66
   archivos a mano por una diferencia casi imperceptible no se justifica).
3. **Se formaliza y automatiza la regla hacia adelante**, igual que D-24:
   - Ningún archivo `.vue`/`.css` nuevo (fuera de un allowlist explícito para
     dataviz/`ficha-inmueble.css`/`tokens.css`) puede introducir un color
     hexadecimal/`rgb()` hardcodeado ni una fuente fuera de Inter/Inter Tight —
     debe pasar por los tokens de `tokens.css` o los props semánticos de Nuxt UI
     (`primary`/`neutral`/`success`/`warning`/`error`).
   - Ningún archivo `.vue` nuevo (fuera del allowlist congelado de los 66 ya
     existentes) puede introducir clases `gray-*` — usa `neutral-*` o las clases
     semánticas de Nuxt UI (`text-muted`, `border-default`, etc.).
   - `tests/governance/design-system-coverage.test.ts` (test-guardia, mismo
     patrón que `enum-lista-tipos-coverage.test.ts`) hace cumplir ambos puntos:
     escanea `apps/web/app/**/*.{vue,css}` y falla si aparece una violación fuera
     de las listas `ARCHIVOS_LEGADO_COLOR_HEX`/`ARCHIVOS_LEGADO_GRAY`, congeladas
     al 23-08-2026 — no se amplían nunca; un archivo nuevo se ajusta al estándar,
     no se agrega a la lista.

**Fuera de alcance (explícito, no es una omisión).** Dataviz (`components/
cartera/*Chart.vue`, `pages/cartera/index.vue`) necesita una paleta categórica de
varios tonos para distinguir escalones (ej. mora), no el acento único — usa la
skill `dataviz`, no este design system. Syntax highlighting
(`utils/ael-codemirror.ts`) es una convención propia de editores de código, no de
marca. Ambos quedan explícitamente excluidos del test-guardia.

**Consecuencia.** La próxima vez que alguien (agente o humano) agregue un color
hardcodeado, una fuente distinta, o una clase `gray-*` fuera de esos archivos, el
test falla y señala exactamente qué archivo y qué reemplazo usar — la regla queda
en el propio repo, no solo en la cabeza de quien la pidió. `DESIGN_SYSTEM.md`
(copiado a la raíz del repo, antes vivía fuera de `proyecto-web` y ningún agente
futuro lo habría encontrado) es la referencia que cita el mensaje de error.

---

## D-27 - Enlace publico del estado de cuenta: token HMAC, 30 dias, rate-limit y auditoria

|            |          |
| ---------- | -------- |
| **Fase**   | Post-L7  |
| **Estado** | Aceptada |
| **Decide** | Usuario  |

**Contexto.** El enlace publico de `ver-estado-cuenta` era un UUID v4 sin firma con
vigencia de 90 dias, sin rate-limit por IP (gap aceptado explicito) y sin auditoria
de accesos (hallazgo A2 de Docs/evaluacion/01). El visor se rediseno ademas como
documento de autenticidad (folio + hash SHA-256 imprimibles).

**Decision.**
1. El acceso anonimo exige token HMAC firmado (`v1.<exp>.<hmac(id.exp)>`,
   `_shared/link_token.ts`, clave en ESTADO_CUENTA_LINK_SECRET o derivada del
   service_role); un miembro autenticado tambien puede abrirlo con su sesion.
2. Vigencia del documento baja a 30 dias.
3. Rate-limit por IP (`check_rate_limit`, bucket `edc_ip:<ip>`, 120/hora).
4. Cada acceso inserta 'estado_cuenta.acceso' en audit_log (best-effort).
5. La respuesta pasa a sobre `{datos, folio, contenido_hash}` - el visor imprime
   folio + hash como sello que sobrevive a la impresion.

**Consecuencias aceptadas.**

```text
+ Puerta anonima deja de ser falsificable, queda rastreada y acotada
+ Documento verificable ante terceros (proceso monitorio art. 54 L675)
- Los enlaces viejos de mas de 30 dias dejan de funcionar (pedir nuevo)
- Requiere aplicar migracion 20260901100000 y redesplegar funciones
```

---

## D-28 - Notificacion por correo del estado de cuenta: gatillos, dedupe via audit_log

|            |          |
| ---------- | -------- |
| **Fase**   | Post-L7  |
| **Estado** | Aceptada |
| **Decide** | Usuario  |

**Contexto.** Concepto acordado: correo con resumen minimo + link al documento
(Docs/evaluacion/13 §G). La infraestructura Brevo ya existia (invitaciones); faltaba
plantilla, gatillos y destinatarios. `propietarios.email` es nullable, asi que la
cobertura incompleta esta garantizada y se maneja como dato, no como error.

**Decision.**
1. Plantilla tablas-inline (max 600px), builder puro testeable
   (`_shared/email_estado_cuenta.ts`), escape HTML obligatorio de lo interpolado.
2. Dos gatillos: manual del auxiliar (`enviar-estado-cuenta`) y batch cron
   (`enviar-estados-cuenta-pendientes`) FUERA de la transaccion de L5 - el cierre
   contable nunca depende de Brevo.
3. Deduplicacion SIN columnas mutables: el rastro vive en audit_log
   ('estado_cuenta.enviado', ventana 12 h) - estados_cuenta_generados permanece
   append-only. reenviar:true fuerza el reenvio manual (audita igual).
4. El enlace lleva token HMAC (D-27), nunca montos en parametros; el boton de
   pago del visor permanece apagado hasta existir pasarelas con intencion
   server-side (punto 2 del roadmap).
5. Los snapshots generados desde la app incluyen propietario (nombre +
   documento enmascarado ****XXXX) y descripcion de cargos enriquecida con el
   codigo de concepto; fn_emitir_estados_cuenta aun produce la forma base -
   pendiente alinear ambos productores (documentado en el store).

**Consecuencias aceptadas.**

```text
+ Append-only intacto; dedupe consultable y auditable por diseno
+ Propietarios sin email no bloquean el envio (se reportan, no fallan)
- Cobertura de correos depende de la calidad de datos de terceros
- El batch requiere CRON_SECRET configurado + cron externo que lo llame
```

## D-29 — Fundamentos normativos: catálogo global de solo lectura + flujo de propuestas

|            |          |
| ---------- | -------- |
| **Fase**   | Post-L7  |
| **Estado** | Aceptada |
| **Decide** | Usuario  |

**Contexto.** El módulo de fundamentos normativos existía como CRUD mínimo
(sin separación global/tenant, sin búsqueda, sin campos de validación PC-7).
El usuario pide un catálogo masivo de ~50 fundamentos Colombia PH + datos
personales, de solo lectura para tenants, con opción de "proponer cambio"
para que tenants sugieran actualizaciones.

**Decision.**
1. `fundamento_normativo` se extiende con columnas `estado`, `propuesto_por`,
   `propuesto_at`, `aprobado_por`, `rechazado_motivo` para lifecycle.
2. Nueva tabla `fundamento_propuesta` para cambios de tenants sobre globales
   (no muta el catálogo directamente).
3. RLS: `is_platform_admin()` como gate de escritura para globales (tenant_id
   null). Tenant solo puede INSERT en sus propias filas.
4. Semilla: ~50 fundamentos organizados por sección (Ley 675, E.T., CGP,
   Código Civil, Ley 1480, Ley 1581, Decreto 1377, CTCP, Superfinanciera,
   Constitución, Ley 2213, NIF, DIAN, SIC).
5. Cada registro incluye `fuente_url` oficial + `fecha_validacion` + `validado_por`
   (sesión de agente, pendiente de contador matriculado) — estándar PC-7.

**Consecuencias aceptadas.**

```text
+ Catálogo masivo listo para nuevos tenants sin arrancar de cero
+ Separación clara: plataforma dicta, tenants proponen, admin revisa
- Los ~50 fundamentos son de primer nivel; la validación contra fuente
  primaria queda pendiente de contador matriculado (Ley 43/1990)
```

## D-30 — Fundamentos normativos: tabla de propuestas separada del catálogo

|            |          |
| ---------- | -------- |
| **Fase**   | Post-L7  |
| **Estado** | Aceptada |
| **Decide** | Usuario  |

**Contexto.** Se evaluaron tres enfoques para el flujo "proponer cambio"
sobre fundamentos globales: (a) modificar la fila original directamente,
(b) agregar columnas de estado a `fundamento_normativo`, (c) tabla separada.
El enfoque (c) sigue el patrón de conceptos (maker-checker) y mantiene
el catálogo limpio.

**Decision.**
1. `fundamento_propuesta` almacena la propuesta del tenant con relación
   al `fundamento_original_id`.
2. Estados: `pendiente` → `aprobada` (inserta en catálogo global) o
   `rechazada` (con motivo).
3. RLS: SELECT para el tenant que creó + platform admin; INSERT para
   cualquier miembro autenticado; UPDATE solo platform admin.
4. Platform admin aprueba/rechaza desde la página de fundamentos.

**Consecuencias aceptadas.**

```text
+ El catálogo global nunca se contamina con filas pendientes de revisión
+ Flujo similar a conceptos (maker-checker) — consistencia arquitectónica
- Requiere que platform admin revise propuestas (proceso manual)
```


---

## D-31 — Estructura multi-pasarela de pago por copropiedad

|            |                                             |
| ---------- | ------------------------------------------- |
| **Fase**   | Pagos electrónicos (Doc 05, fase 1 de 2)    |
| **Estado** | Aceptada                                    |
| **Decide** | Usuario (plan aprobado 2026-08-27)          |

**Contexto.** `Docs/evaluacion/05-evaluacion-pagos-conciliacion.md` §A fija el
principio no negociable: **la copropiedad es el comercio, no AQUILA** — cada
tenant usa su propia cuenta de pasarela y el dinero va directo a su cuenta de
recaudo, lo que evita caer bajo regulación de la Superintendencia Financiera.
Eso obliga a credenciales POR TENANT, algo que la infraestructura existente no
podía dar: hasta hoy el único manejo de secretos era `supabase secrets set`
(D-19/D-21), que es por plataforma. Esta decisión cubre la **fase de
estructura**: esquema, configuración, adaptadores y pantalla. No hay cobro
real, ni webhooks, ni registro de pagos desde una pasarela.

**Decisión.**

1. **`pasarela_proveedor_t` y `pasarela_modo_t` son enums nativos, no
   `lista_tipos`** (la carga de la prueba que exige D-24 se cumple): el valor
   selecciona en tiempo de ejecución qué adaptador de código se ejecuta —
   firma de webhook, contrato de API y tipo de checkout distintos por
   proveedor. `ADAPTADORES` es un `Record<PasarelaProveedor, …>` exhaustivo:
   agregar un valor al enum sin escribir su adaptador es un error de
   compilación. Un proveedor nuevo no es una fila de catálogo, es una clase.

2. **La credencial vive en `pasarela_credencial`, tabla aparte, con RLS
   `enable`+`force` y CERO políticas para `authenticated`** — ni SELECT. Solo
   `service_role` la lee, desde `configurar-pasarela`. Separarla de
   `pasarela_config` es de seguridad, no de normalización: si vivieran juntas,
   la UI las leería juntas. El `COMMENT ON TABLE` dice explícitamente que la
   ausencia de política es deliberada, para que nadie la "arregle" después.
   El único camino de lectura hacia el cliente es
   `fn_pasarela_credenciales_presentes`, que devuelve `(config_id, nombre)` y
   nada más — no hay superficie por la que salga un valor.

3. **`ResultadoIntencion` es una unión discriminada**
   (`redirect | boton_embebido | referencia_efectivo`), no el
   `{checkoutUrl | referenciaEfectivo}` que propone §D del documento
   propietario. **Fue Bold quien lo forzó**: su checkout online no es un
   redirect, es un botón embebido con firma de integridad, y modelado como
   "URL o referencia" no cabe. Queda escrito aquí y en un test
   (`registro.test.ts`, "Bold es el único con checkout de botón embebido")
   porque una "simplificación" futura de la interfaz rompería Bold en
   silencio: compilaría, y el pago no funcionaría.

4. **Resolución de tenant en el webhook: opción 1 — `webhook_token` por
   tenant** (columna única, aleatoria, rotable), creada ya aunque el webhook
   sea de la fase siguiente: agregarla después obligaría a regenerar tokens en
   tenants ya configurados. Un webhook llega sin autenticación y su firma se
   valida con el secreto del tenant dueño de la transacción — hay que saber de
   qué tenant es *antes* de poder validarlo. El token **identifica sin
   autenticar**; la firma sigue siendo lo que autoriza.

5. **El datáfono físico de Bold queda fuera del adaptador online**, y la UI lo
   dice donde se configura Bold. Un cobro por datáfono es presencial y aparece
   después en el reporte de liquidación de Bold: es conciliación, no checkout
   con webhook. Si alguien asume que configurar Bold aquí también lo cubre, el
   mismo pago termina registrado dos veces.

6. **`metodos_habilitados` reutiliza la familia `FORMA_PAGO` de `lista_tipos`**
   vía la tabla puente `pasarela_config_metodo`, en vez del `text[]` con
   vocabulario libre que proponía el prompt de origen. Motivo: `FORMA_PAGO` es
   el mismo vocabulario que alimenta `pagos.forma_pago_id` (NOT NULL), así que
   la fase 2 podrá mapear lo que reporta la pasarela a un pago real sin
   reconciliar dos catálogos paralelos. Tabla puente y no `bigint[]` porque un
   array no admite FK por elemento. Se sembraron los 4 códigos que faltaban
   (`tarjeta_credito`, `tarjeta_debito`, `nequi`, `corresponsal_bancario`).

7. **Paquete propio `packages/payment-gateways`** (precedente D-09) y no
   `packages/shared/src/pasarelas/`: un módulo de `shared` consumido por una
   Edge Function se importa como `.ts` crudo desde Deno, que no resuelve
   imports internos `.js` apuntando a hermanos `.ts`. La interfaz + 4
   adaptadores + registro son varios archivos que se importan entre sí, así
   que necesitan el build a `dist/` — igual que `liquidation-engine`.

8. **`fn_activar_pasarela` y `fn_cambiar_modo_pasarela` son `SECURITY
   DEFINER`, no `SECURITY INVOKER`** (corrección sobre el diseño de origen,
   que mandaba copiar `fn_marcar_cuenta_recaudo`): ambas emiten auditoría, y
   `audit_log` no tiene política de INSERT para `authenticated` — con INVOKER
   el insert de auditoría fallaría por RLS. Se sigue el patrón de
   `fn_guardar_plantilla_sms` (20260822240000): DEFINER + chequeo explícito de
   `has_role()` adentro, porque al escalar privilegios la RLS de la tabla ya
   no autoriza por sí sola. `fn_marcar_cuenta_recaudo` puede ser INVOKER
   justamente porque no audita nada.

9. **Supabase Vault: verificado, no asumido (2026-08-27).** El diseño de
   origen daba Vault por resuelto, pero no había ni un solo uso en las 199
   migraciones del proyecto. Antes de construir encima se probó contra el
   proyecto de **desarrollo** (`hwjmlyzzvpmhadldavbq`): `supabase_vault`
   **0.3.1** instalado, y el ciclo completo `vault.create_secret` →
   `vault.decrypted_secrets` → `delete` funcionó. Sobre esa evidencia se
   adoptó Vault como cifrado en reposo, sin criptografía propia ni envelope
   encryption a mano. **Queda pendiente repetir esta verificación en el
   proyecto de producción (`alfftzoxwsurvzknsczs`) antes de promover estas
   migraciones** — D-25 exige autorización explícita del usuario en el momento
   para tocar producción, así que no se hizo aquí.

10. **El botón "Pagar" del estado de cuenta sigue apagado** (D-28 punto 4):
    esta fase no habilita cobro. La pantalla de configuración lo dice.

**Consecuencias aceptadas.**

```text
+ Una credencial guardada no tiene ningún camino de vuelta al cliente, y hay
  un test que lo prueba contra la base real (tests/rls/pasarelas.test.ts)
+ Agregar un proveedor al enum sin su adaptador no compila
+ El vocabulario de métodos no se bifurca: la fase 2 hereda FORMA_PAGO
- Cambiar una credencial invalida verificada_at y desactiva la pasarela: hay
  que volver a probar y reactivar (deliberado, pero es fricción real)
- "Probar conexión" en esta fase solo verifica que las credenciales estén y
  se puedan descifrar, NO habla con el proveedor — la respuesta lo declara
  en `alcance` para no dar una falsa sensación de "probado contra Wompi"
- Vault queda como dependencia de plataforma verificada solo en desarrollo
```

---

## D-32 — Wompi real (Fase 2): adaptador, `crear-intencion-pago`, `webhook-pasarela`

|            |                                             |
| ---------- | ------------------------------------------- |
| **Fase**   | Pagos electrónicos (Doc 05, fase 2 de 2)    |
| **Estado** | Aceptada — verificado parcialmente          |
| **Decide** | Usuario (credenciales activas y "probar conexión" en sandbox, 2026-08-28) |

**Contexto.** D-31 dejó la estructura (esquema, configuración, adaptadores en
`NO_IMPLEMENTADO`). Esta decisión cierra el adaptador de Wompi y las dos Edge
Functions que conectan un checkout real al pipeline de recaudo que ya existía
(`registrarPago`/`imputarPago`) — sin pipeline paralelo, tal como exige §1 del
prompt de fase 2. El disparador fue el usuario confirmando que las
credenciales de Wompi ya estaban activas y "probar conexión" en modo sandbox
había pasado.

**1. Esquema y `fn_registrar_pago_pasarela` — ya existían.** Una sesión
anterior (interrumpida antes de este cierre) ya había construido y probado
`intenciones_pago`, su máquina de estados, y `fn_registrar_pago_pasarela`
(idempotente por el patrón de `20260831130000`, con reclamo atómico —
`20260904130000`/`150000`). El test `tests/rls/intenciones-pago.test.ts`
("DOBLE WEBHOOK IDÉNTICO ⇒ UN SOLO PAGO") ya pasaba contra la base real. Esta
decisión NO repite ese trabajo — solo agrega la pieza que faltaba:
`fn_leer_credenciales_pasarela` (`20260904200000`), la única función que
devuelve el VALOR descifrado de una credencial (todo lo anterior,
deliberadamente, solo daba nombres o conteos) — service_role únicamente,
nunca expuesta a `authenticated`/`anon`.

**2. Firma y endpoints de Wompi — verificados contra la documentación oficial
el 2026-08-28** (`https://docs.wompi.co/en/docs/colombia/`), no deducidos de
memoria ni del documento propietario, tal como exige §4 del prompt:

```text
Ambientes:   sandbox https://sandbox.wompi.co/v1 · producción https://production.wompi.co/v1
Checkout:    https://checkout.wompi.co/p/ (MISMA url en ambos ambientes — el
             ambiente lo decide el prefijo de la public-key usada)
Integridad:  SHA256(reference + amount-in-cents + currency + integrity-secret)
Checksum de
eventos:     SHA256(concat(valores de signature.properties, en orden) +
             signature.timestamp + events-secret) — properties es una lista
             de rutas dentro de `data` y puede variar entre eventos; nunca se
             asume un shape fijo
Transacción: GET /v1/transactions/{id}, Authorization: Bearer {public_key}
             (la public-key basta para consultar estado — no hace falta la
             privada)
```

No se usa el parámetro opcional `expiration-time` de Wompi (afecta el orden
de la firma y no aporta nada que `intenciones_pago.expira_at` + el job de
expiración no cubran ya).

**3. Verificación doble (§6.2) — resuelta así: gana la consulta, siempre.**
`webhook-pasarela` valida la firma, y SOLO entonces llama
`consultarTransaccion()` contra la API de Wompi; el estado y el monto que se
materializan en `pagos` son los de esa respuesta, nunca los del cuerpo del
webhook. Si el monto confirmado por la API difiere del `intenciones_pago.monto`
esperado, se registra igual (nunca se ajusta en silencio) y se anota en
`revision_motivo` de la propia fila — queda auditado, no bloqueado.

**4. Formas de pago — ninguna nueva que sembrar.** Las 4 que faltaban
(`tarjeta_credito`, `tarjeta_debito`, `nequi`, `corresponsal_bancario`) ya se
sembraron en D-31/`20260904100000`. El mapeo "método de Wompi → código
`FORMA_PAGO`" vive en `packages/payment-gateways/src/metodo-forma-pago.ts`
(ya existía, con test). Si Wompi reporta un método sin mapeo, el pago se
registra igual contra `transferencia_bancaria` con el hecho anotado — nunca
se bloquea un cobro real ya confirmado por falta de un mapeo de catálogo.

**5. Botón "Pagar" (cierra D-28 punto 4) — condición exacta, AÚN NO
implementada en la UI.** Esta decisión deja listo el backend
(`crear-intencion-pago` genera la URL de Web Checkout firmada; probado
end-to-end contra la función real con credenciales sintéticas de prueba, sin
tocar la red de Wompi porque `crearIntencion()` no la necesita — es
construcción y firma locales). La condición que la UI deberá aplicar al
encender el botón: `pasarela_config.activa = true` para el tenant (no hace
falta `verificada_at` en sandbox — sí en producción, ya lo exige
`fn_activar_pasarela`). El propio encendido del botón, la pantalla de
resultado y el panel del administrador (§8) quedan fuera de esta decisión —
ver "qué falta" abajo.

**6. `ParamsIntencion`/`consultarTransaccion` cambiaron de forma respecto a
D-31.** La fase de estructura no anticipó cómo llegarían las credenciales al
adaptador. Se agregó `credenciales: Record<string,string>` a `ParamsIntencion`
y un segundo parámetro `ContextoConsulta` (`{modo, credenciales}`) a
`consultarTransaccion()` — el caller (la Edge Function, que ya las leyó de
Vault) se las pasa; el adaptador nunca las persiste ni las loguea. PayU/ePayco/
Bold, que siguen en `NO_IMPLEMENTADO`, ya cumplen la forma nueva sin cambios
(`metodosNoImplementados()` ignora los parámetros extra).

**7. Job de expiración (§7) — `expirar-intenciones-pago`, cron con
`CRON_SECRET`** (mismo patrón que `enviar-estados-cuenta-pendientes`). Busca
intenciones `creada`/`pendiente` con `expira_at` vencido; si una SÍ tenía
`transaction_id`, consulta la API antes de expirarla — si resulta que se
aprobó y el webhook nunca llegó, la materializa por el mismo camino canónico
(`fn_registrar_pago_pasarela`), nunca con un INSERT propio. Sin
`transaction_id` (el checkout nunca se abrió) se expira directo, sin llamar a
la API. **Falta programar el cron externo que la invoque** (mismo pendiente
que ya tenía `enviar-estados-cuenta-pendientes`) y confirmar `CRON_SECRET`
como secret de esta función en el proyecto.

**8. UI (§8) — botón "Pagar", pantalla de resultado, panel del
administrador.**
- `ver-estado-cuenta` ahora expone `pago_habilitado` (booleano derivado de
  `pasarela_config.activa` del tenant — ningún secreto, seguro en una puerta
  anónima) y el visor público (`comprobante-cuenta/[id].vue`) enciende
  "Pagar ahora en línea" con esa señal, nunca con una condición local. Cierra
  D-28 punto 4.
- Nueva Edge Function pública `ver-intencion-pago`: el propio uuid de la
  intención actúa como capability token (igual criterio que un enlace de
  reseteo de contraseña) — sin firma HMAC porque no hay nada que reenviar ni
  que perdure, la intención expira sola (§7).
- `pago/resultado.vue`: sondea `ver-intencion-pago` cada 5s (hasta 3 minutos)
  tras volver del checkout — el webhook, no el redirect, es quien confirma,
  así que el estado sigue "pendiente" un rato normal.
- `pagos/transacciones.vue`: bandeja de solo lectura para el administrador
  (intenciones_pago no tiene política de escritura para `authenticated` —
  toda transición la maneja una Edge Function o el cron).
- El campo `metodo` que Wompi recibe en la URL no restringe nada del lado de
  Wompi (su Web Checkout muestra todos los métodos habilitados en el
  dashboard del comercio, no hay parámetro que filtre uno solo) — la UI no
  ofrece selector de método, envía `'pse'` como valor informativo; lo que
  realmente decide la forma de pago del `pago` final es lo que el webhook
  confirma (`estadoReal.metodo`), no lo que se envió al crear la intención.

**9. Vacío contable cerrado tras el despliegue (2026-08-28, pregunta directa
del usuario): la cuenta bancaria de recaudo NO estaba vinculada al pago de
pasarela.** `fn_registrar_pago_pasarela` insertaba `pagos` sin
`cuenta_bancaria_id` — `contable_movimientos()` ante ese campo nulo cae al
evento genérico `BANCO_RECAUDO` en vez de debitar la cuenta puntual del
tenant, a diferencia de cualquier pago manual no-efectivo (`registrar-pago`
ya resolvía la cuenta `es_recaudo=true`). **Esto no es la cuenta a la que
Wompi liquida de verdad** — eso lo configura la copropiedad directamente en
su panel de Wompi, fuera de AQUILA (D-31 §A) — es la cuenta que la propia
copropiedad marcó dentro de AQUILA como su cuenta de recaudo, el mismo dato
que ya usa cualquier otro pago no-efectivo. Corregido en
`20260904210000_pago_pasarela_cuenta_recaudo.sql`: `fn_registrar_pago_pasarela`
ahora resuelve esa cuenta (mismo criterio que `registrar-pago/index.ts`) y la
deja en la fila — se hizo DENTRO de la función SQL, no en las dos Edge
Functions que la llaman, para no duplicar la consulta. Sin cuenta
`es_recaudo` configurada, la columna sigue quedando `null` (mismo respaldo de
antes). Verificado contra la base real: `tests/rls/intenciones-pago.test.ts`
("DOBLE WEBHOOK IDÉNTICO") ahora arma una cuenta `es_recaudo` en el fixture y
confirma que `pagos.cuenta_bancaria_id` queda exactamente esa cuenta.

**Rate limit corregido durante las pruebas.** `crear-intencion-pago` partió
en 15/hora por IP y resultó demasiado bajo: varios residentes de una misma
copropiedad comparten con frecuencia la IP del router del edificio y podrían
generar cada uno su propio checkout la misma hora. Subido a 40/hora, mismo
orden de magnitud que `configurar-pasarela`.

**Comportamiento de Wompi descubierto probando, no documentado de antemano.**
Ninguno todavía — la integración no se ha probado contra una transacción real
de sandbox (ver más abajo).

**Qué quedó implementado y verificado:**

```text
✓ adaptadorWompi real: crearIntencion/consultarTransaccion/validarFirmaWebhook/
  parsearWebhook — 17 tests unitarios, incluida una fixture de firma real que
  pasa y tres variantes que deben fallar (alterada, secreto de otro tenant,
  payload sin forma esperada)
✓ fn_leer_credenciales_pasarela (20260904200000), aplicada a desarrollo
✓ crear-intencion-pago desplegada — 6 tests end-to-end contra la función real
  (FORBIDDEN para no-auxiliar, sin saldo, método no soportado, monto excede
  saldo, éxito con URL de Web Checkout firmada y verificada, consulta de
  estado vía ver-intencion-pago)
✓ webhook-pasarela desplegada — 2 tests end-to-end contra la función real
  (token de webhook desconocido, firma inválida) — ambos auditados en
  audit_log y confirmados sin tocar `pagos`
✓ ver-intencion-pago y expirar-intenciones-pago desplegadas; esta última
  verificada rechazando una llamada sin CRON_SECRET (403)
✓ UI: botón "Pagar ahora" en el visor público, pantalla de resultado con
  sondeo, panel de transacciones del administrador — las tres verificadas
  cargando en el navegador (sin errores de consola) contra la app real;
  `nuxt typecheck` sin errores nuevos
✓ pnpm vitest en verde en todo el módulo de pasarelas/conciliación
  (105 tests)
```

**Qué falta — NO declarado DONE sin evidencia (§11 del prompt lo prohíbe
explícitamente):**

```text
✗ Ninguna transacción real de sandbox de Wompi se ha completado todavía. El
  camino 'aprobada' de webhook-pasarela (verificación doble real, divergencia
  de monto, reembolso vía fn_anular_pago) NO tiene prueba end-to-end contra
  Wompi — requiere que un humano complete un checkout real en el sandbox
  (crear-intencion-pago ya genera la URL, y el botón "Pagar ahora" del visor
  público ya la dispara; falta que alguien la abra y pague con una
  tarjeta/PSE de prueba de Wompi) antes de considerar esta fase verificada de
  punta a punta
✗ expirar-intenciones-pago no tiene todavía un cron externo que la invoque
  (mismo pendiente ya conocido de enviar-estados-cuenta-pendientes) — hay que
  confirmar CRON_SECRET como secret de la función y programar la invocación
✗ El botón "Pagar ahora" y la pantalla de resultado no se han probado
  visualmente con datos reales (solo con ids inexistentes, para confirmar que
  no rompen) — falta abrir un estado de cuenta real con una pasarela activa
✗ PayU, ePayco, Bold — siguen en NO_IMPLEMENTADO, como exige §0 del prompt
```


## D-33 — Tests de componente Vue con Vitest, sin levantar Nuxt

|            |                                                    |
| ---------- | -------------------------------------------------- |
| **Fase**   | AEL-004 Fase 8 (revisión del constructor visual)   |
| **Estado** | Aceptada                                           |
| **Decide** | Usuario (pregunta explícita, opción "environmentMatchGlob") |

**Contexto.** El monorepo no tenía **ninguna** infraestructura para montar un
`.vue` en un test: ni `@vue/test-utils`, ni un entorno DOM, ni
`@vitejs/plugin-vue` declarados en ningún `package.json`, y ningún test
montaba un componente. La cobertura del 80 % se cumple sobre `packages/*/src`
y `apps/web/app/types/permissions.ts` — los `.vue` quedan fuera de
`coverage.include`, así que el render nunca estuvo cubierto.

El rediseño del constructor visual de fórmulas (Fase 8) reescribe la
presentación de cuatro componentes. Hacerlo sin red es exactamente donde se
cuelan las regresiones, así que la infraestructura se monta **antes** del
primer cambio de presentación.

**Decisión.**

1. Cuatro devDependencies en la raíz: `@vue/test-utils`, `happy-dom`,
   `@vitejs/plugin-vue` y `vue` (esta última porque con pnpm estricto el
   código de la raíz no resuelve `vue` desde `apps/web`). Se fija
   `@vitejs/plugin-vue@^5` para emparejar con el Vite 5 que trae Vitest 2 —
   `apps/web` corre sobre Vite 8 vía Nuxt, pero ese árbol es independiente.
2. `vitest.config.ts` gana `plugins: [vue()]` y el alias `~`/`@` →
   `apps/web/app`, replicando el `srcDir` de Nuxt 4.
3. **No** se usa `@nuxt/test-utils`: arranca un Nuxt por suite y estos son
   tests unitarios de render, no de integración con el runtime de Nuxt.
4. Los auto-imports de Nuxt se cubren con un puente mínimo
   (`tests/setup/nuxt-auto-imports.ts`) que expone **solo** las APIs de Vue
   que esos SFC usan sin importar (`computed`, `inject`, `provide`…). No se
   replican composables de Nuxt (`useState`, `useRoute`): su comportamiento
   depende del runtime y un test unitario no debe fingirlo.

**Desvío respecto de lo aprobado.** Se aprobó acotar el entorno DOM con
`environmentMatchGlob`. No funciona en este repo: Vitest compara el patrón
contra la **ruta absoluta** del archivo, que en Windows lleva `\`, así que
ningún glob con `/` matchea — el test cae en el entorno `node` por defecto y
falla con `document is not defined` sin explicar la causa. Se usa en su lugar
el docblock por archivo `// @vitest-environment happy-dom`, que consigue el
mismo alcance acotado (el entorno por defecto sigue siendo `node` para
`packages/`, `tests/` y `apps/web/app/utils/`) sin depender del separador de
rutas. El puente de auto-imports se guarda con `typeof globalThis.window` para
quedar inerte fuera del DOM: los tests en `node` no ven ningún global nuevo y
no pueden empezar a depender de él por accidente.

**Consecuencia.** Un test de componente nuevo necesita el docblock en su
primera línea. Si falta, falla con `document is not defined` — mensaje
suficientemente característico como para no perder tiempo.

## D-34 — La tabla de precedencia del lienzo se contrasta contra el printer real

|            |                                                  |
| ---------- | ------------------------------------------------ |
| **Fase**   | AEL-004 Fase 8 (movimiento 01)                   |
| **Estado** | Aceptada                                         |
| **Decide** | Agente (consecuencia técnica del movimiento 01)  |

**Contexto.** El constructor visual dibujaba toda `ExpresionBinaria` plana,
con la misma separación a cualquier profundidad: `(a - b) / 12` y
`a - (b / 12)` se leían igual. El anidamiento **sí** estaba en el DOM —cada
binaria envuelve a sus operandos— pero ese envoltorio no tenía borde, fondo ni
relleno, así que era invisible. En solo lectura, además, el diff de versiones
(`AelBlockInstruccionDiff`, que reutiliza `AelBlockExpresion` en `readonly`)
no podía mostrar un cambio de agrupamiento: marcaba la instrucción en ámbar
sobre dos líneas indistinguibles, en la pantalla donde se aprueba o rechaza.

**Decisión.** El lienzo encajona un operando exactamente cuando
`imprimirOperando()` de `packages/ael-language/src/printer.ts` pondría un
paréntesis — misma tabla de precedencia y mismo tratamiento del lado derecho
asociativo por la izquierda. La caja aparece donde iría el paréntesis, ni más
ni menos, de modo que el lienzo y el texto digan literalmente lo mismo.

Se descartó encajonar **toda** binaria anidada: llenaría de cajas expresiones
como `a + b * c`, donde la precedencia aritmética es la que cualquiera espera
y el texto tampoco lleva paréntesis.

**Por qué se duplica la tabla.** `necesitaAgrupador()` vive en
`apps/web/app/utils/ael-bloques.ts` con su propia copia de `PRECEDENCIA`.
Importar el valor desde `@aquila/ael-language` arrastraría el paquete al
bundle del cliente por una constante. La duplicación se paga con un test que
recorre las **200 combinaciones** de operador externo × interno × lado y exige
`caja ⇔ paréntesis` contra el printer real
(`apps/web/app/utils/ael-bloques.test.ts`). Si alguna de las dos tablas cambia
sin la otra, CI lo dice.

**Consecuencia.** `AelBlockExpresion` recibe dos props nuevas
(`precedenciaPadre`, `esLadoDerecho`) que se propagan hacia los operandos. El
operando de una unaria recibe `Infinity`, igual que en el printer; los
argumentos de una llamada no reciben nada (nunca llevan paréntesis). El nodo
agrupado lleva `data-agrupado` como punto de anclaje estable para los tests,
que así no dependen de las clases concretas —importante, porque los
movimientos 02/03/10 van a reestilizar estos mismos componentes.

## D-35 — Dentro de una expresión AEL van controles nativos, no componentes Nuxt UI

|            |                                                  |
| ---------- | ------------------------------------------------ |
| **Fase**   | AEL-004 Fase 8 (movimiento 10)                   |
| **Estado** | Aceptada                                         |
| **Decide** | Agente (desvío consciente, se registra para que se pueda revertir) |

**Contexto.** El movimiento 10 de la Fase 8 se planteó como «entrar al sistema
de diseño», y `DESIGN_SYSTEM.md` es explícito: preferir siempre un componente
`U*` antes que un elemento HTML crudo. El constructor de fórmulas usaba
`<select>`, `<input>` y `<button>` a mano en todas partes.

**Decisión.** Se distingue por contexto:

- **Alrededor** del lienzo sí manda el sistema: el interruptor Texto/Bloques
  pasó a un segmentado con `aria-pressed` —el mismo patrón que ya usa «Modo de
  cálculo» en la pestaña Definición—, y los botones sueltos siguen siendo
  `UButton`.
- **Dentro** de una expresión se conservan `<select>`/`<input>` nativos,
  estilizados con los tokens (`neutral-*`, mínimo 12 px, píldoras de ~28 px de
  alto).

**Por qué.** `USelect` y `UInput` están dimensionados para formularios: traen
su propio borde, relleno y alto mínimo de ~36 px. Una sola expresión contiene
entre 5 y 15 de ellos **en la misma línea**. Sustituirlos multiplicaría el
ancho de cada fila y agravaría justo el hallazgo A7, que este mismo movimiento
existe para arreglar (medido antes: 937 px de fila en un lienzo de 494). Sería
cumplir la letra de la regla rompiendo su propósito.

**Consecuencia.** `apps/web/app/components/AelBlock*.vue` son los únicos
`.vue` donde un `<select>`/`<input>` crudo es la opción correcta y no deuda.
El resto del estándar sí se aplicó: se retiraron los `text-[9px]`/`text-[10px]`,
se migró `gray-*` → `neutral-*` y **los ocho `components/Ael*.vue` salieron de
`ARCHIVOS_LEGADO_GRAY`** en `tests/governance/design-system-coverage.test.ts`,
así que a partir de ahora un `gray-*` nuevo ahí rompe CI.

**Cómo revertirlo si cambia el criterio.** Los controles ya están centralizados
en dos constantes de clase (`CLASE_PILDORA`, `CLASE_CAMPO` en
`AelBlockExpresion.vue`): cambiarlos por componentes es un reemplazo acotado,
no una reescritura.

---

## D-36 — Dominio Fondos: se evoluciona el modelo de GAP-15, no se reemplaza; alcance recortado a lo que el repo puede sostener

|            |                                                              |
| ---------- | ------------------------------------------------------------ |
| **Fase**   | Módulo de Fondos, BLOQUE A (diagnóstico)                      |
| **Estado** | Aceptada                                                      |
| **Decide** | Usuario (2026-09-04, tras el diagnóstico `ANALISIS_FONDOS_BLOQUE_A.md`) |

**Contexto.** `Casos de uso/Fondos/Modelo_Maestro_Fondos_AQUILA.md` propone un dominio
de fondos completo (12 entidades, ciclo de vida de 8 estados, compromisos, solicitudes
de uso, instrumentos financieros, rendimientos, conciliación propia). El diagnóstico del
BLOQUE A encontró tres cosas:

1. `fondos` y `fondo_movimientos` **ya existen desde F2** con RLS+FORCE, append-only,
   trigger de saldo derivado y puente contable (`fondos.contable_cuenta_id`).
2. **Están muertas**: no hay un solo `insert into public.fondo_movimientos` en todo el
   repositorio. En la base de desarrollo hay 0 movimientos y 1 sola fila de `fondos`
   (la del seed GC-001) entre ~170 tenants.
3. La mitad del ciclo que el Modelo exige depende de dominios **inexistentes**: cuentas
   por pagar, proveedores, pagos salientes, contratos, proyectos, instrumentos
   financieros.

Además, `PLAN §9.2` prohíbe en absoluto inventar tablas no cerradas en el plan, y
`PLAN §4.3` había cerrado GAP-15 con el modelo mínimo. Precedente idéntico: E-16 reabrió
ese mismo §4.3 y exigió registrar **GAP-19** antes de tocar el esquema.

**Decisión.**

- Se registra **GAP-22** en `PLAN §7` y se reescribe `PLAN §4.3` con el modelo objetivo.
  El corte de GAP-15 queda **superado**, no borrado.
- Se **evolucionan** `fondos` y `fondo_movimientos`; no se crean tablas paralelas ni se
  duplica el fondo de imprevistos existente (Modelo §55/§56).
- Se añaden cuatro tablas: `fondo_autorizaciones`, `fondo_fuentes`,
  `fondo_compromisos`, `fondo_solicitudes_uso`. **No** se crean `fondos_instrumentos`,
  `fondos_remanentes`, `fondos_cierres` ni `fondos_alertas`: remanente y cierre son
  estado + documento sobre el propio fondo, y las alertas se derivan (como
  `fn_alertas_cartera`), no se persisten.
- **`naturaleza` (enum de 2) + `tipo_id` (`lista_tipos`, familia `TIPO_FONDO`)**. El enum
  se justifica bajo D-24 porque gatilla lógica real: unicidad por copropiedad y las
  reglas de la Ley 675 art. 35/38 y Ley 2079/2021. El vocabulario descriptivo
  —proyecto, obra, mantenimiento, renovación, especial— es parametrizable y **no hereda**
  las reglas del fondo de imprevistos.
- **Tres saldos**: `saldo`, `comprometido`, `disponible`. `fondos.saldo_actual` pasa a ser
  caché materializado con función de reconciliación obligatoria; la fuente de verdad es
  `fn_fondo_saldos()`. Se cierra el agujero por el que hoy el campo es escribible desde
  fuera del trigger.
- **Fuera de alcance**, como referencias nullables y nunca simuladas: uso → CxP → pago
  saliente → banco; instrumentos financieros/CDT y sus rendimientos conciliados;
  proyectos.

**Por qué recortado.** El Modelo §27 prohíbe expresamente registrar un "uso" como simple
disminución de saldo cuando existe una obligación económica real pendiente. Sin dominio
de CxP no se puede cumplir esa regla; construir el uso a medias sería violarla. Es
preferible dejar el eslabón explícitamente vacío y registrado que fingirlo.

**Consecuencia.** `ANALISIS_FONDOS_BLOQUE_A.md` es el entregable del BLOQUE A y la
referencia del estado de partida (incluidos cuatro defectos preexistentes: R8 violado en
datos reales, ninguna copropiedad con fondo de imprevistos, `requiere_fondo` sin guard,
y tres eventos contables sembrados sin consumir).

---

## D-37 — Fondos usa la matriz de permisos existente + un módulo de rol funcional, no diez permisos nuevos

|            |                                                    |
| ---------- | -------------------------------------------------- |
| **Fase**   | Módulo de Fondos, BLOQUE A                          |
| **Estado** | Aceptada                                            |
| **Decide** | Agente (recomendación aceptada por el usuario)      |

**Contexto.** El Modelo Maestro §36/§48 pide diez permisos propios (`fondos.ver`,
`fondos.crear`, `fondos.autorizar`, `fondos.aportar`, `fondos.solicitar_uso`,
`fondos.aprobar_uso`, `fondos.comprometer`, `fondos.cerrar`, `fondos.auditar`,
`fondos.editar`). `apps/web/app/types/permissions.ts` define **12 permisos genéricos**
por recurso (`data:*`, `settings:manage`, `audit:view`, …), exige cobertura de test del
**100 %**, y `tests/rbac/t-matrix.test.ts` falla si el TS y las políticas RLS divergen.

**Decisión.** No se amplía `Permission`. Fondos usa:

- `data:read` para consultar, `data:create` para registrar, `settings:manage` para
  configurar el fondo y sus fuentes, `audit:view` para los controles de auditoría;
- el **módulo de rol funcional** `financiero` —donde `fondos` y `fondo_movimientos` ya
  están, desde `20260830130000_roles_funcionales_enforcement.sql`— para la visibilidad
  por rol funcional;
- **segregación de funciones en la base**, no en la matriz: quien solicita un uso no puede
  aprobarlo, y quien aprueba no puede ejecutar. Se implementa con guards de trigger, igual
  que `auditoria_hallazgo_cierre_guard` y `guard_accion_cobranza_transicion`.

**Por qué.** La única capacidad realmente diferenciada que ya existe en AQUILA (aprobar
cobranza de alto impacto) tampoco está modelada como `Permission` — vive en un trigger.
Añadir diez permisos obligaría a reescribir la matriz, sus políticas RLS y el test
T-MATRIX para expresar algo que el repo ya expresa mejor en la base de datos, que es
además donde `PLAN §9` exige que viva la barrera real.

**Cómo revertirlo.** Si aparece la necesidad de un rol "aprobador de fondos" que no sea
`administrador`, la vía nativa es una fila nueva en la familia `ROL_FUNCIONAL` de
`lista_tipos` + su mapeo en `rol_funcional_modulo`, sin tocar `permissions.ts`.

---

## D-38 — BLOQUE K (circuito de cobro del fondo): se abre el frente que D-36 dejó aparte, reutilizando `conceptos`/`cargos`/`pago_aplicaciones` sin tocar AEL

|            |                                                                     |
| ---------- | ------------------------------------------------------------------- |
| **Fase**   | Módulo de Fondos, BLOQUE K                                           |
| **Estado** | Aceptada                                                             |
| **Decide** | Usuario (2026-09-04, "sigue con K", tras cerrar B–G+J+L+O y el alta) |

**Contexto.** El propio BLOQUE A (§6 de `ANALISIS_FONDOS_BLOQUE_A.md`) dejó K fuera del
alcance aceptado en D-36 ("bloques B–G + J + L + O + P + R + S + T"), calificándolo de
"ejecutable pero caro... merece ser su propio frente, después de B–G". El usuario ahora
pide explícitamente continuar con él. Cierra §4.4 completo y §4.6: `CARTERA_FONDO_IMPREVISTOS`
(1315)/`INGRESO_FONDO_IMPREVISTOS` (4115) llevan sembrados desde antes de este módulo sin que
nada los consuma, y las dos columnas de `politicas_financieras`
(`fondo_imprevistos_porcentaje`/`_base`) son parámetros que nadie lee.

**Decisión — reusar la tubería de cobro existente, no crear una paralela.**

- **Un `concepto` nuevo, no una tabla nueva.** `conceptos` ya soporta exactamente lo que
  hace falta (`modo_calculo='distribucion'`, `formula_ael`, `tipo_recurrencia='recurrente'`,
  `periodicidad='mensual'`) — mismo mecanismo que `ADMINISTRACION`. Se añade una cuarta fila a
  `conceptos_plantilla` (`FONDO_IMPREVISTOS`), con el mismo patrón PC-3c: `fn_instanciar_conceptos`
  (ya idempotente, `ON CONFLICT (tenant_id, codigo) DO NOTHING`) la copia a los tenants
  existentes sin tocar la función. Nace en `estado='borrador'`: no cobra nada hasta que un
  administrador la revise y apruebe (mismo maker-checker que ya rige todo concepto), lo que
  además evita el caso "activo sin `fondo_imprevistos_porcentaje` configurado" — un concepto en
  borrador no entra al snapshot (`snapshot-supabase.ts` filtra `estado='activo'`).
- **La fórmula activa las dos columnas dormidas de `politicas_financieras`, con la función
  `PORCENTAJE()` que AEL ya trae** (`02_AEL_Language...md`, `PORCENTAJE(total, pct) -> MONEY`,
  ya cubierta por `functions.test.ts`) — no hace falta ninguna capacidad nueva de AEL:
  ```
  REGLA FONDO_IMPREVISTOS
  DEFINIR porcentaje = PARAMETER.FONDO_IMPREVISTOS_PORCENTAJE
  SI PARAMETER.FONDO_IMPREVISTOS_BASE_CUOTA_ADMIN ENTONCES
    RETORNAR PORCENTAJE(CONCEPTO.ADMINISTRACION, porcentaje)
  SINO
    RETORNAR PORCENTAJE(PARAMETER.PRESUPUESTO_ANUAL, porcentaje)
  FIN
  ```
  `CONCEPTO.ADMINISTRACION`/`PARAMETER.PRESUPUESTO_ANUAL` ya existen en el snapshot; lo único
  que se añade es exponer `fondo_imprevistos_porcentaje`/`_base` (hoy sin ningún lector) como
  dos parámetros más, mismo patrón que `redondeo_modo`/`redondeo_escala`. Referenciar
  `CONCEPTO.ADMINISTRACION` en el texto de la fórmula crea una dependencia real en el grafo
  (`graph.ts`, orden topológico) incluso para el tenant que usa la rama `presupuesto_anual`:
  acoplamiento aceptado porque `ADMINISTRACION` es de facto obligatorio en toda copropiedad
  operativa.
- **Cargo → estado de cuenta → recaudo: cero cambios.** Un cargo de `FONDO_IMPREVISTOS` nace
  de `fn_aplicar_liquidacion_idempotente` exactamente igual que uno de `ADMINISTRACION`
  (mismo `concepto_id`, `categoria='capital'`); cartera, estado de cuenta e imputación de pagos
  no distinguen conceptos, así que no hay nada que tocar ahí.
- **Recaudo → aporte al fondo: un trigger nuevo, siguiendo el precedente de
  `trg_descuento_pronto_pago`.** `pago_aplicaciones` ya tiene ese patrón exacto (trigger
  `AFTER INSERT ... REFERENCING NEW TABLE`, `SECURITY DEFINER`, delegando a una función que
  hace el trabajo real) para el descuento por pronto pago. `trg_aporte_fondo_imprevistos`
  reutiliza el mismo patrón: por cada fila nueva de `pago_aplicaciones` cuyo cargo apunte a un
  concepto `FONDO_IMPREVISTOS`, inserta un `fondo_movimientos` de tipo `aporte` (monto, `pago_id`
  y `periodo_id` heredados de la aplicación/cargo). `fondo_movimientos.pago_id` ya existía desde
  el bloque E — se diseñó para esto y estaba sin usar.
- **Contabilidad:** el bloque de cargos y el de `pago_aplicaciones` de `contable_movimientos()`
  distinguen `concepto.codigo = 'FONDO_IMPREVISTOS'` para resolver contra `CARTERA_FONDO_IMPREVISTOS`
  (1315)/`INGRESO_FONDO_IMPREVISTOS` (4115) en vez de la resolución genérica por `categoria`/
  `presupuesto_cuenta`, y pueblan `fondo_id` en esas líneas (antes `null` ahí) — las dos cuentas
  ya exigían `requiere_fondo` desde BLOQUE L, así que sin esto `contable_dimensiones_faltantes()`
  las reportaría como incompletas en cuanto alguien las usara. El "aporte" que dispara el
  trigger genera una tercera línea (bloque D, ya existente desde BLOQUE E/L): el efectivo pasa
  del banco general a `FONDO_IMPREVISTOS_EFECTIVO` (111015). Las tres líneas por cuota cobrada
  son intencionales, no una duplicación: cargo (nace la CxC), recaudo (se cobra, se libera la
  CxC), aporte (el efectivo se segrega al fondo) — es exactamente la cadena del Modelo §42
  (`presupuesto → base → regla → liquidación → cargo → estado de cuenta → recaudo → aporte →
  banco`), no el eslabón de conciliación bancaria real (`extracto_linea`), que sigue fuera de
  alcance (D-36).

**Límite explícito — anular un pago no reversa el aporte.** RC-2
(`20260903130000_anulacion_pago.sql`) ya documentó, para el descuento por pronto pago, que
anular un pago no reversa automáticamente sus efectos derivados; esta migración adopta la
misma postura para el aporte al fondo, por la misma razón: el espejo negativo que genera una
anulación no identifica de forma inequívoca cuál `fondo_movimientos` corresponde revertir
cuando un mismo pago tuvo más de una aplicación contra `FONDO_IMPREVISTOS` (sin
`aplicacion_id` en `fondo_movimientos`, emparejar por monto sería una heurística frágil).
`trg_aporte_fondo_imprevistos` filtra `monto > 0` explícitamente para no procesar el espejo de
una anulación ni romper con una excepción la propia anulación (`fondo_movimientos_monto_signo`
exige que un `aporte` sea `> 0`, y el espejo llega en `<> 0`, potencialmente negativo). Anular
un pago que cubrió una cuota del fondo exige hoy un movimiento manual de `reversion` contra el
fondo — mismo criterio operativo que ya existe para cualquier corrección de `fondo_movimientos`.

**Consecuencia.** Cierra §4.4 y §4.6 de `ANALISIS_FONDOS_BLOQUE_A.md`. Sigue fuera de alcance
(D-36, sin cambios): uso → CxP → pago saliente → banco; instrumentos financieros y sus
rendimientos con conciliación propia; proyectos.

## D-39 — BLOQUE R (auditoría del dominio Fondos): audit_log solo donde una transición de estado sobreescribe el rastro; 3 controles automáticos nuevos, reusando el CCM existente

|            |                                                                     |
| ---------- | ------------------------------------------------------------------- |
| **Fase**   | Módulo de Fondos, BLOQUE R                                           |
| **Estado** | Aceptada                                                             |
| **Decide** | Usuario (2026-09-04, "sigue con R", tras cerrar B–G+J+L+K+P)         |

**Contexto.** BLOQUE A (§6 de `ANALISIS_FONDOS_BLOQUE_A.md`) describe R como "`audit_log` +
controles del módulo de auditoría interna", remitiendo al Prompt Fondos §37 (AUDITORÍA) y §60
(AUDITORÍA CONTINUA). El repo ya tiene ambos mecanismos construidos para otros dominios
(`audit_membership_rol_funcional_change`, 20260830170000; Continuous Control Monitoring vía
`auditoria_control_ejecutar`, 20260914/20260917/20260918) — R no inventa nada, extiende los dos.

**Decisión 1 — `audit_log` solo en fondos/fondo_compromisos/fondo_solicitudes_uso, no en
fondo_movimientos ni fondo_autorizaciones.** Las dos últimas ya son append-only
(`forbid_mutation`, Modelo §15): duplicar cada fila en `audit_log` sería el mismo dato dos
veces, cero señal nueva. Las tres primeras SÍ mutan (`estado` se sobreescribe con cada
transición, sin columna que registre quién la hizo) — `fondos` en particular no tiene ninguna
columna `registrado_por`, así que sin el trigger no hay forma de saber quién creó un fondo. Un
trigger AFTER por tabla (`audit_fondo_change`, `audit_fondo_compromiso_change`,
`audit_fondo_solicitud_uso_change`), idéntico patrón al de rol funcional: INSERT →
`<entidad>.creado`, UPDATE de `estado` → `<entidad>.estado_cambiado`. Esto cierra el registro
que exige el Prompt Fondos §37 ("creación, aprobación, aporte, uso, compromiso, rendimiento,
traslado, reversión, cierre"): los movimientos financieros ya están en `fondo_movimientos.tipo`
(inmutable); lo que faltaba era quién cambió un estado y cuándo.

**Decisión 2 — 3 controles automáticos nuevos en `auditoria_control_ejecutar`, no un motor de
reglas separado para Fondos.** `FONDO_SIN_AUTORIZACION` (§37/§60 "Fondo sin autorización": un
fondo de destinación específica que avanzó más allá de `propuesto` sin una fila en
`fondo_autorizaciones` — el fondo de imprevistos queda exento, la Ley 675 art. 35 lo crea
automático sin acta), `FONDO_COMPROMISO_EXCEDE_DISPONIBLE` (defensa en profundidad sobre
R9/`guard_fondo_compromiso`, mismo criterio que `CARTERA_SOBREAPLICACION`: verificar que la
guarda nunca se haya esquivado), `FONDO_CERRADO_CON_SALDO` (§37/§60 "fondo cerrado con
obligaciones/saldo": `guard_fondo_estado_transicion` valida la máquina de estados, no que el
saldo sea cero antes de `cerrado` — un fondo puede llegar a `cerrado` con saldo o comprometido
pendiente porque BLOQUE O, la decisión estructurada del remanente, todavía no existe; este
control cubre ese hueco mientras tanto). Verificado en vivo contra datos reales de desarrollo:
un control real creado y ejecutado detectó que FON-CMP (activo, destinación específica, cero
autorizaciones) era una excepción genuina, creó el hallazgo automático, y una segunda corrida
tras registrar la autorización dio PASS.

**Decisión 3 — `AuditarAhoraBoton` (ya existente, usado en `LiquidacionPanel.vue`) se integra
en `FondoDetalleDrawer.vue`, no un botón nuevo.** `origen-tipo="fondo"` — `origen_tipo` en
`auditoria_engagements` es texto libre, no una lista cerrada, así que no hace falta migración
para el valor nuevo. Probado en vivo: crea el engagement vinculado, visible en Auditoría ›
Auditorías con el badge "Desde fondo".

**Límite explícito.** No se seedean filas de `auditoria_riesgos`/`auditoria_controles` para
Fondos en ningún tenant — igual que el resto del catálogo CCM, es el auditor quien decide crear
el control en su copropiedad; esta migración solo hace posible que lo cree (extiende el CHECK
de `codigo_automatico` y el `CONTROLES_AUTOMATICOS` del frontend). Tampoco se audita
`fondo_fuentes.activa` — activar/desactivar una fuente no está en la lista de eventos que exige
el Prompt Fondos §37, y añadir un cuarto trigger de forma distinta a los otros tres habría sido
alcance no pedido.

**Consecuencia.** Cierra BLOQUE R de `ANALISIS_FONDOS_BLOQUE_A.md` §6. Migración
`20260930100000_fondo_auditoria.sql`; 4 tests nuevos en
`tests/rls/auditoria-controles-automaticos.test.ts`.

## D-40 — BLOQUE O (cierre y remanentes): `fondo_remanentes` + `fn_fondo_cerrar` atómica; un candado real de BLOQUE F corregido en el proceso

|            |                                                                     |
| ---------- | ------------------------------------------------------------------- |
| **Fase**   | Módulo de Fondos, BLOQUE O                                           |
| **Estado** | Aceptada                                                             |
| **Decide** | Usuario (2026-09-05, "sigue con O", tras cerrar B–G+J+L+K+P+R)       |

**Contexto.** BLOQUE A (§6 de `ANALISIS_FONDOS_BLOQUE_A.md`) describió O como "puro estado +
documento" — una simplificación que resultó incompleta frente al Prompt Fondos §35 (REMANENTES:
"saldo final → remanente → decisión competente → destino → traslado/devolución/aplicación →
cierre") y §36 (CIERRE: "no cerrar si hay... compromisos pendientes... remanente sin decisión").
Un simple cambio de `fondos.estado` no hace cumplir ninguna de las dos cosas. La corrección: el
propio informe de BLOQUE A había reportado antes O como ya cerrado (error del reporte de cierre
de BLOQUE P, corregido en esa misma conversación) — nunca se implementó hasta ahora.

**Lo que ya existía y no había que reconstruir.** BLOQUE E/F (20260929120000/140000) ya reservan
`cierre_remanente` como el único tipo de movimiento que un fondo `en_cierre` admite
(`guard_fondo_movimiento`), y `fn_fondo_movimiento_efecto` ya sabe que resta del saldo. Solo
faltaba el punto de entrada que registra la decisión y la guarda que impide llegar a `cerrado`
saltándosela.

**Decisión 1 — `fondo_remanentes`, append-only, mismo criterio que `fondo_autorizaciones`.**
Guarda quién decidió (`organo_id`, reusa `ORGANO_DECISORIO`), hacia dónde (`destino` — vocabulario
cerrado `traslado|devolucion|aplicacion`, D-24: gobierna si se exige `fondo_destino_id` y si se
genera un segundo movimiento) y qué `fondo_movimientos` (`cierre_remanente`) materializó la
decisión — enlace validado por trigger, no solo por convención.

**Decisión 2 — `fn_fondo_cerrar`, operación atómica (Prompt §53), no una secuencia de writes del
cliente.** Un cierre real es 1–3 escrituras (el `cierre_remanente`, la decisión, y si el destino es
traslado, un `traslado_entrada` en el fondo destino) más la transición final — hacerlo en el
cliente arriesgaría un estado intermedio si algo falla a mitad de camino. Si el saldo derivado ya
es 0, la función cierra directo sin exigir destino/órgano/decisión — no hay nada que decidir.
SECURITY INVOKER (mismo criterio que `fn_aprobar_novedad`): las mismas políticas RLS que ya
protegen un insert directo protegen esto, no hace falta elevar privilegios.

**Decisión 3 — `guard_fondo_cierre_completo` como trigger ADICIONAL, no una reescritura de
`guard_fondo_estado_transicion`.** Este último sigue siendo la única fuente de verdad del grafo de
estados válido (y tiene tests propios); el nuevo trigger solo añade la precondición de negocio
para la arista en_cierre→cerrado específicamente — sin compromisos/solicitudes pendientes, saldo
en 0. Cubre tanto la RPC como un UPDATE directo que intente saltársela.

**Hallazgo real durante la verificación en vivo, corregido aquí — no un bug preexistente ajeno,
sino un candado que BLOQUE O expuso al usar `en_cierre` por primera vez para algo con
consecuencias.** `guard_fondo_compromiso` (BLOQUE F) exigía `fondo.estado = 'activo'` para
*cualquier* insert o update sobre `fondo_compromisos` — antes de BLOQUE O eso no importaba, porque
nada dependía de poder resolver un compromiso mientras el fondo estaba `en_cierre`. Con
`guard_fondo_cierre_completo` exigiendo cero compromisos pendientes para cerrar, ese "solo activo"
se volvió un candado real: un compromiso `proyectado`/`comprometido` en un fondo `en_cierre` no se
podía ni liberar ni anular (la única vía, un UPDATE de estado, exigía `activo`), y por lo tanto
tampoco dejaba cerrar el fondo. Encontrado en vivo, no en una revisión de código: FON-CMP (dato de
prueba real, con un compromiso `proyectado` heredado de una sesión anterior) reprodujo el candado
exacto al intentar cerrarlo desde la UI. Corregido en
`20260930130000_fondo_compromiso_resolver_en_cierre.sql`: `guard_fondo_compromiso` ahora permite
`liberado`/`anulado` también durante `en_cierre` (INSERT sigue exigiendo `activo` sin excepción;
UPDATE hacia cualquier otro estado también). `fondo_solicitudes_uso` no necesitó el mismo arreglo:
su guard ya restringía el chequeo de estado a `INSERT` únicamente.

**Consecuencia — un control de BLOQUE R (D-39) pasa de alcanzable a defensa en profundidad.**
`FONDO_CERRADO_CON_SALDO` era alcanzable cuando se escribió (D-39, 2026-09-04): nada impedía
`activo → en_cierre → cerrado` con saldo ≠ 0. Con `guard_fondo_cierre_completo` en pie, esa
condición ya no se puede alcanzar sin desactivar la propia guarda — mismo estatus que
`CARTERA_SOBREAPLICACION`/`GUARDAS_INMUTABILIDAD_DESHABILITADAS`. Su test en
`tests/rls/auditoria-controles-automaticos.test.ts` se reescribió para afirmar PASS sobre datos
limpios en vez de forzar el FAIL ya irreproducible.

**Límite explícito (mismo criterio D-36).** El Prompt §36 pide también "sin movimientos no
conciliados" y "sin soportes faltantes" antes de cerrar — no se hacen cumplir: la conciliación
bancaria no está enlazada por fondo, y volver `documento_id` obligatorio en `fondo_movimientos`
rompería el aporte automático por recaudo de BLOQUE K (`fn_fondo_credito_recaudo` no adjunta
documento). Quedan fuera, igual que CxP/instrumentos/proyectos.

**Consecuencia.** Cierra BLOQUE O de `ANALISIS_FONDOS_BLOQUE_A.md` §6. Migraciones
`20260930120000_fondo_cierre_remanente.sql` y
`20260930130000_fondo_compromiso_resolver_en_cierre.sql`; 10 tests nuevos en
`tests/tenancy/fondos-modelo-general.test.ts`; 1 test de D-39 corregido para reflejar la nueva
guarda.

## D-41 — Edge Functions sobre la decisión de solicitudes de uso: rate limit + error estructurado + logging, no un bypass de RLS

|            |                                                                                       |
| ---------- | ------------------------------------------------------------------------------------- |
| **Fase**   | Módulo de Fondos, ítem pendiente §11.4 de `ANALISIS_FONDOS_BLOQUE_A.md`                |
| **Estado** | Aceptada                                                                               |
| **Decide** | Usuario (2026-09-05, "pasa directo a la Edge Function")                               |

**Contexto.** `ANALISIS_FONDOS_BLOQUE_A.md` §11 dejaba anotado que aprobar/rechazar/comprometer
una solicitud de uso (D-37) vivían protegidas solo por RLS + los guards de trigger — a diferencia
de `novedades`, cuyas Edge Functions `aprobar-novedad`/`rechazar-novedad` existen porque esa tabla
no tiene política UPDATE para `authenticated` en absoluto (el bypass de RLS vía
`ctx.supabaseAdmin` es la única forma de escribir). `fondo_solicitudes_uso` es distinta: la RLS ya
permite el UPDATE directo a auxiliar/administrador, y `guard_fondo_solicitud_uso_transicion`
(20260929150000) ya exige rol, no-autoaprobación, no-autoejecución y disponible **vía trigger**,
sea cual sea el cliente que escriba — service_role incluido. Envolver esto en una Edge Function
no cierra ningún hueco de seguridad que no estuviera ya cerrado.

**Decisión — tres Edge Functions delgadas (`fondos-aprobar-solicitud`,
`fondos-rechazar-solicitud`, `fondos-comprometer-solicitud`), cada una con `ctx.supabase` (RLS del
propio usuario), nunca `ctx.supabaseAdmin`.** Su valor no es autorización — ya existe en BD — sino
lo que un `.update()` directo desde el store no tenía: `enforceRateLimit` (30/hora por actor y
acción, mismo umbral que `aprobar-novedad`), un contrato HTTP uniforme (`parsearErrorRpc` traduce
el `'CODIGO: mensaje'` que el guard ya produce a un status — 403 rol/autoaprobación/autoejecución,
409 transición inválida/estado terminal, 422 excede disponible/motivo requerido), y `logEvent`
estructurado. Una función por acción, no una sola parametrizada — mismo criterio que
`aprobar-novedad`/`rechazar-novedad` (dos funciones casi idénticas) en vez de una `decidir-novedad`
genérica.

**Por qué no duplicar el chequeo de rol en TS antes de escribir (a diferencia de
`aprobar-novedad`).** `aprobar-novedad` sí verifica `has_role` explícitamente en la función porque
ahí la Edge Function ES el límite de autorización (el RPC que invoca corre con `service_role`, sin
RLS). Aquí el trigger ES el límite de autorización, corra donde corra el UPDATE — repetir la
condición en TypeScript sería una segunda fuente de verdad que puede desincronizarse de la real en
BD. Cada función solo hace una lectura RLS-scoped previa (para el 404 `SOLICITUD_NO_ENCONTRADA`
cuando el id no existe o no es visible por RLS — algo que el guard no puede dar, un UPDATE sobre 0
filas no es un error) y deja que el propio guard decida y falle con su mensaje real.

**Frontend.** `stores/fondos.ts`: `aprobarSolicitud`/`rechazarSolicitud`/`comprometerSolicitud`
nuevas, invocan la Edge Function vía `cliente.functions.invoke(...)` + `extraerErrorFuncion`
(mismo patrón que `members.ts`). `cambiarEstadoSolicitud` se acotó por tipo a
`'en_revision' | 'anulada'` — las únicas transiciones de autoservicio sin segregación de
funciones, que siguen siendo UPDATE directo porque no lo necesitan.
`FondosTabSolicitudes.vue` actualizado a llamar los tres métodos nuevos.

**Hallazgo colateral, corregido aquí: 10 códigos de BLOQUE O (D-40) nunca se habían registrado en
`error-codes.ts`.** El test-guardia `tests/governance/error-codes-coverage.test.ts` no se había
corrido desde que se escribió `20260930120000_fondo_cierre_remanente.sql` — `FONDO_COMPROMISOS_
PENDIENTES`, `FONDO_DESTINO_INVALIDO`, `FONDO_ESTADO_INVALIDO`, `FONDO_REMANENTE_
DESTINO_INCONSISTENTE`, `FONDO_REMANENTE_INMUTABLE`, `FONDO_REMANENTE_MOVIMIENTO_INVALIDO`,
`FONDO_REMANENTE_SIN_DECISION`, `FONDO_REMANENTE_SIN_DESTINO`, `FONDO_SALDO_NEGATIVO` y
`FONDO_SOLICITUDES_PENDIENTES` faltaban. Encontrado al correr ese test como parte de la QA de esta
tarea, no reportado por el usuario. Corregido en el mismo commit — no es un tema aparte.

**Consecuencia.** Cierra el ítem §11.4 de `ANALISIS_FONDOS_BLOQUE_A.md`. 3 funciones nuevas
desplegadas al proyecto de desarrollo (`hwjmlyzzvpmhadldavbq`, vía `--use-api`, sin Docker — mismo
canal que D-19); 7 tests nuevos en `tests/tenancy/fondos-solicitud-decision.test.ts`; 10 códigos de
error de D-40 registrados retroactivamente.

## D-42 — Soporte documental diferenciado en `fondo_movimientos` (Modelo §36): automático (respaldo = la fila que lo originó) vs manual (respaldo = documento), nunca uniforme

|            |                                                                                       |
| ---------- | ------------------------------------------------------------------------------------- |
| **Fase**   | Módulo de Fondos, ítem pendiente §11.3 de `ANALISIS_FONDOS_BLOQUE_A.md`                |
| **Estado** | Aceptada                                                                               |
| **Decide** | Usuario (2026-09-05) — corrección explícita sobre una conclusión propia de la sesión   |

**Contexto.** §11.3 dejaba anotado que exigir `documento_id` de forma uniforme en `fondo_
movimientos` rompería el aporte automático por recaudo de BLOQUE K (`fn_aplicar_aporte_fondo` no
adjunta documento — su respaldo real es `pago_id`). Esa conclusión seguía siendo cierta, pero la
solución correcta —diferenciar el guard por tipo en vez de una validación pareja— se había
descartado por un criterio de diseño en el momento (no repetir el patrón sin pensarlo bien), no
porque faltara infraestructura. El usuario señaló la distinción exacta: la conclusión técnica
("rompería BLOQUE K") era válida, pero se había usado para descartar más de lo que en realidad
bloqueaba — solo bloqueaba la validación *uniforme*, no la *diferenciada*.

**Qué cuenta como respaldo, por tipo** (verificado por grep: solo `fn_aplicar_aporte_fondo` y
`fn_fondo_cerrar` insertan `fondo_movimientos` fuera de un INSERT directo del cliente — los otros
seis tipos no tienen ninguna ruta automática hoy):

- `aporte`: `pago_id` (automático, BLOQUE K) **o** `documento_id` (manual).
- `rendimiento`/`ajuste`/`uso`/`traslado_entrada`/`traslado_salida`: siempre `documento_id` — no
  existe ruta automática para estos cinco.
- `reversion`: exenta — su respaldo ya es `reversion_de_id` (el movimiento que corrige), exigido
  desde 20260929120000.
- `cierre_remanente`: exento — solo lo inserta `fn_fondo_cerrar`, respaldado por la fila de
  `fondo_remanentes` que `guard_fondo_remanente_referencias` ya exige (enlazada por
  `movimiento_id`), en la misma transacción atómica.

**El caso difícil: el `traslado_entrada` que `fn_fondo_cerrar` genera en el fondo DESTINO** (cuando
el destino del remanente es "traslado") no tiene ninguna fila que lo enlace — `fondo_remanentes`
solo referencia el `cierre_remanente` del fondo que se cierra, no el `traslado_entrada` del otro
fondo. Se resolvió con la misma técnica de bandera de sesión que ya usa `propagar_solicitud_
ejecutada` (`aquila.propagacion_solicitud`, 20260929150000): `fn_fondo_cerrar` activa `aquila.
fondo_cierre_movimiento` mientras hace sus dos inserts (`cierre_remanente` + `traslado_entrada`
condicional) y el guard exime el chequeo de soporte mientras esa bandera esté activa. Es seguro
porque solo `fn_fondo_cerrar` la activa, dentro de su propia transacción atómica — nunca queda
"abierta" para un INSERT sin relación.

**UI: `FondoMovimientoDrawer.vue` no tenía ningún selector de documento** (ni éste ni ningún otro
drawer de Fondos, verificado por grep) — la exigencia del guard sin un campo para satisfacerla
habría bloqueado el registro de todo movimiento manual desde la pantalla. Se agregó un campo de
archivo inline que sube el soporte ANTES de registrar el movimiento (no después, como el
comprobante de un pago RC-7): `documento_id` vive en la propia fila de `fondo_movimientos`, tiene
que existir antes del INSERT. Reutiliza `documentosStore.subirDocumento` con `inmuebleId: null`
(documento de la copropiedad, no de un inmueble) — mismo mecanismo genérico ya usado por otros
formularios, sin tocar el Edge Function `subir-documento` ni el esquema de `documentos`. Nuevo
código de catálogo `TIPO_DOCUMENTO.soporte_movimiento_fondo` (mismo patrón que `acta_presupuesto`,
20260830390000).

**Hallazgo colateral, corregido en el mismo commit:** ~26 inserts de fixture en 6 archivos de test
(la mayoría en `fondos-modelo-general.test.ts`) creaban movimientos `aporte`/`rendimiento`/`uso`/
`ajuste` sin ningún respaldo — necesario solo para dejar un saldo de partida, no para probar
soportes. Se retrofitearon con un documento de fixture compartido por `describe`/tenant (el guard
no exige que sea distinto por movimiento). Un caso se dejó deliberadamente sin tocar
(`errCruzado`/`COMPROMISO_INVALIDO` en `fondos-modelo-general.test.ts`): esa comprobación ocurre
antes que el nuevo chequeo de soporte en el guard, así que el test sigue siendo válido sin
`documento_id`.

**Consecuencia.** Cierra el ítem §11.3 de `ANALISIS_FONDOS_BLOQUE_A.md`. Migración
`20260930140000_fondo_movimiento_soporte_diferenciado.sql`; 5 tests nuevos en `tests/tenancy/
fondos-modelo-general.test.ts` (describe "soporte documental diferenciado"); `FONDO_SOPORTE_
REQUERIDO` registrado en `error-codes.ts`; verificado en vivo que el camino feliz del recaudo real
(BLOQUE K, vía `fn_aplicar_aporte_fondo`) sigue sin exigir documento
(`tests/liquidacion/fondo-imprevistos-cuota.test.ts` sigue en verde sin cambios).

**Corrección 2026-09-05 — dejar que se pueda adjuntar un soporte sin poder revisarlo después no
cierra el gap, solo lo mueve.** El usuario señaló, tras probar la pantalla en vivo, que la tabla
de Movimientos no ofrecía ninguna forma de ver el detalle de un movimiento ya registrado ni de
abrir su soporte adjunto — la columna de operaciones existía en el diseño de `UiTabla` pero
`FondosTabMovimientos.vue` nunca la usaba. Se agregó una acción "Ver detalle" por fila
(`UModal` de solo lectura: tipo, monto, fecha, descripción, motivo, y un botón de soporte si
`documento_id` está presente).

**Bug real encontrado al verificar esto en vivo, no solo la feature faltante.** El primer intento
resolvía el documento contra `documentosStore.documentos` (poblado desde `v_documento_vigente`,
que solo expone la última versión de cada `grupo_id`). Un movimiento real de prueba señalaba a
una versión de documento que después quedó superada por una subida posterior sin relación (mismo
`nombre_archivo`, subido de nuevo) — su soporte se volvió invisible en el detalle aunque el
`documento_id` seguía siendo válido y el archivo seguía existiendo. `fondo_movimientos.documento_id`
es una FK a una versión exacta e inmutable (append-only, como el resto del ledger) — necesita
resolverse contra `documentos` directamente, no contra "la vigente de su grupo hoy". Se agregó
`documentosStore.documentoPorId(id)` (lee la tabla base por id, sin el filtro de versión;
`documentos_select_agent_auditor` no restringe por versión, así que RLS ya lo permite) y
`FondosTabMovimientos.vue` lo usa en vez del array bulk-cargado. Verificado en vivo de punta a
punta: `urlDescarga` generó una signed URL real y un `fetch()` contra ella devolvió el PDF exacto
(200, `content-type: application/pdf`, tamaño coincidente con el registro de `documentos`).

## D-43 — `fondo_autorizaciones`/`fondo_fuentes` ganan el candado de estado que ya tenían `fondo_movimientos`/`fondo_compromisos`/`fondo_solicitudes_uso`

**Contexto.** Al revisar en vivo qué acciones ofrecía el detalle de un fondo `cerrado`
(FON-OBRA-01), "Registrar autorización" y "Registrar fuente"/"Activar"/"Desactivar" seguían
disponibles y el guard las aceptaba sin más. `guard_fondo_autorizacion()` y `guard_fondo_fuente()`
(ambas de 20260929130000) nunca miraron `fondos.estado`, a diferencia de
`guard_fondo_movimiento`/`guard_fondo_compromiso`/`guard_fondo_solicitud_uso_transicion`, que sí
lo hacen — un vencimiento genuino del módulo, no una regla nueva inventada: el resto de Fondos ya
establecía que un fondo terminal deja de admitir escritura nueva, y estos dos guards se habían
quedado atrás.

**Qué se bloquea y por qué.** `en_cierre`/`cerrado`/`cancelado` son terminales
(`TRANSICIONES_ESTADO_FONDO` en el frontend confirma que `cerrado`/`cancelado` no tienen
transiciones de salida): no hay una autorización nueva que decidir ni una fuente nueva que
alimentar sobre un fondo que ya no opera. `en_cierre` se suma por el mismo motivo que ya vale
para `fondo_movimientos` — es el estado que existe para dejar de admitir operaciones nuevas
mientras se liquida (Modelo §36). El guard de fuentes cubre INSERT y UPDATE (el toggle
activa/inactiva), no solo la creación.

**Qué no se toca.** `propuesto`/`pendiente_autorizacion` siguen admitiendo autorizaciones y
fuentes sin restricción — es exactamente el momento en que se registra el acta de constitución
(Modelo §7) y se configuran las reglas de alimentación antes de activar el fondo. Bloquear ahí
rompería el flujo real de alta de un fondo.

**Consecuencia.** Migración `20260930150000_fondo_autorizacion_fuente_estado.sql`
(`create or replace` de ambas funciones, reproduciendo el cuerpo previo completo); nuevos códigos
`FONDO_ESTADO_NO_ADMITE_AUTORIZACIONES`/`FONDO_ESTADO_NO_ADMITE_FUENTES` en `error-codes.ts`; 8
tests nuevos en `tests/tenancy/fondos-modelo-general.test.ts` (describe "estado terminal bloquea
autorizaciones y fuentes nuevas"), cubriendo los 3 estados terminales × 2 tablas, el toggle de una
fuente ya existente, y el caso negativo (`propuesto`/`pendiente_autorizacion` sin restricción).
En el frontend, `FondoDetalleDrawer.vue` oculta los 3 botones afectados y muestra el motivo en su
lugar (mismo patrón que `motivoNoPuedeDecidir` en `FondosTabSolicitudes.vue`) — no los oculta sin
explicación. De paso, se agregó un prop `ancho="ancho"` opt-in a `UiDrawer.vue` (760px vs. los
460px por defecto que comparten sus otros 20+ usos) para que la tabla de Fuentes ya no necesite
scroll horizontal en este drawer específico.

## D-44 — Fase 1 de Gobierno (GAP-23): "Resumen general" en el dashboard principal, consolidando lo que Cartera/Presupuesto/Fondos/Auditoría ya calculan, sin esquema nuevo

**Contexto.** `INFORME_INVENTARIO_REPORTES_MODULOS_EXISTENTES.md` (Casos de uso/Gobierno,
2026-09-05) encontró que `pages/dashboard/index.vue` no mostraba ningún KPI de negocio — el propio
comentario del archivo (desde F9) ya decía "las métricas de dominio llegan cuando exista esa
capa". Esa capa existe hoy en Cartera (`cartera-dashboard`), Presupuesto
(`presupuesto_cuenta_ejecucion`), Fondos (`fn_fondo_saldos`) y Auditoría (hallazgos/acciones) —
cada módulo ya calcula sus propios números en su propia pantalla, nadie los consolidaba. Es la
Fase 1 del roadmap de 5 fases propuesto para el módulo de Gobierno (las Fases 0/2-5 —
prerrequisitos, decisiones/compromisos, reuniones/quórum/votación, atención al propietario —
quedan fuera de este corte, ver GAP-23 en `PLAN_MAESTRO_IMPLEMENTACION.md`).

**Por qué NO se reutilizó `auditoriaStore.estadisticas` tal cual.** Ese `computed` (ya existente,
`stores/auditoria.ts`) exige tener cargados en memoria TODOS los `riesgos`/`controles`/
`engagements`/`hallazgos`/`acciones` del tenant — carga completa que hoy solo paga la pantalla de
Auditoría porque el usuario fue a mirarla. Cargar eso desde el dashboard principal solo para
mostrar 2 cifras habría sido el tipo de "carga completa innecesaria" que el propio criterio de
rendimiento del proyecto ya evita en el resto del código (ver `onboarding.ts`, que resuelve su
checklist con conteos `count: 'exact', head: true` en vez de traer filas). Se agregó
`auditoriaStore.cargarResumenLigero(tenantId)`, mismo patrón de `onboarding.ts`: dos queries de
solo conteo (hallazgos no cerrados/rechazados, acciones vencidas no cerradas/rechazadas), cero
filas traídas.

**Resiliencia.** Las 4 fuentes nuevas (cartera/presupuesto/fondos/auditoría) se resuelven con
`Promise.allSettled`, no `Promise.all` — si una falla, su tarjeta muestra `—` y las demás se
muestran igual. El dashboard principal es lo primero que ve cualquier usuario al entrar; no puede
depender de que las 4 fuentes respondan a la vez.

**Qué NO se tocó.** Ningún módulo de origen (Cartera/Presupuesto/Fondos/Auditoría) cambió — solo
se leen sus funciones ya existentes. Los 3 `useAsyncData` previos del dashboard (perfil/
memberships/miembros-activos/auditoria-reciente/onboarding-checklist) se dejaron intactos; el
resumen nuevo vive en su propio `useAsyncData('dashboard-resumen-gerencial', ...)` separado.

**Consecuencia.** `pages/dashboard/index.vue` gana una sección "Resumen general" colapsable
(mismo patrón cookie-persistido de `inmuebles/index.vue`/`cartera/index.vue`/`fondos/index.vue`)
con 6 tarjetas: Cartera vencida, Ejecución presupuestal (solo cuentas de naturaleza `egreso`,
mismo criterio que `PresupuestoTabEjecucion.vue`), Saldo de fondos, Hallazgos de auditoría
abiertos, Miembros activos, Eventos recientes. `stores/auditoria.ts` gana
`cargarResumenLigero`/`ResumenLigeroAuditoria`. Sin migraciones, sin tablas nuevas, sin tests de
backend nuevos (lectura de solo conteo ya cubierta por RLS existente).

## D-45 — CO-2: `contable_comprobante.estado` con 3 valores, no los 6 del prompt maestro original

**Contexto.** `CO_02_nucleo_libro_contable.md` (Casos de uso/Tres Modulos/Contabilidad) es el
segundo corte de la hoja de ruta de los 29 cortes de Contabilidad/Gobierno/Mantenimiento — crea
el comprobante contable con partida doble persistida, consecutivo sin huecos y reversión, sin
contabilizar todavía ninguna operación real (eso es CO-3). El prompt maestro original de este
corte proponía seis estados: `borrador`, `pendiente_aprobacion`, `aprobado`, `contabilizado`,
`anulado`, `reversado`.

**Por qué solo tres (`borrador`, `contabilizado`, `anulado`).**
1. `reversado` no es un estado sino una relación: ya está modelado por
   `reversado_por_id`/`reversa_comprobante_id`, y un comprobante contabilizado que fue reversado
   sigue siendo, en sí mismo, un comprobante `contabilizado` — la reversión es un comprobante
   nuevo enlazado, no un cambio de estado del original.
2. `aprobado`/`pendiente_aprobacion` exigirían segregación de funciones (quién captura vs. quién
   aprueba) que el modelo de permisos del repo no soporta hoy (`MARCO_MAESTRO.md` §5.5: `auxiliar`
   y `administrador` comparten la misma capacidad de escritura sobre datos de tenant; no hay
   noción de "aprobador" distinto de "quien captura"). Modelar el estado sin el permiso real
   detrás sería decorativo — un botón "aprobar" que cualquier auxiliar puede pulsar no es
   segregación de funciones, es teatro.
3. Menos estados es menos superficie de transición inválida que probar y mantener.

**Consecuencia.** `contable_comprobante_estado_t` queda como `('borrador', 'contabilizado',
'anulado')`. Las columnas `aprobado_por`/`aprobado_at` se dejan en el esquema de
`contable_comprobante` (20260930200000), sin usar y sin ningún guard que las lea o escriba en
este corte — quedan reservadas para cuando un corte posterior implemente el flujo de aprobación
con su propio permiso (`Permission` en `apps/web/app/types/permissions.ts` + T-MATRIX), en vez de
inventar aquí un permiso o una segregación de funciones no autorizada por el marco (`MARCO_MAESTRO.md`
§5.5: "no inventes permisos con notación de punto... preséntalo como propuesta y espera
confirmación").

**Si el contador exige flujo de aprobación real** más adelante, se añade como ampliación de este
enum (D-24 permite ampliar un enum ya justificado sin disparar el gate de gobernanza, ver
`fundamento_tipo_t`/`orientacion_tecnica` en PC-7) o como un enum nuevo si la semántica de
transición resulta suficientemente distinta — decisión para ese corte, no para este.

## D-46 — CO-3: materialización por lote (camino B) para cartera, por hecho (camino A) para
presupuesto/fondos; y dos hallazgos que cerraron partes del alcance original del corte

**Contexto.** `CO_03_materializacion_asientos.md` exige elegir y justificar, entre **camino A**
(un comprobante por hecho — máxima trazabilidad, un comprobante por cargo/pago/movimiento) y
**camino B** (un comprobante por `(periodo, entidad)` — menos comprobantes, más parecido a la
práctica contable real de una PH), documentando la elección en este archivo.

**Elección: camino B para `cartera` (`cargos`, `pago_aplicaciones`, `pagos`), camino A para
`presupuesto_ejecucion` y `fondo_movimientos`.**
1. `cartera` genera un hecho por cuota/recaudo/anticipo — en una copropiedad de varios cientos de
   unidades, el camino A produciría cientos de comprobantes solo por la causación mensual de
   cuotas ordinarias, haciendo el libro diario ilegible. El camino B agrupa esos hechos en un
   comprobante por `(periodo, entidad)` (uno para causación de cartera, uno para recaudo
   aplicado, uno para anticipos), preservando la trazabilidad al hecho individual en
   `contable_comprobante_detalle.origen_entidad`/`origen_id` (columnas añadidas en CO-2 para
   esto exactamente).
2. `presupuesto_ejecucion` y `fondo_movimientos` tienen, cada uno, su propio soporte documental
   (factura, comprobante de egreso) — un contador espera un comprobante por documento, no un
   agregado mensual que oculte a qué factura corresponde cada línea. Camino A aquí.
3. Idempotencia de un comprobante de lote: como `contable_comprobante`'s índice único es
   `(tenant_id, origen_modulo, origen_entidad, origen_id, origen_evento)` y Postgres trata NULLs
   múltiples como no-conflictivos, el `origen_id` de un comprobante de lote no puede ser NULL — se
   usa `periodo_id` (compartido por todos los lotes de ese periodo, diferenciado por
   `origen_entidad`).

**Hallazgo 1 — el ámbito `movimiento_sin_contrapartida` (y el caso que el corte pedía probar en su
prueba #5) ya estaba cerrado antes de que CO-3 empezara.** El corte, siguiendo el prompt maestro,
pedía que un `presupuesto_ejecucion` con `liquidacion IS NULL` (dato anterior a PC-4) se saltara
como `sin_contrapartida` en vez de bloquear todo el periodo. Verificado contra la base real: la
migración `20260830490000_purga_ejecucion_sin_contrapartida.sql` (anterior a este corte, no tocada
aquí) ya había purgado esas filas y puesto la columna `NOT NULL`, y el guard de la tabla exige
`cuenta_bancaria_id` siempre que `liquidacion = 'pagado_banco'` — entre las dos cosas, hoy es
imposible insertar una fila que llegue a `fn_contabilizar_periodo()` sin una contrapartida
resoluble. La lógica de `fn_contabilizar_periodo()` para ese caso (reportar `'sin_contrapartida'`
en vez de reventar) se dejó igual — es general (comprueba `cuenta_debito`/`cuenta_credito` NULL
de `contable_hechos()`, no la causa específica) y no hace daño como red de seguridad, pero el
ámbito de `contable_parametrizacion_pendiente()` es hoy código inerte y la prueba #5 original ya
no es construible. Confirmado con el usuario: se documenta el cierre en vez de forzar un fixture
artificial (deshabilitar el trigger del guard solo para el test), y la prueba #5 de
`tests/contabilidad/materializacion.test.ts` verifica en su lugar que el caso es hoy
irrepresentable (0 filas con `liquidacion` NULL, un intento de insertar sin ella falla).

**Hallazgo 2 — "usar el fondo" no debita una cuenta de gasto; es reclasificación de efectivo,
igual que un aporte pero al revés.** La prueba #8 del corte esperaba que un `fondo_movimientos`
de tipo `'uso'` generara débito en una cuenta de gasto y crédito en `111015`. Verificado
empíricamente contra `contable_hechos()` (bloque D, sin tocar en este corte — es lógica de PC-5/
GAP-22, anterior a CO-3): un `'uso'` debita `111005` (banco) y acredita `111015` (fondo) — el
mismo par de cuentas que un `'aporte'`, con los lados invertidos. El gasto real de esa plata
ocurre después, en un hecho aparte (`presupuesto_ejecucion`) cuando el banco ya paga al proveedor
— `fondo_movimientos` no tiene ningún campo que vincule un `'uso'` a una cuenta de gasto
específica, así que no hay forma de que el hecho por sí solo produzca esa línea sin inventar una
resolución que el modelo de datos no sostiene. Confirmado con el usuario: la prueba #8 de
`tests/contabilidad/materializacion.test.ts` verifica el comportamiento real (reclasificación
`111005`↔`111015`, `fondo_id` poblado en ambas líneas) en vez del texto original del corte.

## D-47 — MANT-0: bienes comunes esenciales nunca se capitalizan (Ley 675 art. 20, CTCP
243/2025); reclasificación vs. causación para el nacimiento contable de un activo

**Contexto.** `MANT_00_activos_ficha_contable.md` deja "reconocimiento inicial de bienes
recibidos de la constructora" y "vidas útiles y umbral de capitalización" como gate del contador
(`APENDICE_MANT.md` §"Qué NO se resuelve por defecto"). Siguiendo instrucción explícita del
usuario ("hagamos una investigación y decidamos" en vez de esperar la reunión con el contador),
se investigó la doctrina colombiana real en vez de tratarlo como hueco puramente numérico.

**Hallazgo — la distinción esencial/no esencial no es un parámetro que el contador ajuste; es un
límite legal que ningún valor de umbral o vida útil puede saltarse.** Ley 675 de 2001 art. 20 +
CTCP Concepto 243 de 2025 + DOT 15 (Documento de Orientación Técnica): un bien común **esencial**
(indivisible e indispensable para la existencia del edificio — ascensores, estructura, tanques;
la inmensa mayoría de lo recibido de la constructora) **nunca** puede reconocerse como activo en
los estados financieros de la copropiedad, sin importar qué vida útil o umbral fije el contador.
Solo un bien común **no esencial**, y solo después de una **desafectación formal** (escritura
pública + voto del 70% de los coeficientes en asamblea — acto jurídico que este corte no modela),
entra al balance, a valor razonable, con contrapartida en patrimonio (no en ingreso).

**Decisión 1 (aprobada por el usuario vía AskUserQuestion): incorporar esta distinción al Plan de
MANT-0 antes de implementar.** Se agregó el enum `activo_naturaleza_bien_t`
(`bien_comun_esencial | bien_comun_no_esencial_desafectado | bien_propio`,
`20260930280000_mant0_activos_catalogo.sql`) con un guard duro dentro de `guard_activo_ficha`
que bloquea `capitalizado = true` para `bien_comun_esencial` (`ACTIVO_BIEN_ESENCIAL_NO_CAPITALIZABLE`)
**a nivel de trigger**, no solo dentro de la RPC de capitalización — así ningún camino de
escritura (RPC, admin, cliente directo) puede saltarse la regla. Los tres fundamentos citados se
registraron en `fundamento_normativo` (`20260930340000_mant0_fundamento_normativo.sql`) con
`fecha_validacion = NULL`: WebFetch falló contra `ctcp.gov.co` ("unable to verify the first
certificate") y `secretariasenado.gov.co` (`ECONNREFUSED`) — mismo problema de entorno que ya
documentó CO-1 (`20260930170000`), no de las fuentes. El contenido citado viene de WebSearch
(agregadores como accounter.co, ambitojuridico.com), no de haber leído el documento primario
completo — validación de primer grado pendiente, explícita como pregunta abierta para el
contador matriculado (Ley 43 de 1990), no dada por hecha.

**Decisión 2 (aprobada por el usuario vía AskUserQuestion): el nacimiento contable de un activo
capitalizado es reclasificación del gasto ya pagado, no un asiento nuevo desde cero.**
`MANT_00_activos_ficha_contable.md` no explicaba cómo se contabiliza el momento en que un activo
pasa a estar capitalizado — solo la depreciación periódica ya en curso. `fn_mant_capitalizar_activo`
(`20260930290000_mant0_depreciacion_ppe.sql`) resuelve dos caminos:
1. **Comprado** (el común): si existen filas de `presupuesto_ejecucion.activo_id` vinculadas cuya
   suma iguala `valor_adquisicion`, genera un comprobante `RECLASIFICACION` — débito a la cuenta
   clase 15 del activo, crédito a la(s) cuenta(s) de gasto original(es), preservando
   `centro_costo_id`/`tercero_id`/`agrupacion_id` de cada fila fuente (fix
   `20260930300000_mant0_fix_reclasificacion_dimensiones.sql`, ver más abajo).
2. **Desafectado** (raro, sin pago vinculado): genera un comprobante `CAUSACION` contra el evento
   `RECONOCIMIENTO_BIEN_DESAFECTADO`, contrapartida en patrimonio.

**Hallazgo 2 — "no inventes cuentas" no significa "deja el evento sin mapear".** La migración
`20260930290000` sembró `RECONOCIMIENTO_BIEN_DESAFECTADO` deliberadamente sin default, razonando
que es un caso raro que cada tenant debería mapear solo si le aplica. `tests/contabilidad/
alta-parametrizacion-contable.test.ts` (PC-3c) y `tests/contabilidad/materializacion.test.ts`
(CO-3) — ninguno de los dos tocado por este corte — fallaron porque ambos verifican una
invariante ya cerrada: **todo evento contable global activo tiene un default sembrado al alta**,
comparado 1:1 contra el catálogo precisamente para que un evento nuevo sin mapear se note aquí.
Corregido en `20260930350000_mant0_fix_reconocimiento_bien_desafectado_default.sql`: se mapea a
`3105` (Patrimonio inicial) — la única cuenta de patrimonio genérica del PUC vigente, ya
existente, no inventada — con backfill para tenants ya creados. El tenant conserva la opción de
remapear a otra subcuenta si su contador lo prefiere; lo que no puede hacer es no tener ningún
default al nacer.

**Cinco bugs adicionales encontrados por smoke-test manual (no por `db lint`, que se mantuvo en 7
warnings preexistentes durante todo el corte):** dimensiones faltantes en la reclasificación
(`20260930300000`), `guard_activo_transicion` no permitía retiro desde `planificado`
(`20260930310000`), fecha del comprobante de baja fuera del periodo fiscal y líneas de detalle en
cero violando el check "un solo lado" (`20260930320000`), y centro de costo faltante en la línea
de pérdida de retiro (`20260930330000`) — mismo patrón que CO-2/CO-3: bugs de lógica de negocio
que solo aparecen con datos reales, nunca con lint sintáctico.

## D-48 — CO-4: los libros leen lo persistido (nunca la proyección); netear correctoras por
naturaleza de la fila de clase, no por convención fija; export cliente + auditoría por RPC

**Contexto.** CO-4 pide cuatro funciones de solo lectura (Diario, Mayor, Balance de prueba,
Inventarios y Balances) más `contable_conciliacion_cartera`. Ninguna existía (`grep` sin
resultados, gap real confirmado en el Plan del corte).

**Decisión 1 — fuente de verdad: `contable_comprobante`/`contable_comprobante_detalle`, nunca
`contable_movimientos()`.** `contable_movimientos()` (PC-5/CO-3) es la proyección de solo lectura
previa a materializar — útil para simular, no para un libro legal. Los cuatro libros de CO-4 leen
exclusivamente lo ya contabilizado, filtrando `numero is not null` (no `estado = 'contabilizado'`):
un comprobante `anulado` **conserva** su número (CO-2, guard de inmutabilidad), así que incluirlo
es lo que garantiza "sin saltos en el consecutivo" — ocultarlo crearía un hueco aparente que el
principio invariable #5 (un asiento no se edita, se corrige con reversión) exige que sea visible.

**Decisión 2 — el consecutivo es por `(tenant, año, tipo_id)`, no global por tenant.**
`contable_consecutivo` (CO-2) ya lo modela así; la prueba de "sin saltos" del corte se implementó
agrupando por tipo de comprobante, no como una sola secuencia global — un comprobante `AJUSTE` y
uno `EGRESO` tienen numeraciones independientes, ambas sin huecos, no una numeración compartida.

**Hallazgo — netear una cuenta correctora exige leer la naturaleza de la fila de CLASE, no asumir
que toda una clase comparte una sola naturaleza.** `1399`/`1592`/`1698` son naturaleza crédito
dentro de clase 1 (activo, fundamentalmente débito). El primer diseño de
`contable_libro_inventarios_balances` sumaba `saldo_final` crudo de todas las cuentas de clase 1
para el total de "activo" del CUADRE — con eso, una correctora con movimiento real SUMABA en vez
de RESTAR, rompiendo `activo = pasivo + patrimonio + resultado` en cuanto hubiera cualquier
deterioro o depreciación acumulada. Corregido (`20260930390000`, antes de la primera corrida de
pruebas, no en producción) leyendo la naturaleza de la fila de `contable_cuenta` cuyo código ES la
clase misma (`codigo = '1'/'2'/'3'`, que ya existe como fila propia del plan — mismo principio "la
naturaleza se lee de la cuenta, jamás se infiere" aplicado a nivel de clase) y neteando cualquier
fila cuya naturaleza difiera de la de su clase. El saldo mostrado por cuenta no cambia — sigue en
su propio lado natural, igual que el Mayor — solo cambia cómo se agrega para el total de control.

**Hallazgo 2 — `contable_conciliacion_cartera` filtraba de más.** El primer diseño devolvía
cualquier inmueble con saldo distinto de cero en cualquiera de los dos lados, no solo
discrepancias — un cargo de interés legítimamente sin pagar (saldo contable = saldo auxiliar,
diferencia = 0) aparecía igual, porque casi cualquier cartera con movimiento real tiene *algún*
lado distinto de cero. Corregido (`20260930380000`) a filtrar únicamente `diferencia <> 0` —
"cero filas = cuadrado" (§7 del corte) significa exactamente eso, no "cero filas = cero
actividad".

**Decisión 3 — exportación 100% cliente (xlsx/pdfmake por import dinámico, mismo patrón que
PC-5), con una única función `security definer` para la auditoría.** Como no hay round-trip al
servidor al exportar, se agregó `fn_registrar_exportacion_libro` — el cliente la invoca justo
antes de generar el archivo. Verificado en navegador contra un tenant real (JARDINES DE
BABILONIA): el clic en "Exportar a PDF" deja una fila real en `audit_log` (`action =
'contabilidad.libro.exportar'`), confirmando el flujo de punta a punta — esas dos filas quedan en
el audit log real porque `audit_log` es append-only (SEC-14, no se pueden borrar ni deberían: son
un registro legítimo de una acción real).

**Hallazgo 3 — un color hex hardcodeado en el estilo del PDF violaba D-26 (gobernanza de diseño),
detectado por `tests/governance/design-system-coverage.test.ts` antes del cierre.** `pdfmake`
exige un color literal (no puede leer variables CSS), pero el archivo no puede tener un `#hex`
propio. Resuelto creando un elemento oculto con la clase semántica ya usada en el resto del
repo (`text-error-600`, ver `comprobantes.vue`/`movimientos.vue`) y leyendo su color ya computado
por el tema activo en tiempo de ejecución, convertido a hex solo en memoria — cero hex estático en
el archivo fuente, y el color del PDF queda automáticamente consistente con el tema claro/oscuro
de la app en vez de una constante congelada.

**Nota — el "worker CSP" del navegador no es de esta serie.** Durante la verificación en
navegador apareció `Creating a worker from 'blob:...' violates... script-src` en la consola al
exportar el PDF. Verificado contra el bundle de `pdfmake` (`grep "new Worker"` en
`pdfmake/build/pdfmake.js`): no existe ninguna creación de Worker en todo el paquete — su mecanismo
de descarga es `file-saver` vía `URL.createObjectURL` + clic en un `<a download>`, no un Worker.
La exportación no lanzó ninguna excepción (sin banner de error en la página) y sí dejó su fila de
auditoría — el mensaje de consola es ruido de otro proceso de la app (Nuxt DevTools/HMR), no un
defecto de esta serie.

## D-49 — CO-7: motor de política de deterioro (3 métodos, solo `antiguedad` implementado
completo), resolución de cuenta por `categoria` del cargo, reversión por signo del ajuste

**Contexto.** CO-7 pide un motor de deterioro de cartera versionado, sin porcentajes
incrustados en código (`grep` confirmó que `contable_calcular_deterioro`/
`contable_politica_deterioro` no existían — gap real). El corte nombra tres métodos
(`antiguedad | porcentaje_global | individual`) pero solo detalla estructura y pruebas para
`antiguedad`.

**Decisión 1 — alcance de los 3 métodos, acordada con el usuario en el Plan del corte.**
`antiguedad` se implementa completo (tramos + guards de cobertura + cálculo). `porcentaje_global`
se resuelve con un único campo `porcentaje_global` en la política, sin tabla nueva — aplicado
plano sobre el saldo elegible. `individual` queda como valor válido del enum (para no inventar
un enum distinto de los tres que el corte nombra explícitamente) pero
`contable_calcular_deterioro` falla con `DETERIORO_METODO_NO_IMPLEMENTADO` si se activa una
política con ese método — no hay tabla de excepciones por inmueble especificada en el corte, e
inventarla habría violado "no inventes tablas" del marco.

**Decisión 2 — "cuenta de cartera" se resuelve por `cargos.categoria` vía
`contable_cuenta_default`, reutilizando exactamente la resolución de `contable_hechos()` (CO-3,
`20260930230000`): `CARTERA_CUOTA_ORDINARIA` (capital), `CARTERA_INTERES_MORA` (interés),
`CARTERA_OTROS` (otro).** No se construyó una resolución nueva vía `concepto_id →
presupuesto_cuenta_id` (que sí usa CO-3 para el lado del INGRESO, no para la cuenta de cartera en
sí) — la que ya existe es tenant-configurable y evita repetir lógica.

**Decisión 3 — el reconocimiento registra solo el ajuste, con el asiento invertido cuando el
ajuste es negativo (recuperación de cartera).** `fn_contable_reconocer_deterioro` compara el
deterioro recién calculado contra la suma de `contable_deterioro_detalle.ajuste` de
reconocimientos previos (vía `contable_comprobante.fecha <= p_fecha_corte`); si el neto da
positivo, débito `GASTO_DETERIORO_CARTERA`/crédito `DETERIORO_CARTERA`; si da negativo, se
invierte. Detalle por inmueble persistido en `contable_deterioro_detalle` (comprobante_id +
inmueble_id + cuenta_cartera_id), aunque la línea agregada en `contable_comprobante_detalle` no
lleva `inmueble_id` (correctora agregada, per §4.3) — verificado que la suma del detalle iguala
exactamente la línea agregada (prueba 10).

**Bug 1 — `v_tipo_id` declarado `uuid` cuando `lista_tipos.id`/`contable_comprobante.tipo_id` son
`bigint`.** Encontrado por `supabase db lint --linked` **antes** de correr ninguna prueba (no en
runtime) — mismo nivel de rigor que los bugs de CO-4 encontrados por revisión manual. Corregido
con `create or replace function` (`20260930420000`), la migración original
(`20260930410000`) se deja intacta.

**Bug 2 — `contable_calcular_deterioro` nunca encontraba una política cuyo `vigente_desde`
quedó en `null`.** `vigente_desde <= p_fecha_corte` con `vigente_desde = null` evalúa a `NULL`, no
a `true`, así que el `WHERE` la descartaba en silencio — una política activada sin fecha
explícita (campo deliberadamente opcional en el diseño) quedaba permanentemente invisible para el
cálculo, aunque apareciera "Vigente" en la UI. **Encontrado en verificación manual en el
navegador** (las 11 pruebas siempre pasan `vigente_desde` explícito, un gap real de cobertura de
pruebas) contra el tenant real JARDINES DE BABILONIA — la primera política creada desde la UI, sin
llenar "Vigente desde", fallaba con `DETERIORO_SIN_POLITICA` pese a mostrarse "Vigente". Corregido
(`20260930430000`) con `coalesce(vigente_desde, '0001-01-01'::date)` — sin fecha explícita, la
política rige desde siempre, mismo criterio que usa `contable_libro_inventarios_balances` (CO-4)
para "desde el origen".

**Bug 3 (solo UI) — el aviso de éxito de "reconocer" nunca llegaba a mostrarse.** `simular()` se
llamaba automáticamente después de `reconocer()` para refrescar la simulación con el nuevo estado,
pero `simular()` reseteaba la misma variable donde `reconocer()` acababa de guardar el id del
comprobante — el aviso de éxito se borraba a sí mismo antes de que Vue pintara el cambio.
Encontrado clicando "Reconocer" en el navegador. Corregido separando el reset (solo en la
simulación disparada por el usuario, `simularManual()`) de la simulación de refresco interna que
dispara `reconocer()` (que ya no toca ese estado). De paso se agregó un mensaje distinto para
"ajuste neto en cero" (nada que reconocer) — antes ese caso no mostraba ningún aviso, ni de éxito
ni de error, dejando al usuario sin saber si el clic había hecho algo.

**Hallazgo — `acuerdos_pago` (CAR F5) no admite insertar directo en `estado = 'vigente'`**
(`guard_acuerdo_transicion`, `ACUERDO_ESTADO_INICIAL_INVALIDO`) — la transición real es
`borrador → pendiente_aprobacion → vigente`. No es un guard de esta serie ni se tocó; la prueba 9
(acuerdo de pago vigente) se ajustó para seguir el camino de dos `UPDATE` en vez de insertar el
estado final directamente.

**Verificado en navegador (datos reales, tenant JARDINES DE BABILONIA):** creación de política v1
(método antiguedad, tramos 0-30/31-60/61+), activación, y simulación real contra 6
inmuebles/cuentas de cartera vigente — sin deterioro porque ninguno está vencido todavía (dato de
producción, no sintético). La política v1 queda activa en este tenant tras la verificación
(inmutable una vez vigente — no se revierte, igual que las filas de `audit_log` que dejó CO-4).

## D-50 — CO-5: motor de presentación 100% en tabla (fórmula DSL), EFE como otra plantilla más,
notas por rama `if/elsif` sobre 14 códigos conocidos

**Contexto.** El corte exige que la estructura de ESF/ER/ECP/EFE viva en tablas, no incrustada en
SQL, y que las 14 notas se generen con cifras reales. No existía ningún motor de presentación
previo (`grep` confirmó cero coincidencias de `contable_estado_plantilla`/`contable_estado_linea`)
— gap real, sin precedente que reutilizar.

**Decisión 1 — fórmula DSL mínima en vez de un motor de expresiones genérico.**
`contable_estado_linea.formula` es una cadena de suma/resta de otros `codigo` de la MISMA
plantilla (o un entero literal), parseada con `regexp_matches(formula, '([+-]?)([A-Za-z0-9_]+)',
'g')` en un bucle — cada token ya debe haberse calculado antes en `orden`, o se levanta
`FORMULA_ESTADO_INVALIDA`. Se descartó un lenguaje de expresiones completo (paréntesis,
multiplicación, referencias cruzadas entre plantillas) porque ninguna de las 4 plantillas
sembradas lo necesita —「no inventes de más」del marco.

**Decisión 2 — EFE es una `contable_estado_plantilla` más (`modo_valor='variacion'`), no un motor
aparte.** Sus líneas de actividad (operación/inversión/financiación) usan el mismo mecanismo
`selector_cuentas` que ESF/ER. La cuenta `11` (efectivo, incluye 111005 banco y 111015 fondo de
imprevistos) **nunca** aparece en ninguna línea de actividad — solo en las dos líneas de
conciliación de apertura/cierre (`momento='inicio'` y una fórmula de cierre que suma la variación
neta al saldo inicial, sin releer la cuenta 11 en la fecha de corte). Esto garantiza por
construcción que el traslado 111005↔111015 (aporte al fondo de imprevistos) nunca se vea como
flujo de efectivo (CTCP 0146/2025) — no por un caso especial en tiempo de ejecución, sino porque
el catálogo de líneas simplemente no lo selecciona.

**Decisión 3 — 14 notas por una rama `if/elsif` en `fn_generar_notas`, no un motor de plantillas
abierto.** Hay exactamente 14 notas conocidas (el corte las nombra una por una, §4.3) — no un
catálogo extensible. Cada rama sustituye sus propios `{{token}}` con una consulta real. El
`codigo = 'resultado_ejercicio'` es un valor reservado, inyectado directo desde
`contable_resultado_ejercicio()` (misma fórmula que la CTE de CO-4, extraída a función propia para
que ESF/ER/ECP/EFE nunca puedan divergir en el mismo número — prueba 2 del corte).

**Bug 1 — `contable_estado_financiero` marcada `stable` no puede hacer `DROP TABLE`/`CREATE
TEMPORARY TABLE`** (`DROP TABLE is not allowed in a non volatile function`). Encontrado por
`supabase db lint --linked` **antes** de correr ninguna prueba. Corregido marcándola `volatile`
(`20260930490000`) — sigue sin escribir ningún dato de negocio real, solo una tabla temporal de
sesión.

**Bug 2 — `contable_parametrizacion_pendiente` (PC-5b, corte previo) nunca aprendió la resolución
especial de `FONDO_IMPREVISTOS`** (BLOQUE K, `20260929180000`): un cargo de ese concepto siempre
tiene `presupuesto_cuenta_id` NULL a propósito (resuelve contra el evento predeterminado
`INGRESO_FONDO_IMPREVISTOS`, igual que `contable_movimientos()` ya sabe hacer), pero el ámbito
`cargo_sin_cuenta_ingreso` lo reportaba como pendiente igual que un concepto mal configurado —
bloqueando `fn_contabilizar_periodo` con `CONTABLE_PARAMETRIZACION_PENDIENTE` para cualquier
tenant que use el circuito de cobro del fondo. Encontrado al construir el fixture de
`tests/contabilidad/estados-financieros.test.ts` (ningún test previo había materializado nunca un
cargo de ese concepto). Corregido (`20260930500000`) con la misma excepción que ya existía para
`categoria='interes'`.

**Bug 3 — `if not v_marco.clasificado` no distingue `false` de `NULL`.** Para un `p_tenant_id` que
el llamante no puede ver por RLS, `tenant_marco_contable()` no encuentra la fila de `tenants` y
`v_marco` queda con todos los campos NULL — `not NULL` es `NULL`, no `true`, así que el `raise` de
`MARCO_CONTABLE_SIN_CLASIFICAR` nunca disparaba y el código seguía hasta un segundo guard, también
NULL-seguro por accidente, terminando en `ESTADO_NO_REQUERIDO_PARA_GRUPO: ... para <NULL>` — sin
fuga de datos real (la prueba 13 de aislamiento lo confirma: nunca se devuelve ninguna fila), pero
con un código de error confuso para un caso que es, en esencia, el mismo "no clasificado".
Encontrado escribiendo la prueba 13. Corregido (`20260930510000`) con `is not true`, que trata
`false` y `NULL` de forma idéntica.

**Verificado en navegador (datos reales, tenant JARDINES DE BABILONIA, clasificado Grupo 2 para
esta verificación):** las 5 pestañas (ESF/ER/ECP/EFE/Notas) cargaron correctamente; "Generar
notas" produjo las 14 notas con cifras reales — incluida la nota 5 (fondo de imprevistos, saldo
final $158,000 desde `fondo_movimientos` histórico de CO-7) y la nota 6 (cartera real de 6
inmuebles con política de deterioro "antiguedad" ya vigente de una verificación anterior); edición
de la nota 13 conservó la marca "Editada" tras regenerar el resto; exportación a PDF completada sin
error (verificada leyendo el PDF real generado en memoria del navegador vía consola, 44 KB, y
reconstruida contra los mismos datos con un script Node/pdfmake como evidencia adjunta en
`Casos de uso/Tres Modulos/Contabilidad/evidencia/CO5_estados_financieros_evidencia.pdf`).

## D-51 — CO-6: el asiento CIERRE se contabiliza en un periodo ya `cerrado` (excepción puntual y
acotada, no relajación del guard), agregación por tupla de dimensiones completa para CIERRE/
APERTURA, `fn_contable_corregir_error` con un quinto parámetro (`comprobante_correcto_id`)

**Contexto.** CO-6 depende de CO-1/CO-2/CO-3/CO-4/CO-5 y cierra el primer hito de los tres
(Contabilidad legal completa). Tres decisiones de mecanismo no estaban explícitas letra por letra
en el corte y exigieron diseño propio; se documentan aquí para que no parezcan improvisación
posterior.

**Decisión 1 — excepción puntual en `fn_contabilizar_comprobante` (CO-2) para el tipo `CIERRE`.**
El corte exige (§3.4) "los 12 periodos del ejercicio cerrados" ANTES de construir el comprobante
CIERRE, y que ese comprobante "se contabilice por la vía normal ... hereda todas las
validaciones". Pero `fn_contabilizar_comprobante` (CO-2) exigía `contable_estado='abierto'` —el
periodo de diciembre, donde cae la fecha del CIERRE, YA está `'cerrado'` en ese momento por la
propia precondición del corte. Sin ajuste, `fn_contable_cerrar_ejercicio` nunca podría contabilizar
su propio asiento. Se añadió (`20260930540000`, `create or replace`) una excepción NARROW: admite
`contable_estado='cerrado'` únicamente cuando el tipo del comprobante es exactamente `'CIERRE'`
— cualquier otro tipo (INGRESO/EGRESO/CAUSACION/AJUSTE/...) sigue rechazado exactamente igual que
antes (prueba obligatoria #4 del corte lo confirma). No es relajar el guard para el caso general
(MARCO §9.2 lo prohíbe) — es el mismo patrón contable real: el asiento de cierre se contabiliza en
el instante mismo de cerrar, no como "una operación más" que el periodo admitiría de por sí.
APERTURA no necesita esta excepción: se contabiliza en enero del ejercicio NUEVO, que
`fn_contable_abrir_ejercicio` deja `'abierto'` antes de contabilizar.

**Decisión 2 — CIERRE/APERTURA agregan por la tupla completa de dimensiones, no "una línea por
cuenta".** El guard `COMPROBANTE_DIMENSION_REQUERIDA` (CO-2) exige que cada línea de una cuenta con
`requiere_tercero/centro_costo/fondo/inmueble` traiga esa dimensión. Colapsar toda la actividad de
una cuenta en una sola línea perdería esas dimensiones cuando distintas líneas originales
difirieran en ellas — violaría un guard existente. Ambas funciones agregan por
`(cuenta_id, tercero_id, centro_costo_id, fondo_id, inmueble_id, agrupacion_id)` —
`presupuesto_cuenta_id` queda fuera a propósito (no es una dimensión que el guard exija, y
agregar por ella fragmentaría el cierre sin ningún propósito real). CIERRE reversa el saldo neto de
cada grupo de clases 4/5/6 a cero, con una única línea de balanceo sin dimensiones hacia la cuenta
mapeada a `RESULTADO_EJERCICIO` (3310, `dim=''` — confirmado directamente en el seed del plan de
cuentas). APERTURA reproduce el saldo (mismo lado débito/crédito, no lo reversa) de cada grupo de
clases 1/2/3 al cierre anterior.

**Decisión 3 — `fn_contable_corregir_error` recibe `p_comprobante_correcto_id` además de los
cuatro parámetros que menciona la prosa del corte (`comprobante_origen, periodo_destino, motivo,
tipo_correccion`).** El contenido correcto de un asiento (qué cuentas, qué valores) es un juicio
contable que ningún dato existente permite derivar del asiento erróneo — inventar esa fórmula
violaría MARCO §9.2. El flujo real: el usuario captura el comprobante correcto por la vía normal
(borrador, la misma pantalla de captura manual que hoy usa AJUSTE/RECLASIFICACION) en el periodo
destino; la función decide la ruta, reversa si aplica, lo contabiliza y deja la traza — nunca
inventa sus líneas. `tipo_correccion` es `text` libre, no `lista_tipos` (D-24 exige que el
vocabulario de `lista_tipos` venga de un catálogo real; el corte no cierra un catálogo de
"naturaleza del error"). La ruta se enruta así: periodo abierto → `CONTABLE_CORRECCION_PERIODO_
ABIERTO` (anular y rehacer, CO-2); periodo cerrado + ejercicio abierto → reversión
(`fn_reversar_comprobante`, reutilizado tal cual) + comprobante correcto, ambos enlazados;
ejercicio cerrado (periodo `'bloqueado'`) + `tenant_marco_contable().marco_grupo <> 'grupo_3'` →
`CONTABLE_CORRECCION_GRUPO_NO_RESUELTO` (Grupo 2 exige reexpresión de comparativos, doctrina no
validada de fuente primaria en este corte — pregunta abierta para el contador); Grupo 3 → corrige
en el periodo corriente sin reversar el original (CTCP 0146/2025, ya validado), `comprobante_
reversion_id` queda NULL en `contable_correccion` (la propia traza distingue la ruta sin necesitar
un campo "tipo de ruta" aparte).

**Hallazgo mayor y corregido en este corte — duplicación exacta de saldos de balance tras
`fn_contable_abrir_ejercicio`.** `contable_estado_financiero` (CO-5), `contable_libro_mayor` y
`contable_balance_prueba` (CO-4) calculan el saldo de toda cuenta de balance (clases ≠ 4/5) como
una suma acumulada desde el origen (`c.fecha <= fecha_corte`, sin partición por ejercicio) —
correcto mientras solo existiera actividad económica real. `fn_contable_abrir_ejercicio` (CO-6)
introduce un comprobante APERTURA real que REPRODUCE (mismo lado débito/crédito, no lo reversa)
el saldo de cada cuenta de balance al cierre del ejercicio anterior — un saldo que la propia suma
acumulada YA contaba correctamente desde la actividad real. El resultado: cualquier estado o libro
pedido a una fecha en o después de la apertura reportaba el DOBLE del saldo real de toda cuenta de
balance (confirmado empíricamente: 120000 en vez de 60000). Encontrado por la prueba 12 de
`tests/contabilidad/cierre-apertura.test.ts` ("el ESF de apertura del ejercicio nuevo es idéntico
al ESF de cierre del anterior"). CIERRE no tiene este problema: sus líneas reversan clases 4/5/6 a
CERO (no reproducen un saldo ya contado), así que se cancelan por construcción sin duplicar nada;
el único valor nuevo que introduce (el crédito a 3310) es la primera vez que esa cuenta recibe
algo, nunca una repetición. El asiento de apertura debe seguir existiendo tal cual —el corte lo
exige explícito, con motivo de auditoría, cuadrado por construcción e idempotente— el motor de
reportes simplemente no debe sumarlo una segunda vez. **Fix:** cuatro migraciones `create or
replace function`, cada una excluyendo `origen_evento = 'apertura_ejercicio'` de la suma
acumulada de cuentas de balance: `contable_estado_financiero` (`20260930620000`),
`contable_libro_mayor` (`20260930630000`), `contable_balance_prueba` (`20260930640000`) y,
encontrado por revisión posterior de qué otras funciones comparten el mismo patrón de suma
acumulada sobre `contable_comprobante_detalle`, `contable_conciliacion_cartera` (`20260930650000`
— las cuentas 13xx exigen dimensión `inmueble_id`, así que la apertura también reproduce saldos de
cartera por inmueble; sin el fix, cualquier inmueble con cartera pendiente al cierre mostraría una
diferencia espuria contra el auxiliar tras la apertura). Verificado sin regresiones: suite completa
de CO-4 (`libros-oficiales.test.ts`, 11/11) y CO-5 (`estados-financieros.test.ts`, 13/13) tras el
fix, además de las 15 pruebas propias de CO-6.

**Endurecimiento (entregable 2 del corte).** `guard_marco_contable_tenant()` (CO-1) comparaba
contra `periodos.estado='cerrado'` (el ciclo de LIQUIDACIÓN, no el contable) con un comentario
propio que ya anunciaba "se endurecerá cuando CO-6 introduzca la semántica completa de cierre".
Se cambió (`20260930600000`) a `periodos.contable_estado in ('cerrado','bloqueado')` — el ciclo
contable real.

**Confirmación de consistencia CO-5↔CO-6 (sin cambio de código).** Se verificó que el selector
`resultados_anteriores` de CO-5 (`'33'`, cubre 3305 y 3310) no duplica el resultado de un ejercicio
ya cerrado: `resultado_ejercicio` de CO-5 recalcula en vivo, acotado por fecha, el resultado del
ejercicio ACTUAL (arranca en cero en un año nuevo), mientras `resultados_anteriores` acumula lo que
el libro ya tenga de ejercicios previos — la interacción resuelve correctamente por construcción,
sin necesitar una reclasificación explícita 3310→3305.

**Hallazgo (no corregido en este corte, fuera de su alcance):** `contable_conciliacion_proyeccion`
(CO-3) compara TODO lo persistido contra la proyección de
`cargos/pagos/presupuesto_ejecucion/fondo_movimientos` — un comprobante manual (tipo AJUSTE,
INGRESO, etc.) que toque una cuenta dentro de ese universo SIEMPRE aparece como diferencia,
sin importar qué cuentas use, bloqueando permanentemente el cierre de su periodo (bloqueante, no
forzable). Encontrado al construir `tests/contabilidad/cierre-apertura.test.ts` (prueba 13):
resuelto en el fixture usando un comprobante materializado normalmente (que por construcción nunca
diverge de su propia proyección) en vez de uno insertado a mano. Documentado como pregunta abierta
para el contador/equipo en `CO_06_INFORME.md` — no es un defecto de CO-6, es una característica
preexistente de CO-3 que ningún test anterior había ejercido.

## D-52 — MANT-1: jsonb + catálogo de esquema (no EAV) para atributos técnicos; gap de RLS
heredado de MANT-0 descubierto y corregido; guard de inmutabilidad de `mant_criticidad_set`
corregido antes de escribir pruebas

**Contexto.** MANT-1 abre el Hito 2 (Operación diaria de mantenimiento), depende de MANT-0. El
Plan del corte planteaba explícitamente dos decisiones de diseño para confirmar con el usuario
antes de implementar.

**Decisión 1 — jsonb + catálogo de esquema, no EAV, para atributos técnicos dinámicos.**
Confirmada con el usuario ("Aprobado MANT-1, PROCEDE") sobre la opción que el propio corte ya
recomendaba: sin precedente de EAV en el repositorio, penalización de rendimiento de consulta
conocida, y el patrón jsonb ya vive en `estados_cuenta_datos_jsonb`/`presupuesto_ejecucion`.
`mant_atributo_definicion` (esquema por tipo de activo, por tenant) valida `activos.atributos`
(columna jsonb nueva) por trigger — nunca EAV clásico de `TipoActivo → AtributoTecnico → Valor`.

**Hallazgo 1 — gap real heredado de MANT-0, encontrado en la primera UI real construida sobre
`activos`.** `activos`, `activo_estado_historial` y `mant_depreciacion_detalle` tenían `ENABLE +
FORCE ROW LEVEL SECURITY` desde MANT-0 pero **cero políticas** — inaccesibles para cualquier
cliente autenticado real, solo el `service_role` podía leerlas o escribirlas. MANT-0 nunca
construyó UI (documentado explícitamente en su propio informe como pendiente) y su suite de
pruebas usa exclusivamente el cliente admin, así que el gap era invisible hasta este corte. No es
relajar un guard — es completar una política de autorización que nunca se escribió (Definición de
Terminado del marco: "autorización aplicada en UI y en RLS"). Corregido en `20260930730000` con
las políticas estándar del repositorio (`is_member` para lectura, `has_role(['auxiliar'])` para
escritura en `activos`/`activo_estado_historial`; solo lectura en `mant_depreciacion_detalle`, que
un trigger `SECURITY DEFINER` puebla exclusivamente). Verificado en el navegador antes y después
del fix.

**Hallazgo 2 — reutilizar `guard_politica_inmutable` tal cual en `mant_criticidad_set` habría
hecho irrealizable la prueba obligatoria 7 (encontrado por lectura de un precedente, antes de
escribir ninguna prueba).** Ese guard genérico bloquea cualquier UPDATE sobre una fila cuyo
`estado` ya sea `vigente`/`historica`, incluida la transición `vigente → historica` que hace falta
para retirar una versión antes de activar la siguiente (el índice único parcial solo admite una
fila vigente por tenant). Es el mismo gap ya documentado y ya resuelto en este repositorio para
`coeficiente_sets` (`20260830220000_coeficiente_set_reemplazar_vigente.sql`) — deliberadamente no
corregido para `politicas_financieras`/`contable_politica_deterioro` (deuda de otras series, fuera
de este corte). Corregido para `mant_criticidad_set` con un guard dedicado
(`guard_criticidad_set_inmutable`, `20260930710000`) que permite exactamente ese único cambio.

**Nota menor de tipos.** `mant_activo_criticidad.puntaje` (calculada por trigger desde
`criterio.escala[valor]`, nunca escrita directo por el cliente) era `not null` sin `default`, lo
que forzaba al `Insert` generado por `pnpm db:types` a exigirla de todos modos — contradiciendo la
intención documentada en su propio comentario. Corregido con `default 0` (`20260930720000`); el
guard sigue sobrescribiéndolo siempre antes de persistir.

## D-53 — MANT-2: rediseño a una sola tabla de requisitos (sin catálogo global resuelto por
municipio); bug real en `create_tenant()` encontrado por la propia prueba de regresión de GAP-22

**Contexto.** El corte original (`MANT_02_cumplimiento_normativo.md`) planteaba un catálogo global
inmutable (`mant_requisito_catalogo`) resuelto automáticamente contra el municipio de la
copropiedad (`mant_requisitos_aplicables()`), con un gate externo pendiente (abogado/especialista
en cumplimiento de PH) para verificar qué normas aplican en qué municipios antes de sembrar nada.

**Investigación previa al Plan del corte.** Antes de plantear el diseño se hizo una investigación
en tres frentes paralelos (transporte vertical/piscinas, RETIE/RETILAP/agua/gas,
incendio/extintores), verificando cada norma contra fuente primaria (gaceta, decreto, resolución,
sitio de la entidad reguladora) — documentada en `MANT_02_INVESTIGACION_NORMATIVA.md`. Hallazgo
central: la NTC 5926 (ascensores) **nunca fue de obligatoriedad nacional** — el Proyecto de Ley
109/2021C que buscaba nacionalizarla fue archivado (verificado en camara.gov.co); su adopción es
exclusivamente municipal y heterogénea (verificada con texto completo para Bogotá y Bucaramanga,
parcial para Cali, contradictoria y no sembrada para Medellín). El resto de las ~9 normas
(piscinas, tanques, extintores, bomberos, RETIE, RETILAP, gas, sistemas contra incendio) sí
quedaron verificadas con confianza suficiente para el catálogo nacional.

**Decisión (pedida explícitamente por el usuario): eliminar la dependencia del gate externo
sembrando TODO como configurable, no solo lo verificado.** En vez de que el sistema "resuelva"
automáticamente qué aplica por municipio (con el riesgo de acertar mal), se colapsa el diseño
original de dos tablas (`mant_requisito_catalogo` global + `mant_requisito_tenant` propio) en
**una sola tabla `mant_requisito`**, con `tenant_id` nullable: las filas con `tenant_id is null`
son semilla (nunca expuestas a ningún cliente autenticado — sin policy de RLS que las alcance) y
`fn_instanciar_requisitos_cumplimiento()` las copia a filas propias del tenant en el momento del
alta (mismo contrato que `fn_instanciar_cuentas_default`, PC-3c) — desde ese instante son 100% del
tenant: editar norma, fuente, frecuencia o acreditador, o quitarlas (`activo = false`, nunca
`DELETE` físico — un `mant_cumplimiento` ya registrado sigue apuntando a ese id), no depende de que
el sistema haya adivinado bien el municipio. La UI (grilla + un solo drawer de edición para
cualquier requisito, predefinido o propio, con campo de "norma/decreto/resolución" y campo de
"enlace a la fuente" separados) se validó con el usuario mediante una vista previa HTML antes de
implementar. `ASCENSOR_REVISION_ANUAL` se siembra con `norma_referencia`/`fuente_url` en `null` a
propósito, con el `detalle` explicando por qué — el administrador completa el decreto de su
municipio.

**Consecuencia**: el gate externo deja de bloquear el corte — ya no hay una "resolución automática"
de la que el sistema deba responder legalmente. `mant_requisitos_aplicables()` del diseño original
se simplifica a `mant_estado_cumplimiento()` (calculado, nunca almacenado, mismo criterio que
`contable_estado_financiero` de CO-5), que expande un requisito por cada activo de su
`tipo_activo_id` cuando aplica, o lo trata a nivel de copropiedad cuando no.

**Bug real encontrado por regresión, no por una prueba nueva de este corte.** Al redefinir
`create_tenant()` para agregar la llamada a `fn_instanciar_requisitos_cumplimiento()`, se reprodujo
el cuerpo de la función a partir de `20260903120000` (la primera copia encontrada por búsqueda) en
vez de `20260929170000` (la última redefinición real, que GAP-22 había agregado después) — perdiendo
la llamada a `fn_instanciar_fondo_imprevistos()`. La prueba de regresión ya existente
`tests/contabilidad/alta-parametrizacion-contable.test.ts` ("GAP-22: la copropiedad también nace con
su fondo de imprevistos") lo detectó de inmediato. Corregido con una migración nueva
(`20260930770000`) que reproduce el cuerpo correcto (verificado con
`grep -rl "create or replace function public.create_tenant"` sobre **todas** las migraciones, no
solo la primera coincidencia) más la línea de MANT-2. **Lección reutilizable**: antes de reproducir
el cuerpo de cualquier función para agregarle una línea, listar TODAS las migraciones que la
redefinen y usar la última — no asumir que la primera copia encontrada es la vigente.

## D-54 — FIN-1: disponibilidad bancaria calcada de `fn_fondo_saldos`; tres casos de deriva de
esquema atrapados por la disciplina de D-53 antes de convertirse en bugs; gap de alcance estrecho
en el guard de terminal-inmutabilidad corregido antes de escribir la prueba que lo habría hallado

**Contexto.** `APENDICE_FIN.md`/`FIN_01_posicion_tesoreria.md` piden replicar para cuentas
bancarias el patrón ya probado en `fondo_compromisos`/`fn_fondo_saldos` (`20260929140000`):
disponible = saldo contable − comprometido, nunca almacenado. Se agregan
`finanzas_cuenta_bancaria_compromiso` (con los mismos guards de exceso-de-disponible/motivo/
terminal-inmutable que Fondos), `fn_cuenta_bancaria_disponible`, `finanzas_posicion_tesoreria`
(consulta pura sobre funciones ya existentes: `fn_cuenta_bancaria_disponible`, `fn_fondo_saldos`,
`contable_libro_mayor`, `fn_posicion_cartera`, `presupuesto_ejecucion`) y
`finanzas_politica_tesoreria` versionada (reutiliza `vigencia_estado_t`, D-24 ya resuelto para
`coeficiente_sets`/`politicas_financieras`/`mant_criticidad_set` — no se crea un enum nuevo).

**Tres hallazgos de deriva de esquema, atrapados por aplicar la lección de D-53 (buscar en TODAS
las migraciones antes de asumir la forma de una columna), no por un error de `db push` sin más
contexto:**

1. `cuentas_bancarias.contable_cuenta_id` ya existía (agregada por PC-3,
   `20260830460000_contable_puentes_mapeo.sql`, con su propio guard
   `guard_cuenta_bancaria_contable`) — la migración inicial de este corte traía un
   `ALTER TABLE ADD COLUMN` redundante; se quitó y el comentario de cabecera documenta el
   hallazgo en vez de callarlo.
2. `cuentas_bancarias.banco` (text) ya no existe — reemplazada por `entidad_financiera_id` (FK a
   `lista_tipos` familia `ENTIDAD_FINANCIERA`, `20260822170000`). `finanzas_posicion_tesoreria`
   resuelve el nombre de la entidad con un join a `lista_tipos`, igual que el resto del código que
   ya conocía este cambio.
3. `fondos.tipo` fue renombrada a `fondos.naturaleza` (`fondo_tipo_t` → `fondo_naturaleza_t`,
   `20260929100000_fondos_modelo_general.sql`). `finanzas_posicion_tesoreria` clasifica
   `naturaleza = 'imprevistos'` como `restringido` (no cuenta como liquidez utilizable por
   defecto) y todo lo demás como `activo_liquido`.

Los tres se detectaron en la fase de `db push` (antes de correr ninguna prueba), exactamente el
patrón que D-53 pedía prevenir — ninguno llegó a producir un bug en tiempo de ejecución.

**Gap de alcance estrecho en el guard de terminal-inmutabilidad, corregido antes de escribir la
prueba 4 (no por una prueba fallida).** Al diseñar la prueba obligatoria 4 ("un compromiso
terminal no admite modificación"), se advirtió que un trigger `before update of estado` —el
patrón que ya trae `guard_fondo_compromiso_transicion` sin que nadie lo haya notado todavía— solo
se dispara cuando la columna `estado` misma cambia: editar `monto` sobre un compromiso ya
`ejecutado`/`liberado`/`anulado` no quedaba bloqueado. Corregido en
`20260930810000_fin1_fix_compromiso_terminal_cualquier_campo.sql`, moviendo el chequeo de estado
terminal al inicio de `guard_finanzas_compromiso_bancario` (`before insert or update`, todas las
columnas) — la prueba 4 se escribió después, ya contra el guard corregido. El mismo gap sigue sin
corregir en `fondo_compromisos` porque está fuera del alcance de este corte; queda anotado en el
propio comentario de la migración para quien toque ese módulo después.

**Guard de inmutabilidad de política dedicado desde el arranque, no como fix posterior.**
`finanzas_politica_tesoreria` recibió su propio `guard_finanzas_politica_tesoreria_inmutable`
(modelado en `guard_criticidad_set_inmutable`) en vez de reusar el guard genérico —MANT-1 (D-52)
ya había encontrado que ese guard genérico bloquea la transición `vigente→historica` necesaria
para activar una segunda versión. Aplicar la lección proactivamente, no volver a tropezar con
ella, era el punto de documentarla en D-52.

**Bug de fixture de prueba, no de la base de datos: año lejano incompatible con `now()`.** El
primer borrador de `tests/finanzas/posicion-tesoreria.test.ts` copió la convención de año fiscal
lejano (2031) de `tests/contabilidad/comprobante-nucleo.test.ts` — convención que existe ahí para
aislar datos de `periodos` entre archivos de prueba que **comparten tenants**. FIN-1 no tiene ese
problema (cada prueba crea su propio tenant dedicado con `crearTenantConPlan`), así que copiar la
convención sin copiar su razón de ser introdujo un bug distinto: `guard_finanzas_compromiso_
bancario` llama `fn_cuenta_bancaria_disponible(..., now())` con la fecha real de hoy (~2026) para
su chequeo de negocio — un comprobante fechado en 2031 nunca aparece contabilizado "a hoy", así
que el guard veía siempre `saldo_contable = 0` y rechazaba reservas que debían aceptarse (5 de
las 12 pruebas fallaban con `COMPROMISO_BANCARIO_EXCEDE_DISPONIBLE` sobre datos que sí tenían
saldo). Corregido cambiando el año fiscal del fixture a 2020 (pasado real, sin necesidad de
inyectar `p_fecha` explícito en ninguna llamada). **Lección reutilizable**: una convención de
aislamiento de otro archivo de prueba no se copia sin verificar que el problema que resuelve
también aplica aquí — puede introducir un bug nuevo en vez de evitar uno viejo.

**UI**: `apps/web/app/pages/finanzas/posicion.vue` + `apps/web/app/stores/posicionTesoreria.ts` —
encabezado con liquidez utilizable, tarjetas por dimensión, detalle expandible por cuenta bancaria
con sus compromisos vigentes, click en el saldo abre el Libro Mayor filtrado (se agregó soporte de
query `?cuenta=<uuid>` a `contabilidad/libros.vue`, sin cambiar su comportamiento por defecto), y
la pantalla de política con simulación de la liquidez utilizable antes de guardar. Verificado en
navegador contra un tenant con datos reales (evidencia en `FIN_01_INFORME.md`).

## D-55 — MANT-3: encadenamiento de programaciones desde la ejecución real (no la teórica),
cobertura calculada en vivo sobre `mant_planes` (no sobre el snapshot de `mant_plan_activos`), y
backfill retroactivo de `MIGRACIONES_LEDGER.md` (nunca se había actualizado desde CO-1)

**Contexto.** `MANT_03_planes_programacion.md` §3.3 exige que, al cerrarse una orden de trabajo con
retraso, la siguiente programación se calcule desde la fecha de ejecución **real**, no desde la
fecha programada — así un mantenimiento mensual ejecutado con dos semanas de atraso no hereda esa
deuda de calendario hacia adelante. Se implementó como un booleano por plan,
`mant_planes.encadenar_desde_ejecucion_real` (default `true`, parametrizable si el contador de
mantenimiento lo discute más adelante — el corte lo pedía explícito). `fn_mant_generar_
programaciones` distingue dos casos por (plan, activo): si ya existe historial, encadena desde
`generada_at` de la última fila `'generada'` cuando la política lo pide (o desde `fecha_programada`
si no); si es la primera programación, ancla en `greatest(hoy, vigente_desde, último
mant_cumplimiento del requisito)` — nunca hacia el pasado, sin necesitar un caso especial.

**Cobertura (`mant_cobertura_requisitos`) se calcula en vivo sobre `mant_planes.alcance`, no sobre
`mant_plan_activos`.** `mant_plan_activos` es el snapshot materializado que consume el motor de
programación (se refresca en cada corrida de `fn_mant_generar_programaciones` y al activar un
plan) — depender de él para el panel de cobertura habría dejado un plan recién creado (todavía sin
resolver) marcado como "sin cobertura" hasta la próxima corrida. Se prefirió repetir la expansión
de alcance como consulta de solo lectura (mismo criterio que `contable_estado_financiero`/
`mant_estado_cumplimiento`: un estado derivable no se almacena) — el costo es aceptable porque el
catálogo de una copropiedad (AD-24: un tenant = un edificio) es chico por diseño.

**`MIGRACIONES_LEDGER.md` nunca se había actualizado.** La regla de `HOJA_DE_RUTA.md` §4 (cada
corte añade su fila al cerrar) no se siguió ni una vez desde CO-1 — el archivo solo tenía la fila
base. Se hizo un backfill retroactivo de las 11 filas de CO-1 a FIN-1 (rangos tomados de cada
`*_INFORME.md`, verificados contra `ls supabase/migrations` — la última migración real coincidía
exactamente con lo documentado, `20260930810000`) antes de empezar MANT-3, para que el mecanismo
vuelva a ser confiable para el siguiente corte. Fechas de cierre aproximadas (no hay historial de
git sobre esa carpeta, que vive fuera del repo); los rangos de timestamp sí son exactos.

**Alcance de un plan modelado con cinco columnas mutuamente excluyentes en `mant_planes`
(`alcance_activo_id`/`alcance_tipo_activo_id`/`alcance_categoria_id`/`alcance_agrupacion_id`/
`alcance_zona_comun_id`), no una tabla de destino polimórfica.** Con solo cuatro valores posibles
de `plan_alcance_t` y sin necesidad de agregar un quinto tipo de destino a futuro (el corte no lo
pide), una tabla `objeto_tipo`/`objeto_id` genérica habría sido una abstracción sin segundo caso de
uso real. `guard_mant_plan` exige que exactamente el destino correspondiente a `alcance` esté
poblado (`PLAN_ALCANCE_INCONSISTENTE`).

**13/13 pruebas propias verdes** (`tests/mantenimiento/planes-programacion.test.ts`) + regresión de
toda la serie MANT (MANT-0/1/2, 61/61) sin hallazgos atribuibles a este corte. `pnpm build`/
`typecheck`/`lint` sin errores nuevos (la deuda preexistente documentada desde CO-1 se mantiene,
recontada en este corte: 34 errores de `tsc` / 2302 de `eslint`, no 32/2300 — drift acumulado de
cortes intermedios, no introducido aquí). `supabase db lint` sin hallazgos nuevos (los 8
preexistentes, incluido el falso positivo ya documentado de `contable_estado_financiero`, se
mantienen). Verificado en navegador de punta a punta contra JARDINES DE BABILONIA: creación de un
plan heredado de `ASCENSOR_REVISION_ANUAL`, previsualización de alcance (0 activos — correcto, el
tenant no tiene ascensores registrados), tarea, activación y desaparición del hueco de cobertura
para los requisitos que sí tienen activos reales sin plan.

## D-56 — MANT-4: `aquila.cerrando_ot` como único portal a `cerrada`, política de aprobación
versionada limitada a monto/parada de servicio, y tres adiciones de esquema no previstas en el
corte original

**Contexto.** `MANT_04_incidencias_ordenes_trabajo.md` §3.3 exige que cerrar una OT dispare, en un
solo paso atómico, la validación de completitud, el registro de cumplimiento (MANT-2), el
encadenamiento de la siguiente programación (MANT-3, D-55) y la resolución de la incidencia origen
— pero ninguno de esos efectos puede vivir en un trigger de `mant_ordenes_trabajo` sin que la
inserción/actualización de las filas relacionadas ocurra fuera de la transacción del propio
`UPDATE`. Se resolvió con el mismo mecanismo que `aquila.propagacion_solicitud` (Fondos, D-37):
`fn_mant_cerrar_ot` hace todo el trabajo previo (excepciones incluidas: `OT_CIERRE_INCOMPLETO` con
el detalle exacto de qué falta, `OT_CUMPLIMIENTO_SIN_ACREDITACION`), marca
`set_config('aquila.cerrando_ot', 'true', true)` y solo entonces ejecuta su propio `UPDATE ... SET
estado = 'cerrada'` — `guard_mant_ot` rechaza esa transición desde cualquier otro origen
(`OT_TRANSICION_INVALIDA`). `cerrada` también es inmutable para *cualquier* columna, no solo
`estado` (`OT_CERRADA_INMUTABLE` chequeado primero en el guard, antes de cualquier otra
validación) — lección de D-54/D-55 aplicada desde el arranque de este corte, no descubierta a
mitad de camino.

**Política de aprobación de OT (`mant_politica_aprobacion_ot`) versionada
(`vigencia_estado_t`, D-52), igual que `finanzas_politica_tesoreria`/`contable_politica_deterioro`,
deliberadamente simplificada a monto y parada de servicio — sin umbral por banda de
criticidad.** Un umbral "la OT se autoaprueba si el activo es de banda crítica" exigiría un orden
total entre bandas de criticidad que MANT-1 nunca definió (`mant_criticidad_banda.etiqueta` es
texto libre por tenant, sin posición ordinal) — inventar ese orden aquí habría sido cerrar una
decisión de MANT-1 por la puerta de atrás. El guard aplica la política como **piso, nunca techo**:
si el usuario ya marcó `requiere_aprobacion = true` a mano, la política nunca lo relaja a `false`.
Un administrador siempre puede marcar `requiere_aprobacion` manualmente sin depender del cálculo.

**Tres adiciones de columnas sobre el corte original, documentadas como adición, no como omisión**
(las tres surgieron de que una regla de negocio exigida por el propio corte era irrepresentable sin
ellas):
- `mant_ordenes_trabajo.acreditacion_referencia` — sin ella, `OT_CUMPLIMIENTO_SIN_ACREDITACION`
  (un requisito que exige tercero acreditado) no tendría dónde guardar la referencia real.
- `mant_ot_tareas.requiere_medicion` / `requiere_evidencia_foto` — sin ellas, `OT_CIERRE_INCOMPLETO`
  no podría distinguir una tarea que solo exige marcarse ejecutada de una que además exige una
  medición o una foto. Se copian 1:1 de `mant_plan_tareas` (MANT-3) cuando la OT nace de una
  programación.

**Dos fixes encontrados al correr las pruebas por primera vez, antes de cerrar el corte** (detalle
completo en la cabecera de `20260930980000` y `20260930990000`):
1. `guard_mant_incidencia`/`guard_mant_ot` validaban todo pero nunca llamaban a
   `fn_mant_siguiente_numero` — `numero`/`anio` quedaban en el valor placeholder. Se corrigió
   asignándolos dentro del propio guard en `INSERT`.
2. Una medición fuera de rango debía generar una incidencia de anomalía enlazada
   (`incidencia_generada_id`) — implementado primero como un trigger `AFTER INSERT` separado que
   hacía un `UPDATE` de vuelta sobre la misma fila. Postgres no refleja ese `UPDATE` posterior en el
   `RETURNING` de la sentencia `INSERT` original que ve el cliente (comportamiento de Postgres, no
   un bug de la lógica) — la prueba 9 lo detectó porque el cliente de prueba leía
   `medicion.incidencia_generada_id` directo del resultado del insert. Se movió la generación al
   propio guard `BEFORE INSERT`, fijando `new.incidencia_generada_id` antes de que la fila se
   guarde.

**Regresión de MANT-3 causada por este corte, no un bug de MANT-3.** El test 8 de
`planes-programacion.test.ts` usaba `randomUUID()` como `orden_trabajo_id` de relleno en
`mant_programaciones` — válido mientras esa columna no tenía FK. `20260930970000` (este corte) le
agregó la FK real hacia `mant_ordenes_trabajo`, y el placeholder empezó a fallar con `23503`. Es la
consecuencia esperada de que MANT-4 cierre lo que MANT-3 había dejado deliberadamente sin
constraint — se corrigió el fixture del test (insertar una OT real), no el esquema.

**Bug encontrado durante la verificación en navegador, no por los tests automatizados** (los tests
de RLS/integración no ejercitan los stores de Pinia): `mantenimientoOrdenesTrabajo.ts`/
`mantenimientoIncidencias.ts` — `actualizarOt`/`actualizarIncidencia` actualizaban `otActual`/
`incidenciaActual` con la fila devuelta por el propio `UPDATE`, pero nunca releían
`mant_ot_estado_historial`/`mant_incidencia_actuaciones` (ambas pobladas por el guard de la base,
no por el cliente) — la bitácora/historial quedaba desactualizada en pantalla hasta el próximo
`F5`, aunque el dato en BD ya era correcto. Se corrigió recargando esas dos tablas al final de cada
`actualizar*`.

**Adición de UI no prevista en el corte original: `TIPO_DOCUMENTO` código `evidencia_ot`
(`20260931010000`).** `mant_ot_evidencias.documento_id` exige una fila de `documentos` (la
librería general), y la Edge Function `subir-documento` exige un `tipo_documento_id` de la familia
`TIPO_DOCUMENTO` — ningún código existente (`personeria_juridica`, `comprobante_pago`,
`soporte_movimiento_fondo`...) describe "evidencia de una OT". Se añadió uno propio, mismo criterio
que cada corte anterior que necesitó subir un documento nuevo (D-42). No confundir con
`EVIDENCIA_OT_TIPO` (`20260930950000`): esa familia clasifica *qué representa* el archivo dentro de
la OT (foto antes/después/firma/otro); la nueva clasifica el documento dentro de la librería
general del tenant.

**AD-26 aplicado tal como se cerró con el usuario: solo staff con sesión inserta una incidencia.**
`reportante_ref`/`reportante_contacto` son siempre texto libre — nunca un principal de
autenticación. `registrada_por` se completa siempre desde `auth.uid()` si llega `null` (prueba 12).
La captura anónima vía QR queda fuera de alcance hasta que exista `GOB_00_DECISION_AD26.md`; el
Edge Function `ver-activo`/`generar-qr-activo` (MANT-0) se reutilizó sin cambios porque MANT-4 no
agrega ninguna escritura por QR (prueba 13: la ficha pública no expone costos ni proveedores).

**16/16 pruebas propias verdes** (`tests/mantenimiento/ot-incidencias.test.ts`) + regresión de toda
la serie MANT (MANT-0/1/2/3, 77/77) tras el fix del fixture de MANT-3. `pnpm build`/`typecheck`/
`lint` sin errores nuevos atribuibles a este corte (34 errores de `tsc` raíz preexistentes, sin
cambios; **94 de `eslint` raíz, no 2302** — la cifra de 2302 venía de `.claude/skills/**`/
`.github/skills/**` sin excluir del linter, corregido en `eslint.config.js` por otra sesión en
paralelo el mismo día, ver `project_deuda_tecnica_preexistente` en memoria; `apps/web` bajó de 9 a
6 errores de lint — mismo drift ajeno a este corte — y quedó en **0 de typecheck** (los 7
preexistentes de producción, ajenos a este corte, los arregló esa misma sesión en paralelo, dos
eran bugs funcionales reales), tras corregir los 3 propios encontrados aquí:
`import/first` en las tres páginas nuevas). `supabase db lint --linked` sin hallazgos nuevos.
Verificado en navegador de punta a punta contra JARDINES DE BABILONIA (membresía de administrador
agregada para la verificación, aprobada explícitamente por el usuario): alta de incidencia →
evaluación → conversión a OT → cierre → resolución automática de la incidencia origen; alta de OT
manual con una tarea propia → ejecución → cierre; ambos árboles de estado (incidencia y OT)
recorridos hasta su hoja terminal; vista responsiva verificada en viewport móvil (375×812).

## D-57 — MANT-5: `contrato_estado_t` sin `por_vencer`/`vencido` (cálculo puro, mismo patrón que
`mant_estado_cumplimiento`), `presupuesto_ejecucion.contrato_id` para comprometido/ejecutado
siempre leído en vivo, y una regresión propia encontrada y corregida antes de cerrar el corte

**Contexto.** `MANT_05_proveedores_contratos_garantias.md` exige que un contrato "vigente" pueda
presentarse como `por_vencer`/`vencido` según su `fecha_fin`, sin que eso invente un estado real de
negocio nuevo — la máquina de estados real de un contrato (§4.3) es
`borrador → vigente → suspendido/terminado`, con `terminado` inmutable. Se confirmó con el usuario
(pregunta explícita vía `AskUserQuestion`, respuesta "cálculo puro, fuera del enum") que
`por_vencer`/`vencido` **nunca** entran a `contrato_estado_t` ni se guardan — son presentación,
calculada por `mant_contrato_estado_visible(p_contrato_id, p_fecha default current_date,
p_umbral_dias integer default 30)`, exactamente el mismo patrón que `mant_estado_cumplimiento`
(MANT-2) y `mant_habilitaciones_semaforo`/`mant_contrato_ejecucion` de este mismo corte — marco
principio #1 ("un número calculado nunca es una decisión") aplicado de entrada, no como corrección.
Un intento directo de `UPDATE mant_contratos SET estado = 'por_vencer'` falla a nivel de Postgres
(no es un valor válido de `contrato_estado_t`) — prueba 6 de
`tests/mantenimiento/proveedores-contratos.test.ts`.

**"Comprometido" vs "ejecutado" de un contrato — interpretación propia, confirmada con el usuario**
(segunda pregunta vía `AskUserQuestion`, respuesta "agregar `presupuesto_ejecucion.contrato_id`").
"Comprometido" es el propio `valor_total` del contrato (un término pactado, nunca un saldo
calculado que pueda divergir); "ejecutado" es `sum(presupuesto_ejecucion.monto) where contrato_id =
X`, siempre leído en vivo desde `mant_contrato_ejecucion(p_contrato_id uuid) returns
table(comprometido numeric, ejecutado numeric)` — nunca cacheado ni duplicado en `mant_contratos`.
Se agregó `presupuesto_ejecucion.contrato_id` (nullable, mismo patrón incremental que
`activo_id`/`agrupacion_id`/`centro_costo_id`/`tercero_id` ya agregados por MANT-0/PC/PC-4) y se
extendió `guard_presupuesto_ejecucion_activo()` (`create or replace`) para validar su consistencia
de tenant, reutilizando `CONTRATO_TENANT_INCONSISTENTE`. Prueba 7 confirma explícitamente que el
`ejecutado` de un contrato NO cuenta los movimientos de otro contrato sobre la misma cuenta.

**Regresión propia encontrada por la regresión de todo el directorio `tests/mantenimiento`, no por
lectura ni por las 12 pruebas propias del corte** (que pasaron 12/12 a la primera). La reescritura
completa de `guard_mant_ot()` en `20260931080000` (para sumar la validación de contrato/SLA y el
bloqueo por contratista no habilitado) perdió por accidente el bloque que asigna `numero`/`anio` en
el `INSERT` — el mismo bloque que D-56 ya había documentado como "asignado siempre por
`guard_mant_ot` vía `fn_mant_siguiente_numero`". Sin él, `numero` se quedaba en su `DEFAULT`
placeholder (`0`, ver `20260931000000`) para toda OT nueva, y la prueba 1 de
`ot-incidencias.test.ts` ("consecutivos de incidencia y de OT sin huecos") empezó a fallar con
`23505` (violación de la unique `(tenant_id, anio, numero)`) al crear la segunda OT de un mismo
tenant/año. Se corrigió con una migración nueva (`20260931110000`, nunca editando la ya aplicada)
que repone el bloque en la misma posición original (justo tras `OT_CERRADA_INMUTABLE`) preservando
el resto de la función tal cual. Lección: reescribir una función completa con `create or replace`
para extenderla es más propenso a perder líneas existentes que insertar el bloque nuevo dentro de
la definición ya vigente — para la próxima extensión de un guard grande, preferir un diff mínimo
sobre el cuerpo existente en vez de reescribirlo entero desde cero.

**`GARANTIA_RESULTADO_INVALIDO` como código nuevo, no reutilización de
`GARANTIA_ORIGEN_INCONSISTENTE`.** El guard de `mant_garantia_reclamaciones` inicialmente reutilizó
`GARANTIA_ORIGEN_INCONSISTENTE` (pensado para la consistencia origen/`contrato_id` de
`mant_garantias`) para señalar también un `resultado_id` que no resuelve contra
`RESULTADO_RECLAMACION_GARANTIA` — un error de categoría, detectado antes de correr las pruebas.
Corregido introduciendo el código dedicado y registrándolo en `error-codes.ts`.

**Cero tablas de proveedor nuevas (criterio de aceptación explícito del corte).** El corte extiende
`terceros`/`tenant_tercero_rol` (ya existentes) en vez de crear `mant_proveedores`: un proveedor es
un tercero con rol `proveedor`/`contratista`, y `mant_proveedor_perfil`/
`mant_proveedor_habilitacion`/`mant_proveedor_evaluacion` cuelgan de `tercero_id`, no de una entidad
nueva. Prueba 1 (grep estático de migraciones) verifica que ninguna migración crea una tabla
`mant_proveedores`/`supplier`.

**Cero valores sembrados en `mant_habilitacion_requerida`** (marco principio #6) — verificado por
grep estático (prueba 5), igual que `mant_matriz_prioridad`/`mant_politica_aprobacion_ot` en
cortes anteriores: es una tabla de reglas por tenant, nunca un catálogo con contenido de fábrica.

**`mant_verificar_habilitacion_tercero()` reusada por UI y guard, no duplicada.** Toma los mismos
parámetros que `guard_mant_ot()` ya tiene a mano (`activo_id`, `tipo_mantenimiento_id`,
`requiere_trabajo_alturas`, `requiere_parada_servicio`, `costo_estimado`) y devuelve solo las
habilitaciones faltantes/vencidas; el guard filtra a `bloqueante` y rechaza
(`OT_CONTRATISTA_NO_HABILITADO`), la UI puede llamarla antes de guardar para advertir sobre las no
bloqueantes sin bloquear el alta (prueba 4). Una garantía vigente sobre el activo NUNCA bloquea una
OT correctiva — `mant_activo_garantias_vigentes()` es de solo lectura, puramente informativa (marco
principio #4, "un número calculado nunca es una decisión"; prueba 9).

**`requiere_trabajo_alturas` — columna agregada durante el corte, documentada como adición, no
omisión** (mismo estilo que `acreditacion_referencia` de D-56): ninguna columna existente de
`mant_ordenes_trabajo` capturaba "esta tarea implica trabajo en alturas", y
`mant_habilitacion_requerida` la necesita como tipo de condición (`condicion_tipo =
'trabajo_alturas'`).

**`FORMA_PAGO` (lista_tipos existente) vs. `mant_contratos.forma_pago` (texto libre, nuevo) —
deliberadamente NO unificados.** `FORMA_PAGO` describe el medio de pago de un recaudo de cartera
(efectivo/transferencia/PSE/débito automático/nota débito); `mant_contratos.forma_pago` describe el
plazo pactado de pago de un contrato (ej. "45 días fecha factura") — un concepto distinto aunque el
nombre se preste a confusión, documentado así en el comentario de la migración. Mismo criterio para
`ESTADO_TERCERO` (activo/inactivo del tercero en el sistema) vs. `ESTADO_COMERCIAL_PROVEEDOR`
(nuevo: la relación comercial específica de la copropiedad con ese proveedor).

**12/12 pruebas propias verdes** (`tests/mantenimiento/proveedores-contratos.test.ts`) + regresión
de toda la serie MANT (MANT-0 a MANT-4, 89/89 tras el fix de la regresión propia arriba) — sin la
corrección, 88/89 con el único fallo siendo la propia regresión de este corte, nunca un bug
preexistente. `pnpm build`/`typecheck` en verde total (0 errores en todo el monorepo, incluido
`apps/web`); `pnpm exec eslint .` raíz en **89 errores, sin cambio** frente a la medición de D-56
(ninguno atribuible a este corte, verificado por grep de rutas); `supabase db lint --linked` en los
mismos 8 hallazgos preexistentes de siempre (7 funciones con `shadowed_variables`/variable no leída
+ 1 falso positivo de `contable_estado_financiero` sobre una tabla temporal). Verificado en
navegador de punta a punta contra JARDINES DE BABILONIA: vincular un tercero existente como
contratista, perfil de servicios (categorías/especialidades/estado comercial) guardado y persistente
tras recargar, evaluación con desglose por criterio visible (nunca solo el puntaje general), alta de
contrato con cuenta presupuestal hoja, transición borrador→vigente reflejada de inmediato en el
badge calculado del listado, comprometido/ejecutado mostrados con su fuente explícita, cláusula
agregada y visible. La cobertura de "activos cubiertos"/habilitación con archivo real no se pudo
verificar en navegador por falta de datos: JARDINES DE BABILONIA no tiene ningún activo registrado
todavía (fuera de alcance de este corte crear datos de MANT-0 en un tenant compartido) — ambos
caminos quedan cubiertos por las pruebas automatizadas de RLS/integración (pruebas 3/4/8/9 crean su
propio activo de fixture).

## D-58 — FIN-2: descomposición contable de la factura resuelta sin tocar `contable_hechos()`,
GOB-1 documentado en vez de implementado, y una regresión propia de arqueo encontrada probando la
ficha en el navegador contra un tenant real no responsable de IVA

**Contexto.** `FIN_02_factura_proveedor.md` §3.4 marca la integración con CO-3 como "la parte más
delicada del corte" e invita explícitamente a evaluar entre dos opciones: extender
`contable_hechos()` para que reconozca facturas, o resolver la descomposición con columnas simples
en la propia factura. Se confirmó con el usuario (`AskUserQuestion`) "extender `contable_hechos()`
(recomendado)" — pero al implementar se encontró una solución más quirúrgica que cumple la misma
intención sin tocar esa función: `contable_hechos()` sigue emitiendo un solo `(cuenta_debito,
cuenta_credito, monto)` por hecho de `presupuesto_ejecucion`, exactamente igual que para cualquier
otro egreso; son sus dos CONSUMIDORES — `contable_movimientos()` (proyección) y
`fn_contabilizar_periodo()` (materialización) — los que, al encontrar un hecho de
`presupuesto_ejecucion` enlazado a una factura (`finanzas_facturas_proveedor.presupuesto_
ejecucion_id`), delegan la expansión a `finanzas_factura_descomposicion(p_ejecucion_id)` en vez de
su expansión genérica de 2 líneas por signo. Cualquier otro hecho (sin factura asociada) sigue el
camino original sin cambios. Esto preserva "cero diferencias siempre"
(`contable_conciliacion_proyeccion`) porque proyección y materialización llaman a la MISMA función
fuente — nunca pudieron divergir por definición, en vez de por disciplina de mantenerlas
sincronizadas a mano. `finanzas_factura_descomposicion()` es también la fuente que consume la ficha
de la UI para mostrar el desglose antes de aprobar (`[id].vue`, sección "Descomposición contable").

**Dos columnas añadidas sobre el corte original, encontradas al preparar los fixtures de prueba —
nunca en producción.** `presupuesto_cuenta_id` (rubro presupuestal de la factura, resuelto por el
usuario al registrarla, distinto de `presupuesto_ejecucion_id` que solo se llena al aprobar) y
`centro_costo_id` (toda hoja de egreso del PUC sembrado exige centro de costo en su comprobante,
verificado contra la base real — mismo hallazgo que ya documentó `materializacion.test.ts` para sus
propios fixtures — sin la columna, `fn_finanzas_aprobar_factura` no tendría de dónde sacar el valor
que `presupuesto_ejecucion`/CO-2 exigen). Ambas nullable, mismo patrón incremental que
`activo_id`/`agrupacion_id`/`contrato_id` de cortes anteriores.

**`IVA_DESCONTABLE` como nuevo `EVENTO_CONTABLE` global expuso el radio de impacto real de agregar
un evento contable: no es local al corte.** `contable_parametrizacion_pendiente()` exige,
incondicionalmente, que TODO tenant tenga un `contable_cuenta_default` para CADA evento contable
global activo — lo use o no ese tenant en el periodo — así que un evento nuevo bloqueaba
`fn_contabilizar_periodo()` para cualquier tenant existente hasta sembrarle el mapeo. Se mapeó a la
cuenta `2505` ("Impuestos sobre las ventas (IVA)", clase 25 "Impuestos por pagar" en el PUC PH de
este repo — clase 24 aquí es "Obligaciones laborales", no el grupo de pasivos/impuestos del PUC
nacional estándar) dentro de `fn_instanciar_cuentas_default()`, con el mismo backfill retroactivo
para tenants existentes que ya documentó MANT-0 para `RECONOCIMIENTO_BIEN_DESAFECTADO`. Lección para
la próxima vez que un corte necesite un `EVENTO_CONTABLE` nuevo: el mapeo por defecto y su backfill
no son opcionales ni locales, son parte obligatoria del mismo corte.

**Regresión propia de arqueo (sum(débito) ≠ sum(crédito)) encontrada probando la ficha en el
navegador contra JARDINES DE BABILONIA (tenant real, `responsable_iva = false`), no por las 16
pruebas propias del corte, que pasaron 16/16 a la primera.** `finanzas_factura_descomposicion()`
debitaba solo `subtotal` a la cuenta de gasto pero acreditaba `total_neto_pagar` (`subtotal +
iva_generado`) a proveedores — cualquier factura con `iva_generado > 0` e `iva_descontable` parcial
o nulo (obligatorio para un tenant no responsable de IVA, `IVA_DESCONTABLE_INCONSISTENTE`) rompía la
invariante central de CO-3. Las 16 pruebas no lo detectaron porque siempre usaban
`iva_descontable = iva_generado` (recuperación total, donde la fórmula original coincide con la
correcta por casualidad). Corregido (`20260931210000`): el gasto debita `subtotal + (iva_generado -
iva_descontable)` — el IVA no recuperado es costo real de la copropiedad, no un activo. De paso se
cerró un hueco relacionado que el mismo bug expuso: nada impedía `iva_descontable > iva_generado`
(deducir más IVA del que la factura generó), lo que habría producido un gasto negativo con la
fórmula nueva — mismo código `IVA_DESCONTABLE_INCONSISTENTE`, misma familia de inconsistencia.
Pruebas 17-18 añadidas como regresión permanente. Lección: los 16 escenarios "obligatorios" del
corte no agotan el espacio de combinaciones reales — verificar en navegador contra un tenant con
configuración distinta a la de los fixtures (aquí, `responsable_iva = false`) encontró en minutos lo
que 16 pruebas verdes no cubrían.

**GOB-1 (`gobierno_organos`, atribución `aprobar_gasto`) no existe todavía — confirmado con el
usuario (`AskUserQuestion`, "solo documentar la propuesta") que este corte NO implementa ningún
código de gobierno.** `fn_finanzas_aprobar_factura()` registra una advertencia persistida e
inspeccionable (`finanzas_factura_advertencia`, nunca un `RAISE NOTICE` que PostgREST no expone al
cliente) cuando una factura supera el umbral de `finanzas_politica_aprobacion_pago` y
`gobierno_organos` no existe — nunca bloquea. Propuesta documentada para cuando GOB-1 exista:
agregar `'aprobar_gasto'` a `ATRIBUCION_ORGANO` y llamar `gobierno_organo_competente(tenant,
'aprobar_gasto', hoy)` desde el mismo punto, rechazando con `FACTURA_APROBACION_ORGANO_INCOMPETENTE`
si no hay órgano competente vigente.

**Política de aprobación de pago (`finanzas_politica_aprobacion_pago`) versionada
(`vigencia_estado_t`), mismo patrón que `mant_politica_aprobacion_ot`/`contable_politica_deterioro`:
guard de inmutabilidad dedicado (no el genérico), cero valores sembrados (marco principio #6),
único `vigente` por tenant vía índice único parcial.** Deliberadamente simplificada a un solo
`monto_umbral` — sin banda de criticidad ni categoría de gasto, mismo criterio y misma razón que
D-56 (`mant_politica_aprobacion_ot`): inventar una dimensión de segmentación aquí habría sido cerrar
una decisión de otro corte por la puerta de atrás.

**Retenciones (`finanzas_factura_retencion`) sin FK a un catálogo tributario que todavía no
existe (CO-8).** `concepto_id bigint not null` sin referencia, documentado en la migración; su
guard bloquea CUALQUIER inserción mientras `to_regclass('public.tributario_concepto_retencion') is
null` (`RETENCION_CATALOGO_TRIBUTARIO_AUSENTE`) — la factura se registra igual, declarando el hueco
en vez de fingir que no existe. La ficha de la UI muestra explícitamente "el catálogo tributario
(CO-8) todavía no existe en este tenant" en vez de una lista vacía sin explicación.

**18/18 pruebas propias verdes** (`tests/finanzas/facturas-proveedor.test.ts`, 16 obligatorias +
17-18 de regresión) — confirmado libre de la flakiness ambiental ya documentada del entorno (fetch
de Node contra Supabase remoto bajo carga sostenida: corridas repetidas consecutivas producen
timeouts de 5000ms rotando en tests distintos cada vez, nunca el mismo dos veces; una corrida
espaciada resulta siempre 18/18 limpia). `pnpm build`/`typecheck` en verde total en todo el
monorepo. `pnpm exec eslint .` raíz en **89 errores, sin cambio** frente a D-57 (0 atribuibles a
este corte — el archivo de test propio quedó en cero tras corregir dos `Number()` redundantes y una
aserción de tipo innecesaria, deuda introducida y corregida dentro del mismo corte, nunca dejada
para después). `supabase db lint --linked` en los mismos 8 hallazgos preexistentes de siempre.
Verificado en navegador de punta a punta contra JARDINES DE BABILONIA: alta de factura con
proveedor/cuenta presupuestal/centro de costo/documento soporte reales, desglose calculado en vivo,
transición borrador→registrada→en_revision→aprobada, descomposición contable visible y cuadrada tras
el fix de arqueo, advertencia de umbral no aplicable (política sin sembrar en este tenant),
retenciones mostrando el hueco de CO-8 explícitamente. Datos de prueba (factura, advertencia y
documento) borrados al cerrar; la fila de `presupuesto_ejecucion` que la aprobación creó no se pudo
borrar (`APPEND_ONLY`, SEC-14, por diseño) y queda como el único rastro visible de la verificación —
mismo criterio de inmutabilidad que ya aplica a toda la tabla, no una excepción para datos de prueba.

## D-59 — FIN-3: motor de conciliación bancaria confirmado como exclusivo de recaudo entrante (FK
pasiva propia, no modificación), tabla de umbral propia para el lote, "criticidad_proveedor"
omitida por no existir, y un bug real de secuencia de triggers encontrado por las 16 pruebas antes
de cualquier verificación manual

**Contexto.** `FIN_03_lotes_pago.md` §3.7 asume que "el motor de conciliación existente
(`extracto_bancario`/`extracto_linea`/`conciliacion_propuesta`) detecta la línea que corresponde"
a un pago de lote. La investigación de objetos existentes (agente de exploración, antes de
escribir el Plan del corte) confirmó que eso es estructuralmente imposible sin modificar ese
motor: `conciliacion_propuesta.inmueble_id` es `not null` — el motor completo está construido para
emparejar recaudo entrante contra un propietario, nunca contra un proveedor o un lote. Confirmado
con el usuario (`AskUserQuestion`, "FK pasiva + función propia de confirmación") replicar el único
patrón real que ya existe para este caso: `fondo_movimientos.extracto_linea_id`, una FK de solo
lectura sin conciliación activa (su propio comentario: "el fondo no tiene ni tendrá un motor de
conciliación propio"). `finanzas_lotes_pago.extracto_linea_id` sigue el mismo criterio;
`fn_finanzas_conciliar_lote()` es la única función que la asigna, nunca escribe en
`extracto_bancario`/`extracto_linea`/`conciliacion_propuesta` — el motor no se modificó. La regla
de oro del motor ("nunca aplica dinero por sí solo") se cumple porque la función exige una llamada
explícita del usuario, jamás automática.

**`criticidad_proveedor`, que pide `finanzas_facturas_pagables()`, no existe como concepto en el
repositorio — confirmado con el usuario (`AskUserQuestion`, "omitir la columna") que se declara el
hueco en vez de inventar la equivalencia.** MANT-1 solo modela criticidad de ACTIVOS
(`mant_criticidad`); MANT-5 solo modela evaluación de DESEMPEÑO de proveedor
(`mant_proveedor_evaluacion`, puntaje por criterio) — ninguna responde "qué tan grave es si este
proveedor no cobra a tiempo". Mismo criterio que FIN-2 usó para los huecos de CO-8/GOB-1.

**`finanzas_politica_aprobacion_lote` como tabla propia, no extensión de
`finanzas_politica_aprobacion_pago` (FIN-2)** — confirmado con el usuario (`AskUserQuestion`,
"tabla propia"). Sigue el patrón ya establecido de una tabla de política por decisión de negocio,
nunca compartida entre conceptos de la misma serie (tesorería, factura, lote son tres decisiones
distintas aunque compartan la forma versión/umbral/cero-sembrado).

**Un bug real de orden de ejecución de triggers, encontrado por las 16 pruebas del corte antes de
cualquier verificación manual (no en producción).** El diseño original de `guard_finanzas_lote_item`
creaba el compromiso bancario reservado DENTRO de su propio `BEFORE INSERT`, con
`origen_id = new.id` — pero `new.id` ya existe por el `DEFAULT` antes de que el trigger corra,
mientras que la FILA MISMA todavía no está escrita en el heap de `finanzas_lote_items` (un
`BEFORE INSERT` corre antes de que Postgres escriba la fila). `guard_finanzas_compromiso_bancario`
(que valida que `origen_id` resuelva a una fila real, cerrando la obligación de FIN-1) nunca
encontraba esa fila, así que TODO alta de ítem fallaba con `COMPROMISO_BANCARIO_ORIGEN_INVALIDO`
— 8 de las 16 pruebas en cascada desde este único punto. Corregido (`20260931310000`) moviendo la
creación del compromiso a un `AFTER INSERT` (`fn_finanzas_lote_item_crear_compromiso`, donde la
fila ya es visible), seguido de un `UPDATE` que rellena `compromiso_bancario_id` bajo la bandera de
sesión `aquila.creando_lote_item` — mismo mecanismo que `aquila.aprobando_factura`. Lección
reutilizable, complementa la de MANT-4/D-56 (que advertía sobre el caso inverso: un `AFTER INSERT`
con `UPDATE` de vuelta no se refleja en el `RETURNING` de la sentencia original): cuando un
`BEFORE INSERT` necesita crear una fila en OTRA tabla cuyo guard valida la existencia real de ESTA
fila por `id`, esa creación debe esperar al `AFTER INSERT` — un `BEFORE INSERT` nunca es visible a
una subconsulta de otra tabla, ni siquiera dentro de la misma transacción. Ninguna de las dos
lecciones sustituye a la otra: cuál trigger-timing usar depende de qué dirección necesita ver la
fila primero.

**16/16 pruebas propias verdes** (`tests/finanzas/lotes-pago.test.ts`) tras el fix — confirmado que
7 de los 8 fallos cascada desaparecieron con la única corrección; el octavo (prueba 9) fue un
hallazgo separado y menor en el propio fixture de prueba (leía `compromiso_bancario_id` del
`RETURNING` del INSERT original, que por el mismo motivo del bug de arriba tampoco lo refleja —
corregido releyendo la fila). Regresión de FIN-1 (12/12) y FIN-2 (18/18) confirmada sin hallazgos
atribuibles a este corte. `pnpm build`/`typecheck` en verde total. `pnpm exec eslint .` raíz en
**89 errores, sin cambio** frente a D-58 (cero atribuibles a este corte). `supabase db lint
--linked` en los mismos 8 hallazgos preexistentes de siempre. Verificado en navegador contra
JARDINES DE BABILONIA: lote creado con numero/anio reales asignados por el consecutivo
(`2026-00001`), disponibilidad de la cuenta bancaria mostrada en vivo (saldo/reservado/disponible
reales), botón "Pasar a programado" correctamente deshabilitado sin ítems, anulación con motivo
funcionando de punta a punta. No había ninguna factura aprobada en ese tenant para probar el
armado completo del lote (agregar ítem → aprobar → ejecutar → conciliar) — cubierto en su totalidad
por las 16 pruebas automatizadas, mismo criterio que MANT-5 documentó para su propio hueco de datos
reales.

## D-60 — GOB-0: el "Camino A" del corte quedó obsoleto por un rename que el propio spec no vio,
tenedor resuelto sin tabla nueva, AD-26 resuelto con Opción 1 (token), y el secreto de
`link_token.ts` no es reconstruible fuera de Deno con el `SUPABASE_SERVICE_ROLE_KEY` local

**Contexto.** `GOB_00_prerrequisitos_bloqueantes.md` §3.3 y `GOB_MARCO_OBLIGATORIO.md` §4.2 daban
por existentes `propietarios`/`inmueble_propietario` y pedían elegir entre crear `inmueble_tenedor`
(Camino A, análoga a `inmueble_propietario`) o una entidad `residentes` separada (Camino B). La
búsqueda de objetos existentes (regla operativa del marco, §4.3) encontró que esas tablas ya
habían sido renombradas y generalizadas DOS veces antes de que este corte empezara:
`20260820100000_personas_roles_flexibles.sql` las renombró a `personas`/`inmueble_persona_rol` con
rol flexible contra `PERSONA_PREDIO` (ya con arrendatario/inquilino/visitante/apoderado/codeudor
sembrados, y `locatario` añadido después en `20260830380000`), y **un día después**
`20260821100000_terceros_generalizacion.sql` renombró `personas` → `terceros` (la MISMA tabla que
ya usan proveedores y contratistas de MANT-5/FIN-2) y `inmueble_persona_rol.persona_id` →
`tercero_id`. El "Camino A" tal como el spec lo describía (tabla nueva) ya no podía construirse sin
violar la prohibición del marco de "no crear entidades que ya existen bajo otro nombre" — la
entidad de tenedor con vigencia histórica y varios simultáneos por inmueble YA EXISTÍA. Se
implementó una versión reducida: solo se agregó el código `usufructuario` a `PERSONA_PREDIO` (el
único hueco real frente al art. 18/59 — arrendatario/inquilino/locatario ya cubrían arriendo y
leasing) y dos funciones de resolución histórica, `fn_tenedores_vigentes()` y
`fn_propietario_responsable()`, sobre `inmueble_persona_rol`/`terceros` tal cual existen hoy. Cero
tablas nuevas en la Parte A. El primer intento de migración (`20260931330000`) se escribió contra
`personas`/`persona_id` (el nombre de un día antes del rename real) y falló en `db:push` con
`relation "public.personas" does not exist` — corregido en el momento contra el esquema real.

**AD-26 (Parte B), decidido por el usuario: Opción 1** (extender el mecanismo de token existente),
no Opción 2 (derogar AD-26, cuentas reales) ni Opción 3 (híbrida). El radio de explosión de la
Opción 2 se documentó tabla por tabla en `GOB_00_DECISION_AD26.md` — 574 usos de
`is_member()`/`has_role()` en 135 archivos de migración distintos (conteo real vía `grep`), más el
núcleo de identidad (`profiles`, `memberships`, `invitations`, `rate_limit_hits`) y el middleware
completo. Se implementó **solo** la Opción 1 en su versión mínima (§4.4 del spec: es la única que
no depende de la decisión): dos Edge Functions nuevas (`generar-enlace-documento`,
`ver-documento`) que reutilizan `supabase/functions/_shared/link_token.ts` **sin ninguna
modificación** — el mismo HMAC determinista que ya usan `ver-estado-cuenta` (D-27) y `ver-activo`
(MANT-0), aplicado ahora a `documentos` (la librería general de documentos del tenant, ya
generalizada desde `documentos_inmueble` en `20260822130000`, sin necesidad de ninguna migración
SQL para esta parte).

**Hallazgo de infraestructura de pruebas: el material HMAC de `link_token.ts` no es reconstruible
fuera de Deno usando el `SUPABASE_SERVICE_ROLE_KEY` del `.env` local**, pese a que
`supabase secrets list` confirma que no hay `ESTADO_CUENTA_LINK_SECRET` configurado (por lo que
`link_token.ts` debería derivar la clave de `SUPABASE_SERVICE_ROLE_KEY`) y que el valor JWT legacy
de ese secreto coincide, carácter por carácter, con el del `.env` local. El proyecto tiene además
el sistema nuevo de API keys (`sb_secret_*`/`sb_publishable_*`, visibles en
`supabase projects api-keys`) y no es observable desde fuera cuál de las dos ve
`Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` en el runtime desplegado — un intento de replicar el
HMAC en Node (`node:crypto`) para fabricar un token vencido sin esperar produjo una firma que el
propio `ver-documento` desplegado rechazó como `invalido` en vez de `vencido`. Resuelto sin
necesidad de conocer el secreto: `generar-enlace-documento` acepta `vigencia_dias: 0` (vencimiento
inmediato, válido también como revocación instantánea real, no solo como artificio de prueba) — el
viaje de red hasta la segunda invocación (`ver-documento`) ya deja el token real, correctamente
firmado, vencido por sí solo. **Lección reutilizable**: nunca reconstruir el HMAC de
`link_token.ts` fuera de Deno para pruebas — usar el flujo real de emisión con una vigencia
mínima/cero en su lugar.

**10/10 pruebas propias verdes** (`tests/gobierno/prerrequisitos.test.ts` — 8 exigidas por el spec
más 2 adicionales: flujo feliz de punta a punta de las dos Edge Functions, y constancia explícita
de cumplimiento D-24 ya que este corte no crea ningún enum). `pnpm build`/`typecheck` en verde
total. `pnpm exec eslint .` en la raíz (packages/tests/supabase) en verde — el lint de `apps/web`
falla con 6 errores preexistentes en 8 archivos que este corte no tocó (confirmado con
`git status --porcelain` sobre cada archivo: sin diff, deuda técnica ya presente en HEAD antes de
este corte, ver memoria `project_deuda_tecnica_preexistente`). Documento de decisión
`GOB_00_DECISION_AD26.md` entregado con las tres opciones y el radio de explosión tabla por tabla
de la Opción 2, cumpliendo el criterio de aceptación explícito del corte.

## D-61 — GOB-1: `persona_ref` resuelto como `tercero_id` (consecuencia directa de D-60), umbral
del art. 53 verificado (residencial nunca obligatorio), y un efecto colateral real sobre FIN-2/
FIN-3 encontrado por `pnpm test`, no en producción

**Contexto.** `GOB_01_organos_gobierno.md` §4.3 pedía resolver `gobierno_miembros.persona_ref`
como "propietario o tercero, según el camino elegido en GOB-0". Con D-60 ya resuelto (GOB-0: el
tenedor es un `tercero` con rol `PERSONA_PREDIO`, no una entidad separada), la pregunta del spec
ya no tiene dos ramas — solo hay `terceros`. `gobierno_miembros.tercero_id` referencia esa tabla
directamente, sin ninguna columna condicional. Un miembro del consejo (propietario o apoderado) y
un revisor fiscal (profesional externo) son, ambos, simplemente un `tercero`.

**Umbral del art. 53 verificado contra fuente primaria** (funcionpublica.gov.co/leyes.co,
cruzados con el mirror de secretariasenado.gov.co) en esta sesión, tal como el propio corte exigía
antes de implementar la validación: el consejo de administración es obligatorio **solo** para uso
comercial o mixto con más de 30 unidades privadas (parqueaderos y depósitos excluidos del
conteo) — para uso **residencial nunca es obligatorio**, sin importar el tamaño de la
copropiedad. Implementado en `gobierno_obligatoriedad_faltante()`, calculado en vivo (nunca
almacenado, marco §6.3), nunca bloqueante.

**Reglas de modelado explícitas, no obvias, documentadas en los propios guards**: (1) "rol de
dirección duplicado" (`ROL_ORGANO_DUPLICADO`) se interpretó literal — solo `presidente`/
`secretario`, no `vicepresidente`/`vocal`/`suplente` (un consejo de número impar ≥3 necesita
varios vocales); (2) el período del comité de convivencia (`COMITE_CONVIVENCIA_PERIODO_EXCEDIDO`)
se interpretó como PISO y TECHO legal a la vez (art. 58 par. 1: "para un período de un año"),
exigiendo `hasta` no nulo y ≤ un año — un período indefinido también incumple la ley, no solo uno
más largo; (3) "administracion" y "comite" (ad hoc) quedaron deliberadamente FUERA de la
restricción de unicidad que dispara `ORGANO_DUPLICADO_VIGENTE` — el spec solo pide unicidad para
asamblea_general/consejo_administracion/comite_convivencia/revisoria_fiscal, y extenderla a los
otros dos habría sido inventar una regla no pedida.

**Efecto colateral real sobre FIN-2/FIN-3, encontrado por `pnpm test` (no en producción, no
manualmente) al aplicar las migraciones de este corte**: ambos guards (`fn_finanzas_aprobar_
factura`, `fn_finanzas_aprobar_lote`) escribían su advertencia `*_APROBACION_ORGANO_INCOMPETENTE`
solo bajo `if to_regclass('public.gobierno_organos') is null` — una condición que este corte,
al crear esa tabla, vuelve permanentemente falsa. Ninguna de las dos funciones tenía un `else` que
llamara `gobierno_organo_competente()` (ese llamado era un comentario "cuando GOB-1 exista", nunca
código real) — así que, sin ningún cambio en FIN-2/FIN-3 mismos, ambas pasaron de "advertir
explícitamente que no se pudo verificar" a "no advertir absolutamente nada", en silencio. Resuelto
en `20260931400000` quitando la condición sobre `to_regclass` (la advertencia se inserta siempre
que se supera el umbral, ya que `ATRIBUCION_ORGANO` — sembrada por este mismo corte — sigue sin un
código para "aprobar un gasto"/"aprobar un lote", que FIN-2 propuso en su propio informe pero que
GOB-1 no tenía en su lista de siembra). Añadir esa atribución sería decidir algo de FIN-2 desde
GOB-1 — se deja fuera, documentado, no resuelto de más. La prueba 5 de
`tests/finanzas/facturas-proveedor.test.ts` (que verificaba, por `grep` de migraciones, que
`gobierno_organos` NO existiera — precondición de la prueba 6) se actualizó para verificar en su
lugar que `ATRIBUCION_ORGANO.aprobar_gasto` no existe, que es la razón real por la que el hueco
sigue abierto. **Lección reutilizable**: un corte que crea una tabla que otro corte usaba como
"todavía no existe" en una condición `to_regclass(...) is null` sin `else` real puede apagar por
completo — no solo cambiar — el comportamiento de esa otra función, en silencio; correr `pnpm test`
completo (no solo los archivos propios) es la única forma de detectarlo antes de declarar el corte
terminado.

**10/10 pruebas propias verdes** (`tests/gobierno/organos.test.ts` — 12 exigidas, 2 de ellas
desdobladas en 10b/10c para separar el caso ">30 unidades" del caso "residencial nunca
obligatorio", ambos necesarios para probar el umbral verificado del art. 53 sin ambigüedad).
`pnpm build`/`typecheck` en verde total (tras reconstruir `@aquila/shared` — el `Database`
regenerado por `db:types` no se ve reflejado en `tsc` hasta que el paquete se recompila, mismo
patrón ya conocido de cortes anteriores). `pnpm exec eslint .` en la raíz en verde. Regresión de
FIN-2 confirmada verde tras el fix de `20260931400000` (ver arriba); FIN-3 no tenía ninguna prueba
que ejercitara este camino, así que no requirió actualización de test, solo el fix de la
migración.

## D-62

GOB-2 (reunión, convocatoria, asistencia y poderes) — `fn_coeficiente_set_vigente()` nueva sobre
tabla existente, `gobierno_poderes` genuinamente nueva (nada reutilizable), decisión explícita de
NO construir el envío real de convocatoria, y un hallazgo real de inmutabilidad encontrado en
verificación manual en el navegador (no por las 14 pruebas automatizadas)

**Contexto.** El Plan del corte confirmó, con `grep` real contra todas las migraciones, que no
existe en el repo ninguna función que resuelva "el coeficiente_set vigente a una fecha dada" —
todo consumidor existente (`estado_cuenta`, `liquidacion`, etc.) solo filtra `estado='vigente'`
(el actual), nunca por fecha histórica. GOB-2 necesitaba exactamente eso para congelar
`gobierno_reuniones.coeficiente_set_id` al instalar de forma reproducible (marco §4.1: el quórum
de una reunión pasada no puede cambiar si los coeficientes cambian después). Se añadió
`fn_coeficiente_set_vigente(tenant_id, fecha)` — una función nueva sobre `coeficiente_sets`, tabla
ya existente, no una tabla nueva. La resolución del coeficiente de cada `gobierno_asistencia`
también llama a esta misma función de forma independiente (no a través de
`gobierno_reuniones.coeficiente_set_id`, que todavía es `null` cuando se registra asistencia antes
de instalar) — ambas resoluciones usan la misma fecha, así que siempre coinciden por construcción.

**`gobierno_poderes` es genuinamente nueva**: confirmado por grep que no existe ninguna tabla de
poder/apoderado en todo el repositorio — el único rastro previo es el código `apoderado` en
`lista_tipos.PERSONA_PREDIO` (una etiqueta de rol sobre un inmueble, no un poder), y el propio
comentario de GOB-0 (`fn_tenedores_vigentes`) que ya excluía `apoderado`/`codeudor` de la familia
tenedor a propósito ("representan o garantizan, no ocupan").

**Decisión explícita del usuario (Plan del corte, confirmada por `AskUserQuestion`)**: el corte
original pedía "reutiliza la infraestructura de envío existente... si la generalización resulta
invasiva, detente y repórtalo" — se confirmó que generalizar `acciones_cobranza_envios`/`_acuses`
sería invasivo (acoplados a cobranza: FK obligatoria a `acciones_cobranza`, columnas de mora), pero
en vez de detener el corte se implementó SOLO el modelo de datos propio
(`gobierno_convocatorias`/`gobierno_convocatoria_envios`, tal como el spec ya lo pedía en su forma
literal — una tabla plana, no un motor) — el envío real (Brevo) queda para cuando se necesite,
registrado manualmente desde la UI mientras tanto. Ninguna de las 14 pruebas obligatorias exige
disparo automático de email/SMS.

**Segregación de funciones confirmada explícitamente** (marco §5.5 lo exige antes de implementar):
`auxiliar` registra reunión/convocatoria/agenda/asistencia/poderes; instalar y cerrar (transiciones
con efecto jurídico) exigen rol `administrador` — mismo patrón que el cierre contable de CO-6 y
`ACUERDO_REQUIERE_ADMINISTRADOR` de cartera. Implementado dentro del propio guard (no vía RLS),
mismo patrón que `guard_acuerdo_transicion()`: `if (select auth.uid()) is not null then ... end
if` — se salta la verificación cuando no hay sesión real (fixtures con `service_role`), se aplica
siempre que hay un usuario autenticado real.

**Hallazgo real, encontrado en la verificación manual en el navegador contra JARDINES DE
BABILONIA, no por las 14 pruebas automatizadas**: al cerrar una reunión instalada, nada impedía
seguir registrando asistencia nueva, salidas, o poderes nuevos — `guard_gobierno_asistencia` y
`guard_gobierno_poder` validaban tenant/tenedor/coeficiente/soporte, pero nunca miraban el estado
de la reunión. Esto contradice el mismo principio de inmutabilidad que ya rige sobre la propia
`gobierno_reuniones` (`REUNION_CERRADA_INMUTABLE`) y, de forma más estricta todavía, sobre
`gobierno_agenda_puntos` (`AGENDA_INMUTABLE_TRAS_INSTALAR`). Corregido en `20260931480000`
(`ASISTENCIA_REUNION_CERRADA`/`PODER_REUNION_CERRADA`) + una prueba nueva (no de las 14 exigidas,
extiende la 12) + la UI oculta los formularios de alta cuando la reunión ya no está abierta.
**Lección reutilizable**: verificar el flujo COMPLETO en el navegador (crear → agendar → instalar
→ cerrar → intentar seguir operando), no solo cada transición aislada — el guard de cada tabla
hija puede validar todo lo suyo y aun así olvidar mirar el ciclo de vida del padre.

**Bug propio, corregido antes de correr ninguna prueba** (no un hallazgo de test): la primera
versión de `SEGUNDA_CONVOCATORIA_SIN_ANTECEDENTE` se modeló como un `CHECK constraint` plano cuyo
mensaje de Postgres nunca contiene el código `SCREAMING_SNAKE_CASE` que el resto del repositorio
usa (marco §5.4, `raise exception 'CODIGO: ...'`). Corregido en `20260931470000`, moviendo la
validación al guard.

**14/14 pruebas propias verdes** (`tests/gobierno/reuniones.test.ts`). Regresión de
`tests/governance`/`tests/gobierno`/`tests/liquidacion/coeficiente-set-reemplazo.test.ts` (45/45)
confirmada sin hallazgos — a diferencia de GOB-1, GOB-2 no crea ninguna tabla que otro corte
estuviera usando como "todavía no existe", así que no repite el tipo de regresión cruzada de D-61.

## D-63

GOB-3 (motor de quórum y votación) — el art. 46 de la Ley 675 de 2001 tiene diez numerales, no
siete como afirmaba el propio texto del corte; `gobierno_asistencia.inmueble_id` vuelto nullable
para asistencia de órgano (art. 54); segregación de funciones para abrir/cerrar votación y para
configurar `gobierno_regla_mayoria`; default-piso-legal cuando el tenant no configuró mayoría; y una
regresión de cobertura de pruebas encontrada al preparar la suite, no al ejecutarla

**Hallazgo legal, confirmado con el usuario antes de sembrar los datos**: `GOB_03_quorum_votacion.md`
afirma que el art. 46 tiene siete numerales. WebFetch directo contra dominios `.gov.co` volvió a
fallar por TLS (mismo problema documentado en CO-1/MANT-0/GOB-2). Se verificó cruzando 3 fuentes
secundarias independientes, incluyendo mirrors no-gov que sí respondieron (`leyes.co`,
`revistapropiedadhorizontal.com`), y las tres coinciden en que el artículo tiene **diez** numerales.
Confirmado explícitamente con el usuario vía `AskUserQuestion` antes de escribir la migración de
vocabulario — se sembraron los diez reales, no los siete del spec. Mismo precedente que D-60
(GOB-0): confiar en la fuente verificada, no en el texto desactualizado del propio spec del corte.
De los diez, solo dos (`expensas_extraordinarias`, `reforma_estatutos_reglamento`) quedan vinculados
a un código real de `ATRIBUCION_ORGANO` (GOB-1) — los ocho restantes quedan sin
`organo_competente_atribucion_id`, confirmado explícitamente con el usuario para no inventar códigos
nuevos a mitad de corte (mismo criterio que la deferencia de `aprobar_gasto` en D-61).

**`gobierno_asistencia.inmueble_id` nullable** (`20260931490000`, fix retroactivo sobre una tabla de
GOB-2): un miembro de un órgano tipo consejo (`calidad='organo'`) no posee necesariamente una unidad
— art. 54 exige contar miembros, no coeficientes. Se volvió la columna nullable, se añadió
`check (calidad not in ('propietario','apoderado') or inmueble_id is not null)` para seguir
exigiéndola donde sí corresponde, y `guard_gobierno_asistencia()` fuerza `coeficiente := 1` cuando
`calidad='organo'` — sentinel documentado como significativo SOLO en reuniones de consejo, nunca
sumado junto a coeficientes reales de asamblea (`gobierno_quorum()` y el cierre de
`guard_gobierno_votacion()` ramifican explícitamente por `lista_tipos.codigo` del órgano, no por
ningún flag nuevo).

**Segregación de funciones, confirmada explícitamente antes de implementar** (marco §5.5): abrir y
cerrar una votación exige `administrador` (mismo patrón que instalar/cerrar una reunión en GOB-2);
emitir un voto individual solo exige `auxiliar`. Configurar `gobierno_regla_mayoria` también exige
`administrador` — decisión propia (no una pregunta del Plan del corte), justificada porque
configurar mal una mayoría produce decisiones absolutamente nulas (art. 45), un riesgo mayor que
registrar asistencia o un poder.

**Default-piso-legal cuando el tenant no configuró `gobierno_regla_mayoria`**: en vez de dejar la
materia sin mayoría exigible, `guard_gobierno_votacion()` sintetiza un piso por `mayoria_tipo`
(`ordinaria`→50, `calificada_70`→70, `unanimidad`→100) y lo congela en `regla_aplicada` igual que si
existiera una fila real — "nunca se deja de aplicar la ley por falta de configuración".

**Regresión de cobertura encontrada al preparar la suite de GOB-3, no por sus propias pruebas**:
entre el cierre de GOB-2 y el inicio de este corte, `tests/gobierno/reuniones.test.ts` fue
refactorizado externamente (fixtures más ricos + una prueba nueva de segregación de administrador).
La prueba de la regresión `ASISTENCIA_REUNION_CERRADA`/`PODER_REUNION_CERRADA` (el propio hallazgo
de D-62) ya no estaba cubierta por ninguna de las 15 pruebas del archivo refactorizado. Restaurada
como prueba 16 con las convenciones de fixture actuales, en vez de reportar la pérdida sin
corregirla.

**Hallazgo real, encontrado en la verificación manual en el navegador, no por las 18 pruebas
automatizadas**: el formulario de asistencia de `[id]/index.vue` (GOB-2) seguía exigiendo un
inmueble incluso para `calidad='organo'`, pese a que este mismo corte volvió esa columna nullable
para ese caso exacto — el flujo de registrar un miembro de consejo quedaba roto en la UI aunque el
guard ya lo permitiera. Corregido ocultando el selector y omitiendo la validación cuando
`calidad === 'organo'`. Mismo tipo de lección que D-62: un cambio de esquema no siempre se propaga a
la UI de un corte anterior si nadie prueba el flujo completo en el navegador.

**Código de error sin registrar, encontrado por `tests/governance/error-codes-coverage.test.ts` en
la regresión completa, no por las pruebas propias**: `ASISTENCIA_INEXISTENTE`, usado por
`fn_gobierno_registrar_salida` (`20260931485000`, migración de una sesión paralela renombrada por
colisión de timestamp, ver más abajo), no estaba en `packages/shared/src/error-codes.ts` — la
gobernanza de Doc 14 no distingue quién escribió la migración. Registrado antes de cerrar el corte.

**Colisión de timestamp de migración con una sesión paralela** (riesgo operativo): otra sesión de
Claude Code activa en el mismo repositorio creó independientemente
`supabase/migrations/20260931470000_gob2_registrar_salida.sql`, reutilizando un timestamp que una
migración de fix propia de GOB-2 ya ocupaba. Diagnosticado por el error de `pnpm db:push`
(`duplicate key value ... schema_migrations_pkey`), confirmado que el archivo colisionante nunca se
había aplicado remotamente, y corregido renombrándolo a `20260931485000` (contenido intacto) más la
actualización de ambas copias de `MIGRACIONES_LEDGER.md`. **Lección reutilizable**: revisar
`ls supabase/migrations` inmediatamente antes de cada `db:push` durante un corte, no solo confiar en
la última fila del ledger — una sesión paralela puede adelantarse a esa fila.

**18/18 pruebas propias verdes** (`tests/gobierno/quorum-votacion.test.ts`); las 16 de
`tests/gobierno/reuniones.test.ts` (incluida la 16 restaurada) también verdes. Regresión completa de
`tests/governance`/`tests/gobierno`/`tests/liquidacion/coeficiente-set-reemplazo.test.ts`: 65/65
verdes (primera corrida 64/65 por el hallazgo de `ASISTENCIA_INEXISTENTE`, corregido y
reconfirmado). Verificación manual en navegador contra JARDINES DE BABILONIA, sobre una reunión real
de Consejo de Administración — confirma en vivo la rama de conteo por miembros (art. 54), el panel
de quórum, el registro de votos en tiempo real y el resultado desglosado citando la regla aplicada.

## D-64

GOB-4 (acta) — motor de días hábiles colombianos genuinamente nuevo (Ley 51 de 1983, "Ley
Emiliani"), el consecutivo del acta se asigna solo al suscribir (nunca al generar el borrador),
segregación de funciones confirmada (suscribir exige administrador), y una tabla nueva
(`gobierno_acta_entregas`) no listada explícitamente en el §4.1 del propio corte pero exigida por
su §4.5

**Motor de días hábiles**: búsqueda previa (grep en todo el repositorio) confirmó que no existía
ninguna función de días hábiles/festivos — el propio corte lo advertía explícitamente ("implementa
el plazo con una función de días hábiles explícita y probada, no con una resta de días
naturales"). Se implementó la Ley 51 de 1983 completa: `gobierno_pascua()` (algoritmo de
Meeus/Jones/Butcher — aritmética de calendario gregoriano estándar, no un hecho legal que
requiera fuente primaria) da la base para jueves/viernes santo (nunca se trasladan) y
Ascensión/Corpus Christi/Sagrado Corazón (+39/+60/+68 días desde Pascua, sí se trasladan al lunes
siguiente si no caen en lunes). De los 18 festivos totales, 6 son de fecha fija y nunca se
trasladan, 2 son de Semana Santa y tampoco se trasladan, y 10 (7 de fecha fija + los 3 basados en
Pascua) sí se trasladan — texto de la Ley 51 verificado cruzando 3+ fuentes secundarias
(`revistapropiedadhorizontal.com`, `actualicese.com`, `contodapropiedad.com`,
`copropiedades.com.co`; WebFetch directo contra `funcionpublica.gov.co`/`alcaldiabogota.gov.co`
volvió a fallar por TLS, mismo problema documentado en CO-1/MANT-0/GOB-2/GOB-3). El algoritmo se
verificó de forma independiente ANTES de escribir ninguna prueba: `gobierno_pascua(2026)` = 5 de
abril, y `gobierno_festivos_colombia(2026)` reproduce exactamente las 18 fechas de 2026 (incluidas
Ascensión 18 mayo, Corpus Christi 8 junio, Sagrado Corazón 15 junio) que dan calendarios de
referencia independientes — la prueba 10 de `tests/gobierno/acta.test.ts` usa un caso real que
cruza San José (trasladado) y Semana Santa 2026.

**El consecutivo del acta (`numero`) se asigna SOLO al suscribir** (`fn_gobierno_suscribir_acta`),
nunca al generar el borrador (`gobierno_generar_acta`) — mismo principio ya establecido por
`fn_contabilizar_comprobante` (CO-2, verificado por grep: el número se asigna ahí, no al crear el
comprobante en borrador). Esto resuelve la prueba 9 ("generar 5, descartar 2, suscribir 3 →
números 1, 2, 3") sin ninguna lógica especial: los 2 borradores descartados nunca ocuparon un
número porque nunca se suscribieron. `gobierno_actas` no tiene policy insert/update para
`authenticated` — toda escritura pasa por RPC `security definer`
(`gobierno_generar_acta`/`fn_gobierno_suscribir_acta`/`fn_gobierno_actualizar_narrativa`/
`fn_gobierno_vincular_documento_acta`), mismo criterio que `documentos` (que tampoco tiene policy
insert para `authenticated`, su escritura pasa por la Edge Function `subir-documento`).

**Segregación de funciones, confirmada explícitamente antes de implementar** (marco §5.5, Plan del
corte vía `AskUserQuestion`): suscribir un acta exige `administrador` — mismo patrón que
instalar/cerrar una reunión (GOB-2) y abrir/cerrar una votación (GOB-3); generar el acta y editar
la narrativa exigen solo `auxiliar`. El detalle nominal del voto por unidad se incluye por
defecto en el contenido generado (lectura literal del art. 47), también confirmado
explícitamente.

**`gobierno_acta_entregas` es una tabla nueva no listada en el §4.1 del propio corte**, pero su
§4.5 exige explícitamente "registro de cada solicitud de copia y de cada entrega... campo para
registrar una negativa y su motivo" — confirmado por grep que no existe ninguna tabla reutilizable
para esto en todo el repositorio. La primera entrega real (`tipo='entrega'`) publica el acta
(`estado='publicada'`) y congela `puesta_a_disposicion_at` — entregas posteriores no la vuelven a
mover, mismo principio de "se congela una sola vez" que rige el resto de la serie GOB-2/GOB-3.

**`designado_en_decision_id` de `gobierno_acta_verificadores` es `uuid` sin FK** — GOB-5
(decisiones) todavía no existe; mismo patrón ya establecido en `gobierno_miembros.decision_id`
(GOB-1, confirmado por grep antes de decidir el diseño, no una decisión unilateral nueva).

**Hallazgo de tipos, encontrado y corregido antes de la regresión**:
`documentosStore.subirDocumento` devuelve `DocumentoVigenteRow.id` tipado `string | null` (la
vista `v_documento_vigente` no garantiza `id` no nulo en el esquema generado por
`pnpm db:types`) — `fn_gobierno_vincular_documento_acta` exige un `string` no nulo; corregido con
una validación explícita (`if (!documento.id) throw`) antes de vincular, en vez de forzar el tipo
con `!`.

**14/14 pruebas propias verdes** (`tests/gobierno/acta.test.ts`). Verificado en navegador contra
JARDINES DE BABILONIA sobre una reunión de Consejo de Administración ya cerrada con datos reales
dejados por la propia verificación manual de GOB-2 (1 punto de agenda, 1 asistente con coeficiente
congelado `0.009893895`) — el acta se generó y suscribió correctamente a partir de esos datos de
producción reales, sin ningún ajuste, confirmando el motor de generación más allá de los fixtures
de prueba.

## D-65

GOB-5 (decisión y compromisos) — la decisión nace siempre `vigente` (nunca borrador, a diferencia
del acta de GOB-4), el estado de ejecución se calcula desde los compromisos sin ninguna columna
almacenada, y el refactor real de `presupuestos.acta_asamblea` → `decision_id` quedó completo con
UI incluida.

**La decisión nunca es borrador**: `gobierno_crear_decision()` solo puede nacer de una votación ya
`cerrada` y `resultado='aprobada'` (`DECISION_SIN_VOTACION_APROBADA`) — a diferencia del acta
(GOB-4), no hay una fase de borrador que descartar, así que el consecutivo
(`fn_gobierno_siguiente_numero_decision`) se asigna en el mismo INSERT, sin la separación
generar/suscribir. `acta_id` se resuelve automáticamente contra `gobierno_actas.reunion_id` en
ese mismo instante (null si el acta todavía no existe); si esa acta llega a suscribirse después,
la decisión pasa a ser inmutable en sus campos sustantivos (`DECISION_INMUTABLE_TRAS_ACTA`) —
**salvo** la transición de `estado`/`revoca_decision_id` que usa `gobierno_revocar_decision`, el
propio mecanismo de corrección que el spec exige ("corregir exige acta aclaratoria o decisión
revocatoria").

**Segregación de funciones, confirmada explícitamente antes de implementar** (marco §5.5, Plan
del corte vía `AskUserQuestion`): crear una decisión exige `auxiliar` (formalización
administrativa de una votación ya aprobada, mismo criterio que generar el acta en GOB-4);
revocarla exige `administrador` (acto de efecto jurídico, mismo criterio que suscribir el acta o
cerrar una votación). Las transiciones de un compromiso (avances, cumplido, bloqueado, cancelado)
exigen solo `auxiliar` — es ejecución operativa de una decisión que ya pasó el filtro de
administrador al crearse, sin un segundo nivel de aprobación.

**`responsable_ref` del compromiso** (spec: "miembro de órgano, tercero, o la administración") se
modeló como dos columnas nulables con exclusión mutua (`responsable_miembro_id`/
`responsable_tercero_id`) en vez de una referencia polimórfica de un solo campo — confirmado por
grep que ningún `_ref` existente en el repositorio (`destinatario_ref`, `otorgante_ref`,
`asistente_ref`) es polimórfico, todos apuntan a un solo tipo. Ambas columnas null = "la
administración" (art. 51), sin entidad propia que rastrear.

**Estado de ejecución genuinamente calculado, no almacenado** (marco §6.3):
`gobierno_decision_ejecucion()` agrega desde `gobierno_compromisos` en cada llamada — total,
cumplidos, en_progreso, bloqueados, vencidos (derivado de `fecha_limite < hoy` con estado no
terminal, nunca una columna), cancelados, porcentaje de avance (excluye cancelados del
denominador — decisión de diseño documentada como pregunta abierta, el spec no fija el
tratamiento exacto), semáforo y `estado_ejecucion`. El único parámetro numérico del corte —
cuántos días antes es "próximo a vencer" — no lo fija ninguna norma → REMISIÓN AL REGLAMENTO
(marco §3): `gobierno_politica_semaforo`, mismo patrón versionado (`vigencia_estado_t` + guard de
inmutabilidad dedicado + `fn_..._vigente()`) que `mant_politica_aprobacion_ot`/
`finanzas_politica_aprobacion_pago`, con default de 5 días hard-coded cuando no hay fila vigente.

**Enlaces salientes — solo lo que existe hoy**: `presupuestos.decision_id` (refactor real de
`acta_asamblea`, spec §4.5, con guard `PRESUPUESTO_ORIGEN_APROBACION_DUPLICADO` si se pueblan las
dos fuentes a la vez — UI de "Activar presupuesto" actualizada con un toggle) y
`fondo_autorizaciones.decision_id` (sin guard de exclusión: esa tabla es append-only, cada fila
nace una sola vez). `contable_rendicion_cuentas.decision_id` y
`contable_castigo_cartera.decision_id` quedaron fuera — `CO_09_PARCHE_FRONTERA_GOBIERNO.md` los
asigna explícitamente a CO-9 (título literal de su §3: "Cambios concretos a aplicar en CO-9") y
`contable_rendicion_cuentas` ni siquiera existe todavía (confirmado por grep). Se documenta como
inconsistencia, no bloqueante, que ese mismo parche nombra las tablas de este corte como
`public.decisiones`/`public.reuniones` (sin prefijo) — redactado antes de fijarse la convención
`gobierno_*` en GOB-1..4; CO-9 deberá referenciar los nombres reales.

**Retro-FK conectadas**: `gobierno_miembros.decision_id` (GOB-1) y
`gobierno_acta_verificadores.designado_en_decision_id` (GOB-4) — ambas documentadas
explícitamente en su corte original como "sin FK hasta que GOB-5 exista, se conecta cuando
exista" (verificado por grep antes de escribir la migración, no una decisión unilateral nueva).

**Dos fixes encontrados durante las pruebas propias, antes de la regresión**:
`gobierno_crear_decision`/`gobierno_revocar_decision` comprobaban `has_role()`
incondicionalmente, lo que bloqueaba las propias llamadas de `service_role` (tests, scripts) —
corregido replicando el patrón ya usado en `gobierno_generar_acta`/`fn_gobierno_suscribir_acta`
(GOB-4): `if (select auth.uid()) is not null and not has_role(...)`.
`gobierno_compromiso_avances.registrado_por` se creó `not null`, pero el guard que lo estampa
desde `auth.uid()` deja esa columna en null bajo `service_role` — corregido con el mismo criterio
ya establecido en `20260822360000` (`caso_juridico_actuaciones.registrada_por`): nullable, la
garantía vive en el trigger.

**13/13 pruebas propias verdes** (`tests/gobierno/decisiones.test.ts`). Verificado en navegador
contra JARDINES DE BABILONIA de punta a punta contra datos reales: una votación aprobada real
(dejada por la propia verificación manual de GOB-3) → "Crear decisión" → decisión real `1/2026` →
compromiso real → guard `COMPROMISO_CUMPLIDO_SIN_EVIDENCIA` disparado en pantalla → avance con
evidencia → `cumplido` → ejecución recalculada a `cumplida`/100% sin ningún job → activación de un
presupuesto real en borrador respaldada con esa misma decisión (toggle nuevo en la UI) →
`gobierno_decision_efectos()` mostrando ese presupuesto en el detalle de la decisión —
trazabilidad bidireccional confirmada, no solo en los fixtures de prueba.

## D-66

GOB-6 (convivencia y régimen sancionatorio, Ley 675 art. 58-60) — marco §2: "el único corte de
toda la serie donde un error del software produce una violación de derechos fundamentales". Los 5
guards de `gobierno_imponer_sancion()` son el corte; todo lo demás reutiliza mecanismos ya
cerrados en otros cortes, sin inventar ninguno nuevo.

**Catálogo de clases de sanción, global y taxativo por construcción**: `gobierno_clase_sancion`
(sin `tenant_id`, mismo criterio que `gobierno_materia_decision` de GOB-3) sembrado con
exactamente las tres del art. 59 (`publicacion_infractores`/59.1, `multa`/59.2, `restriccion_uso`/
59.3), copiadas textualmente con `numeral_articulo` y `fundamento_normativo_id`. El trigger
`guard_gobierno_clase_sancion()` que bloquea cualquier insert/update/delete se crea **después**
del `do $seed$` que siembra las tres filas — mismo orden que `MATERIA_LEGAL_INMUTABLE` (GOB-3):
crearlo antes bloquearía el propio seed. `SANCION_CLASE_NO_EXTENSIBLE` rechaza incluso a
`service_role` — "el sistema no debe ofrecer siquiera la posibilidad" de una cuarta clase (marco,
guard adicional no numerado de la tutela) se implementa aquí, no como validación de aplicación.

**Infracciones tipificadas, cero precargadas**: `gobierno_infracciones` es por-tenant, sin ninguna
fila sembrada — cada copropiedad tipifica desde su propio reglamento. `reglamento_referencia not
null` con guard que rechaza vacío (`INFRACCION_SIN_TIPIFICACION`): sin cita del reglamento, el
sistema no permite ni crear la infracción, porque la sanción resultante sería ilegal.
`clases_sancion_permitidas text[]` (no una tabla puente) se valida contra el catálogo global fila
por fila en el guard (`INFRACCION_CLASE_SANCION_INVALIDA`) — Postgres no soporta FK sobre
elementos de un array.

**El expediente nace numerado, nunca borrador** (a diferencia del acta de GOB-4, igual que la
decisión de GOB-5): `gobierno_reportar_expediente()` asigna `numero`/`anio` en el mismo INSERT vía
`fn_gobierno_siguiente_numero_expediente`, mismo patrón `on conflict ... do update ... returning`
que el resto de consecutivos de la serie GOB. `propietario_responsable_ref` se resuelve una sola
vez, a `fecha_hechos`, vía `fn_propietario_responsable()` (GOB-0) cuando el infractor no es él
mismo el propietario — congelado igual que `gobierno_asistencia.coeficiente` (GOB-2):
reproducible aunque la propiedad cambie después. `gobierno_expediente_actuaciones` es append-only
(`forbid_mutation()` genérico) y **es el mecanismo de avance**: `gobierno_registrar_actuacion()`
inserta la fila Y actualiza `gobierno_expedientes_convivencia.etapa` al mismo valor en el mismo
acto — no hay un UPDATE de etapa separado. Las etapas `reportado`/`sancion_impuesta`/`archivado`
están **reservadas** (`ACTUACION_ETAPA_RESERVADA`): solo las crean `gobierno_reportar_expediente`/
`gobierno_imponer_sancion`/`gobierno_archivar_expediente` respectivamente, nunca la función
genérica de registro.

**Los 5 guards de la tutela, todos en `gobierno_imponer_sancion()`, auditables en un solo lugar**:
(1) `SANCION_SIN_REQUERIMIENTO_PREVIO` — exige una actuación `requerimiento_escrito` ya
registrada; (2) `SANCION_SIN_DEBIDO_PROCESO` — exige una actuación `descargos` ya registrada,
**aunque el infractor no haya respondido** (se exige la oportunidad, no la respuesta — prueba 2
del corte lo verifica explícitamente); (3) `SANCION_ORGANO_INCOMPETENTE` — reconsulta
`gobierno_organo_competente(tenant, 'imponer_sanciones', fecha_de_la_reunión_de_la_decisión)` de
GOB-1; el comité de convivencia **nunca** puede tenerla, bloqueado desde GOB-1
(`ATRIBUCION_PROHIBIDA_COMITE_CONVIVENCIA`) — este corte no necesitó ni una línea de código extra
para esa regla, cae gratis de reutilizar la función; (4) `SANCION_CLASE_NO_PERMITIDA` — la clase
debe estar en el catálogo del art. 59 Y entre las que la infracción tipificada permite; (5)
`MULTA_EXCEDE_TOPE_INDIVIDUAL`/`MULTA_EXCEDE_TOPE_ACUMULADO` — cada multa ≤ 2× las expensas
necesarias mensuales del infractor a la fecha de imposición (comparación estricta `>`, así que
exactamente 2× sí pasa), la suma histórica de ese mismo infractor en el tenant ≤ 10×. Guard
adicional no numerado pero igual de vinculante: `SANCION_BIEN_COMUN_ESENCIAL` — la clase
`restriccion_uso` exige que la zona común no esté marcada `es_esencial` (columna ya agregada a
`zonas_comunes` por una migración de otra sesión, `20260830300000`, reutilizada sin cambios).

**Base del tope, configuración explícita nunca inferida** (spec §4.5, pregunta abierta para
abogado/contador): `gobierno_config_expensa_necesaria` (tenant_id + concepto_id) es la única
fuente de qué conceptos cuentan como "expensas necesarias mensuales" — sin al menos una fila,
`fn_gobierno_expensa_necesaria_mensual()` falla explícito con `SANCION_BASE_EXPENSA_NO_CONFIGURADA`
en vez de asumir cero o adivinar por nombre de concepto.

**La multa se materializa vía `novedades`, cero mecanismo de cobro paralelo** (spec §4.6, AD-33):
`TIPO_NOVEDAD.sancion` ya estaba sembrado desde el inicio del proyecto
(`20260814180000_seed_catalogo_referencia.sql`), y una migración de otra serie
(`20260830240000_novedad_tipo_cuenta.sql`) usa textualmente "una Sanción siempre se explica bajo
Sanción por inasistencia" como su propio ejemplo — anticipación arquitectónica real de este caso
de uso, confirmada por grep antes de escribir una sola línea. `gobierno_imponer_sancion()` inserta
la novedad y llama `fn_aprobar_novedad()` (mismo camino que cualquier otra novedad aprobada) —
`fn_aprobar_novedad` recibe `p_actor_id` explícito (no confía en `auth.uid()`, porque se invoca
también desde `service_role`), mismo criterio replicado aquí: `v_actor := coalesce((select
auth.uid()), p_actor_id)`.

**Segregación de funciones, confirmada explícitamente antes de implementar** (`AskUserQuestion`):
imponer una sanción exige `administrador` — el acto de mayor peso de toda la serie GOB (marco §2),
no una formalización administrativa como crear una decisión en GOB-5. Registrar actuaciones del
expediente (requerimiento, descargos, conciliación) exige solo `auxiliar` — el usuario respondió
"ambos" (no una de las dos opciones ofrecidas) a quién puede registrarlas, interpretado
correctamente como "los dos roles deben poder": exigir `auxiliar` ya lo garantiza, porque
`administrador ⊇ auxiliar` vía `has_role()`.

**Cero migraciones de corrección**: las 7 migraciones (`20260931710000`-`20260931770000`)
aplicaron limpias a la primera — las dos lecciones de GOB-5 (`if (select auth.uid()) is not null
and not has_role(...)` para que `service_role` bypasse el check de rol; columnas
`registrado_por`/`reportado_por` nullable desde el `create table` inicial, nunca `not null`) se
aplicaron proactivamente desde el principio en vez de corregirse después.

**14/14 pruebas propias verdes** (`tests/gobierno/convivencia-sanciones.test.ts`). Tres hallazgos
de esquema real durante la construcción de los fixtures, encontrados por `db push`/pruebas antes
de cualquier verificación manual: `conceptos.tipo_base` fue eliminada en una migración posterior
(`20260829100000_conceptos_drop_tipo_base.sql`) — la tabla real exige `modo_calculo`/`modo_valor`/
`alcance` (con sus propios constraints de coherencia), no el esquema original de PC-3;
`zonas_comunes.tipo` (enum) fue reemplazada por `tipo_id` (FK a `lista_tipos`, familia
`TIPO_ZONA_COMUN`) en `20260814160000`; `gobierno_quorum()` (GOB-3) ramifica por tipo de órgano —
`consejo_administracion` cuenta miembros vigentes vía asistencia `calidad='organo'`, sin
coeficientes, mientras el resto (incluida `comite_convivencia`) sigue el camino de coeficientes de
asistencia `propietario`/`apoderado`; los fixtures de escenario con consejo tuvieron que
diferenciar ambas ramas. **Lección reutilizable**: `fn_gobierno_expensa_necesaria_mensual()` (y
por tanto el guard 5 de la multa) resuelve el periodo con `current_date` real del servidor, no con
una fecha fija del test — cualquier fixture de expensa/periodo debe usar la fecha real de hoy
(`new Date()`), no un mes hardcodeado, o falla con `SANCION_PERIODO_INEXISTENTE`.

UI en `apps/web/app/pages/gobierno/convivencia/index.vue` (listado de expedientes + panel de
catálogo de infracciones + configuración de expensa necesaria, en pestañas) y
`apps/web/app/pages/gobierno/convivencia/[id].vue` (línea de tiempo con el artículo que exige cada
bloqueo, propuesta de sanción con vista previa de tope/acumulado/órgano competente/tipificación
antes de imponer — spec §4.7). Verificado en navegador contra JARDINES DE BABILONIA con datos
reales: infracción real creada con clase permitida "multa", expediente real `1/2026` reportado
sobre INM-1001/Ana Gómez, actuaciones reales de requerimiento escrito y descargos registradas con
la etapa avanzando en pantalla y el bloqueo mostrando el artículo correcto en cada paso hasta
"el debido proceso está completo". El intento real de imponer sanción (llamado directamente contra
Supabase con la sesión autenticada real del usuario, no `service_role`, porque el selector de
clase de sanción de Reka UI resultó imposible de accionar de forma fiable con las herramientas de
automatización de navegador disponibles en esta sesión — limitación de la herramienta, no del
código) confirmó `SANCION_ORGANO_INCOMPETENTE` exactamente como se espera: el único órgano/decisión
vigente de ese tenant no tiene la atribución `imponer_sanciones`. No se modificaron los datos
reales del tenant para forzar el camino de éxito (habría exigido otorgar una atribución falsa a un
órgano real). El camino de éxito completo (multa exitosa con cargo enlazado, ambos topes,
competencia del órgano) queda cubierto exhaustivamente por las pruebas 4, 5, 11 y 12 contra un
tenant de prueba desechable.

**Preguntas para el abogado** (`GOB_06_INFORME.md`): plazo de impugnación del art. 62 (la etapa
`impugnacion` existe en el enum pero su mecánica es GOB-7); qué conceptos cuentan exactamente como
"expensas necesarias mensuales" (mientras tanto, configuración explícita por tenant, nunca
inferida); cómo detectar automáticamente que una infracción es pecuniaria (`es_no_pecuniaria` es
hoy una declaración manual de quien tipifica); si el comité de convivencia puede intervenir en
todas las etapas del expediente o solo antes del requerimiento escrito.

**Addendum — Supabase local montado durante el cierre, D-08 finalmente resuelto de punta a
punta**: a pedido del usuario se instaló Docker Desktop + WSL2 + Supabase CLI (máquina de 16 GB,
perfil recortado a db/auth/api/storage/edge_runtime — realtime/studio/analytics/smtp local
apagados). Las 233 migraciones existentes aplicaron limpias en un Postgres recién creado —
primera vez que se valida "`create database` → aplicar migraciones → llegar al esquema esperado"
de punta a punta (24 §17). La regresión completa bajó de ~3600s a ~485s. Al correr `pnpm test`
completo contra esa base fresca (algo que ninguna sesión anterior había hecho, por el costo previo
de tiempo) salieron 27 fallas en 10 archivos ajenos a GOB-6, con 5 causas reales investigadas una
por una (nunca descartadas como "ruido del entorno"): (1) `create_tenant()` había perdido
`tenant_predeterminado_id` desde una migración de MANT-2 que reprodujo su cuerpo desde una copia
desactualizada — bug real preexistente, confirmado también en el proyecto remoto con
`pg_get_functiondef` antes de escribir el fix, corregido en ambos con `20260931780000`; (2)
`configurar-pasarela/deno.json` no mapeaba `@aquila/financial-kernel`/`decimal.js`, tumbando el
worker del edge-runtime local; (3) secretos de Edge Functions (`BREVO_WEBHOOK_TOKEN`,
`CARTERA_CRON_TOKEN`, etc.) no llegaban al contenedor local sin su propio `supabase/functions/.env`
(gitignored); (4) `error-codes-coverage.test.ts` no toleraba un archivo suelto en
`supabase/functions/` (el `.env` del punto 3); (5) `cartera-envio-evidencia.test.ts` tenía una
`p_fecha_corte` fija en el pasado (mismo patrón de bug que FIN-1/D-54) y una aserción de
`plantilla_version` desactualizada desde que PRQ-CAR-021 se implementó. Regresión final:
1711/1713 verdes — los 2 fallos restantes (`gc-001`) son estructurales, dependen de datos reales
del proyecto remoto nunca capturados como seed, y nunca podrán pasar contra una base migrada desde
cero. Detalle completo en `GOB_06_INFORME.md` §7.

## D-67

GOB-7 (impugnación, Ley 675 art. 2 num. 5, 45, 49, 60, 62) — el corte pequeño que el prompt
original omitió por completo: sin impugnación, una sanción impuesta por el sistema es atacable por
esa sola razón (marco/spec §2). AQUILA registra la impugnación, calcula su plazo y aplica el efecto
mecánico de una resolución YA TOMADA por el juez/órgano competente — nunca resuelve (spec §2, §5).

**Entidad única para los dos objetos impugnables**: `gobierno_impugnaciones` con
`objeto_tipo` (`decision`/`sancion`) gatillando exactamente una de `decision_id`/`expediente_id`
(check `gobierno_impugnaciones_objeto_check`, sin excepción ni para `service_role`). Para
`objeto_tipo='sancion'` la FK resuelve sobre el **expediente** de convivencia (GOB-6), no sobre
`gobierno_sanciones` directamente — así lo pide el spec §4.1 literalmente y así lo modeló el corte:
el expediente es el objeto que efectivamente transiciona de etapa.

**Los dos plazos legales (art. 49 y art. 62) quedaron parametrizados, nunca hardcodeados**:
`gobierno_parametro_impugnacion`, cero filas precargadas por tenant (mismo criterio que
`gobierno_config_expensa_necesaria` de GOB-6), con `fundamento_normativo_id` **nullable a
propósito** — su ausencia solo advierte (`IMPUGNACION_PLAZO_SIN_FUNDAMENTO`, visible en UI), nunca
bloquea; sin ninguna fila configurada para el `objeto_tipo`, en cambio, sí falla explícito
(`IMPUGNACION_PLAZO_NO_CONFIGURADO`) porque ahí falta el dato completo, no solo su respaldo legal.
`plazo_limite` se calcula con `gobierno_sumar_dias_habiles()` de GOB-4, reutilizada tal cual —
prueba 7 lo confirma sobre el mismo caso con festivos (San José + Semana Santa 2026) ya verificado
independientemente para el acta de GOB-4. Esta clasificación no encajó limpio en las 4 categorías
del marco §3 (piso/techo/lista cerrada/remisión al reglamento) — señalado como posible vacío del
marco en el Plan del corte, resuelto siguiendo la instrucción más específica del propio spec §3.

**Hallazgo real de investigación durante el cierre** (no una implementación, una verificación
parcial): `suin-juriscol.gov.co` resultó inalcanzable en esta sesión por un error de certificado
SSL. Investigando contra `alcaldiabogota.gov.co` (fuente gubernamental secundaria, espeja el Diario
Oficial, no está en la lista literal de fuentes primarias del marco §2) salió un hallazgo
sustantivo: el art. 62 fija **un (1) mes** desde la comunicación de la sanción (resolviendo la
discrepancia 1-2 meses que el spec señalaba abierta), y el art. 49 **no fija ningún plazo propio**
en su texto vigente — el inciso que remitía al art. 194 del Código de Comercio fue **derogado desde
2014** por la Ley 1564 de 2012 (CGP), que hoy gobierna ese trámite judicial (fuera de alcance,
spec §5). Ninguno de los dos hallazgos se marcó como validado en `fundamento_normativo.fecha_
vigencia` — no se alcanzó la fuente primaria exacta que el marco exige, así que el sistema sigue
sin bloquear por vencimiento. Detalle completo, con la cita textual de ambos artículos, en
`GOB_07_INFORME.md` (primera sección, obligatoria por el propio spec §7).

**La reversión de la multa reutiliza el mecanismo de ajuste de GOB-6, no inventa uno nuevo**:
`resultado='revocada'` sobre una sanción de multa marca `gobierno_sanciones.vigente_hasta = hoy`
(columna que ya existía) y genera una `novedad` nueva `tipo='CREDIT'` (monto negativo, AD-30) +
`fn_aprobar_novedad()` — exactamente el mismo camino que GOB-6 usó para materializar la multa
original, nunca se borra ni se toca el cargo original (append-only). Coordina con CO-3 sin ningún
enganche adicional porque pasa por el mismo punto único de materialización financiera (AD-33).

Segregación de funciones confirmada (Plan del corte, mismo criterio que GOB-5/GOB-6): presentar la
impugnación y registrar actuaciones (`en_tramite`/`desistida`) exige `auxiliar` (formalización
administrativa); resolver (`gobierno_resolver_impugnacion`, el acto con efecto jurídico real —
revierte cargo, cambia estado de decisión/expediente) exige `administrador`.

12/12 pruebas propias verdes (`tests/gobierno/impugnacion.test.ts`), corridas contra **local y
contra el proyecto remoto real** tras `pnpm db:push` (D-08). Regresión completa: 1723/1725 —
exactamente 12 más que la línea base de GOB-6, mismos 2 fallos estructurales de `gc-001`, cero
fallas atribuibles a este corte. **Limitación de entorno, documentada con transparencia y no
silenciada**: la verificación en navegador con sesión autenticada real no pudo completarse — tanto
`dev-login` como el login por contraseña fallaron con "Invalid login credentials"/JWT no
reconocido, pese a que la MISMA combinación de credenciales autenticó correctamente vía `curl`
directo contra el mismo GoTrue local (confirmando que no es un problema de GOB-7 ni de
credenciales, sino un efecto colateral probable de los múltiples `supabase stop`/`start`/
`db reset` de este cierre sobre el contenedor de auth). La UI se verificó por typecheck + lint +
revisión de código contra el patrón ya probado de GOB-5/GOB-6, no por interacción real en el
navegador — detalle completo en `GOB_07_INFORME.md` §5.

## D-68

GOB-8 (atención al propietario/residente y consulta sin sesión) — construido estrictamente sobre
**AD-26 Opción 1** (GOB-0): sin portal, sin cuenta para propietarios/residentes. Toda solicitud la
registra la administración (rol auxiliar); el propietario/residente solo **consulta** por un enlace
de token generalizado por inmueble (§4.4), nunca escribe, con **una única excepción angosta y
explícita**: la encuesta de satisfacción (§4.5).

**`solicitudes` sin prefijo `gobierno_`, a propósito**: es transversal (mismo criterio que
`documentos`/`novedades`), escala hacia convivencia (GOB-6), decisión (GOB-5) y agenda (GOB-2) —
no es un concepto exclusivo del dominio de gobierno. Nace numerada (nunca borrador) y avanza
exclusivamente por `gobierno_registrar_actuacion_solicitud()` — a diferencia de GOB-6/GOB-7, aquí
una actuación puede registrarse **sin** cambiar de estado (`p_estado_nuevo` puede repetir el actual):
es la forma de dejar una respuesta o nota sin mover la FSM, algo que ninguno de esos dos cortes
necesitaba.

**Prefijo de error `ATENCION_`, no `SOLICITUD_`, deviación deliberada del spec §4.1**: el módulo
Fondos (`fondo_solicitudes_uso`, GAP-22/D-36) ya registró 9 códigos `SOLICITUD_*` para un concepto
de dominio completamente distinto — incluyendo, literalmente, `SOLICITUD_ESTADO_TERMINAL`. Reutilizar
el mismo prefijo habría colisionado en el nombre exacto y quedado ambiguo para el resto del sistema.
Se prefirió el prefijo nuevo aunque el spec sugiriera textualmente `SOLICITUD_CIERRE_SIN_RESPUESTA`
(renombrado a `ATENCION_CIERRE_SIN_RESPUESTA`) — documentado en `GOB_08_INFORME.md`.

**SLA parametrizable, calculado en caliente, nunca persistido como booleano**: `solicitud_sla`
(cero filas precargadas — cada copropiedad define sus tiempos) + `gobierno_sumar_horas_habiles()`
(grano-hora, nueva de este corte, reutiliza `gobierno_es_dia_habil()` de GOB-4 tal cual — NO
reutiliza `gobierno_sumar_dias_habiles`, que es grano-día). `sla_vence_at` es un timestamp que SÍ se
almacena y se recalcula en momentos concretos (creación, entrada/salida de `en_espera`) — lo que el
marco §6.3 prohíbe es persistir un booleano "vencida" que un cron tendría que mantener sincronizado,
no el timestamp en sí. **Pausa/reanudación del reloj** (patrón genuinamente nuevo en el repo — ni
siquiera los acuerdos de pago de cartera lo tienen): `en_espera_desde` registra el momento de
entrada; al salir, `sla_vence_at` se desplaza exactamente el tiempo real transcurrido
(`sla_vence_at + (now() - en_espera_desde)`), calculado dentro de
`gobierno_registrar_actuacion_solicitud()` antes del UPDATE. La etiqueta "buena práctica, sin base
legal" (spec §2) no encajó en ninguna de las 4 categorías del marco §3 (piso/techo/lista cerrada/
remisión al reglamento) — mismo vacío que GOB-7/D-67 ya había señalado para su propio caso, resuelto
igual: una sola fila de `fundamento_normativo` (`tipo='otra'`,
`referencia='gob8_buena_practica_sin_base_legal'`), señalado en el Plan del corte.

**La encuesta de satisfacción (§4.5) es la única excepción de escritura a la regla "consultar no es
interactuar" (§4.4)**, y se implementó como una excepción angosta y controlada, no como un
relajamiento general: `solicitud_encuesta` (una fila por solicitud, `unique(solicitud_id)`,
append-only, calificación 1-5 + comentario opcional) no tiene política de insert/update para
NINGÚN rol — ni siquiera `authenticated` — su única puerta es la Edge Function
`responder-encuesta-solicitud` (service_role), que exige la solicitud `resuelta`/`cerrada` y valida
el mismo token de consulta por inmueble que `ver-inmueble`. La prueba 10 (que exige que un insert
directo a `solicitudes` falle para el consultante anónimo) sigue intacta — no se relajó ninguna
política existente para permitir esto.

**`atencion_tokens_consulta` es la generalización con estado del mecanismo stateless de GOB-0/D-27**:
el HMAC de `link_token.ts` sigue sin persistir el secreto, pero este corte necesitaba poder
**revocar con motivo** un enlace vigente — algo que un HMAC puro no puede expresar (no hay fila que
marcar). `ver-inmueble` ensambla el paquete por inmueble (estado de cuenta, paz y salvo, actas
publicadas, solicitudes) reutilizando `firmarTokenEnlace()` para mintar sub-tokens de 1 día hacia
los visores YA EXISTENTES y probados (`ver-estado-cuenta` vía `/comprobante-cuenta`, `ver-documento`)
— cero lógica de Storage duplicada. "Documentos publicados" genéricos quedaron fuera del paquete
(confirmado con el usuario vía `AskUserQuestion`): `documentos` no tiene hoy ninguna marca de
visibilidad pública, y agregarla tocaría una tabla compartida por todo el repo sin que ninguna
prueba lo exigiera. El formulario público de auto-registro de solicitudes (§4.4) también quedó
fuera de este corte (confirmado con el usuario): toda solicitud la registra la administración,
independientemente del canal real de origen (mostrador/teléfono/correo, capturado en `origen_id`).

14/14 pruebas propias verdes (`tests/gobierno/atencion.test.ts` — 12 exigidas por el spec §6 + 2
adicionales de cobertura de §4.5, no exigidas por §6 pero sí por la Definición de Hecho del marco
maestro), corridas contra **local y contra el proyecto remoto real** tras `pnpm db:push` (D-08).
**Hallazgo de entorno, no de GOB-8, documentado con transparencia**: durante el cierre, la regresión
completa de `pnpm test` local mostró primero 535 y luego 32 fallos ajenos a este corte —
diagnosticado como privilegios de `service_role` (tablas y, en una segunda ronda, funciones)
perdidos tras varios `supabase stop`/`start`/`db reset` seguidos en la misma sesión (uno con una
imagen de Studio nueva), no un bug de código; corregido con el `GRANT`/`ALTER DEFAULT PRIVILEGES`
estándar de Supabase (aprobado explícitamente por el usuario), confirmado con una regresión limpia
posterior. Ver `feedback_grants_service_role_incompletos_tras_bootstrap` (memoria). Verificación en
navegador completada de punta a punta (a diferencia de GOB-7): el bloqueo de login resultó ser
`apps/web/.env` apuntando al proyecto remoto mientras la raíz apuntaba a local — no una inestabilidad
de GoTrue como se había registrado antes — corregido temporalmente para verificar y restaurado al
cerrar; detalle en `GOB_08_INFORME.md` §5.

## D-69

CO-8 (obligaciones tributarias) — el corte con más riesgo de sobreingeniería y error normativo de
los 33 según su propio spec (§2). Nada se activa por defecto: todo depende de
`responsable_iva`/`agente_retencion`/`uso_economico`/`explota_bienes_comunes` (CO-1), sin valor
por defecto.

**Sin tabla `tributario_retencion` nueva**: `finanzas_factura_retencion` (FIN-2, `20260931150000`)
ya era la retención practicada — quedó deliberadamente sin FK "hasta que CO-8 exista", su propio
comentario lo documentaba. Como todo gasto de este sistema entra a `presupuesto_ejecucion`
únicamente vía facturas de proveedor (verificado por grep: solo FIN-2/FIN-3 insertan ahí), no
existe otro punto de práctica de retención que cubrir — crear una segunda tabla habría sido la
entidad duplicada que `MARCO_MAESTRO.md` §1.2 prohíbe. Este corte solo agregó el catálogo
(`tributario_concepto_retencion`, cero filas precargadas), la FK real, y extendió con diff mínimo
tres funciones ya existentes de FIN-2: `guard_finanzas_factura_retencion()` (+
`TRIBUTARIO_SIN_AGENTE_RETENCION`), `finanzas_factura_descomposicion()` (+ una línea de crédito
por cada retención) y `fn_finanzas_aprobar_factura()` (+ `TRIBUTARIO_RETENCIONES_INCONSISTENTES`).

**Cuenta nueva `2506 IVA descontable`** (débito dentro de la clase 25 crédito, mismo patrón que
las correctoras 1390/1595/1695) corrige un mapeo temporal de FIN-2: `IVA_DESCONTABLE` estaba
mapeado a la MISMA cuenta `2505` de IVA generado por no existir cuenta propia (documentado así
explícitamente en `20260931200000` — "el tenant puede remapear... si su contador la crea"). Se
remapea para todo tenant, existente y futuro.

**`tributario_iva_generado` es un registro INFORMATIVO, decisión confirmada explícitamente con el
usuario en el Plan del corte**: el IVA cobrado sobre un ingreso gravado (explotación de bienes
comunes) no genera ningún asiento contable automático. Dado que la única vía real de contabilizar
egresos en este sistema ya la construyó FIN-2 (`finanzas_factura_descomposicion`, enganchada a
`contable_hechos()`) y no existe un mecanismo equivalente del lado de ingresos con impuesto,
extender `contable_hechos()`/CO-3 para reconocer esta tabla habría sido invasivo sobre el núcleo
de materialización — excede "AQUILA genera la información base, no presenta declaraciones" (spec
§2 regla 1). El asiento (crédito a 2505) lo sigue registrando la copropiedad por el mecanismo
manual ya existente.

**`tributario_base_exogena(tenant, anio)`** produce 4 conjuntos de datos (pagos a terceros,
retenciones practicadas, ingresos, saldos de CxC/CxP al cierre) en `jsonb`; los saldos de CxC/CxP
se leen de `contable_libro_mayor` (CO-4) — la MISMA función, no una reimplementación — así "cuadra
contra el libro mayor" es una garantía por construcción, no una coincidencia verificada aparte. No
se implementa el formato XML de la resolución DIAN vigente (spec §5, vinculante).

9/9 pruebas propias verdes (`tests/contabilidad/tributario.test.ts`), corridas contra local y
contra el proyecto remoto real tras `pnpm db:push` (D-08), más 18/18 de regresión de FIN-2
confirmada sin romperse. **Dos hallazgos reales durante la construcción, ninguno en producción**:
(1) un primer intento de migración reprodujo por error la versión ORIGINAL (no la última) de
`fn_finanzas_aprobar_factura()`, regresando silenciosamente el fix de GOB-1 sobre la advertencia
`FACTURA_APROBACION_ORGANO_INCOMPETENTE` — detectado por la regresión de FIN-2, no por las
pruebas propias; corregido reproduciendo la última versión real antes de agregar el diff propio
(mismo tipo de error que MANT-2/GOB-1 ya habían advertido: listar TODAS las migraciones que
redefinen una función antes de reproducir su cuerpo, no solo la primera encontrada); (2) 8 códigos
de error de este corte quedaron sin registrar en `error-codes.ts` — detectado por
`tests/governance/error-codes-coverage.test.ts`, corregido antes de cerrar. Detalle completo,
incluyendo el hallazgo de entorno de una corrida de regresión interrumpida ~7 horas por una
posible suspensión de la máquina (no de la base de datos, confirmado re-corriendo en aislamiento
los archivos afectados: 23/23 verdes), en `CO_08_INFORME.md` §5.

## D-70

GOB-9 (comunicaciones y workflow transversal) — **último corte de los 33** (fila 33/33,
`HOJA_DE_RUTA.md` §2). Refactor con radio de explosión sobre cartera en producción, no un módulo
nuevo: generaliza `acciones_cobranza_envios`/`acuses` y agrega un motor de vencimientos sobre las
5 máquinas de estado que GOB-4/5/6/7/8 ya construyeron — sin inventar un motor de workflow
genérico ni un segundo scheduler (ambos vinculantes fuera de alcance, spec §4).

**Generalización puramente aditiva.** `acciones_cobranza_envios.accion_id` pasa a nullable +
4 columnas `origen_modulo/origen_entidad/origen_id/origen_evento` (mismo patrón que
`contable_comprobante`, CO-2) + un check `envio_origen_exclusivo` (exactamente uno de los dos
caminos) + un índice único parcial de idempotencia. Ninguna columna, constraint ni política
existente se tocó — la prueba 1 (cero regresión) lo confirma ejecutando sin modificar ni una
línea `tests/plantillas-email`, `tests/plantillas-sms` y los 6 archivos de
`tests/tenancy/cartera-*.test.ts` relevantes: 67/67 verdes, local y remoto.

**`plantillas_email`/`plantillas_sms` ya eran genéricos en esquema** (tenant_id + event_type, sin
ninguna columna que los acoplara a cobranza) — "generalizarlos" no exigió ninguna migración: basta
con que otros módulos usen sus propios `event_type` (`gob2_convocatoria`, `gob6_requerimiento_escrito`,
etc.) a través de las mismas `fn_guardar_plantilla_email/sms`, que ya validan con
`fn_validar_contenido_plantilla` sin importar el evento — extenderlo a GOB-6 (aprobado
explícitamente por el usuario) fue gratis por construcción, no una migración nueva.

**Envío generalizado, no automatizado desde el motor.** El envío real de una comunicación
(Brevo) sigue siendo un paso HTTP aparte del RPC que registra el hecho de negocio — nuevo Edge
Function `enviar-comunicacion` + `_shared/comunicacion_generalizada.ts`, hermano generalizado de
`despacho_cobranza.ts` (nunca modificado). El motor de vencimientos (`gobierno_detectar_vencimientos`,
SECURITY DEFINER) es SOLO SELECT sobre las 5 máquinas de estado + INSERT en
`gobierno_vencimiento_notificaciones` — nunca un UPDATE sobre gobierno_compromisos/
gobierno_expedientes_convivencia/gobierno_impugnaciones/solicitudes/gobierno_actas (prueba 7,
verificado leyendo la función: no hay ningún UPDATE de dominio en su cuerpo). El scheduler reutiliza
el patrón exacto de `cartera_corridas_diarias` (un job pg_cron, una función, una bitácora) aplicado
a un dominio distinto — no una segunda abstracción, la misma forma que MANT-3 y auditoría ya
replican cada uno con su propio job.

**Funciones agregadas "en nombre de" GOB-1/4/5/6/7/8** (`gobierno_organo_alertas`,
`gobierno_expedientes_detenidos`, `gobierno_solicitudes_sla_estado`, `gobierno_actas_pendientes`,
`gobierno_impugnaciones_en_tramite`, `gobierno_compromisos_pendientes`, `gobierno_decisiones_estado`):
cada corte anterior expuso el dato crudo (fecha_limite, sla_vence_at, plazo_disposicion_limite) pero
ninguno expuso el AGREGADO que el tablero necesita ("cuántas vencidas", "cuáles detenidos"). Se
agregan aquí, con la firma que tendrían si hubieran nacido en su propio corte — el tablero
(`gobierno_tablero_resumen`, un único RPC que consume `gobiernoTablero.ts`) nunca hace
`.from(...)` sobre una tabla de otro corte (prueba estructural 10).

**Tres preguntas resueltas explícitamente con el usuario antes de implementar**: (1) el validador
de frases prohibidas SÍ se extiende a los envíos de sanción/requerimiento de GOB-6 (mismo o mayor
riesgo de lenguaje indebido que cobranza); (2) sin generador PDF previo en el repo pese a que
`pdfmake` ya era una dependencia usada en `gobierno/actas/[id].vue`/`contabilidad/libros.vue` —
se reutilizó ese mismo patrón para los dos informes (`gobierno_informe_gestion`, un solo cálculo
servidor, dos rangos de fecha distintos); (3) el informe de asamblea se entrega ya usable, sin
esperar a CO-9 (que todavía no existe) para anexarlo a su paquete de rendición de cuentas.

**Bugs reales encontrados y corregidos antes de cerrar** (todos durante la construcción de
`tests/gobierno/comunicaciones-workflow.test.ts`, ninguno en producción): (1) `terceros.nombre` no
existe — la columna real es `nombre_completo` (post-generalización de GOB-0/D-60); (2)
`inmueble_persona_rol.desde/hasta` no existen — son `vigente_desde/vigente_hasta`, y su vocabulario
de rol es `PERSONA_PREDIO.copropietario`, no `.propietario`; (3) `terceros.email` es `citext`, no
`text` — `gobierno_segmento_destinatarios` necesitó cast explícito `::text` en su `RETURNS TABLE`
(error de Postgres 42804, no de RLS); (4) el quórum por coeficientes de GOB-3/GOB-5 aplica al
órgano `asamblea_general`, no a `consejo_administracion` — un intento inicial de fixture con
`consejo_administracion` fallaba con `VOTACION_SIN_QUORUM` porque nunca se le atribuyó ese
mecanismo. Ninguno afectó código de producción — los 4 eran errores de fixture o de la migración
nueva de este mismo corte, no regresiones sobre cortes anteriores.

**Simplificación documentada**: `gobierno_actas_pendientes` devuelve solo conteos
(sin_suscribir/sin_disposicion), no "días restantes" por acta individual como pide el spec
literal del tablero (§3.4) — el dato ya existe en `gobierno_actas.plazo_disposicion_limite` y
puede agregarse sin migración nueva si se necesita; se dejó como conteo agregado por ser
suficiente para la vista de alerta y no bloquear el cierre del corte.

11/11 pruebas obligatorias verdes más 1 prueba de control adicional (12/12 en total,
`tests/gobierno/comunicaciones-workflow.test.ts`), local y remoto — más el paso separado de cero
regresión (67/67 en `tests/plantillas-email`, `tests/plantillas-sms` y `tests/tenancy/cartera-*`,
sin modificar ni una línea, no reproducido como `it()` porque no tiene sentido correr la suite de
otro archivo desde dentro de un test). Detalle completo en `GOB_09_INFORME.md`.

## D-71

Portal web de identidad para actores externos (adición de alcance nueva, no uno de los 40 cortes
de `HOJA_DE_RUTA.md`) — login/sesión + landing mínima en `apps/web/app/pages/portal-externo/`,
consumiendo los Edge Functions ya existentes de EXT-01 (`actor-externo-solicitar-otp`/
`-confirmar-otp`) sin ningún backend/SQL nuevo. Reemplaza la dependencia de `apps/mobile` (2
pantallas, nunca ejecutadas en un dispositivo real) para que un propietario/tenedor pueda
identificarse desde la web.

**Stack: páginas Nuxt minimalistas, no HTML/CSS/JS 100% estático fuera del framework.** El pedido
original era "independiente, HTML+CSS+JS" — investigado antes de implementar: `apps/web/nuxt.config.ts`
(D-16) resuelve la sesión vía cookies con el protocolo interno de `@nuxtjs/supabase`/`@supabase/ssr`,
no `localStorage`. Un cliente Supabase JS "vanilla" en una página HTML suelta serviría el login de
ese momento, pero la sesión no sería visible para el resto de la app (SSR + middleware) sin
reproducir a mano ese protocolo de cookies — el mismo "mecanismo paralelo" que el proyecto evita en
todas partes. Se optó por páginas Vue SFC (`layout:'blank', publico:true`, mismo patrón que
`consulta-inmueble/index.vue`: HTML semántico plano + CSS propio con scope, sin Nuxt UI pesado) —
visualmente equivalente a HTML/CSS/JS mínimo, con `useSupabaseClient()` dando la sincronía de
cookies gratis. Decisión confirmada con el usuario vía `AskUserQuestion` antes de escribir código.

**Hallazgo real durante la verificación en navegador (no supuesto de la documentación ni copiado
de `apps/mobile/src/session/cliente.ts::establecerSesionDesdeOtp`, que nunca se ejecutó en un
dispositivo): el intercambio de `hashed_token` por sesión falla con los parámetros que tanto el
código de `apps/mobile` como el comentario original de `actor-externo-confirmar-otp/index.ts`
asumían.** Probado en vivo contra el proyecto remoto (Scala - Aquila, `hwjmlyzzvpmhadldavbq`) con
un contacto real (propietario en JARDINES DE BABILONIA): `cliente.auth.verifyOtp({email, token:
hashed_token, type:'magiclink'})` fallaba siempre con "Token has expired or is invalid" aunque el
token fuera válido y recién emitido. Diagnosticado leyendo `auth.one_time_tokens` directamente
(dos hallazgos independientes, confirmados contra la tabla real, no adivinados):
1. `hashed_token` de `admin.generateLink()` está pensado para el parámetro `token_hash` de
   `verifyOtp` (flujo de enlace) — `token`+`email` es para el código de 6 dígitos de un OTP de
   `signInWithOtp`, un flujo distinto.
2. Para un usuario YA existente y confirmado (el caso normal de un login repetido de actor
   externo), `admin.generateLink({type:'magiclink'})` guarda el token con `token_type =
   'recovery_token'` en `auth.one_time_tokens`, no `magiclink_token` — `verifyOtp` debe pedir
   `type:'recovery'`, no `'magiclink'`, para encontrarlo.

Corregido en `apps/web/app/utils/actor-externo-api.ts::establecerSesionActorExterno` con
`cliente.auth.verifyOtp({ token_hash: hashedToken, type: 'recovery' })`. **`apps/mobile` tiene el
mismo bug latente**, sin corregir aquí (fuera de alcance de este corte, y esa app nunca se
compiló/ejecutó para haberlo detectado antes).

**Guard en `apps/web/app/middleware/tenant.ts`** (confirmado con el usuario, hallazgo #2 del Plan
del corte): sin membership, antes de asumir "nunca tuvo copropiedad" y mandar a
`/onboarding/create-tenant`, se verifica si el usuario tiene algún `actor_externo_vinculo` (vía
`fn_actor_externo_mis_vinculos`, ya `security definer` desde el fix de EXT-02) y si es así redirige
a `/portal-externo/mis-vinculos` — un actor externo (AD-37: nunca `tenant_member`) que navegue por
accidente a una ruta interna ya no puede terminar creando una copropiedad fantasma. Verificado en
navegador: sesión de actor externo → `/dashboard` → redirige a `/portal-externo/mis-vinculos`.

Verificado en navegador de punta a punta contra datos reales (Scala - Aquila): solicitar código →
correo real recibido → confirmar → sesión persistente en cookies (sobrevive recarga completa) →
landing muestra el vínculo real (JARDINES DE BABILONIA / Copropietario) → cerrar sesión → vuelve a
`/portal-externo`. `pnpm exec nuxt typecheck` y el lint de `apps/web` en cero errores sobre los
archivos de este corte. Sin migraciones ni Edge Functions nuevas — cero cambios en
`MIGRACIONES_LEDGER.md`.

**Addendum mismo día — "Hacer una solicitud" (EXT-02), agregado a pedido del usuario "a manera de
prueba" sobre el mismo portal.** El backend de EXT-02 (crear solicitud desde External) ya estaba
cerrado en otra sesión — dos Edge Functions dedicadas (`external-solicitudes-catalogo`,
`external-solicitudes-crear`), primeras de External que autentican por **sesión** (Bearer JWT) en
vez de token firmado, resolviendo `inmueble_id`/`tenant_id` siempre server-side vía
`fn_actor_externo_mis_vinculos` del propio caller — nunca del cuerpo que mande el cliente. Nueva
página `apps/web/app/pages/portal-externo/nueva-solicitud.vue` (mismo patrón visual que las otras
dos) + 4 funciones nuevas en `actor-externo-api.ts` (`obtenerCatalogoSolicitud`,
`crearSolicitudExterna`), enlazadas desde un botón "Hacer una solicitud" en `mis-vinculos.vue`.
Cero SQL nuevo — mismo contrato que ya usa `apps/mobile/src/screens/NuevaSolicitudScreen.tsx`.

**Hallazgo real: `external-solicitudes-catalogo`/`-crear` NUNCA se habían desplegado al proyecto
remoto**, aunque el código llevaba tiempo en el repo y EXT-02 constaba como cerrado (memoria de
sesión, no en este archivo). Confirmado contra `list_edge_functions` (MCP Supabase): no aparecían
en la lista de funciones `ACTIVE` de `hwjmlyzzvpmhadldavbq`, a diferencia de
`actor-externo-solicitar-otp`/`-confirmar-otp` que sí. Síntoma en el navegador: error de CORS en
el preflight (no un 404 limpio, porque el gateway de Supabase nunca encuentra la función). Corregido
con `supabase functions deploy external-solicitudes-catalogo external-solicitudes-crear
--project-ref hwjmlyzzvpmhadldavbq` (confirmado con el usuario antes de desplegar — acción con
efecto en el proyecto remoto real). **Lección reutilizable**: "el corte quedó cerrado" no implica
que sus Edge Functions llegaron a desplegarse — verificar contra `list_edge_functions` (o el
dashboard), no solo contra el código del repo o la suite de pruebas (que corre contra RPCs
directos, nunca contra la URL pública de la función).

**Segundo hallazgo, de datos, no de código**: `JARDINES DE BABILONIA` (el único tenant con un
actor externo real disponible para probar) no tiene ninguna fila `TIPO_SOLICITUD`/
`CATEGORIA_SOLICITUD` en `lista_tipos` — ni propias del tenant ni de plataforma (`tenant_id is
null`, tampoco existen para esta familia). Confirmado contra 27 tenants que sí tienen 2 valores
activos cada uno. La página ahora muestra un estado vacío explícito ("Esta copropiedad todavía no
tiene un catálogo... pídele al staff que lo active") en vez de un formulario en blanco. El staff
configura esto en `Configuración → Catálogos` (`apps/web/app/pages/configuracion/catalogos.vue`,
permiso `settings:manage`) — pantalla genérica de `lista_tipos` que no crea familias nuevas, solo
valores dentro de una ya reconocida por el sistema. **No se sembró el catálogo para este tenant
desde esta sesión** (dato de producción, fuera de alcance sin pedirlo explícitamente) — el
envío real de una solicitud (`crearSolicitudExterna` → `fn_solicitud_recibir_externa`) quedó
con el código escrito y desplegado pero **sin verificación end-to-end en navegador** (el
catálogo vacío lo impide); el resto del flujo (elegir vínculo si hay más de uno, cargar catálogo,
manejo de errores) sí se verificó en vivo contra este mismo tenant. `nuxt typecheck`/lint en cero
errores sobre los archivos nuevos.


---

## D-72

EXS-01 (serie Experiencia y Servicios, primer corte) — **el contrato de autorización, capacidades y
deep links de los prompts 02–06 se expresa con los mecanismos que ya existen; no se crea un segundo
sistema de permisos.** Corte de contrato: sin migraciones, sin tablas, sin cambios en
`permissions.ts`. Ver `Casos de uso/Experiencia y servicios/EXS_01_INFORME.md`.

**El problema.** Los cinco prompts piden permisos por acción (`announcement.publish`,
`marketplace.moderar`, `directorio.ver`) y asumen un RBAC granular. El prompt 05 §46 llega a citar
roles —"01 Administrador / 02 Agente / 03 Auditor / 04 Invitado"— que no son los de este
repositorio: fue redactado contra un modelo anterior. Implementarlos literalmente crearía el
"segundo sistema RBAC" que la propia hoja de ruta de esos prompts prohíbe en su §19.

**La decisión: el grano de autorización es el módulo, no la acción.** Tres mecanismos existentes se
reparten el trabajo, y ninguno es nuevo:

1. **Rol de tenant** (`auxiliar | auditor | administrador`) decide quién escribe, vía `has_role()`.
   `administrador ⊇ auxiliar` desde `20260822260000`; `auditor` es solo lectura.
2. **Rol funcional** decide quién ve el módulo, vía `puede_ver_modulo(tenant, modulo)` —
   `membership_roles_funcionales` + `rol_funcional_modulo`, con la semántica retrocompatible que ya
   tiene: pasa si es administrador, **o si la membresía no tiene ningún rol funcional asignado**, o
   si alguno cubre el módulo. Cada corte EXS declara su módulo (`anuncios`, `directorio`,
   `movilidad`, `marketplace`) en la misma migración que crea sus tablas — EXS-01 no siembra
   ninguno, porque sembrar un módulo sin tablas deja el gate gobernando el vacío.
3. **Guard de transición en base de datos** decide quién aprueba. `crear` vs. `aprobar` vs.
   `publicar` **no se modela como permiso**: se modela como transición de estado custodiada por un
   trigger, con el patrón ya probado de `guard_accion_cobranza_transicion`, que hace las tres cosas
   que el prompt 02 §27/§28 pide para redactor → revisor → aprobador: valida la transición contra
   una lista cerrada de pares, exige rol explícito (`administrador`) para aprobar/rechazar, e impone
   maker–checker (quien propuso no aprueba lo suyo). Hereda también el criterio de `auth.uid()` nulo
   = cambio fuera de banda (service_role/fixtures), igual que `guard_privileged_columns`.

**Por qué NO se añade una columna de acción a `rol_funcional_modulo`.** Esa tabla ya gobierna las
policies de `juridico`, `financiero`, `cartera_cobranza`, `mantenimiento` y `estado_cuenta`;
cambiarle la forma obliga a revisar todas esas policies para ganar expresividad que el guard de
transición ya da, con la ventaja de que el guard vive junto al dato y no puede eludirse desde
ningún cliente. Tocar `permissions.ts` además arrastra el test cruzado T-MATRIX
(`tests/rbac/t-matrix.test.ts`) y su exigencia de 100 % de cobertura.

**Frontera de autorización: dos carriles, y no se prueban igual.** Hallazgo de la verificación, no
supuesto de la documentación. Un miembro entra por RLS (`is_member`, `has_role`,
`puede_ver_modulo`); un actor externo **no pasa por RLS en absoluto** —no existe ni una policy para
ellos— sino por Edge Function `external-*` + RPC `fn_*_externa` `security definer` que valida
`actor_externo_vinculo.auth_user_id = auth.uid()` y lanza `VINCULO_NO_PERTENECE` (verificado
verbatim en `fn_reserva_mis_reservas_externas`, `fn_solicitud_mis_solicitudes_externas`,
`fn_autorizacion_visita_mis_autorizaciones_externas`). Escribir tests RLS para actores externos
—como piden los prompts— sería probar el carril equivocado.

Por decisión de alcance de la serie (Johnny, 2026-09-11) EXS construye **dominio administrativo, no
experiencia externa**: solo el carril 1 se ejerce. El carril 2 se documenta igual porque el modelo
de datos de EXS-03..06 decide si será posible después sin rehacerlo — el precedente es `MANT-10`/
`MANT-11`, que construyeron reservas y visitantes dejando el modelo expuesto por `EXT-03`/`EXT-04`
meses más tarde sin tocar sus tablas. De ahí la regla concreta: **toda entidad que un residente vaya
a ver algún día debe ser alcanzable desde `inmueble_persona_rol` o `tercero_id`, no solo desde
`profiles`/`memberships`.**

**Deep links: tres mecanismos existentes, ninguno nuevo.** HMAC determinista sin estado
(`_shared/link_token.ts`, D-27) para documento inmutable enviado por correo; token con estado y
revocable (`atencion_tokens_consulta`, GOB-8) para acceso continuado a contexto vivo; aleatorio con
solo el hash en BD (`_shared/tokens.ts`, AD-04) para credencial de un solo uso. En esta serie los
enlaces son internos y no necesitan token: basta sesión + RLS. Cuando llegue la capa externa, el
enlace a un anuncio es acceso continuado a contexto vivo → mecanismo 2, no 1.

**Sin suite de pruebas, deliberadamente.** El contrato quedó decidido sin cambiar código y los
módulos que gobernaría no existen todavía: no hay superficie que probar. Las pruebas de frontera y
de capacidad se escriben en EXS-02, el primer corte con tablas propias. Escribirlas aquí sería
probar un contrato contra el vacío.

---

## D-73

EXS-2 (notificaciones in-app) — **una notificación se dirige a un MÓDULO, no a una persona**, y por
eso la lectura vive en su propia tabla. Migraciones `20260933000000`–`20260933030000`. Ver
`Casos de uso/Experiencia y servicios/EXS_02_INFORME.md`.

**Lo que faltaba, verificado antes de construirlo.** AQUILA tenía los dos extremos de la cadena y no
el del medio: tres tablas de DETECCIÓN (`finanzas_alerta_emitida`, `mant_inventario_alertas`,
`gobierno_vencimiento_notificaciones`, ninguna con destinatario ni estado de lectura, consumidas
solo dentro de la pantalla de su módulo) y el ledger de ENVÍO de COM-1. La pieza intermedia —un
aviso dirigido, con lectura y enlace al contexto— no existía, y la campana lo suplía leyendo
`audit_log` contra una cookie: el anti-patrón que el prompt 06 §13 prohíbe expresamente, con su
propio comentario de cabecera admitiéndolo.

**La decisión.** El usuario definió el destinatario como "quien tenga el rol funcional del módulo".
La lectura literal —una columna `destinatario_rol_id`— se descartó porque **`puede_ver_modulo()` ya
responde exactamente esa pregunta**: duplicar el criterio en una columna crearía dos fuentes de
verdad capaces de divergir. La notificación lleva `modulo` y la ve quien pase el gate existente, con
su semántica retrocompatible incluida (administrador, o sin roles funcionales asignados, o con un
rol que cubra el módulo). Sin columna de destinatario, sin función nueva, sin tabla de suscripción.

**Consecuencia estructural, no cosmética**: si varios miembros ven el mismo aviso, la lectura no
puede ser una columna de la notificación. De ahí `notificacion_lectura`, append-only, una fila por
(aviso, usuario) cuya ausencia ES el "no leído" — sin booleano que mantener sincronizado. Coincide
con la estrategia B del prompt 02 §18 ("registrar únicamente lecturas"), sin materializar
destinatarios al emitir.

**Idempotencia con un detalle que importa**: la clave única es `(tenant_id, origen_entidad,
coalesce(origen_id, uuid-cero), origen_evento)`. El `coalesce` no es adorno — en SQL dos NULL no
colisionan, así que sin él un evento de tenant completo, sin entidad concreta, se duplicaría en cada
corrida del cron diario que lo detecta.

**Escritura imposible desde un cliente, por esquema y no por disciplina**: `notificaciones` no tiene
policy de insert, y `fn_notificar()` (security definer, único emisor) tiene EXECUTE revocado de
`authenticated`. La "fuente clara de verdad" del prompt 06 §16 queda garantizada estructuralmente:
nadie puede fabricar avisos que parezcan del sistema.

**Los tres puentes son triggers AFTER INSERT y no modifican ninguna de las tres tablas de
detección.** AFTER y no BEFORE porque la función referencia la fila que la origina (mismo criterio
que el patrón ya conocido del proyecto). Cada uno envuelve la emisión en un bloque exception: una
alerta de stock debe registrarse aunque su aviso falle — la detección es el dato duro, la
notificación es conveniencia.

**`gobierno` no se sembró en `rol_funcional_modulo`, deliberadamente**: no existe ningún rol
funcional de gobierno, y por la semántica de `puede_ver_modulo()` esos avisos los ven los
administradores y quien no tenga roles asignados — lo deseable para plazos legales. Si algún día se
crea el rol, sembrar su fila estrecha el gate sin tocar este corte.

**Alcance acotado por decisión del usuario**: sin preferencias por usuario, y sin puente a COM-1 (el
trío `origen_*` se dejó idéntico al de `acciones_cobranza_envios` para que ese puente sea posible
después sin migrar datos). Evidencia: 11 pruebas en `tests/rls/notificaciones.test.ts`, incluida la
del puente real de finanzas. **No verificado en navegador**: `apps/web/.env` apunta al remoto, que
aún no tiene estas migraciones.

---

## D-74

EXS-3 (anuncios y comunicación oficial) — **la audiencia son reglas, no destinatarios; el ciclo de
vida es un guard, no un permiso.** Migraciones `20260933100000`–`20260933140000`. Ver
`Casos de uso/Experiencia y servicios/EXS_03_INFORME.md`.

**Qué NO se construyó, verificado antes de empezar.** El diagnóstico señalaba este corte como el de
mayor riesgo de duplicación. Comprobado: `gobierno_convocatorias` está atada a `reunion_id` (convoca
a una reunión, no comunica algo general) y el compositor de correo manda a UN destinatario suelto
sin segmentación ni ciclo de vida — ninguno solapa. Anuncios es dominio nuevo legítimo, y reutiliza
entero lo que sí existía: `gobierno_segmento_destinatarios` (audiencia), COM-1 (despacho),
`documentos` (adjuntos, con una columna FK más siguiendo su patrón) y `fn_notificar` (aviso in-app).

**Audiencia declarativa (prompt 02 §13).** `anuncio_audiencia` guarda pares (criterio, valor) en el
vocabulario que GOB-9 ya resuelve, y `fn_anuncio_destinatarios` los une contra datos **vivos**.
Materializar destinatarios al publicar habría generado ~20.000 filas muertas al año en una
copropiedad de 500 unidades y habría envejecido mal: quien vendió seguiría siendo destinatario de un
anuncio de hace ocho meses. **Cero reglas = toda la copropiedad**: no hay criterio `todos` porque
duplicaría el significado del conjunto vacío.

**El ciclo de vida como guard — primera aplicación real del contrato de EXS-1 §3.3.**
`guard_anuncio_transicion` valida la transición contra una lista cerrada, exige administrador para
revisar y publicar, impide que quien redactó apruebe lo suyo (segregación, prompt 02 §27/§28),
asigna el consecutivo al publicar y congela contenido y número después. Cero permisos nuevos, cero
columnas en `rol_funcional_modulo`. El atajo borrador→publicado existe para emergencias (§7) pero
exige administrador: un auxiliar siempre pasa por revisión.

**Consecutivo al publicar y solo entonces.** Numerar al crear quemaría números en borradores
descartados y dejaría huecos en una serie citable en un acta. Una constraint lo hace inviolable en
ambos sentidos: publicado exige número, sin publicar no puede haberlo.

**Publicación programada idempotente sin tabla auxiliar**: el filtro `estado='programado'` más el
UPDATE que lo cambia bastan (GC-005); `FOR UPDATE SKIP LOCKED` evita que dos corridas peleen. El
estado ES la marca.

**El módulo `anuncios` lo cubren TODOS los roles funcionales, deliberadamente.**
`puede_ver_modulo()` es un gate para módulos *sensibles*; aplicado sin más a la comunicación oficial
tendría el efecto perverso de que asignar el rol `contador` a alguien le ocultara los avisos de
seguridad del edificio. En vez de exceptuar este dominio del mecanismo (rompiendo la uniformidad de
EXS-1) se sembraron los cinco roles contra `anuncios`: restringirlo mañana es borrar filas, sin
tocar policies ni desplegar código.

**Dos bugs reales que solo aparecieron al ejecutar** (ninguno visible leyendo el código):
1. `is_member()` es false para `service_role` — `fn_anuncio_destinatarios`/`fn_anuncio_metricas`
   rechazaban a las Edge Functions y al cron. Corregido con el criterio "fuera de banda" de
   `guard_privileged_columns`: la membresía solo se comprueba si hay actor real.
2. El `return` temprano del guard para `auth.uid()` nulo se saltaba **también el sellado**, así que
   el job programado publicaba sin número y chocaba contra `anuncios_publicado_con_numero`. La
   publicación programada estaba rota y el código parecía correcto. Corregido separando las
   comprobaciones de rol (solo con actor) del sellado (siempre). Lo cazó la prueba del GC-005.

Evidencia: 16 pruebas en `tests/rls/anuncios.test.ts`, más verificación en navegador del flujo
completo — incluido el intento de auto-aprobación rechazado por el guard con su mensaje en pantalla.
Pendientes declarados: el cron no está agendado en pg_cron (la función existe y está probada), los
adjuntos tienen columna pero no UI, y el contenido es texto plano sin editor enriquecido.

---

## D-75

EXS-4 (directorio) — **`mant_proveedor_perfil` se generaliza a `tercero_perfil`; el directorio es
una proyección con tres reglas, no una segunda lista de terceros.** Migraciones
`20260933200000`–`20260933220000`. Ver `Casos de uso/Experiencia y servicios/EXS_04_INFORME.md`.

**La pregunta previa.** Sin capa externa (decisión de alcance de la serie), un administrador ya ve
todos los terceros en `/terceros`, así que el corte corría el riesgo de duplicar una pantalla
existente. Planteado al usuario antes de codificar, acotó el alcance a lo único que no existía en
ninguna tabla: el **perfil comercial** de locales y negocios. `terceros` guarda identidad legal;
`mant_proveedor_perfil` guardaba lo operativo de un proveedor (categorias_servicio →
CATEGORIA_ACTIVO). Ninguna sabía decir "Panadería La Espiga, alimentación, abre de 6 a 8, local 12".

**Generalización, no tabla nueva** (decisión del usuario): mismo movimiento que
`documentos_inmueble → documentos` y `propietarios → personas → terceros` — este repositorio
renombra cuando una tabla deja de pertenecer a un módulo. Coste medido antes de decidir: 2
migraciones, 4 líneas de un store y una referencia en un test. La alternativa (`directorio_perfil`
aparte) habría dejado al electricista que además atiende público con dos perfiles y dos categorías
que nada obligaba a coincidir.

**Lo que NO se renombró: los códigos de error.** `PROVEEDOR_TENANT_INCONSISTENTE` y
`PROVEEDOR_CATEGORIA_INVALIDA` los comparte `guard_mant_proveedor_evaluacion`, que sigue
existiendo; cambiarlos habría roto un contrato vigente por estética. Solo lo genuinamente nuevo
estrenó nombre.

**Las tres reglas que separan el directorio de un select sobre terceros:**

1. **Existir no es aparecer** (prompt 03 §66): `publicado` nace false, publicar es deliberado y
   queda sellado con quién y cuándo; el guard exige `nombre_comercial` para publicar porque una
   ficha sin nombre no se puede encontrar; despublicar limpia el sello.
2. **Mínima exposición de PII** (§15): `fn_directorio_listar` es **función y no vista**
   precisamente para que las columnas sensibles de `terceros` no queden al alcance de un select más
   ancho. `contacto_publico` es columna propia, separada de `terceros.email`/`telefono`, que son
   datos de notificación administrativa y no deben publicarse por tener ficha (§16, §46).
3. **La ubicación se deriva de `inmueble_persona_rol`, no se copia** (§25): si el negocio se muda
   de local, la ficha lo refleja sin que nadie la edite.

`CATEGORIA_COMERCIO` es familia propia y no reutiliza `CATEGORIA_ACTIVO`: una dice "qué clase de
negocio es", la otra "en qué activos trabaja un proveedor"; mezclarlas llenaría el selector de
mantenimiento de categorías inútiles para una orden de trabajo.

Evidencia: 12 pruebas en `tests/rls/directorio.test.ts` (incluidas la de no-exposición de PII y la
de ubicación derivada) y `proveedores-contratos.test.ts` verde tras el renombrado. Verificado en
navegador, comprobando en el DOM —no solo en la API— que documento, correo y teléfono
administrativos no llegan a la página. Pendientes declarados: sin niveles de visibilidad por
segmento (solo el booleano), sin contacto intermediado vía Atención, sin fotos y sin enlace a
Marketplace (que aún no existe).

## D-76

EXS-5 (vehículos y movilidad) — **el permiso vehicular NO converge con `mant_autorizaciones_visita`;
registrar no es autorizar; y "autorizado" se deriva, nunca se almacena.** Migraciones
`20260933300000`–`20260933330000`. Ver `Casos de uso/Experiencia y servicios/EXS_05_INFORME.md`.

**El gate de producto que la hoja de ruta dejó abierto** era si el permiso vehicular converge con
las autorizaciones de visita de MANT-11. El reconocimiento del código lo respondió antes de que el
usuario decidiera a ciegas: `mant_autorizaciones_visita` modela una visita de **un solo uso**
(`visitante_nombre`, `fecha_prevista`, `hora_desde/hasta`, QR firmado de vigencia corta, estado
`vigente → usada`), y el carro de un residente entra a diario durante años. Unirlas habría dejado un
enum donde la mitad de los estados no aplica a la mitad de las filas y un QR consumible que nadie
consume. El usuario decidió **las dos cosas**, y la frontera queda escrita en la cabecera de
`20260933320000`:

- visita puntual, con carro o sin él → `mant_autorizaciones_visita` (+ columna `vehiculo_placa` nueva)
- movilidad estable de la copropiedad → `vehiculos` + `vehiculo_permiso`

La mitad de MANT-11 costó **una columna, no una tabla**. Deliberadamente **no es FK a `vehiculos`**:
el carro de un visitante no pertenece a la copropiedad, y registrarlo como vehículo lo metería en el
inventario y le haría competir por la unicidad de placa con los que sí son de aquí. Lo que sí
comparte es `fn_normalizar_placa`, para que portería busque una placa una sola vez.

**La placa se normaliza en una columna GENERADA, no en un trigger** (prompt 04 §32: una sola
implementación, no tres runtimes divergentes). La diferencia importa: con `generated always as` no
existe camino —ni `service_role`, ni carga masiva, ni psql— capaz de guardar una placa sin
normalizar. Se conserva lo tecleado para mostrarlo y se deriva la forma canónica para comparar.

**Registrar no es autorizar** (prompt 04 §16), y de ahí tres consecuencias:
1. **`autorizado` se deriva** en `fn_vehiculo_por_placa` contra permisos vigentes y fecha de hoy.
   Por eso `permiso_vehiculo_estado_t` tiene DOS valores: *"vencido"* no es estado sino consecuencia
   de `vigente_hasta < hoy`; almacenarlo exigiría un job diario para cambiar una columna que la
   fecha ya dice (mismo criterio que `v_cargo_saldo` con la mora).
2. **Otorgar exige `administrador`; registrar admite `auxiliar`**. Dejar entrar un carro es más
   sensible que anotar que existe.
3. **La coherencia la impone la base**: `tg_vehiculo_retiro_revoca_permisos` revoca los permisos
   vigentes al retirar. Sin él, un carro retirado seguiría autorizado en la consulta de portería.

**Unicidad entre los activos, historia conservada** (decisión del usuario): índice único **parcial**
`where estado <> 'retirado'`. Eso es lo que hace de `vehiculo_estado_t` un enum legítimo bajo D-24 —
**gobierna el índice único**, no describe. No hay delete: un vehículo se retira, y el retiro exige
fecha (`vehiculos_retiro_coherente`) para que "retirado" nunca sea un estado sin cuándo.

**Un solo modelo de vehículo** (prompt 04 §3): las diferencias van en `vehiculo_relacion` —tercero,
inmueble o ambos, con `rol_id` y vigencia—, no en tablas por tipo de dueño. No reutiliza
`PERSONA_PREDIO`, que dice cómo se relaciona alguien con un *inmueble*: el dueño de un carro no tiene
por qué serlo del apartamento (§10). `TIPO` y `SERVICIO` son familias separadas (§8) para no inventar
valores combinados. El parqueadero es un `inmueble_id` del permiso: no se crea un segundo modelo de
parqueaderos (§19/§20).

Evidencia: 15 pruebas en `tests/rls/vehiculos.test.ts`. Verificado en navegador el ciclo completo
—registrar `wxy-88 z`, consultar `WXY88Z` sin permiso, otorgar, consultar `wxy 88z` autorizado,
retirar y ver el permiso revocado solo—, con limpieza del dato de prueba al terminar. Pendientes
declarados: sin bitácora de entradas/salidas (enganchar `mant_registros_acceso` es una FK más), sin
cupos de parqueadero, sin lectura de placa por cámara, y sin aviso de permiso por vencer (exige un
cron, el mismo pendiente que arrastra EXS-3).

## D-77

EXS-6 (marketplace) — **un tablón de anuncios, no un e-commerce; la escalera de aprobación sella el
rol de origen; y el precio es un dato informativo que no toca `financial-kernel`.** Migraciones
`20260933400000`–`20260933440000`. Ver `Casos de uso/Experiencia y servicios/EXS_06_INFORME.md`.

**El gate de producto que bloqueaba el corte entero** lo cerró Johnny el 2026-09-12: *los vecinos se
arreglan por fuera, la copropiedad no interviene en la transacción; el precio es informativo y el
inmueble no participa en nada*. Con eso, todo lo que el prompt 05 §3 prohíbe (carrito, checkout,
órdenes, pasarela, escrow, comisiones, conciliación de ventas, garantía de la transacción) deja de
ser una restricción autoimpuesta y pasa a ser consecuencia del producto: no hay nada que conciliar
porque no hay nada que cobrar. El flujo es publicación → descubrimiento → interés → negociación
externa → cierre.

**El precio es `numeric(18,2)` —la convención del repositorio, jamás float— pero NO es dinero
contable**: no entra a `financial-kernel`, no genera asiento, cuenta por cobrar, factura, recaudo ni
retención, y no toca la cuenta del inmueble. La distinción: un importe del kernel es *la obligación
de alguien*; este número es lo que un vecino escribió en su aviso. En pantalla se muestra con
`formatoMoneda` (punto único de verdad consolidado por la auditoría de 2026-08-26 tras hallarlo
copiado 18 veces) — no se hizo la copia 19, y formatear no es aritmética. Regla de dominio: **un
regalo no lleva precio**.

**La escalera de aprobación**, cerrada por Johnny con más precisión que la propuesta:

| quien crea | quien aprueba |
|---|---|
| residente | auxiliar **o** administrador |
| auxiliar | administrador |
| administrador | él mismo (publica directo) |

Principio: **nadie aprueba lo suyo salvo el administrador**. Dos decisiones la sostienen:

1. **`origen` se SELLA del rol real de quien inserta, y es inmutable.** Si se aceptara del cliente,
   un auxiliar podría declararse `administrador` y saltarse su escalón (hay prueba que lo intenta y
   falla). Si se leyera de la membresía viva al revisar, ascender a alguien cambiaría
   retroactivamente quién puede aprobar lo que ya publicó: **manda el rol que regía al crear**.
2. **`'residente'` queda preparado y NO ejercido**: en esta serie los residentes no tienen login
   (§0.1 A), así que hoy solo se ejercen los escalones 2 y 3. El primero se construyó y se prueba
   fuera de banda, porque el encargo de la hoja de ruta es que la capa externa no obligue a rehacer
   el modelo.

Mismo patrón que `guard_anuncio_transicion` (D-74): lista cerrada de transiciones, rol explícito y
**sellado de columnas siempre** —también fuera de banda—, separado de las comprobaciones de rol.
Además, **editar el contenido de una publicación viva se rechaza** (§12): hay que devolverla a
borrador, lo que limpia el sello anterior y obliga a una aprobación nueva.

**Tres identidades separadas**: `publicador_tercero_id` (de quién es el aviso — nunca público),
`creado_por` (quién lo capturó) e `identidad_publica` (cómo se firma — lo único público, texto libre
porque cuánta identidad mostrar es decisión de cada quien, §7). **No hay columna de contacto** a
propósito (§15, §22): el interés es el único canal, y eso es lo que hace verdad que la
administración ponga en contacto y se aparte. `fn_marketplace_listar` es **función y no vista**, por
el mismo motivo que `fn_directorio_listar`.

**Lo que se estudió y se decidió NO reutilizar: `solicitudes` (Atención)**, que el prompt 05 §14/§15
pedía evaluar. No encaja: es el radicado formal de una PQRS, con consecutivo anual, SLA, y
`inmueble_id`/`solicitante_ref` NOT NULL. Abrir un radicado con SLA por cada "me interesa un sofá"
la desnaturaliza; y para el reporte, quien reporta hoy es un miembro del equipo, que no tiene ni
tercero ni inmueble. Ambos son tablas propias ligeras. Sí se reutilizó `documentos` para las fotos,
con una columna FK más, como manda su patrón.

**Expirar SÍ se almacena, a diferencia de `autorizado` en EXS-5** (D-76), y la diferencia está
razonada: expirar es una transición real del ciclo de vida, con fila de historia, y lo expirado
**puede renovarse**; un permiso vencido no tiene nada que registrar porque la fecha ya lo dice.

**Las fotos van en `documentos` con la columna FK `publicacion_id`, y cerrarlas destapó tres cosas.**
(a) `v_documento_vigente` es un `select *`, y una vista NO hereda columnas agregadas después de
crearla: no exponía **ni `publicacion_id` ni `anuncio_id`**, así que el adjunto de anuncios de EXS-3
tampoco era visible. Recreada; su comentario ahora exige recrearla en la misma migración que añada
una FK de dominio. (b) `documentos` no tiene policy INSERT para `authenticated` — se extendió
`subir-documento` con `publicacion_id`, resolviendo el tenant contra la publicación. (c) **El
versionado habría borrado la galería**: la función agrupa por (tenant, tipo, alcance) asumiendo que
el alcance identifica UN documento (con `pago_id` siempre da version=1), pero una publicación tiene
VARIAS fotos — agrupadas, subir la del respaldo borraría de la vista la del frente. Para
publicaciones el agrupamiento se desactiva: cada foto es un documento propio. El tablón recibe
`portada_path` (RUTA, no URL: el bucket es privado y firma el cliente con su sesión).

**Hallazgo que NO se corrigió porque no está roto**: borrar una publicación con fotos falla con
`APPEND_ONLY: documentos no admite DELETE (SEC-14)`. `forbid_mutation_salvo_tenant_borrado` deja
pasar el DELETE justo cuando el tenant ya no existe —el único borrado real del sistema— y una
publicación no se borra nunca, se cierra. El CASCADE describe el único caso en que se ejerce; queda
escrito en el comentario de la columna (`20260933470000`).

Evidencia: 24 pruebas en `tests/rls/marketplace.test.ts`. Verificado en navegador el ciclo completo,
comprobando **en el DOM** que el tablón no contiene documento, correo, teléfono ni razón social legal
del tercero. Hallazgo de método anotado: **un UPDATE que no pasa la policy RLS no lanza error — la
filtra en silencio y afecta cero filas** (un INSERT sí falla con 42501). Pendientes declarados: cron
sin agendar en pg_cron, sin aviso al publicador cuando llega un interés (fn_notificar
va a un módulo, no a una persona sin login), sin visibilidad por segmento, y sin rate limiting ni
prevención de enumeración —que renacen con la capa externa.

## D-78

EXS-7 (Mis asuntos) — **agregación server-side sin tabla; el asunto se deriva del estado vivo y cada
rama filtra por quien puede ACTUAR, no por quien puede mirar.** Migración `20260933500000`. Ver
`Casos de uso/Experiencia y servicios/EXS_07_INFORME.md`.

**No hay tabla `mis_asuntos`**, y el porqué conviene dejarlo escrito porque la tentación de
materializar una bandeja vuelve cada vez que alguien mira el tiempo de respuesta: sería un espejo de
siete estados que ya viven en sus dominios, mantenido por triggers, y la primera vez que uno fallara
la bandeja mostraría trabajo inexistente o escondería trabajo real. `fn_mis_asuntos` agrega siete
ramas con `union all` sobre el estado vivo: aprobar el anuncio lo saca de la bandeja porque deja de
cumplir el `where`, no porque alguien lo borre. Misma familia que `autorizado` en EXS-5 (D-76) y la
mora en `v_cargo_saldo`. Consecuencia en la UI: **no hay botón de "marcar como hecho"** — ofrecerlo
permitiría ocultar trabajo sin hacerlo.

**ASUNTO ≠ NOTIFICACIÓN** (prompt 06 §13): una notificación desaparece cuando se LEE, un asunto
cuando se HACE. Por eso la función **no lee `notificaciones`**, aunque fuera la fuente más cómoda:
si lo hiciera, marcar un aviso como leído borraría de la bandeja un trabajo pendiente. Hay prueba
dedicada (emite por `fn_notificar`, marca leída, verifica que el interés sigue ahí).

**Filtrar por quien puede ACTUAR** es el matiz que hace útil la bandeja. Un auxiliar VE un anuncio
pendiente, pero `guard_anuncio_transicion` no le deja aprobarlo: ponérselo sería ruido que no puede
atender y entrenaría a ignorar la bandeja. Reparto: anuncios y reportes → administrador; permisos
por vencer → administrador (es quien renueva); intereses y publicaciones por expirar → auxiliar o
administrador; publicaciones por aprobar → **la escalera de EXS-6 tal cual** (residente: cualquiera
del equipo; auxiliar: solo administrador), sin reimplementarla — es la misma condición sobre
`origen`. `solicitudes` no pasa por `puede_ver_modulo` porque su policy es `is_member` a secas
(GOB-8): no se le inventa un gate que la tabla no tiene.

**Vencimientos** (decisión de Johnny): entran como asuntos con `vence_at`, ventana de 15 días
parametrizable. Se incluyen los YA vencidos —un permiso caducado sigue siendo trabajo— y el orden es
`vence_at nulls last, created_at`: primero lo que vence antes, y lo sin plazo por antigüedad, para
que lo que lleva meses parado no quede sepultado.

**Deep links**: no se inventó mecanismo — EXS-1 §4 ya lo cerró (enlaces internos relativos, sin
token, bastan sesión + RLS). Anuncios y Atención tienen página de detalle (`/anuncios/<id>`,
`/atencion/<id>`); marketplace y movilidad no, así que el contexto exacto se resuelve con parámetro
(`/marketplace?publicacion=<id>`, `/movilidad?vehiculo=<id>`) que la página lee al montar y abre el
drawer correspondiente. Nunca el home pelado del módulo (§12).

Evidencia: 13 pruebas en `tests/rls/mis-asuntos.test.ts`. Verificado en navegador: la bandeja mostró
3 asuntos de 2 módulos —incluido un anuncio real que ya llevaba tiempo pendiente en GC-001, prueba
de que agrega datos vivos—, se siguió el deep link hasta el drawer correcto, se atendió el interés y
al volver **la bandeja pasó de 3 a 2 sola**. Pendientes declarados: sin contador en el sidebar, sin
mantenimiento/cartera/gobierno (alcance cerrado en los 4 EXS + Atención), sin "asignado a mí" (solo
Atención tiene `asignado_a` hoy), y sin paginación.

## D-79

EXS-8 (hardening, QA y Golden Journey) — **la RLS impide escribir donde no debes, no escribir
demasiado: faltaba rate limiting en las escrituras que no pasan por Edge Function.** Migración
`20260933600000`. Cierra la serie EXS. Ver `Casos de uso/Experiencia y servicios/EXS_08_INFORME.md`.

**El hallazgo.** El prompt 05 §20 exige límites a la creación de publicaciones, reportes e
intereses, «reutilizando el mecanismo existente». El mecanismo existía (`check_rate_limit`, GAP-12)
pero **solo lo llamaban las Edge Functions** vía `_shared/rate_limit.ts`. Las escrituras de EXS-6
van por PostgREST directo contra la tabla, así que estaban sin techo: un miembro con sesión válida
podía crear diez mil publicaciones en un bucle. Los uploads sí estaban cubiertos sin planearlo —
`subir-documento` ya llamaba a `enforceRateLimit`, y las fotos de EXS-6 heredaron el límite al
engancharse ahí.

**La corrección**: `guard_rate_limit_escritura`, función compartida que toma bucket y máximo de
`tg_argv` (mismo patrón que `forbid_mutation_salvo_tenant_borrado`, compartida por 10 tablas), sobre
`publicaciones` (20/h), `publicacion_interes` (40/h), `publicacion_reporte` (**10/h**, el más bajo
porque reportar es barato y es la palanca del hostigamiento) y `vehiculos` (40/h). Tres decisiones:
(a) **el bucket lleva el uid** — un techo global dejaría que un usuario ruidoso bloqueara a toda la
copropiedad, convirtiendo el control de abuso en el abuso; (b) **fuera de banda no se limita**,
mismo criterio que toda la serie, con prueba que lo fija; (c) **el orden de disparo queda escrito en
la migración** — Postgres dispara los BEFORE por orden alfabético y `..._guard` precede a
`..._rate_limit`, que es lo deseable (un payload inválido no debe gastar cupo), pero depende de los
nombres y renombrar un trigger lo cambiaría en silencio.

**Lo auditado y verificado contra la base, no por lectura del código**: `ENABLE`+`FORCE RLS` en las
11 tablas de la serie; `search_path=''` en todas las funciones `security definer`; `revoke execute`
en todos los guards; `is_member` en las 5 funciones de lectura; ids UUID v4 no recorribles (§21).

**Lo que deliberadamente NO se hizo**: no se añadieron tokens contra enumeración —los ids son UUID
v4 y toda lectura pasa por RLS o por función que valida pertenencia, así que conocer un id no da
acceso: sería criptografía sin amenaza—, ni rate limiting de lecturas (sin superficie de scraping
con solo miembros autenticados y catálogos del tamaño de un edificio).

Evidencia: **32 pruebas nuevas**. `exs8-hardening.test.ts` (14) ataca IDOR, manipulación de tenant,
enumeración, PII y volumen **con una sesión legítima de otra copropiedad** —el atacante interesante
es el que tiene cuenta—. `exs8-golden-journey.test.ts` (18 pasos dependientes, en orden) recorre los
seis cortes que construyeron algo y verifica que **encajan entre sí**: el anuncio que redacta el
auxiliar cae en la bandeja del administrador y no en la suya; el auxiliar no aprueba lo suyo en
marketplace; un administrador de dos copropiedades ve cada bandeja por separado. Esos tres pasos son
los que justifican el recorrido — ninguna suite aislada los habría detectado, porque cruzan módulos.

**Deuda abierta de la serie completa** (inventario, no del corte): ningún cron agendado en pg_cron
—`cron_anuncios_publicar_programados` y `cron_marketplace_expirar` existen y nadie los llama, así
que la publicación programada y la expiración no ocurren solas—; nada de la serie está en el
proyecto remoto; sin aviso al publicador cuando llega un interés; sin visibilidad por segmento; sin
contador de asuntos ni paginación; tipos generados desde local en los ocho cortes.

## D-80

Cierre operativo de la serie EXS — **los dos crons quedan agendados y la serie se despliega en el
proyecto remoto correcto.** Migración `20260933700000`.

**Los crons que faltaban.** EXS-3 y EXS-6 escribieron `cron_anuncios_publicar_programados` y
`cron_marketplace_expirar` siguiendo el patrón del repositorio, correctas e idempotentes, y **nadie
las llamó nunca**: la publicación programada y la expiración no ocurrían solas. No había forma de
notarlo —un cron que no existe no da error, solo deja trabajo sin hacer—.

**Las dos frecuencias son distintas, por el grano del dato que comparan:**
`fn_anuncio_publicar_programados` compara `publicar_at <= now()`, un TIMESTAMP: con un cron diario,
un anuncio pedido para las 15:00 saldría a la mañana siguiente, lo que vacía de sentido la palabra
"programado" — va **cada 15 minutos**. `fn_publicaciones_expirar` compara
`vigente_hasta < current_date`, una FECHA: nada cambia dentro del día — va **diaria a las 05:00 UTC**
(medianoche en Colombia, para que el tablón esté limpio cuando alguien lo mire).

**Prueba de gobernanza nueva** (`tests/governance/crons-agendados.test.ts`): toda función `cron_*`
tiene que estar agendada en `cron.job`. El nombre `cron_*` es una promesa —"esto lo dispara el
scheduler"— y ahora es exigible; si alguien la escribe y olvida el `cron.schedule`, lo dice la
suite en vez de descubrirlo un usuario meses después. Incluye una lista explícita de excepciones
documentadas, hoy vacía.

**Despliegue.** Destino: **`hwjmlyzzvpmhadldavbq` (Scala - Aquila)**, ca-central-1 — el proyecto que
la aplicación usa de verdad. Se aplicaron las 27 migraciones de la serie
(`20260933000000`–`20260933700000`) tras un dry-run que confirmó el alcance exacto: ninguna
migración ajena. Verificado contra el remoto: 11 tablas con `FORCE RLS`, 2 crons activos, las
funciones con `search_path=''` y los guards sin `execute` para `authenticated`.

**`enviar-anuncio` era IMPOSIBLE de desplegar desde EXS-3**, y nadie lo había notado: la función
existía en el repositorio pero le faltaban su `deno.json` (usa imports npm bare) y su entrada en
`config.toml`. Sin ellos el despliegue simplemente no la incluía, sin error. Corregido y desplegada,
junto con `subir-documento` actualizada (la de remoto era v14, sin el alcance `publicacion_id`).

**Riesgo que queda abierto y NO se tocó**: `.env.production` sigue apuntando a
`alfftzoxwsurvzknsczs` (Scala-Prod), que no es donde vive la aplicación. El push de hoy se dirigió
al proyecto correcto pasando `SUPABASE_DB_URL` por entorno, sin modificar ese archivo — contiene
credenciales y moverlas no es algo que deba hacerse de oficio. **Mientras siga así, un
`pnpm db:push:prod` a secas apunta al proyecto equivocado.**

## D-81

Cierre de los tres pendientes que dejó D-80, y **un fallo de EXS-2 que solo apareció al usar la
campana con el ratón**. Migración `20260933710000`.

**1 · Tipos regenerados contra el remoto.** Los ocho cortes de la serie derivaron
`database.generated.ts` y `database.types.ts` de la base local, porque `pnpm db:types` exige un
project ref remoto. Con la serie ya aplicada en `hwjmlyzzvpmhadldavbq`, se regeneraron desde ahí:
la lista de tablas coincide exactamente con la versión local —confirmación independiente de que
local y remoto están alineados— y vuelve el bloque `PostgrestVersion` que la generación local no
emite.

**2 · `.env.production` corregido.** Pasa a apuntar a `hwjmlyzzvpmhadldavbq` (Scala - Aquila),
tomando las cinco claves de `.env.remoto`. Hasta hoy apuntaba a `alfftzoxwsurvzknsczs`
("Scala-Prod"), cientos de migraciones por detrás y ajeno a la aplicación: un `pnpm db:push:prod`
a secas iba al destino equivocado, y el push de D-80 tuvo que esquivarlo pasando `SUPABASE_DB_URL`
por entorno. El archivo anterior queda en `.env.production.scala-prod.bak` —lo que sea
`alfftzoxwsurvzknsczs` sigue sin decidirse, y hasta saberlo no se le aplica nada—. Ambos están
cubiertos por `.gitignore` y ningún valor salió del disco.

**3 · La campana de EXS-2, verificada en navegador — y rota.** Era el único corte de la serie que
nunca se había mirado con los ojos. El panel abre, el contador cuenta, la leída aparece atenuada y
marcar leída persiste por persona: todo eso funciona. **El enlace no.** Dos de los tres puentes de
detección apuntaban a páginas que no existen:

| Emitía | La página real es |
|---|---|
| `/finanzas/flujo` | `/finanzas/flujo-proyectado` |
| `/gobierno` | `/gobierno/tablero` (no hay índice) |

En la base local eran **142 de 246 avisos** que terminaban en "Page not found". El tercero
(`/mantenimiento/inventario`) y el de anuncios (`/anuncios/<id>`) sí resolvían.

**Por qué nadie lo vio, que es lo interesante.** Nada en el camino falla: `fn_notificar` no conoce
el router del front, el trigger se traga sus propios errores a propósito (la detección es el dato
duro, el aviso es conveniencia), y la prueba de EXS-2 comprobaba que el aviso se emite **con su
enlace**, no que el enlace resuelva — de hecho `tests/rls/notificaciones.test.ts` fijaba el literal
roto y pasaba en verde. Un enlace muerto solo se nota pulsándolo.

Se corrigen las dos funciones **y las filas ya emitidas**: arreglar solo el emisor dejaría el 404
vivo en la campana de quien ya lo tenía.

**Prueba de gobernanza nueva** (`tests/governance/enlaces-notificaciones.test.ts`), hermana de la
de crons: cada `p_enlace` literal tiene que resolver contra las páginas reales de
`apps/web/app/pages`, y ninguna notificación viva puede apuntar a una ruta inexistente. **Lee la
definición viva en `pg_proc`, no las migraciones** — una migración es historia inmutable y el
literal equivocado sigue escrito en la que lo introdujo aunque un `create or replace` posterior ya
lo haya corregido. Así el próximo renombrado de página lo dice la suite, no un usuario.

## D-82

**Adjuntos de anuncios: la columna existía desde EXS-3 y no había puerta.** Migración
`20260933720000`.

`documentos.anuncio_id` está desde `20260933110000`, y hasta hoy **nadie podía escribirla**:
`documentos` no tiene policy INSERT para `authenticated` (SEC-14), toda subida pasa por la Edge
Function `subir-documento`, y esa función no conocía el parámetro. Solo `service_role` podía
adjuntar, y nadie leía la columna. Desde EXS-6 además era visible en `v_documento_vigente`, lo que
la hacía parecer terminada. Es el caso opuesto al de D-81: allá el emisor apuntaba a una página que
no existía; aquí el dato tenía sitio y no tenía camino.

**La decisión de producto: no se adjunta a un anuncio ya publicado.** Al publicar, el anuncio
recibe consecutivo y `guard_anuncio_transicion` congela sus columnas. Un adjunto posterior
cambiaría lo que los residentes vieron bajo esa misma referencia y, siendo `documentos`
append-only, tampoco podría retirarse: el error quedaría a la vista para siempre. Quien necesite
añadir algo redacta otro anuncio, que es lo que deja rastro. Admiten adjunto `borrador`,
`pendiente_revision`, `aprobado`, `programado` y `rechazado` —todos anteriores a la publicación,
incluido el devuelto por el revisor—; lo rechazan `publicado`, `archivado` y `cancelado`.

El guard vale **también fuera de banda**: el sellado no depende del actor, así que ni `service_role`
puede adjuntar a un anuncio publicado. Es el mismo criterio de toda la serie —comprobaciones de rol
solo con actor, sellado siempre— y aquí se ejerce sobre la integridad de lo comunicado.

**Y el hueco que faltaba desde EXS-3**: `guard_documento_tipo_familia` validaba que el inmueble, el
caso jurídico, el envío y la publicación citados fueran del mismo tenant, pero **no el anuncio** —
era el único alcance de `documentos` sin esa validación. Ahora responde `ANUNCIO_INVALIDO`.

**Sin versionado entre adjuntos**, igual que las fotos del marketplace: la convocatoria y el
presupuesto anexo son dos documentos, no dos versiones de uno. Si se agruparan, subir el segundo
haría desaparecer el primero de `v_documento_vigente`.

**La pantalla** es un componente propio (`AnuncioAdjuntos.vue`) y **no** `UiLibreriaDocumentos`:
aquella está construida sobre el versionado —muestra "próxima versión" y reemplaza lo anterior—, y
aquí ocurre lo contrario; meter ambos comportamientos en un componente con una bandera lo volvería
más difícil de leer que tener dos.

**Verificado en navegador y contra la Edge Function real**: dos adjuntos suben con `grupo_id`
distinto y `version: 1` cada uno, sus URLs firmadas devuelven los PDF, y al publicar el anuncio la
sección queda en solo lectura con los adjuntos aún visibles. 4 pruebas nuevas en
`tests/rls/anuncios.test.ts` (20 en total).

## D-83

**El grupo de pendientes baratos de la serie EXS**, los cinco que ya no dependían de nada.
Migraciones `20260933800000` y `20260933810000`.

Antes de ejecutarlos, dos de los pendientes de la lista resultaron estar mal clasificados y se
corrigen aquí: **«visibilidad por segmento» no depende de la capa externa** —el motor de audiencias
de GOB-9 (`gobierno_segmento_destinatarios`, 5 criterios) es genérico y `fn_anuncio_destinatarios`
no es más que su envoltorio—, y **«prevención de enumeración» no es un pendiente sino una pregunta
cerrada en EXS-8**: los ids son UUID v4 y toda lectura pasa por RLS o por función que valida
pertenencia, con pruebas que lo fijan.

**1 · Contador de «Mis asuntos» en el sidebar.** Mismo criterio que la campana: el número tiene que
verse sin entrar a la pantalla, porque su razón de ser es avisar. Comparte store con `/asuntos`, así
que abrir la bandeja no vuelve a consultar. Colapsado no cabe un número: se pinta un punto y el
total va al `title`, que es lo único que le queda a quien navega con teclado. En cero no se pinta
nada — una insignia en cero enseña a ignorar la insignia.

**2 · Paginación de la bandeja**, 20 por página, **en cliente**. La bandeja ya viene acotada a lo
que el usuario puede atender y en un edificio eso son decenas de filas (AD-24); bajar `limit/offset`
a `fn_mis_asuntos` obligaría a repetir siete ramas y un `union all` en cada cambio de página. Cambiar
de filtro reinicia a la página 1: si no, filtrar desde la página 3 dejaría la lista en blanco.

**3 · «Asignado a mí».** `fn_mis_asuntos` gana una columna, `asignado_a`, y **DROP + CREATE** porque
cambia el tipo de retorno. De las siete ramas solo Atención tiene dueño (`solicitudes.asignado_a`,
GOB-8); en las otras seis es null **y eso significa algo**: ese trabajo le toca a quien pueda, no a
una persona. Repartir nominalmente un anuncio pendiente sería inventar un proceso que el dominio no
tiene. En la fila solo se marca lo tuyo: decir «lo lleva otra persona» exigiría traer su nombre, y
saber quién lo lleva es cosa de la pantalla del dominio. El filtro entero solo aparece si hay
asignaciones.

**4 · Fotos del directorio.** Cuarta FK de dominio en `documentos`, y la primera que nace completa:
columna, índice parcial, **la vista recreada en la misma migración** —`v_documento_vigente` es un
`select *` y este repositorio ya tropezó cuatro veces con que no hereda columnas nuevas— y **el
guard con la validación de tenant desde el primer día**, que es justo lo que a `anuncio_id` le faltó
durante todo EXS-3. Cuelga del **perfil** y no del tercero porque el perfil es lo publicable:
despublicar la ficha deja la imagen sin sitio por construcción. Sin versionado entre imágenes, como
marketplace y anuncios. `fn_directorio_listar` devuelve ahora `perfil_id` (sin él la pantalla no
puede subir ni listar) y la portada como RUTA, no como URL firmada.

**5 · Enlace directorio → marketplace, como BÚSQUEDA y no como consulta por tercero.** Es la
decisión menos obvia del corte. El tablón expone `identidad_publica` y **nunca** el tercero que
publicó (EXS-6): cruzar ficha y avisos por `publicador_tercero_id` delataría, en todos los demás
avisos, a quién pertenece cada uno. El enlace lleva a `/marketplace?texto=<nombre comercial>`, que
no revela nada que el usuario no pudiera teclear él mismo. La versión fuerte —que una publicación
declare su ficha del directorio con una FK opt-in, legítima porque ese negocio ya es público— queda
propuesta y sin hacer: es columna nueva y decisión de producto, no parte de este grupo.

**Componente compartido**: `AnuncioAdjuntos` se generalizó a `UiGaleriaDocumentos`, que ahora sirve
a anuncios y a directorio. Sigue sin ser `UiLibreriaDocumentos`, y por la misma razón de siempre:
aquella está construida sobre el versionado y aquí subir añade, no reemplaza.

Verificado en navegador con datos reales: portada en la tarjeta, enlace que deja el buscador del
tablón relleno, insignia de 26 en el sidebar (punto y tooltip al colapsar), paginación «1–20 de 26»
y el filtro «Asignados a mí (8)» dejando 8 filas, todas marcadas. 4 pruebas nuevas (15 en
mis-asuntos, 14 en directorio).

## D-84

**MOV-1 — bitácora de portería, ocupación derivada y cupos de parqueadero.** Migraciones
`20260933900000`–`20260933940000`. Tercer corte sobre movilidad, tras EXS-5.

**Lo que NO se creó, que es la mitad del diseño.** Antes de modelar se revisó qué existía ya:

- **No hay tabla de cupos.** El parqueadero como BIEN PRIVADO es un `inmuebles` de tipo
  `parqueadero` —con matrícula y coeficiente— y como ÁREA COMÚN DE USO EXCLUSIVO es una
  `zonas_comunes` con `uso_exclusivo_inmueble_id`. Son dos figuras jurídicas distintas y el
  repositorio ya modelaba ambas. Movilidad referencia ese inventario; no lo administra.
- **No se duplicó `mant_registros_acceso`** (MANT-11), que registra el ingreso de PERSONAS contra
  una autorización. `vehiculo_paso` registra VEHÍCULOS, en los dos sentidos, con o sin
  autorización. Cuando coinciden —una visita en carro— apuntan a la misma autorización sin copiar
  nada.

**Y un error que cometí y conviene que quede escrito**: la primera versión de `20260933930000`
añadía `cupo_inmueble_id`… sin ver que `inmueble_id` YA ERA el cupo, documentado así por EXS-5
(«el parqueadero asignado es un inmueble más»). Es exactamente la duplicación contra la que
advertía su propia cabecera. Se corrigió: solo se añade `cupo_zona_id`, que era la figura que
faltaba. **Antes de añadir una columna a una tabla ajena, leer los comentarios de las que ya
tiene.**

**La decisión central: el cupo AVISA, no impide.** Si el parqueadero de visitantes está lleno y
entra un carro igual —lo autorizó el portero, era una ambulancia—, el hecho ocurrió. Una función
que rechazara el registro dejaría el vehículo dentro y **fuera de la bitácora**, que es el peor
resultado posible: se pierde justo el dato que después hará falta. `fn_vehiculo_registrar_paso`
nunca niega; devuelve cuántos hay dentro y cuántos caben. Es el mismo criterio que hace que la
tabla registre **también lo no autorizado**: un sistema que solo sabe anotar lo correcto no sirve
para averiguar qué pasó.

**`autorizado` se guarda, y es la excepción a «no persistir lo derivado».** EXS-5 lo calcula en
vivo, que es correcto para «¿puede entrar ahora?». La bitácora responde otra pregunta: «¿estaba
autorizado CUANDO entró?». Revocar hoy un permiso no puede cambiar un hecho de hace un mes. Se
guarda la foto, no la fórmula — y hay prueba que lo fija.

**«Qué hay dentro» es derivado**, del último paso de cada placa: no hay tabla de ocupación que
mantener sincronizada, y un registro olvidado se corrige registrando, no editando.

**Los dos caminos de entrada, sin tocar MANT-11.** El portero teclea, o llega un QR. Con
autorización, la función delega el consumo de un solo uso en `fn_autorizacion_visita_marcar_usada`,
que sigue siendo la dueña de esa regla. **Solo la entrada consume**: negar la salida contra una
autorización ya `usada` dejaría la bitácora con una entrada sin cierre.

**Octava rama de «Mis asuntos»**: el visitante que excedió `horas_max_visitante`. Va a la bandeja y
no a una notificación porque no es un evento que se lee, es trabajo que sigue ahí hasta que el
carro se va — y **desaparece solo** cuando la portería registra la salida, sin que nadie cierre
nada.

**Tres reglas que el guard de EXS-5 no tenía** y se cierran aquí: el inmueble del permiso es del
mismo tenant (validaba el del vehículo, no el del inmueble), es de tipo `parqueadero`, y un cupo no
puede tener dos permisos vigentes (índices únicos parciales).

Verificado en navegador de punta a punta: placa desconocida registrada con aviso, «Dentro ahora»
derivado, bitácora filtrable, configuración de capacidad guardada y el aviso de exceso saliendo con
el conteo real. 13 pruebas nuevas, incluidas la del QR —que comprueba que produce ingreso de
persona Y paso de vehículo— y la de la bandeja.

**Pendiente consciente**: la lectura automática de placa (LPR) queda fuera — depende de hardware y
de un proveedor externo, y se evaluará cuando haya un edificio pidiéndolo.

## D-85

**Terminar un órgano de gobierno exige confirmación, fecha y motivo.** Migración `20260934000000`.
Pedido directo del usuario: el botón "Terminar" de `/gobierno/organos` cerraba el órgano al primer
clic, sin preguntar nada — vigente_hasta quedaba fijo en la fecha de hoy y no quedaba ningún
rastro de por qué.

**El motivo se exige en la base, no solo en la UI.** Mismo patrón que `motivo_revocacion` en
`vehiculo_permiso` (EXS-5) y en `atencion_tokens_consulta` (GOB-8): columna
`motivo_terminacion` nullable + CHECK `gobierno_organos_terminacion_con_motivo` que exige
texto no vacío en cuanto `vigente_hasta` deja de ser null. La UI es la primera barrera, no la
única — un `UPDATE` directo sin motivo también falla.

**Backfill antes del CHECK.** Ya existía al menos un órgano terminado sin motivo (dato de
prueba anterior a este cambio); la migración lo rellena con un texto explícito
("Motivo no registrado…") antes de agregar la restricción, para no romper `ADD CONSTRAINT`
contra datos existentes — el mismo problema, documentado, que ya había aparecido con vistas
`select *` en otros cortes.

**UI**: nuevo drawer (`UiDrawer`, mismo componente que el resto de la pantalla, no un modal
nuevo) con la fecha editable (por defecto hoy) y el motivo obligatorio — el botón de
confirmar queda deshabilitado hasta que hay texto. No toca miembros ni atribuciones vigentes
del órgano: eso se termina aparte, a propósito (evita que un clic cierre en cascada algo que
el usuario no pidió cerrar).

Verificado en navegador: intentar confirmar sin motivo no hace nada (el órgano sigue vigente);
con motivo, el órgano pasa al historial con la fecha y el motivo correctos. Prueba nueva en
`tests/gobierno/organos.test.ts` (13) cubre el CHECK: sin motivo falla, motivo en blanco falla,
con motivo pasa.

## D-86

**Terminar un órgano cierra en cascada a sus miembros y atribuciones (complemento a D-85).**
Migración `20260934010000`. Pregunta directa del usuario tras ver el mensaje de confirmación:
"¿cómo van a ser miembros de un órgano que ya no existe?" — tenía razón. Antes, terminar el
órgano dejaba `gobierno_miembros.hasta`/`gobierno_atribucion.vigente_hasta` intactos: ninguna
alerta se equivocaba (todas filtran primero `vigente_hasta is null` del propio órgano), pero la
pantalla seguía mostrando "vigentes" cosas que ya eran historia.

`fn_gobierno_organo_terminar(p_organo_id, p_tenant_id, p_vigente_hasta, p_motivo)` agrupa las
tres actualizaciones en una transacción: termina el órgano, y cierra (con la misma fecha) solo
a los miembros y atribuciones que **seguían vigentes en ese momento** — a quien ya había salido
antes no se le toca su fecha real, y a un miembro con `desde` futuro no se le cierra
retroactivamente. `security invoker`, no `definer`: las tres tablas ya exigen rol auxiliar vía
RLS: la función solo las agrupa, no se salta nada.

El mensaje de confirmación ahora dice explícitamente que los miembros quedan cesantes.

## D-87

**La búsqueda general (Ctrl+K) ahora cubre nueve dominios más.** Migración `20260934020000`.
Pedido del usuario: "ahora existen más dominios en la aplicación, necesito alimentar la barra de
búsqueda general". Se preguntó qué dominios priorizar (AskUserQuestion) — el usuario eligió los
cuatro grupos ofrecidos completos: anuncios, vehículos, solicitudes (PQR), gobierno (órganos,
reuniones, decisiones), mantenimiento (órdenes de trabajo, hallazgos) y cartera (acciones de
cobranza). Nueve categorías nuevas sobre `fn_buscar_global` (ya extendida dos veces:
20260830410000, 20260919100000), mismo patrón exacto: tsvector generado + GIN por tabla.

**Dos tablas sin nombre propio** (`gobierno_reuniones`, `acciones_cobranza`) resuelven el título
con un join a `lista_tipos` en la propia consulta (igual que ya hacía la rama "documento"), no en
la columna generada — un GENERATED no puede depender de otra tabla.

**Un enum dentro de una columna GENERATED no pasa el chequeo de inmutabilidad de Postgres**,
aunque el cast en sí lo sea (SQLSTATE 42P17) — `tipo_accion`/`canal` de `acciones_cobranza`
quedaron fuera del tsv por eso, no hace falta que estén en el texto buscable porque ya se filtran
por categoría.

**`hallazgo_mantenimiento` es una categoría aparte de `hallazgo`** (auditoria_hallazgos,
20260919100000): dos tablas, dos pantallas — fusionarlas habría sido inventar una equivalencia
que el dominio no tiene.

De paso, un bug real encontrado en el propio código que tocaba: `BusquedaGlobal.vue` enrutaba
"agrupacion" a `/configuracion/agrupacion` (singular) cuando la ruta real es
`/configuracion/agrupaciones` — `BusquedaResultadoFila.vue`/`BusquedaResultados.vue` ya lo tenían
bien. Corregido de paso por estar en el mismo mapa que ya se estaba editando.

**Triplicación existente, no nueva**: la categoría→ruta vive en tres sitios
(`BusquedaGlobal.vue`, `BusquedaResultadoFila.vue`, `BusquedaResultados.vue`) — ya así antes de
este corte. Se respetó la arquitectura existente en vez de refactorizarla sin que se pidiera;
`Record<CategoriaBusqueda, …>` en los tres sitios hace que TypeScript falle si falta una entrada
al añadir una categoría, así que no hay riesgo silencioso de olvido.

Pruebas: `tests/rls/busqueda-global-dominios.test.ts` (nuevo) cubre anuncio/vehiculo/
organo_gobierno/reunion_gobierno/solicitud con fixtures propias + aislamiento entre tenants. Las
otras cuatro categorías (decision_gobierno, orden_trabajo, hallazgo_mantenimiento,
accion_cobranza) se probaron con una prueba añadida a la suite dueña de cada entidad
(decisiones.test.ts, ot-incidencias.test.ts, inspecciones-hallazgos.test.ts,
cartera-cobranza-aprobacion.test.ts), reutilizando sus fixtures reales en vez de reconstruir
cadenas de dependencias ya cubiertas en otro sitio.

**Infraestructura, no código**: durante esta sesión el contenedor Kong y el de Edge Runtime
quedaron en un estado colgado tras un reinicio de Docker Desktop ajeno a este trabajo (Docker
los reportaba "healthy" pero no respondían ni a sí mismos) — se resolvió con `docker restart`
puntual sobre cada uno, no con cambios de código. Una prueba estructural preexistente
(inspecciones-hallazgos.test.ts #18, conexión `pg` directa al puerto 54322) quedó fallando por
la misma familia de problema (el puerto crudo de Postgres, no REST/RPC) — no relacionado con
este corte.

## D-88

**Mantenimiento de activos fijos, Fase 1 (Registro Maestro)** — el usuario suministró
`Casos de uso/Activos fijos/PROMPT_IMPLEMENTACION_MANTENIMIENTO_ACTIVOS_AQUILA.md`, un prompt de
1457 líneas/42 secciones, pidiendo explícitamente contrastarlo contra el código real antes de
implementar nada ("necesito que contrastes, compares, validez, y analices la objetividad del
prompt... proceder a implementarlo una vez lo autorice"). El contraste (agente Explore + lectura
directa de migraciones) confirmó que casi todo lo que el prompt describe **ya existe**: tabla
`public.activos` (33 columnas, MANT-0), guards `guard_activo_ficha`/`guard_activo_transicion`,
`fn_mant_capitalizar_activo`/`fn_mant_dar_baja_activo`, PPE vía `mant_ppe_por_activo`, criticidad
vía `mant_criticidad`/`mant_activo_criticidad` (MANT-1) — con algunas correcciones puntuales
(roles reales `administrador|auxiliar|auditor`, no los 4 roles ficticios del prompt;
`mant_activo_criticidad` es tabla, `mant_criticidad` es la RPC; PPE no se guarda en `activos`,
se deriva). Lo único que genuinamente faltaba era la **UI de registro/mantenimiento** —
`mantenimiento/activos/index.vue` era una lista mínima de 58 líneas sin filtros, KPIs, ni
creación (MANT-1 §3.7: "MANT-0 no construyó esta pantalla").

El usuario autorizó implementar por fases, empezando por **Fase 1 (Registro Maestro)**: nuevo
diseño de lista con KPIs, búsqueda, filtros combinables, tabla y paginación — sin botón "Nuevo
activo" (eso es Fase 2, un botón que hoy no llevaría a ningún lado es peor que no tenerlo, §27
del prompt). Dos ambigüedades de diseño (estructura de tabs; qué KPIs/columnas mostrar) se
resolvieron con el usuario vía `AskUserQuestion`: en ambos casos eligió seguir las imágenes de
referencia que suministró por encima de lo que decía el prompt.

**Una sola pieza de backend nueva**, justificada explícitamente contra la propia regla del
prompt (§33, "solo crear backend nuevo cuando exista una necesidad funcional real que no pueda
resolverse con lo existente"): `mant_activos_listado(p_tenant_id)` (migración `20260934030000`).
Necesaria por dos razones concretas, no por preferencia:

1. `mant_criticidad(activo_id)` es por-activo y **lanza excepción** (`CRITICIDAD_SIN_SET_VIGENTE`/
   `CRITICIDAD_EVALUACION_INCOMPLETA`) cuando al activo le falta evaluar algún criterio del set
   vigente — diseño deliberado de MANT-1 ("la criticidad sin desglose no sirve"). Llamarla una
   vez por fila en una lista de 100+ activos no solo sería N+1: tumbaría el listado entero en
   cuanto UNO no tuviera evaluación completa. La función nueva calcula la misma fórmula
   (Σ peso×puntaje/100 contra el set vigente) en conjunto y devuelve `criticidad_banda = null`
   para el que le falte algo, sin lanzar nunca.
2. No existía ningún agregado de "último/próximo mantenimiento" por activo. Se agregan aquí,
   sin reinventar nada más: `valor_neto` viene tal cual de `mant_ppe_por_activo` (MANT-0, no
   recalculado), `ultimo_mantenimiento` = `MAX(cerrada_at)` de `mant_ordenes_trabajo`,
   `proximo_mantenimiento` = `MIN(fecha_programada)` de `mant_programaciones` pendientes.

`security invoker` explícito: la función no se salta ningún RLS, hereda el `_select_miembro` de
cada tabla que toca — por eso un `auditor` ve exactamente lo mismo que un `administrador`
(prueba 10 de `activos-listado.test.ts`), la autorización es de membresía, no de rol.

**INSERT/UPDATE de activos no necesitó ninguna RPC nueva** — RLS + los guards de MANT-0/MANT-1
ya existentes cubren casi todas las validaciones que el prompt pedía; eso queda para Fase 2
(Crear/Editar), que el usuario no ha autorizado todavía.

**El store `activos.ts`** gana `listado`/`cargandoListado`/`cargarListado` (RPC) sin tocar lo que
ya existía (`activos`/`cargarActivos`/`cargarFicha` siguen siendo usados por la ficha 360° y por
el selector de activo de `ordenes-trabajo/index.vue`). La página combina ambos orígenes por
`id` (un `Map`) para tener en una sola fila tanto los campos resueltos por el RPC (nombres,
criticidad, valor neto, fechas) como los crudos de `activos` (marca/modelo/serial/fabricante) —
un cruce, no un cálculo nuevo en Vue.

**Convención de tabla confirmada, no inventada**: este repo no usa `UTable` en ningún sitio
(grep confirmado) — la tabla nueva sigue el patrón real de `contabilidad/libros.vue`
(`<table class="w-full text-sm">`/`<thead class="bg-muted/30">`), y la paginación en cliente
sigue el patrón de `asuntos/index.vue` (`POR_PAGINA`/`pagina`/`totalPaginas`), justificado por
AD-24 (un tenant = una copropiedad, el dataset completo siempre está acotado al tamaño de un
edificio real).

Pruebas: `tests/mantenimiento/activos-listado.test.ts` (nuevo, 10 pruebas) — tenant vacío sin
error; resolución de nombres/ubicación (con y sin agrupación·zona); `valor_neto` idéntico al de
`mant_ppe_por_activo` sin recalcular; `criticidad_banda = null` con evaluación incompleta
**mientras `mant_criticidad` sí lanza** para el mismo activo (prueba de control que confirma que
el problema evitado es real); banda correcta con evaluación completa; `ultimo_mantenimiento`
como `MAX(cerrada_at)` ignorando OT abiertas; `proximo_mantenimiento` desde un plan activado;
aislamiento entre tenants; auditor ve lo mismo que administrador.

**Hallazgo de esta sesión, no un bug**: `fn_mant_cerrar_ot`'s `p_fecha_cierre` alimenta
`mant_cumplimiento`/el encadenamiento de `mant_programaciones`, pero `cerrada_at` siempre es
`now()` — y una vez cerrada, la OT es inmutable (`OT_CERRADA_INMUTABLE` bloquea tocar
`cerrada_at` después). La prueba 7 se ajustó para cerrar OTs de verdad y comparar contra
`MAX(cerrada_at)` leído en vivo, en vez de forzar una fecha arbitraria.

## D-89

**Mantenimiento de activos fijos, Fase 2 (Crear/Editar)** — continuación de [[D-88]]. Igual que
en Fase 1, **ninguna migración nueva**: crear/editar la ficha maestra ya estaba enteramente
cubierto por RLS (`activos_insert_auxiliar`/`activos_update_auxiliar`, MANT-1) + los guards de
MANT-0 (`guard_activo_ficha`), así que el store (`activos.ts`) solo agrega dos envoltorios de
una línea, `crearActivo`/`actualizarActivo` (INSERT/UPDATE planos) — nada que ya no hiciera la
base, tal como pide el prompt §11 ("la interfaz debe reflejar las validaciones existentes en
PostgreSQL, nunca depender exclusivamente del frontend").

**Un solo componente para crear y editar** (`ActivoFormDrawer.vue`, bajo
`components/mantenimiento/activos/`): la única diferencia entre los dos modos es si la prop
`activo` trae una fila o es `null`. Seis secciones (§10 del prompt): Identificación,
Clasificación, Ubicación, Información técnica, Fechas, Información contable — con validación
de cliente reducida a un solo chequeo (código duplicado, por UX, replicando el patrón ya usado
en `ConceptosEditor.vue`), porque el resto de casos de §11 (categoría/tipo válidos, jerarquía sin
ciclos, bloque contable completo, bien esencial no capitalizable...) ya los rechaza
`guard_activo_ficha` con un mensaje en español listo para mostrar tal cual (`mensajeError`,
`apps/web/app/utils/error-message.ts`) — no hacía falta traducir nada.

**§12 del prompt aplicado literalmente**: una vez `capitalizado = true`, el bloque contable
completo (cuenta, centro de costo, valor adquisición, valor residual, vida útil, método de
depreciación, fecha inicio depreciación) y el propio interruptor `capitalizado` quedan de solo
lectura en el formulario de edición — un `UPDATE` plano después de capitalizar podría descuadrar
asientos ya contabilizados, y la vía correcta (`fn_mant_capitalizar_activo`/
`fn_mant_dar_baja_activo`) es Fase 4, todavía sin UI. Verificado en navegador editando EXT-001
(capitalizado, sembrado en Fase 1): 11 campos deshabilitados + aviso visible; editando un activo
sin capitalizar (creado en esta misma verificación): 0 campos deshabilitados, guardado real
confirmado por consulta directa a la base.

**Selectores reutilizan stores/convenciones ya existentes, no se inventó ninguno**:
`agrupacionesStore.arbolPlano` (ruta tipo "Torre A / Piso 3", ya resuelta), `zonasComunesStore`,
`contabilidadStore.cuentasDeMovimiento` filtrado a clase 15 (guía visual hacia lo que el guard
va a aceptar, sin reimplementar el chequeo — el guard sigue siendo la autoridad), catálogo
`CENTRO_COSTO` vía `cargarListaTipos`. `UiSelectorBuscable` para catálogos largos/jerárquicos
(agrupación, zona común, cuenta contable, activo padre), `USelect` para enumeraciones fijas
(categoría/tipo del propio activo, naturaleza del bien, origen, método de depreciación) —
criterio ya fijado en CLAUDE.md, no una decisión nueva de este corte.

**Atributos técnicos dinámicos NO se editan en este drawer** (aunque §10.4 los lista dentro de
"Información técnica"): el editor ya existe en la ficha (`[id].vue`, MANT-1 §3.7) y depende del
`tipo_id` ya persistido — duplicar un segundo editor de atributos en el formulario de creación
habría sido la misma experiencia dos veces por dos caminos distintos. El drawer deja una nota
explícita señalando dónde editarlos.

**Hallazgo de esta sesión, no un bug**: Nuxt resuelve un componente bajo
`components/<carpeta>/<Archivo>.vue` con el nombre con PREFIJO de carpeta
(`MantenimientoActivosActivoFormDrawer`, no `ActivoFormDrawer`) — el mismo patrón que ya usan
`MantenimientoInspeccionesInspeccionDrawer`/`HallazgoDrawer` en `mantenimiento/inspecciones/
index.vue`. Usar el nombre corto en la plantilla falla en silencio (`[Vue warn]: Failed to
resolve component`, sin romper el resto de la página) — se detectó en la verificación de
navegador, no en build/typecheck/lint (ninguno de los tres lo atrapa).

**`USelect` no acepta `null` como `model-value`** (a diferencia de `UiSelectorBuscable`/
`UInputNumber`, que sí) — los cuatro campos que lo usan con un valor opcional (`categoriaId`,
`tipoId`, `centroCostoId`, `metodoDepreciacion`) se tipan `| undefined` en el estado del
formulario, no `| null`, y se convierten a `null` solo al armar el payload hacia Supabase.
`tsc` lo atrapó de inmediato (cuatro errores exactos, uno por campo) — no fue necesario
descubrirlo en el navegador.

Sin pruebas automatizadas nuevas: no hay migración ni RPC nuevos que probar (el guard que
importa ya tiene sus 20+ pruebas en `tests/mantenimiento/activos-contable.test.ts`), y el
patrón establecido en el resto del proyecto para un drawer de creación/edición puramente de
frontend (`ordenes-trabajo/index.vue`, `PresupuestoCrearDrawer.vue`, etc.) tampoco tiene un
archivo de test dedicado — se verificó en navegador: creación con código duplicado (rechazo de
cliente), creación real (TEST-001, confirmada por consulta directa y luego borrada), edición de
un activo sin capitalizar (cambio persistido, confirmado por consulta directa), y edición de uno
capitalizado (bloque contable de solo lectura).

Junto con este corte se cerraron dos fallas preexistentes de `pnpm verify`, ajenas a Activos
pero encontradas en la misma sesión:

**`ORGANO_INEXISTENTE` sin registrar** (`packages/shared/src/error-codes.ts`) — cabo suelto de
D-85/D-86 (`fn_gobierno_organo_terminar`, migración `20260934010000`); una línea, sin más
implicaciones.

**`gc-001` ya no es un fixture congelado** — es el hallazgo real de esta revisión.
`tests/seed/gc001.test.ts` y `tests/contabilidad/materializacion.test.ts` #11 fallaban con el
`.env` apuntando a local, y la sospecha inicial (deriva solo local, gc-001 vs "P-01"/"P-02"
sembrados por error en esta sesión) resultó ser incompleta: consultado el remoto
(`hwjmlyzzvpmhadldavbq`) directamente, `gc-001` ("JARDINES DE BABILONIA") tiene hoy **66
inmuebles** (60 agregados 2026-08-21, mucho después del seed original de 6 de paso0) y **62
movimientos contables** (antes 58) — es decir, el tenant lleva usándose como demo "vivo" que
varios cortes siguen alimentando desde que se congeló el snapshot original, no solo esta sesión.
Más aún: el presupuesto 2026 vigente pasó de $120.000.000 a **$1.000.000** y el concepto
`CUOTA_ADMIN` (el central del caso piloto) quedó **archivado** — cambios de otro corte posterior,
no de esta sesión.

Confirmado con el usuario (AskUserQuestion, dos rondas): actualizar las aserciones a los valores
reales actuales en vez de perseguir el snapshot original o reescribir los tests contra un tenant
efímero. `contable_cuadre`/`contable_movimientos` sobre gc-001 siguen cuadrando entre sí
(débito = crédito, 0 de diferencia) — la prueba 11 ya no verifica "no hubo regresión desde el
refactor de `contable_hechos()`" (ese invariante puntual ya no es verificable, el estado cambió
por trabajo legítimo de otros cortes), sino que el motor sigue produciendo un resultado
consistente sobre el estado actual.

**Verificado contra remoto sin tocar el `.env` del repo**: se usó `.env.remoto` (ya existente,
apunta a `hwjmlyzzvpmhadldavbq`) copiándolo temporalmente sobre `.env` solo para la corrida de
`vitest run tests/seed/gc001.test.ts tests/contabilidad/materializacion.test.ts` (17/17 en
verde), restaurando el `.env` local original inmediatamente después — ningún cambio de entorno
quedó pendiente. Correr estos dos archivos con el `.env` local normal seguirá fallando (local no
tiene los datos acumulados de gc-001-remoto, patrón ya conocido) — no es un regresión de este
corte, es la naturaleza de un test que el propio encabezado de `gc001.test.ts` documenta como
"verifica... en el proyecto remoto". El mismo patrón apareció en un tercer archivo,
`tests/contabilidad/contable-movimientos.test.ts` (gc-001, `lineas > 0`) — confirmado 2/2 contra
remoto, sin cambio de código necesario porque esa prueba nunca ancló un número mágico. Dos fallas
adicionales en `libros-oficiales.test.ts` resultaron ser flakiness de infraestructura local (no
reproducibles: pasaron limpio en tres corridas aisladas distintas), no regresiones.

## D-90

**Mantenimiento de activos fijos, Fase 3 (Ficha 360°)** — continuación de [[D-88]]/[[D-89]].
Rediseño completo de `/mantenimiento/activos/[id]` (antes: MANT-1 §3.4, solo dos paneles —
Técnico + Criticidad) en 6 pestañas: Resumen, General, Técnico, Mantenimiento, Contabilidad,
Historial. Alcance recortado deliberadamente contra el propio desglose de fases del prompt
(que separa "Ficha 360°" de "Operaciones de dominio" e "Integraciones" en fases distintas, Fase
4 y Fase 5):

- **Todo de solo lectura.** Cambiar estado, capitalizar, depreciar y dar de baja son Fase 4
  ("Operaciones de dominio") — no hay ningún botón para eso aquí, la ficha solo muestra el
  estado/las cifras actuales. "Editar" reutiliza tal cual el `ActivoFormDrawer` de Fase 2 (mismo
  componente, mismo bloqueo de campos contables si `capitalizado = true`) — no se creó un
  segundo formulario de edición.
- **Sin integración profunda de OT/planes/incidencias/inspecciones/contratos/garantías/
  cumplimiento** ("conectar visualmente" es literalmente el título de Fase 5). El tab
  Mantenimiento trae lo que YA existía antes de este prompt (costos, MANT-6, `mant_costos()`)
  más una fila de enlaces simples y sin filtrar a esas pantallas — incluyendo un enlace real a
  `/mantenimiento/salud/[id]` (MANT-9, ya recibe el id del activo directamente, cero trabajo
  extra) — con una nota explícita de que el filtrado por activo es Fase 5.
- **"Documentos" no es una séptima pestaña.** `activos` solo tiene dos FK opcionales a un único
  documento cada una (`documento_soporte_id`, `imagen_documento_id`) — se resuelven con
  `documentosStore.documentoPorId`/`urlDescarga`, ya existentes (construidos para
  `fondo_movimientos.documento_id`, mismo patrón de "referencia exacta a una versión, no la
  última del grupo"). Se muestran al final de General; no ameritan pestaña propia ni el
  componente de galería (`UiGaleriaDocumentos`, pensado para colecciones con upload, no para dos
  referencias de solo lectura).
- **"Ciclo de vida" (§17) + "Historial" (§18) se combinan en una sola pestaña.** El mismo
  `activo_estado_historial` (append-only, ya existente desde MANT-0) cubre ambos — transición,
  motivo, fecha — no hace falta separar la tabla en dos vistas.
- **QR vive en el encabezado, no en una pestaña**, tal como lo pide §13. Reutiliza
  `generar-qr-activo` (Edge Function de MANT-0, idempotente) tal cual — **sin renderizar un
  código de barras**: ningún otro sitio del proyecto tiene esa dependencia (`mantenimiento/
  acceso` también solo muestra el token como texto plano), así que no se introduce una librería
  nueva solo para esta pantalla. La página pública que resuelve el QR escaneado
  (`ver-activo` ya existe como Edge Function, pero ninguna página Nuxt la consume todavía) queda
  fuera de alcance — es un flujo público/no-autenticado aparte, no parte de la ficha para
  miembros.

**Una sola pieza de backend nueva reutilizada, cero nueva**: `mant_ppe_por_activo` (MANT-0) se
llama de nuevo (ya se llamaba desde `mant_activos_listado`, Fase 1) para traer
`depreciacion_acumulada`/`cuenta_codigo`/`categoria_codigo` que el listado no expone — filtrado
en el cliente al activo pedido en vez de agregarle un parámetro a la función para un solo
consumidor. `activo_estado_historial` se lee tal cual (append-only, sin RPC nueva).

**Deduplicación de paso**, encontrada al construir esta pantalla: `formatoMoneda` ya existe como
único punto de verdad en `utils/formato.ts` (auditoría externa 2026-08-26, "estaba copiado 18
veces") — Fase 1 había reintroducido una 19ª copia local en `activos/index.vue` sin darse
cuenta. Corregido: se eliminó la copia local, se ajustó el único call site para el `null` que el
util compartido no maneja. De paso, los mapas de etiquetas de enums (`ESTADO_LABEL`,
`ESTADO_COLOR`, `NATURALEZA_LABEL`, `ORIGEN_LABEL`) se extrajeron a `utils/activos-labels.ts`
(nuevo) para no triplicarlos entre Registro Maestro y Ficha 360° — se les sumó
`METODO_DEPRECIACION_LABEL`, que Fase 1 no había necesitado.

**Verificado en navegador** sobre dos activos reales del tenant demo: ASC-001 (no capitalizado —
las 6 pestañas, edad calculada coincide con la vida útil consumida ya mostrada en Fase 1,
historial vacío porque nunca tuvo una transición real tras el INSERT inicial) y EXT-001
(capitalizado — Contabilidad muestra cuenta/valor/depreciación acumulada reales, refleja
correctamente los `null` reales de `metodo_depreciacion`/`centro_costo_id` que Fase 1 dejó sin
sembrar, no un bug de esta pantalla). "Generar QR" probado de punta a punta: llama la Edge
Function real, el token queda persistido en `activos.qr_token` (confirmado por consulta directa
a la base). "Editar" desde la ficha confirmado con los catálogos reales cargados (no los
`[]` vacíos de un primer intento, corregido antes de dar el corte por terminado) y el bloqueo de
campos contables activo para EXT-001.

`pnpm build`/`typecheck`/`lint` limpios (0 errores, mismos 7 warnings preexistentes). Sin
pruebas automatizadas nuevas — mismo criterio que Fase 2: no hay migración/RPC nueva que
justifique un archivo de test, y el patrón del resto del proyecto para una ficha de solo lectura
tampoco lo tiene.

## D-91

**Mantenimiento de activos fijos, Fase 4 (Operaciones de dominio)** — continuación de
[[D-90]]. Se agregan a la Ficha 360° (`/mantenimiento/activos/[id]`) las cinco operaciones que
Fase 3 dejó explícitamente fuera: cambio de estado, capitalización, reconocimiento de
depreciación, baja/retiro y criticidad. **Cero funciones/migraciones nuevas** — cada botón
invoca tal cual una función ya existente de MANT-0/MANT-9, esta fase es estrictamente capa UI:

- **Cambiar estado**: `TRANSICIONES_VALIDAS` (mapa nuevo en `stores/activos.ts`, calcado del
  enum `activo_estado_t` y de `guard_activo_transicion`) alimenta los botones de "próximos
  estados" en el tab Historial; cada clic es un `UPDATE activos SET estado=...` plano — el
  guard ya valida la transición y ya inserta su propia fila de `activo_estado_historial` (sin
  motivo). No se inventó ningún mecanismo para capturar motivo en transiciones genéricas: se
  confirmó leyendo `guard_activo_transicion` completo que ninguno existe hoy — solo
  `fn_mant_dar_baja_activo` captura motivo, y solo para el retiro.
- **Capitalizar**: llama `fn_mant_capitalizar_activo` tal cual; el checklist de requisitos
  (bien no esencial, bloque contable completo) es solo para UX — la función es la única
  autoridad y su mensaje de error se muestra tal cual si el usuario fuerza el botón por una
  carrera de datos.
- **Reconocer depreciación**: llama `fn_mant_reconocer_depreciacion` (tenant-wide, idempotente
  por período) y busca la fila del activo propio en el resultado para mostrarla. Reutiliza
  `useComprobantesStore().cargarPeriodos`/`.periodos` (ya existente) para el selector de
  período, filtrado en cliente a `contable_estado === 'abierto'` — no se duplicó un fetcher.
- **Dar de baja/retirar**: llama `fn_mant_dar_baja_activo`; el modal pide período contable solo
  cuando el activo está capitalizado (la función lo ignora si no).
- **Criticidad**: sin trabajo nuevo — ya cubierta por la UI de MANT-1 (`[id].vue` tab Técnico
  reutilizado, no tocado en esta fase).

**Un cast forzado documentado en línea**: `fn_mant_dar_baja_activo` recibe
`p_periodo_id: string | null` en tiempo de ejecución (nulo cuando el activo no está
capitalizado), pero el tipo generado por `db:types` lo marca `string` no-nulable — confirmado
leyendo la función que retorna antes de tocar ese parámetro cuando `!capitalizado`. Se usa
`as unknown as string` con un comentario explicando por qué es seguro, en vez de relajar el tipo
generado a mano (prohibido por CLAUDE.md).

**Dos hallazgos durante la verificación en navegador** (tenant demo, activo AACC-001 — bien
propio sin bloque contable, completado vía "Editar" para poder capitalizarlo):

1. Capitalizar exige que `fecha_adquisicion` caiga dentro del período contable elegido
   (`COMPROBANTE_FECHA_FUERA_DE_PERIODO`, regla de `fn_mant_capitalizar_activo`/CO-3 ya
   existente) — no es un requisito nuevo de esta fase, solo no estaba documentado en el
   checklist de la UI; el error de la función se propaga tal cual, así que no hace falta
   duplicarlo en el frontend.
2. **Bug real, corregido en este corte**: el resultado de `fn_mant_reconocer_depreciacion` para
   categoría `omitido` cubre dos causas muy distintas — "ya se corrió este período" (idempotencia
   normal) y "activo sin `centro_costo_id`" (dato incompleto) — y ambas traían un `detalle` de
   texto explicando cuál fue. El mapeo original en `[id].vue` ignoraba `detalle` y mostraba
   siempre "Ya estaba reconocida para este período — no se duplicó.", ocultando la causa real
   cuando era la segunda. Corregido: se muestra `propio.detalle` cuando la función lo envía, y
   el color del `UAlert` ahora depende de la categoría (`creado` → success, `fallido` → error,
   `omitido` → warning) en vez de ser siempre verde.

**Confirmado, no corregido** (comportamiento preexistente, fuera de alcance de este corte): un
retiro de un activo capitalizado deja DOS filas en `activo_estado_historial` para la misma
transición — una sin motivo (la inserta el propio `guard_activo_transicion` al ver el `UPDATE`
plano que hace `fn_mant_dar_baja_activo` internamente) y otra con motivo (la inserta la función
explícitamente después). Verificado leyendo `fn_mant_dar_baja_activo` completa
(`20260930320000_mant0_fix_baja_activo.sql`) y confirmado en los datos reales tras el retiro de
prueba — no se introdujo en este corte y no está en el alcance de "usar funciones existentes"
arreglarlo.

**Verificado en navegador de punta a punta** sobre AACC-001: completado su bloque contable vía
"Editar" (Fase 2) → capitalizado (comprobante 1525 débito / 3105 crédito visible en la
evidencia) → depreciación reconocida (comprobante 5905 débito / 1592 crédito, cuota
$48.611 = $3.500.000 / 72 meses) → retirado con motivo (comprobante de baja generado,
`estado = 'retirado'`, transición "Dispuesto" ya disponible). Cambio de estado genérico
verificado antes por separado sobre BOM-001 (`en_mantenimiento` → `en_servicio`). `pnpm
--filter @aquila/web typecheck`/`lint`/`build` limpios (0 errores, mismos 7 warnings
preexistentes de siempre). Sin pruebas automatizadas nuevas — mismo criterio que D-89/D-90: cada
operación es una llamada directa a una función ya cubierta por sus propios tests de integración
en `tests/mantenimiento/`; no hay lógica de negocio nueva que testear en el frontend.

## D-92

**Mantenimiento de activos fijos, Fase 5 (Integraciones)** — continuación de [[D-91]]. §25 del
prompt pide "conectar visualmente" el activo hacia OT, planes, inspecciones, incidencias,
contratos, garantías, costos (ya hecho en Fase 3, MANT-6), cumplimiento, inventario/consumos,
salud (ya hecho, MANT-9) e indicadores. Además, dos pedidos explícitos del usuario en este
corte: poder capturar al menos 5 imágenes del activo, y que el código QR se vea gráficamente
(hasta ahora solo se mostraba `qr_token` como texto plano).

**Alcance de "conectar visualmente" — real, no enlaces ciegos.** Cada sección del tab
Mantenimiento de la Ficha 360° ahora trae SOLO los registros de ESE activo (filtro
`activo_id` real en la consulta), no la lista del tenant completo recortada visualmente:

- **OT** (`mant_ordenes_trabajo.cargarOrdenes(tenantId, activoId?)`), **incidencias**
  (`mant_incidencias.cargarIncidencias(tenantId, activoId?)`) y **programaciones de planes**
  (`mant_programaciones.cargarProgramacionesTenant(tenantId, activoId?)`) — un parámetro
  opcional más en cada store existente, mismo patrón que ya traía
  `mantenimientoInventario.cargarMovimientos(tenantId, filtro?)`. Cada fila enlaza a su propia
  ficha (`ordenes-trabajo/[id]`, `incidencias/[id]`, `planes/[id]` vía `plan_id`).
- **Inspecciones** (`cargarInspecciones(tenantId, formatoId?, activoId?)`) — mismo patrón; no
  tiene ficha propia (solo índice), así que sus filas no enlazan a ningún sitio.
- **Contratos**: la relación real es la tabla puente `mant_contrato_activos` (no
  `mant_contratos` directo) — función nueva `cargarContratosPorActivo(tenantId, activoId)` en
  `mantenimientoContratos.ts`, en la dirección contraria a `cargarContrato` (que ya iba de un
  contrato a sus activos, nunca al revés).
- **Garantías**: `mant_garantias` existía desde MANT-5 sin NINGÚN store ni página en el
  frontend — la función `mant_activo_garantias_vigentes(p_activo_id, p_fecha)` ya filtraba por
  activo y estaba sin usar. Store nuevo y mínimo, `mantenimientoGarantias.ts`, de solo lectura
  (la función es "solo informa, nunca bloquea" por diseño de MANT-5) — no se construyó gestión
  de garantías (crear/editar/reclamar) porque eso no es "conectar visualmente" lo existente,
  sería construir un módulo nuevo entero fuera del alcance de este prompt.
- **Cumplimiento**: `mant_estado_cumplimiento(p_tenant_id)` ya devuelve `activo_id` por fila —
  se filtra en cliente igual que `costoActivo` ya hacía con `mant_costos()`, sin tocar la
  función ni el store.
- **Inventario/consumos**: decisión explícita de NO perseguir un cruce en dos pasos
  (`mant_inventario_movimientos.orden_trabajo_id` → `mant_ordenes_trabajo.activo_id`, la tabla
  no tiene `activo_id` propio) — el costo real ya se muestra arriba (MANT-6, Fase 3) y el cruce
  no aporta información nueva que justifique el join adicional. El enlace queda genérico al
  módulo, con una nota explicando por qué.
- **Páginas de destino sin `?activo_id=`**: ningún índice de mantenimiento (OT/planes/
  incidencias/inspecciones/contratos) soportaba filtrar por query param antes de este corte, y
  se decidió NO añadírselo a los cinco — la ficha ya muestra los registros reales filtrados
  in-situ (la parte que exige §25), y cada fila enlaza directo al registro cuando existe una
  ficha propia; un query param redundaría con eso.

**Fotos del activo (≥5, pedido explícito).** `documentos.activo_id` — quinta columna FK de
dominio que se le añade a `documentos` (después de pago/caso jurídico, envío,
anuncio/publicación, perfil de directorio), migración `20260934040000_mant_activos_imagenes.sql`
con el mismo patrón exacto que `20260933810000` (EXS-4): columna + índice parcial +
`v_documento_vigente` recreada EN LA MISMA migración (un `select *` no hereda columnas nuevas —
iba a ser la quinta vez que este repositorio tropieza con eso) + `guard_documento_tipo_familia`
extendido con el tenant del activo. Sin versionar entre fotos (como marketplace/anuncios/
directorio): cada foto es un documento propio. `subir-documento` (Edge Function) gana un
alcance más, `activo_id`, exactamente como ya tenía `anuncio_id`/`tercero_perfil_id`. No se creó
ninguna tabla de media propia — `documentos` sigue siendo el único repositorio documental
(§23 del prompt lo prohíbe explícitamente).

`UiGaleriaDocumentos` (el componente que D-90 ya había señalado como "pensado para esto, no
para las dos referencias de solo lectura de `activos`") gana `activo-id` como tercer alcance y
un modo `solo-imagenes` opt-in: grilla de miniaturas en vez de lista de "Abrir", `accept="image/
jpeg,image/png"` + `capture="environment"` (abre la cámara en un teléfono) en vez del selector
genérico, tipo de documento fijo en 'fotografia' (sin selector), y un contador con aviso
mientras haya menos de 5 fotos. Es opt-in (`solo-imagenes` por defecto `false`) para no
cambiarle el aspecto a anuncios/directorio, que siguen usando el mismo componente para PDF+foto
mezclados.

**Hallazgo real, corregido en este corte** (no introducido por él): al conectar
`UiGaleriaDocumentos` a activos sin pasar `:editable` explícito (como tampoco lo pasa
`directorio/index.vue` desde EXS-4/D-83), el formulario de subida no aparecía — nunca. Causa:
`editable?: boolean` declarado con `defineProps<T>()` puro, sin `withDefaults`; Vue castea un
prop `boolean` opcional sin default explícito a `false` (no a `undefined`, como cualquier otro
tipo), así que `props.editable !== false` era `false` para CUALQUIER consumidor que no pasara
`:editable` — incluido el directorio, cuyo botón "Subir foto" de EXS-4 lleva oculto desde
entonces sin que nadie lo notara (nunca se probó ese flujo en navegador en aquel corte). Se
corrigió envolviendo el bloque en `withDefaults(defineProps<T>(), { editable: true, ... })` —
beneficia a los tres consumidores por igual, no solo a activos.

**QR gráfico (pedido explícito).** Antes: `activos.qr_token` se mostraba tal cual en un
`UTextarea` de solo lectura. Se agrega `qrcode` (npm, nueva dependencia de `apps/web` — ningún
otro sitio del proyecto generaba códigos QR, confirmado en D-90) para renderizarlo como imagen
(`QRCode.toDataURL`, cliente, sin depender de un servicio externo) — el valor codificado sigue
siendo el mismo `qr_token` de siempre, ninguna URL/destino público nuevo. Deliberadamente NO se
construyó la página pública que consume `ver-activo` (el "gap" que D-90 ya había señalado como
fuera de alcance) — "que se vea de manera gráfica" es sobre el renderizado, no sobre inventar un
nuevo endpoint sin autenticación; queda como posible trabajo futuro si se pide. Se agrega un
botón "Descargar imagen" (`<a :href :download>` sobre el data URL, sin red).

**Verificado en navegador y de punta a punta (AACC-001, tenant demo local):**
- Las siete secciones nuevas del tab Mantenimiento renderizan sus estados vacíos correctamente
  (el tenant demo local no tiene ninguna fila con `activo_id` poblado en OT/incidencias/
  programaciones/inspecciones/contratos/garantías — confirmado por consulta directa, y también
  cierto en remoto para OT/incidencias, que sí tienen filas pero con `activo_id = null`). No se
  sembraron filas nuevas para forzar el camino "con datos": es una simple lista `v-for` +
  `NuxtLink`, mismo patrón ya usado en el resto de la ficha (activo padre, historial), y las
  siete consultas en sí se confirmaron correctas por sus 200 OK con el filtro real en la URL de
  la petición.
- Fotos: subidas 5 imágenes reales de punta a punta invocando `subir-documento` directamente
  (con un token de sesión real de `blancomj@gmail.com`, mismo mecanismo que
  `scripts/dev-login.mjs`) — las 5 aparecen en la grilla de miniaturas, el contador pasa de
  "0 fotos — se recomiendan al menos 5" a "5 fotos" sin aviso, y las 5 URLs firmadas de Storage
  resuelven 200 OK. El formulario "Capturar o elegir foto" se confirmó visible tras el fix de
  `editable`.
- QR: "Generar QR" seguido de una imagen QR real y escaneable en pantalla (capturada), con el
  token debajo y el botón "Descargar imagen".

**Migración aplicada solo a LOCAL en este corte** (`pnpm db:push`, sin `--prod`) — el push al
proyecto remoto compartido (`hwjmlyzzvpmhadldavbq`, el mismo de gc-001/D-08) y la regeneración
de tipos (`pnpm db:types`, que solo sabe leer contra remoto vía Management API) quedan
pendientes de la confirmación interactiva del usuario, nunca automática. Hasta entonces,
`documentos.ts` tiene un error de `tsc` esperado y aislado (`.eq('activo_id', ...)` contra el
tipo generado viejo de `v_documento_vigente`) — el resto de `pnpm --filter @aquila/web
typecheck`/`lint` está limpio (0 errores, mismos 7 warnings de siempre).

## D-93

**Mantenimiento de activos fijos — ajustes visuales pedidos por el usuario tras revisar D-92**,
con imágenes de referencia de otras pantallas ya existentes de AQUILA (KPIs de Cartera/
Inmuebles, mockup de ficha con foto+QR):

1. **KPIs del Registro Maestro con el estilo de `cartera/index.vue`** (ícono en círculo de
   color + número grande + barra de progreso corta con el porcentaje del total), en vez de las
   tarjetas de solo texto que traía desde D-88. Se reutiliza el patrón tal cual —
   `flex items-start justify-between` + `span` circular con `UIcon` a la derecha, `UProgress
   size="xs"` bajo el número — ningún componente nuevo. El porcentaje es siempre "% del total
   de activos" (mismo criterio que Cartera con "% del total de la cartera"); no se inventó un
   "vs. año anterior" para "Total de activos" como sugería la imagen de referencia porque no
   existe ninguna fuente de datos histórica con la que compararlo — mostrarlo habría sido un
   número fabricado.
2. **KPIs colapsables**, mismo patrón exacto que `inmuebles/index.vue`/`cartera/index.vue`:
   `useCookie<boolean>('activos-resumen-expandido', { default: () => true })` + botón con
   chevron "Ver resumen"/"Cerrar resumen". Persistido por cookie (no por sesión), igual que las
   otras dos pantallas — colapsar en Activos no debería comportarse distinto a colapsarlo en
   Inmuebles.
3. **Encabezado de la Ficha 360° rediseñado en tres secciones** (antes: título+badges en una
   línea, y el QR grande en su propia sección aparte debajo): (1) foto de portada — la más
   antigua de la galería de Fase 5/D-92 (`documentosStore.cargarImagenesActivo` + primera fila,
   mismo criterio que `fn_directorio_listar` con el logo de una ficha del directorio) con un
   botón superpuesto "Ver galería" que cambia `tabActiva` a `'general'` (donde ya vive la
   galería, D-92) — no se construyó un modal nuevo para esto — más nombre/código/estado/tipo/
   categoría/descripción/ubicación/marca-modelo/serial; (2) el código QR ahora pequeño (antes
   ocupaba una sección completa con el token en un textarea) con el código del activo debajo en
   vez del token crudo, y el botón de descarga; (3) "Datos importantes" — Criticidad (columna ya
   existente en `mant_activos_listado`), **Salud del activo** (nuevo en la ficha:
   `mant_salud(p_tenant_id, p_activo_id)`, MANT-9, que ya existía en el backend sin ningún
   consumidor en esta pantalla — se muestra `—` cuando no hay `mant_salud_set` vigente para el
   tenant, igual que Criticidad ya hacía con "Sin evaluar"), Vida útil restante y Próximo
   mantenimiento (ambas ya en `mant_activos_listado`).

**Verificado en navegador**: KPIs con íconos/porcentajes/barra renderizando igual que Cartera
(capturado); colapsar/expandir funciona; encabezado de tres secciones verificado sobre AACC-001
(foto de portada = la primera de las 5 fotos de prueba de D-92, QR pequeño con imagen real +
código + descarga, Criticidad "Sin evaluar", Salud "—", Vida útil "Vencida", Próx. mantenimiento
"—") y sobre ASC-001 (sin foto → placeholder de ícono, sin QR → botón "Generar QR" inline en la
sección 2). "Ver galería" confirmado: cambia a General y esa pestaña muestra las 5 fotos.
`pnpm --filter @aquila/web typecheck`/`lint`/`build` limpios (mismo único error de `tsc`
pendiente de D-92 por el push a remoto, mismos 7 warnings preexistentes).

## D-94

**Mantenimiento de activos fijos — Fase 6 (Calidad) del prompt de implementación**, aplicada
sobre `mantenimiento/activos/index.vue` y `mantenimiento/activos/[id].vue`:

1. **Permisos**: se agregó `puedeEscribir = computed(() => tenantStore.puede('data:create'))` en
   ambas páginas, mismo patrón ya usado en `FondosTabMovimientos.vue`. Se ocultó/gateó con
   `v-if="puedeEscribir"` cada control que dispara una escritura: "Nuevo activo", "Editar" (botón
   de la grilla y el de la cabecera de la ficha), el nombre-clicable-para-editar en la grilla
   (cae a un `NuxtLink` de solo lectura si no hay permiso), "Generar QR" (cae a texto "Sin
   generar"), la subida de fotos en `UiGaleriaDocumentos` (prop `:editable="puedeEscribir"` +
   `motivo-bloqueo` explicando por qué), "Guardar atributos", "Capitalizar", "Reconocer
   depreciación", el enlace "Editar" dentro del checklist de requisitos de capitalización, y todo
   el bloque de transición de estado/Retirar del historial (cae a un mensaje de solo lectura). No
   se tocaron los computeds de negocio `puedeCapitalizar`/`puedeRetirar` porque también alimentan
   mensajes informativos no relacionados con permisos — el gateo se hizo solo en el punto donde
   se renderiza cada botón, no en esa lógica.
2. **Estados de carga**: skeletons (`USkeleton`) en ambas páginas para su primera carga — filas de
   la grilla en el Registro Maestro, foto+líneas de la cabecera en la Ficha 360° — mismo patrón
   que `cartera/index.vue`.
3. **Manejo de errores**: `errorCarga` + try/catch alrededor de la carga inicial en ambas páginas
   (en la ficha, `cargar()` se dividió en `cargar()`/`cargarInterno(tenantId)` para envolver el
   `Promise.all`), con `mensajeError()` y un `<UAlert color="error" variant="soft">` — mismo
   patrón que `cartera/index.vue`.
4. **Responsive**: sin cambios — ambas páginas ya usan el envoltorio estándar `overflow-x-auto`
   en sus tablas; no se encontró ningún elemento nuevo de D-88/D-92/D-93 que lo necesitara y no lo
   tuviera.
5. **Tenant isolation**: verificación (no requirió código nuevo) de las políticas RLS de las
   funciones agregadas en D-92 — `mant_activo_garantias_vigentes` vía
   `mant_garantias_select_miembro` y `mant_contrato_activos` vía sus políticas
   `_select_miembro`/`_insert_auxiliar`/`_delete_auxiliar` — todas usan `is_member(tenant_id)` y
   corren en modo `security invoker` (no `definer`), sin riesgo de fuga entre tenants.
6. **Accesibilidad**: los botones "Ver ficha"/"Editar" de la grilla, ya icon-only por pedido del
   usuario, llevan `aria-label` + `UTooltip` con el texto que antes era visible.
7. **Auditoría**: no se agregó ningún mecanismo nuevo — el historial de cambios de estado del
   activo (`activo_estado_historial`, ya existente desde D-90/D-91) ya cubre el rastro de
   auditoría de este módulo; crear una tabla de auditoría paralela habría violado la decisión ya
   tomada en esas fases de no duplicar ese mecanismo.

**Verificado en navegador** (como Administrador, para confirmar que el gateo no rompe el flujo
normal): "Editar"/"Generar QR" y los botones de transición/Retirar del Historial siguen
renderizando con permisos de escritura. Registro Maestro re-verificado tras todos los cambios
(6 KPIs y las 9 filas de activos renderizando correctamente). `pnpm --filter @aquila/web
typecheck`/`lint`/`build` limpios (mismo único error de `tsc` pendiente de D-92 por el push a
remoto, mismos 7 warnings preexistentes).

## D-95

**Reorganización completa del sidebar** (`apps/web/app/utils/navegacion.ts` +
`NavSidebar.vue`), a pedido del usuario tras un análisis de los 13 grupos/85 ítems existentes que
encontró: grupos que mezclaban contenido social con catálogos maestros con configuración
("Copropiedad"), grupos planos de 13-17 ítems sin subdivisión interna que además reutilizaban el
mismo ícono en la mayoría de sus filas ("Mantenimiento", "Recaudo y Cartera"), configuración
repartida sin una regla reconocible entre un grupo central y los módulos, y "Comunicaciones"
partido entre "Seguridad" (el histórico) y "Configuración" (las plantillas) sin relación visible
entre ambos. Aprobado con tres ajustes del usuario sobre la propuesta inicial:

1. **Grupos renombrados/reorganizados** (85 ítems, ninguno eliminado): `Comunidad` (Anuncios,
   Directorio, Marketplace, Movilidad + Reservas de zonas comunes y Visitantes y acceso, movidos
   desde Mantenimiento a pedido del usuario — de cara al residente son trámites de convivencia,
   no mantenimiento de activos); `Copropiedad` reducido a los catálogos maestros (Inmuebles,
   Terceros) más un ítem "Configuración" — "Datos de la copropiedad" renombrado y trasladado aquí
   desde el grupo central "Configuración", también a pedido del usuario; `Facturación y Recaudo`
   (fusiona la antigua "Facturación" con la operación diaria de "Recaudo y Cartera": Recaudo y
   Transacciones de pasarela); `Cartera y Cobranza` (el resto de la antigua "Recaudo y Cartera" —
   el módulo `cartera_cobranza` completo, operación + jurídico); `Fondos` reubicado junto a
   `Finanzas` (misma familia de tesorería, ya no corta el pipeline Presupuesto→Facturación);
   `Comunicaciones` (grupo nuevo: el histórico + las dos plantillas, antes separados); `Gobierno`,
   `Presupuesto`, `Contabilidad`, `Finanzas`, `Configuración` y `Seguridad` sin cambios de
   contenido (los dos últimos pierden los ítems que se fueron a Copropiedad/Comunicaciones).
2. **Sub-encabezados dentro de "Mantenimiento"** (15 ítems tras sacar Reservas/Visitantes): se
   agregó `subgrupo?: string` a `NavItem` — un rótulo puramente visual (texto plano, sin ícono, no
   es un nivel de acordeón) que `NavSidebar.vue` arma en un computed (`armarNodos`) a partir de
   los ítems ya filtrados por `puedeVer`, para no dejar un rótulo huérfano si todos los ítems de
   un sub-grupo quedan ocultos por permisos. Cuatro sub-grupos: "Activos y salud" (Activos, Salud
   de los activos, Escenarios, Mapa de riesgo, Configuración de salud), "Operación" (Planes,
   Cumplimiento normativo, Incidencias, Órdenes de trabajo, Inspecciones), "Proveedores y
   recursos" (Proveedores y contratistas, Contratos, Inventario), "Indicadores y configuración"
   (Indicadores, Configuración de mantenimiento). Deliberadamente NO se convirtió en 4-5 grupos
   de primer nivel (la alternativa "gratis" en código): el acordeón real solo deja un grupo
   abierto a la vez, así que fragmentar Mantenimiento habría costado poder ver dos sub-secciones
   juntas sin cerrar una para abrir la otra — el usuario evaluó la maqueta interactiva de ambas
   opciones (antes de aprobar) y eligió la de sub-encabezados a pesar del costo de tocar
   `NavSidebar.vue`.
3. **Colores por grupo** (`COLOR_ICONO_GRUPO`) reasignados para los 13 grupos finales, sin
   colisión de tono entre sí ni con el índigo del ítem activo — de paso se le dio color propio a
   "Mantenimiento" y "Gobierno", que antes cayían al gris por defecto por no tener entrada en el
   mapa (gap preexistente, no reportado hasta ahora).

**No incluido en este corte** (fuera de lo pedido): renombrar/diferenciar "Dependencias"
(`/conceptos/dependencias`, en Facturación y Recaudo) de "Agrupaciones"
(`/configuracion/agrupaciones`, en Configuración) pese a compartir ícono y nombres parecidos —
señalado al usuario, no se tocó sin su confirmación; ni distinguir los íconos repetidos dentro de
"Cartera y Cobranza" (5 ítems comparten `carteraDashboard`) — el mismo problema que ya se corrigió
para Mantenimiento pero que no fue parte de esta aprobación.

**Verificado en navegador** como Administrador: los 13 grupos aparecen en el orden y con el
contenido descritos arriba; "Comunidad" muestra Reservas de zonas comunes/Visitantes y acceso;
"Copropiedad" muestra Inmuebles/Terceros/Configuración; "Mantenimiento" expandido muestra los
rótulos "OPERACIÓN"/"PROVEEDORES Y RECURSOS" con sus ítems agrupados debajo, sin fragmentar el
grupo; "Comunicaciones" muestra Comunicaciones/Plantillas de correo/Plantillas SMS;
"Configuración" ya no tiene "Datos de la copropiedad" ni las plantillas; "Seguridad" ya no tiene
"Comunicaciones". `pnpm --filter @aquila/web typecheck`/`lint` limpios (mismo único error de
`tsc` pendiente del push a remoto de D-92, mismos 7 warnings preexistentes).

## D-96

**Íconos propios para los ítems de Mantenimiento y de "Cartera y Cobranza — Operación" que D-95
había dejado compartiendo un solo ícono genérico** — la segunda de las dos deudas que D-95 dejó
explícitamente señaladas y sin tocar por no estar en el pedido original; el usuario pidió resolver
esta ahora (la otra, "Dependencias" vs "Agrupaciones", sigue pendiente).

1. **Mantenimiento**: de los 13 ítems que usaban `NAV_ICONOS.mantenimiento` (la llave inglesa),
   se le dieron 12 íconos nuevos y distintos entre sí — Salud de los activos (electrocardiograma),
   Escenarios: reparar o reemplazar (flechas divergentes), Mapa de riesgo (pin con alerta), Planes
   de mantenimiento (portapapeles), Cumplimiento normativo (medalla/certificado), Incidencias
   (círculo con exclamación — distinto del triángulo ya usado en "Novedades"), Órdenes de trabajo
   (talonario/boleta), Inspecciones (lupa con check — distinto de la lupa sola de "Auditoría"),
   Proveedores y contratistas (camión de reparto), Contratos (documento con firma), Inventario
   (caja 3D), Indicadores (gráfico de torta). "Activos" se dejó con la llave inglesa a propósito:
   es el ítem insignia del grupo, igual que se hizo con "Dashboard de Cartera" abajo.
2. **Cartera y Cobranza — Operación**: de los 5 ítems que usaban `NAV_ICONOS.carteraDashboard`
   (las barras), se le dieron 4 íconos nuevos — Acciones de cobranza (auricular de teléfono),
   Simulación de corrida (matraz), Centro de escalamiento (escalones ascendentes), Indicadores de
   cobranza (diana). "Dashboard de Cartera" conserva las barras por ser el ítem insignia del
   grupo. Los 5 ítems del bloque jurídico del mismo grupo (Certificaciones de deuda, Casos
   jurídicos, Actos interruptivos de prescripción, Transferencias de propiedad, Promesas y
   acuerdos de pago) siguen compartiendo `carteraDashboard` sin cambios — no fueron parte de este
   pedido.
3. Los 16 íconos nuevos se agregaron a `NAV_ICONOS` con un comentario de una línea cada uno
   explicando la metáfora elegida, siguiendo la convención ya establecida en ese mapa (ver
   comentarios de `fondos`, `mantenimiento`, `marketplace`, etc. en D-anteriores).

**Verificado en navegador**: los 16 íconos nuevos renderizan sin paths rotos, cada uno
visualmente distinto de sus vecinos dentro del mismo grupo/color, y los ítems no tocados
(Activos, Dashboard de Cartera, el bloque jurídico de Cartera, Configuración de mantenimiento/
salud) se ven exactamente igual que antes. `pnpm --filter @aquila/web typecheck`/`lint` limpios
(mismo único error de `tsc` pendiente del push a remoto de D-92, mismos 7 warnings preexistentes).

## D-97

**Mismo tratamiento de D-96 aplicado a Contabilidad**, a pedido del usuario. De los 9 ítems que
usaban `NAV_ICONOS.contabilidad` (la balanza), se le dieron 8 íconos nuevos y distintos entre
sí: Mapeo contable (dos casillas conectadas por una flecha), Movimientos contables (flechas
opuestas), Comprobantes (recibo de borde dentado), Libros oficiales (libro abierto), Deterioro de
cartera (línea descendente — espejo de `flujoProyectado`, que sube), Estados financieros
(documento con barras), Cierres contables (candado), Obligaciones tributarias (documento con
signo de porcentaje), Rendición de cuentas (documento con flecha hacia arriba). "Plan de cuentas
contable" conserva la balanza a propósito, por ser la base de todo el módulo — mismo criterio que
"Activos" en Mantenimiento y "Dashboard de Cartera" en Cartera y Cobranza (D-96); "Configuración
contable" ya tenía ícono propio (el engranaje) y no se tocó.

**Verificado en navegador**: los 8 íconos nuevos renderizan sin paths rotos y distintos entre sí
y de la balanza que conserva "Plan de cuentas contable". `pnpm --filter @aquila/web
typecheck`/`lint` limpios (mismo único error de `tsc` pendiente del push a remoto de D-92, mismos
7 warnings preexistentes).

---

## D-98

**Paso 0 del enfoque de consolidación: la sección «¿Qué cambió?» de cartera.** Primer entregable
de `Casos de uso/FACTOR DIFERENCIADOR/ENFOQUE_CONSOLIDACION/`, que replantea el corpus original
de la capa de inteligencia después de verificar el repositorio: la capa de situaciones no hay que
construirla, ya emergió en cuatro dominios; lo que falta es contrato común. El paso 0 es un spike
con entregable real que responde «¿por qué cambió la cartera entre dos cortes?» **sin modelo de
lenguaje, sin tablas nuevas y sin abstracciones reutilizables** (DI-02).

**Qué se agregó**, sin una sola tabla nueva y sin persistencia:

```text
supabase/migrations/20260934050000_cartera_variacion_fn.sql
  fn_variacion_cartera           comparación entre cortes, FULL OUTER JOIN por inmueble
  fn_variacion_cartera_eventos   desglose de eventos por tipo (solo conteos)
supabase/functions/cartera-variacion/     Edge Function (patrón de cartera-dashboard)
packages/liquidation-engine/src/cartera-variacion.ts           puro: suma · clasifica · ordena
packages/liquidation-engine/src/cartera-variacion-supabase.ts  I/O: numeric → Money
apps/web/app/stores/cartera.ts            cargarVariacion + DTOs
apps/web/app/pages/cartera/index.vue      sección «¿Qué cambió?»
```

**La corrección de rumbo, registrada porque importa.** La primera versión hacía el FULL OUTER
JOIN entre los dos cortes **en TypeScript**, con dos `Map`, y traía hasta 2.000 eventos al Edge
para agruparlos allí. El usuario lo detuvo con una frase: «no olvidar la premisa principal del
proyecto: DB-First». Se rehízo entero. La comparación vive ahora en `fn_variacion_cartera`, que
**llama dos veces a `fn_dashboard_cartera`** en vez de reescribir su SQL — si cambia la definición
de «deuda vencida», cambia en un solo sitio. El TypeScript quedó reducido a sumar totales de
presentación, clasificar, ordenar y redactar. Quedó como `DI-04b` en el enfoque: el corpus
original **sí** enunciaba DB-First (prompt 12 §5) y la carpeta nueva no lo había recogido; fue un
hueco propio, no del corpus.

**Tres reglas de honestidad que la sección respeta y conviene no perder:**

- **`total = vencida + corriente + sinVencimiento`.** Los cargos sin fecha de vencimiento efectiva
  son *indeterminados* y viajan en `deuda_sin_vencimiento`; nunca se pliegan sobre
  `deuda_corriente` (GAP-CAR-001).
- **Denominador cero → «sin base de comparación»**, jamás «0%» (REC-CAR-004). Verificado en
  navegador con el caso real de $0 → $1.000.000.
- **El desglose por tipo de evento devuelve solo conteos, nunca montos.** Los eventos dicen *qué
  clase de hecho* tocó un inmueble, no *cuánto* de su aumento corresponde a cada hecho; atribuir
  monto exigiría un ledger por cargo que hoy no existe en esa forma. Repartirlo sería inventar
  precisión. La UI advierte que los tipos no se suman entre sí porque un inmueble puede aparecer
  bajo varios.

Y la pieza que resultó más valiosa del diseño y no estaba prevista con ese peso: **el residuo
inexplicado se muestra**. «$500.000 del aumento está en 2 inmuebles sin ningún movimiento
registrado en el período. No se puede explicar con la información disponible.» Un residuo grande
es en sí mismo un hallazgo sobre la calidad de los datos, no algo que esconder.

**Verificado**: 10 pruebas de cálculo puro (identidad suma-de-deltas, incremento bruto separado de
reducción bruta, concentración sobre el bruto y no sobre el neto, variación negativa, residuo);
5 pruebas de aislamiento en `tests/rls/cartera-variacion.test.ts` — las dos funciones son
`security invoker` a propósito y la quinta prueba afirma que el propio tenant **sí** responde, sin
la cual las otras cuatro pasarían igual con una función rota. 48 pruebas verdes en conjunto con
las suites existentes de cartera. En navegador, la narrativa completa renderiza con cifras reales.

**La puerta — actualización 2026-09-13, la distinción que decide el proyecto:** el paso 0 exigía
que *un administrador real, sobre datos reales, confirme que la explicación es correcta y le
ahorra trabajo*. **Cumplida.** `db:push:prod` + `db:types` ya se hicieron (arrastrando además
`documentos.activo_id`, pendiente desde D-92). Con datos reales de producción, un administrador
real confirmó con sus propias palabras por qué cambió su cartera —coincidió exactamente con lo
que la sección afirmaba— y dijo explícitamente que le ahorra trabajo frente a la pantalla actual.
Sin captura ni cita textual: la validación quedó registrada solo en la sesión de esa fecha, y se
deja constancia de ese nivel de evidencia en vez de presentarlo como mejor documentado de lo que
está. Detalle completo en `ENFOQUE_CONSOLIDACION/10_INFORME_SPIKE_P0.md` §7.

**Consecuencia (DI-14):** con la puerta cumplida, la Ola 1 — Consolidación tiene fundamento para
evaluarse. Sigue siendo una decisión aparte, no un arranque automático.

El informe completo del spike — incluida la lista de cinco tentaciones de abstracción que
aparecieron y se rechazaron, que es el insumo con el que la ola 1 decidirá qué construir de
verdad — está en `ENFOQUE_CONSOLIDACION/10_INFORME_SPIKE_P0.md`.

---

## D-99

**`fn_resetear_copropiedad` estaba rota para cualquier tenant con datos reales**, y se corrigió
parcialmente — con límite explícito, no completo. Hallada al buscar dónde había quedado "la
opción para dejar un tenant limpio solo con la configuración" (existía, migración
`20260928120000`, nunca funcionó contra datos reales).

**Causa raíz múltiple, encontrada probando en vivo contra dos tenants reales** (el del
smoke-test de [[D-98]] y un tenant demo con datos de contabilidad/gobierno), no por lectura
estática — cada arreglo se verificó ejecutando el RPC de verdad, como administrador autenticado,
nunca con `service_role` directo (la función exige `auth.uid()` + rol):

1. **SEC-14 nunca reconocía el reset.** La función encendía `aquila.reset_context` desde su
   primera línea, con la intención evidente de que el guard append-only la reconociera — pero
   `forbid_mutation_salvo_tenant_borrado()` nunca leía esa variable. Código muerto desde que se
   escribió. Corregido (`20260934060000`): el guard ahora deja pasar el DELETE también bajo ese
   contexto, acotado a la transacción (`set_config(..., true)` = local), sin abrir nada para
   otro código — verificado que ninguna otra función del repo toca esa variable.
2. **La lista de tablas quedó desactualizada.** 57 tablas cubiertas; 171 tablas con `tenant_id`
   existen hoy (contabilidad, gobierno, mantenimiento, finanzas, fondos, movilidad, solicitudes
   externas — todo construido después del 28 de septiembre). Ampliada a 76 (`20260934070000`)
   con las 19 que un tenant real efectivamente puebla, clasificadas dato-operativo (se borra) vs.
   configuración (se preserva, mismo criterio que la función ya aplicaba a `fondos`). El orden de
   borrado se calculó por dependencias de FK reales (no a mano), verificado sin ciclos en el
   subconjunto usado. Las 95 tablas restantes **no se cubrieron** — quedan como config
   (correctamente, en su mayoría) o como deuda pendiente de un audit propio, no de esta sesión.
3. **Inmutabilidad contable (CO-2 §3.6).** Un comprobante contabilizado no admite tocar su
   detalle, ni para borrarlo — corregido con la misma excepción acotada a DELETE
   (`20260934080000`), sin tocar la prohibición de UPDATE, que sigue absoluta siempre.
4. **`forbid_mutation()` es más estricta que su hermana.** 21 tablas (incluida
   `activo_estado_historial`) usan esta variante, que ni siquiera tiene la excepción de "el
   tenant ya no existe" — ni una eliminación completa del tenant las libera. Corregida la misma
   excepción puntual (`20260934090000`). **No se tocó** la diferencia de fondo con
   `forbid_mutation_salvo_tenant_borrado()` (si esa ausencia de excepción es deliberada o un
   descuido de copia es pregunta aparte).

**Dónde se detuvo, deliberadamente.** Un quinto guard —`IMMUTABLE_COEFFICIENT_SET` (coeficientes
de copropiedad, legalmente significativos, "16 §111")— bloqueó el reset del tenant demo. A esa
altura ya eran cinco tipos de protección distintos encontrados uno por uno, cada uno con su
propia razón legítima de existir. Seguir abriendo excepciones al ritmo en que aparecen deja de
ser prudente y pasa a ser adivinar cuántas más hay — se decidió parar y dejarlo para un audit
propio de todas las guardias que el reset podría tocar, no otro parche suelto.

**Estado**: el reset funciona completo y verificado para un tenant que solo tiene datos de
cartera (probado end-to-end). Para un tenant con contabilidad + gobierno + coeficientes reales,
sigue bloqueado en coeficientes. El tenant demo local (`fdb1998c-2285-4736-a898-2687abf1817b`)
queda sin limpiar — es dato de prueba, no crítico.

**Pendiente explícito para cuando se retome**: auditar de una vez todas las funciones guard que
`fn_resetear_copropiedad` puede tocar (no una por una), y decidir en bloque cuáles aceptan la
excepción de `aquila.reset_context` y cuáles necesitan una vía distinta (ej. des-vigenciar un
coeficiente antes de borrarlo, en vez de forzar el guard).

**No pusheado a remoto.** Las cuatro migraciones (`20260934060000`–`20260934090000`) están
aplicadas y verificadas solo en local.

---

## D-100

**Ola 1 arrancó — §2.2, "cartera empieza a notificar" (el hueco más barato y de mayor valor
inmediato, per `06_PROMPT_O1_CONSOLIDACION.md`).** Cartera era el único de los cuatro detectores
que detectaba (`fn_alertas_cartera`) y no avisaba. Ya no.

**Diferencia de diseño frente a los tres que ya notificaban, y por qué:** finanzas/mantenimiento/
gobierno tienen una tabla de detección propia donde colgar un trigger `AFTER INSERT`
(`finanzas_alerta_emitida`, `mant_inventario_alertas`, `gobierno_vencimiento_notificaciones`).
`fn_alertas_cartera` es una función de lectura pura, sin tabla de emisión — mismo problema que ya
resolvió FIN-4 con su propia función pura (`fn_evolucion_cartera_vencida`). Se replicó exactamente
ese patrón (`finanzas_alertas_evaluar` + `cron_finanzas_flujo_alertas_diario`,
`20260932580000`/`20260932620000`), no uno nuevo:

```text
supabase/migrations/20260934100000_ola1_cartera_alertas_vocabulario.sql
  TIPO_ALERTA_CARTERA (lista_tipos)   4 códigos = los 4 conteos que fn_alertas_cartera ya devuelve
  TIPO_NOTIFICACION.alerta_cartera    el tipo de aviso, uno solo para las cuatro condiciones

supabase/migrations/20260934110000_ola1_cartera_alerta_emitida.sql
  cartera_alerta_emitida              append-only, idempotente por (tenant, tipo, día)
  tg_notificar_alerta_cartera         puente AFTER INSERT → fn_notificar, exception-wrapped
                                       (un fallo al notificar nunca tumba la alerta detectada)

supabase/migrations/20260934120000_ola1_cartera_alertas_evaluar_cron.sql
  cartera_alertas_evaluar(tenant,fecha)   llama fn_alertas_cartera, compara 4 conteos contra 0
  cron_cartera_alertas_diario()           todo tenant activo, un tenant que falla no tumba a los
                                           demás; guarda por cartera_corridas_diarias (ya existía,
                                           origen='alertas', distinto de origen='cron' del
                                           recálculo diario existente — no se pisan)
  cron job 'cartera-alertas-diario'       15 11 * * *, justo después de cartera-recalcular-diario
```

**Sin tabla de reglas configurable por tenant, a propósito** — a diferencia de
`finanzas_alerta_regla`: `02_ESTADO_VERIFICADO.md` §2 ya documentaba que cartera usa umbral fijo
(90 días), no política por tenant. Las 4 condiciones son un dispatch fijo, no un catálogo a
evaluar — más simple porque el dominio real es más simple, no por atajo.

**No se tocó `cron_cartera_recalcular_diario()`/`cartera-cron-diario`.** Ese cron tiene un alcance
restringido por decisión de producto (2026-08-29, comentario en el propio Edge Function): "SOLO
CALCULA... ningún mensaje sale hasta que una persona lo apruebe". Es sobre despacho **externo** a
deudores (`acciones_cobranza`) — un asunto distinto de la notificación **interna** al
administrador (`fn_notificar`/campana) que implementa este corte. Se dejó un cron nuevo e
independiente en vez de tocar el existente, precisamente para no rozar esa decisión.

**Verificado:**
- Extremo a extremo con datos reales en una transacción `rollback` (sin sembrar nada persistente):
  `fn_alertas_cartera` detecta 1 obligación >90 días → `cartera_alertas_evaluar` emite 1 fila →
  el puente crea 1 notificación con módulo/título/enlace correctos → segunda corrida el mismo día
  emite 0 (idempotente) → `cron_cartera_alertas_diario()` corrió sobre los 3025 tenants de la base
  local sin caerse.
- `tests/rls/cartera-alertas-notificacion.test.ts`, 5 pruebas verdes: emisión correcta, no
  duplica en una segunda corrida, un tenant sin cartera vencida no emite nada, aislamiento RLS
  (un miembro de A no ve alertas ni notificaciones de B), y el cron no duplica sobre un tenant ya
  corrido ese día.

**DB-First respetado sin fricción esta vez** (a diferencia del paso 0): las tres migraciones son
100% SQL — `cartera_alertas_evaluar()` llama a `fn_alertas_cartera` (que ya agrega en la base) y
solo compara contra cero; ningún conteo se recalcula en TypeScript.

**Pendiente de este mismo §2.2, antes de dar la pieza por cerrada:** `pnpm db:types` (las tablas
nuevas no están en los tipos generados, aunque nada del frontend las consulta todavía — fluye
entera por `notificaciones`, que la app ya sabe leer) y push a producción. Solo aplicado y
verificado en LOCAL.

**Lo que falta del resto de Ola 1** (no empezado en este corte): §2.1 contrato común de situación,
§2.3 el resto del catálogo `TIPO_SITUACION` (esto solo sembró `TIPO_ALERTA_CARTERA`, que es un
vocabulario distinto — el de qué condición dispara una alerta, no el del contrato de situación),
§2.4 superficie (ya cumplida de facto: la notificación aparece en la campana existente), §2.5
decisión de persistencia (ya tomada aquí, de hecho: `cartera_alerta_emitida` es exactamente el
patrón append-only que DI-05 preveía para el caso "sí hace falta deduplicar entre corridas").

---

## D-101

**Ola 1 — §2.1, contrato común de situación.** No se inventó un tipo nuevo: ya existía, con
otro nombre, en `apps/web/app/stores/asuntos.ts` (`Asunto`/`FilaAsunto`, el mapeo manual de la
forma que `fn_mis_asuntos` devuelve). Se formalizó exactamente ese contrato, no uno distinto.

```text
packages/shared/src/situacion.ts
  FilaSituacion          fila cruda snake_case, tal como llega de un RPC
  Situacion              forma tipada camelCase — el contrato
  mapearFilaSituacion()  único mapeo snake_case → camelCase, antes duplicable por consumidor

apps/web/app/stores/asuntos.ts
  export type Asunto = Situacion       -- alias, no copia
  cargar() ahora usa mapearFilaSituacion() en vez de mapear a mano
```

**Los 11 campos base son exactamente los que `fn_mis_asuntos` ya devuelve hoy**, incluido
`asignado_a` — el corpus original (`06_PROMPT_O1_CONSOLIDACION.md`, escrito 2026-09-12) solo
listaba 10, sin ese campo; se corrigió el prompt el mismo día que se implementó (ver nota en el
propio documento §2.1) antes de escribir este código, para no repetir el contrato incompleto.

**`tipo`/`severidad`/`as_of` quedaron OPCIONALES, deliberadamente sin resolver del todo.**
`fn_mis_asuntos` no selecciona ninguno de los tres en ninguna de sus ocho ramas hoy. Extenderla
para que lo haga es una decisión aparte —tocar una función SQL en producción, con sus propias
implicaciones— que este corte no tomó. El contrato los admite (para que un futuro productor, por
ejemplo un puente desde `cartera_alerta_emitida` de D-100, pueda declararlos) sin obligar a las
ocho ramas existentes a inventarlos. Es honesto sobre lo que decide y lo que deja abierto, en vez
de forzar una resolución completa donde no había evidencia para tomarla bien.

**Regla del prompt respetada al pie de la letra:** ningún campo de `fn_mis_asuntos` se renombró
ni se tocó su SQL. El cambio en `apps/web` es un alias de tipo + reemplazar un mapeo manual por
uno compartido — mismo comportamiento en runtime, cero riesgo funcional.

**Verificado:** `pnpm --filter @aquila/shared build` limpio. `pnpm build` completo corriendo al
cierre de este corte (resultado pendiente de confirmar antes del commit).

**No cubierto en esta pieza, para más claridad de alcance:** integrar los cuatro detectores de
alerta (incluida la cartera de D-100) como productores reales de `Situacion` en la bandeja de
`fn_mis_asuntos` — hoy siguen siendo notificaciones (`notificaciones`/campana), no asuntos
(`fn_mis_asuntos`/bandeja). Esa integración toca `fn_mis_asuntos` con una novena rama y es
alcance de §2.4 (superficie) que no se acometió en este corte — el prompt exige derivarla del
estado vivo, no persistirla aparte.

---

## D-102

**Ola 1 — §2.3, catálogo `TIPO_SITUACION` con emisor real.** `fn_mis_asuntos` (EXS-7) no
seleccionaba ningún `tipo` en ninguna de sus ocho ramas — sembrar el catálogo antes de esto
habría sido exactamente "vocabulario sin emisor" (DI-11 lo prohíbe explícitamente). Se agregó la
columna primero, se sembró el catálogo después, en la misma migración
(`20260934130000_ola1_mis_asuntos_tipo.sql`).

**`DROP FUNCTION` + `CREATE`, no `CREATE OR REPLACE`** — Postgres no permite cambiar las columnas
de `RETURNS TABLE` de una función existente con `REPLACE`. Verificado sin dependientes (ninguna
vista ni función llama a `fn_mis_asuntos`) antes de dropear. Grants re-otorgados idénticos a los
originales.

**`tipo` se agregó como columna 12, al final** — mismo criterio que ya se usó para `asignado_a`
(EXS-7, 20260933800000): el `order by 10 asc nulls last, 9 asc` del final es posicional; tocar
cualquier posición antes de la 9 lo habría roto en silencio. Añadir al final dos veces seguidas
no lo toca.

**Ocho códigos, uno por rama, con los nombres que el negocio usa** (no se copió el catálogo
`CART-001…008` del corpus original — esa prohibición del prompt §2.3 ni aplicaba aquí, esas ramas
son de anuncios/marketplace/movilidad/atención, no de cartera):

```text
anuncio_pendiente_aprobacion · publicacion_pendiente_aprobacion ·
publicacion_interes_sin_atender · publicacion_reporte_sin_resolver ·
vehiculo_permiso_por_vencer · publicacion_por_expirar ·
solicitud_atencion_sin_cerrar · visitante_tiempo_excedido
```

**Por qué `tipo` y no reutilizar `origen_entidad`:** dos ramas comparten
`origen_entidad='publicacion'` con semánticas completamente distintas — pendiente de aprobar vs.
por expirar. Es la prueba concreta de por qué el contrato de §2.1 necesitaba `tipo` como campo
aparte.

**`packages/shared/src/situacion.ts` no necesitó ningún cambio**: `tipo` ya era opcional en el
contrato desde D-101, precisamente para este momento — `mapearFilaSituacion()` ya lo recoge sin
tocar una línea.

**Verificado:** `pnpm db:push` limpio en local. Las 4 suites existentes que ejercitan
`fn_mis_asuntos` — `tests/rls/mis-asuntos.test.ts`, `exs8-golden-journey.test.ts`,
`exs8-hardening.test.ts`, `movilidad-bitacora.test.ts` — **60/60 pruebas verdes, sin
regresión**, confirmando que el `order by` posicional y las ocho ramas siguen devolviendo
exactamente lo mismo que antes, más el tipo nuevo.

**Solo en local.** Como toda esta ola, pendiente de `pnpm db:types` + push a producción antes de
cerrar.

---

## D-103

**Ola 1 — §2.4, superficie: cartera llega a "Mis asuntos".** Novena rama en `fn_mis_asuntos`
(`20260934140000_ola1_cartera_asuntos.sql`). Sin pantalla nueva — el prompt lo prohíbe
explícitamente y no hacía falta: la bandeja ya existe.

**Decisión de diseño, la que más pesa de esta pieza:** deriva EN VIVO de `fn_alertas_cartera`, no
de `cartera_alerta_emitida` (D-100). Razón: la regla #1 de `fn_mis_asuntos` es que el asunto
desaparece del `where` cuando el trabajo se resuelve, nunca porque algo lo recuerde. El log de
emisión es exactamente lo contrario — append-only, nunca se resuelve por sí solo — así que
serviría para clasificar una notificación pero no para alimentar una bandeja de trabajo vivo.
Dos fuentes, dos propósitos: notificar (evento pasado) vs. bandeja (estado presente).

**Granularidad por tenant, no por inmueble** — mismo razonamiento que D-100: `fn_alertas_cartera`
agrega, y cartera ya tiene sus propias pantallas (dashboard, escalamiento) para el detalle. Una
fila por condición activa (hasta 4), no una por obligación.

**Una sola llamada a `fn_alertas_cartera`, desempaquetada con `VALUES` lateral** — evita
repetirla cuatro veces dentro de la misma corrida.

**`TIPO_SITUACION` reutiliza los mismos 4 códigos que `TIPO_ALERTA_CARTERA` (D-100)** — misma
condición real, dos catálogos con propósito distinto (uno clasifica notificaciones, el otro
asuntos); sin colisión posible porque la unicidad de `lista_tipos` incluye `tipo`.

**Limitación documentada, no descuido:** `created_at` de estas filas es `now()` — no hay una
fecha real de "cuándo empezó" sin persistir algo, y persistir está prohibido salvo necesidad
probada (DI-05). Consecuencia: siempre ordenan al final de su grupo sin vencimiento, nunca "más
antiguas" que un anuncio o solicitud real. Aceptable para una primera versión; se revisita si
algún día se decide que sí hace falta un `as_of` real (el campo ya existe en el contrato de
D-101, sin usar todavía aquí).

**Esta vez `CREATE OR REPLACE`, no `DROP` + `CREATE`** — a diferencia de D-102, las columnas de
`RETURNS TABLE` no cambiaron frente a `20260934130000` (solo se agregó una rama al cuerpo), así
que Postgres sí permite reemplazar directo.

**Verificado:**
- Las 4 suites existentes de `fn_mis_asuntos` — 60/60 verdes, sin regresión.
- Extremo a extremo con un administrador autenticado real (no `service_role` directo): tenant
  con un cargo vencido desde enero, `fn_mis_asuntos` devuelve exactamente 1 asunto de cartera,
  título "Obligaciones con mora mayor a 90 días (1)", monto formateado "$500,000", `tipo`
  correcto. Tenant borrado por completo al final — sin residuo.

**Solo en local**, como el resto de esta ola.

Con esto, **Ola 1 §2.1–§2.5 están completos**: contrato común, cartera notifica, catálogo con
emisor real, superficie en la bandeja existente, y persistencia decidida con evidencia (D-100).
Lo que falta antes de dar la ola por cerrada: `pnpm db:types`, `pnpm verify` completo, y decidir
push a producción — nada de eso se ha hecho todavía.

---

## D-104

**Hallazgo: la Edge Function `cartera-variacion` nunca estuvo desplegada en producción —
desplegada hoy, 2026-09-13.** Mientras se esperaba el `pnpm db:push:prod` de Ola 1 (D-100 a
D-103), se revisó qué faltaba de Paso 0 (D-98) y se consultó `list_edge_functions` sobre el
proyecto remoto `hwjmlyzzvpmhadldavbq`: la migración SQL de Paso 0 (`fn_variacion_cartera`,
`20260934050000`) sí estaba en producción, pero la Edge Function `supabase/functions/cartera-variacion/`
que la sirve **no aparecía en el listado**. Confirmado desplegándola:

```bash
pnpm exec supabase functions deploy cartera-variacion --project-ref hwjmlyzzvpmhadldavbq
```

Resultado: `slug: cartera-variacion, version: 1, verify_jwt: true,
id: 4b97aea3-76f4-4b17-8d03-0e6d2363a166`. Verificado con una llamada real (sin JWT válido):
`POST /functions/v1/cartera-variacion` → `401` (no `404` ni `503`) — la función arranca, enruta y
exige auth como se espera; confirmado también en `function_edge_logs`. No se hizo una prueba
funcional con JWT de administrador real: pedirla habría requerido credenciales reales de
producción en el chat, prohibido por regla estándar de la sesión.

**Por qué importa, y qué NO se afirma.** El store `apps/web/app/stores/cartera.ts` llama a esta
función vía `supabase.functions.invoke(...)`, que siempre resuelve contra la URL de Edge
Functions del proyecto — remota, nunca local — sin importar si el frontend que la invoca corre en
`localhost` o desplegado. Si la función no estaba en producción antes de hoy, cualquier llamada
desde un cliente apuntando a `SUPABASE_URL` de producción debía fallar con `404`. Eso choca con lo
registrado en **D-98** y en `10_INFORME_SPIKE_P0.md` §7: la puerta del paso 0 se dio por cumplida
el mismo 2026-09-13 con un administrador real confirmando la sección "¿Qué cambió?" **"con datos
reales de producción"**.

No hay forma de reconstruir, solo con lo que queda registrado en esta conversación, cómo se le
mostró la sección a ese administrador — pudo ser contra un entorno local apuntando a Postgres de
producción pero sirviendo la Edge Function localmente (`supabase functions serve`, que si corría
en ese momento sí ejecuta el código sin necesitar el `deploy` remoto), o pudo haber una discrepancia
real. Lo único verificable hoy es el hecho objetivo: la función no figuraba en `list_edge_functions`
de producción antes de este despliegue. Se anota como amendment a D-98/§7 en vez de silenciarlo,
siguiendo el mismo estándar de honestidad que el resto de esta serie — "declarar algo cumplido sin
evidencia es exactamente lo que no se debe hacer" ya se citó en D-98 y aplica igual aquí, en
sentido contrario: no declarar resuelta una duda que no se puede cerrar con la evidencia
disponible.

**Evidencia adicional (2026-09-13, misma sesión, después de escribir lo anterior):** se consultó
`list_migrations` y los logs de Postgres del proyecto remoto. `fn_variacion_cartera`
(`20260934050000`, Paso 0) y **todas** las migraciones de Ola 1 (`20260934060000` a
`20260934140000`) están aplicadas en producción, en un solo lote. El log de Postgres muestra el
`create or replace function public.fn_variacion_cartera` ejecutándose **hoy a las 12:32:17 UTC**
— sin rastro de una aplicación anterior — y ninguna llamada real (`select ... fn_variacion_cartera(...)`)
antes de esa hora en todo el día. Es decir: el `db:push:prod` único que cerró Paso 0 + Ola 1 en
un solo lote (el que el usuario confirmó con su "sí" y cerró con "termino") **es la primera vez
que la función SQL existió en producción** — y eso ocurrió después de que la validación del
administrador ya se había reportado en esta conversación. Mecánicamente, esa validación no pudo
apoyarse en el pipeline de producción tal como está descrito.

Se le preguntó directamente al usuario cómo se hizo esa validación (local contra prod, local
contra local, u otra explicación) para cerrar la duda con certeza. **Respuesta: aplazado** — el
usuario pidió no resolver esto ahora. Queda como pregunta abierta, no como hallazgo cerrado; quien
retome esto puede repetir la pregunta o, más simple, repetir la validación ahora que la función sí
está confirmada en producción de punta a punta.

**Estado actual:** la función está desplegada y responde correctamente. Si se quiere cerrar la
duda sobre cómo se hizo la validación original, hace falta preguntarle directamente al
administrador o repetir la validación ahora que la función sí está confirmada en producción — no
se hizo ninguna de las dos cosas en esta sesión.

---

## D-105

**Ola 2 — §2, contrato de explicación estructurada (primera rebanada).** Arranque de
`07_PROMPT_O2_EXPLICACION_ACCION.md`, con la puerta de Ola 1 dada por cumplida por decisión
explícita del usuario ("hagamos Ola 2") — no automática, como exige `04_HOJA_DE_RUTA.md`.

**Qué se agregó:**

```text
packages/shared/src/explicacion.ts
  TipoCerteza    hecho · calculo · inferencia · hipotesis · informacion_insuficiente
  Evidencia      entidad · id · fuente · fechaCorte — puntero, nunca copia del dato
  Afirmacion     tipo + texto (plantilla) + evidencia
  Explicacion    origenModulo · origenEntidad · origenId · afirmaciones[]

packages/liquidation-engine/src/cartera-variacion.ts
  explicarVariacionCartera(variacion, contexto) → AfirmacionLocal[]
  (tipos LOCALES, espejo — ver "por qué dos copias del contrato" abajo)

supabase/functions/cartera-variacion/index.ts
  ensambla Explicacion real (sí puede importar @aquila/shared) y la agrega
  al response bajo `explicacion`

apps/web/app/stores/cartera.ts
  VariacionCarteraDTO.explicacion?: Explicacion — aditivo, passthrough directo
```

**El contrato se derivó de lo que el paso 0 ya necesitó, no del corpus (DI-02).** Cinco
afirmaciones posibles, ninguna inventada: titular (`calculo`), composición por concepto
(`calculo`, una por corriente/sin-vencimiento/interés — nunca se pliegan, GAP-CAR-001),
concentración (`inferencia` — se deriva de hechos, no se observa directo), atribución
explicada por eventos (`hecho`) y el residuo sin evento (`informacion_insuficiente` — se
declara, no se reparte ni se esconde, mismo principio que `atribucion.sinExplicar` desde
Paso 0). "Lo que ya se sabía" (`fn_alertas_cartera`) **no** entra en esta función porque
`VariacionCartera` no la trae — queda como productor de afirmaciones aparte, para no forzar
una dependencia que el spike no tenía.

**Por qué dos copias del contrato (`Afirmacion` en shared, `AfirmacionLocal` en
liquidation-engine).** `packages/liquidation-engine/**` tiene prohibido importar
`@aquila/shared` (D-14, eslint.config.js) — el núcleo debe seguir puro. Mismo patrón ya
usado en la propia Edge Function para `ContribuyenteLocal`/`DeltaLocal`: un tipo espejo,
estructuralmente idéntico, sin import. La Edge Function (que sí puede importar
`@aquila/shared`) es el único lugar que ensambla el objeto `Explicacion` real.

**Sin formateo de moneda con separadores.** `texto` usa `amount.toString()`, igual que
`dinero()` en la Edge Function — la plantilla lleva valores reales, no prosa generada
(DI-03), pero el "vestido" con separadores de miles es una decisión de presentación que ya
vive en `apps/web` (`formatoMoneda`) y no se duplica aquí para no crear una segunda fuente
que pueda divergir.

**No se tocó la UI todavía.** El campo `explicacion` viaja en el DTO y compila limpio
(`nuxt typecheck` verde), pero la página de cartera sigue mostrando la narrativa con sus
plantillas Vue existentes, sin consumir `Afirmacion[]` — eso es trabajo de una rebanada
siguiente, no de esta. DI-02 aplica también acá: no se construye consumo antes de que haga
falta.

**Verificado:**
- `packages/shared` y `packages/liquidation-engine` compilan (`tsc -p tsconfig.build.json`).
- `pnpm exec eslint` limpio en los tres archivos TS tocados (boundary D-14 incluido).
- `deno check` sobre la Edge Function: mismos 2-3 errores preexistentes que ya tenía
  `cartera-dashboard` sin tocar (implicit-any de `withSupabase`/`zod`, ambiente de `deno
  check` directo, no del código) — cero errores nuevos atribuibles a este cambio.
- `nuxt typecheck` (`apps/web`) verde.
- 402/402 pruebas de `packages/liquidation-engine` + `packages/shared`, incluidas 9 pruebas
  nuevas de `explicarVariacionCartera`: taxonomía correcta por caso (aumento/reducción/sin
  cambio/concentración/residuo/explicado), evidencia siempre resuelta a entidad+fuente
  reales, y ausencia de JSON crudo o claves internas en el texto.

**Solo en local**, como el resto de esta ola — el `pnpm verify` remoto de cierre de Ola 1
seguía corriendo cuando se escribió esto (tarea `b89grdcei`), y no se pushea nada de Ola 2
hasta que Ola 1 esté confirmada.

**Falta de Ola 2 §2:** segundo dominio explicando (finanzas — alertas de liquidez, elegido
explícitamente por el usuario sobre mantenimiento/gobierno). Y de la ola completa: §3
(propuesta de acción vía `acciones_cobranza`), §4 (verificación de resultado), y la entrada
final de decisión sobre Capability Registry que exige el entregable 4 del prompt.

---

## D-106

**Ola 2 — §2, segundo dominio explicando: finanzas (alertas de liquidez).** Cierra el
entregable 2 del prompt ("al menos dos dominios explicando con ese contrato — cartera y uno
más"), elegido explícitamente por el usuario entre finanzas/mantenimiento/gobierno.

**Forma distinta a cartera, a propósito.** FIN-4 ya decidió (cabecera de
`apps/web/app/stores/finanzasFlujo.ts`) que `finanzas_alerta_regla`/`finanzas_alerta_emitida`
se leen directo por RLS, sin Edge Function ni módulo de `liquidation-engine` — a diferencia
de cartera, que sí tiene ese pipeline completo. El mapper de este dominio sigue esa misma
convención en vez de forzar la de cartera:

```text
packages/shared/src/explicacion.ts
  explicarAlertaLiquidez(alerta) → Afirmacion[]
  (vive en shared, no en liquidation-engine — aquí no hay boundary D-14 que cruzar)

apps/web/app/stores/finanzasFlujo.ts
  cargarAlertasEmitidas(): select ahora embebe
    finanzas_alerta_regla(nombre, lista_tipos(codigo)) — una sola consulta,
    sin segunda ida a la base
  alertasExplicadas: computed que arma una Explicacion por alerta emitida
```

**Qué explica y por qué esos tipos de certeza.** `finanzas_alertas_evaluar()`
(`20260932620000`) ya decide, por `tipo_codigo`, qué significa cada una de las 5 reglas y arma
`detalle` jsonb — este mapper NO reinterpreta el disparo (DI-04, DI-09): lee las claves que esa
función ya escribió y las redacta con plantilla.

```text
saldo_30d_bajo_umbral            calculo      — resultado de finanzas_flujo_proyectado()
saldo_30d_negativo               calculo      — idem
flujo_neto_negativo_n_semanas    inferencia   — se deriva de contar semanas, no es un dato solo
cxp_vencida_sin_lote             calculo      — SUM de finanzas_facturas_pagables()
cartera_vencida_deteriorando     inferencia   — compara dos meses, mismo criterio que el
                                                 titular de cartera-variacion (delta), pero acá
                                                 el propio nombre del tipo ("deteriorando") ya
                                                 es un juicio derivado de la comparación, no el
                                                 dato en sí
```

**Nunca lanza.** `detalle` con una clave faltante o un `tipo_codigo` desconocido no revientan:
se declara `informacion_insuficiente` — "la regla se disparó, pero no se puede explicar con el
detalle disponible" — mismo principio que el residuo de cartera (D-105): no se inventa un valor
que no está, y un tipo nuevo que la SQL agregue el día de mañana no rompe el mapper, solo deja
de tener plantilla hasta que se le agregue una.

**Verificado:**
- `packages/shared` compila y lintea limpio.
- `nuxt typecheck` (`apps/web`) verde tras reconstruir el `dist/` de `@aquila/shared` —
  quedó registrado como recordatorio: cualquier cambio en `packages/shared/src/index.ts`
  exige rebuild antes de que `apps/web` (que consume por `dist/`, no por `src/`) lo vea.
- 9 pruebas nuevas en `packages/shared/src/explicacion.test.ts`: evidencia siempre resuelta,
  taxonomía correcta por cada uno de los 5 tipos, detalle incompleto y tipo desconocido sin
  lanzar excepción, sin JSON crudo en el texto. 82/82 en el resto de `packages/shared`.

**No se tocó la UI todavía**, mismo criterio que D-105: `alertasExplicadas` existe en el store,
listo para consumirse, pero la pantalla de finanzas sigue mostrando `detalle` como hoy.

Con esto, el entregable 2 de Ola 2 §2 queda cerrado: dos dominios (cartera, finanzas)
explicando con el mismo contrato `Explicacion`/`Afirmacion`. Falta §3 (acción vía
`acciones_cobranza`), §4 (verificación de resultado) y la decisión de Capability Registry.

---

## D-107

**Ola 2 — §3, propuesta de acción: situación → recomendación → confirmación humana →
`acciones_cobranza`.** Antes de escribir una sola línea se investigó qué de esto ya existía
(agente `Explore`, solo lectura) porque el nombre de la carpeta sugería que faltaba mucho más
de lo que faltaba en realidad. Hallazgo central: **el ciclo de vida completo ya está
construido** — aprobar/rechazar (`apps/web/app/stores/cobranza.ts`, maker-checker real),
despacho con evidencia (`ejecutar-accion-cobranza`, `acciones_cobranza_envios`/`_acuses`),
verificación de resultado (columna "Prueba" derivada de acuses). El comentario "GAP-CAR-005"
que el código citaba como bloqueante estaba **desactualizado**: el worker de envío existe y
funciona para `email`/`sms`.

**El hueco real, una vez descontado todo eso, era angosto:** nada permitía CREAR una acción
manualmente. `registrarAccionCobranza()` (la única función de escritura que existe, y sigue
siendo la única) solo la llamaba el job automático. Y más importante: **`cartera-recalcular`
—la Edge Function que corre `evaluarJobCarteraInmueble()` y ya soporta `modo: 'simulacion' |
'ejecucion'` con `alcance_inmuebles` opcional— no tenía ningún botón en toda la interfaz.**
Existía, pasaba `deno check`, pero era código muerto desde el punto de vista de un usuario.

**Decisión de diseño, la que evita crear una segunda ruta de escritura (prohibición explícita
del prompt):** no se construyó ningún INSERT nuevo. La "confirmación humana" es literalmente
volver a invocar `cartera-recalcular`, esta vez en `modo: 'ejecucion'` y acotada a un solo
inmueble (`alcance_inmuebles: [inmuebleId]`) — la MISMA función, el mismo código de creación
de filas, que ya usa el cron. Eso resuelve dos cosas a la vez sin código adicional:

- **§3.1 (RECOMENDAR ≠ EJECUTAR):** nada se escribe hasta el clic de "Confirmar".
- **§3.4 (contexto obsoleto):** confirmar vuelve a evaluar el inmueble desde cero en el
  momento del clic — no reaplica lo que la simulación mostró antes. Si algo cambió (un pago,
  un acuerdo), `accionesCreadas` puede salir en 0, y la UI lo informa como resultado legítimo,
  no como error silencioso.

**Qué se tocó, mínimo y quirúrgico:**

```text
supabase/functions/cartera-recalcular/index.ts
  - modo 'simulacion' ahora expone accionesPropuestas/accionesOmitidas/accionesBloqueadas
    por plan — ya se calculaban, solo faltaban en la respuesta (sin cálculo nuevo, DI-04).
  - fix real: creada_por era SIEMPRE 'job', incluso cuando un administrador disparaba esta
    función a mano desde la interfaz (esJob ya distinguía los dos casos, solo no se usaba
    en el INSERT). Ahora: esJob ? 'job' : 'manual'. acciones.vue ya mostraba este campo como
    "Origen: Creada a mano" — quedaba mal etiquetado desde antes de esta ola.

apps/web/app/stores/cobranza.ts
  simularRecomendaciones() / confirmarRecomendacion() — invocan cartera-recalcular en modo
  simulacion/ejecucion respectivamente. Cero INSERTs propios.

apps/web/app/pages/cartera/acciones.vue
  Sección "Recomendadas", colapsable, solo para administrador (mismo rol que aprobar) —
  fecha de corte + botón Calcular (nunca automático: el propio cartera-recalcular ya
  documentaba "un humano aprieta el botón", aquí se mantiene igual) → lista de inmuebles con
  su acción propuesta (tipo, canal, si pide aprobación) y botón Confirmar por inmueble.
  Bloqueadas (falta destinatario) se muestran aparte, sin botón de confirmar, con el motivo —
  no se ofrece una acción que no tiene a quién dirigirse.
```

**No se creó:** `intelligence_action`, `action_proposal`, segunda máquina de estados,
segundo dispatcher, ni ninguna función SQL nueva — todo lo prohibido en §3/§5 del prompt
sigue sin existir.

**Verificado:**
- `nuxt typecheck` y `eslint` limpios en los tres archivos.
- `deno check` sobre la Edge Function: mismos errores preexistentes de siempre (implicit-any
  de `withSupabase`/`.filter`), cero nuevos.
- **En navegador, con sesión real** (magic link de `pnpm dev:login` contra Supabase local —
  nunca contra producción, D-25), en dos escenarios:
  1. Sin política vigente (estado real de todo el ambiente local — ningún tenant local tenía
     una): la UI captura y muestra correctamente el error del dominio (`BLOCKED — el tenant
     no tiene una política de clasificación de cartera vigente, CAR §8, PH-C26`).
  2. Con una política/tramo/estrategia temporal sembrada a mano en `GC-001` (solo local,
     vía REST con service_role, nunca migración — creada como `borrador`, tramos insertados,
     activada a `vigente`; **borrada por completo al terminar la prueba, cascada confirmada
     sobre `politica_clasificacion_tramos`/`estrategias_cobranza`, cero residuo**): el motor
     completo corrió de punta a punta — clasificó los 3 inmuebles en mora real (44 días) en
     el tramo correcto, la estrategia matcheó, `evaluarAccionesAplicables` propuso la acción,
     y `resolverDestinatarios` bloqueó los 3 por un motivo real y correcto: estos inmuebles no
     tienen ninguna fila en `inmueble_persona_rol` en el tenant demo. La sección "Correspondería
     actuar, pero falta un dato" de `acciones.vue` mostró exactamente eso, con el código de
     cada inmueble y el motivo legible.
  
  El único tramo que quedó sin probar en vivo es el clic de "Confirmar" en sí (el INSERT real)
  — habría exigido sembrar además un tercero completo con relación persona-predio vigente y
  contacto, un tercer nivel de datos sintéticos que se consideró desproporcionado para esta
  verificación. Riesgo residual bajo: ese código es 100% el mismo `modo: 'ejecucion'` que el
  job automático ya ejecuta hace tiempo — lo único nuevo ahí es la etiqueta `creada_por` y el
  parámetro `alcance_inmuebles`, que la función ya soportaba antes de esta ola.
- 411/411 pruebas de `packages/liquidation-engine` + `packages/shared` (sin regresión —
  ninguna función pura se tocó en esta pieza).

**Pendiente de Ola 2:** §4 (verificación de resultado — ya cubierta en los hechos por el
sistema de acuses existente, falta solo confirmarlo explícitamente contra el prompt), la
decisión final sobre Capability Registry (entregable 4), y la prueba en navegador del camino
feliz mencionada arriba.

---

## D-108

**Ola 2 — §4, verificación del resultado: el hueco real detrás de "ya cubierta en los
hechos".** D-107 cerró anotando que §4 probablemente ya estaba resuelta por el sistema de
acuses existente — al revisarlo con cuidado contra el marco `qué se esperaba · qué ocurrió ·
qué evidencia lo demuestra · qué falló si falló` del prompt, tres de los cuatro sí lo estaban,
pero uno no:

```text
qué se esperaba      → el contexto congelado de acciones_cobranza (ya existía)
qué evidencia         → acciones_cobranza_envios/_acuses (ya existía, ya en UI)
qué falló si falló    → ResultadoDespacho.errorMessage (ya existía, ya en UI)
qué ocurrió           → FALTABA — nadie escribía nunca la columna `resultado`
```

`acciones_cobranza.resultado` (`resultado_accion_cobranza_t`: sin_respuesta, contacto_efectivo,
contacto_no_efectivo, promesa_de_pago, acuerdo_solicitado, pago_recibido, rechazo_deudor,
datos_incorrectos, no_aplica) existe desde F4 (`20260822270000`) — el enum completo, la
columna, hasta el comentario de `aprobada_por` que ya la menciona ("El resultado real está en
estado" — errata que confunde despacho con gestión, no se corrigió, no era el objetivo de esta
pieza). Grep contra todo el repo: cero escrituras, en ningún store ni Edge Function. El
despacho responde «¿salió el mensaje y llegó?»; nada respondía «¿la gestión sirvió de algo?
¿qué contestó el deudor?» — que es exactamente la pregunta que "qué ocurrió" exige poder
cerrar.

**Qué se tocó:**

```text
supabase/migrations/20260934150000_ola2_bandeja_cobranza_resultado.sql
  fn_bandeja_cobranza: DROP + CREATE (cambia RETURNS TABLE, mismo motivo que D-102) —
  agrega `resultado` al final. Ningún guard nuevo: `resultado` ya no estaba en la lista de
  columnas congeladas (guard_accion_cobranza_contexto_inmutable) ni la vigila
  guard_accion_cobranza_transicion (solo mira `estado`) — un UPDATE que solo toca
  `resultado` ya pasaba limpio antes de esta migración. Se documenta, no se construye.

apps/web/app/stores/cobranza.ts
  registrarResultado(accionId, resultado, notas?) — UPDATE directo por RLS, mismo patrón
  que decidirAccion/cancelarAccion. También escribe resultado_fecha (columna que ya
  existía y que la primera versión de esta pieza olvidó — se detectó al sembrar una fila
  de prueba real y ver la columna en la respuesta, no por lectura del esquema).

apps/web/app/pages/cartera/acciones.vue
  Bloque "Resultado de la gestión" en el modal de detalle — editable solo si
  estado === 'ejecutada' (antes no hay nada que reportar; en 'fallida' el desenlace ya es
  el fallo mismo). 9 opciones en escala (de "sin respuesta" a "pago recibido"), select +
  botón Guardar deshabilitado si no cambió nada.
```

**No se creó** ninguna tabla, ningún guard nuevo, ningún segundo lugar donde reportar un
resultado — la columna y su vocabulario ya estaban completos, solo sin puerta de entrada.

**Verificado, con datos reales, de punta a punta (no solo tipos):**
- `nuxt typecheck`/`eslint` limpios (un ajuste real: `USelect` exige `undefined`, no `null`,
  para "sin selección" — `resultadoSeleccionado` se tipó `ResultadoGestion | undefined`).
- `pnpm db:push` local aplicó la migración limpio.
- `tests/tenancy/cartera-bandeja.test.ts` (7/7) contra la función ya modificada — sin
  regresión, sin necesidad de tocar el test.
- **En navegador, sesión real (local, D-25):** se sembró una fila de `acciones_cobranza`
  mínima a mano (`estado: 'ejecutada'`, `creada_por: 'manual'`) — necesitó además una
  política de clasificación temporal solo para satisfacer el FK `politica_clasificacion_id`
  (`not null`, no había ninguna en el ambiente local). Se abrió el detalle, el bloque
  "Resultado de la gestión" mostró el select correcto, se eligió "Promesa de pago", se
  guardó, y **se confirmó por consulta directa a la base** que `resultado` y
  `resultado_fecha` quedaron escritos. El botón Guardar se deshabilitó solo después,
  correctamente (nada que guardar dos veces). Todo lo sembrado —la fila y la política— se
  borró al terminar; verificado con consulta después del borrado: 0 filas en ambas tablas.
- 411/411 pruebas de `packages/liquidation-engine` + `packages/shared` sin regresión.

Con esto, Ola 2 §4 queda cerrada con evidencia real, no solo con lectura de código. Falta
únicamente el entregable 4 completo: la entrada de decisión sobre Capability Registry
(§5 del prompt — "salvo que aparezca un caso concreto que el trío DI-06 no pueda expresar").

---

## D-109

**Ola 2 — decisión sobre Capability Registry (entregable 4) y cierre de la ola completa.**

**No se necesitó.** La prohibición del prompt (§5) es condicional: se construye "salvo que
aquí aparezca un caso concreto que el trío DI-06 no pueda expresar — en cuyo caso se
documenta el caso y se evalúa, no se asume". El trío de DI-06 (`02_ESTADO_VERIFICADO.md` §6):
el tipo `Permission` (`apps/web/app/types/permissions.ts`, coarse — `data:read`, etc.),
`puede_ver_modulo(tenant, modulo)` (gate de RLS por módulo) y los guards de transición por
dominio. A eso se suma `has_role(tenant, roles[])`, la primitiva de rol que ya gobierna todo
`acciones_cobranza` desde F4 — no es parte de la lista original de DI-06, pero es la misma
familia de mecanismo (autorización ya existente, no inventada aquí).

Cada pieza de Ola 2 necesitó expresar autorización en algún punto, y en los tres casos bastó
con reutilizar lo que ya existía, sin ninguna necesidad de un registro nuevo que cruzara
rol × recurso × acción:

```text
§2 explicación (cartera, finanzas)
  Ninguna autorización nueva: cartera-variacion ya exige is_member (lectura); las alertas de
  finanzas ya están detrás de puede_ver_modulo(tenant, 'financiero'). explicarAlertaLiquidez/
  explicarVariacionCartera son funciones puras sin opinión de quién puede verlas — la
  autorización vive donde ya vivía, en el productor de los datos que explican.

§3 recomendación → confirmación
  La sección "Recomendadas" se gatea con esAdministrador (has_role 'administrador') en la UI,
  espejo del mismo chequeo que cartera-recalcular ya hacía server-side desde antes de esta
  ola. Confirmar una recomendación no es una acción nueva: es la MISMA función (modo
  'ejecucion') que el job automático, con el mismo control de acceso que ya tenía.

§4 resultado de gestión
  registrarResultado() pasa por la policy de UPDATE que ya cubre acciones_cobranza
  (has_role 'agent', que administrador hereda) — no se necesitó un permiso "puede registrar
  resultado" distinto de "puede tocar esta acción", porque el prompt no pide separar esos dos
  niveles y el dominio no lo exige (a diferencia de aprobar, que sí es un nivel de riesgo
  distinto y por eso guard_accion_cobranza_transicion exige administrador explícito ahí).
```

En ningún punto apareció una pregunta de autorización que `Permission` + `puede_ver_modulo` +
`has_role` + guards no pudieran responder ya. Construir un registro de capacidades sin ese
caso habría sido exactamente lo que DI-06 y esta prohibición advierten: una abstracción para
un problema que no se presentó.

---

**Cierre de Ola 2 — Consolidación: Explicación y acción.** Los 4 entregables del prompt,
completos:

```text
1. Contrato de explicación (taxonomía de certeza + evidencia)     D-105
2. Dos dominios explicando (cartera, finanzas)                     D-105, D-106
3. Situación → recomendación → confirmación → acciones_cobranza    D-107
   → resultado verificado                                          D-108
4. Entrada D-xx con la decisión de Capability Registry              D-109 (esta)
```

Puerta de Ola 2 (`04_HOJA_DE_RUTA.md`): *"Una recomendación se convierte en acción ejecutada
por el servicio de dominio existente, con evidencia y sin una segunda ruta de escritura. Y una
acción de alto impacto queda bloqueada sin aprobación humana, demostrado con una prueba
automatizada."* Las dos condiciones se cumplen y están verificadas con evidencia real, no solo
con lectura de código: cero rutas de escritura nuevas en todo `acciones_cobranza` (D-107), y
la prueba automatizada del bloqueo por aprobación ya existía antes de esta ola
(`guard_accion_cobranza_transicion`, exigencia de rol administrador + prohibición de
autoaprobación) — no hizo falta escribir una nueva porque el mecanismo nunca fue tocado.

**Todo lo de esta ola sigue solo en local.** Por la cadencia acordada esta misma sesión
(`04_HOJA_DE_RUTA.md`, ajustada tras la pregunta del usuario sobre por qué `pnpm verify`
remoto era necesario): el `db:push:prod` de esta migración (`20260934150000`) y el
`pnpm verify` remoto de cierre quedan pendientes de una corrida explícita, no automática.

---

## D-110

**Hallazgo real del `pnpm verify` remoto de cierre de Ola 1 (tarea lanzada horas antes,
terminó después de escribir D-109): un código de error de Ola 1 nunca se registró.**
`CARTERA_ALERTA_TIPO_INVALIDO` (`guard_cartera_alerta_emitida_tipo()`,
`20260934110000_ola1_cartera_alerta_emitida.sql`, §2.2 de Ola 1 — D-100) se escapó del
registro de `packages/shared/src/error-codes.ts`. Corregido: entrada agregada, mismo patrón
que `FINANZAS_ALERTA_TIPO_INVALIDO` (FIN-4). `tests/governance/error-codes-coverage.test.ts`
verde tras el fix; `tsc`/`eslint` de `packages/shared` limpios.

**Es la tercera vez que pasa** (antes EXS-6, EXS-7 — ver
`feedback_registrar_error_codes_al_escribir_el_raise` en memoria) y la primera bajo la nueva
cadencia de esta sesión (verify remoto solo al cierre de ola, no de cada sección) — confirma
la razón por la que ese registro hay que escribirlo al momento del `raise`, no confiar en que
el verify de cierre lo va a agarrar a tiempo para corregirlo barato: aquí tardó desde D-100
hasta D-109, dos olas de distancia.

**El resto de los 34 fallos del run (34 failed / 2129 passed, ~100 min) es ruido de entorno,
no regresión de código — triage explícito, no una afirmación sin evidencia:**

```text
Gateway Timeout (la mayoría)   fixtures básicos (create_tenant, login, lista_tipos,
                                inmueble_persona_rol) fallando en decenas de tests no
                                relacionados entre sí → carga/latencia del proyecto remoto
                                en ese momento, no un bug — el patrón (fixtures triviales,
                                no lógica de negocio) es la firma característica.
57014 statement timeout         mismo origen: el proyecto remoto bajo carga.
Sendinblue/Brevo 402            "sin créditos de SMS en la cuenta" — falla de facturación
                                externa, cascada a 3 tests que dependen de ese envío.
cartera-cron-diario (546),      Edge Functions que esta sesión NUNCA desplegó a remoto —
cartera-ejecutar-lote,          solo se editaron archivos locales (D-105 a D-108); lo que
cartera-envio-evidencia,        corrió en remoto es el código YA desplegado antes de esta
compositor-correo (500)         sesión. No pueden ser regresión de Ola 2.
adc1-avisos-alcance (422)       dominio ADC-1, no tocado en esta sesión ni en Ola 1/2.
```

**Ninguno de los 34 fallos es atribuible al trabajo de Ola 2** — nada de Ola 2 se ha pusheado
a producción todavía (sigue en local, por la cadencia acordada). El único fallo real
(`CARTERA_ALERTA_TIPO_INVALIDO`) es de Ola 1, ya cerrada y ya en producción, y ya está
corregido. No se volvió a correr el `pnpm verify` completo tras este fix — decisión pendiente
del usuario, dado el costo (~100 min) y que la mayoría de los fallos parecen transitorios.

## D-111

**CO-3 (`project_co3_materializacion_4115_fondo` en memoria, abierto desde 2026-09-12): causa
raíz confirmada y corregida — bug de fixture de prueba, no del motor contable.**

`unaHojaIngresoLibre()` (duplicada en 4 archivos: `tests/contabilidad/materializacion.test.ts`,
`libros-oficiales.test.ts`, `estados-financieros.test.ts`, `deterioro.test.ts`) elegía la
primera hoja presupuestal de ingreso "libre" sin excluir las que exigen fondo (`requiere_fondo`),
a diferencia de su hermana `unaHojaEgreso()`, que sí filtra `requiere_tercero=false`. La hoja
`ing_fondo_imprevistos` (sembrada en todo tenant, mapeada a la cuenta **4115**, que exige fondo)
queda libre porque ningún concepto de fábrica la usa — cuando el fixture la tomaba por azar
(sin `ORDER BY`, dependiente del plan de Postgres sobre una tabla sin garantía de orden de
empate), vinculaba un concepto ordinario a 4115 sin `fondo_id`, y el guard de dimensiones
(`20260930210000_co2_comprobante_funciones.sql`) rechazaba correctamente la línea con
`COMPROBANTE_DIMENSION_REQUERIDA`.

**Verificado con evidencia, no solo inferido:** se reprodujo el error exacto
(`"COMPROBANTE_DIMENSION_REQUERIDA: línea 2 exige fondo (cuenta 4115)"`) insertando un
`console.log` temporal sobre `escenario.resumen` en `materializacion.test.ts` caso 1, confirmando
la hipótesis antes de tocar el fixture (log retirado después).

**Fix aplicado** (mismo patrón en los 4 archivos): añadir `contable_cuenta:contable_cuenta_id!inner(requiere_fondo)`
al `select`, `.eq('contable_cuenta.requiere_fondo', false)`, y `.order('id')` para no depender de
orden implícito — igual que ya hacía `unaHojaEgreso()` con `requiere_tercero`.

**Resultado:** de los 7 fallos originales reportados en la memoria, **6 quedaron resueltos**
(casos 1/2/3/6 de `materializacion.test.ts`, caso 7 de `libros-oficiales.test.ts`,
`contable-movimientos.test.ts` — este último ya pasaba aislado, confirmando que era ruido
cruzado de la corrida completa, no relacionado). `tests/contabilidad` completo: 112/113 verde,
`eslint` limpio sobre los 4 archivos tocados.

**El séptimo (caso 11, `materializacion.test.ts:705`, sobre el tenant demo `gc-001`) NO era
parte de CO-3 — resultó ser el comportamiento ya decidido y correcto, no un bug pendiente.**
Al principio parecía contradecir su propio comentario (D-89, línea 699, dice que `gc-001` es un
tenant "vivo" cuyos números ya no son el invariante original, pero el `it` sigue afirmando
literales: `toHaveLength(62)`, `total_debito === 20_797_667`, `sin_cuenta === 5`). Releyendo
D-89 completo (línea 4956 en adelante): el propio D-89 ya había actualizado esos literales a los
valores reales de `gc-001` en el proyecto REMOTO (`hwjmlyzzvpmhadldavbq`), confirmado en su
momento con el usuario (dos rondas de `AskUserQuestion`) — y documentó explícitamente que correr
este archivo contra el `.env` LOCAL seguiría fallando, por diseño, porque local no tiene los
datos acumulados de `gc-001`-remoto. **Se reverificó hoy** copiando temporalmente `.env.remoto`
sobre `.env` (mismo mecanismo que D-89, restaurado inmediatamente después): 12/12 en verde
contra remoto, incluyendo el caso 11. El fallo contra local no es una regresión ni un asunto
pendiente — es el comportamiento esperado y ya decidido, coincide con
`feedback_diagnosticar_datos_faltantes_local_antes_de_bug`. No se necesita ninguna acción más.

**No se aplicó `db:push` ni se tocó ninguna migración** — el fix es enteramente en archivos de
test (`tests/contabilidad/*.test.ts`), no hay cambio de esquema ni de código de producción.

## D-112

**BLOQUE H de Fondos implementado: ejecutar un lote de pago con `fondo_id` ahora registra un uso
en `fondo_movimientos`** (`ANALISIS_FONDOS_BLOQUE_A.md` §6/§11 punto 4 — bloqueado hasta hoy por
"no hay CxP ni pagos salientes"; FIN-2/FIN-3 ya lo construyeron, así que era ejecutable y solo
faltaba conectar los dos). Continuación de la sesión `78da96cd-451e-4605-af6b-2b57da2c4567`
interrumpida por límite de uso justo al empezar a leer las migraciones de Fondos/FIN-3 para este
mismo corte; retomado en sesión nueva con el plan confirmado explícitamente por el usuario.

**Migración `20260935050000_fondo_bloque_h_uso_lote_pago.sql`:**
- Columna nueva `fondo_movimientos.lote_pago_id` (FK a `finanzas_lotes_pago`) — origen automático
  del lado saliente, simétrico a `pago_id` (BLOQUE K, lado entrante). Es una columna real y
  consultable, no una bandera de sesión de exención: el histórico de un fondo puede reconstruir
  qué lote generó cada `uso` sin depender de que una bandera estuviera activa en el momento exacto
  del insert (a diferencia del `traslado_entrada` que genera `fn_fondo_cerrar`, que sí usa bandera
  porque no hay una fila natural que lo enlace).
- `guard_fondo_movimiento`: `uso` pasa a aceptar `documento_id` (manual) **o** `lote_pago_id`
  (automático) — mismo patrón dual que ya tenía `aporte` con `pago_id`/`documento_id` (D-42). Los
  otros cuatro tipos sin ruta automática (`rendimiento`/`ajuste`/`traslado_entrada`/
  `traslado_salida`) siguen exigiendo `documento_id` sin cambios.
- `fn_finanzas_ejecutar_lote`: si `v_lote.fondo_id is not null`, inserta un único movimiento
  `uso` por `monto_total` del lote (todos sus ítems pagan contra el mismo fondo por construcción —
  `fondo_id` vive en la cabecera, no por ítem), después de procesar los ítems y antes de marcar el
  lote `ejecutado`, en la misma transacción.

**Sin compromiso/autorización previa, a propósito — no se inventó una regla nueva.** Igual que el
aporte automático de BLOQUE K no exige una `fondo_autorizacion` previa, este `uso` tampoco:
`compromiso_id`/`autorizacion_id` siguen nullable y opcionales para cualquier `uso`. Si el fondo
queda en negativo, `fn_fondo_saldo_derivado` lo refleja como cualquier otro movimiento — el corte
original de Fondos no cerró una guardia de saldo mínimo para `uso` y esta migración no le agrega
una; conectar lo que ya existía, no ampliar el alcance.

**Verificado:** 3 pruebas nuevas en `tests/finanzas/lotes-pago.test.ts` (17: ejecutar con
`fondo_id` crea el movimiento correcto y reduce el saldo derivado; 18: sin `fondo_id` no crea
nada, regresión; 19: un `uso` manual sin `documento_id` ni `lote_pago_id` sigue rechazado con
`FONDO_SOPORTE_REQUERIDO`) — 19/19 verde. Regresión completa: `tests/finanzas/lotes-pago.test.ts`
(19), `tests/tenancy/fondos-modelo-general.test.ts` (45), `fondos-solicitud-decision`,
`fondos-dimension`, `domain-isolation`, `schema-forced-rls`, `fondo-imprevistos-cuota` — todo
verde. `tests/contabilidad/materializacion.test.ts` solo falla en el caso 11 ya conocido (D-111,
`gc-001` requiere remoto) — no es una regresión de este corte. `supabase db lint` limpio sobre
`guard_fondo_movimiento`; el único warning en `fn_finanzas_ejecutar_lote` (cast de
`v_estado_factura`) ya existía antes de este cambio. `eslint` limpio.

**Aplicado a desarrollo local** (`pnpm db:push`). **Pendiente de decisión del usuario:** push a
producción (`pnpm db:push:prod`, exige confirmación interactiva "si" — no se puede automatizar
por diseño del propio script) y `pnpm db:types` (falla contra `SUPABASE_URL` local — solo
funciona contra un proyecto remoto) para que `database.types.ts` incluya `lote_pago_id`. Hasta
entonces, `pnpm typecheck`/`pnpm verify` completos no reflejarán la columna nueva — las pruebas
nuevas evitan el problema tipando el resultado ad hoc (mismo patrón ya usado en el archivo para
otras columnas), no dependen de `Database['public']['Tables']['fondo_movimientos']`.

**Conciliación bancaria** (la otra mitad de lo que el usuario aprobó retomar) queda sin empezar —
es un frente distinto y más grande: no hay UI que enlace `extracto_bancario`/
`conciliacion_propuesta` con ningún dominio de AQUILA todavía, ni siquiera fuera de Fondos
(memoria `project-fondos-pendiente`, punto 2). Se planteará por separado.

## D-113

**Conciliación bancaria contable (banco↔libro) — decisiones D-CB-1..6 cerradas con el usuario,
plan de `Docs/Conciliacion Bancaria/PROMPT_CONCILIACION_BANCARIA_CONTABLE.md` verificado contra
el código vigente y aprobado como base de implementación.**

Ese documento (escrito el 2026-09-13 por la sesión `6314ceb8-08a2-4397-884b-35775b00f2f7`, a
petición explícita del usuario: *"instrumento de validación y comparación bancaria contra los
movimientos contables"*) diagnostica que existen 4 cosas llamadas "conciliación" en el repo y
solo una — la bancaria contable, banco↔libro — no existe todavía; las otras tres (recaudo,
`contable_conciliacion_cartera`, `fn_finanzas_conciliar_lote`) quedan intactas. Verificado de
nuevo hoy en sesión aparte (re-lectura de §3 contra código vigente, como el propio documento
exige antes de ejecutarlo) — sigue vigente sin cambios, más una verificación en vivo que el
documento no había hecho: `tenant_role_t` real (consultado contra Postgres local, no asumido) es
`{auxiliar, auditor, administrador}` — tres roles, no dos.

**Decisiones cerradas (`AskUserQuestion`, todas la opción recomendada por el prompt):**
- **D-CB-1 — Fuente del lado "libros": `contable_comprobante_detalle` con
  `estado='contabilizado'`**, no `contable_movimientos()` (proyección legacy). Es el libro
  persistido y real que ya alimenta libro mayor/balance/estados financieros.
- **D-CB-2 — `extracto_linea` exige `cuenta_bancaria_id` confiable: se vuelve NOT NULL al
  importar** (columna vive hoy en `extracto_bancario.cuenta_bancaria_id`, nullable — pasa a
  exigirse en el punto de importación para extractos nuevos). No rompe nada retroactivo: nadie
  usa el motor de recaudo en producción todavía.
- **D-CB-3 (parcial, la pieza de negocio) — una conciliación `certificada` nunca se reabre.**
  Terminal, igual que un comprobante contabilizado — un error se corrige con un ajuste en la
  conciliación del período siguiente, mismo criterio append-only de todo el repo. El resto de
  D-CB-3 (forma exacta de las dos tablas nuevas, `conciliacion_bancaria`/
  `conciliacion_bancaria_partida`) queda como diseño técnico a implementar tal como lo describe
  el prompt §6, sujeto a ajuste normal de implementación (no es una decisión de negocio que
  necesite cerrarse aparte).
- **D-CB-4 — Rol para certificar: `administrador`, distinto de quien prepara (`auxiliar`).**
  Confirmado contra el enum real (arriba) — mismo patrón maker-checker que FIN-3
  (`aprobar_lote`/`ejecutar_lote`) y el art. 48 de cartera.
  **D-CB-5 — Notas débito/crédito bancarias sin registrar:** botón "crear comprobante contable"
  desde la partida no cruzada, que pre-arma un borrador en el módulo de comprobantes ya existente
  (CO-2) — la conciliación nunca contabiliza sola. Adoptado tal como lo propone el prompt, sin
  objeción — es diseño técnico, no una decisión de negocio con alternativas reales.
- **D-CB-6 — Ubicación en el menú: `finanzas/conciliacion`**, junto a `cuentas_bancarias` y
  `finanzas_lotes_pago`, que ya viven ahí.

**Investigación externa que corrobora el diseño** (WebSearch, sesión de hoy, independiente de la
que ya cita el prompt en su §1): estándar de la industria (Xero/QuickBooks/NetSuite) — pantalla
única línea-por-línea con tres acciones (match/aceptar sugerencia/crear nuevo), cascada de
matching por capas (exacto→difuso→detección de reversos), excepciones clasificadas por tipo, meta
~95%+ auto-match. Y, específico de PH en Colombia (NIIF-PYMES Sección 35, obligatoria para
copropiedades): **prohibido "forzar" la igualdad libros↔extracto con reclasificaciones** — las
diferencias se explican, nunca se maquillan (coincide exactamente con la "regla de oro" del
prompt: la conciliación nunca edita el ledger, solo pre-arma). Consignaciones sin identificar
deben reconocerse primero en una cuenta transitoria de naturaleza pasiva antes de reclasificarse
— insumo concreto para el catálogo `lista_tipos` de `conciliacion_bancaria_partida` (D-CB-3):
confirma que el tratamiento contable de una partida "en banco, no en libros" positiva y no
identificada debe ir a un pasivo transitorio, no directo a una cuenta de ingreso o cartera.

**Siguiente paso:** Fase 1 del prompt (§7) — Entregable A: UI del motor de recaudo ya construido
(`finanzas/conciliacion/`), prerrequisito barato del Entregable B. Sin backend nuevo.

## D-114

**Entregable A cerrado — UI del motor de recaudo (banco↔residente) ya construido, cero backend
nuevo.** Fase 1 de `Docs/Conciliacion Bancaria/PROMPT_CONCILIACION_BANCARIA_CONTABLE.md` §7.

**Qué se construyó** (solo frontend — `extracto_bancario`/`extracto_linea`/
`conciliacion_propuesta`, `importar-extracto-bancario`, `conciliar-linea` ya existían desde Fase 3,
20260904170000+, sin ninguna UI hasta ahora):
- `apps/web/app/stores/conciliacion.ts` — `cargarLineas` (con filtro estado/cuenta/fecha,
  `conciliacion_propuesta` embebida con el inmueble candidato), `medirKpi` (mismo cálculo que
  `medirAutoConciliacion()` de `liquidation-engine`, replicado porque ese módulo no está en el
  barrel del paquete — `exports` de su `package.json` no lo expone, importarlo rompería el build
  del cliente), `importarExtracto` (multipart a la Edge Function) y `resolverLinea` (las tres
  acciones de `conciliar-linea`).
- `apps/web/app/pages/finanzas/conciliacion/index.vue` — bandeja con KPI, filtros y lista.
- `apps/web/app/components/finanzas/ConciliacionImportarModal.vue` y
  `ConciliacionResolverDrawer.vue` — el heurístico se muestra como candidato preseleccionable,
  nunca se auto-aplica (el usuario siempre confirma el inmueble antes de que el botón se habilite).
- Entrada de menú `Finanzas → Conciliación bancaria`, ícono propio (edificio de banco, distinto de
  la billetera de `tesoreria`).

**Verificado en navegador de punta a punta** (regla del repo para cambios de UI — no basta con que
compile): con datos sembrados directo en Postgres local (el importador CSV en sí ya está probado
por `tests/tenancy/conciliacion.test.ts`, no hace falta repetirlo aquí) se probaron los tres
caminos reales contra las Edge Functions: aplicar a inmueble con un candidato heurístico
preseleccionado (pasó, quedó `conciliada_manual`), descartar con motivo (pasó, quedó
`descartada`), y el filtro por estado. El KPI se mantuvo en 0% tras la resolución manual —
correcto: mide auto-conciliación, no resolución total.

**Dos bugs de integración reales encontrados y corregidos durante la verificación** (no solo
estilo): (1) los componentes nuevos en `components/finanzas/` se referenciaban en la página sin el
prefijo `Finanzas` que Nuxt les asigna automáticamente (`<FinanzasConciliacionImportarModal>`, no
`<ConciliacionImportarModal>` — mismo patrón ya usado en el repo, ver
`FondosFondoMovimientoDrawer` en `FondosTabMovimientos.vue`); sin el prefijo, Nuxt no resolvía el
componente y fallaba en silencio (advertencia de hidratación en consola, ningún error visible en
pantalla). (2) el filtro de rango de fechas desbordaba horizontalmente el layout en una grilla de
4 columnas — se corrigió a 5 columnas con el rango de fechas ocupando 2.

**Efecto colateral de la propia verificación, corregido correctamente:** al probar "aplicar a
inmueble" contra INM-101 del tenant demo compartido (`GC-001`, `fdb1998c-...`) se creó un pago real
de $180.000 — `pago_aplicaciones` es append-only (SEC-14, ver
`project-sec14-append-only-sin-marcha-atras`), así que no se pudo borrar. Se corrigió con el
mecanismo real del repo para esto, `fn_anular_pago()` (RC-2, `20260903130000_anulacion_pago.sql`):
una reversa de -$180.000 con motivo explícito, no una eliminación. Efecto neto sobre el tenant
demo: cero, y queda auditable en vez de ser un borrado silencioso. El resto de la siembra
(`extracto_bancario`/`extracto_linea`/`conciliacion_propuesta`, sin protección append-only) sí se
eliminó limpiamente.

**No se corrió `pnpm verify` completo** — cadencia del repo (`feedback-cadencia-push-prod-hoja-de-
ruta`): un verify remoto completo se reserva al cierre de ola, no a cada corte. Sí se corrieron
`pnpm --filter @aquila/web typecheck` y `lint` (limpios) más la verificación real en navegador de
arriba.

**Siguiente paso:** Fase 3 en adelante del prompt §7 — Entregable B (conciliación bancaria
CONTABLE, banco↔libro), con D-CB-1..6 ya cerrados (D-113).

## D-115

**Fase 3 (esquema) del Entregable B cerrada** — migración
`20260935060000_conciliacion_bancaria_contable_esquema.sql`, aplicada a desarrollo local. Solo
esquema: el motor de cruce (Fase 4) y las Edge Functions que lo invocan (Fase 5) siguen sin
construir.

**Qué se creó:**
- **D-CB-2 aplicado**: `extracto_bancario.cuenta_bancaria_id` pasa a `NOT NULL` — verificado antes
  de alterar (0 filas con la columna nula en desarrollo). `importar-extracto-bancario/index.ts`
  pasa a exigir el parámetro (antes opcional) con el mismo mensaje `INVALID_PAYLOAD`.
- Catálogo `TIPO_PARTIDA_CONCILIACION` en `lista_tipos` (6 valores: depósito en tránsito, nota
  débito/crédito del banco, cheque pendiente, salida pendiente, otro) — registrado primero en
  `public.tipos` (la migración falló en el primer intento por saltarse este paso — el guard
  `lista_tipos_tipo_fkey` lo detectó correctamente antes de escribir nada, transacción revertida
  limpia, sin necesidad de rollback manual).
- `conciliacion_bancaria` (cabecera, D-CB-3): una por `(tenant_id, cuenta_bancaria_id, periodo_id)`,
  estado `borrador|certificada` (enum nativo, D-24 — gatilla terminalidad), certificación
  terminal (`guard_conciliacion_bancaria_transicion`, D-CB-3: nunca se reabre, corrección vía la
  conciliación del período siguiente). RLS `ENABLE+FORCE`, solo `SELECT` para `authenticated`.
- `conciliacion_bancaria_partida` (líneas no cruzadas): `origen` `banco|libro` (enum nativo —
  decide qué FK exige `guard_conciliacion_bancaria_partida_coherencia`: `extracto_linea_id` o
  `contable_comprobante_detalle_id`, nunca ambas ni ninguna), `tipo_id` contra el catálogo nuevo,
  `resuelta` boolean (única columna que puede cambiar después de certificar la cabecera — p. ej.
  un cheque que se cobra el mes siguiente). Misma RLS solo-lectura.

**Verificado:** `pnpm db:push:dry` + `pnpm db:push` en desarrollo; `supabase db lint` limpio sobre
las dos funciones nuevas. **Regresión real encontrada y corregida**: el `NOT NULL` de
`cuenta_bancaria_id` rompía 6 fixtures de `tests/tenancy/conciliacion.test.ts` (la "cola manual" —
5 bloques que insertan `extracto_bancario` directo, sin pasar por la Edge Function) y 1 de
`tests/rls/conciliacion.test.ts` — todos corregidos agregando una cuenta bancaria de fixture
(`ENTIDAD_FINANCIERA` = bancolombia). `tests/finanzas/lotes-pago.test.ts` ya la traía, sin cambios.
Regresión completa tras el fix: `tests/tenancy/conciliacion.test.ts` (11), `tests/rls/conciliacion.test.ts`
(8), `tests/finanzas/lotes-pago.test.ts` (19), `tests/rls/schema-forced-rls.test.ts` (2) — todo
verde. `pnpm --filter @aquila/web typecheck`/`lint` limpios (el store/modal de Entregable A
pasan a exigir la cuenta bancaria en vez de dejarla opcional, coherente con el nuevo `NOT NULL`).

**No se corrió `pnpm verify` completo** (misma cadencia de D-114 — se reserva al cierre de ola).
`pnpm db:types`/`db:push:prod` siguen pendientes de la decisión del usuario (igual que D-112/D-114:
el script exige confirmación interactiva "si", no automatizable).

**Siguiente paso:** Fase 4 — motor puro de cruce banco↔libro (sin Supabase, fixtures
determinísticos, mismo nivel de pureza que `conciliacion-matching.ts`), destino
`packages/liquidation-engine/src/**` o `financial-kernel` para heredar el umbral de cobertura
100%.

## D-116

**Fase 4 (motor puro de cruce) cerrada** —
`packages/liquidation-engine/src/conciliacion-bancaria-cruce.ts` (+ su test), 100% de cobertura
(statements/branches/funcs/lines), 15/15 pruebas verdes.

**Corrección a una afirmación del plan, verificada contra el código real, no asumida:** el prompt
(§7 fase 4) dice que `vitest.config.ts` "ya exige 100%" en `packages/liquidation-engine/src/**` —
verificado: **falso**. El umbral 100% solo aplica a `packages/financial-kernel/src/**`,
`packages/ael-runtime/src/**` y `apps/web/app/types/permissions.ts`; `liquidation-engine` cae en
el general (80%). Se llegó a 100% igual, por rigor propio en código financiero — no porque el
gate lo exigiera. No se corrigió el prompt (es un documento de encargo histórico, no una fuente
de verdad viva) — se deja esta nota como la corrección real.

**Diseño del motor:**
- Convención de signo única: positivo = entra dinero (abono banco / débito de la cuenta contable
  de bancos, que es de naturaleza débito por ser grupo 11). `MovimientoLibro.monto` es siempre
  `debito - credito` — la resta la hace quien arme el adaptador (Fase 5), no este módulo.
- Cascada de cruce, mismo espíritu que `conciliacion-matching.ts`: (1) referencia exacta
  normalizada, (2) monto exacto + ventana de 3 días **solo si hay un único candidato** a cada
  lado (ambigüedad real → ninguno cruza, ambos quedan visibles como partidas), (3) lo que sobra
  se clasifica.
- Clasificación de lo no cruzado sigue literalmente el vocabulario que ya cerró D-CB-3: banco
  positivo+reciente (≤3 días del corte) → `deposito_transito`; banco positivo+lejano →
  `nota_credito_banco`; banco negativo → `nota_debito_banco`; libro negativo (salida) →
  `cheque_pendiente` (el adaptador de Fase 5 puede refinarlo a `partida_salida_pendiente` si
  logra trazar un `finanzas_lotes_pago` concreto — el motor puro no tiene esa información); libro
  positivo sin cruzar → `otro` (caso atípico, no se inventó vocabulario nuevo fuera del catálogo).
- **Nota de diseño explícita, no un hueco**: "depósito en tránsito" aquí se asigna a movimientos
  del lado BANCO sin cruzar (no de libros, como en el ejemplo de texto clásico de contabilidad)
  porque en AQUILA la causalidad real va al revés — `extracto_linea` (recaudo) suele adelantarse
  a `contable_comprobante` (CO-3 materializa por lotes, no en el momento). Es la clasificación que
  ya proponía el prompt §5-B; aquí se deja explícito el porqué para que la próxima sesión no lo
  lea como un error de dirección.

**No se tocó ningún Edge Function ni tabla** — Fase 4 es 100% TypeScript puro, sin `pnpm db:push`
ni cambios de esquema.

**Siguiente paso:** Fase 5 — adaptador Supabase + Edge Functions nuevas
(`generar-conciliacion-bancaria`, `certificar-conciliacion-bancaria`) que arman
`MovimientoBanco[]`/`MovimientoLibro[]` desde `extracto_linea` y `contable_comprobante_detalle`,
llaman este motor, y escriben `conciliacion_bancaria`/`conciliacion_bancaria_partida`.

---

## D-117

**Fase 5 (adaptador Supabase + Edge Functions) cerrada** —
`packages/liquidation-engine/src/conciliacion-bancaria-supabase.ts` (`generarConciliacionBancaria`,
`certificarConciliacionBancaria`) + `supabase/functions/generar-conciliacion-bancaria/index.ts` +
`supabase/functions/certificar-conciliacion-bancaria/index.ts`. `tsc --noEmit` y `eslint` en cero,
`supabase db lint` sin hallazgos nuevos, `tests/finanzas/conciliacion-bancaria-contable.test.ts`
8/8 verdes contra los dos Edge Functions reales (HTTP, no el adaptador por import directo — no hay
precedente en el repo de probar un `*-supabase.ts` importándolo desde `dist/` en un test; el patrón
establecido, igual que `tests/tenancy/conciliacion.test.ts`, es `cliente.functions.invoke(...)`).

**D-14 respetado, no una excepción nueva:** `conciliacion-bancaria-supabase.ts` habla con Supabase
(`@aquila/shared`), así que necesitaba entrar a la whitelist de `eslint.config.js` junto a su
hermano `conciliacion-supabase.ts` — se agregó ahí, no se relajó la regla general.

**Dos gaps de entorno reales, no de código, encontrados y corregidos antes de poder cerrar el
corte (ninguno inventado — verificados en vivo contra prod/local):**

1. **`db:types` nunca podía apuntar a producción.** A diferencia de `db-push.mjs` (que ya tenía
   `--prod` → lee `.env.production`, D-25), `db-types.mjs` siempre leía `.env` — que en este
   entorno apunta a local (`http://127.0.0.1:...`), y el project ref solo se puede extraer de un
   host `https://<ref>.supabase.co`. `pnpm db:types` era, en la práctica, irrealizable desde este
   `.env`. Se agregó `--prod`/`pnpm db:types:prod` a `scripts/db-types.mjs`, mismo criterio que
   `db-push.mjs` — sin este fix, la Fase 5 no podía typecheckear nunca (las tablas nuevas de la
   Fase 3 no existían en `database.generated.ts` hasta regenerar contra el proyecto real).

2. **El primer intento de `pnpm db:push:prod` de la Fase 3 falló en producción**:
   `extracto_bancario.cuenta_bancaria_id` no podía ser `NOT NULL` — 190 filas (20 tenants, ninguno
   con `cuentas_bancarias` configurada: extractos de antes de que ese catálogo existiera) ya eran
   `NULL` en prod, invisibles desde local porque ahí nunca hubo esos datos heredados (mismo patrón
   de [[feedback_diagnosticar_datos_faltantes_local_antes_de_bug]]). D-CB-2 seguía cerrada en su
   intención (todo extracto **nuevo** exige cuenta bancaria) pero no en su mecanismo: se cambió
   `alter column ... set not null` por `add constraint ... check (cuenta_bancaria_id is not null)
   not valid` (decisión del usuario, no mía — se le presentaron 3 opciones vía `AskUserQuestion` y
   eligió esta) — exige la columna en todo INSERT/UPDATE nuevo sin tocar ni validar las 190 filas
   heredadas. Nada se inventó ni se borró.

**Motor de cruce en producción real, no solo en el test puro de Fase 4:** el test de integración
verificó extremo a extremo — un movimiento que cruza (monto+fecha, paso 2), uno de banco sin
cruzar (`deposito_transito`, por estar dentro de la ventana de 3 días de la fecha de corte), uno de
libros sin cruzar (`cheque_pendiente`, monto negativo) — y reafirmó el invariante contable
(`saldoBancoAjustado === saldoLibrosAjustado`) contra datos realmente persistidos, no solo
calculados en memoria.

**D-CB-4 (segregación de funciones) verificado con HTTP real:** un usuario sin membership recibe
403 al generar; un auxiliar (sin ser administrador) recibe 403 al certificar; un administrador sí
puede certificar. `CONCILIACION_BANCARIA_YA_EXISTE`, `CUENTA_BANCARIA_SIN_CUENTA_CONTABLE`,
`CONCILIACION_BANCARIA_YA_CERTIFICADA` y `CONCILIACION_BANCARIA_NO_ENCONTRADA` — los cuatro
códigos de error nuevos de este corte — se ejercitaron con el código HTTP real, no solo leídos del
código fuente.

**`deno check` no es un gate real para Edge Functions en este repo** (hallazgo, no regresión de
esta fase): falla igual sobre `importar-extracto-bancario/index.ts`, ya verificado y desplegado
hace semanas — `withSupabase<Database>` no infiere sus genéricos en `deno check` a través del
límite npm/JSR. Coherente con que `test:edge` en `package.json` ya corre con `--no-check`. No se
intentó "arreglar" esto — es deuda preexistente, fuera de alcance de este corte.

**Gap retroactivo cerrado de paso:** `LOTE_PAGO_INVALIDO` (usado desde el guard de Bloque H, D-112)
nunca se había registrado en `error-codes.ts` — se registró ahora, exactamente el error que
[[feedback_registrar_error_codes_al_escribir_el_raise]] advierte evitar.

**No probado en este corte (fuera de alcance, no un hueco silencioso):** el ajuste correctivo de
un período ya certificado (mencionado en el docstring del adaptador como "fuera de alcance de este
corte") y la UI del acta de conciliación.

**Siguiente paso:** Fase 6 — UI del acta de conciliación (dos columnas banco/libros, partidas,
botón certificar), pendiente de que el usuario indique continuar.

---

## D-118

**Fase 6 (UI del acta de conciliación) cerrada — última del alcance obligatorio del plan (§7.6);
solo queda el control de auditoría opcional §7.7.**

- `apps/web/app/stores/conciliacionBancaria.ts` (nuevo): `buscar`/`generar`/`certificar` — generar
  y certificar solo vía Edge Function (`extraerErrorFuncion`, mismo patrón que
  `stores/conciliacion.ts`); las dos tablas no tienen INSERT/UPDATE para `authenticated`, este
  store solo lee directo.
- `apps/web/app/pages/finanzas/conciliacion-bancaria/index.vue` (nuevo): selectores cuenta
  bancaria + período, cabecera con saldos y estado, dos columnas banco/libros con sus partidas,
  botón certificar.
- `apps/web/app/components/finanzas/ConciliacionBancariaCrearComprobanteDrawer.vue` (nuevo):
  D-CB-5 — solo para partidas `nota_debito_banco`/`nota_credito_banco` (las únicas donde "el
  banco hizo algo que libros no sabe"; `deposito_transito`/`cheque_pendiente` se resuelven solos
  el período siguiente). Pre-arma fecha/monto/cuenta banco (signo ya resuelto por el tipo) y deja
  que el auxiliar elija la contrapartida — reutiliza `comprobantesStore.crearComprobante()`, el
  mismo código que usa la captura manual de CO-2, nunca un INSERT propio. Nunca contabiliza sola.
- `apps/web/app/utils/navegacion.ts`: nueva entrada "Conciliación bancaria contable" en
  `/finanzas/conciliacion-bancaria` — **deliberadamente distinta** de "Conciliación bancaria"
  (`/finanzas/conciliacion`, Entregable A, recaudo) para no repetir el mismo rótulo sobre dos
  pantallas distintas (D-CB-6 solo cerró "bajo finanzas/", no el sub-path exacto — la colisión con
  Entregable A no existía cuando se cerró D-CB-6, se resolvió aquí).

**D-CB-4 verificado con roles reales, no solo leído del código**: `has_role(['auxiliar'])` en
`conciliar-linea`/`importar-extracto-bancario`/`generar-conciliacion-bancaria` es literal — un
`administrador` NO pasa ese umbral (sin fallback de jerarquía salvo el pseudo-rol `agent`, que no
aplica aquí). La UI gatea `puedeGenerar`/`puedeCertificar` por rol exacto
(`tenantStore.role === 'auxiliar'` / `'administrador'`), mismo patrón que `cierres.vue`
(`puedeReabrir`). Verificado en navegador con dos usuarios reales: un auxiliar generó (un
administrador no pudo — botón deshabilitado); un administrador certificó (el auxiliar no pudo).

**Verificado en navegador de punta a punta contra Supabase local real (no solo `pnpm verify`)**:
cuenta bancaria sin `contable_cuenta_id` → aviso correcto y selector vacío; generar con datos
reales (un movimiento bancario sin registrar, clasificado `nota_debito_banco`) → acta con saldo
banco `0 → -15000`, partida visible con botón "Crear comprobante"; comprobante creado desde el
drawer → confirmado en Contabilidad → Comprobantes con las dos líneas exactas (111005 crédito
15.000 / 5820 débito 15.000, balanceado), en estado borrador (nunca auto-contabilizado); certificar
→ estado pasa a `certificada`, botón desaparece (terminal). Efecto de la verificación revertido
por completo: comprobante borrador eliminado, `conciliacion_bancaria`/`_partida` y el
`extracto_bancario`/`extracto_linea` de prueba borrados, usuario auxiliar desechable eliminado. El
único cambio permanente es `cuentas_bancarias.contable_cuenta_id` de la cuenta demo de GC-001
(antes nula) — no un artefacto de prueba, sino una configuración real que faltaba (PC-3) para que
esta pantalla fuera usable con el tenant demo.

`tsc --noEmit`/`nuxt typecheck` y `eslint` (`pnpm --filter @aquila/web lint`) en cero — los únicos
7 warnings preexistentes del lint de `apps/web` son de archivos que este corte no tocó.

**No construido en este corte (§7.7, opcional, no bloqueante):** control de auditoría hermano de
`BANCOS_CONCILIACION_PENDIENTE` sobre conciliaciones sin certificar / partidas envejecidas. Con
esto, el plan de
`Docs/Conciliacion Bancaria/PROMPT_CONCILIACION_BANCARIA_CONTABLE.md` queda con su alcance
obligatorio (Entregable A + Entregable B completo, D-113 a D-118) cerrado.

---

## D-119

**Fase 7 (opcional, §7.7/§3.8) construida a pedido del usuario tras cerrar D-118** — control de
auditoría `BANCOS_CONCILIACION_CONTABLE_PENDIENTE`, hermano de `BANCOS_CONCILIACION_PENDIENTE`
(`20260917100000`, conciliación #1 recaudo) pero de la conciliación #4 (contable, banco↔libro).

- `supabase/migrations/20260935070000_conciliacion_bancaria_contable_auditoria.sql`: agrega el
  código al `CHECK` de `auditoria_controles.codigo_automatico` y reproduce completo (Postgres no
  permite parchear un solo branch) `auditoria_control_ejecutar()` con el nuevo `elsif`. Detecta dos
  señales, sumadas en un solo conteo (mismo criterio que `CONTABILIDAD_DESCUADRE`): (a)
  `conciliacion_bancaria` en `borrador` con `preparado_at` de más de 15 días (nunca certificada), y
  (b) `conciliacion_bancaria_partida` con `resuelta = false` de más de 15 días (una nota
  débito/crédito nunca llevada a comprobante, o un cheque/depósito en tránsito nunca aclarado).
  Nivel `MEDIO`, mismo umbral de 15 días que su hermano.
- `apps/web/app/stores/auditoria.ts`: entrada nueva en `CONTROLES_AUTOMATICOS` (lista espejo del
  `CHECK`, sin test de paridad automatizado — se mantiene sincronizada a mano, igual que las 12
  anteriores).
- `tests/rls/auditoria-controles-automaticos.test.ts`: 2 pruebas nuevas (detecta la excepción con
  conteo 2; una conciliación certificada + partida resuelta no cuentan). 18/18 verdes.

**Regresión real encontrada y corregida de paso, no de este corte pero descubierta al tocar este
archivo**: el fixture de `BANCOS_CONCILIACION_PENDIENTE` (preexistente, anterior a D-115) insertaba
`extracto_bancario` sin `cuenta_bancaria_id` — roto desde que D-CB-2 (Fase 3, `20260935060000`)
volvió esa columna exigible en todo INSERT nuevo (`CHECK ... NOT VALID`). Se me había escapado al
corregir los otros 6 sitios en D-115 (solo revisé `tests/tenancy/conciliacion.test.ts` y
`tests/rls/conciliacion.test.ts`, no toda la suite). Corregido aquí con el mismo patrón
(`crearCuentaBancariaFixture`). Grep de todo `tests/` confirma que ya no quedan sitios sueltos.

**Verificado en navegador, no solo con el test**: creado un riesgo → un control (seleccionando la
nueva opción del desplegable, que aparece con su etiqueta completa) → una auditoría → "Ejecutar
ahora" → `PASS · 0 excepción(es)` sobre el estado real (limpio) de GC-001. Todo el fixture de la
verificación (riesgo, control, auditoría) borrado después — confirmado que las 4 tablas volvieron
a 0 filas para el tenant.

`tsc`/eslint (`apps/web` y raíz) y `supabase db lint` en cero — ningún hallazgo nuevo.

## D-120

**FND-PR-09 (`ANALISIS_FONDOS_BLOQUE_A.md` §11/582) — `fondo_movimientos.extracto_linea_id` deja
de ser una FK inerte.** Pedido explícito del usuario tras verificar el gap: la columna existe desde
`20260929110000` ("línea de extracto bancario conciliada que respalda el movimiento") pero nunca
fue exigida ni aceptada por `guard_fondo_movimiento`, y cero pantallas la llenaban (confirmado por
grep en `apps/web/app/{stores,components,pages}/fondos` antes de tocar nada). Modelo §36 "sin
movimientos no conciliados" seguía sin cumplirse a nivel de fondo aunque la conciliación bancaria
contable (D-113..119) ya lo resolviera a nivel de libro mayor.

**Alcance deliberadamente acotado a `aporte`/`rendimiento`** — los únicos dos tipos que pueden
nacer de un movimiento bancario real sin pasar por `pago_id`/`lote_pago_id`: una contribución
extraordinaria que entra por transferencia directa (sin cargo de propietario detrás — si viniera
de un propietario ya tiene `pago_id`, BLOQUE K), o intereses que el banco acredita (el caso citado
literalmente en el diagnóstico del prompt de conciliación bancaria contable). `uso` queda fuera: ya
tiene su origen automático (`lote_pago_id`) y el manual pasa por `fondo_solicitudes_uso` (D-37) —
no se abre un tercer camino. `ajuste`/`traslado_entrada`/`traslado_salida` quedan fuera: son
reasignaciones contables internas a la misma cuenta operativa — verificado que `fondos` no tiene ni
tendrá cuenta bancaria propia (cero FK fondos↔cuentas_bancarias), así que no hay una línea de
extracto distinta que las respalde.

- `supabase/migrations/20260935080000_fondo_soporte_extracto_linea.sql`: reproduce completo
  `guard_fondo_movimiento` (Postgres no permite parchear un solo branch) agregando
  `extracto_linea_id` como soporte alternativo a `documento_id` para `aporte`/`rendimiento`; agrega
  `fondo_movimientos_extracto_linea_unica` (índice único parcial, mismo patrón que
  `extracto_linea_pago_unico` / `finanzas_lotes_pago_extracto_linea_unica`) para que una línea no
  respalde dos movimientos. No se construye ningún motor de conciliación nuevo — se reutiliza
  `extracto_linea` tal cual, mismo criterio que `finanzas_lotes_pago.extracto_linea_id`
  (`20260931290000`): "el fondo no tiene ni tendrá un motor de conciliación propio".
- `apps/web/app/stores/fondos.ts`: `registrarMovimiento` acepta `extractoLineaId` opcional; nueva
  `cargarExtractoLineasDisponibles(tenantId)` — líneas del tenant sin `pago_id` (una línea ya
  resuelta como recaudo tiene su propio camino contable) y que ningún otro movimiento de fondo ya
  tomó (filtro de UX; la garantía real es el índice único).
- `apps/web/app/components/fondos/FondoMovimientoDrawer.vue`: para aporte/rendimiento, un
  `URadioGroup` deja elegir "Documento" (flujo existente) o "Línea de extracto bancario ya
  conciliada" (nuevo `UiSelectorBuscable` sobre las líneas disponibles) — mutuamente excluyentes,
  nunca ambos.
- `tests/tenancy/fondos-modelo-general.test.ts`: 4 pruebas nuevas (aporte/rendimiento con
  `extracto_linea_id` sin documento pasan; ajuste con `extracto_linea_id` sigue exigiendo
  documento; la misma línea no respalda dos movimientos — `23505` sobre el índice único). 49/49
  verdes en ese archivo.

**Verificado en navegador contra el tenant demo local (GC-001), no solo con el test**: sembrada una
`extracto_linea` real (interina, vía script directo — no hay UI de importar extracto en este flujo
de prueba), abierto "Registrar movimiento" → tipo Aporte → radio "Línea de extracto" → la línea
aparece con fecha/descripción/monto formateados → registrado → saldo del fondo sube a $75.000 sin
ningún documento adjunto → confirmado en BD `documento_id: null, extracto_linea_id: <uuid>` →
reabierto el drawer: la misma línea ya NO aparece en el selector (tomada). Como
`fondo_movimientos` es append-only (SEC-14, no admite DELETE), el movimiento de prueba se limpió
con una `reversion` explícita (motivo declarado como prueba) en vez de borrarlo — saldo del fondo
demo verificado de vuelta en $0.

`tsc`/eslint (`apps/web` y raíz) y `supabase db lint` en cero — ningún hallazgo nuevo. Aplicado
solo a desarrollo local — `db:push:prod` queda pendiente de que el usuario lo autorice y lo corra
él mismo.

## D-121

**IA-01: estructura genérica de proveedor de IA por copropiedad, con OpenRouter como gateway.**
Documentación retroactiva — el trabajo ya estaba hecho y en producción (5 migraciones,
`20260935000000`–`20260935040000`, 2026-09-13) pero sin entrada en este archivo. Mismo alcance y
mismo patrón que `pasarela_config`/`pasarela_credencial` (`20260904100000`): esquema, configuración
por tenant y activación — **sin ningún consumo real de un servicio de IA todavía**. Eso lo construye
cada módulo que lo necesite (ejemplo citado en el propio código: extracción asistida de extractos
bancarios en PDF), leyendo esta configuración cuando le haga falta.

- **Por qué por copropiedad y no una clave de plataforma** (decisión del usuario): cada tenant trae
  y paga su propio proveedor/modelo/API key — autonomía y costo son decisión de cada copropiedad,
  no de Aquila, mismo criterio práctico que `pasarela_config` aunque aquí no aplique la razón
  regulatoria de "la copropiedad es el comercio".
- `20260935000000_ia_proveedor_estructura.sql`: enum `ia_proveedor_t` (`anthropic`/`openai`/
  `google`, nativo y no `lista_tipos` porque el valor selecciona en tiempo de ejecución qué
  credenciales exigir y contra qué API hablar — mismo criterio que `pasarela_proveedor_t`, D-24);
  `ia_config` (proveedor + modelo texto libre + `activa`, RLS normal para miembros/`auxiliar`, un
  proveedor activo por tenant vía índice único parcial); `ia_credencial` (**sin ninguna policy para
  `authenticated`, deliberado** — solo guarda `vault_secret_id`, nunca el valor); `fn_activar_ia_
  proveedor` (swap atómico + auditoría, exige `verificada_at` no nulo).
- `20260935010000_ia_credencial_vault.sql`: `fn_guardar_credencial_ia` (guarda/reemplaza en Supabase
  Vault, devuelve el uuid del secreto — nunca el valor; invalida `verificada_at` y desactiva el
  proveedor al reemplazar una credencial) y `fn_credenciales_ia_descifrables` (cuenta cuántas se
  pueden descifrar, nunca las muestra). Ambas `SECURITY DEFINER`, revocadas para `authenticated`,
  solo `service_role`.
- `20260935020000_ia_credenciales_presentes.sql`: `fn_ia_credenciales_presentes` — solo nombres, para
  que la UI muestre "ya capturada" + botón reemplazar sin poder leer el valor.
- `20260935030000_fn_leer_credenciales_ia.sql`: `fn_leer_credenciales_ia` — **la única** función que
  devuelve el valor descifrado; revocada para `authenticated`/`anon`, pensada para que la use, con
  `service_role`, el primer módulo real que necesite hablar con el proveedor (todavía no existe
  ninguno).
- `20260935040000_ia_proveedor_openrouter.sql`: agrega `'openrouter'` al enum (`ALTER TYPE ... ADD
  VALUE` en migración propia — no se puede usar el valor nuevo en la misma transacción que lo
  agrega). Decisión del usuario: OpenRouter no es "un proveedor más" sino un gateway (Bearer token +
  payload compatible con OpenAI) que expone 500+ modelos de 60+ proveedores reales sin que Aquila
  tenga que escribir un descriptor por cada uno.
- **Código de aplicación** (no son migraciones, pero cierran el mismo corte): `packages/ai-providers`
  (`descriptores.ts` con metadata pura por proveedor — capacidades, modelos sugeridos, credenciales
  requeridas; `modelosSoportados` de OpenAI/Google marcados explícitamente como no verificados contra
  documentación vigente, mismo criterio de honestidad que `parserBancolombia`); Edge Function
  `configurar-ia` (acciones `guardar_credenciales`/`probar_conexion`/`activar`, mismo patrón que
  `configurar-pasarela` — el valor de una credencial nunca sale en respuesta HTTP, log ni
  `audit_log`); `apps/web/app/pages/configuracion/ia.vue` + `stores/proveedoresIa.ts` +
  `composables/useOpenRouterModelos.ts` (catálogo EN VIVO de modelos de OpenRouter vía
  `server/api/openrouter-modelos.get.ts` — un proxy Nitro server-side porque el CSP de la app
  bloquea `connect-src` a dominios externos desde el navegador). Tests: `tests/rls/ia-activacion.
  test.ts` (7), `tests/rls/proveedores-ia.test.ts` (9), `tests/tenancy/configurar-ia.test.ts` (6),
  `packages/ai-providers/src/descriptores.test.ts` (2) — 24 pruebas en total.

**Hallazgo real al documentar este corte, no inventado**: `supabase functions list` contra el
proyecto de producción (`hwjmlyzzvpmhadldavbq`) confirmó que **`configurar-ia` NO estaba
desplegada** — el esquema (tablas, funciones, enum) sí había llegado a producción vía
`db:push:prod`, pero la Edge Function nunca se desplegó ahí. Mismo patrón que
`feedback_corte_cerrado_no_implica_desplegado.md`. De paso, el mismo listado mostró que
**`generar-conciliacion-bancaria` y `certificar-conciliacion-bancaria` (D-117, Fase 5 de
conciliación bancaria contable) TAMPOCO estaban desplegadas** en este proyecto — contradecía lo que
D-117 reportó como "desplegadas y verificadas 8/8 real"; lo más probable es que esa verificación se
hiciera contra un entorno distinto (`.env` apuntando a otro proyecto en ese momento, problema ya
documentado en `feedback_verificar_env_antes_de_asumir_entorno.md`).

**Corregido el mismo día, a pedido del usuario**: las tres desplegadas con `pnpm exec supabase
functions deploy <nombre> --project-ref hwjmlyzzvpmhadldavbq` (se recompiló `packages/ai-providers`
primero, ya que `configurar-ia` importa su `dist/` por ruta relativa). Verificado con dos evidencias,
no solo con el mensaje de éxito del CLI: `supabase functions list` las muestra `ACTIVE v1`, y una
llamada `POST` real sin token a cada una responde `401` (rechazo de autenticación — confirma que el
gateway ya las encuentra, a diferencia del 404/CORS que da una función inexistente).

**Cómo aplicar:** si se retoma IA-01 para construir un consumidor real (ej. extracción de extractos
bancarios), el punto de entrada es `ia_config` (RLS ya autoriza `SELECT` a cualquier miembro) +
`fn_leer_credenciales_ia` desde una Edge Function con `service_role` — nunca antes. Las tres
funciones de este hallazgo ya están desplegadas; para cualquier Edge Function futura, no asumir que
"cerrado en código" implica "desplegado en producción" — confirmar siempre con `supabase functions
list` antes de darlo por hecho.

## D-122

**Se retomó y se cerró el audit de guardias de `fn_resetear_copropiedad` que D-99 dejó
deliberadamente a medias.** D-99 corrigió 4 guardias encontradas una por una (SEC-14/
`forbid_mutation*`, cobertura de tablas, CO-2) y se detuvo en una quinta —
`guard_coeficiente_set_padre_inmutable` (`IMMUTABLE_COEFFICIENT_SET`, coeficientes de un set
vigente/histórico, Ley 675 art. 111) — con la instrucción explícita de "auditar de una vez TODAS
las guardias que el reset puede tocar", no seguir parchando una por una.

**Auditoría completa, esta vez contra el catálogo real (`pg_trigger`/`pg_proc` de la base local),
no releyendo migraciones a ojo**: de los 76 tablas que `fn_resetear_copropiedad` borra
explícitamente, solo **19 tienen un trigger que dispara en `DELETE`**. De esas 19, **18 ya leían
`aquila.reset_context`** (las correcciones de D-99 fueron correctas y completas para
`forbid_mutation`/`forbid_mutation_salvo_tenant_borrado`/`guard_contable_comprobante_detalle_
inmutable`). La única que faltaba era exactamente la que D-99 ya había identificado:
`guard_coeficiente_set_padre_inmutable` sobre `coeficientes`. `guard_coeficiente_set_inmutable`
(la guardia hermana, sobre `coeficiente_sets`) no necesitaba tocarse — confirmado contra
`pg_trigger` que solo dispara en `UPDATE`, nunca en `DELETE`.

**Se revisó también el borrado en cascada** (`ON DELETE CASCADE` desde tablas fuera de las 76,
hacia una de las 76): 16 tablas cascadean, de las cuales 2 (`mant_proveedor_evaluacion`,
`solicitud_encuesta`) tienen guardia de `DELETE` — ambas ya usan `forbid_mutation`, ya cubierta.

- `supabase/migrations/20260935090000_fn_resetear_copropiedad_guardia_coeficientes.sql`: mismo
  patrón exacto que `guard_contable_comprobante_detalle_inmutable` (D-99 punto 3) — la excepción se
  acota a `tg_op = 'DELETE' and current_setting('aquila.reset_context', true) = 'true'`, nunca a
  INSERT/UPDATE. Un coeficiente de un set vigente/histórico sigue siendo inmutable para cualquier
  edición fuera de un reset.
- `tests/rls/fn-resetear-copropiedad-coeficientes.test.ts` (2 pruebas nuevas, no existía ningún test
  de esta función hasta ahora — D-99 la había verificado solo con RPCs manuales en vivo): (1)
  regresión — un coeficiente de un set vigente sigue rechazando `DELETE` directo fuera de reset con
  `IMMUTABLE_COEFFICIENT_SET`; (2) `fn_resetear_copropiedad` borra coeficientes de un set `vigente`
  Y de un set `historica` (las dos ramas del guard) sin bloquearse, dejando 0 filas en
  `coeficientes`/`coeficiente_sets` para el tenant. `tsc`/eslint/`supabase db lint` en cero.

**Con esto, el audit de guardias queda genuinamente cerrado** — no había "más guardias sin
descubrir" (el miedo que motivó parar en D-99): eran exactamente 5, las mismas 5, y ya están las 5
corregidas.

**Hallazgo aparte, NO corregido en este corte** (fuera del alcance de "guardias" — es un problema de
integridad referencial, no de trigger): al mapear los FKs hacia las 76 tablas, **118 FKs con
`ON DELETE NO ACTION`** apuntan desde tablas que el reset NUNCA borra (mayormente Mantenimiento —
`mant_ordenes_trabajo`, `mant_inspecciones`, `mant_contratos`, etc. — y Gobierno — `gobierno_
miembros`, `gobierno_reuniones`, etc. — hacia `activos`/`terceros`/`inmuebles`/`documentos`/
`gobierno_organos`). D-99 punto 2 ya sabía que ~95 tablas quedaban sin cubrir y asumió que
"correctamente, en su mayoría" eran config — esta cuenta corrige esa suposición: una parte real de
esas 118 referencias son datos operativos de Mantenimiento/Gobierno, no config, y un tenant con
datos poblados en esos módulos haría fallar el reset con una violación de FK (23503) al intentar
borrar `activos`/`terceros`/`inmuebles`, igual que ya pasó una vez con `contable_comprobante` en
D-99. Queda como deuda cuantificada, no como sorpresa vaga — pendiente de que el usuario decida si
se amplía la cobertura de `fn_resetear_copropiedad` a esas tablas.

**Aplicado solo a desarrollo local** — `db:push:prod`/`db:types:prod` pendientes de que el usuario
los autorice y los corra él mismo.

**Addendum 2026-09-14 — ya en producción.** El usuario corrió `pnpm db:push:prod` (confirmación
"si" tecleada por él mismo); `20260935090000` quedó aplicada en `hwjmlyzzvpmhadldavbq` (verificado
con `supabase migration list --project-ref`, `local`/`remote` iguales). `pnpm db:types:prod`
regenerado. Ver D-124 para el resto de la verificación post-push.

## D-123

**Diagnóstico del `pnpm verify` remoto que falló al cierre de Ola 2** (27 archivos/37 tests en
rojo, dominios dispersos: create-tenant, cartera, gobierno, mantenimiento, conciliación bancaria,
fondos) — y las dos correcciones que salieron de ese diagnóstico. `pnpm build`/`typecheck`/`lint`
del mismo run habían pasado limpios; solo `pnpm test` falló, lo que ya apuntaba a infraestructura/
red, no a un defecto de código.

**Método**: en vez de releer el log de 4111 líneas y adivinar, se re-corrieron ~15 de los 37 tests
fallidos de forma aislada, en vivo, contra el mismo proyecto de producción (mismo mecanismo de
`pnpm verify` remoto: variables `SUPABASE_*` exportadas por encima de `.env`). Tres causas
independientes, confirmadas por evidencia directa, no inferidas:

1. **Timeouts de Vitest calibrados para Docker local, no para producción real (la mayoría de las
   37 fallas).** `vitest.config.ts` no fijaba `testTimeout`/`hookTimeout` — corría con los defaults
   (5s test / 10s hook). Contra un proyecto remoto real eso alcanza casi siempre, pero no bajo la
   menor latencia o carga: se reprodujo en vivo un **"Gateway Timeout" del propio gateway de
   Supabase** en un `SELECT` trivial a `lista_tipos` (`tests/gobierno/atencion.test.ts`) y un
   timeout de test genérico en otro archivo distinto (`tests/rls/politica-financiera-tope-legal.
   test.ts`) — dos archivos que ni siquiera habían fallado en el run original, confirmando que es
   ruido de infraestructura no determinista, no un defecto reproducible. Se confirmó además que
   `create-tenant`, `cartera-etapas`, `concepto-maker-checker`, `fondos-solicitud-decision`,
   `mantenimiento/cumplimiento`, `tenant-predeterminado`, `acuerdos-pago` — todos fallidos en el run
   original — **pasan limpio** al re-correrlos aislados. Corregido: `testTimeout`/`hookTimeout` a
   20s en `vitest.config.ts` (los tests que ya declaraban su propio timeout explícito, como los de
   30-60s, siguen mandando sobre este default).
2. **3 Edge Functions no desplegadas en el momento en que corrió el verify (ya resuelto por
   D-121/D-122, mismo día).** Las 6 fallas de `tests/finanzas/conciliacion-bancaria-contable.test.ts`
   se explican por eso — re-corrido ahora: 8/8 verdes.
3. **Un problema real, activo y reproducible en Brevo (SMS y correo) — corregido en código, la
   cuenta de Brevo en sí sigue siendo decisión del usuario.** `tests/tenancy/compositor-correo-
   envio.test.ts` seguía fallando de forma consistente: `enviar-correo-compositor` respondía `500`
   en vez del `502 BREVO_ERROR` que el propio código intenta devolver. Causa real: el `fetch()` a
   Brevo (`/v3/smtp/email` y `/v3/transactionalSMS/sms`) solo envolvía en try/catch el *parseo del
   cuerpo de error* — ni la llamada `fetch()` en sí (puede reventar por red/DNS/TLS) ni el parseo
   del cuerpo de ÉXITO (`res.json()` revienta si Brevo responde 200 con un cuerpo no-JSON) estaban
   protegidos. El propio diseño ya declaraba la intención ("un despacho que falla por configuración
   tiene que poder leerse en la bandeja, no en los logs del servidor") pero tenía esta grieta. Mismo
   patrón exacto, repetido en 4 archivos (ninguno se había escrito pensando en el otro, es
   coincidencia de estilo, no un helper compartido):
   - `supabase/functions/_shared/email_cobranza_provider.ts` (`enviarEmailCobranza`)
   - `supabase/functions/_shared/sms_provider.ts` (`sendSms`)
   - `supabase/functions/_shared/email_invitation.ts` (`enviarEmailInvitacion`)
   - `supabase/functions/_shared/email_otp_actor_externo.ts` (`enviarEmailOtpActorExterno`)

   Fix idéntico en los 4: todo el bloque `fetch` + manejo de respuesta queda dentro de un único
   try/catch que degrada a la forma de fallo que la función ya declaraba (`{success:false,
   errorMessage}` o `{ok:false, error}`), nunca deja escapar la excepción. 2 tests nuevos en
   `email_cobranza_provider.test.ts` (el único de los 4 con suite propia — `sms_provider.ts`/
   `email_invitation.ts`/`email_otp_actor_externo.ts` seguían sin ningún test antes de este fix,
   deuda preexistente no resuelta aquí): fetch que revienta por red, y 200 con cuerpo no-JSON.
   `email_cobranza_provider.ts` queda en 100% líneas/funciones (`pnpm test:edge`); la cobertura
   insuficiente que ese comando reporta en `email_estado_cuenta.ts`/`http.ts`/`link_token.ts` es
   deuda preexistente, no tocada por este corte.

   **9 Edge Functions consumen estos 4 archivos y necesitan redesplegarse para que el fix tome
   efecto en producción** (el `_shared/` no se versiona por sí solo, solo al desplegar la función
   que lo importa): `enviar-anuncio`, `enviar-correo-compositor`, `webhook-brevo`
   (`email_cobranza_provider`); `actor-externo-solicitar-otp`, `probar-plantilla-sms`,
   `registrar-pago`, `webhook-pasarela` (`sms_provider`); `invite-user`, `resend-invitation`
   (`email_invitation`); `actor-externo-solicitar-otp` también usa `email_otp_actor_externo`.

**Desplegado y verificado el mismo día, a pedido explícito del usuario** ("¿Brevo aún puede mandar
correos?"): se desplegó primero solo `enviar-correo-compositor` con el único propósito de obtener
una respuesta real y no ambigua (con el bug viejo, un 500 no permite distinguir "Brevo rechazó" de
"nuestra función se cayó antes de preguntarle"). Con el fix activo, `tests/tenancy/
compositor-correo-envio.test.ts` corrido en vivo contra producción **pasó limpio (200, ok:true,
envío registrado en `acciones_cobranza_envios`)** — confirma que Brevo SÍ puede enviar correo hoy;
el 500 que se veía antes era el bug de este mismo corte, no un bloqueo real de la cuenta. Con esa
confirmación, se desplegaron las 8 funciones restantes. Las 9 quedaron `ACTIVE` con versión
incrementada (verificado con `supabase functions list`): `enviar-correo-compositor` v2,
`enviar-anuncio` v2, `webhook-brevo` v9, `actor-externo-solicitar-otp` v2, `probar-plantilla-sms`
v5, `registrar-pago` v15, `webhook-pasarela` v4, `invite-user` v17, `resend-invitation` v4.

**La cuenta de Brevo para SMS sigue siendo un problema real y separado, no de código** (`402 -
insufficient credits`, confirmado en la corrida local) — queda para que el usuario recargue saldo
en su dashboard de Brevo. El lado correo, en cambio, ya está confirmado funcionando.

**Addendum — `forgot-password` (recuperar contraseña) verificado end-to-end, correo real
recibido.** A pedido del usuario, se probó `apps/web/app/pages/forgot-password.vue` contra
producción (`apps/web/.env` apuntado temporalmente a `apps/web/.env.remoto`, restaurado después).
`cliente.auth.resetPasswordForEmail()` llama a `POST /auth/v1/recover` de **Supabase Auth
(GoTrue)** — un sistema de correo distinto de las Edge Functions con Brevo de este mismo corte, no
relacionado con el fix de arriba. Verificado con dos evidencias: (1) `auth_logs` del proyecto
registra `user_recovery_requested` para la cuenta correcta con `status: 200`; (2) **el usuario
confirmó que el correo de recuperación llegó realmente a su bandeja**. Flujo de recuperación de
contraseña confirmado funcional de punta a punta en producción.

## D-124

**Resumen general de pendientes across-módulos, a pedido del usuario ("necesito evacuar todos los
pendientes que estén por resolver en cualquier módulo").** Se compiló un inventario cruzando
memoria de sesiones anteriores con verificación en vivo (no solo lo recordado), agrupado en:
verificados ahora mismo (acción inmediata), pendientes de decisión de negocio (no requieren
código), y trabajo de tamaño medio/grande. El detalle completo del inventario vive en la
conversación con el usuario, no se duplica aquí — este decision-log solo registra lo que se CERRÓ
como parte de esa auditoría.

**Hallazgo en vivo, mismo patrón que D-121 ("corte cerrado ≠ desplegado"), esta vez sin que
mediara ningún corte reciente que lo explicara**: diffeando `supabase functions list
--project-ref hwjmlyzzvpmhadldavbq` (85 ACTIVE) contra las 86 carpetas de
`supabase/functions/` (excluyendo `_shared`), 2 funciones con código en el repo nunca habían
llegado a producción:
- `cartera-posicion` (CAR-F1, expone `fn_posicion_cartera()` + `clasificarCartera()` para
  consumo de agente/auditor externo — sin consumidor en `apps/web`, por eso el gap pasó
  desapercibido en todo QA manual de la app).
- `enviar-estados-cuenta-pendientes` (envío batch por cron, gatillo externo aún sin programar
  — ver hallazgo ya conocido en el corte de estados de cuenta).

Ambas desplegadas con `supabase functions deploy cartera-posicion
enviar-estados-cuenta-pendientes --project-ref hwjmlyzzvpmhadldavbq` (autorizado explícitamente
por el usuario), confirmadas `ACTIVE v1` contra `functions list`.

**Hallazgo menor, sin corregir**: `resetear-copropiedad` aparece `ACTIVE` en remoto sin ninguna
carpeta local con ese nombre exacto — probablemente una función vieja/renombrada. No se tocó;
pendiente de que el usuario confirme si sigue en uso o se puede retirar.

**Cierre de D-122**: `20260935090000` (guardia de coeficientes) pusheada a producción por el
usuario (`pnpm db:push:prod`, confirmación interactiva suya) y `pnpm db:types:prod` regenerado.
Reverificación completa post-push: `pnpm build` / `pnpm typecheck` (raíz + 10 paquetes + `nuxt
typecheck`) / `pnpm lint` (raíz + `apps/web`) — todo limpio (lint: 0 errores, 7 warnings de
estilo Vue preexistentes en `apps/web`, ninguno nuevo).

## D-125

**Ampliación de cobertura de `fn_resetear_copropiedad` hacia Mantenimiento y Fondos** (a pedido
explícito del usuario, tras el resumen general de pendientes de D-124 — la deuda de 118 FKs
`ON DELETE NO ACTION` cuantificada en D-122). Migración `20260935100000`.

**Alcance real, auditado en vivo (`pg_constraint`, no releído de memoria)**: 75 tablas fuera de las
76 ya cubiertas por D-99/D-122 referencian, con `NO ACTION`, alguna de las cubiertas. De esas 75,
se agregaron **63** al arreglo `v_tablas` (todas las que tienen `tenant_id` y cuyo grafo de
dependencias admite un orden). Quedaron **deliberadamente fuera** de este corte, para una revisión
propia posterior:
- `gobierno_decisiones` / `gobierno_reuniones` / `gobierno_miembros` / `gobierno_actas`: ciclo real
  de 4 tablas entre sí (dominio de actas y decisiones de asamblea) — el usuario pidió explícitamente
  dejarlo para después de cerrar Mantenimiento/Fondos.
- `mant_reservas`: forma un ciclo real con `cargos` (`cargos.reserva_id` / `mant_reservas.cargo_id`)
  — `cargos` es una tabla núcleo de Cartera/Cobranza ajena a Mantenimiento, así que se agrupó con el
  punto anterior (ambos exigen tocar deferrabilidad de tablas "core", no solo de Mantenimiento/
  Fondos).

**Hallazgo técnico central**: verificado contra `pg_constraint` que **979 de 980 FKs del esquema NO
son `DEFERRABLE`** — el `SET CONSTRAINTS ALL DEFERRED` que la función ya ejecutaba desde D-99 no
hacía nada hasta ahora. Un ciclo real de 2 tablas resueltas en 2 `DELETE` statements SEPARADOS (uno
por tabla, patrón ya usado por la función) no se resuelve con ningún orden posible — hace falta que
el FK en cuestión sea `DEFERRABLE`. Se marcaron **6 constraints puntuales** como
`DEFERRABLE INITIAL IMMEDIATE` (comportamiento normal de la app sin cambios — sigue validando al
instante fuera de esta función; solo el reset, que ya difiere constraints, ahora sí puede
aprovecharlo):
- `mant_ordenes_trabajo.incidencia_id` ↔ `mant_incidencias.orden_trabajo_id`
- `mant_ordenes_trabajo.programacion_id` ↔ `mant_programaciones.orden_trabajo_id`
- `fondo_solicitudes_uso.compromiso_id` ↔ `fondo_compromisos.solicitud_id`

**Las auto-referencias NO necesitan este tratamiento** (`mant_contratos`, `mant_incidencias`,
`mant_inventario_movimientos`, y las ya existentes en `cargos`/`terceros`/`pagos`/`activos`/
`contable_comprobante`/`fondo_movimientos`/`pago_aplicaciones`/`presupuesto_ejecucion`): verificado
que un solo `DELETE FROM t WHERE tenant_id = $1` que borra TODAS las filas propias a la vez —
incluidas las que se auto-referencian — funciona sin `DEFERRABLE`, porque el chequeo de un FK NOT
DEFERRABLE en Postgres ocurre al final del STATEMENT (no fila por fila); las auto-referencias
existentes llevan meses en producción sin este problema, lo que lo confirma empíricamente.

**Hallazgo colateral, corregido de paso — un bug real, no solo teórico**: `cargos.novedad_id ->
novedades` tenía **330 filas pobladas** en tenants de prueba (tenants disponibles de la suite, no
datos de un cliente real, pero SÍ un enlace vivo y ejercitado) — el arreglo anterior de `v_tablas`
borraba `novedades` ANTES que `cargos`, lo cual habría fallado con un cargo real originado de una
novedad (ej. un recargo por mora). El nuevo orden, recalculado desde cero por un topological sort
sobre `pg_constraint` real (no a mano — se intentó a mano primero y se detectaron contradicciones,
ver más abajo), corrige esto: `cargos` ahora va antes que `novedades`.

**Dos ciclos PREEXISTENTES, distintos y no relacionados con Mantenimiento/Fondos, quedan
documentados sin tocar** (siguen dormidos: 0 filas pobladas en toda la base de desarrollo para las
columnas que los completarían):
1. `pagos.intencion_pago_id` ↔ `intenciones_pago.pago_id`.
2. El resto del ciclo de 6 que involucra a `cargos`/`novedades` además del enlace ya corregido:
   `novedades.acuerdo_pago_id -> acuerdos_pago.documento_id -> documentos.envio_id ->
   acciones_cobranza_envios.accion_id -> acciones_cobranza.cargo_id -> cargos` (y de vuelta a
   `cargos.novedad_id -> novedades`, ya resuelto). Ningún orden lineal puede satisfacer un ciclo
   completo — se deja para cuando alguno de esos otros 5 enlaces deje de estar dormido.

**Hallazgo aparte, sin riesgo hoy**: 6 catálogos sin `tenant_id` propio (`contable_plan_cuenta`,
`contable_nota_plantilla`, `contable_estado_linea`, `contable_codigo_retirado`,
`gobierno_clase_sancion`, `gobierno_materia_decision`) referencian `fundamento_normativo` con
`NO ACTION` — verificado que las 112 filas de `fundamento_normativo` en este entorno son 100%
globales (`tenant_id is null`), así que el reset nunca borra ninguna fila que ellos referencien.
Fragilidad latente si algún día se crea un `fundamento_normativo` específico de un tenant; no se
toca en este corte.

**Metodología, para la próxima vez que se retome esto (Gobierno + mant_reservas)**: intentar
calcular el orden "a mano" (insertar el bloque nuevo antes de tal tabla) llevó a contradicciones
reales no detectadas hasta que se verificaron en vivo — se descubrieron así los 2 ciclos
preexistentes de arriba. La única forma confiable fue: (1) enumerar TODAS las FKs `ON DELETE NO
ACTION` reales vía `pg_constraint` entre el conjunto completo de tablas candidatas, (2) excluir los
pares ya resueltos por `DEFERRABLE`, (3) correr un topological sort (Kahn) real sobre ese grafo, (4)
verificar el resultado contra CADA edge real (no solo confiar en que el algoritmo no reportó
ciclo) para confirmar que las únicas violaciones remanentes son exactamente las ya conocidas como
dormidas. No repetir el intento manual.

**Pruebas nuevas** (`tests/rls/fn-resetear-copropiedad-mant-fondos.test.ts`, 3/3): un tenant
desechable por escenario, sembrando datos reales que cierran cada ciclo (OT↔incidencia,
OT↔programación, solicitud↔compromiso) y el enlace vivo `cargos.novedad_id`, confirmando que
`fn_resetear_copropiedad` ya no se bloquea y deja las tablas involucradas en 0 filas. Regresión
verificada sin atribuibles: `fn-resetear-copropiedad-coeficientes` (2/2), `fondos-modelo-general`
(49/49), `fondos-solicitud-decision` (7/7), `ot-incidencias` (17/17), `planes-programacion`
(13/13) — 88/88 en total. `pnpm build`/`typecheck` en verde.

## D-126

**Cierre total de la deuda de 118 FKs (D-122)** — última tanda, a pedido explícito del usuario
("Sigamos con Gobierno y mant_reservas ahora"), deliberadamente dejada fuera de D-125. Migración
`20260935110000`.

**Ciclo real de 4 tablas de Gobierno**: `gobierno_decisiones` → `gobierno_actas` →
`gobierno_miembros` → `gobierno_decisiones`, y `gobierno_decisiones` → `gobierno_reuniones` →
`gobierno_miembros` → `gobierno_decisiones` (dos ciclos de 3 que comparten el tramo
`gobierno_miembros.decision_id -> gobierno_decisiones`). Verificado que **diferir únicamente ese
constraint** (`gobierno_miembros_decision_id_fkey`, `DEFERRABLE INITIAL IMMEDIATE`) alcanza para
romper ambos ciclos a la vez — es el único arco que participa en los dos, no hacía falta tocar más
de un constraint en todo el dominio de Gobierno.

**Tabla nueva descubierta al auditar el ciclo**: `gobierno_votaciones` (referenciada por
`gobierno_decisiones.votacion_id`) — no aparecía en el conteo original de D-122 porque solo se
descubre al mapear las FKs reales de `gobierno_decisiones`; tiene `tenant_id` propio y se agregó a
`v_tablas` junto con las 4 del ciclo.

**Ciclo `cargos`/`mant_reservas`**: `cargos.reserva_id` ↔ `mant_reservas.cargo_id` — un cargo por
reservar una zona común, y la reserva sabe qué cargo generó. Mismo tratamiento que los 3 pares de
D-125: ambos lados `DEFERRABLE INITIAL IMMEDIATE`.

**Metodología**: se recalculó el orden completo de las 146 tablas resultantes desde cero
(topological sort sobre `pg_constraint` real, incluyendo TODAS las FKs de las 140 tablas ya
existentes, no solo las que tocan las 6 nuevas — un primer intento que solo re-consultó FKs
"relacionadas con lo nuevo" dejó pasar 2 violaciones reales sobre pares de tablas antiguas
(`documentos`→`casos_juridicos`, `documentos`→`pagos`) que el reordenamiento había desplazado sin
querer; corregido re-consultando el grafo completo). Verificado edge por edge contra el resultado:
0 violaciones fuera de los 6 constraints `DEFERRABLE` (los 3 de D-125 + los 3 de este corte) y los 2
ciclos preexistentes ya documentados en D-125 (`pagos`↔`intenciones_pago`; el ciclo de 6 vía
`cargos`/`novedades`/`acuerdos_pago`/`documentos`/`acciones_cobranza_envios`/`acciones_cobranza`),
ambos sin relación con este corte y sin tocar.

**Pruebas nuevas** (`tests/rls/fn-resetear-copropiedad-gobierno.test.ts`, 2/2): un tenant desechable
por escenario, sembrando un ciclo real completo con datos válidos (organo→miembro→reunión instalada
→quórum con dos propietarios distintos, art. 45→votación→decisión→acta, cerrando el ciclo con
`decision.acta_id` y `miembro.decision_id`; y por separado zona común con regla vigente→reserva→
cargo con `origen_tipo='reserva'`→cierre del ciclo con `reserva.cargo_id`), confirmando que
`fn_resetear_copropiedad` ya no se bloquea y deja las tablas en 0 filas. Regresión sin atribuibles:
94/94 (incluye `fn-resetear-copropiedad-coeficientes`, `fn-resetear-copropiedad-mant-fondos`,
`gobierno/{acta,reuniones,decisiones,organos,quorum-votacion}`, `mantenimiento/reservas-zonas-
comunes`). `pnpm build`/`typecheck`/`lint` en verde.

**Con esto, D-122 (118 FKs `ON DELETE NO ACTION` sin cubrir) queda 100% cerrado** — no queda
ninguna tabla operativa fuera del alcance de `fn_resetear_copropiedad`, salvo los 2 ciclos
preexistentes dormidos (documentados, sin datos reales que los activen) y los 6 catálogos sin
`tenant_id` que referencian `fundamento_normativo` (dormidos mientras esa tabla sea 100% global).
