# AQUILA PH — FASE I · MASTER IMPLEMENTATION PROMPT

## Contrato operativo del Agente de IA — Plataforma SaaS Multi-Tenant (Nuxt 3 + Supabase)

> **Proyecto:** Administración de Propiedad Horizontal
> **Fase:** I — Autenticación, Invitación, Login y Dashboard base
> **Estado:** Especificación operativa canónica V1 · gaps ratificados
> **Reemplaza a:** `arquitectura_saas_engineering.md` (documento descriptivo, no ejecutable)

---

# 0. Cómo usar este documento

Este documento **no es documentación narrativa**: es el contrato de ejecución que gobierna
al agente que construye la Fase I.

```text
Documento descriptivo  → explica cómo es el sistema
Este documento         → define qué construir, en qué orden, con qué criterio de "terminado"
```

Todo lo marcado como **[AD-nn]** o listado en §15 es **decisión ratificada**: vinculante,
no se renegocia ni se reinterpreta.
Cualquier ambigüedad **no** cubierta aquí bloquea su componente hasta decisión humana (§15.3).

---

# 1. Misión y Alcance

## 1.1 Misión del Agente

```text
leer → analizar → planear → implementar → probar → verificar → documentar → versionar → avanzar
```

Una tarea **no** está terminada porque compile.
Está terminada cuando cumple su Definition of Done (§12.4) y sus criterios de aceptación.

## 1.2 Dentro de alcance (Fase I)

| #   | Capacidad                                            | Entregable observable                           |
| --- | ---------------------------------------------------- | ----------------------------------------------- |
| F1  | Registro público (email + password)                  | Cuenta creada, `profile` creado por trigger     |
| F2  | Login / logout / refresh de sesión                   | Sesión persistida, rutas protegidas             |
| F3  | Recuperación y cambio de contraseña                  | Flujo completo con email                        |
| F4  | Creación de copropiedad (tenant)                     | Tenant + membership `agent` del creador         |
| F5  | Invitación por email con rol                         | Token único, single-use, 48 h                   |
| F6  | Aceptación de invitación (usuario nuevo y existente) | Membership creado atómicamente                  |
| F7  | Cambio de copropiedad activa                         | Contexto conmutado sin re-login                 |
| F8  | RBAC de tenant + rol de plataforma                   | Permiso denegado en UI **y** en BD              |
| F9  | Dashboard base con métricas de tenant                | Vista funcional aislada por tenant              |
| F10 | Auditoría de eventos de seguridad                    | Registro inmutable, retención 24 meses          |
| F11 | Consola de plataforma (solo metadatos)               | Listado de copropiedades sin acceso a sus datos |

## 1.3 Fuera de alcance (NO implementar en Fase I)

```text
unidades / apartamentos / torres        coeficientes de copropiedad
cuotas de administración · cartera      facturación · pasarelas de pago
asambleas · votaciones · actas          reservas de zonas comunes
PQRS · correspondencia                  reportes contables
app móvil
```

Si una tarea parece requerir algo de esta lista → **STOP** → registrar gap (§15.3).

---

# 2. Fuentes de Verdad y Precedencia

```text
1. Decisiones ratificadas (§15.1)
2. Este documento (contrato operativo)
3. Decisiones arquitectónicas cerradas (§4.2)
4. Código existente en el repositorio
5. Tests existentes
6. Inferencias del agente
```

Ante contradicción, **prevalece la fuente superior**.
El agente **nunca** inventa una regla para resolver una contradicción: la escala (§15.3).

---

# 3. Reglas de Gobierno del Agente

## 3.1 Regla de No Invención

El agente **no puede crear sin aprobación**:

```text
tablas            columnas          índices con impacto semántico
roles             permisos          transiciones de estado
endpoints         RPC               Edge Functions
políticas RLS     claims de JWT     proveedores externos
reglas de negocio del dominio PH
```

Necesita alguno y no está definido → **STOP** → gap (§15.3).

## 3.2 Regla de Propiedad Única

Cada responsabilidad tiene **un solo** propietario técnico.

```text
¿Existe ya un componente responsable?
   ├── Sí → extenderlo
   └── No → ¿es realmente una responsabilidad nueva?
            ├── Sí → crearlo y declararlo propietario
            └── No → reubicar en el propietario correcto
```

## 3.3 Regla Anti-Redundancia

Reutilizar: `types`, `schemas de validación`, `composables`, `policies`, `helpers SQL`, `componentes UI`.

```text
Si la regla ya existe → referenciar
Nunca → duplicar para evitar una dependencia
```

**Fuente única de verdad de tipos:** los tipos de BD se **generan**, no se escriben a mano
(`supabase gen types typescript`). Escribir a mano un tipo de tabla es una violación.

## 3.4 Regla de Alcance Cerrado

Implementar únicamente el alcance aprobado de la tarea.
Prohibido introducir refactors no relacionados dentro de una tarea funcional.

## 3.5 Regla de Doble Barrera

Toda regla de autorización se implementa **dos veces, en dos capas independientes**:

```text
Capa UI/BFF  → experiencia de usuario (ocultar, deshabilitar, redirigir)
Capa BD/RLS  → seguridad real (denegar la fila)
```

Una regla implementada solo en el frontend **no está implementada**.

---

# 4. Stack y Decisiones Arquitectónicas

## 4.1 Stack

| Capa               | Tecnología                                      | Rol                                                                                                                                  |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend           | Nuxt 3 (Vue 3, Composition API)                 | **SSR** (runtime Node) + rutas                                                                                                       |
| UI                 | Nuxt UI v4 + TailwindCSS                        | Sistema de componentes accesible                                                                                                     |
| Estado             | Pinia                                           | Estado global de sesión/tenant                                                                                                       |
| Tipos              | TypeScript `strict`                             | Contratos en todo el stack                                                                                                           |
| Build / test       | **Vite** (vía Nuxt) + **Vitest**                | Bundler y dev server los aporta Nuxt; Vitest corre sobre el mismo pipeline. **No se usa Vite standalone como bundler de aplicación** |
| Monorepo           | pnpm workspaces                                 | `01 §6`                                                                                                                              |
| Backend            | Supabase (PostgreSQL 15+), región **sa-east-1** | Datos + Auth + RLS                                                                                                                   |
| Serverless         | Supabase Edge Functions (Deno)                  | Operaciones privilegiadas                                                                                                            |
| Email              | Brevo (API transaccional)                       | Invitaciones y recuperación                                                                                                          |
| Cache / Rate limit | Upstash Redis                                   | Throttling de invitaciones y auth                                                                                                    |
| Hosting frontend   | Hostinger **VPS/Cloud con Node**                | Despliegue Nitro (`node-server`)                                                                                                     |

## 4.2 Decisiones cerradas

| ID        | Decisión                                                                                                                        | Justificación                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **AD-01** | Multi-tenancy por **fila con RLS** (schema compartido) — no schema-per-tenant                                                   | Escala a miles de copropiedades sin explosión de migraciones                               |
| **AD-02** | La copropiedad activa se resuelve en **BD** vía `profiles.active_tenant_id`, no vía claim de JWT                                | Evita re-emitir token en cada switch; una sola fuente de verdad                            |
| **AD-03** | Las políticas RLS consultan membresías mediante funciones **`SECURITY DEFINER` + `STABLE` + `SET search_path`**                 | Evita recursión infinita de políticas, re-evaluación por fila y escalada por `search_path` |
| **AD-04** | Las invitaciones almacenan **hash** del token, nunca el token en claro                                                          | El token en claro solo existe en el email                                                  |
| **AD-05** | Toda operación que cruza el límite de tenant o usa `service_role` vive en **Edge Function**, nunca en el cliente                | La `service_role key` jamás se expone al navegador                                         |
| **AD-06** | `TypeScript strict` + tipos de BD **generados**                                                                                 | Elimina drift entre esquema y código                                                       |
| **AD-07** | Email transaccional vía **Brevo**                                                                                               | Corrige la inconsistencia del doc previo (mencionaba Resend en `.env`)                     |
| **AD-08** | Deny-by-default: cada tabla nace con `ENABLE` + `FORCE ROW LEVEL SECURITY` y sin políticas                                      | Una tabla sin política no filtra nada por accidente                                        |
| **AD-09** | **Dos planos de autorización separados**: rol de tenant (`memberships.role`) y rol de plataforma (`profiles.is_platform_admin`) | Un superusuario de plataforma no cabe en una tabla por tenant (§7)                         |
| **AD-10** | Nitro preset **`node-server`**, SSR activo                                                                                      | Confirmado runtime Node en Hostinger                                                       |
| **AD-11** | Aceptar una invitación **marca el email como verificado**; no hay paso de verificación previo en esa ruta                       | Recibir el token en el buzón ya prueba control del email                                   |

## 4.3 Arquitectura de capas

```text
┌──────────────────────────────────────────────────────────────┐
│  NAVEGADOR — Nuxt 3 (SSR/CSR)                                │
│  pages · components · stores(Pinia) · composables            │
│  middleware: auth → tenant → rbac        [barrera de UX]     │
└───────────────┬──────────────────────────────────┬───────────┘
                │ supabase-js (anon key + JWT)     │ $fetch
                │                                  ▼
                │                      ┌───────────────────────┐
                │                      │ NITRO server routes   │
                │                      │ (BFF: proxy, webhooks)│
                │                      └───────────┬───────────┘
                ▼                                  ▼
┌──────────────────────────────────────────────────────────────┐
│  SUPABASE (sa-east-1)                                         │
│  ┌────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  GoTrue    │  │  Edge Functions  │  │  PostgREST       │  │
│  │  (Auth)    │  │  (service_role)  │  │  (anon+JWT)      │  │
│  └─────┬──────┘  └────────┬─────────┘  └────────┬─────────┘  │
│        └──────────────────┴─────────────────────┘            │
│                           ▼                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  PostgreSQL · RLS = barrera de seguridad real          │  │
│  │  triggers · funciones SECURITY DEFINER · audit_log     │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
        │                                    │
        ▼                                    ▼
   Brevo (email)                     Upstash (rate limit)
```

**Invariante de capas:** el navegador nunca habla con `service_role`.
Solo `anon key` + JWT del usuario, o una Edge Function que valida antes de elevar.

---

# 5. Modelo de Datos Canónico

Esquema `public`. Todas las tablas: `id uuid PK default gen_random_uuid()`,
`created_at timestamptz not null default now()`, `updated_at timestamptz` (trigger).

## 5.1 Entidades

```text
auth.users ──1:1──> profiles ──N:M(memberships)──> tenants
                        │                             │
                        └──────< invitations >────────┘
                                     │
                                 audit_log
```

## 5.2 Enums

```sql
CREATE TYPE tenant_role_t   AS ENUM ('agent', 'auditor');
CREATE TYPE user_status_t   AS ENUM ('active', 'suspended');
CREATE TYPE tenant_status_t AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE member_status_t AS ENUM ('active', 'revoked');
CREATE TYPE invite_status_t AS ENUM ('pending', 'accepted', 'revoked', 'expired');
```

> `admin` **no** aparece en `tenant_role_t`: es rol de plataforma, no de copropiedad (AD-09).

## 5.3 Tablas

### `profiles`

| Columna             | Tipo                               | Reglas                                     |
| ------------------- | ---------------------------------- | ------------------------------------------ |
| `id`                | `uuid` PK                          | = `auth.users.id`, `ON DELETE CASCADE`     |
| `email`             | `citext` NOT NULL                  | espejo de `auth.users.email`               |
| `full_name`         | `text`                             |                                            |
| `avatar_url`        | `text`                             |                                            |
| `phone`             | `text`                             |                                            |
| `active_tenant_id`  | `uuid` FK → `tenants(id)`          | `ON DELETE SET NULL`; **AD-02**            |
| `is_platform_admin` | `boolean` NOT NULL default `false` | **AD-09**; solo modificable fuera de banda |
| `status`            | `user_status_t`                    | default `active`                           |

Creado por trigger `on_auth_user_created` (§6.4). El usuario **no** puede insertar su propio
profile ni modificar `is_platform_admin` (SEC-06).

### `tenants`

| Columna      | Tipo                            | Reglas                                     |
| ------------ | ------------------------------- | ------------------------------------------ |
| `name`       | `text` NOT NULL                 | nombre de la copropiedad                   |
| `slug`       | `citext` NOT NULL UNIQUE        | `^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$`      |
| `status`     | `tenant_status_t`               | default `active`                           |
| `settings`   | `jsonb` NOT NULL default `'{}'` | configuración libre, sin reglas de negocio |
| `created_by` | `uuid` FK → `profiles(id)`      |                                            |

### `memberships`

| Columna      | Tipo                                         | Reglas           |
| ------------ | -------------------------------------------- | ---------------- |
| `user_id`    | `uuid` FK → `profiles(id)` ON DELETE CASCADE |                  |
| `tenant_id`  | `uuid` FK → `tenants(id)` ON DELETE CASCADE  |                  |
| `role`       | `tenant_role_t` NOT NULL                     | §7.2             |
| `status`     | `member_status_t`                            | default `active` |
| `invited_by` | `uuid` FK → `profiles(id)`                   |                  |

```sql
UNIQUE (user_id, tenant_id)
-- Toda copropiedad conserva ≥1 `agent` activo: enforce por trigger (SEC-07)
```

Índices: `(tenant_id, status)`, `(user_id, status)`.

### `invitations`

| Columna       | Tipo                                        | Reglas                            |
| ------------- | ------------------------------------------- | --------------------------------- |
| `tenant_id`   | `uuid` FK → `tenants(id)` ON DELETE CASCADE |                                   |
| `email`       | `citext` NOT NULL                           | destinatario                      |
| `role`        | `tenant_role_t` NOT NULL                    | rol a otorgar                     |
| `token_hash`  | `text` NOT NULL UNIQUE                      | `sha256(token)`; **AD-04**        |
| `status`      | `invite_status_t`                           | default `pending`                 |
| `expires_at`  | `timestamptz` NOT NULL                      | **`now() + interval '48 hours'`** |
| `accepted_at` | `timestamptz`                               |                                   |
| `accepted_by` | `uuid` FK → `profiles(id)`                  |                                   |
| `invited_by`  | `uuid` FK → `profiles(id)` NOT NULL         |                                   |

```sql
-- Una sola invitación pendiente por (copropiedad, email)
CREATE UNIQUE INDEX ON invitations (tenant_id, email) WHERE status = 'pending';
```

### `audit_log` — append-only

| Columna       | Tipo                            | Reglas                                            |
| ------------- | ------------------------------- | ------------------------------------------------- |
| `tenant_id`   | `uuid`                          | nullable (eventos de plataforma)                  |
| `actor_id`    | `uuid`                          | nullable (`system`)                               |
| `action`      | `text` NOT NULL                 | §11.1                                             |
| `entity_type` | `text`                          |                                                   |
| `entity_id`   | `uuid`                          |                                                   |
| `metadata`    | `jsonb` NOT NULL default `'{}'` | **prohibido**: passwords, tokens, PII innecesaria |
| `ip`          | `inet`                          |                                                   |
| `user_agent`  | `text`                          |                                                   |

Sin `UPDATE` ni `DELETE` para ningún rol.
**Retención 24 meses** (§11.3): purga programada, único proceso autorizado a borrar.

### `platform_tenant_overview` — vista, solo metadatos

Expone a la consola de plataforma: `id`, `name`, `slug`, `status`, `created_at`,
`member_count`, `last_activity_at`.
**No expone ninguna columna de datos operativos de la copropiedad** (AD-09, SEC-10).

## 5.4 Convenciones obligatorias

```text
nombres de tabla   → plural, snake_case
enums              → tipo PG nativo, sufijo _t
timestamps         → timestamptz, siempre UTC
migraciones        → supabase/migrations, inmutables una vez aplicadas
cada tabla nueva   → RLS ENABLE + FORCE en la MISMA migración que la crea
```

---

# 6. Seguridad y RLS

## 6.1 Funciones helper (rompen la recursión de políticas — AD-03)

```sql
-- Copropiedad activa del usuario autenticado
CREATE FUNCTION public.current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT active_tenant_id FROM profiles WHERE id = auth.uid()
$$;

-- ¿Pertenece a esta copropiedad, con membresía activa?
CREATE FUNCTION public.is_member(p_tenant uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM memberships
      WHERE user_id = auth.uid() AND tenant_id = p_tenant AND status = 'active'
    )
$$;

-- ¿Tiene alguno de estos roles de tenant?
CREATE FUNCTION public.has_role(p_tenant uuid, p_roles tenant_role_t[]) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM memberships
      WHERE user_id = auth.uid() AND tenant_id = p_tenant
        AND status = 'active' AND role = ANY(p_roles)
    )
$$;

-- Rol de plataforma (AD-09) — plano de autorización separado
CREATE FUNCTION public.is_platform_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(
      (SELECT is_platform_admin FROM profiles WHERE id = auth.uid()), false)
$$;
```

> **Nota crítica de implementación:** sin `SECURITY DEFINER`, una política sobre `memberships`
> que consulta `memberships` provoca recursión infinita (`42P17`). Sin `STABLE`, la función
> se re-evalúa por fila y degrada el plan. Sin `SET search_path`, `SECURITY DEFINER` es un
> vector de escalada de privilegios. Las tres cláusulas son obligatorias.

## 6.2 Matriz de políticas

| Tabla                      | SELECT                                    | INSERT                       | UPDATE                                            | DELETE                             |
| -------------------------- | ----------------------------------------- | ---------------------------- | ------------------------------------------------- | ---------------------------------- |
| `profiles`                 | propio, o miembro de la misma copropiedad | ninguno (solo trigger)       | propio, excluyendo `is_platform_admin` y `status` | ninguno                            |
| `tenants`                  | `is_member(id)`                           | ninguno (solo Edge Function) | `has_role(id, {agent})`                           | ninguno                            |
| `memberships`              | `is_member(tenant_id)`                    | ninguno (solo Edge Function) | `has_role(tenant_id, {agent})`                    | ninguno (soft-delete vía `status`) |
| `invitations`              | `has_role(tenant_id, {agent})`            | ninguno (solo Edge Function) | ninguno                                           | ninguno                            |
| `audit_log`                | `has_role(tenant_id, {agent, auditor})`   | ninguno (solo trigger/EF)    | ninguno                                           | ninguno                            |
| `platform_tenant_overview` | `is_platform_admin()`                     | —                            | —                                                 | —                                  |

**El rol de plataforma NO aparece en ninguna política de tabla de datos de tenant.**
Un `is_platform_admin` sin membresía obtiene **0 filas** de `tenants`, `memberships`,
`invitations` y `audit_log` (SEC-10). Su único acceso es la vista de metadatos.

`profiles.active_tenant_id` solo puede cambiar a una copropiedad donde exista membresía
activa: validar en trigger `BEFORE UPDATE`, no confiar en el `WITH CHECK`.

## 6.3 Invariantes de seguridad — verificables

```text
SEC-01  Ninguna tabla de `public` sin RLS ENABLE + FORCE.
SEC-02  `service_role key` ausente del bundle del cliente y de `runtimeConfig.public`.
SEC-03  Un usuario de la copropiedad A obtiene 0 filas de cualquier tabla de la B.
SEC-04  Un usuario `anon` obtiene 0 filas de toda tabla de `public`.
SEC-05  Ningún token de invitación en claro persiste en BD ni en logs.
SEC-06  Un usuario no puede auto-asignarse rol ni activar `is_platform_admin`.
SEC-07  El último `agent` activo de una copropiedad no puede ser revocado ni degradado.
SEC-08  Toda función SECURITY DEFINER declara `SET search_path`.
SEC-09  Rate limiting activo en: signup, login, password-reset, invite.
SEC-10  Un `is_platform_admin` sin membresía obtiene 0 filas de datos de tenant.
```

Cada invariante tiene **un test automatizado que lo prueba por violación** (§12.2).

## 6.4 Triggers

| Trigger                    | Evento                               | Efecto                                                         |
| -------------------------- | ------------------------------------ | -------------------------------------------------------------- |
| `on_auth_user_created`     | `AFTER INSERT ON auth.users`         | crea `profiles`, registra `audit_log`                          |
| `on_membership_change`     | `AFTER INSERT/UPDATE ON memberships` | registra `audit_log`                                           |
| `guard_last_agent`         | `BEFORE UPDATE ON memberships`       | bloquea revocar/degradar el último `agent` (SEC-07)            |
| `guard_active_tenant`      | `BEFORE UPDATE ON profiles`          | valida membresía del nuevo `active_tenant_id`                  |
| `guard_privileged_columns` | `BEFORE UPDATE ON profiles`          | bloquea auto-cambio de `is_platform_admin` y `status` (SEC-06) |
| `set_updated_at`           | `BEFORE UPDATE` (todas)              | `updated_at = now()`                                           |

---

# 7. Autorización — Dos Planos Separados

## 7.1 Modelo (AD-09)

```text
PLANO PLATAFORMA                     PLANO COPROPIEDAD
profiles.is_platform_admin           memberships.role
        │                                    │
        ▼                                    ▼
  admin                            agent · auditor
  (opera el SaaS)                  (opera una copropiedad)

  Ve METADATOS de todas            Ve TODOS los datos de las
  las copropiedades.               copropiedades donde es miembro.
  NUNCA sus datos.                 Nada fuera de ellas.
```

Los dos planos son **independientes**: un `admin` de plataforma que además administre una
copropiedad necesita, adicionalmente, su propio `membership` con rol `agent`.

## 7.2 Roles de copropiedad

| Rol       | Significado en propiedad horizontal | Alcance                                                                                 |
| --------- | ----------------------------------- | --------------------------------------------------------------------------------------- |
| `agent`   | **Administrador de la copropiedad** | Rol máximo del tenant: usuarios, invitaciones, settings, datos, eliminar la copropiedad |
| `auditor` | Revisor fiscal / contador           | Solo lectura, incluida auditoría                                                        |

El creador de una copropiedad recibe `agent` (§9.1).

## 7.3 Matriz de permisos de copropiedad

| Permiso                                       | agent | auditor |
| --------------------------------------------- | :---: | :-----: |
| `dashboard:view`                              |   ✓   |    ✓    |
| `users:read`                                  |   ✓   |    ✓    |
| `users:manage`                                |   ✓   |    ✗    |
| `users:invite`                                |   ✓   |    ✗    |
| `data:create` / `data:update` / `data:delete` |   ✓   |    ✗    |
| `data:read`                                   |   ✓   |    ✓    |
| `audit:view`                                  |   ✓   |    ✓    |
| `metrics:view`                                |   ✓   |    ✓    |
| `settings:manage`                             |   ✓   |    ✗    |
| `tenant:delete`                               |   ✓   |    ✗    |

**Regla de no escalada:** solo `agent` otorga roles, y nadie puede modificar su propia
membresía (`SELF_MODIFY`).

## 7.4 Permisos de plataforma

| Permiso                                | admin |
| -------------------------------------- | :---: |
| `platform:tenants:read` (metadatos)    |   ✓   |
| `platform:tenants:suspend`             |   ✓   |
| `platform:metrics:view`                |   ✓   |
| _cualquier permiso de datos de tenant_ |   ✗   |

## 7.5 Copropietarios — no son usuarios

El rol `guest` fue **eliminado** (AD-26 del `PLAN_MAESTRO_IMPLEMENTACION.md`).

Propietarios y residentes son **datos del dominio**: registros con nombre, documento y
contacto, vinculados a una unidad. No tienen cuenta, ni login, ni política RLS propia.
Se leen a través del tenant.

Un eventual portal de copropietarios requeriría un **segundo tipo de principal**, distinto
de `memberships`, y se decide fuera de este alcance.

## 7.6 Contrato de permisos (fuente única)

`types/permissions.ts` es la **única** definición de la matriz en el frontend.
La misma matriz vive en SQL como `tenant_role_t` + políticas. Ambas se validan cruzadamente
con un test que falla si divergen (§12.2, `T-MATRIX`).

```ts
export type TenantRole  = 'agent' | 'auditor'
export type Permission  = /* ...unión cerrada de literales... */
export type PlatformPermission = /* ... */

export const ROLE_PERMISSIONS: Record<TenantRole, readonly Permission[]>

export function hasPermission(role: TenantRole, p: Permission): boolean
export function hasAnyPermission(role: TenantRole, p: Permission[]): boolean
export function hasAllPermissions(role: TenantRole, p: Permission[]): boolean
export function hasPlatformPermission(isPlatformAdmin: boolean, p: PlatformPermission): boolean
```

---

# 8. Contratos de Edge Functions

Toda Edge Function: valida JWT → valida payload (Zod) → verifica permiso → ejecuta →
registra en `audit_log` → responde. Nunca confía en el `tenant_id` que envía el cliente
sin verificar membresía.

**Formato de error uniforme:**

```json
{ "error": { "code": "INV_EXPIRED", "message": "…", "details": {} } }
```

| Function            | Entrada                             | Salida                           | Permiso                 | Errores                                                               |
| ------------------- | ----------------------------------- | -------------------------------- | ----------------------- | --------------------------------------------------------------------- |
| `create-tenant`     | `{ name, slug }`                    | `{ tenant, membership }`         | autenticado             | `SLUG_TAKEN`, `SLUG_INVALID`                                          |
| `invite-user`       | `{ tenant_id, email, role }`        | `{ invitation_id, expires_at }`  | `users:invite`          | `ALREADY_MEMBER`, `INVITE_PENDING`, `ROLE_ESCALATION`, `RATE_LIMITED` |
| `accept-invitation` | `{ token }`                         | `{ tenant_id, role }`            | autenticado             | `INV_NOT_FOUND`, `INV_EXPIRED`, `INV_USED`, `INV_EMAIL_MISMATCH`      |
| `revoke-invitation` | `{ invitation_id }`                 | `{ ok }`                         | `users:invite`          | `INV_NOT_FOUND`, `INV_NOT_PENDING`                                    |
| `update-membership` | `{ membership_id, role \| status }` | `{ membership }`                 | `users:manage`          | `LAST_AGENT`, `ROLE_ESCALATION`, `SELF_MODIFY`                        |
| `platform-tenants`  | `{ page, filter? }`                 | `{ tenants[] }` — solo metadatos | `platform:tenants:read` | `FORBIDDEN`                                                           |

**Atomicidad:** `accept-invitation` ejecuta en una sola transacción — marcar invitación
aceptada + crear membership + marcar email verificado (AD-11) + auditar.
Implementar como RPC de Postgres invocada por la Edge Function, no como llamadas sueltas.

**Idempotencia:** reintentar `accept-invitation` con un token ya consumido devuelve
`INV_USED`; nunca crea una segunda membresía.

---

# 9. Flujos Críticos

## 9.1 Registro público y creación de copropiedad

```text
/register → supabase.auth.signUp()
   └─ trigger on_auth_user_created → profiles + audit_log
      └─ email de confirmación (Brevo)
         └─ sin copropiedad → /onboarding/create-tenant
            └─ create-tenant → tenant + membership(role='agent') + active_tenant_id
```

## 9.2 Invitación (emisión)

```text
agent en /users → invite-user
   ├─ verifica permiso users:invite y no-escalada
   ├─ rate limit (Upstash) por actor y por copropiedad
   ├─ token = randomBytes(32) → guarda sha256(token)
   ├─ expires_at = now() + 48 h
   └─ Brevo → enlace {APP_URL}/invite?token=<token en claro>
```

## 9.3 Invitación (aceptación) — los dos caminos

```text
GET /invite?token=xxx
   └─ validar: existe · pending · no expirada (48 h)
        ├─ inválida → pantalla de error tipada (§8 códigos)
        └─ válida
             ├─ usuario NO autenticado
             │    ├─ email sin cuenta → registro → sesión → accept-invitation
             │    └─ email con cuenta → login       → sesión → accept-invitation
             └─ usuario autenticado
                  ├─ email de sesión ≠ email invitado → INV_EMAIL_MISMATCH
                  └─ coincide → accept-invitation
                        ├─ email marcado como verificado (AD-11)
                        └─ active_tenant_id = tenant → /dashboard
```

El token viaja en la URL: **prohibido** loguear la query string completa en servidor, proxy o CDN.

## 9.4 Cambio de copropiedad activa

```text
selector → RPC switch_tenant(tenant_id)
   ├─ trigger valida membresía activa
   ├─ UPDATE profiles.active_tenant_id
   └─ invalidar caché de Pinia + refetch del dashboard
```

Sin re-login y sin re-emitir JWT (AD-02).

---

# 10. Estructura Frontend (Nuxt 3)

```text
app/
├─ pages/
│  ├─ index.vue
│  ├─ (auth)/ login · register · forgot-password · reset-password · verify-email
│  ├─ invite.vue                    # entrada por token
│  ├─ onboarding/create-tenant.vue
│  ├─ (app)/
│  │  ├─ dashboard/index.vue
│  │  ├─ users/index.vue            # miembros + invitaciones
│  │  ├─ settings/index.vue
│  │  └─ audit/index.vue
│  └─ (platform)/
│     └─ tenants/index.vue          # consola de plataforma — solo metadatos
├─ layouts/          auth.vue · default.vue · platform.vue
├─ middleware/       auth.global.ts · tenant.ts · rbac.ts · platform.ts
├─ components/       auth/ · tenant/ · users/ · dashboard/ · platform/ · ui/
├─ composables/      useAuth · useTenant · usePermissions · useInvitations · useAudit
├─ stores/           auth.ts · tenant.ts
├─ types/            database.generated.ts (NO editar) · permissions.ts · api.ts
└─ server/           api/  (BFF: webhooks Brevo, proxies)
supabase/
├─ migrations/       NNN_*.sql   (inmutables)
├─ functions/        create-tenant · invite-user · accept-invitation · …
└─ seed.sql
tests/
├─ unit/  ├─ rls/  ├─ integration/  └─ e2e/
```

## 10.1 Cadena de middleware — orden obligatorio

```text
auth.global  → ¿sesión válida?            no → /login?redirect=…
tenant       → ¿active_tenant_id?         no → /onboarding/create-tenant
rbac         → ¿permiso de la ruta?       no → 403
platform     → ¿is_platform_admin?        no → 404   (solo rutas (platform)/)
```

Las rutas de `(platform)/` **no** pasan por `tenant`: el admin de plataforma no tiene
copropiedad activa. Devuelven `404`, no `403`, para no revelar la existencia de la consola.

Cada página protegida declara su permiso en `definePageMeta({ permission: '…' })`.

## 10.2 Stores

| Store    | Estado                                                     | Prohibido                                        |
| -------- | ---------------------------------------------------------- | ------------------------------------------------ |
| `auth`   | `user`, `profile`, `session`, `isPlatformAdmin`, `loading` | guardar tokens en `localStorage` manualmente     |
| `tenant` | `activeTenant`, `memberships`, `role`, `permissions`       | derivar permisos fuera de `types/permissions.ts` |

Los permisos son **derivados** (`computed`) del rol de la membresía activa. Nunca se persisten.

---

# 11. Observabilidad y Auditoría

## 11.1 Eventos auditables (mínimo Fase I)

```text
auth.signup            auth.login              auth.login_failed
auth.logout            auth.password_reset     auth.email_verified
tenant.created         tenant.updated          tenant.settings_changed
membership.created     membership.role_changed membership.revoked
invitation.sent        invitation.accepted     invitation.revoked   invitation.expired
platform.tenant_viewed platform.tenant_suspended
security.rls_denied    security.rate_limited
```

## 11.2 Reglas de logging

```text
NUNCA loguear: password, JWT, refresh token, token de invitación, service_role key,
               query string de /invite
SIEMPRE incluir: correlation_id, tenant_id, actor_id
Logs estructurados (JSON), no texto libre
```

## 11.3 Residencia y retención

```text
Región de datos      → sa-east-1 (São Paulo)
Retención audit_log  → 24 meses
Purga                → job programado; único proceso autorizado a borrar de audit_log
Marco aplicable      → habeas data (Ley 1581 de 2012, Colombia)
```

---

# 12. Testing y Definition of Done

## 12.1 Pirámide

| Nivel       | Herramienta                                 | Cubre                                                       |
| ----------- | ------------------------------------------- | ----------------------------------------------------------- |
| Unit        | Vitest                                      | permisos, validadores, composables puros                    |
| **RLS**     | pgTAP o Vitest + clientes con JWT distintos | **SEC-01…SEC-10**                                           |
| Integration | Vitest + Supabase local                     | Edge Functions con payloads reales                          |
| E2E         | Playwright                                  | registro, login, invitación completa, switch de copropiedad |

## 12.2 Tests de seguridad obligatorios (no negociables)

Cada uno debe **fallar si la protección se retira**:

```text
T-SEC-01  Tabla sin RLS → el test enumera pg_tables y falla
T-SEC-03  Cliente de la copropiedad A hace SELECT sobre datos de B → 0 filas
T-SEC-04  Cliente anon hace SELECT sobre cada tabla → 0 filas
T-SEC-06  auditor intenta UPDATE de su membership.role → denegado
T-SEC-06b usuario intenta UPDATE de profiles.is_platform_admin → denegado
T-SEC-07  Revocar o degradar el único agent → error LAST_AGENT
T-SEC-10  is_platform_admin sin membresía hace SELECT sobre tenants/memberships/
          invitations/audit_log → 0 filas en las cuatro
T-MATRIX  ROLE_PERMISSIONS (TS) coincide con las políticas SQL → si divergen, falla
T-INV-01  Aceptar token expirado (>48 h) / usado / de otro email → error tipado,
          sin membership creado
```

## 12.3 Gates de calidad

```text
tsc --noEmit          → 0 errores
eslint                → 0 errores
cobertura             → ≥80% global · 100% en types/permissions.ts y Edge Functions
supabase db lint      → 0 warnings de seguridad
build                 → exitoso
```

## 12.4 Definition of Done

Una unidad de trabajo está terminada cuando **todo** lo siguiente es cierto:

```text
□ Cumple exactamente el alcance aprobado, sin extras
□ Regla de autorización implementada en UI **y** en RLS (§3.5)
□ Migración incluye ENABLE + FORCE RLS en la misma migración que crea la tabla
□ Tipos regenerados desde el esquema, no escritos a mano
□ Tests unit + RLS + integración escritos y en verde
□ Invariantes SEC-* afectados tienen test que prueba la violación
□ Eventos auditables emitidos
□ Sin secretos en el bundle cliente ni en logs
□ Gates §12.3 en verde
□ Documentado el contrato público (entrada, salida, errores)
□ Commit atómico con referencia a la tarea
```

---

# 13. Orden de Implementación

Dependencia estricta. No saltar una entrega para avanzar superficialmente.

```text
E0 · Fundación
     repo, Nuxt 3 (SSR, preset node-server), TS strict, lint,
     Supabase local, CI mínimo, generación de tipos
        ↓
E1 · Esquema y seguridad          ← la base de todo
     enums, tablas, RLS + FORCE, funciones helper, triggers, tests RLS
        ↓
E2 · Autenticación
     signup, login, logout, confirmación de email, reset password, middleware auth
        ↓
E3 · Tenancy
     create-tenant, membresías, switch de copropiedad activa, middleware tenant
        ↓
E4 · Autorización
     matriz TS, middleware rbac + platform, guards de UI, test de paridad TS↔SQL
        ↓
E5 · Invitaciones
     invite-user, accept-invitation, revoke, emails Brevo, rate limit Upstash
        ↓
E6 · Dashboard base · Auditoría · Consola de plataforma
     métricas por tenant, gestión de miembros, audit_log, vista de metadatos
        ↓
E7 · Hardening
     rate limiting completo, headers de seguridad, E2E, cobertura, observabilidad,
     purga de retención
```

**Puerta de salida de E1:** ningún trabajo de E2+ comienza hasta que los tests RLS
(SEC-03, SEC-04, SEC-10) estén en verde. La seguridad no se retrofitea.

---

# 14. Workflow Obligatorio por Unidad de Trabajo

```text
1  READ       documentos aplicables · código y tests relacionados
2  ANALYZE    qué existe · qué falta · qué cambia · qué NO debe cambiar
3  PLAN       archivos · migraciones · contratos · tests · impacto
4  IMPACT     API · BD · RLS · auth · frontend · tests · despliegue
              (demostrar cuáles sí y cuáles no)
5  IMPLEMENT  solo el alcance aprobado
6  TEST       unit → RLS → integración → E2E
7  VERIFY     Definition of Done §12.4, punto por punto
8  DOCUMENT   contrato público y decisiones tomadas
9  REPORT     formato §16
10 COMMIT     atómico, mensaje trazable
```

Prohibido empezar por el paso 5.

---

# 15. Decisiones Ratificadas y Protocolo de Gaps

## 15.1 Ratificadas — vinculantes

| ID     | Pregunta                                      | Decisión                                                                                                                                                                                               |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GAP-01 | Semántica de `agent` vs `admin`               | Se mantienen los 4 roles originales. **`agent` = administrador de la copropiedad** (gestiona usuarios, invita, settings). **`admin` = rol de plataforma**, por encima de los tenants. Sin rol `owner`. |
| GAP-02 | ¿Multi-copropiedad por usuario?               | **Sí**, con selector de cambio (§9.4)                                                                                                                                                                  |
| GAP-03 | ¿Cómo entra un usuario?                       | **Registro público abierto** + creación de copropiedad; invitación para unirse a una existente                                                                                                         |
| GAP-05 | Hosting                                       | **Hostinger con runtime Node** (VPS/Cloud) → SSR completo, preset `node-server`                                                                                                                        |
| GAP-06 | Vigencia del token de invitación              | **48 horas**, un solo uso                                                                                                                                                                              |
| GAP-07 | Residencia y retención                        | **sa-east-1 (São Paulo)**, `audit_log` retenido **24 meses**                                                                                                                                           |
| GAP-08 | ¿Verificar email antes de aceptar invitación? | **No**: el token recibido en el buzón prueba control del email (AD-11)                                                                                                                                 |
| GAP-09 | Alcance del `admin` de plataforma             | **Solo metadatos**, nunca datos de la copropiedad. `profiles.is_platform_admin` + políticas separadas (SEC-10)                                                                                         |

## 15.2 Defaults del agente — revertibles sin coste

| ID     | Punto                                                          | Default aplicado                                                                                   |
| ------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| GAP-04 | Límite de copropiedades por usuario / miembros por copropiedad | **Sin límite** en Fase I; se deja el punto de extensión en `create-tenant`                         |
| GAP-10 | ~~Permisos de `guest`~~                                        | **Anulado.** El rol se eliminó por AD-26 — los copropietarios son datos, no usuarios (§7.5)        |
| GAP-11 | Registro directo (no por invitación)                           | Mantiene la confirmación de email estándar de Supabase; GAP-08 aplica solo a la ruta de invitación |

## 15.3 Protocolo ante un gap nuevo

```text
STOP
→ registrar el gap (id, descripción, componente bloqueado)
→ explicar el impacto de cada alternativa
→ proponer una opción recomendada con justificación
→ solicitar decisión
→ NO implementar mientras tanto
```

---

# 16. Formato de Reporte del Agente

Al cerrar cada unidad de trabajo:

```markdown
## [E<n>·T<m>] <título>

**Alcance:** …
**Archivos:** creados / modificados / eliminados
**Migraciones:** …
**Contratos:** entradas · salidas · códigos de error
**Impacto:** API · BD · RLS · auth · frontend · tests · despliegue
**Tests:** unit N✓ · RLS N✓ · integración N✓ · E2E N✓ · cobertura X%
_*Invariantes SEC-* verificados:_* …
**Definition of Done:** □→☑ punto por punto
**Gaps encontrados:** ninguno | GAP-NN
**Siguiente:** …
```

---

# 17. Anexo — Variables de Entorno

```bash
# ── Supabase (región sa-east-1) ───────────────────────────
SUPABASE_URL=
SUPABASE_ANON_KEY=                 # público — puede ir al cliente
SUPABASE_SERVICE_ROLE_KEY=         # SECRETO — solo Edge Functions / servidor

# ── App ───────────────────────────────────────────────────
NUXT_PUBLIC_APP_URL=http://localhost:3000
NUXT_PUBLIC_APP_NAME="Aquila PH"

# ── Email transaccional (Brevo — AD-07) ───────────────────
BREVO_API_KEY=
BREVO_SENDER_EMAIL=
BREVO_SENDER_NAME=

# ── Rate limiting (Upstash) ───────────────────────────────
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

**Regla:** solo las variables con prefijo `NUXT_PUBLIC_` y `SUPABASE_ANON_KEY` pueden
alcanzar el navegador. Cualquier otra en `runtimeConfig.public` es un fallo de seguridad (SEC-02).

---

# 18. Resumen Ejecutivo para el Agente

```text
Construyes la Fase I de un SaaS multi-tenant de propiedad horizontal.

La seguridad vive en la base de datos, no en el frontend.
El frontend es experiencia de usuario; RLS es la barrera real.

Hay DOS planos de autorización que nunca se mezclan:
  · plataforma → admin, ve metadatos de todas las copropiedades, datos de ninguna
  · copropiedad → agent (administrador) · auditor

Orden: esquema+RLS → auth → tenancy → autorización → invitaciones → dashboard → hardening.
No avanzas a E2 sin los tests RLS en verde.

No inventas tablas, roles, permisos ni reglas del dominio PH.
Ante ambigüedad: STOP, registras el gap, propones, esperas decisión.

Terminado = Definition of Done completa, no "compila".
```
