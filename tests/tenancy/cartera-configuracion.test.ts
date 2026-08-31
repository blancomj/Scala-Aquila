/**
 * CAR §8.4/§9.4 — siembra de la configuración inicial de cartera (bloque 23).
 * CAR §8.5 — versionado editable de una política vigente (bloque 23):
 * fn_crear_version_politica_clasificacion clona tramos y estrategias de una
 * política existente en un borrador nuevo, para editarlo sin tocar la
 * vigente (REC-CAR-011: una política vigente es inmutable).
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
  let versionNuevaId: string

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

  // ── §8.5 / bloque 23: versionado editable de la vigente ────────────────
  it('crea una versión nueva en borrador, clonando tramos y estrategias de la vigente', async () => {
    const { data, error } = await clienteAdministrador.rpc('fn_crear_version_politica_clasificacion', {
      p_politica_id: politicaId,
    })
    expect(error).toBeNull()
    versionNuevaId = data as unknown as string
    expect(versionNuevaId).toBeTruthy()
    expect(versionNuevaId).not.toBe(politicaId)

    const { data: nueva } = await admin
      .from('politicas_clasificacion_cartera')
      .select('estado, version')
      .eq('id', versionNuevaId)
      .single<{ estado: string; version: number }>()
    expect(nueva!.estado).toBe('borrador')
    expect(nueva!.version).toBe(2)

    const { data: tramosOrigen } = await admin
      .from('politica_clasificacion_tramos')
      .select('codigo, dias_min, dias_max')
      .eq('politica_id', politicaId)
      .order('orden')
    const { data: tramosClon } = await admin
      .from('politica_clasificacion_tramos')
      .select('codigo, dias_min, dias_max')
      .eq('politica_id', versionNuevaId)
      .order('orden')
    expect(tramosClon).toEqual(tramosOrigen)

    const { data: estrategiasOrigen } = await admin
      .from('estrategias_cobranza')
      .select('codigo, tipo_accion')
      .eq('politica_id', politicaId)
      .order('codigo')
    const { data: estrategiasClon } = await admin
      .from('estrategias_cobranza')
      .select('codigo, tipo_accion')
      .eq('politica_id', versionNuevaId)
      .order('codigo')
    expect(estrategiasClon).toEqual(estrategiasOrigen)
  }, 60_000)

  it('el borrador se puede editar; la vigente sigue inmutable (REC-CAR-011)', async () => {
    const { data: tramoBorrador } = await admin
      .from('politica_clasificacion_tramos')
      .select('id')
      .eq('politica_id', versionNuevaId)
      .eq('codigo', 'MORA_TEMPRANA')
      .single<{ id: string }>()

    const { error: errorEditarBorrador } = await clienteAdministrador
      .from('politica_clasificacion_tramos')
      .update({ nombre: 'Mora temprana (editado)' })
      .eq('id', tramoBorrador!.id)
    expect(errorEditarBorrador).toBeNull()

    const { data: tramoVigente } = await admin
      .from('politica_clasificacion_tramos')
      .select('id')
      .eq('politica_id', politicaId)
      .eq('codigo', 'MORA_TEMPRANA')
      .single<{ id: string }>()

    const { error: errorEditarVigente } = await clienteAdministrador
      .from('politica_clasificacion_tramos')
      .update({ nombre: 'Mora temprana (editado)' })
      .eq('id', tramoVigente!.id)
    expect(errorEditarVigente).not.toBeNull()
    expect(errorEditarVigente?.message ?? '').toMatch(/INMUTABLE/i)
  }, 30_000)

  it('activar la versión nueva retira la vigente actual a historica (patrón de dos UPDATE)', async () => {
    const { error: errorRetiro } = await clienteAdministrador
      .from('politicas_clasificacion_cartera')
      .update({ estado: 'historica' })
      .eq('id', politicaId)
    expect(errorRetiro).toBeNull()

    const { error: errorPromocion } = await clienteAdministrador
      .from('politicas_clasificacion_cartera')
      .update({ estado: 'vigente' })
      .eq('id', versionNuevaId)
    expect(errorPromocion).toBeNull()

    const { data: estados } = await admin
      .from('politicas_clasificacion_cartera')
      .select('id, estado')
      .in('id', [politicaId, versionNuevaId])
    const porId = new Map((estados ?? []).map((p) => [p.id, p.estado]))
    expect(porId.get(politicaId)).toBe('historica')
    expect(porId.get(versionNuevaId)).toBe('vigente')
  }, 30_000)

  // ── §9.3: estrategias editables incluso con política vigente ───────────
  it('crea, edita y elimina una estrategia con la política ya vigente (sin guard de inmutabilidad)', async () => {
    const { data: tramo } = await admin
      .from('politica_clasificacion_tramos')
      .select('id')
      .eq('politica_id', versionNuevaId)
      .eq('codigo', 'AL_DIA')
      .single<{ id: string }>()

    const { data: creada, error: errorCrear } = await clienteAdministrador
      .from('estrategias_cobranza')
      .insert({
        tenant_id: tenant.id,
        politica_id: versionNuevaId,
        tramo_id: tramo!.id,
        codigo: 'SALUDO-TEST',
        nombre: 'Correo de bienvenida',
        tipo_accion: 'email',
        canal: 'email',
        dias_desde_clasificacion: 0,
        max_intentos: 1,
        rol_minimo: 'auxiliar',
        activa: true,
        orden: 99,
      })
      .select('id, activa')
      .single<{ id: string; activa: boolean }>()
    // Estrategias SÍ se pueden crear con la política vigente — es la
    // diferencia clave frente a los tramos (§8.5 solo aplica a tramos).
    expect(errorCrear).toBeNull()
    expect(creada!.activa).toBe(true)
    const estrategiaId = creada!.id

    const { error: errorEditar } = await clienteAdministrador
      .from('estrategias_cobranza')
      .update({ dias_desde_clasificacion: 7, requiere_aprobacion: true, monto_minimo_deuda: 50000 })
      .eq('id', estrategiaId)
    expect(errorEditar).toBeNull()

    const { data: editada } = await admin
      .from('estrategias_cobranza')
      .select('dias_desde_clasificacion, requiere_aprobacion, monto_minimo_deuda')
      .eq('id', estrategiaId)
      .single<{ dias_desde_clasificacion: number; requiere_aprobacion: boolean; monto_minimo_deuda: string }>()
    expect(editada!.dias_desde_clasificacion).toBe(7)
    expect(editada!.requiere_aprobacion).toBe(true)
    expect(Number(editada!.monto_minimo_deuda)).toBe(50000)

    const { error: errorEliminar } = await clienteAdministrador
      .from('estrategias_cobranza')
      .delete()
      .eq('id', estrategiaId)
    expect(errorEliminar).toBeNull()

    const { count } = await admin
      .from('estrategias_cobranza')
      .select('id', { count: 'exact', head: true })
      .eq('id', estrategiaId)
    expect(count).toBe(0)
  }, 30_000)

  it('el guard sigue exigiendo que tramo_id pertenezca a politica_id', async () => {
    const { data: tramoDeOtraPolitica } = await admin
      .from('politica_clasificacion_tramos')
      .select('id')
      .eq('politica_id', politicaId)
      .eq('codigo', 'CRITICA')
      .single<{ id: string }>()

    const { error } = await clienteAdministrador.from('estrategias_cobranza').insert({
      tenant_id: tenant.id,
      politica_id: versionNuevaId,
      tramo_id: tramoDeOtraPolitica!.id,
      codigo: 'CRUZADA-TEST',
      nombre: 'No debería crearse',
      tipo_accion: 'email',
      canal: 'email',
      dias_desde_clasificacion: 0,
      max_intentos: 1,
      rol_minimo: 'auxiliar',
      activa: true,
      orden: 99,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/ESTRATEGIA_COBRANZA_TRAMO_AJENO/i)
  }, 30_000)
})
