/**
 * Conceptos/fórmulas AEL — última pieza sin UI del DoD de F6 ("UI de
 * conceptos y fórmulas", PLAN §5). Lectura/escritura directa por RLS
 * (`conceptos_insert_agent`/`_update_agent`); `conceptos_update_agent` no
 * cambió en Fase 4 — es `guard_concepto_transicion()` (trigger) quien
 * impone las reglas nuevas encima de esa RLS permisiva.
 *
 * AEL-004 Fase 3: cada crear/actualizar también inserta una fila en
 * `concepto_versiones` (historial append-only, `version` la asigna el
 * servidor). `hashPlaceholder` es el mismo patrón exacto de
 * `politicaFinanciera.ts` — SHA-256 sobre JSON canónico de los campos
 * enviados, explícitamente NO el hash canónico de 19§73.
 *
 * AEL-004 Fase 4 (maker-checker, Doc 10 §62/§65/§216): `estado` gana
 * `en_revision` entre `borrador` y `activo`. El contenido
 * (`nombre`/`tipo_base`/`modo_calculo`/`formula_ael`/`prioridad`) solo se
 * puede editar en `borrador` — `guard_concepto_transicion()` rechaza
 * cualquier otro caso con `CONCEPTO_INMUTABLE`. La transición
 * `en_revision→activo` falla con `SELF_APPROVAL` si el aprobador es quien
 * envió la solicitud — ambos errores llegan tal cual en `error.message`,
 * sin traducir (mismo criterio que `APPEND_ONLY` en otras tablas).
 */
import { defineStore } from 'pinia'
import type { Database } from '@aquila/shared'
import type { Tipo } from '@aquila/ael-core'
import { extraerErrorFuncion } from '~/utils/edge-function-error'
import type { EntradaMock, ValorMock } from '~/utils/ael-test-runner'

type ConceptoRow = Database['public']['Tables']['conceptos']['Row']
type ConceptoTipoBase = Database['public']['Enums']['concepto_tipo_base_t']
type ConceptoModoCalculo = Database['public']['Enums']['concepto_modo_calculo_t']
type ConceptoEstado = Database['public']['Enums']['concepto_estado_t']
type ConceptoVersionRow = Database['public']['Tables']['concepto_versiones']['Row']
type ConceptoTestCaseRow = Database['public']['Tables']['concepto_test_cases']['Row']
type JsonColumna = Database['public']['Tables']['concepto_test_cases']['Row']['entradas']

/** Vista tipada de una fila cruda: `entradas`/`resultado_esperado` llegan
 * como `Json` (jsonb) — aquí se recuperan como los ValorMock/EntradaMock
 * reales que el propio store escribió (ael-test-runner.ts::ValorMock). */
export interface CasoPrueba {
  readonly id: string
  readonly conceptoId: string
  readonly nombre: string
  readonly entradas: readonly EntradaMock[]
  readonly tipoEsperado: Tipo
  readonly resultadoEsperado: ValorMock | null
  readonly createdAt: string
}

function casoPruebaDesdeFila(fila: ConceptoTestCaseRow): CasoPrueba {
  return {
    id: fila.id,
    conceptoId: fila.concepto_id,
    nombre: fila.nombre,
    entradas: (fila.entradas ?? []) as unknown as readonly EntradaMock[],
    tipoEsperado: fila.tipo_esperado as Tipo,
    resultadoEsperado: (fila.resultado_esperado ?? null) as unknown as ValorMock | null,
    createdAt: fila.created_at,
  }
}

async function hashPlaceholder(valores: Record<string, unknown>): Promise<string> {
  const canonico = JSON.stringify(valores, Object.keys(valores).sort())
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonico))
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export interface DiagnosticoPrueba {
  readonly codigo: string
  readonly mensaje: string
  readonly linea: number
  readonly columna: number
}

export interface ResultadoPruebaFormula {
  readonly valido: boolean
  readonly resultado: string | boolean | null
  readonly tipo: string | null
  readonly diagnosticos: readonly DiagnosticoPrueba[]
}

export const useConceptoStore = defineStore('concepto', () => {
  const conceptos = shallowRef<ConceptoRow[]>([])
  const versiones = shallowRef<ConceptoVersionRow[]>([])
  const casosPrueba = shallowRef<CasoPrueba[]>([])
  const loading = ref(false)

  async function registrarVersion(concepto: ConceptoRow): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const {
      data: { user: usuario },
    } = await cliente.auth.getUser()
    const creadoPor = usuario?.id
    if (!creadoPor) return

    const campos = {
      nombre: concepto.nombre,
      tipo_base: concepto.tipo_base,
      modo_calculo: concepto.modo_calculo,
      formula_ael: concepto.formula_ael,
      prioridad: concepto.prioridad,
      estado_concepto: concepto.estado,
    }

    const { error: errorVersion } = await cliente.from('concepto_versiones').insert({
      tenant_id: concepto.tenant_id,
      concepto_id: concepto.id,
      created_by: creadoPor,
      hash: await hashPlaceholder(campos),
      ...campos,
    })
    if (errorVersion) throw errorVersion
  }

  async function cargarVersiones(conceptoId: string): Promise<ConceptoVersionRow[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorVersiones } = await cliente
      .from('concepto_versiones')
      .select('*')
      .eq('concepto_id', conceptoId)
      .order('version', { ascending: false })
    if (errorVersiones) throw errorVersiones
    versiones.value = data ?? []
    return versiones.value
  }

  async function cargarConceptos(tenantId: string): Promise<ConceptoRow[]> {
    loading.value = true
    try {
      const cliente = useSupabaseClient<Database>()
      const { data, error: errorConceptos } = await cliente
        .from('conceptos')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('prioridad')
      if (errorConceptos) throw errorConceptos
      conceptos.value = data ?? []
      return conceptos.value
    } finally {
      loading.value = false
    }
  }

  async function crearConcepto(params: {
    tenantId: string
    codigo: string
    nombre: string
    tipoBase: ConceptoTipoBase
    modoCalculo: ConceptoModoCalculo
    formulaAel: string
    prioridad: number
  }): Promise<ConceptoRow> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorInsert } = await cliente
      .from('conceptos')
      .insert({
        tenant_id: params.tenantId,
        codigo: params.codigo,
        nombre: params.nombre,
        tipo_base: params.tipoBase,
        modo_calculo: params.modoCalculo,
        formula_ael: params.formulaAel,
        prioridad: params.prioridad,
      })
      .select('*')
      .single()
    if (errorInsert) throw errorInsert

    await registrarVersion(data)
    await cargarConceptos(params.tenantId)
    return data
  }

  async function actualizarConcepto(params: {
    id: string
    tenantId: string
    nombre: string
    tipoBase: ConceptoTipoBase
    modoCalculo: ConceptoModoCalculo
    formulaAel: string
    prioridad: number
  }): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorUpdate } = await cliente
      .from('conceptos')
      .update({
        nombre: params.nombre,
        tipo_base: params.tipoBase,
        modo_calculo: params.modoCalculo,
        formula_ael: params.formulaAel,
        prioridad: params.prioridad,
      })
      .eq('id', params.id)
      .select('*')
      .single()
    if (errorUpdate) throw errorUpdate

    await registrarVersion(data)
    await cargarConceptos(params.tenantId)
  }

  async function cambiarEstado(
    id: string,
    estado: ConceptoEstado,
    tenantId: string,
  ): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorUpdate } = await cliente.from('conceptos').update({ estado }).eq('id', id)
    if (errorUpdate) throw errorUpdate

    await cargarConceptos(tenantId)
  }

  // ── maker-checker (AEL-004 Fase 4) — guard_concepto_transicion asigna
  // enviado_a_revision_por/aprobado_por en el servidor y rechaza
  // self-approval/transiciones inválidas/ediciones fuera de borrador; estas
  // acciones solo envían el cambio de estado, sin lógica de permisos aquí.
  async function enviarARevision(id: string, tenantId: string): Promise<void> {
    await cambiarEstado(id, 'en_revision', tenantId)
  }

  async function aprobarConcepto(id: string, tenantId: string): Promise<void> {
    await cambiarEstado(id, 'activo', tenantId)
  }

  async function rechazarConcepto(id: string, tenantId: string, motivo: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorUpdate } = await cliente
      .from('conceptos')
      .update({ estado: 'borrador', rechazado_motivo: motivo })
      .eq('id', id)
    if (errorUpdate) throw errorUpdate

    await cargarConceptos(tenantId)
  }

  async function volverABorrador(id: string, tenantId: string): Promise<void> {
    await cambiarEstado(id, 'borrador', tenantId)
  }

  async function probarFormula(params: {
    tenantId: string
    inmuebleId: string
    periodoId: string
    formulaAel: string
  }): Promise<ResultadoPruebaFormula> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorFuncion } = await cliente.functions.invoke<ResultadoPruebaFormula>(
      'probar-formula',
      {
        body: {
          tenant_id: params.tenantId,
          inmueble_id: params.inmuebleId,
          periodo_id: params.periodoId,
          formula_ael: params.formulaAel,
        },
      },
    )
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('probar-formula no devolvió datos.')
    return data
  }

  // ── casos de prueba (AEL-004 Fase 6) — CRUD directo por RLS, sin
  // historial: a diferencia de concepto_versiones, un caso de prueba es un
  // fixture que se edita/borra con normalidad (ver 20260819100000).
  async function cargarCasosPrueba(conceptoId: string): Promise<CasoPrueba[]> {
    const cliente = useSupabaseClient<Database>()
    const { data, error: errorCasos } = await cliente
      .from('concepto_test_cases')
      .select('*')
      .eq('concepto_id', conceptoId)
      .order('created_at', { ascending: true })
    if (errorCasos) throw errorCasos
    casosPrueba.value = (data ?? []).map(casoPruebaDesdeFila)
    return casosPrueba.value
  }

  async function crearCasoPrueba(params: {
    tenantId: string
    conceptoId: string
    nombre: string
    entradas: readonly EntradaMock[]
    tipoEsperado: Tipo
    resultadoEsperado: ValorMock | null
  }): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const {
      data: { user: usuario },
    } = await cliente.auth.getUser()
    if (!usuario) throw new Error('No hay sesión activa.')

    const { error: errorInsert } = await cliente.from('concepto_test_cases').insert({
      tenant_id: params.tenantId,
      concepto_id: params.conceptoId,
      nombre: params.nombre,
      entradas: params.entradas as unknown as JsonColumna,
      tipo_esperado: params.tipoEsperado,
      resultado_esperado: params.resultadoEsperado as unknown as JsonColumna,
      created_by: usuario.id,
    })
    if (errorInsert) throw errorInsert

    await cargarCasosPrueba(params.conceptoId)
  }

  async function actualizarCasoPrueba(params: {
    id: string
    conceptoId: string
    nombre: string
    entradas: readonly EntradaMock[]
    tipoEsperado: Tipo
    resultadoEsperado: ValorMock | null
  }): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorUpdate } = await cliente
      .from('concepto_test_cases')
      .update({
        nombre: params.nombre,
        entradas: params.entradas as unknown as JsonColumna,
        tipo_esperado: params.tipoEsperado,
        resultado_esperado: params.resultadoEsperado as unknown as JsonColumna,
      })
      .eq('id', params.id)
    if (errorUpdate) throw errorUpdate

    await cargarCasosPrueba(params.conceptoId)
  }

  async function eliminarCasoPrueba(id: string, conceptoId: string): Promise<void> {
    const cliente = useSupabaseClient<Database>()
    const { error: errorDelete } = await cliente.from('concepto_test_cases').delete().eq('id', id)
    if (errorDelete) throw errorDelete

    await cargarCasosPrueba(conceptoId)
  }

  function limpiar(): void {
    conceptos.value = []
    versiones.value = []
    casosPrueba.value = []
  }

  return {
    conceptos,
    versiones,
    casosPrueba,
    loading,
    cargarConceptos,
    cargarVersiones,
    crearConcepto,
    actualizarConcepto,
    cambiarEstado,
    enviarARevision,
    aprobarConcepto,
    rechazarConcepto,
    volverABorrador,
    probarFormula,
    cargarCasosPrueba,
    crearCasoPrueba,
    actualizarCasoPrueba,
    eliminarCasoPrueba,
    limpiar,
  }
})
