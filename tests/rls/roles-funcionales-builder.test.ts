/**
 * PROMPT_PERMISOS_CAPA2.md §5 — pruebas exigidas por el corte del builder de
 * roles funcionales (§A3) y por la auditoría previa (§1.2/§1.3/§1.7).
 *
 * Mismo patrón que rol-administrador.test.ts: cada `it` crea su propio
 * tenant/usuario y limpia al final, sin `beforeAll`/`afterAll` compartido.
 */
import { describe, expect, it } from 'vitest'
import {
  clienteAdmin,
  clienteComo,
  crearMembership,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/roles-funcionales-builder: faltan credenciales Supabase en .env')
}

d('Roles funcionales — builder y regresión de cobertura (PROMPT_PERMISOS_CAPA2.md)', () => {
  const admin = clienteAdmin(env!)

  it('§1.2/§5.1 — recepcion SÍ ve movilidad hoy (EXS-5 ya lo resolvió, no es un fallo esperado)', async () => {
    const usuario = await crearUsuario(admin, 'recepcion-movilidad')
    const tenant = await crearTenant(admin, 'recepcion-movilidad', usuario.id)
    await crearMembership(admin, tenant.id, usuario.id, 'auxiliar')

    const { data: rolRecepcion, error: errorRol } = await admin
      .from('lista_tipos')
      .select('id')
      .eq('tipo', 'ROL_FUNCIONAL')
      .eq('codigo', 'recepcion')
      .is('tenant_id', null)
      .single()
    expect(errorRol).toBeNull()

    const { error: errorAsignar } = await admin
      .from('membership_roles_funcionales')
      .insert({
        membership_id: (
          await admin
            .from('memberships')
            .select('id')
            .eq('tenant_id', tenant.id)
            .eq('user_id', usuario.id)
            .single()
        ).data!.id,
        rol_funcional_id: rolRecepcion!.id,
      })
    expect(errorAsignar).toBeNull()

    const cliente = await clienteComo(env!, usuario)
    const { data: veMovilidad, error: errorVe } = await cliente.rpc('puede_ver_modulo', {
      p_tenant: tenant.id,
      p_modulo: 'movilidad',
    })
    expect(errorVe).toBeNull()
    expect(veMovilidad).toBe(true)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  }, 30_000)

  it('§5.4 — sin ningún rol funcional asignado, la membresía sigue viendo todos los módulos (compatibilidad)', async () => {
    const usuario = await crearUsuario(admin, 'sin-rol-funcional')
    const tenant = await crearTenant(admin, 'sin-rol-funcional', usuario.id)
    await crearMembership(admin, tenant.id, usuario.id, 'auxiliar')

    const cliente = await clienteComo(env!, usuario)
    for (const modulo of ['financiero', 'juridico', 'porteria', 'mantenimiento']) {
      const { data, error } = await cliente.rpc('puede_ver_modulo', {
        p_tenant: tenant.id,
        p_modulo: modulo,
      })
      expect(error).toBeNull()
      expect(data).toBe(true)
    }

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  }, 30_000)

  it('§5.3 — un rol de PLATAFORMA (tenant_id null) es inmutable desde cualquier tenant', async () => {
    const usuario = await crearUsuario(admin, 'plataforma-inmutable')
    const tenant = await crearTenant(admin, 'plataforma-inmutable', usuario.id)
    await crearMembership(admin, tenant.id, usuario.id, 'administrador')

    const { data: rolPlataforma, error: errorRol } = await admin
      .from('lista_tipos')
      .select('id, nombre')
      .eq('tipo', 'ROL_FUNCIONAL')
      .eq('codigo', 'contador')
      .is('tenant_id', null)
      .single()
    expect(errorRol).toBeNull()

    const cliente = await clienteComo(env!, usuario)

    // UPDATE contra RLS sin fila que satisfaga el USING: 0 filas, sin error
    // (mismo comportamiento documentado en otros tests de este proyecto).
    const { data: datosUpdate, error: errorUpdate } = await cliente
      .from('lista_tipos')
      .update({ nombre: 'Hackeado' })
      .eq('id', rolPlataforma!.id)
      .select('id')
    expect(errorUpdate).toBeNull()
    expect(datosUpdate).toEqual([])

    const { data: datosDelete, error: errorDelete } = await cliente
      .from('lista_tipos')
      .delete()
      .eq('id', rolPlataforma!.id)
      .select('id')
    expect(errorDelete).toBeNull()
    expect(datosDelete).toEqual([])

    // Intentar agregarle un módulo tampoco pasa: la policy de insert de
    // rol_funcional_modulo exige tenant_id is not null.
    const { error: errorModulo } = await cliente
      .from('rol_funcional_modulo')
      .insert({ lista_tipos_id: rolPlataforma!.id, modulo: 'marketplace' })
    expect(errorModulo).not.toBeNull()

    const { data: sigueIgual } = await admin
      .from('lista_tipos')
      .select('nombre')
      .eq('id', rolPlataforma!.id)
      .single()
    expect(sigueIgual?.nombre).toBe(rolPlataforma!.nombre)

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  }, 30_000)

  it('§5.2 — un administrador del tenant A no ve ni puede editar un rol funcional del tenant B', async () => {
    const usuarioA = await crearUsuario(admin, 'aislamiento-a')
    const usuarioB = await crearUsuario(admin, 'aislamiento-b')
    const tenantA = await crearTenant(admin, 'aislamiento-a', usuarioA.id)
    const tenantB = await crearTenant(admin, 'aislamiento-b', usuarioB.id)
    await crearMembership(admin, tenantA.id, usuarioA.id, 'administrador')
    await crearMembership(admin, tenantB.id, usuarioB.id, 'administrador')

    const { data: rolTenantB, error: errorCrear } = await admin
      .from('lista_tipos')
      .insert({ tipo: 'ROL_FUNCIONAL', tenant_id: tenantB.id, codigo: 'probador_b', nombre: 'Probador B' })
      .select('id')
      .single()
    expect(errorCrear).toBeNull()

    const clienteA = await clienteComo(env!, usuarioA)

    // No lo ve.
    const { data: visible } = await clienteA
      .from('lista_tipos')
      .select('id')
      .eq('id', rolTenantB!.id)
    expect(visible).toEqual([])

    // No lo puede editar (0 filas, sin error).
    const { data: datosUpdate, error: errorUpdate } = await clienteA
      .from('lista_tipos')
      .update({ nombre: 'Secuestrado' })
      .eq('id', rolTenantB!.id)
      .select('id')
    expect(errorUpdate).toBeNull()
    expect(datosUpdate).toEqual([])

    // No le puede agregar un módulo.
    const { error: errorModulo } = await clienteA
      .from('rol_funcional_modulo')
      .insert({ lista_tipos_id: rolTenantB!.id, modulo: 'financiero' })
    expect(errorModulo).not.toBeNull()

    const { data: sigueIgual } = await admin
      .from('lista_tipos')
      .select('nombre')
      .eq('id', rolTenantB!.id)
      .single()
    expect(sigueIgual?.nombre).toBe('Probador B')

    await eliminarTenant(admin, tenantA.id)
    await eliminarTenant(admin, tenantB.id)
    await eliminarUsuario(admin, usuarioA.id)
    await eliminarUsuario(admin, usuarioB.id)
  }, 30_000)

  it('§A3 — un administrador SÍ puede crear un rol funcional de su propio tenant y marcarle un módulo', async () => {
    const usuario = await crearUsuario(admin, 'builder-administrador')
    const tenant = await crearTenant(admin, 'builder-administrador', usuario.id)
    await crearMembership(admin, tenant.id, usuario.id, 'administrador')

    const cliente = await clienteComo(env!, usuario)

    const { data: rolCreado, error: errorCrear } = await cliente
      .from('lista_tipos')
      .insert({ tipo: 'ROL_FUNCIONAL', tenant_id: tenant.id, codigo: 'contador_pruebas', nombre: 'Contador de pruebas' })
      .select('id')
      .single()
    expect(errorCrear).toBeNull()

    const { error: errorModulo } = await cliente
      .from('rol_funcional_modulo')
      .insert({ lista_tipos_id: rolCreado!.id, modulo: 'financiero' })
    expect(errorModulo).toBeNull()

    const { data: verificacion } = await admin
      .from('rol_funcional_modulo')
      .select('modulo')
      .eq('lista_tipos_id', rolCreado!.id)
    expect(verificacion).toEqual([{ modulo: 'financiero' }])

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  }, 30_000)

  it('§A3 guarda 1 — un administrador puede eliminar un rol CON módulos marcados (regresión: FK sin cascade)', async () => {
    // Hallazgo real (verificado en navegador): rol_funcional_modulo.lista_tipos_id
    // no tenía ON DELETE CASCADE, así que borrar un rol con al menos un módulo
    // (el caso normal) fallaba con una violación de FK en vez de eliminarse.
    // Corregido en la misma migración (20260950000000) que habilita el DELETE.
    const usuario = await crearUsuario(admin, 'eliminar-con-modulos')
    const tenant = await crearTenant(admin, 'eliminar-con-modulos', usuario.id)
    await crearMembership(admin, tenant.id, usuario.id, 'administrador')

    const cliente = await clienteComo(env!, usuario)

    const { data: rolCreado, error: errorCrear } = await cliente
      .from('lista_tipos')
      .insert({ tipo: 'ROL_FUNCIONAL', tenant_id: tenant.id, codigo: 'para_borrar', nombre: 'Para borrar' })
      .select('id')
      .single()
    expect(errorCrear).toBeNull()

    const { error: errorModulo } = await cliente
      .from('rol_funcional_modulo')
      .insert({ lista_tipos_id: rolCreado!.id, modulo: 'financiero' })
    expect(errorModulo).toBeNull()

    const { data: datosDelete, error: errorDelete } = await cliente
      .from('lista_tipos')
      .delete()
      .eq('id', rolCreado!.id)
      .select('id')
    expect(errorDelete).toBeNull()
    expect(datosDelete).toEqual([{ id: rolCreado!.id }])

    const { data: modulosResiduales } = await admin
      .from('rol_funcional_modulo')
      .select('modulo')
      .eq('lista_tipos_id', rolCreado!.id)
    expect(modulosResiduales).toEqual([])

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  }, 30_000)

  it('§A3 — un auxiliar (no administrador) NO puede crear un rol funcional', async () => {
    const usuario = await crearUsuario(admin, 'builder-auxiliar')
    const tenant = await crearTenant(admin, 'builder-auxiliar', usuario.id)
    await crearMembership(admin, tenant.id, usuario.id, 'auxiliar')

    const cliente = await clienteComo(env!, usuario)

    const { data, error } = await cliente
      .from('lista_tipos')
      .insert({ tipo: 'ROL_FUNCIONAL', tenant_id: tenant.id, codigo: 'intento_auxiliar', nombre: 'Intento' })
      .select('id')
    expect(error).not.toBeNull()
    expect(data).toBeNull()

    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  }, 30_000)
})
