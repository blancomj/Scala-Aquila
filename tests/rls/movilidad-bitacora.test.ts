/**
 * MOV-1 — bitácora de portería, ocupación derivada y cupos.
 *
 * Lo que defiende, y que no se ve leyendo el esquema:
 *
 *  1. la bitácora registra TAMBIÉN lo no autorizado — es su razón de ser;
 *  2. `autorizado` es una FOTO: revocar el permiso después no reescribe
 *     lo que se registró;
 *  3. "qué hay dentro" se DERIVA del último paso, sin tabla de ocupación;
 *  4. el cupo lleno AVISA pero nunca rechaza el registro;
 *  5. un espacio de parqueadero no puede estar asignado a dos vehículos.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
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
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

interface Paso {
  paso_id: string
  placa: string
  autorizado: boolean
  es_visitante: boolean
  visitantes_dentro: number
  cupos_visitante: number | null
  aviso: string | null
}

interface Dentro {
  placa: string
  es_visitante: boolean
  autorizado: boolean
  horas_dentro: number
  excedido: boolean
}

async function idListaTipos(admin: Cliente, tipo: string, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', tipo)
    .eq('codigo', codigo)
    .single<{ id: number }>()
  if (error) throw new Error(`lista_tipos ${tipo}.${codigo}: ${error.message}`)
  return data.id
}

d('MOV-1: bitácora de portería', () => {
  const admin = clienteAdmin(env!)

  let tenant: TenantPrueba
  let administrador: UsuarioPrueba
  let auditor: UsuarioPrueba
  let comoAdmin: Cliente
  let comoAuditor: Cliente

  let vehiculoResidente: string
  let tipoPermisoParqueadero: number

  async function registrar(
    cliente: Cliente,
    sentido: 'entrada' | 'salida',
    placa: string,
  ): Promise<Paso> {
    const { data, error } = await cliente.rpc('fn_vehiculo_registrar_paso', {
      p_tenant_id: tenant.id,
      p_sentido: sentido,
      p_placa: placa,
    })
    if (error) throw new Error(`registrar paso: ${error.message}`)
    return (data as unknown as Paso[])[0]!
  }

  async function dentro(cliente: Cliente): Promise<Dentro[]> {
    const { data, error } = await cliente.rpc('fn_movilidad_dentro', { p_tenant_id: tenant.id })
    if (error) throw new Error(`fn_movilidad_dentro: ${error.message}`)
    return data
  }

  beforeAll(async () => {
    tenant = await crearTenant(admin, 'mov1')
    administrador = await crearUsuario(admin, 'mov1-adm')
    auditor = await crearUsuario(admin, 'mov1-aud')
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    await crearMembership(admin, tenant.id, auditor.id, 'auditor')
    comoAdmin = await clienteComo(env!, administrador)
    comoAuditor = await clienteComo(env!, auditor)

    const tipoAuto = await idListaTipos(admin, 'TIPO_VEHICULO', 'automovil')
    tipoPermisoParqueadero = await idListaTipos(admin, 'TIPO_PERMISO_VEHICULO', 'parqueadero')

    const { data: v, error } = await admin
      .from('vehiculos')
      .insert({ tenant_id: tenant.id, placa: 'MOV-100', tipo_id: tipoAuto })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture vehículo: ${error.message}`)
    vehiculoResidente = v.id

    await admin.from('vehiculo_permiso').insert({
      tenant_id: tenant.id,
      vehiculo_id: vehiculoResidente,
      tipo_id: tipoPermisoParqueadero,
      vigente_desde: new Date().toISOString().slice(0, 10),
      estado: 'vigente',
    })
  }, 60_000)

  afterAll(async () => {
    for (const u of [administrador, auditor]) await eliminarUsuario(admin, u.id)
    await eliminarTenant(admin, tenant.id)
  })

  it('un vehículo con permiso entra y queda registrado como autorizado', async () => {
    const paso = await registrar(comoAdmin, 'entrada', 'mov 100')
    expect(paso.autorizado).toBe(true)
    // No es visitante: está en el inventario.
    expect(paso.es_visitante).toBe(false)
    // La placa se guarda como se tecleó; la normalización es de la columna
    // generada, no del texto que vio el portero.
    expect(paso.placa).toBe('mov 100')
  }, 30_000)

  it('una placa desconocida NO se rechaza: se registra como no autorizada', async () => {
    const paso = await registrar(comoAdmin, 'entrada', 'XXX-999')
    expect(paso.autorizado).toBe(false)
    // Sin vehículo en el inventario, cuenta como visitante.
    expect(paso.es_visitante).toBe(true)
    expect(paso.aviso).toContain('sin permiso vigente')
  }, 30_000)

  it('«qué hay dentro» se deriva del último paso, sin tabla de ocupación', async () => {
    const antes = await dentro(comoAdmin)
    expect(antes.map((x) => x.placa).sort()).toEqual(['XXX-999', 'mov 100'])

    await registrar(comoAdmin, 'salida', 'MOV100')
    const despues = await dentro(comoAdmin)
    // Salió: deja de estar dentro aunque nadie editara ninguna fila. Y la
    // salida se tecleó sin guion: la normalizada las empareja igual.
    expect(despues.map((x) => x.placa)).toEqual(['XXX-999'])
  }, 30_000)

  it('autorizado es una FOTO: revocar el permiso después no reescribe el pasado', async () => {
    const { data: pasoPrevio } = await admin
      .from('vehiculo_paso')
      .select('id, autorizado')
      .eq('tenant_id', tenant.id)
      .eq('placa', 'mov 100')
      .eq('sentido', 'entrada')
      .single<{ id: string; autorizado: boolean }>()
    expect(pasoPrevio!.autorizado).toBe(true)

    // motivo_revocacion es OBLIGATORIO al revocar
    // (vehiculo_permiso_revocacion_con_motivo). Omitirlo hacía que el
    // update fallara en silencio y la prueba culpara al código.
    const { error: errorRevocar } = await admin
      .from('vehiculo_permiso')
      .update({ estado: 'revocado', motivo_revocacion: 'Fin del contrato' })
      .eq('vehiculo_id', vehiculoResidente)
    expect(errorRevocar, 'la revocación del fixture tiene que funcionar').toBeNull()

    // El vehículo ya no está autorizado HOY...
    const nuevo = await registrar(comoAdmin, 'entrada', 'MOV-100')
    expect(nuevo.autorizado).toBe(false)

    // ...pero lo que se registró entonces sigue diciendo que sí lo estaba.
    const { data: sinTocar } = await admin
      .from('vehiculo_paso')
      .select('autorizado')
      .eq('id', pasoPrevio!.id)
      .single<{ autorizado: boolean }>()
    expect(sinTocar!.autorizado).toBe(true)
  }, 30_000)

  it('el cupo lleno avisa, pero jamás rechaza el registro', async () => {
    await admin.from('movilidad_config').insert({
      tenant_id: tenant.id,
      cupos_visitante: 1,
      horas_max_visitante: 2,
    })

    // Ya hay un visitante dentro (XXX-999), así que este llena el cupo.
    const segundo = await registrar(comoAdmin, 'entrada', 'VIS-001')
    expect(segundo.aviso).toBeTruthy()

    // Y el tercero lo excede — y aun así queda registrado, que es el punto
    // entero: negarlo dejaría el carro dentro y fuera de la bitácora.
    const tercero = await registrar(comoAdmin, 'entrada', 'VIS-002')
    expect(tercero.paso_id).toBeTruthy()
    expect(tercero.aviso).toContain('excedido')
    expect(tercero.visitantes_dentro).toBeGreaterThan(tercero.cupos_visitante!)
  }, 30_000)

  it('un auditor puede leer la bitácora pero no registrar un paso', async () => {
    const { data: leidos, error: errorLectura } = await comoAuditor
      .from('vehiculo_paso')
      .select('id')
      .eq('tenant_id', tenant.id)
    expect(errorLectura).toBeNull()
    expect((leidos ?? []).length).toBeGreaterThan(0)

    const { error } = await comoAuditor.rpc('fn_vehiculo_registrar_paso', {
      p_tenant_id: tenant.id,
      p_sentido: 'entrada',
      p_placa: 'AUD-001',
    })
    expect(error?.message).toContain('MOVILIDAD_REGISTRO_REQUIERE_AGENTE')
  }, 30_000)

  it('la bitácora no se escribe por insert directo ni se borra', async () => {
    // Sin policy de INSERT para authenticated: un insert directo podría
    // afirmar "autorizado = true" sobre cualquier placa.
    const { error: errorInsert } = await comoAdmin.from('vehiculo_paso').insert({
      tenant_id: tenant.id,
      placa: 'FALSA-1',
      sentido: 'entrada',
      autorizado: true,
    })
    expect(errorInsert).not.toBeNull()

    // Y sin DELETE: un registro de portería que se puede borrar no prueba
    // nada. La RLS filtra en vez de fallar, así que se comprueba la fila.
    const { data: antes } = await admin
      .from('vehiculo_paso')
      .select('id')
      .eq('tenant_id', tenant.id)
    await comoAdmin.from('vehiculo_paso').delete().eq('tenant_id', tenant.id)
    const { data: despues } = await admin
      .from('vehiculo_paso')
      .select('id')
      .eq('tenant_id', tenant.id)
    expect(despues!.length).toBe(antes!.length)
  }, 30_000)

  it('no hay portería para quien no es miembro', async () => {
    const otro = await crearTenant(admin, 'mov1-ajeno')
    const { error } = await comoAdmin.rpc('fn_movilidad_dentro', { p_tenant_id: otro.id })
    expect(error?.message).toContain('MOVILIDAD_NO_DISPONIBLE')
    await eliminarTenant(admin, otro.id)
  }, 30_000)

  // ── Cupos de parqueadero ──

  it('un cupo no puede ser un apartamento: tiene que ser de tipo parqueadero', async () => {
    const tipoApto = await idListaTipos(admin, 'TIPO_INMUEBLE', 'apartamento')
    const { data: apto } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: 'MOV-502', tipo_id: tipoApto })
      .select('id')
      .single<{ id: string }>()

    const { error } = await admin.from('vehiculo_permiso').insert({
      tenant_id: tenant.id,
      vehiculo_id: vehiculoResidente,
      tipo_id: tipoPermisoParqueadero,
      vigente_desde: new Date().toISOString().slice(0, 10),
      estado: 'vigente',
      inmueble_id: apto!.id,
    })
    expect(error?.message).toContain('CUPO_NO_ES_PARQUEADERO')
  }, 30_000)

  it('un mismo cupo no puede estar asignado a dos vehículos vigentes', async () => {
    const tipoParq = await idListaTipos(admin, 'TIPO_INMUEBLE', 'parqueadero')
    const tipoAuto = await idListaTipos(admin, 'TIPO_VEHICULO', 'automovil')
    const hoy = new Date().toISOString().slice(0, 10)

    const { data: cupo } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: 'P-14', tipo_id: tipoParq })
      .select('id')
      .single<{ id: string }>()

    const { data: otroVehiculo } = await admin
      .from('vehiculos')
      .insert({ tenant_id: tenant.id, placa: 'MOV-200', tipo_id: tipoAuto })
      .select('id')
      .single<{ id: string }>()

    const { error: primero } = await admin.from('vehiculo_permiso').insert({
      tenant_id: tenant.id,
      vehiculo_id: otroVehiculo!.id,
      tipo_id: tipoPermisoParqueadero,
      vigente_desde: hoy,
      estado: 'vigente',
      inmueble_id: cupo!.id,
    })
    expect(primero).toBeNull()

    const { data: tercerVehiculo } = await admin
      .from('vehiculos')
      .insert({ tenant_id: tenant.id, placa: 'MOV-300', tipo_id: tipoAuto })
      .select('id')
      .single<{ id: string }>()

    const { error: segundo } = await admin.from('vehiculo_permiso').insert({
      tenant_id: tenant.id,
      vehiculo_id: tercerVehiculo!.id,
      tipo_id: tipoPermisoParqueadero,
      vigente_desde: hoy,
      estado: 'vigente',
      inmueble_id: cupo!.id,
    })
    expect(segundo).not.toBeNull()
  }, 30_000)

  it('el cupo de otra copropiedad no sirve', async () => {
    const otro = await crearTenant(admin, 'mov1-cupo-ajeno')
    const tipoParq = await idListaTipos(admin, 'TIPO_INMUEBLE', 'parqueadero')
    const { data: cupoAjeno } = await admin
      .from('inmuebles')
      .insert({ tenant_id: otro.id, codigo: 'P-99', tipo_id: tipoParq })
      .select('id')
      .single<{ id: string }>()

    const { error } = await admin.from('vehiculo_permiso').insert({
      tenant_id: tenant.id,
      vehiculo_id: vehiculoResidente,
      tipo_id: tipoPermisoParqueadero,
      vigente_desde: new Date().toISOString().slice(0, 10),
      estado: 'vigente',
      inmueble_id: cupoAjeno!.id,
    })
    expect(error?.message).toContain('CUPO_INVALIDO')

    await eliminarTenant(admin, otro.id)
  }, 30_000)

  // ── El camino del QR (MANT-11) ──

  it('una visita con QR entra, consume su autorización y deja paso de vehículo', async () => {
    const tipoApto = await idListaTipos(admin, 'TIPO_INMUEBLE', 'apartamento')
    const { data: apto } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: 'MOV-701', tipo_id: tipoApto })
      .select('id')
      .single<{ id: string }>()

    const tipoVisita = await idListaTipos(admin, 'TIPO_VISITA', 'domicilio')
    const { data: aut, error: errorAut } = await admin
      .from('mant_autorizaciones_visita')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: apto!.id,
        autorizado_por_ref: administrador.id,
        autorizado_por_origen: 'staff',
        visitante_nombre: 'Domiciliario',
        tipo_id: tipoVisita,
        fecha_prevista: new Date().toISOString().slice(0, 10),
        vehiculo_placa: 'QR-500',
      })
      .select('id')
      .single<{ id: string }>()
    if (errorAut) throw new Error(`fixture autorización: ${errorAut.message}`)

    const { data, error } = await comoAdmin.rpc('fn_vehiculo_registrar_paso', {
      p_tenant_id: tenant.id,
      p_sentido: 'entrada',
      p_autorizacion_id: aut.id,
    })
    if (error) throw new Error(`paso con QR: ${error.message}`)
    const paso = (data as unknown as Paso[])[0]!

    // La placa sale de la autorización: el portero no la teclea.
    expect(paso.placa).toBe('QR-500')
    // Con autorización, autorizado es true aunque el carro no esté en el
    // inventario — para eso existe la autorización.
    expect(paso.autorizado).toBe(true)
    expect(paso.es_visitante).toBe(true)

    // El QR es de un solo uso, y eso lo sigue gobernando MANT-11.
    const { data: consumida } = await admin
      .from('mant_autorizaciones_visita')
      .select('estado')
      .eq('id', aut.id)
      .single<{ estado: string }>()
    expect(consumida!.estado).toBe('usada')

    // Y hay un ingreso de PERSONA además del paso de vehículo: son dos
    // hechos distintos apuntando a la misma autorización.
    const { data: ingresos } = await admin
      .from('mant_registros_acceso')
      .select('id')
      .eq('autorizacion_id', aut.id)
    expect((ingresos ?? []).length).toBe(1)

    // La SALIDA de esa misma visita se registra contra la autorización ya
    // 'usada' y no debe fallar: negarla dejaría una entrada sin cierre.
    const { error: errorSalida } = await comoAdmin.rpc('fn_vehiculo_registrar_paso', {
      p_tenant_id: tenant.id,
      p_sentido: 'salida',
      p_autorizacion_id: aut.id,
    })
    expect(errorSalida).toBeNull()
  }, 30_000)

  // ── La rama de "Mis asuntos" ──

  it('el visitante que se pasó del tiempo aparece en la bandeja, y se va al salir', async () => {
    // El límite del fixture son 2 horas: se envejece el paso de entrada
    // con un UPDATE directo, que equivale a que el tiempo hubiera pasado.
    const hace5h = new Date(Date.now() - 5 * 3600 * 1000).toISOString()
    await admin
      .from('vehiculo_paso')
      .update({ momento: hace5h })
      .eq('tenant_id', tenant.id)
      .eq('placa', 'VIS-001')

    const { data: conExcedido } = await comoAdmin.rpc('fn_mis_asuntos', {
      p_tenant_id: tenant.id,
    })
    const asuntos = (conExcedido ?? []) as unknown as { origen_modulo: string; titulo: string }[]
    const excedido = asuntos.find((a) => a.titulo.includes('VIS-001'))
    expect(excedido, 'el visitante excedido debería estar en la bandeja').toBeDefined()
    expect(excedido!.origen_modulo).toBe('movilidad')

    // Y desaparece SOLO al registrar la salida: nadie cierra el asunto.
    await registrar(comoAdmin, 'salida', 'VIS-001')
    const { data: despues } = await comoAdmin.rpc('fn_mis_asuntos', { p_tenant_id: tenant.id })
    const restantes = (despues ?? []) as unknown as { titulo: string }[]
    expect(restantes.find((a) => a.titulo.includes('VIS-001'))).toBeUndefined()
  }, 30_000)
})
