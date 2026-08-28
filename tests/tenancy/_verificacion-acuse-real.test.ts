/**
 * ARCHIVO TEMPORAL — verificación puntual de que el webhook registrado en
 * la consola de Brevo entrega acuses de verdad. NO es parte de la suite:
 * envía un SMS real y deja el tenant vivo a propósito, para que el acuse
 * asíncrono de Brevo tenga a dónde llegar. Se borra tras verificar.
 */
import { describe, expect, it } from 'vitest'
import {
  clienteAdmin,
  clienteComo,
  crearMembership,
  crearTenant,
  crearUsuario,
  leerEntorno,
  type Cliente,
} from '../rls/helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip
const SMS_DESTINO_PRUEBA = '+573107418731'
const EVENT_TYPE = 'cartera_pago_vencido'

async function listaTipoId(admin: Cliente, tipo: string, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', tipo)
    .eq('codigo', codigo)
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture ${tipo}.${codigo}: ${error.message}`)
  return data.id
}

d('verificación manual: acuse real de Brevo', () => {
  const admin = clienteAdmin(env!)

  it('despacha un SMS real y deja el envío vivo para el acuse asíncrono', async () => {
    const administrador = await crearUsuario(admin, 'ver-admin')
    const tenant = await crearTenant(admin, 'ver', administrador.id)
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    const cliente = await clienteComo(env!, administrador)

    const { data: politica } = await admin
      .from('politicas_clasificacion_cartera')
      .insert({
        tenant_id: tenant.id,
        version: 1,
        estado: 'borrador',
        nombre: 'Verificación acuse',
        policy_hash: `verif-acuse-${tenant.id}`,
      })
      .select('id')
      .single<{ id: string }>()

    const { data: tramos } = await admin
      .from('politica_clasificacion_tramos')
      .insert([
        {
          tenant_id: tenant.id,
          politica_id: politica!.id,
          codigo: 'AL_DIA',
          nombre: 'Al día',
          dias_min: 0,
          dias_max: 0,
          nivel_riesgo: 'ninguno',
          etapa_cobranza: 'preventiva',
          prioridad: 0,
          orden: 0,
        },
        {
          tenant_id: tenant.id,
          politica_id: politica!.id,
          codigo: 'MORA',
          nombre: 'En mora',
          dias_min: 1,
          dias_max: null,
          nivel_riesgo: 'alto',
          etapa_cobranza: 'administrativa',
          prioridad: 1,
          orden: 1,
        },
      ])
      .select('id, codigo')

    const { data: estrategia } = await admin
      .from('estrategias_cobranza')
      .insert({
        tenant_id: tenant.id,
        politica_id: politica!.id,
        tramo_id: tramos!.find((t) => t.codigo === 'MORA')!.id,
        codigo: 'EST-SMS',
        nombre: 'Aviso por SMS',
        tipo_accion: 'sms',
        canal: 'sms',
        plantilla_codigo: EVENT_TYPE,
        dias_desde_clasificacion: 0,
        frecuencia_dias: null,
        max_intentos: 3,
        rol_minimo: 'auxiliar',
        requiere_aprobacion: false,
        activa: true,
        orden: 1,
      })
      .select('id')
      .single<{ id: string }>()

    await admin.from('politicas_clasificacion_cartera').update({ estado: 'vigente' }).eq('id', politica!.id)

    await admin.from('plantillas_sms').insert({
      tenant_id: tenant.id,
      event_type: EVENT_TYPE,
      cuerpo: 'AQUILA: prueba de acuse real. Inmueble {inmueble}, {diasMora} dias de mora, saldo {saldoPendiente}.',
      activo: true,
    })

    const tipoInmueble = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
    const { data: inmueble } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `VER-${String(Date.now())}`, tipo_id: tipoInmueble })
      .select('id')
      .single<{ id: string }>()

    const tipoIdent = await listaTipoId(admin, 'TIPO_IDENTIFICACION', 'cedula')
    const estadoActivo = await listaTipoId(admin, 'ESTADO_TERCERO', 'activo')
    const { data: tercero } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenant.id,
        tipo_identificacion_id: tipoIdent,
        numero_documento: `VER-${String(Date.now())}`,
        tipo_persona: 'natural',
        primer_nombre: 'Verificacion',
        primer_apellido: 'Acuse',
        telefono: SMS_DESTINO_PRUEBA,
        estado_id: estadoActivo,
      })
      .select('id')
      .single<{ id: string }>()

    const { data: accion } = await admin
      .from('acciones_cobranza')
      .insert({
        tenant_id: tenant.id,
        inmueble_id: inmueble!.id,
        estrategia_id: estrategia!.id,
        tipo_accion: 'sms',
        canal: 'sms',
        fecha_programada: '2026-08-28',
        clasificacion_codigo: 'MORA',
        politica_clasificacion_id: politica!.id,
        politica_version: 1,
        dias_mora_al_momento: 60,
        deuda_total_al_momento: 480_000,
        destinatario_tercero_id: tercero!.id,
        destinatario_rol_codigo: 'copropietario',
        estado: 'programada',
        creada_por: 'job',
      })
      .select('id')
      .single<{ id: string }>()

    const { data, response } = await cliente.functions.invoke<{
      success: boolean
      envioId: string | null
      evidenciaRegistrada: boolean
    }>('ejecutar-accion-cobranza', {
      body: { tenant_id: tenant.id, accion_id: accion!.id },
    })

    expect(response?.status).toBe(200)
    expect(data?.success).toBe(true)
    expect(data?.evidenciaRegistrada).toBe(true)

    console.log('VERIFICACION_TENANT_ID=', tenant.id)
    console.log('VERIFICACION_ACCION_ID=', accion!.id)
    console.log('VERIFICACION_ENVIO_ID=', data?.envioId)
  }, 120_000)
})
