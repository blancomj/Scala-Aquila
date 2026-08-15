<script setup lang="ts">
// F6 — última pieza sin UI del DoD ("UI de conceptos y fórmulas", PLAN §5).
// Crear/editar conceptos con validación estática de la fórmula AEL en el
// cliente (parsear + analizar, packages/ael-language) antes de guardar —
// feedback inmediato en vez de esperar a que liquidar-periodo lo rechace.
// El catálogo de validación es una aproximación (ver utils/ael-validate.ts);
// la autoridad real sigue siendo liquidar-periodo contra el snapshot real.
import { validarFormulaAel } from '~/utils/ael-validate'
import { catalogoContratosEstatico } from '~/utils/ael-catalogo'
import {
  camposRequeridos,
  ejecutarCasoPrueba,
  type CampoRequerido,
  type EntradaMock,
  type ResultadoCasoPrueba,
  type ValorMock,
} from '~/utils/ael-test-runner'
import type { CasoPrueba, ResultadoPruebaFormula } from '~/stores/concepto'
import type { Tipo } from '@aquila/ael-core'
import type { ModoRedondeo } from '@aquila/financial-kernel'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

// useSupabaseClient() no propaga los errores de Postgrest como instancias
// reales de Error (llegan "aplanados", `excepcion instanceof Error` es
// siempre falso) — confirmado inspeccionando la excepción real de un
// guard_concepto_transicion (SELF_APPROVAL) en el navegador. Duck-typing
// sobre `message` en vez de `instanceof` para que errores como
// SELF_APPROVAL/CONCEPTO_INMUTABLE lleguen al usuario tal cual.
function mensajeError(excepcion: unknown, mensajePorDefecto: string): string {
  if (excepcion instanceof Error) return excepcion.message
  if (
    typeof excepcion === 'object' &&
    excepcion !== null &&
    'message' in excepcion &&
    typeof (excepcion as { message: unknown }).message === 'string'
  ) {
    return (excepcion as { message: string }).message
  }
  return mensajePorDefecto
}

const tenantStore = useTenantStore()
const conceptoStore = useConceptoStore()
const cuentaStore = useCuentaCorrienteStore()
const liquidacionStore = useLiquidacionStore()
const politicaFinancieraStore = usePoliticaFinancieraStore()

const editandoId = ref<string | null>(null)
const codigo = ref('')
const nombre = ref('')
const tipoBase = ref<'fijo' | 'coeficiente' | 'cantidad' | 'porcentaje' | 'saldo'>('coeficiente')
const modoCalculo = ref<'directo' | 'distribucion'>('distribucion')
const formulaAel = ref('')
const prioridad = ref(100)
const guardando = ref(false)
const error = ref<string | null>(null)
const cambiandoEstadoId = ref<string | null>(null)

await useAsyncData('conceptos', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return []
  const [conceptos] = await Promise.all([
    conceptoStore.cargarConceptos(tenantId),
    cuentaStore.cargarInmuebles(tenantId),
    liquidacionStore.cargarPeriodos(tenantId),
    politicaFinancieraStore.cargarPoliticas(tenantId),
  ])
  return conceptos
})

const editorRef = ref<{ irAPosicion: (linea: number, columna: number) => void } | null>(null)

const codigosConceptosExistentes = computed(() =>
  conceptoStore.conceptos.map((c) => c.codigo).filter((c) => c !== codigo.value),
)

const diagnosticosFormula = computed(() => {
  if (!formulaAel.value.trim()) return []
  return validarFormulaAel(formulaAel.value, codigosConceptosExistentes.value)
})

// ── maker-checker (AEL-004 Fase 4) — el contenido solo se edita en
// borrador; guard_concepto_transicion rechaza cualquier otro caso con
// CONCEPTO_INMUTABLE, esto es solo la UX que evita llegar a ese error.
const conceptoEnEdicion = computed(
  () => conceptoStore.conceptos.find((c) => c.id === editandoId.value) ?? null,
)
const soloLectura = computed(
  () => conceptoEnEdicion.value !== null && conceptoEnEdicion.value.estado !== 'borrador',
)
const mensajeSoloLectura = computed(() => {
  if (!soloLectura.value || !conceptoEnEdicion.value) return null
  return `Este concepto está en estado "${conceptoEnEdicion.value.estado}" — el contenido es de solo lectura hasta volver a borrador.`
})

// ── historial de versiones + diff visual (AEL-004 Fase 3) ───────────────
const versionCompararA = ref<string | null>(null)
const versionCompararB = ref<string | null>(null)

const versionA = computed(
  () => conceptoStore.versiones.find((v) => v.id === versionCompararA.value) ?? null,
)
const versionB = computed(
  () => conceptoStore.versiones.find((v) => v.id === versionCompararB.value) ?? null,
)

// ── casos de prueba (AEL-004 Fase 6) — ejecución 100% client-side, sin
// Edge Function: ejecutarCasoPrueba() ya encapsula probarFormula() + un
// ExecutionContext mock. moneda/modoRedondeoDinero salen del tenant/de su
// política vigente, igual que usaría liquidar-periodo de verdad.
const moneda = computed(() => tenantStore.activeTenant?.moneda ?? 'COP')

// Mismo mapeo que packages/liquidation-engine/src/snapshot-supabase.ts
// (privado a ese módulo) — tabla de 4 casos sin lógica real que valga la
// pena centralizar entre paquete y app.
function mapearModoRedondeo(modo: 'half_up' | 'half_even' | 'down' | 'up'): ModoRedondeo {
  switch (modo) {
    case 'half_up':
      return 'HALF_UP'
    case 'half_even':
      return 'HALF_EVEN'
    case 'down':
      return 'DOWN'
    case 'up':
      return 'UP'
  }
}

const modoRedondeoDinero = computed<ModoRedondeo>(() => {
  const vigente = politicaFinancieraStore.politicas.find((p) => p.estado === 'vigente')
  return vigente ? mapearModoRedondeo(vigente.redondeo_modo) : 'HALF_UP'
})

const camposFormulaActual = computed<readonly CampoRequerido[]>(() =>
  camposRequeridos(formulaAel.value),
)

function claveCampo(c: CampoRequerido): string {
  return `${c.contrato}.${c.campo}`
}

const nuevoCasoNombre = ref('')
const nuevoCasoTipoEsperado = ref<Tipo>('MONEY')
const nuevoCasoResultado = ref('')
const nuevoCasoResultadoBool = ref(true)
const entradasNuevoCaso = reactive<Record<string, string>>({})
const entradasNuevoCasoBool = reactive<Record<string, boolean>>({})
const errorCasoPrueba = ref<string | null>(null)
const guardandoCaso = ref(false)

function construirValorMock(tipo: Tipo, texto: string, bool: boolean): ValorMock {
  if (tipo === 'NUMBER') return { tipo: 'NUMBER', valor: texto }
  if (tipo === 'MONEY') return { tipo: 'MONEY', valor: texto }
  if (tipo === 'BOOLEAN') return { tipo: 'BOOLEAN', valor: bool }
  return { tipo: 'NULO' }
}

async function guardarCasoPrueba(): Promise<void> {
  errorCasoPrueba.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !editandoId.value || !nuevoCasoNombre.value.trim()) return

  const entradas: EntradaMock[] = camposFormulaActual.value.map((campo) => {
    const clave = claveCampo(campo)
    return {
      contrato: campo.contrato,
      campo: campo.campo,
      valor: construirValorMock(
        campo.tipo,
        entradasNuevoCaso[clave] ?? '',
        entradasNuevoCasoBool[clave] ?? false,
      ),
    }
  })

  const resultadoEsperado =
    nuevoCasoTipoEsperado.value === 'NULO'
      ? null
      : construirValorMock(
          nuevoCasoTipoEsperado.value,
          nuevoCasoResultado.value,
          nuevoCasoResultadoBool.value,
        )

  guardandoCaso.value = true
  try {
    await conceptoStore.crearCasoPrueba({
      tenantId,
      conceptoId: editandoId.value,
      nombre: nuevoCasoNombre.value.trim(),
      entradas,
      tipoEsperado: nuevoCasoTipoEsperado.value,
      resultadoEsperado,
    })
    nuevoCasoNombre.value = ''
    nuevoCasoResultado.value = ''
    for (const clave of Object.keys(entradasNuevoCaso)) entradasNuevoCaso[clave] = ''
  } catch (excepcion) {
    errorCasoPrueba.value = mensajeError(excepcion, 'No se pudo guardar el caso de prueba.')
  } finally {
    guardandoCaso.value = false
  }
}

async function eliminarCaso(caso: CasoPrueba): Promise<void> {
  if (!editandoId.value) return
  try {
    await conceptoStore.eliminarCasoPrueba(caso.id, editandoId.value)
  } catch (excepcion) {
    errorCasoPrueba.value = mensajeError(excepcion, 'No se pudo eliminar el caso de prueba.')
  }
}

const resultadosEjecucion = ref<Record<string, ResultadoCasoPrueba>>({})

const resumenEjecucion = computed(() => {
  const valores = Object.values(resultadosEjecucion.value)
  return {
    total: valores.length,
    passed: valores.filter((r) => r.estado === 'passed').length,
    failed: valores.filter((r) => r.estado === 'failed').length,
  }
})

function ejecutarTodos(): void {
  const catalogo = catalogoContratosEstatico(codigosConceptosExistentes.value)
  const resultados: Record<string, ResultadoCasoPrueba> = {}
  for (const caso of conceptoStore.casosPrueba) {
    resultados[caso.id] = ejecutarCasoPrueba(
      formulaAel.value,
      {
        entradas: caso.entradas,
        tipoEsperado: caso.tipoEsperado,
        resultadoEsperado: caso.resultadoEsperado,
      },
      catalogo,
      moneda.value,
      modoRedondeoDinero.value,
    )
  }
  resultadosEjecucion.value = resultados
}

async function iniciarEdicion(concepto: (typeof conceptoStore.conceptos)[number]): Promise<void> {
  editandoId.value = concepto.id
  codigo.value = concepto.codigo
  nombre.value = concepto.nombre
  tipoBase.value = concepto.tipo_base
  modoCalculo.value = concepto.modo_calculo
  formulaAel.value = concepto.formula_ael ?? ''
  prioridad.value = concepto.prioridad
  error.value = null

  versionCompararA.value = null
  versionCompararB.value = null
  resultadosEjecucion.value = {}
  errorCasoPrueba.value = null
  await Promise.all([
    conceptoStore.cargarVersiones(concepto.id),
    conceptoStore.cargarCasosPrueba(concepto.id),
  ])
}

function cancelarEdicion(): void {
  editandoId.value = null
  codigo.value = ''
  nombre.value = ''
  formulaAel.value = ''
  prioridad.value = 100
  error.value = null
  conceptoStore.versiones = []
  conceptoStore.casosPrueba = []
  versionCompararA.value = null
  versionCompararB.value = null
  resultadosEjecucion.value = {}
  errorCasoPrueba.value = null
}

async function guardar(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !codigo.value || !nombre.value || !formulaAel.value) return
  if (diagnosticosFormula.value.length > 0) {
    error.value = 'La fórmula tiene errores — corrígelos antes de guardar.'
    return
  }

  guardando.value = true
  try {
    if (editandoId.value) {
      await conceptoStore.actualizarConcepto({
        id: editandoId.value,
        tenantId,
        nombre: nombre.value,
        tipoBase: tipoBase.value,
        modoCalculo: modoCalculo.value,
        formulaAel: formulaAel.value,
        prioridad: prioridad.value,
      })
    } else {
      await conceptoStore.crearConcepto({
        tenantId,
        codigo: codigo.value,
        nombre: nombre.value,
        tipoBase: tipoBase.value,
        modoCalculo: modoCalculo.value,
        formulaAel: formulaAel.value,
        prioridad: prioridad.value,
      })
    }
    cancelarEdicion()
  } catch (excepcion) {
    error.value = excepcion instanceof Error ? excepcion.message : 'No se pudo guardar el concepto.'
  } finally {
    guardando.value = false
  }
}

// ── probar fórmula (AEL-004 Fase 1) ─────────────────────────────────────
const inmuebleIdPrueba = ref<string | null>(null)
const periodoIdPrueba = ref<string | null>(null)
const probando = ref(false)
const errorPrueba = ref<string | null>(null)
const resultadoPrueba = ref<ResultadoPruebaFormula | null>(null)

const etiquetaTipo: Record<string, string> = {
  MONEY: 'Dinero',
  NUMBER: 'Número',
  BOOLEAN: 'Verdadero/falso',
}

async function probar(): Promise<void> {
  errorPrueba.value = null
  resultadoPrueba.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !inmuebleIdPrueba.value || !periodoIdPrueba.value || !formulaAel.value) return

  probando.value = true
  try {
    resultadoPrueba.value = await conceptoStore.probarFormula({
      tenantId,
      inmuebleId: inmuebleIdPrueba.value,
      periodoId: periodoIdPrueba.value,
      formulaAel: formulaAel.value,
    })
  } catch (excepcion) {
    errorPrueba.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo probar la fórmula.'
  } finally {
    probando.value = false
  }
}

async function archivar(concepto: (typeof conceptoStore.conceptos)[number]): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  cambiandoEstadoId.value = concepto.id
  try {
    await conceptoStore.cambiarEstado(concepto.id, 'archivado', tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo archivar.')
  } finally {
    cambiandoEstadoId.value = null
  }
}

// ── maker-checker (AEL-004 Fase 4) ──────────────────────────────────────
const motivosRechazo = reactive<Record<string, string>>({})

async function enviarARevision(concepto: (typeof conceptoStore.conceptos)[number]): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  cambiandoEstadoId.value = concepto.id
  try {
    await conceptoStore.enviarARevision(concepto.id, tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo enviar a revisión.')
  } finally {
    cambiandoEstadoId.value = null
  }
}

async function aprobar(concepto: (typeof conceptoStore.conceptos)[number]): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  cambiandoEstadoId.value = concepto.id
  try {
    await conceptoStore.aprobarConcepto(concepto.id, tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo aprobar.')
  } finally {
    cambiandoEstadoId.value = null
  }
}

async function rechazar(concepto: (typeof conceptoStore.conceptos)[number]): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const motivo = motivosRechazo[concepto.id]?.trim()
  if (!tenantId) return
  if (!motivo) {
    error.value = 'Escribe un motivo de rechazo.'
    return
  }

  cambiandoEstadoId.value = concepto.id
  try {
    await conceptoStore.rechazarConcepto(concepto.id, tenantId, motivo)
    motivosRechazo[concepto.id] = ''
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo rechazar.')
  } finally {
    cambiandoEstadoId.value = null
  }
}

async function volverABorrador(concepto: (typeof conceptoStore.conceptos)[number]): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  cambiandoEstadoId.value = concepto.id
  try {
    await conceptoStore.volverABorrador(concepto.id, tenantId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo volver a borrador.')
  } finally {
    cambiandoEstadoId.value = null
  }
}
</script>

<template>
  <div class="space-y-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold mb-2">Conceptos</h1>
        <p class="text-sm text-gray-500">
          Reglas de cálculo AEL — cada una calcula un cargo (CUOTA_ADMIN, intereses, etc). PLAN §5.
        </p>
      </div>
      <NuxtLink to="/conceptos/dependencias" class="text-sm text-primary hover:underline">
        Dependencias e impacto →
      </NuxtLink>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-2">Registrados</h2>
      <p v-if="conceptoStore.conceptos.length === 0" class="text-gray-500 text-sm">Ninguno.</p>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
            <th class="py-1 font-medium">Código</th>
            <th class="py-1 font-medium">Nombre</th>
            <th class="py-1 font-medium">Modo</th>
            <th class="py-1 font-medium">Estado</th>
            <th class="py-1 font-medium" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="concepto in conceptoStore.conceptos"
            :key="concepto.id"
            class="border-b border-gray-100 dark:border-gray-900"
          >
            <td class="py-1.5">{{ concepto.codigo }}</td>
            <td class="py-1.5">{{ concepto.nombre }}</td>
            <td class="py-1.5 text-gray-500">{{ concepto.modo_calculo }}</td>
            <td class="py-1.5 text-gray-500">{{ concepto.estado }}</td>
            <td class="py-1.5 space-x-2">
              <UButton size="xs" variant="soft" @click="iniciarEdicion(concepto)">Editar</UButton>

              <template v-if="concepto.estado === 'borrador'">
                <UButton
                  size="xs"
                  variant="soft"
                  :loading="cambiandoEstadoId === concepto.id"
                  @click="enviarARevision(concepto)"
                >
                  Enviar a revisión
                </UButton>
                <UButton
                  size="xs"
                  variant="soft"
                  :loading="cambiandoEstadoId === concepto.id"
                  @click="archivar(concepto)"
                >
                  Archivar
                </UButton>
              </template>

              <template v-else-if="concepto.estado === 'en_revision'">
                <UButton
                  size="xs"
                  variant="soft"
                  :loading="cambiandoEstadoId === concepto.id"
                  @click="aprobar(concepto)"
                >
                  Aprobar
                </UButton>
                <UInput
                  v-model="motivosRechazo[concepto.id]"
                  size="xs"
                  placeholder="Motivo de rechazo"
                  class="w-32"
                />
                <UButton
                  size="xs"
                  variant="soft"
                  color="error"
                  :loading="cambiandoEstadoId === concepto.id"
                  @click="rechazar(concepto)"
                >
                  Rechazar
                </UButton>
              </template>

              <template v-else-if="concepto.estado === 'activo'">
                <UButton
                  size="xs"
                  variant="soft"
                  :loading="cambiandoEstadoId === concepto.id"
                  @click="volverABorrador(concepto)"
                >
                  Volver a borrador
                </UButton>
                <UButton
                  size="xs"
                  variant="soft"
                  :loading="cambiandoEstadoId === concepto.id"
                  @click="archivar(concepto)"
                >
                  Archivar
                </UButton>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-2">
        {{ editandoId ? `Editar ${codigo}` : 'Crear concepto' }}
      </h2>
      <form class="space-y-4 max-w-lg" @submit.prevent="guardar">
        <UFormField label="Código" name="codigo">
          <UInput
            v-model="codigo"
            :disabled="editandoId !== null"
            placeholder="CUOTA_ADMIN"
            required
            class="w-full"
          />
        </UFormField>

        <UAlert
          v-if="mensajeSoloLectura"
          color="warning"
          variant="soft"
          :title="mensajeSoloLectura"
        />

        <UFormField label="Nombre" name="nombre">
          <UInput v-model="nombre" required :disabled="soloLectura" class="w-full" />
        </UFormField>

        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Tipo base" name="tipo_base">
            <select
              v-model="tipoBase"
              :disabled="soloLectura"
              class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
            >
              <option value="fijo">Fijo</option>
              <option value="coeficiente">Coeficiente</option>
              <option value="cantidad">Cantidad</option>
              <option value="porcentaje">Porcentaje</option>
              <option value="saldo">Saldo</option>
            </select>
          </UFormField>

          <UFormField label="Modo de cálculo" name="modo_calculo">
            <select
              v-model="modoCalculo"
              :disabled="soloLectura"
              class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
            >
              <option value="distribucion">Distribución (total, se reparte)</option>
              <option value="directo">Directo (por inmueble)</option>
            </select>
          </UFormField>
        </div>

        <UFormField label="Prioridad" name="prioridad">
          <UInput v-model.number="prioridad" type="number" :disabled="soloLectura" class="w-32" />
        </UFormField>

        <UFormField label="Fórmula AEL" name="formula_ael">
          <AelEditor
            ref="editorRef"
            v-model="formulaAel"
            :conceptos-disponibles="codigosConceptosExistentes"
            :diagnosticos="diagnosticosFormula"
            :readonly="soloLectura"
          />
        </UFormField>

        <div v-if="diagnosticosFormula.length > 0" class="space-y-1">
          <p class="text-xs font-medium text-gray-500">
            {{ diagnosticosFormula.length }}
            {{ diagnosticosFormula.length === 1 ? 'diagnóstico' : 'diagnósticos' }}
          </p>
          <button
            v-for="(diag, i) in diagnosticosFormula"
            :key="i"
            type="button"
            class="block w-full text-left text-xs text-red-500 hover:underline"
            @click="editorRef?.irAPosicion(diag.span.inicio.linea, diag.span.inicio.columna)"
          >
            {{ diag.codigo }} ({{ diag.span.inicio.linea }}:{{ diag.span.inicio.columna }}):
            {{ diag.mensaje }}
          </button>
        </div>

        <AelCapabilityView :formula-ael="formulaAel" />

        <div class="rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3">
          <p class="text-sm font-medium">Probar fórmula</p>
          <p class="text-xs text-gray-500">
            Evalúa el texto de arriba (guardado o no) contra un inmueble y periodo reales — AEL-004
            Fase 1.
          </p>
          <div class="flex items-end gap-4 flex-wrap">
            <UFormField label="Inmueble" name="inmueble_prueba">
              <select
                v-model="inmuebleIdPrueba"
                class="rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm"
              >
                <option :value="null" disabled>— Elegir —</option>
                <option v-for="i in cuentaStore.inmuebles" :key="i.id" :value="i.id">
                  {{ i.codigo }}
                </option>
              </select>
            </UFormField>
            <UFormField label="Periodo" name="periodo_prueba">
              <select
                v-model="periodoIdPrueba"
                class="rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm"
              >
                <option :value="null" disabled>— Elegir —</option>
                <option v-for="p in liquidacionStore.periodos" :key="p.id" :value="p.id">
                  {{ p.anio }}-{{ String(p.mes).padStart(2, '0') }}
                </option>
              </select>
            </UFormField>
            <UButton
              type="button"
              size="sm"
              variant="soft"
              :loading="probando"
              :disabled="!inmuebleIdPrueba || !periodoIdPrueba || !formulaAel"
              @click="probar"
            >
              Probar fórmula
            </UButton>
          </div>

          <UAlert v-if="errorPrueba" color="error" variant="soft" :title="errorPrueba" />

          <div v-if="resultadoPrueba" class="text-sm">
            <p v-if="resultadoPrueba.valido">
              Resultado:
              <span class="font-medium">{{ resultadoPrueba.resultado }}</span>
              <span class="text-gray-500">
                ({{
                  resultadoPrueba.tipo
                    ? (etiquetaTipo[resultadoPrueba.tipo] ?? resultadoPrueba.tipo)
                    : '—'
                }})
              </span>
            </p>
            <div v-else class="space-y-1">
              <p class="text-amber-500">La fórmula no es válida:</p>
              <p
                v-for="(diag, i) in resultadoPrueba.diagnosticos"
                :key="i"
                class="text-xs text-red-500"
              >
                {{ diag.codigo }} ({{ diag.linea }}:{{ diag.columna }}): {{ diag.mensaje }}
              </p>
            </div>
          </div>
        </div>

        <UAlert v-if="error" color="error" variant="soft" :title="error" />

        <div class="flex gap-2">
          <UButton v-if="!soloLectura" type="submit" :loading="guardando">
            {{ editandoId ? 'Guardar cambios' : 'Crear concepto' }}
          </UButton>
          <UButton v-if="editandoId" variant="ghost" @click="cancelarEdicion">
            {{ soloLectura ? 'Cerrar' : 'Cancelar' }}
          </UButton>
        </div>
      </form>
    </div>

    <div v-if="editandoId">
      <h2 class="text-lg font-semibold mb-2">Historial de versiones</h2>
      <p v-if="conceptoStore.versiones.length === 0" class="text-gray-500 text-sm">
        Sin versiones registradas todavía.
      </p>
      <template v-else>
        <table class="w-full text-sm mb-4">
          <thead>
            <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
              <th class="py-1 font-medium">Versión</th>
              <th class="py-1 font-medium">Fecha</th>
              <th class="py-1 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="v in conceptoStore.versiones"
              :key="v.id"
              class="border-b border-gray-100 dark:border-gray-900"
            >
              <td class="py-1.5">{{ v.version }}</td>
              <td class="py-1.5 text-gray-500">
                {{ new Date(v.created_at).toLocaleString() }}
              </td>
              <td class="py-1.5 text-gray-500">{{ v.estado_concepto }}</td>
            </tr>
          </tbody>
        </table>

        <div class="flex items-end gap-4 flex-wrap mb-2">
          <UFormField label="Comparar — versión A (original)" name="version_a">
            <select
              v-model="versionCompararA"
              class="rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm"
            >
              <option :value="null" disabled>— Elegir —</option>
              <option v-for="v in conceptoStore.versiones" :key="v.id" :value="v.id">
                Versión {{ v.version }} — {{ new Date(v.created_at).toLocaleString() }}
              </option>
            </select>
          </UFormField>
          <UFormField label="Comparar — versión B (nueva)" name="version_b">
            <select
              v-model="versionCompararB"
              class="rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm"
            >
              <option :value="null" disabled>— Elegir —</option>
              <option v-for="v in conceptoStore.versiones" :key="v.id" :value="v.id">
                Versión {{ v.version }} — {{ new Date(v.created_at).toLocaleString() }}
              </option>
            </select>
          </UFormField>
        </div>

        <div v-if="versionA && versionB" class="space-y-2">
          <p class="text-xs text-gray-500">
            Comparando versión {{ versionA.version }} (izquierda/original) → versión
            {{ versionB.version }} (derecha/nueva).
          </p>
          <AelVersionDiff
            :original="versionA.formula_ael ?? ''"
            :modificado="versionB.formula_ael ?? ''"
          />
        </div>
        <p v-else class="text-xs text-gray-500">Elige una versión A y una B para ver el diff.</p>
      </template>
    </div>

    <div v-if="editandoId">
      <h2 class="text-lg font-semibold mb-2">Casos de prueba</h2>
      <p class="text-xs text-gray-500 mb-3">
        Ejecuta la fórmula de arriba (guardada o no) contra insumos fijos — reproducible, sin tocar
        Supabase. AEL-004 Fase 6.
      </p>

      <p v-if="conceptoStore.casosPrueba.length === 0" class="text-gray-500 text-sm mb-4">
        Sin casos de prueba todavía.
      </p>
      <template v-else>
        <div class="flex items-center gap-3 mb-2">
          <UButton size="sm" variant="soft" @click="ejecutarTodos">Ejecutar todos</UButton>
          <p v-if="resumenEjecucion.total > 0" class="text-sm">
            <span class="text-green-600">{{ resumenEjecucion.passed }} passed</span> ·
            <span class="text-red-500">{{ resumenEjecucion.failed }} failed</span>
          </p>
        </div>
        <table class="w-full text-sm mb-4">
          <thead>
            <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
              <th class="py-1 font-medium">Nombre</th>
              <th class="py-1 font-medium">Esperado</th>
              <th class="py-1 font-medium">Resultado</th>
              <th class="py-1 font-medium" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="caso in conceptoStore.casosPrueba"
              :key="caso.id"
              class="border-b border-gray-100 dark:border-gray-900"
            >
              <td class="py-1.5">{{ caso.nombre }}</td>
              <td class="py-1.5 text-gray-500">
                {{ caso.tipoEsperado
                }}<template v-if="caso.resultadoEsperado && caso.resultadoEsperado.tipo !== 'NULO'">
                  = {{ caso.resultadoEsperado.valor }}</template
                >
              </td>
              <td class="py-1.5">
                <span
                  v-if="resultadosEjecucion[caso.id]"
                  :class="
                    resultadosEjecucion[caso.id]?.estado === 'passed'
                      ? 'text-green-600'
                      : 'text-red-500'
                  "
                >
                  {{ resultadosEjecucion[caso.id]?.estado }} —
                  {{ resultadosEjecucion[caso.id]?.mensaje }}
                </span>
                <span v-else class="text-gray-400">sin ejecutar</span>
              </td>
              <td class="py-1.5">
                <UButton size="xs" variant="ghost" color="error" @click="eliminarCaso(caso)">
                  Eliminar
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </template>

      <div class="rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3 max-w-lg">
        <p class="text-sm font-medium">Nuevo caso de prueba</p>

        <UFormField label="Nombre" name="caso_nombre">
          <UInput v-model="nuevoCasoNombre" class="w-full" />
        </UFormField>

        <div v-if="camposFormulaActual.length > 0" class="space-y-2">
          <p class="text-xs font-medium text-gray-500">Insumos</p>
          <div
            v-for="campo in camposFormulaActual"
            :key="claveCampo(campo)"
            class="flex items-center gap-2"
          >
            <span class="text-xs font-mono w-56">
              {{ campo.contrato }}.{{ campo.campo }} ({{ campo.tipo }})
            </span>
            <select
              v-if="campo.tipo === 'BOOLEAN'"
              v-model="entradasNuevoCasoBool[claveCampo(campo)]"
              class="rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm"
            >
              <option :value="true">verdadero</option>
              <option :value="false">falso</option>
            </select>
            <UInput
              v-else
              v-model="entradasNuevoCaso[claveCampo(campo)]"
              size="sm"
              :placeholder="campo.tipo === 'MONEY' ? '542250' : '0'"
              class="w-40"
            />
          </div>
        </div>
        <p v-else class="text-xs text-gray-500">
          Esta fórmula no referencia PARAMETER/UNIT/CONCEPTO.
        </p>

        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Tipo esperado" name="caso_tipo">
            <select
              v-model="nuevoCasoTipoEsperado"
              class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
            >
              <option value="MONEY">MONEY</option>
              <option value="NUMBER">NUMBER</option>
              <option value="BOOLEAN">BOOLEAN</option>
              <option value="NULO">NULO</option>
            </select>
          </UFormField>
          <UFormField
            v-if="nuevoCasoTipoEsperado === 'BOOLEAN'"
            label="Resultado esperado"
            name="caso_resultado"
          >
            <select
              v-model="nuevoCasoResultadoBool"
              class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
            >
              <option :value="true">verdadero</option>
              <option :value="false">falso</option>
            </select>
          </UFormField>
          <UFormField
            v-else-if="nuevoCasoTipoEsperado !== 'NULO'"
            label="Resultado esperado"
            name="caso_resultado"
          >
            <UInput v-model="nuevoCasoResultado" class="w-full" />
          </UFormField>
        </div>

        <UAlert v-if="errorCasoPrueba" color="error" variant="soft" :title="errorCasoPrueba" />

        <UButton size="sm" :loading="guardandoCaso" @click="guardarCasoPrueba">
          Guardar caso de prueba
        </UButton>
      </div>
    </div>
  </div>
</template>
