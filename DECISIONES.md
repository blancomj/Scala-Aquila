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

|            |          |
| ---------- | -------- |
| **Fase**   | F6 (E3)  |
| **Estado** | Aceptada |
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

|            |          |
| ---------- | -------- |
| **Fase**   | F6 (E3)  |
| **Estado** | Aceptada |
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

## D-21 — E5 (invitaciones): rate limiting diferido, Brevo pendiente de credenciales

|            |          |
| ---------- | -------- |
| **Fase**   | F6 (E5)  |
| **Estado** | Aceptada |
| **Decide** | Usuario (confirmado vía pregunta explícita) |

Dos piezas de E5 quedan fuera del alcance de esta iteración, ambas por decisión
explícita del usuario, no por omisión silenciosa:

**Rate limiting (Upstash Redis, SEC-09).** No está en la lista de tests obligatorios
del plan (T-SEC-01…T-SEC-10, T-MATRIX, T-INV-01 — §12.2), así que `invite-user` no
tiene throttling todavía. Punto de extensión: agregar un chequeo de Upstash al inicio
de `supabase/functions/invite-user/index.ts`, por actor y por copropiedad, antes de
llamar a la RPC.

**Brevo.** El usuario tiene cuenta pero aún no generó la API key transaccional al
momento de este commit. `invite-user` está completo y probado (RPC, checks
`ALREADY_MEMBER`/`INVITE_PENDING`, rollback de la invitación si el envío falla) — el
único cable pendiente es configurar los secrets:

```bash
npx supabase secrets set BREVO_API_KEY=... BREVO_SENDER_EMAIL=... BREVO_SENDER_NAME="Aquila PH" --project-ref hwjmlyzzvpmhadldavbq
```

Sin esto, `invite-user` responde `502 EMAIL_SEND_FAILED` de forma controlada (probado
manualmente — la invitación se revoca automáticamente, no queda una fila fantasma).

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
