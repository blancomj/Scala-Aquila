/**
 * CAR §8.4/§9.4 — siembra de la configuración inicial de cartera (bloque 23).
 *
 * Lo que se prueba es que una copropiedad nueva pueda encender el módulo
 * sin que nadie escriba SQL, y que lo sembrado cumpla los invariantes de
 * §8.3 — porque si no los cumple, la política no se puede activar y el
 * botón de la pantalla falla sin que se sepa por qué.
 */
import { afterAll, describe, expect, it } from 'vitest'
import {
  clienteAdmin,
  clienteComo,
  crearMembership,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  type Cliente,
  type TenantPrueba,
  type UsuarioPrueba,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/tenancy/cartera-configuracion: faltan variables de Supabase en .env')
}

d('CAR §8.4 — configuración inicial de cartera', () => {
  const admin = clienteAdmin(env!)
  let administrador: UsuarioPrueba
  let auxiliar: UsuarioPrueba
  let tenant: TenantPrueba
  let clienteAdministrador: Cliente
  let clienteAuxiliar: Cliente
  let politicaId: string

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, administrador.id)
    await eliminarUsuario(admin, auxiliar.id)
  })

  it('setup: copropiedad recién creada, sin nada configurado', async () => {
    administrador = await crearUsuario(admin, 'cfg-admin')
    auxiliar = await crearUsuario(admin, 'cfg-aux')
    tenant = await crearTenant(admin, 'cfg', administrador.id)
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    clienteAdministrador = await clienteComo(env!, administrador)
    clienteAuxiliar = await clienteComo(env!, auxiliar)

    const { count } = await admin
      .from('politicas_clasificacion_cartera')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
    expect(count).toBe(0)
  }, 60_000)

  it('siembra los ocho tramos de §8.4 y las estrategias de §9.4', async () => {
    const { data, error } = await clienteAdministrador.rpc('fn_sembrar_configuracion_cartera', {
      p_tenant_id: tenant.id,
    })
    expect(error).toBeNull()
    politicaId = data as unknown as string
    expect(politicaId).toBeTruthy()

    const { data: tramos } = await admin
      .from('politica_clasificacion_tramos')
      .select('codigo, dias_min, dias_max, etapa_cobranza')
      .eq('politica_id', politicaId)
      .order('orden')
    expect(tramos).toHaveLength(8)

    // IC-TRAMO-03/04: exactamente uno que arranca en 0 y exactamente uno
    // abierto. Sin esto la política no se puede activar.
    expect((tramos ?? []).filter((t) => t.dias_min === 0)).toHaveLength(1)
    expect((tramos ?? []).filter((t) => t.dias_max === null)).toHaveLength(1)

    // Sin huecos ni solapes: cada tramo empieza donde acabó el anterior.
    const ordenados = tramos ?? []
    for (let i = 1; i < ordenados.length; i += 1) {
      expect(ordenados[i]!.dias_min).toBe((ordenados[i - 1]!.dias_max ?? 0) + 1)
    }

    // La mora avanzada escala de administrativa a prejurídica: es el
    // comportamiento que hace útil la clasificación.
    const etapas = new Set((tramos ?? []).map((t) => t.etapa_cobranza))
    expect(etapas).toContain('prejuridica')
    expect(etapas).toContain('juridica')

    const { data: estrategias } = await admin
      .from('estrategias_cobranza')
      .select('codigo, tipo_accion, requiere_aprobacion, activa')
      .eq('politica_id', politicaId)
    expect((estrategias ?? []).length).toBeGreaterThanOrEqual(10)

    // §9.4: el sistema nunca demanda a alguien automáticamente. Todo lo de
    // alto impacto nace exigiendo aprobación humana.
    const altoImpacto = ['requerimiento_formal', 'aviso_prejuridico', 'asignacion_abogado', 'remision_juridica']
    for (const tipo of altoImpacto) {
      const estrategia = (estrategias ?? []).find((e) => e.tipo_accion === tipo)
      expect(estrategia, `falta la estrategia de ${tipo}`).toBeDefined()
      expect(estrategia?.requiere_aprobacion, `${tipo} debería exigir aprobación`).toBe(true)
    }
  }, 60_000)

  it('nace en borrador: nada empieza a correr hasta que alguien la active', async () => {
    const { data } = await admin
      .from('politicas_clasificacion_cartera')
      .select('estado')
      .eq('id', politicaId)
      .single<{ estado: string }>()
    expect(data!.estado).toBe('borrador')
  }, 30_000)

  it('lo sembrado cumple los invariantes y por tanto SE PUEDE activar', async () => {
    const { error } = await clienteAdministrador
      .from('politicas_clasificacion_cartera')
      .update({ estado: 'vigente' })
      .eq('id', politicaId)
    // Si esto falla, la pantalla ofrece un botón que no funciona: la
    // configuración sugerida no serviría para arrancar.
    expect(error).toBeNull()

    const { data } = await admin
      .from('politicas_clasificacion_cartera')
      .select('estado')
      .eq('id', politicaId)
      .single<{ estado: string }>()
    expect(data!.estado).toBe('vigente')
  }, 30_000)

  it('no se puede sembrar dos veces: corregir es crear una versión nueva', async () => {
    const { error } = await clienteAdministrador.rpc('fn_sembrar_configuracion_cartera', {
      p_tenant_id: tenant.id,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/CARTERA_CONFIGURACION_YA_EXISTE/i)
  }, 30_000)

  it('un auxiliar TAMBIÉN puede configurar: la barrera es RLS, y hoy le alcanza', async () => {
    const { data: vistos, error: errorLectura } = await clienteAuxiliar
      .from('politica_clasificacion_tramos')
      .select('codigo')
      .eq('politica_id', politicaId)
    expect(errorLectura).toBeNull()
    expect((vistos ?? []).length).toBe(8)

    const otro = await crearUsuario(admin, 'cfg-aux2')
    const tenantVirgen = await crearTenant(admin, 'cfg-virgen', otro.id)
    try {
      await crearMembership(admin, tenantVirgen.id, auxiliar.id, 'auxiliar')
      const { error } = await clienteAuxiliar.rpc('fn_sembrar_configuracion_cartera', {
        p_tenant_id: tenantVirgen.id,
      })
      // La función es security invoker: no comprueba roles, deja que decida
      // RLS. Y politicas_clasificacion_cartera_insert_agent admite el rol
      // base, que el auxiliar tiene — igual que 'settings:manage' en la UI.
      //
      // Se prueba el comportamiento REAL, no el que uno esperaría: el
      // rector dice que los tramos se ajustan por acta de asamblea, así que
      // que un auxiliar pueda cambiarlos es una decisión de producto
      // pendiente de revisar, no un defecto de esta función.
      expect(error).toBeNull()
    } finally {
      await eliminarTenant(admin, tenantVirgen.id)
      await eliminarUsuario(admin, otro.id)
    }
  }, 90_000)
})
