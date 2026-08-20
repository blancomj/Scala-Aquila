/**
 * Cobertura directa de types/permissions.ts — E7 §12.3 exige 100% aquí.
 * t-matrix.test.ts (tests/rbac/) ya prueba la paridad TS↔RLS para un
 * subconjunto de permisos; este archivo cubre las funciones exportadas
 * en sí mismas, sin depender de Supabase.
 */
import { describe, expect, it } from 'vitest'
import {
  hasAnyPermission,
  hasPermission,
  hasPlatformPermission,
  PLATFORM_PERMISSIONS,
  ROLE_PERMISSIONS,
} from './permissions'

describe('hasPermission', () => {
  it('auxiliar tiene tenant:delete, auditor no', () => {
    expect(hasPermission('auxiliar', 'tenant:delete')).toBe(true)
    expect(hasPermission('auditor', 'tenant:delete')).toBe(false)
  })

  it('ambos roles tienen dashboard:view', () => {
    expect(hasPermission('auxiliar', 'dashboard:view')).toBe(true)
    expect(hasPermission('auditor', 'dashboard:view')).toBe(true)
  })
})

describe('hasAnyPermission', () => {
  it('true si al menos uno de la lista está en el rol', () => {
    expect(hasAnyPermission('auditor', ['tenant:delete', 'audit:view'])).toBe(true)
  })

  it('false si ninguno de la lista está en el rol', () => {
    expect(hasAnyPermission('auditor', ['tenant:delete', 'users:manage'])).toBe(false)
  })

  it('false con lista vacía', () => {
    expect(hasAnyPermission('auxiliar', [])).toBe(false)
  })
})

describe('hasPlatformPermission', () => {
  it('true solo si is_platform_admin es true, sin importar el permiso', () => {
    expect(hasPlatformPermission(true, 'platform:tenants:suspend')).toBe(true)
    expect(hasPlatformPermission(false, 'platform:tenants:suspend')).toBe(false)
  })
})

describe('matrices exportadas', () => {
  it('todo permiso de ROLE_PERMISSIONS.auxiliar es reconocido por hasPermission', () => {
    for (const permiso of ROLE_PERMISSIONS.auxiliar) {
      expect(hasPermission('auxiliar', permiso)).toBe(true)
    }
  })

  it('PLATFORM_PERMISSIONS no está vacío', () => {
    expect(PLATFORM_PERMISSIONS.length).toBeGreaterThan(0)
  })
})
