/**
 * EXS-5 — vehículos y movilidad.
 *
 * Lo que defiende:
 *
 *  1. la placa se compara por su forma canónica, no por cómo se tecleó;
 *  2. registrar un vehículo NO es autorizarlo a entrar — son dos hechos y
 *     `autorizado` se deriva de los permisos vigentes, no de una columna;
 *  3. retirar es terminal: libera la placa para el carro nuevo, conserva la
 *     historia del viejo y revoca sus permisos sin que nadie lo pida;
 *  4. un permiso vencido deja de autorizar por sí solo, sin job que lo marque;
 *  5. otorgar permisos exige administrador; registrar, no.
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

interface ConsultaPorteria {
  vehiculo_id: string
  placa: string
  tipo: string
  estado: string
  autorizado: boolean
  permiso_hasta: string | null
  responsables: string[]
  inmuebles: string[]
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

function enDias(dias: number): string {
  const f = new Date()
  f.setUTCDate(f.getUTCDate() + dias)
  return f.toISOString().slice(0, 10)
}

d('EXS-5: vehículos y movilidad', () => {
  const admin = clienteAdmin(env!)

  let tenant: TenantPrueba
  let administrador: UsuarioPrueba
  let auxiliar: UsuarioPrueba
  let comoAdmin: Cliente
  let comoAuxiliar: Cliente

  let tipoAutomovil: number
  let tipoMoto: number
  let rolPropietario: number
  let permisoAcceso: number
  let tercero: string
  let inmueble: string

  beforeAll(async () => {
    tenant = await crearTenant(admin, 'exs5')
    administrador = await crearUsuario(admin, 'exs5-adm')
    auxiliar = await crearUsuario(admin, 'exs5-aux')
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    await crearMembership(admin, tenant.id, auxiliar.id, 'auxiliar')
    comoAdmin = await clienteComo(env!, administrador)
    comoAuxiliar = await clienteComo(env!, auxiliar)

    tipoAutomovil = await idListaTipos(admin, 'TIPO_VEHICULO', 'automovil')
    tipoMoto = await idListaTipos(admin, 'TIPO_VEHICULO', 'motocicleta')
    rolPropietario = await idListaTipos(admin, 'ROL_VEHICULO', 'propietario')
    permisoAcceso = await idListaTipos(admin, 'TIPO_PERMISO_VEHICULO', 'acceso')

    const tipoIdent = await idListaTipos(admin, 'TIPO_IDENTIFICACION', 'cedula')
    const estadoTercero = await idListaTipos(admin, 'ESTADO_TERCERO', 'activo')
    const { data, error } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenant.id,
        tipo_persona: 'natural',
        primer_nombre: 'Carlos',
        primer_apellido: 'Mejía',
        numero_documento: '79123456',
        tipo_identificacion_id: tipoIdent,
        estado_id: estadoTercero,
      })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture tercero: ${error.message}`)
    tercero = data.id

    const tipoInmueble = await idListaTipos(admin, 'TIPO_INMUEBLE', 'apartamento')
    const { data: inm, error: eInm } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `EXS5-${String(Date.now())}`, tipo_id: tipoInmueble })
      .select('id')
      .single<{ id: string }>()
    if (eInm) throw new Error(`fixture inmueble: ${eInm.message}`)
    inmueble = inm.id
  }, 60_000)

  afterAll(async () => {
    await eliminarUsuario(admin, administrador.id)
    await eliminarUsuario(admin, auxiliar.id)
    await eliminarTenant(admin, tenant.id)
  })

  async function crearVehiculo(placa: string, tipoId = tipoAutomovil): Promise<string> {
    const { data, error } = await admin
      .from('vehiculos')
      .insert({ tenant_id: tenant.id, placa, tipo_id: tipoId })
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture vehiculo ${placa}: ${error.message}`)
    return data.id
  }

  it('la placa se guarda como se escribió y se normaliza para comparar', async () => {
    const id = await crearVehiculo('abc-123')
    const { data } = await admin
      .from('vehiculos')
      .select('placa, placa_normalizada')
      .eq('id', id)
      .single<{ placa: string; placa_normalizada: string }>()
    expect(data?.placa).toBe('abc-123')
    expect(data?.placa_normalizada).toBe('ABC123')
  }, 30_000)

  it('dos vehículos activos no comparten placa aunque se teclee distinto', async () => {
    const { error } = await admin
      .from('vehiculos')
      .insert({ tenant_id: tenant.id, placa: 'ABC 123', tipo_id: tipoMoto })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('vehiculos_placa_vigente_idx')
  }, 30_000)

  it('retirar libera la placa y conserva la historia del vehículo anterior', async () => {
    const viejo = await crearVehiculo('XYZ-999')
    const { error: eRetiro } = await admin
      .from('vehiculos')
      .update({ estado: 'retirado', retirado_at: new Date().toISOString(), motivo_retiro: 'Vendido' })
      .eq('id', viejo)
    expect(eRetiro).toBeNull()

    const nuevo = await crearVehiculo('xyz999', tipoMoto)
    expect(nuevo).not.toBe(viejo)

    // El viejo sigue ahí: su historial de accesos es evidencia.
    const { data } = await admin
      .from('vehiculos')
      .select('id, estado')
      .eq('tenant_id', tenant.id)
      .eq('placa_normalizada', 'XYZ999')
    expect(data).toHaveLength(2)
  }, 30_000)

  it('un retiro sin fecha de retiro se rechaza: estado y fecha van juntos', async () => {
    const id = await crearVehiculo('RET-001')
    const { error } = await admin.from('vehiculos').update({ estado: 'retirado' }).eq('id', id)
    expect(error?.message).toContain('vehiculos_retiro_coherente')
  }, 30_000)

  it('registrar no es autorizar: sin permiso, autorizado es falso', async () => {
    const id = await crearVehiculo('REG-100')
    await admin.from('vehiculo_relacion').insert({
      tenant_id: tenant.id,
      vehiculo_id: id,
      tercero_id: tercero,
      rol_id: rolPropietario,
    })

    const { data, error } = await comoAdmin.rpc('fn_vehiculo_por_placa', {
      p_tenant_id: tenant.id,
      p_placa: 'reg 100',
    })
    expect(error).toBeNull()
    const filas = (data ?? []) as ConsultaPorteria[]
    expect(filas).toHaveLength(1)
    expect(filas[0]!.autorizado).toBe(false)
    expect(filas[0]!.responsables).toContain('Carlos Mejía')
  }, 30_000)

  it('con permiso vigente, la consulta de portería autoriza', async () => {
    const { data: v } = await admin
      .from('vehiculos')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('placa_normalizada', 'REG100')
      .single<{ id: string }>()

    const { error } = await admin.from('vehiculo_permiso').insert({
      tenant_id: tenant.id,
      vehiculo_id: v!.id,
      tipo_id: permisoAcceso,
      vigente_hasta: enDias(30),
    })
    expect(error).toBeNull()

    const { data } = await comoAdmin.rpc('fn_vehiculo_por_placa', {
      p_tenant_id: tenant.id,
      p_placa: 'REG-100',
    })
    expect(((data ?? []) as ConsultaPorteria[])[0]!.autorizado).toBe(true)
  }, 30_000)

  it('un permiso vencido deja de autorizar sin que nadie lo marque', async () => {
    const id = await crearVehiculo('VEN-200')
    await admin.from('vehiculo_permiso').insert({
      tenant_id: tenant.id,
      vehiculo_id: id,
      tipo_id: permisoAcceso,
      vigente_desde: enDias(-30),
      vigente_hasta: enDias(-1),
    })

    const { data } = await comoAdmin.rpc('fn_vehiculo_por_placa', {
      p_tenant_id: tenant.id,
      p_placa: 'VEN200',
    })
    const fila = ((data ?? []) as ConsultaPorteria[])[0]!
    // El permiso sigue 'vigente' como registro; lo que caducó es su efecto.
    expect(fila.autorizado).toBe(false)
  }, 30_000)

  it('retirar un vehículo revoca sus permisos vigentes', async () => {
    const id = await crearVehiculo('REV-300')
    await admin.from('vehiculo_permiso').insert({
      tenant_id: tenant.id,
      vehiculo_id: id,
      tipo_id: permisoAcceso,
    })

    await admin
      .from('vehiculos')
      .update({ estado: 'retirado', retirado_at: new Date().toISOString() })
      .eq('id', id)

    const { data } = await admin
      .from('vehiculo_permiso')
      .select('estado, motivo_revocacion')
      .eq('vehiculo_id', id)
      .single<{ estado: string; motivo_revocacion: string | null }>()
    expect(data?.estado).toBe('revocado')
    expect(data?.motivo_revocacion).toContain('retirar el vehículo')
  }, 30_000)

  it('un vehículo retirado no recibe permisos nuevos', async () => {
    const { data: v } = await admin
      .from('vehiculos')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('placa_normalizada', 'REV300')
      .single<{ id: string }>()

    const { error } = await admin.from('vehiculo_permiso').insert({
      tenant_id: tenant.id,
      vehiculo_id: v!.id,
      tipo_id: permisoAcceso,
    })
    expect(error?.message).toContain('PERMISO_VEHICULO_RETIRADO')
  }, 30_000)

  it('un tipo de permiso de otra familia se rechaza', async () => {
    const id = await crearVehiculo('FAM-400')
    const { error } = await admin.from('vehiculo_permiso').insert({
      tenant_id: tenant.id,
      vehiculo_id: id,
      tipo_id: tipoAutomovil,
    })
    expect(error?.message).toContain('PERMISO_VEHICULO_TIPO_INVALIDO')
  }, 30_000)

  it('un permiso no puede amparar un vehículo de otra copropiedad', async () => {
    const otro = await crearTenant(admin, 'exs5-ajeno')
    const id = await crearVehiculo('AJE-500')
    const { error } = await admin.from('vehiculo_permiso').insert({
      tenant_id: otro.id,
      vehiculo_id: id,
      tipo_id: permisoAcceso,
    })
    expect(error?.message).toContain('PERMISO_VEHICULO_TENANT_INCONSISTENTE')
    await eliminarTenant(admin, otro.id)
  }, 30_000)

  it('el auxiliar registra vehículos pero no otorga permisos', async () => {
    const { data: creado, error: eInsert } = await comoAuxiliar
      .from('vehiculos')
      .insert({ tenant_id: tenant.id, placa: 'AUX-600', tipo_id: tipoAutomovil })
      .select('id')
      .single<{ id: string }>()
    expect(eInsert).toBeNull()

    const { error: ePermiso } = await comoAuxiliar.from('vehiculo_permiso').insert({
      tenant_id: tenant.id,
      vehiculo_id: creado!.id,
      tipo_id: permisoAcceso,
    })
    expect(ePermiso).not.toBeNull()
  }, 30_000)

  it('no hay consulta de placas para quien no es miembro de la copropiedad', async () => {
    const otro = await crearTenant(admin, 'exs5-fuera')
    const { error } = await comoAdmin.rpc('fn_vehiculo_por_placa', {
      p_tenant_id: otro.id,
      p_placa: 'ABC123',
    })
    expect(error?.message).toContain('VEHICULO_NO_ENCONTRADO')
    await eliminarTenant(admin, otro.id)
  }, 30_000)

  it('una placa desconocida devuelve cero filas, no un error distinto', async () => {
    const { data, error } = await comoAdmin.rpc('fn_vehiculo_por_placa', {
      p_tenant_id: tenant.id,
      p_placa: 'NADA-000',
    })
    expect(error).toBeNull()
    expect((data ?? []) as ConsultaPorteria[]).toHaveLength(0)
  }, 30_000)

  it('la visita que llega en carro comparte la forma canónica de la placa', async () => {
    const { data, error } = await admin
      .from('mant_autorizaciones_visita')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmueble,
        autorizado_por_ref: administrador.id,
        autorizado_por_origen: 'staff',
        visitante_nombre: 'Mensajero',
        fecha_prevista: enDias(1),
        vehiculo_placa: 'vis-700',
      })
      .select('vehiculo_placa, vehiculo_placa_normalizada')
      .single<{ vehiculo_placa: string; vehiculo_placa_normalizada: string }>()
    expect(error).toBeNull()
    expect(data?.vehiculo_placa).toBe('vis-700')
    expect(data?.vehiculo_placa_normalizada).toBe('VIS700')
  }, 30_000)
})
