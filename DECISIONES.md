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
