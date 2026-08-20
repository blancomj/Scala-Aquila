/**
 * Contrato único de permisos — PROMPT_MAESTRO_FASE1.md §7.3, §7.4, §7.6.
 *
 * Esta es la ÚNICA definición de la matriz en el frontend. La misma matriz
 * vive en SQL como políticas RLS (`has_role()`, `is_platform_admin()`,
 * `supabase/migrations/20260813190300_rls_policies.sql`). Ambas se validan
 * cruzadamente con un test (T-MATRIX, §12.2) que falla si divergen — ver
 * `tests/rbac/t-matrix.test.ts`.
 *
 * `admin` (plataforma, `profiles.is_platform_admin`) es un plano de
 * autorización separado (AD-09) que nunca otorga permisos de datos de un
 * tenant (SEC-10) — no confundir con `administrador` (rol de tenant,
 * GAP-CAR-009, `20260822250000`/`20260822260000`), que sí es un valor de
 * `TenantRole`.
 */

export type TenantRole = 'auxiliar' | 'auditor' | 'administrador'

export type Permission =
  | 'dashboard:view'
  | 'users:read'
  | 'users:manage'
  | 'users:invite'
  | 'data:create'
  | 'data:update'
  | 'data:delete'
  | 'data:read'
  | 'audit:view'
  | 'metrics:view'
  | 'settings:manage'
  | 'tenant:delete'

export type PlatformPermission =
  'platform:tenants:read' | 'platform:tenants:suspend' | 'platform:metrics:view'

// §7.3 — matriz de permisos de copropiedad.
export const ROLE_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
  auxiliar: [
    'dashboard:view',
    'users:read',
    'users:manage',
    'users:invite',
    'data:create',
    'data:update',
    'data:delete',
    'data:read',
    'audit:view',
    'metrics:view',
    'settings:manage',
    'tenant:delete',
  ],
  auditor: ['dashboard:view', 'users:read', 'data:read', 'audit:view', 'metrics:view'],
  // administrador hereda todo lo de auxiliar vía has_role() (SQL, 20260822260000)
  // — administrador ⊇ auxiliar para cualquier chequeo escrito como 'auxiliar'. La
  // única capacidad EXTRA de administrador (aprobar acciones de cobranza de
  // alto impacto, CAR §9.4/§21.3) no está modelada como Permission todavía:
  // vive en un trigger de base de datos (guard_accion_cobranza_transicion),
  // no en una política RLS 1:1 que esta matriz pueda representar hoy.
  administrador: [
    'dashboard:view',
    'users:read',
    'users:manage',
    'users:invite',
    'data:create',
    'data:update',
    'data:delete',
    'data:read',
    'audit:view',
    'metrics:view',
    'settings:manage',
    'tenant:delete',
  ],
}

// §7.4 — permisos de plataforma. Solo `admin` (profiles.is_platform_admin);
// no hay matriz por rol porque plataforma no tiene roles, es un booleano.
export const PLATFORM_PERMISSIONS: readonly PlatformPermission[] = [
  'platform:tenants:read',
  'platform:tenants:suspend',
  'platform:metrics:view',
]

export function hasPermission(role: TenantRole, permiso: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permiso)
}

export function hasAnyPermission(role: TenantRole, permisos: Permission[]): boolean {
  return permisos.some((permiso) => hasPermission(role, permiso))
}

// §7.4: is_platform_admin es un booleano, no un rol — cualquier permiso de
// plataforma requiere is_platform_admin === true, sin distinción de niveles.
export function hasPlatformPermission(
  isPlatformAdmin: boolean,
  _permiso: PlatformPermission,
): boolean {
  return isPlatformAdmin
}
