/**
 * CO-1 (20260930160000/20260930170000) — marco contable y tributario de la copropiedad.
 * Ver Casos de uso/Tres Modulos/Contabilidad/CO_01_marco_contable_tenant.md §6.
 *
 * Requisito #7 (los dos enums nuevos tienen COMMENT ON TYPE) ya lo cubre, estáticamente,
 * tests/governance/enum-lista-tipos-coverage.test.ts — no se repite aquí.
 *
 * crearTenant() de tests/rls/helpers.ts inserta directo sobre `tenants` (bypassRLS), sin pasar
 * por create_tenant(): correcto para estos tests, que son sobre las columnas y el guard de
 * `tenants`, no sobre el alta completa (esa la cubre alta-parametrizacion-contable.test.ts).
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import {
  clienteAdmin,
  clienteComo,
  crearMembership,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  type TenantPrueba,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/contabilidad/marco-contable-tenant: faltan variables de Supabase en .env')
}

d('CO-1: marco contable y tributario del tenant', () => {
  const admin = clienteAdmin(env!)
  const tenantsCreados: string[] = []
  const usuariosCreados: UsuarioPrueba[] = []

  afterAll(async () => {
    for (const id of tenantsCreados) await eliminarTenant(admin, id)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  }, 60_000)

  async function tenantConMembresia(
    etiqueta: string,
    role: 'auxiliar' | 'auditor' | 'administrador',
  ): Promise<{ tenant: TenantPrueba; usuario: UsuarioPrueba }> {
    const tenant = await crearTenant(admin, etiqueta)
    tenantsCreados.push(tenant.id)
    const usuario = await crearUsuario(admin, etiqueta)
    usuariosCreados.push(usuario)
    await crearMembership(admin, tenant.id, usuario.id, role)
    return { tenant, usuario }
  }

  it('1. un tenant recién creado nace sin clasificar', async () => {
    const { tenant } = await tenantConMembresia('sin-clasificar', 'auxiliar')

    const { data: fila, error: errFila } = await admin
      .from('tenants')
      .select('marco_grupo, uso_economico')
      .eq('id', tenant.id)
      .single()
    if (errFila) throw errFila
    expect(fila.marco_grupo).toBeNull()
    expect(fila.uso_economico).toBeNull()

    const { data: marco, error: errMarco } = await admin
      .rpc('tenant_marco_contable', { p_tenant_id: tenant.id })
      .single()
    if (errMarco) throw errMarco
    expect(marco.clasificado).toBe(false)
  })

  it('2. clasificado grupo_3 exige exactamente tres estados financieros', async () => {
    const { tenant } = await tenantConMembresia('grupo3', 'auxiliar')
    const { error: errUpdate } = await admin
      .from('tenants')
      .update({ marco_grupo: 'grupo_3', uso_economico: 'residencial' })
      .eq('id', tenant.id)
    if (errUpdate) throw errUpdate

    const { data: marco, error } = await admin
      .rpc('tenant_marco_contable', { p_tenant_id: tenant.id })
      .single()
    if (error) throw error
    expect(marco.clasificado).toBe(true)
    expect(marco.estados_requeridos).toEqual([
      'estado_situacion_financiera',
      'estado_resultados',
      'notas',
    ])
  })

  it('3. clasificado grupo_2 exige exactamente cinco estados financieros', async () => {
    const { tenant } = await tenantConMembresia('grupo2', 'auxiliar')
    const { error: errUpdate } = await admin
      .from('tenants')
      .update({ marco_grupo: 'grupo_2', uso_economico: 'residencial' })
      .eq('id', tenant.id)
    if (errUpdate) throw errUpdate

    const { data: marco, error } = await admin
      .rpc('tenant_marco_contable', { p_tenant_id: tenant.id })
      .single()
    if (error) throw error
    expect(marco.estados_requeridos).toEqual([
      'estado_situacion_financiera',
      'estado_resultados',
      'notas',
      'estado_cambios_patrimonio',
      'estado_flujos_efectivo',
    ])
  })

  it('4. un auditor no puede escribir la clasificación; un auxiliar sí', async () => {
    const tenant = await crearTenant(admin, 'escritura-rol')
    tenantsCreados.push(tenant.id)

    const auditor = await crearUsuario(admin, 'auditor-marco')
    usuariosCreados.push(auditor)
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    const clienteAuditor = await clienteComo(env!, auditor)

    const { data: datosAuditor, error: errAuditor } = await clienteAuditor
      .from('tenants')
      .update({ marco_grupo: 'grupo_3' })
      .eq('id', tenant.id)
      .select('id')
    expect(errAuditor).toBeNull()
    expect(datosAuditor).toEqual([])

    const auxiliar = await crearUsuario(admin, 'auxiliar-marco')
    usuariosCreados.push(auxiliar)
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    const clienteAuxiliar = await clienteComo(env!, auxiliar)

    const { data: datosAuxiliar, error: errAuxiliar } = await clienteAuxiliar
      .from('tenants')
      .update({ marco_grupo: 'grupo_3', uso_economico: 'residencial' })
      .eq('id', tenant.id)
      .select('marco_grupo')
    if (errAuxiliar) throw errAuxiliar
    expect(datosAuxiliar).toHaveLength(1)
    expect(datosAuxiliar[0]!.marco_grupo).toBe('grupo_3')
  })

  it('5. un usuario del tenant A no lee ni escribe la clasificación del tenant B', async () => {
    const { tenant: tenantA } = await tenantConMembresia('aislamiento-a', 'auxiliar')
    const tenantB = await crearTenant(admin, 'aislamiento-b')
    tenantsCreados.push(tenantB.id)

    const usuarioA = await crearUsuario(admin, 'aislamiento-usuario-a')
    usuariosCreados.push(usuarioA)
    await crearMembership(admin, tenantA.id, usuarioA.id, 'auxiliar')
    const clienteA = await clienteComo(env!, usuarioA)

    const { data: lecturaB, error: errLecturaB } = await clienteA
      .from('tenants')
      .select('marco_grupo')
      .eq('id', tenantB.id)
    expect(errLecturaB).toBeNull()
    expect(lecturaB).toEqual([])

    const { data: escrituraB, error: errEscrituraB } = await clienteA
      .from('tenants')
      .update({ marco_grupo: 'grupo_3' })
      .eq('id', tenantB.id)
      .select('id')
    expect(errEscrituraB).toBeNull()
    expect(escrituraB).toEqual([])
  })

  it('6. explota_bienes_comunes=true instala la clase 6; false no la toca', async () => {
    const { tenant } = await tenantConMembresia('clase6', 'auxiliar')
    await admin.rpc('fn_instanciar_plan_contable', { p_tenant_id: tenant.id })

    const { count: antes } = await admin
      .from('contable_cuenta')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('clase', 6)
    expect(antes).toBe(0)

    const { error: errFalse } = await admin
      .from('tenants')
      .update({ explota_bienes_comunes: false })
      .eq('id', tenant.id)
    if (errFalse) throw errFalse
    const { count: siguesSinClase6 } = await admin
      .from('contable_cuenta')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('clase', 6)
    expect(siguesSinClase6).toBe(0)

    const { error: errTrue } = await admin
      .from('tenants')
      .update({ explota_bienes_comunes: true })
      .eq('id', tenant.id)
    if (errTrue) throw errTrue
    const { count: despues } = await admin
      .from('contable_cuenta')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('clase', 6)
    expect(despues! > 0).toBe(true)
  }, 20_000)
})
