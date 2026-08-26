/**
 * Rótulo humano de tenant_role_t. NavUsuarioMenu.vue tenía un mapa con la
 * clave vieja 'agent' (pre-20260830100000, cuando el enum todavía no
 * renombraba a 'auxiliar' ni existía 'administrador') — nunca hacía match
 * contra un rol real, el pill de rol quedaba en blanco. Único punto de
 * verdad ahora.
 */
import type { TenantRole } from '~/types/permissions'

export const ROL_LABEL: Record<TenantRole, string> = {
  auxiliar: 'Auxiliar',
  administrador: 'Administrador',
  auditor: 'Auditor',
}
