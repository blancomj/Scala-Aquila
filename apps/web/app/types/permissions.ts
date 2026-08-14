/**
 * Contrato único de permisos — PROMPT_MAESTRO_FASE1.md §7.3, §7.4, §7.6.
 *
 * Esta es la ÚNICA definición de la matriz en el frontend. La misma matriz
 * vive en SQL como políticas RLS (`has_role()`, `is_platform_admin()`,
 * `supabase/migrations/20260813190300_rls_policies.sql`). Ambas se validan
 * cruzadamente con un test (T-MATRIX, §12.2) que falla si divergen — ver
 * `tests/rbac/t-matrix.test.ts`.
 *
 * `admin` NO aparece en `TenantRole` (§6.1): es rol de plataforma
 * (`profiles.is_platform_admin`), un plano de autorización separado
 * (AD-09) que nunca otorga permisos de datos de un tenant (SEC-10).
 */

export type TenantRole = 'agent' | 'auditor'

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

export type PlatformPermission = 'platform:tenants:read' | 'platform:tenants:suspend' | 'platform:metrics:view'

// §7.3 — matriz de permisos de copropiedad.
export const ROLE_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
  agent: [
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
export function hasPlatformPermission(isPlatformAdmin: boolean, _permiso: PlatformPermission): boolean {
  return isPlatformAdmin
}
