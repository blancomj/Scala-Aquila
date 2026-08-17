/**
 * certificaciones_deuda / casos_juridicos / caso_juridico_actuaciones /
 * costas_judiciales — CAR F7 (Docs/Motor de gestion de cartera/
 * CAR_00_Guia_Oficial.md §15-16). Certificación y remisión a jurídico
 * exigen rol administrador explícito (firmante identificado, art. 48);
 * cerrar un caso también. El resto (progreso de estado, actuaciones,
 * costas) lo maneja cualquier agent — sin matriz de transiciones rígida
 * para estado_caso_juridico_t/estado_costa_t (decisión deliberada, ver
 * cabecera de 20260822340000_cartera_juridico.sql).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  clienteAdmin,
  clienteComo,
  crearMembership,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  RUN_ID,
  type Cliente,
  type TenantPrueba,
  type UsuarioPrueba,
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

if (!env) {
  console.warn('SALTADO tests/rls/cartera-juridico: faltan variables de Supabase en .env')
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

async function crearInmueble(admin: Cliente, tenantId: string, prefijo: string): Promise<string> {
  const tipoInmuebleId = await listaTipoId(admin, 'TIPO_INMUEBLE', 'apartamento')
  const { data, error } = await admin
    .from('inmuebles')
    .insert({ tenant_id: tenantId, codigo: `${prefijo}-${String(Date.now())}`, tipo_id: tipoInmuebleId })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture inmueble: ${error.message}`)
  return data.id
}

async function crearPoliticaFinancieraVigente(admin: Cliente, tenantId: string): Promise<string> {
  const { data, error } = await admin
    .from('politicas_financieras')
    .insert({
      tenant_id: tenantId,
      version: 1,
      estado: 'vigente',
      vigente_desde: '2026-01-01',
      redondeo_modo: 'half_up',
      redondeo_escala: 0,
      residual_metodo: 'mayor_resto',
      coeficientes_suma_esperada: 1,
      policy_hash: `test-fixture-hash-${RUN_ID}-${tenantId}`,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`fixture politica_financiera: ${error.message}`)
  return data.id
}

d('CAR F7 — jurídico (§15-16)', () => {
  let admin: Cliente
  let agente: UsuarioPrueba
  let administrador: UsuarioPrueba
  let administradorDos: UsuarioPrueba
  let tenant: TenantPrueba
  let inmuebleId: string
  let politicaId: string
  let consecutivoContador = 0

  beforeAll(async () => {
    admin = clienteAdmin(env!)
    agente = await crearUsuario(admin, 'jur-agent')
    administrador = await crearUsuario(admin, 'jur-admin1')
    administradorDos = await crearUsuario(admin, 'jur-admin2')
    tenant = await crearTenant(admin, 'jur', agente.id)
    await crearMembership(admin, tenant.id, agente.id, 'agent')
    await crearMembership(admin, tenant.id, administrador.id, 'administrador')
    await crearMembership(admin, tenant.id, administradorDos.id, 'administrador')
    inmuebleId = await crearInmueble(admin, tenant.id, 'JUR')
    politicaId = await crearPoliticaFinancieraVigente(admin, tenant.id)
  })

  afterAll(async () => {
    await eliminarTenant(admin, tenant.id)
    await eliminarUsuario(admin, agente.id)
    await eliminarUsuario(admin, administrador.id)
    await eliminarUsuario(admin, administradorDos.id)
  })

  function payloadCertificacion(overrides: Record<string, unknown> = {}) {
    consecutivoContador += 1
    return {
      tenant_id: tenant.id,
      inmueble_id: inmuebleId,
      consecutivo: `CERT-TEST-${String(consecutivoContador)}`,
      fecha_expedicion: '2026-08-17',
      fecha_corte: '2026-08-01',
      monto_expensas_ordinarias: 500000,
      monto_expensas_extraordinarias: 0,
      monto_intereses_mora: 30000,
      monto_sanciones: 0,
      monto_otros: 0,
      monto_total: 530000,
      detalle_cargos: [{ cargoId: 'fixture', categoria: 'capital', saldoPendiente: '500000' }],
      politica_financiera_id: politicaId,
      politica_version: 1,
      cargo_firmante: 'Administrador',
      certificacion_hash: `test-fixture-hash-${String(consecutivoContador)}`,
      ...overrides,
    }
  }

  async function crearCertificacionVigente(): Promise<string> {
    const clienteAdministrador = await clienteComo(env!, administrador)
    const { data, error } = await clienteAdministrador
      .from('certificaciones_deuda')
      .insert(payloadCertificacion())
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`fixture certificacion vigente: ${error.message}`)
    return data.id
  }

  describe('certificaciones_deuda', () => {
    it('CERTIFICACION_REQUIERE_ADMINISTRADOR: un agent simple no puede expedir una certificación', async () => {
      const clienteAgente = await clienteComo(env!, agente)
      const { error } = await clienteAgente.from('certificaciones_deuda').insert(payloadCertificacion())
      expect(error).not.toBeNull()
      expect(error?.message).toMatch(/CERTIFICACION_REQUIERE_ADMINISTRADOR/)
    })

    it('control positivo: un administrador expide la certificación — expedida_por queda estampado desde auth.uid()', async () => {
      const clienteAdministrador = await clienteComo(env!, administrador)
      const { data, error } = await clienteAdministrador
        .from('certificaciones_deuda')
        .insert(payloadCertificacion())
        .select('estado, expedida_por')
        .single()
      expect(error).toBeNull()
      expect(data?.estado).toBe('vigente')
      expect(data?.expedida_por).toBe(administrador.id)
    })

    it('certificacion_monto_total_positivo: rechaza una certificación en cero', async () => {
      const clienteAdministrador = await clienteComo(env!, administrador)
      const { error } = await clienteAdministrador.from('certificaciones_deuda').insert(
        payloadCertificacion({
          monto_expensas_ordinarias: 0,
          monto_intereses_mora: 0,
          monto_total: 0,
        }),
      )
      expect(error).not.toBeNull()
      expect(error?.message).toMatch(/certificacion_monto_total_positivo/)
    })

    it('certificacion_total_coherente: rechaza un total que no cuadra con el desglose', async () => {
      const clienteAdministrador = await clienteComo(env!, administrador)
      const { error } = await clienteAdministrador
        .from('certificaciones_deuda')
        .insert(payloadCertificacion({ monto_total: 999999 }))
      expect(error).not.toBeNull()
      expect(error?.message).toMatch(/certificacion_total_coherente/)
    })

    it('CERTIFICACION_INMUTABLE: no se puede modificar el contenido de una certificación vigente', async () => {
      const clienteAdministrador = await clienteComo(env!, administrador)
      const { data: cert } = await clienteAdministrador
        .from('certificaciones_deuda')
        .insert(payloadCertificacion())
        .select('id')
        .single<{ id: string }>()

      const { error } = await clienteAdministrador
        .from('certificaciones_deuda')
        .update({ monto_total: 1 })
        .eq('id', cert!.id)
      expect(error).not.toBeNull()
      expect(error?.message).toMatch(/CERTIFICACION_INMUTABLE/)
    })

    it('CERTIFICACION_ANULACION_SIN_MOTIVO: anular exige explicar el motivo', async () => {
      const clienteAdministrador = await clienteComo(env!, administrador)
      const { data: cert } = await clienteAdministrador
        .from('certificaciones_deuda')
        .insert(payloadCertificacion())
        .select('id')
        .single<{ id: string }>()

      const { error } = await clienteAdministrador
        .from('certificaciones_deuda')
        .update({ estado: 'anulada' })
        .eq('id', cert!.id)
      expect(error).not.toBeNull()
      expect(error?.message).toMatch(/CERTIFICACION_ANULACION_SIN_MOTIVO/)
    })

    it('control positivo: anular con motivo deja estado=anulada y anulada_por/at estampados', async () => {
      const clienteAdministrador = await clienteComo(env!, administrador)
      const { data: cert } = await clienteAdministrador
        .from('certificaciones_deuda')
        .insert(payloadCertificacion())
        .select('id')
        .single<{ id: string }>()

      const { data, error } = await clienteAdministrador
        .from('certificaciones_deuda')
        .update({ estado: 'anulada', anulada_motivo: 'Error en el monto de intereses' })
        .eq('id', cert!.id)
        .select('estado, anulada_por, anulada_at, anulada_motivo')
        .single()
      expect(error).toBeNull()
      expect(data?.estado).toBe('anulada')
      expect(data?.anulada_por).toBe(administrador.id)
      expect(data?.anulada_at).not.toBeNull()

      // CERTIFICACION_INMUTABLE: ya anulada, ni siquiera se puede cambiar el motivo.
      const { error: errorSegundaAnulacion } = await clienteAdministrador
        .from('certificaciones_deuda')
        .update({ estado: 'anulada', anulada_motivo: 'otra vez' })
        .eq('id', cert!.id)
      expect(errorSegundaAnulacion).not.toBeNull()
      expect(errorSegundaAnulacion?.message).toMatch(/CERTIFICACION_INMUTABLE/)
    })
  })

  describe('casos_juridicos', () => {
    function payloadCaso(certificacionId: string, overrides: Record<string, unknown> = {}) {
      consecutivoContador += 1
      return {
        tenant_id: tenant.id,
        inmueble_id: inmuebleId,
        consecutivo: `CASO-TEST-${String(consecutivoContador)}`,
        certificacion_id: certificacionId,
        fecha_remision: '2026-08-17',
        monto_pretension: 530000,
        fecha_pretension: '2026-08-17',
        ...overrides,
      }
    }

    it('CASO_JURIDICO_REQUIERE_ADMINISTRADOR: un agent simple no puede remitir un caso a jurídico', async () => {
      const certId = await crearCertificacionVigente()
      const clienteAgente = await clienteComo(env!, agente)
      const { error } = await clienteAgente.from('casos_juridicos').insert(payloadCaso(certId))
      expect(error).not.toBeNull()
      expect(error?.message).toMatch(/CASO_JURIDICO_REQUIERE_ADMINISTRADOR/)
    })

    it('CASO_JURIDICO_CERTIFICACION_INVALIDA: no se puede abrir un caso sobre una certificación anulada', async () => {
      const clienteAdministrador = await clienteComo(env!, administrador)
      const { data: cert } = await clienteAdministrador
        .from('certificaciones_deuda')
        .insert(payloadCertificacion())
        .select('id')
        .single<{ id: string }>()
      await clienteAdministrador
        .from('certificaciones_deuda')
        .update({ estado: 'anulada', anulada_motivo: 'para la prueba' })
        .eq('id', cert!.id)

      const { error } = await clienteAdministrador.from('casos_juridicos').insert(payloadCaso(cert!.id))
      expect(error).not.toBeNull()
      expect(error?.message).toMatch(/CASO_JURIDICO_CERTIFICACION_INVALIDA/)
    })

    it('control positivo: un administrador remite el caso — aprobado_por/at quedan estampados', async () => {
      const certId = await crearCertificacionVigente()
      const clienteAdministrador = await clienteComo(env!, administrador)
      const { data, error } = await clienteAdministrador
        .from('casos_juridicos')
        .insert(payloadCaso(certId))
        .select('estado, aprobado_por, aprobado_at')
        .single()
      expect(error).toBeNull()
      expect(data?.estado).toBe('remitido')
      expect(data?.aprobado_por).toBe(administrador.id)
      expect(data?.aprobado_at).not.toBeNull()
    })

    it('CASO_JURIDICO_ABOGADO_INVALIDO: rechaza un tercero sin rol de abogado vigente', async () => {
      const certId = await crearCertificacionVigente()
      const tipoIdentCedula = await listaTipoId(admin, 'TIPO_IDENTIFICACION', 'cedula')
      const estadoActivo = await listaTipoId(admin, 'ESTADO_TERCERO', 'activo')
      const { data: tercero, error: errorTercero } = await admin
        .from('terceros')
        .insert({
          tenant_id: tenant.id,
          tipo_identificacion_id: tipoIdentCedula,
          numero_documento: `JUR-${String(Date.now())}`,
          tipo_persona: 'natural',
          primer_nombre: 'Fulano',
          primer_apellido: 'De Tal',
          estado_id: estadoActivo,
        })
        .select('id')
        .single<{ id: string }>()
      if (errorTercero) throw new Error(`fixture tercero: ${errorTercero.message}`)

      const clienteAdministrador = await clienteComo(env!, administrador)
      const { error } = await clienteAdministrador
        .from('casos_juridicos')
        .insert(payloadCaso(certId, { abogado_tercero_id: tercero.id }))
      expect(error).not.toBeNull()
      expect(error?.message).toMatch(/CASO_JURIDICO_ABOGADO_INVALIDO/)
    })

    it('control positivo: un abogado con rol vigente sí puede asignarse al caso', async () => {
      const certId = await crearCertificacionVigente()
      const tipoIdentCedula = await listaTipoId(admin, 'TIPO_IDENTIFICACION', 'cedula')
      const estadoActivo = await listaTipoId(admin, 'ESTADO_TERCERO', 'activo')
      const { data: tercero, error: errorTercero } = await admin
        .from('terceros')
        .insert({
          tenant_id: tenant.id,
          tipo_identificacion_id: tipoIdentCedula,
          numero_documento: `JUR-AB-${String(Date.now())}`,
          tipo_persona: 'natural',
          primer_nombre: 'Abogada',
          primer_apellido: 'De Prueba',
          estado_id: estadoActivo,
        })
        .select('id')
        .single<{ id: string }>()
      if (errorTercero) throw new Error(`fixture tercero: ${errorTercero.message}`)

      const rolAbogadoId = await listaTipoId(admin, 'PERSONA_COPROPIEDAD', 'abogado')
      const { error: errorRol } = await admin
        .from('tenant_tercero_rol')
        .insert({ tenant_id: tenant.id, tercero_id: tercero.id, rol_id: rolAbogadoId, vigente_desde: '2026-01-01' })
      if (errorRol) throw new Error(`fixture tenant_tercero_rol: ${errorRol.message}`)

      const clienteAdministrador = await clienteComo(env!, administrador)
      const { data, error } = await clienteAdministrador
        .from('casos_juridicos')
        .insert(payloadCaso(certId, { abogado_tercero_id: tercero.id }))
        .select('abogado_tercero_id')
        .single()
      expect(error).toBeNull()
      expect(data?.abogado_tercero_id).toBe(tercero.id)
    })

    it('un agent simple sí puede avanzar el estado del trámite (sin cerrar el caso)', async () => {
      const certId = await crearCertificacionVigente()
      const clienteAdministrador = await clienteComo(env!, administrador)
      const { data: caso } = await clienteAdministrador
        .from('casos_juridicos')
        .insert(payloadCaso(certId))
        .select('id')
        .single<{ id: string }>()

      const clienteAgente = await clienteComo(env!, agente)
      const { data, error } = await clienteAgente
        .from('casos_juridicos')
        .update({ estado: 'radicado', numero_radicado: '2026-00123' })
        .eq('id', caso!.id)
        .select('estado')
        .single()
      expect(error).toBeNull()
      expect(data?.estado).toBe('radicado')
    })

    it('CASO_JURIDICO_CIERRE_REQUIERE_ADMINISTRADOR: un agent simple no puede cerrar el caso', async () => {
      const certId = await crearCertificacionVigente()
      const clienteAdministrador = await clienteComo(env!, administrador)
      const { data: caso } = await clienteAdministrador
        .from('casos_juridicos')
        .insert(payloadCaso(certId))
        .select('id')
        .single<{ id: string }>()

      const clienteAgente = await clienteComo(env!, agente)
      const { error } = await clienteAgente
        .from('casos_juridicos')
        .update({ estado: 'terminado', fecha_cierre: '2026-09-01', motivo_cierre: 'pago total' })
        .eq('id', caso!.id)
      expect(error).not.toBeNull()
      expect(error?.message).toMatch(/CASO_JURIDICO_CIERRE_REQUIERE_ADMINISTRADOR/)
    })

    it('caso_cierre_coherente: un estado terminal sin fecha_cierre se rechaza incluso para un administrador', async () => {
      const certId = await crearCertificacionVigente()
      const clienteAdministrador = await clienteComo(env!, administrador)
      const { data: caso } = await clienteAdministrador
        .from('casos_juridicos')
        .insert(payloadCaso(certId))
        .select('id')
        .single<{ id: string }>()

      const { error } = await clienteAdministrador
        .from('casos_juridicos')
        .update({ estado: 'terminado' })
        .eq('id', caso!.id)
      expect(error).not.toBeNull()
      expect(error?.message).toMatch(/caso_cierre_coherente/)
    })

    it('control positivo: un administrador distinto también puede cerrar el caso', async () => {
      const certId = await crearCertificacionVigente()
      const clienteAdministrador = await clienteComo(env!, administrador)
      const { data: caso } = await clienteAdministrador
        .from('casos_juridicos')
        .insert(payloadCaso(certId))
        .select('id')
        .single<{ id: string }>()

      const clienteAdministradorDos = await clienteComo(env!, administradorDos)
      const { data, error } = await clienteAdministradorDos
        .from('casos_juridicos')
        .update({ estado: 'terminado', fecha_cierre: '2026-09-01', motivo_cierre: 'pago total' })
        .eq('id', caso!.id)
        .select('estado, fecha_cierre')
        .single()
      expect(error).toBeNull()
      expect(data?.estado).toBe('terminado')
    })

    it('CASO_JURIDICO_CONTEXTO_INMUTABLE: no se puede reasignar el caso a otro inmueble', async () => {
      const certId = await crearCertificacionVigente()
      const otroInmuebleId = await crearInmueble(admin, tenant.id, 'JUR')
      const clienteAdministrador = await clienteComo(env!, administrador)
      const { data: caso } = await clienteAdministrador
        .from('casos_juridicos')
        .insert(payloadCaso(certId))
        .select('id')
        .single<{ id: string }>()

      const { error } = await clienteAdministrador
        .from('casos_juridicos')
        .update({ inmueble_id: otroInmuebleId })
        .eq('id', caso!.id)
      expect(error).not.toBeNull()
      expect(error?.message).toMatch(/CASO_JURIDICO_CONTEXTO_INMUTABLE/)
    })
  })

  describe('caso_juridico_actuaciones', () => {
    it('agent registra una actuación — registrada_por queda estampado desde auth.uid(), append-only', async () => {
      const certId = await crearCertificacionVigente()
      const clienteAdministrador = await clienteComo(env!, administrador)
      const { data: caso } = await clienteAdministrador
        .from('casos_juridicos')
        .insert({
          tenant_id: tenant.id,
          inmueble_id: inmuebleId,
          consecutivo: `CASO-ACT-${String(Date.now())}`,
          certificacion_id: certId,
          fecha_remision: '2026-08-17',
          monto_pretension: 530000,
          fecha_pretension: '2026-08-17',
        })
        .select('id')
        .single<{ id: string }>()

      const tipoActuacionId = await listaTipoId(admin, 'TIPO_ACTUACION_JURIDICA', 'memorial')
      const clienteAgente = await clienteComo(env!, agente)
      const { data: actuacion, error } = await clienteAgente
        .from('caso_juridico_actuaciones')
        .insert({
          tenant_id: tenant.id,
          caso_id: caso!.id,
          fecha: '2026-08-18',
          tipo_actuacion_id: tipoActuacionId,
          descripcion: 'Se presentó memorial de reconocimiento de personería',
        })
        .select('id, registrada_por')
        .single()
      expect(error).toBeNull()
      expect(actuacion?.registrada_por).toBe(agente.id)

      // Sin política UPDATE/DELETE para authenticated (mismo patrón que
      // novedades.test.ts): RLS deja la fila fuera de la vista editable,
      // sin error — 0 filas afectadas, no una excepción.
      const { data: dataUpdate, error: errorUpdate } = await clienteAgente
        .from('caso_juridico_actuaciones')
        .update({ descripcion: 'editado' })
        .eq('id', actuacion!.id)
        .select()
      expect(errorUpdate).toBeNull()
      expect(dataUpdate).toHaveLength(0)

      const { data: dataDelete, error: errorDelete } = await clienteAgente
        .from('caso_juridico_actuaciones')
        .delete()
        .eq('id', actuacion!.id)
        .select()
      expect(errorDelete).toBeNull()
      expect(dataDelete).toHaveLength(0)

      // control positivo: la fila sigue existiendo, sin modificar (append-only real).
      const { data: filaFinal } = await admin
        .from('caso_juridico_actuaciones')
        .select('descripcion')
        .eq('id', actuacion!.id)
        .single()
      expect(filaFinal?.descripcion).toBe('Se presentó memorial de reconocimiento de personería')
    })
  })

  describe('costas_judiciales', () => {
    async function crearCasoParaCostas(): Promise<string> {
      const certId = await crearCertificacionVigente()
      const clienteAdministrador = await clienteComo(env!, administrador)
      const { data: caso } = await clienteAdministrador
        .from('casos_juridicos')
        .insert({
          tenant_id: tenant.id,
          inmueble_id: inmuebleId,
          consecutivo: `CASO-COSTA-${String(Date.now())}`,
          certificacion_id: certId,
          fecha_remision: '2026-08-17',
          monto_pretension: 530000,
          fecha_pretension: '2026-08-17',
        })
        .select('id')
        .single<{ id: string }>()
      return caso!.id
    }

    it('agent registra una costa con evidencia obligatoria (I-C11)', async () => {
      const casoId = await crearCasoParaCostas()
      const clienteAgente = await clienteComo(env!, agente)
      const { data, error } = await clienteAgente
        .from('costas_judiciales')
        .insert({
          tenant_id: tenant.id,
          caso_id: casoId,
          tipo_costa: 'agencias_en_derecho',
          monto: 100000,
          documento_fuente: 'Auto de liquidación de costas No. 45',
          fecha_decision: '2026-09-01',
          autoridad: 'Juzgado 12 Civil Municipal',
        })
        .select('id, estado, registrada_por')
        .single()
      expect(error).toBeNull()
      expect(data?.estado).toBe('liquidada')
      expect(data?.registrada_por).toBe(agente.id)
    })

    it('COSTA_JUDICIAL_INMUTABLE: no se puede modificar el monto o la evidencia', async () => {
      const casoId = await crearCasoParaCostas()
      const clienteAgente = await clienteComo(env!, agente)
      const { data: costa } = await clienteAgente
        .from('costas_judiciales')
        .insert({
          tenant_id: tenant.id,
          caso_id: casoId,
          tipo_costa: 'gasto_proceso',
          monto: 50000,
          documento_fuente: 'Recibo de consignación',
          fecha_decision: '2026-09-01',
          autoridad: 'Juzgado 12 Civil Municipal',
        })
        .select('id')
        .single<{ id: string }>()

      const { error } = await clienteAgente.from('costas_judiciales').update({ monto: 1 }).eq('id', costa!.id)
      expect(error).not.toBeNull()
      expect(error?.message).toMatch(/COSTA_JUDICIAL_INMUTABLE/)
    })

    it('control positivo: estado y monto_recuperado sí se pueden actualizar', async () => {
      const casoId = await crearCasoParaCostas()
      const clienteAgente = await clienteComo(env!, agente)
      const { data: costa } = await clienteAgente
        .from('costas_judiciales')
        .insert({
          tenant_id: tenant.id,
          caso_id: casoId,
          tipo_costa: 'honorario_auxiliar',
          monto: 200000,
          documento_fuente: 'Auto que fija honorarios del secuestre',
          fecha_decision: '2026-09-01',
          autoridad: 'Juzgado 12 Civil Municipal',
        })
        .select('id')
        .single<{ id: string }>()

      const { data, error } = await clienteAgente
        .from('costas_judiciales')
        .update({ estado: 'recuperada', monto_recuperado: 200000 })
        .eq('id', costa!.id)
        .select('estado, monto_recuperado')
        .single()
      expect(error).toBeNull()
      expect(data?.estado).toBe('recuperada')
      expect(data?.monto_recuperado).toBe(200000)
    })
  })
})
