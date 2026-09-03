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

## D-39 — Zona de peligro: resetear una copropiedad a su estado recién creada

|            |                                                    |
| ---------- | -------------------------------------------------- |
| **Fase**   | Configuración de copropiedad, ad hoc               |
| **Estado** | Aceptada                                           |
| **Decide** | Usuario (preguntas explícitas, esta sesión)        |

**Contexto.** El usuario pidió una opción en configuración para "resetear una
copropiedad y dejarla como acabada de crear, que solo borre lo que NO se
instala por defecto en la creación". La lectura literal ("borrar tablas que
`create_tenant()` no siembra") no alcanza: `create_tenant()` siembra
`conceptos`, `contable_cuenta`, `contable_cuenta_default` y
`presupuesto_cuenta`, pero el usuario puede haber editado o archivado esas
filas después (es exactamente lo que le pasó a `CUOTA_ADMIN` en gc-001, ver
`paso0/INFORME_PASO_0.md`) — dejarlas intactas no deja la copropiedad "como
recién creada". El usuario aclaró el criterio real: **preservar toda la
configuración ya hecha y a los usuarios; borrar solo lo operativo/
transaccional** ("la idea es conservar la estructura ya configurada pero sin
movimientos").

**Decisión — qué se borra y qué se preserva.** De las 88 tablas con
`tenant_id`, se borran 58 (inmuebles, terceros, coeficientes, presupuestos
anuales, periodos, liquidaciones, cargos, pagos, cartera, jurídico,
conciliación bancaria, novedades, auditoría, documentos) y se preservan 30:
la plantilla de creación (`conceptos`, `concepto_versiones`, `contable_cuenta`,
`contable_cuenta_default`, `presupuesto_cuenta`), usuarios (`memberships`,
`invitations`), y toda la configuración manual (`agrupaciones`,
`zonas_comunes`, `consecutivos_documento`, plantillas de email/SMS/
compositor, pasarela de pago, `lista_tipos_ocultos`, políticas financieras/
cartera, `cuentas_bancarias`, `fuente_financiacion`, `novedad_tipo_cuenta`).
`audit_log` nunca se toca (trazabilidad). `fondos` (fondo de imprevistos) se
preserva como configuración, pero su `saldo_actual` se resetea a 0 porque se
deriva de `fondo_movimientos`, que sí se borra.

**`recibos_caja` queda fuera del reset.** Es un comprobante fiscal con
protección absoluta (`forbid_mutation()`, igual que `audit_log`) — ni borrar
la copropiedad completa lo permite hoy. Preguntado explícitamente, el usuario
confirmó dejarlo fuera: un reset, menos drástico que un borrado total, no
debía ir más allá de lo que el propio sistema permite hoy.

**El obstáculo real no era el orden — era el guard append-only.** 15 tablas
están protegidas por `forbid_mutation_salvo_tenant_borrado()`
(`20260823250000`): rechaza cualquier DELETE mientras el tenant exista, salvo
que la FK `tenant_id ... on delete cascade` lo arrastre al borrar el tenant
mismo. Un reset "in place" nunca cumple esa condición. Se evaluaron tres
salidas — extender el guard con una excepción auditada, borrar y recrear el
tenant (cambia el `id`, rompe referencias externas como los tokens HMAC de
recibo de caja ya compartidos), o dejar esas 16 tablas fuera del reset
(preguntado explícitamente: cargos y pagos son justo el dato más esperado a
limpiar). El usuario eligió extender el guard: mismo patrón ya usado por
`purge_audit_log_antiguo()` (`20260814190000`) para poder purgar `audit_log`
pese a su propio `forbid_mutation()` — un flag de sesión local a la
transacción (`aquila.reset_context`) que solo `fn_resetear_copropiedad()`
sabe activar, nunca un permiso genérico. `UPDATE` sigue prohibido siempre,
sin excepción, en las 15 tablas.

**Dos ciclos reales de FK, resueltos sin tocar UPDATE.**
`documentos ↔ pagos ↔ acuerdo_pago_cuotas ↔ acuerdos_pago` y
`pagos ↔ intenciones_pago` no admiten ninguna secuencia de DELETE por tabla
— cualquier orden deja alguna FK apuntando a una fila que todavía no se
borró. Romper el ciclo con `UPDATE ... SET columna = null` chocaba con el
mismo guard append-only (UPDATE prohibido siempre, sin la excepción que sí
se le dio a DELETE). En vez de eso, se hacen `DEFERRABLE` todas las foreign
keys *entre* las 58 tablas del reset (`DEFERRABLE INITIALLY IMMEDIATE` no
cambia ningún comportamiento existente — solo permite que una transacción
pida explícitamente diferir la validación), y `fn_resetear_copropiedad()`
pide `set constraints all deferred`: los 58 `DELETE` se ejecutan en un orden
razonable sin depender de que sea perfecto, porque Postgres valida las FK al
final de la transacción, cuando ambos lados de cualquier ciclo ya están
vacíos para ese tenant.

**Autorización.** `fn_resetear_copropiedad(p_tenant_id)` exige rol
`administrador` vía `has_role()` — mismo criterio que
`fn_toggle_compositor_correo`. La Edge Function `resetear-copropiedad` es una
capa de contrato (JWT, rate limit, traducción de errores), sin autorización
propia: toda la decisión vive en la RPC. En el frontend,
`CopropiedadZonaPeligro.vue` gatea la sección con `tenantStore.role ===
'administrador'` directamente (no con el permiso `tenant:delete` de
`types/permissions.ts`, que hoy da el mismo acceso a `auxiliar` y
`administrador` — deuda preexistente de esa matriz, fuera de alcance de esta
decisión) y exige escribir el nombre exacto de la copropiedad para confirmar.

**Consecuencia.** Primer "danger zone" del proyecto — sin componente
compartido todavía porque es el único caso; extraerlo cuando aparezca un
segundo. Cualquier tabla tenant-scoped nueva que se agregue después debe
clasificarse explícitamente como configuración (se preserva, no se toca) u
operativa (se agrega a `v_tablas` en `fn_resetear_copropiedad`) — si no se
agrega a ninguna lista, simplemente sobrevive al reset sin borrarse, lo cual
falla en el sentido conservador (nunca borra de más) pero puede dejar la
copropiedad no del todo "recién creada".

**El trinquete de gobernanza (pregunta del usuario: "qué pasa cuando haya
más módulos").** Sin nada que lo exija, esa clasificación depende de que
alguien se acuerde de actualizarla — es la misma deriva silenciosa que dejó
`CUOTA_ADMIN` archivado en gc-001 sin que ningún test lo notara. Se evaluó
dejar que la función descubra dinámicamente en Postgres todas las tablas con
`tenant_id` y borre por defecto todo lo que no esté en la lista de
preservadas — se descartó porque invierte el error hacia el lado peligroso:
una tabla nueva se borraría por defecto en vez de sobrevivir por defecto.

Se optó por el mismo criterio que D-38 (trinquetes de gobernanza, no
permisos permanentes): `tests/governance/resetear-copropiedad-coverage.test.ts`
lee en vivo (vía `pg_attribute`/`SUPABASE_DB_URL`, mismo patrón que
`tests/rls/schema-forced-rls.test.ts`) todas las tablas de `public` con
columna `tenant_id`, y falla si alguna no está en exactamente una de tres
categorías: `TABLAS_PROTEGIDAS` (2, protección absoluta), `TABLAS_PRESERVADAS`
(28, configuración + usuarios, `Record<string,string>` con motivo obligatorio
por entrada) o la lista operativa — que el test NO duplica a mano: la lee del
cuerpo real de `fn_resetear_copropiedad()` vía `pg_get_functiondef`, así que
nunca puede desincronizarse de lo que el reset ejecuta de verdad. También
falla en la dirección contraria (una entrada clasificada que ya no existe en
el esquema, ej. tras un rename), el mismo permiso-muerto que D-38 encontró en
el allowlist de color. Al escribir este test se detectó y corrigió un olvido
real de esta misma decisión: `lista_tipos` (mixta plataforma/tenant, como
`fundamento_normativo`) no estaba clasificada — se agregó a preservadas,
mismo criterio que `lista_tipos_ocultos`.

## D-40 — `tests/seed/gc001.test.ts` se retira: verificaba un fixture que ya no existe

|            |                                                    |
| ---------- | -------------------------------------------------- |
| **Fase**   | Higiene de tests, ad hoc                           |
| **Estado** | Aceptada                                           |
| **Decide** | Usuario (preguntas explícitas, esta sesión)        |

**Contexto.** `pnpm test` traía 3 fallos en `tests/seed/gc001.test.ts`: presupuesto
2026 vigente no encontrado, 66 inmuebles en vez de 6, `CUOTA_ADMIN` archivado en
vez de activo. La lectura inicial fue "gc-001 se desincronizó, hay que
re-sembrarlo" — la inspección contra la base real mostró algo distinto: el
tenant `gc-001` tiene **5 liquidaciones ejecutadas, 14 cargos, 2 pagos, 67
terceros y 66 inmuebles** con ficha técnica completa. No es contaminación de
tests: es un tenant usado activamente como copropiedad de demostración desde
la UI, con meses de actividad real encima.

**No es la primera vez.** El encabezado de
`tests/liquidacion/snapshot-fuente-financiacion.test.ts` (antes
`gc001-snapshot.test.ts`) ya documenta el mismo hallazgo, resuelto hace tiempo:
*"gc-001 dejó de ser un fixture congelado hace tiempo — hoy tiene 66 inmuebles
y una decena de conceptos en distintos estados de prueba manual desde la UI...
cualquiera que usara gc-001 como copropiedad de demostración iba a volver a
romperlas."* La solución que se aplicó entonces no fue restaurar el tenant: fue
dejar de depender de sus valores exactos y armar un tenant desechable propio
para cada test. `tests/contabilidad/contable-movimientos.test.ts` va todavía
más lejos y depende **a propósito** del estado actual de `gc-001` (sus 14
cargos reales, su `contable_cuenta_default` poblado) como fixture de "caso
feliz" con datos reales.

**Por qué no restaurar ni re-sembrar en el sitio.** Borrar los 60 inmuebles
extra y las 5 liquidaciones para devolver `gc-001` a su estado de 2026-08-14
es irreversible y destruye historial de prueba real, no basura — y de todas
formas volvería a romperse la próxima vez que alguien probara algo manualmente
contra ese tenant desde la UI, exactamente como ya le pasó una vez.

**Por qué no crear un tenant `gc-001-canonico` aparte.** Se evaluó como primera
opción. Se descartó al verificar que el golden case *matemático* de
`paso0/INFORME_PASO_0.md` §3.1-3.3 ya está cubierto sin ninguna dependencia de
Supabase: `packages/{ael-runtime,financial-kernel,liquidation-engine}/src/
golden-case-gc001.test.ts` construyen su `DataSnapshot` a mano con los valores
exactos del golden case (6 inmuebles, presupuesto 120M, `CUOTA_ADMIN`) y
corren el motor de punta a punta contra eso. Un tenant nuevo solo replicaría
una verificación que ya existe, y quedaría expuesto al mismo riesgo de deriva
que ya materializó `gc-001` — infraestructura nueva para un problema ya resuelto.

**Decisión.** Se retira `tests/seed/gc001.test.ts` sin reemplazo. Su propósito
original (F2→F3: confirmar que el seed inicial cargó bien en el proyecto
remoto) ya se cumplió cuando se escribió; las dos aserciones que seguían
siendo válidas hoy (el tenant existe, moneda COP) no justifican un archivo de
test dedicado a un tenant que cualquier prueba manual futura puede volver a
mover.

**Consecuencia.** `gc-001` queda documentado como lo que ya es en la práctica:
una copropiedad de demostración con datos reales, no un fixture congelado.
Cualquier test que necesite valores exactos y estables arma su propio tenant
desechable (patrón ya establecido en `concepto-tipo-recurrencia-snapshot.test.ts`
y `snapshot-fuente-financiacion.test.ts`); cualquier test que quiera datos
reales variados puede seguir leyendo `gc-001` en modo solo-lectura, como ya
hace `contable-movimientos.test.ts`.

## D-41 — `cartera-cron-diario`: fan-out por tenant, concurrente en vez de secuencial

|            |                                                    |
| ---------- | -------------------------------------------------- |
| **Fase**   | CAR §18, corrección de rendimiento                 |
| **Estado** | Aceptada                                           |
| **Decide** | Usuario (decisión previa de la sesión: "fan-out por tenant") |

**Contexto.** `tests/tenancy/cartera-cron-diario.test.ts` fallaba con 504 en
las dos pruebas que de verdad disparan la corrida. La función ya hacía
"fan-out por copropiedad" como dice su propio comentario de cabecera, pero
**secuencial**: un `for`/`await` que llama a `cartera-recalcular` una
copropiedad a la vez. Con las 4 copropiedades activas que hoy tienen política
de clasificación vigente en el proyecto de desarrollo (`gc-001` entre ellas,
con 66 inmuebles — ver D-40), la SUMA de sus tiempos superaba el límite de
ejecución de la Edge Function. No era una copropiedad rota tumbando la corrida
— era el diseño secuencial escalando con la cantidad de tenants, que solo iba
a empeorar según se activaran más copropiedades.

**Decisión.** El `for`/`await` se reemplaza por `tenantIds.map(...)` +
`Promise.all`: cada copropiedad es su propia promesa independiente (llamada a
`cartera-recalcular` + upsert de su fila en `cartera_corridas_diarias`), todas
concurrentes. Cada rama captura sus propios errores en el `ResultadoTenant`
sin relanzar, así que una copropiedad que falle no aborta `Promise.all` ni
afecta a las demás — se conserva exactamente la garantía de aislamiento que
ya tenía la versión secuencial ("si una falla, las demás siguen"), pero ahora
el tiempo total del cron es el de la copropiedad más lenta, no la suma de
todas.

**Verificado.** Redesplegada la función contra el proyecto de desarrollo real
(`Scala - Aquila`, no el de producción) y las 6 pruebas de
`cartera-cron-diario.test.ts` pasan: ~111s y ~110s respectivamente para las
dos que antes daban 504 (antes >150s, tumbando la función).

**Riesgo que queda abierto, fuera de alcance de esta decisión.** `gc-001` sola
(66 inmuebles) toma ~110s en `cartera-recalcular` — cerca del límite de
ejecución incluso aislada. La causa no es el fan-out del cron sino que
`cartera-recalcular` hace varias idas y vueltas a la base **por inmueble, en
un `for`/`await` secuencial** (upsert de `cartera_etapas`, carga de la
entrada del job, upsert de `posiciones_cartera_snapshot`, entre otras). Con
más inmuebles por copropiedad (no más copropiedades, que ya está resuelto
aquí) ese costo interno reaparecería. No se toca en esta decisión — es un
problema distinto (rendimiento interno de una función, no fan-out entre
tenants) y merece su propia decisión si vuelve a manifestarse.

## D-42 — `cartera-juridico.test.ts`: un login por usuario y por archivo, no por test

|            |                                                    |
| ---------- | -------------------------------------------------- |
| **Fase**   | Higiene de tests, ad hoc                           |
| **Estado** | Aceptada                                           |
| **Decide** | Usuario (pendiente de sesiones anteriores)          |

**Contexto.** `tests/rls/cartera-juridico.test.ts` fallaba con `Request rate
limit reached` en los últimos 3 tests de `costas_judiciales`, siempre al
llamar `clienteComo()` (login real contra Supabase Auth) dentro de
`crearCertificacionVigente()`. El archivo tiene un solo describe con 3
usuarios de prueba fijos (`agente`, `administrador`, `administradorDos`)
creados una vez en `beforeAll` — pero cada test, y cada fixture auxiliar que
necesitaba actuar como uno de ellos, volvía a iniciar sesión desde cero.
Contadas, eran **31 llamadas a `clienteComo()`** en un solo archivo, para
solo 3 identidades distintas: suficiente para agotar el rate limit de
inicio de sesión de Supabase Auth antes de llegar al final del archivo.

**Decisión.** Se memoiza el cliente autenticado por usuario dentro del
describe: `comoAgente()` / `comoAdministrador()` / `comoAdministradorDos()`
inician sesión la primera vez que se llaman y devuelven el mismo cliente en
adelante (`cache ??= await clienteComo(...)`). Las 31 llamadas a
`clienteComo()` quedan en 3 — una por usuario, no una por uso. No se tocó
`clienteComo()` en `tests/rls/helpers.ts` (usado por decenas de archivos):
el cambio queda local a este archivo, que es el que falla hoy; si el mismo
síntoma reaparece en otro archivo, memoizar dentro de `helpers.ts` para
todos pasa a ser la decisión correcta, pero hacerlo ahora sin evidencia de
que otros archivos lo necesiten sería alcance no pedido.

**Verificado.** Las 25 pruebas de `cartera-juridico.test.ts` pasan; el
archivo completo baja de 31.3s (con los 3 fallos por rate limit al final) a
25.0s.
