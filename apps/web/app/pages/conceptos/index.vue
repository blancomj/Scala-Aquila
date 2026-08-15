<script setup lang="ts">
// F6 — última pieza sin UI del DoD ("UI de conceptos y fórmulas", PLAN §5).
// Crear/editar conceptos con validación estática de la fórmula AEL en el
// cliente (parsear + analizar, packages/ael-language) antes de guardar —
// feedback inmediato en vez de esperar a que liquidar-periodo lo rechace.
// El catálogo de validación es una aproximación (ver utils/ael-validate.ts);
// la autoridad real sigue siendo liquidar-periodo contra el snapshot real.
import { validarFormulaAel } from '~/utils/ael-validate'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const conceptoStore = useConceptoStore()

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

await useAsyncData('conceptos', () => {
  const tenantId = tenantStore.activeTenant?.id
  return tenantId ? conceptoStore.cargarConceptos(tenantId) : Promise.resolve([])
})

const diagnosticosFormula = computed(() => {
  if (!formulaAel.value.trim()) return []
  const codigosExistentes = conceptoStore.conceptos
    .map((c) => c.codigo)
    .filter((c) => c !== codigo.value)
  return validarFormulaAel(formulaAel.value, codigosExistentes)
})

function iniciarEdicion(concepto: (typeof conceptoStore.conceptos)[number]): void {
  editandoId.value = concepto.id
  codigo.value = concepto.codigo
  nombre.value = concepto.nombre
  tipoBase.value = concepto.tipo_base
  modoCalculo.value = concepto.modo_calculo
  formulaAel.value = concepto.formula_ael ?? ''
  prioridad.value = concepto.prioridad
  error.value = null
}

function cancelarEdicion(): void {
  editandoId.value = null
  codigo.value = ''
  nombre.value = ''
  formulaAel.value = ''
  prioridad.value = 100
  error.value = null
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

async function cambiarEstado(
  concepto: (typeof conceptoStore.conceptos)[number],
  estado: 'activo' | 'archivado',
): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  cambiandoEstadoId.value = concepto.id
  try {
    await conceptoStore.cambiarEstado(concepto.id, estado, tenantId)
  } catch (excepcion) {
    error.value = excepcion instanceof Error ? excepcion.message : 'No se pudo cambiar el estado.'
  } finally {
    cambiandoEstadoId.value = null
  }
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-xl font-semibold mb-2">Conceptos</h1>
      <p class="text-sm text-gray-500">
        Reglas de cálculo AEL — cada una calcula un cargo (CUOTA_ADMIN, intereses, etc). PLAN §5.
      </p>
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
              <UButton
                v-if="concepto.estado === 'borrador'"
                size="xs"
                variant="soft"
                :loading="cambiandoEstadoId === concepto.id"
                @click="cambiarEstado(concepto, 'activo')"
              >
                Activar
              </UButton>
              <UButton
                v-if="concepto.estado === 'activo'"
                size="xs"
                variant="soft"
                :loading="cambiandoEstadoId === concepto.id"
                @click="cambiarEstado(concepto, 'archivado')"
              >
                Archivar
              </UButton>
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

        <UFormField label="Nombre" name="nombre">
          <UInput v-model="nombre" required class="w-full" />
        </UFormField>

        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Tipo base" name="tipo_base">
            <select
              v-model="tipoBase"
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
              class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
            >
              <option value="distribucion">Distribución (total, se reparte)</option>
              <option value="directo">Directo (por inmueble)</option>
            </select>
          </UFormField>
        </div>

        <UFormField label="Prioridad" name="prioridad">
          <UInput v-model.number="prioridad" type="number" class="w-32" />
        </UFormField>

        <UFormField label="Fórmula AEL" name="formula_ael">
          <textarea
            v-model="formulaAel"
            rows="6"
            required
            placeholder="REGLA CUOTA_BASICA
DEFINIR presupuesto_anual = PARAMETER.PRESUPUESTO_ANUAL
DEFINIR otros_ingresos_anual = PARAMETER.OTROS_INGRESOS_ANUAL
RETORNAR presupuesto_anual - otros_ingresos_anual"
            class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 font-mono text-xs"
          />
        </UFormField>

        <div v-if="diagnosticosFormula.length > 0" class="space-y-1">
          <p v-for="(diag, i) in diagnosticosFormula" :key="i" class="text-xs text-red-500">
            {{ diag.codigo }} ({{ diag.span.inicio.linea }}:{{ diag.span.inicio.columna }}):
            {{ diag.mensaje }}
          </p>
        </div>

        <UAlert v-if="error" color="error" variant="soft" :title="error" />

        <div class="flex gap-2">
          <UButton type="submit" :loading="guardando">
            {{ editandoId ? 'Guardar cambios' : 'Crear concepto' }}
          </UButton>
          <UButton v-if="editandoId" variant="ghost" @click="cancelarEdicion">Cancelar</UButton>
        </div>
      </form>
    </div>
  </div>
</template>
