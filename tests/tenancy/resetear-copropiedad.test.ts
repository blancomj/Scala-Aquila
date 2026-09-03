/**
 * D-39 — Zona de peligro: fn_resetear_copropiedad() borra los datos
 * operativos de una copropiedad y preserva configuración + usuarios.
 *
 * Usa create_tenant() (RPC real), no el INSERT directo de
 * tests/rls/helpers.ts::crearTenant — igual que
 * alta-parametrizacion-contable.test.ts, es la única forma de tener
 * conceptos/contable_cuenta/presupuesto_cuenta sembrados de verdad para
 * comprobar que el reset los preserva en vez de solo no tocar tablas
 * vacías.
 */
import { afterAll, describe, expect, it } from 'vitest'
import 'dotenv/config'
import {
  clienteAdmin,
  clienteComo,
  crearMembership,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  RUN_ID,
  type Cliente,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/tenancy/resetear-copropiedad: faltan variables de Supabase en .env')
}

interface RespuestaReset {
  borrados: Record<string, number>
}

d('fn_resetear_copropiedad (D-39)', () => {
  const admin = clienteAdmin(env!)
  const usuariosCreados: UsuarioPrueba[] = []
  let tenantId: string
  let cAdm: Cliente
  let cAux: Cliente
  let auxiliar: UsuarioPrueba

  afterAll(async () => {
    if (tenantId) await eliminarTenant(admin, tenantId)
    for (const usuario of usuariosCreados) await eliminarUsuario(admin, usuario.id)
  })

  it('setup: copropiedad real vía create_tenant(), con un auxiliar y un inmueble', async () => {
    const creador = await crearUsuario(admin, 'reset-adm')
    auxiliar = await crearUsuario(admin, 'reset-aux')
    usuariosCreados.push(creador, auxiliar)
    cAdm = await clienteComo(env!, creador)

    // create_tenant() devuelve una fila compuesta (isSetofReturn: false), no
    // un arreglo — sin .single(), que espera envolver/desenvolver un array.
    const { data: tenant, error: errTenant } = await cAdm.rpc('create_tenant', {
      p_name: 'Reset de prueba',
      p_slug: `t-${RUN_ID}-reset`,
    })
    if (errTenant) throw new Error(`create_tenant falló: ${errTenant.message}`)
    tenantId = tenant.id

    await crearMembership(admin, tenantId, auxiliar.id, 'auxiliar')
    cAux = await clienteComo(env!, auxiliar)

    const tipoId = await admin
      .from('lista_tipos')
      .select('id')
      .eq('tipo', 'TIPO_INMUEBLE')
      .eq('codigo', 'apartamento')
      .is('tenant_id', null)
      .single<{ id: number }>()
      .then(({ data, error }) => {
        if (error) throw new Error(`fixture tipo apartamento: ${error.message}`)
        return data.id
      })

    const { error: errInm } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenantId, codigo: `RST-${RUN_ID}`, tipo_id: tipoId })
    if (errInm) throw new Error(`fixture inmueble: ${errInm.message}`)
  }, 30_000)

  it('un auxiliar no puede resetear la copropiedad', async () => {
    const respuesta = await cAux.functions.invoke('resetear-copropiedad', {
      body: { tenant_id: tenantId },
    })
    expect(respuesta.error).toBeTruthy()
  })

  it('un administrador resetea: borra lo operativo, preserva configuración y usuarios', async () => {
    // Sembrado real por create_tenant() — debe sobrevivir al reset.
    const { count: conceptosAntes } = await admin
      .from('conceptos')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
    const { count: cuentasAntes } = await admin
      .from('contable_cuenta')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
    expect(conceptosAntes ?? 0).toBeGreaterThan(0)
    expect(cuentasAntes ?? 0).toBeGreaterThan(0)

    const respuesta = await cAdm.functions.invoke<RespuestaReset>('resetear-copropiedad', {
      body: { tenant_id: tenantId },
    })
    if (respuesta.error) throw respuesta.error as Error
    const datosReset = respuesta.data as RespuestaReset

    // Operativo: borrado.
    expect(datosReset.borrados.inmuebles).toBe(1)
    const { count: inmueblesDespues } = await admin
      .from('inmuebles')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
    expect(inmueblesDespues ?? 0).toBe(0)

    // Configuración: preservada, misma cantidad que antes de crear el inmueble.
    const { count: conceptosDespues } = await admin
      .from('conceptos')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
    const { count: cuentasDespues } = await admin
      .from('contable_cuenta')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
    expect(conceptosDespues).toBe(conceptosAntes)
    expect(cuentasDespues).toBe(cuentasAntes)

    // Usuarios: memberships intactas (administrador + auxiliar).
    const { count: membershipsDespues } = await admin
      .from('memberships')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
    expect(membershipsDespues).toBe(2)

    // Queda constancia en audit_log.
    const { data: entradaAudit } = await admin
      .from('audit_log')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('action', 'tenant.reseteado')
      .maybeSingle()
    expect(entradaAudit).not.toBeNull()
  }, 30_000)
})
