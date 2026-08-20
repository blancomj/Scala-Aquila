/**
 * estrategias_cobranza / acciones_cobranza — CAR F4 (Docs/Motor de gestion
 * de cartera/CAR_00_Guia_Oficial.md §9-§10). Cubre el adaptador
 * cartera-cobranza-supabase.ts contra Postgres real, y los dos guards de
 * esta migración: tramo ajeno a la política (estrategias_cobranza) y
 * contexto congelado (acciones_cobranza, REC-CAR-012).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  obtenerEstrategiasCobranzaVigentes,
  obtenerHistorialAccionesCobranza,
  registrarAccionCobranza,
  type DatosAccionCobranza,
} from '@aquila/liquidation-engine'
import {
  clienteAdmin,
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

if (!env) {
  console.warn('SALTADO tests/rls/cartera-cobranza: faltan variables de Supabase en .env')
}

async function listaTipoId(admin: Cliente, tipo: string, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', tipo)
    .eq('codigo', codigo)
    .is('tenant_id', null)
    .single<{ id: number }>()
  if (error) throw new Error(`fixture lista_tipos ${tipo}.${codigo}: ${error.message}`)
  return data.id
}

d('estrategias_cobranza / acciones_cobranza (CAR §9-§10)', () => {
  let admin: Cliente
  let usuario: UsuarioPrueba
  let tenant: TenantPrueba
  let inmuebleId: string
  let politicaId: string
  let tramoMoraId: string
  let tramoAlDiaId: string
  let estrategiaId: string
  let terceroId: string

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    usuario = await crearUsuario(admin, 'cobranza')
    tenant = await crearTenant(admin, 'cobranza', usuario.id)
    await crearMembership(admin, tenant.id, usuario.id, 'auxiliar')

    const tipoInmuebleId = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
    const { data: inmueble, error: errInmueble } = await admin
      .from('inmuebles')
      .insert({ tenant_id: tenant.id, codigo: `COB-${String(Date.now())}`, tipo_id: tipoInmuebleId })
      .select('id')
      .single<{ id: string }>()
    if (errInmueble) throw new Error(`fixture inmueble: ${errInmueble.message}`)
    inmuebleId = inmueble.id

    const { data: politica, error: errPolitica } = await admin
      .from('politicas_clasificacion_cartera')
      .insert({
        tenant_id: tenant.id,
        version: 1,
        estado: 'borrador',
        nombre: 'Política cobranza v1',
        policy_hash: `test-fixture-cobranza-v1-${tenant.id}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errPolitica) throw new Error(`fixture politica: ${errPolitica.message}`)
    politicaId = politica.id

    const { data: tramos, error: errTramos } = await admin
      .from('politica_clasificacion_tramos')
      .insert([
        {
          tenant_id: tenant.id,
          politica_id: politicaId,
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
          politica_id: politicaId,
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
    if (errTramos) throw new Error(`fixture tramos: ${errTramos.message}`)
    tramoAlDiaId = tramos.find((t) => t.codigo === 'AL_DIA')!.id
    tramoMoraId = tramos.find((t) => t.codigo === 'MORA')!.id

    const { data: estrategia, error: errEstrategia } = await admin
      .from('estrategias_cobranza')
      .insert({
        tenant_id: tenant.id,
        politica_id: politicaId,
        tramo_id: tramoMoraId,
        codigo: 'RECORDATORIO_MORA',
        nombre: 'Recordatorio por email',
        tipo_accion: 'email',
        canal: 'email',
        dias_desde_clasificacion: 3,
        frecuencia_dias: 15,
        max_intentos: 2,
        monto_minimo_deuda: 20000,
        orden: 0,
      })
      .select('id')
      .single<{ id: string }>()
    if (errEstrategia) throw new Error(`fixture estrategia: ${errEstrategia.message}`)
    estrategiaId = estrategia.id

    const tipoIdentCedula = await listaTipoId(admin, 'TIPO_IDENTIFICACION', 'cedula')
    const estadoActivo = await listaTipoId(admin, 'ESTADO_TERCERO', 'activo')
    const { data: tercero, error: errTercero } = await admin
      .from('terceros')
      .insert({
        tenant_id: tenant.id,
        tipo_identificacion_id: tipoIdentCedula,
        numero_documento: `COB-${String(Date.now())}`,
        tipo_persona: 'natural',
        primer_nombre: 'Ana',
        primer_apellido: 'Gómez',
        email: 'ana.gomez@example.test',
        estado_id: estadoActivo,
      })
      .select('id')
      .single<{ id: string }>()
    if (errTercero) throw new Error(`fixture tercero: ${errTercero.message}`)
    terceroId = tercero.id

    const rolCopropietario = await listaTipoId(admin, 'PERSONA_PREDIO', 'copropietario')
    const { error: errRol } = await admin.from('inmueble_persona_rol').insert({
      tenant_id: tenant.id,
      inmueble_id: inmuebleId,
      tercero_id: terceroId,
      rol_id: rolCopropietario,
      vigente_desde: '2026-01-01',
      es_pagador: true,
      recibe_notificaciones: true,
    })
    if (errRol) throw new Error(`fixture inmueble_persona_rol: ${errRol.message}`)
  })

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, usuario.id)
  })

  it('obtenerEstrategiasCobranzaVigentes resuelve el código de tramo y el monto mínimo como string', async () => {
    const estrategias = await obtenerEstrategiasCobranzaVigentes(admin, {
      tenantId: tenant.id,
      politicaId,
    })

    expect(estrategias).toHaveLength(1)
    expect(estrategias[0]).toMatchObject({
      id: estrategiaId,
      tramoCodigo: 'MORA',
      tipoAccion: 'email',
      diasDesdeClasificacion: 3,
      frecuenciaDias: 15,
      maxIntentos: 2,
      montoMinimoDeuda: '20000',
      activa: true,
    })
  })

  it('ESTRATEGIA_COBRANZA_TRAMO_AJENO: rechaza una estrategia cuyo tramo no pertenece a la política indicada', async () => {
    const { data: otraPolitica, error: errOtra } = await admin
      .from('politicas_clasificacion_cartera')
      .insert({
        tenant_id: tenant.id,
        version: 2,
        estado: 'borrador',
        nombre: 'Otra política',
        policy_hash: `test-fixture-cobranza-v2-${tenant.id}`,
      })
      .select('id')
      .single<{ id: string }>()
    if (errOtra) throw new Error(`fixture otra politica: ${errOtra.message}`)

    const { error } = await admin.from('estrategias_cobranza').insert({
      tenant_id: tenant.id,
      politica_id: otraPolitica.id,
      tramo_id: tramoAlDiaId, // pertenece a `politicaId`, no a `otraPolitica`
      codigo: 'CRUZADA',
      nombre: 'Estrategia con tramo ajeno',
      tipo_accion: 'email',
      canal: 'email',
      orden: 0,
    })

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/ESTRATEGIA_COBRANZA_TRAMO_AJENO/)
  })

  function datosAccion(overrides: Partial<DatosAccionCobranza> = {}): DatosAccionCobranza {
    return {
      tenantId: tenant.id,
      inmuebleId,
      estrategiaId,
      tipoAccion: 'email',
      canal: 'email',
      fechaProgramada: '2026-08-20',
      clasificacionCodigo: 'MORA',
      politicaClasificacionId: politicaId,
      politicaVersion: 1,
      diasMoraAlMomento: 5,
      deudaTotalAlMomento: '150000',
      alcance: 'inmueble',
      cargoId: null,
      destinatarioTerceroId: terceroId,
      destinatarioRolCodigo: 'copropietario',
      destinatarioContacto: 'ana.gomez@example.test',
      intentoNumero: 1,
      creadaPor: 'job',
      estado: 'programada',
      ...overrides,
    }
  }

  it('registrarAccionCobranza + obtenerHistorialAccionesCobranza: roundtrip completo', async () => {
    const id = await registrarAccionCobranza(admin, datosAccion())
    expect(id).toBeTruthy()

    const historial = await obtenerHistorialAccionesCobranza(admin, { tenantId: tenant.id, inmuebleId })
    expect(historial).toContainEqual({
      estrategiaId,
      estado: 'programada',
      fechaProgramada: '2026-08-20',
    })
  })

  it('ACCION_COBRANZA_CONTEXTO_INMUTABLE (REC-CAR-012): el contexto congelado no admite UPDATE', async () => {
    const id = await registrarAccionCobranza(admin, datosAccion({ fechaProgramada: '2026-08-21' }))

    const { error } = await admin
      .from('acciones_cobranza')
      .update({ clasificacion_codigo: 'ALTO_RIESGO' })
      .eq('id', id)

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/ACCION_COBRANZA_CONTEXTO_INMUTABLE/)
  })

  it('control positivo: estado sí se puede actualizar siguiendo la máquina de estados (CAR §10.1)', async () => {
    const id = await registrarAccionCobranza(admin, datosAccion({ fechaProgramada: '2026-08-22' }))

    const { error: errEjecutando } = await admin
      .from('acciones_cobranza')
      .update({ estado: 'ejecutando' })
      .eq('id', id)
    expect(errEjecutando).toBeNull()

    const { error } = await admin.from('acciones_cobranza').update({ estado: 'ejecutada' }).eq('id', id)
    expect(error).toBeNull()

    const { data: fila } = await admin
      .from('acciones_cobranza')
      .select('estado')
      .eq('id', id)
      .single<{ estado: string }>()
    expect(fila?.estado).toBe('ejecutada')
  })
})
