<script setup lang="ts">
// GAP-19 — presupuesto, rubros, fuentes de financiación y previsualización
// (E-16 §5, §9, §14). UI mínima, mismo criterio que el resto de pantallas
// de este incremento: alcanza para probar el flujo completo, no es el
// diseño final. Rubros y fuentes de financiación solo se pueden agregar
// mientras el presupuesto está en 'borrador': rubros porque activar antes
// de reconciliar Σrubros = monto_total (guard_presupuesto_reconciliado)
// fallaría; fuentes porque guard_fuente_financiacion bloquea directamente
// cualquier escritura una vez el presupuesto es vigente/cerrado. El orden
// correcto es siempre: rubros + fuentes primero, activar al final.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()
const fundamentoStore = useFundamentoNormativoStore()

const presupuestoSeleccionadoId = ref<string | null>(null)
const presupuestoSeleccionado = computed(
  () => presupuestoStore.presupuestos.find((p) => p.id === presupuestoSeleccionadoId.value) ?? null,
)
const fundamentoPorId = computed(
  () => new Map(fundamentoStore.fundamentos.map((f) => [f.id, f.norma])),
)

// ── crear presupuesto ──────────────────────────────────────────────────
const nuevoAnio = ref<number | null>(new Date().getFullYear())
const nuevoMontoTotal = ref<number | null>(null)
const creandoPresupuesto = ref(false)
const errorPresupuesto = ref<string | null>(null)

// ── rubros ──────────────────────────────────────────────────────────────
const rubroCodigo = ref('')
const rubroNombre = ref('')
const rubroCategoriaId = ref<number | null>(null)
const rubroMontoAnual = ref<number | null>(null)
const rubroFundamentoId = ref<number | null>(null)
const creandoRubro = ref(false)
const errorRubro = ref<string | null>(null)
const activandoPresupuesto = ref(false)
const errorActivar = ref<string | null>(null)

const sumaRubros = computed(() =>
  presupuestoStore.rubros.reduce((acc, r) => acc + Number(r.monto_anual), 0),
)

// ── fuentes de financiación ─────────────────────────────────────────────
const tipo = ref<
  'otros_ingresos' | 'cuota_extraordinaria' | 'fondo_imprevistos' | 'saldo_aplicable'
>('otros_ingresos')
const valorDisponible = ref<number | null>(null)
const valorAplicado = ref<number | null>(null)
const descripcion = ref('')
const fuenteFundamentoId = ref<number | null>(null)
const cargando = ref(false)
const error = ref<string | null>(null)

const previsualizacion = ref<Awaited<
  ReturnType<typeof presupuestoStore.previsualizarDistribucion>
> | null>(null)
const previsualizando = ref(false)
const errorPrevisualizacion = ref<string | null>(null)

await useAsyncData('presupuestos', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return []
  const [presupuestos] = await Promise.all([
    presupuestoStore.cargarPresupuestos(tenantId),
    presupuestoStore.cargarCategoriasRubro(),
    fundamentoStore.cargarFundamentos(),
  ])
  return presupuestos
})

watch(
  () => presupuestoStore.presupuestos,
  (lista) => {
    if (!presupuestoSeleccionadoId.value && lista.length > 0) {
      presupuestoSeleccionadoId.value = lista[0]!.id
    }
  },
  { immediate: true },
)

watch(
  presupuestoSeleccionadoId,
  async (id) => {
    previsualizacion.value = null
    errorPrevisualizacion.value = null
    if (id) {
      await Promise.all([
        presupuestoStore.cargarFuentesFinanciacion(id),
        presupuestoStore.cargarRubros(id),
      ])
    }
  },
  { immediate: true },
)

function formatoMoneda(valor: string | number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(valor))
}

async function crearPresupuesto(): Promise<void> {
  errorPresupuesto.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || nuevoAnio.value === null || nuevoMontoTotal.value === null) return

  creandoPresupuesto.value = true
  try {
    const creado = await presupuestoStore.crearPresupuesto({
      tenantId,
      anio: nuevoAnio.value,
      montoTotal: nuevoMontoTotal.value,
    })
    presupuestoSeleccionadoId.value = creado.id
    nuevoMontoTotal.value = null
  } catch (excepcion) {
    errorPresupuesto.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo crear el presupuesto.'
  } finally {
    creandoPresupuesto.value = false
  }
}

async function crearRubro(): Promise<void> {
  errorRubro.value = null
  const presupuestoId = presupuestoSeleccionadoId.value
  if (!presupuestoId || !tenantStore.activeTenant?.id) return
  if (!rubroCodigo.value || !rubroNombre.value || rubroCategoriaId.value === null) return
  if (rubroMontoAnual.value === null) return

  creandoRubro.value = true
  try {
    await presupuestoStore.crearRubro({
      presupuestoId,
      tenantId: tenantStore.activeTenant.id,
      codigo: rubroCodigo.value,
      nombre: rubroNombre.value,
      categoriaId: rubroCategoriaId.value,
      montoAnual: rubroMontoAnual.value,
      fundamentoNormativoId: rubroFundamentoId.value ?? undefined,
    })
    rubroCodigo.value = ''
    rubroNombre.value = ''
    rubroMontoAnual.value = null
    rubroFundamentoId.value = null
  } catch (excepcion) {
    errorRubro.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo agregar el rubro.'
  } finally {
    creandoRubro.value = false
  }
}

async function activarPresupuesto(): Promise<void> {
  errorActivar.value = null
  const presupuestoId = presupuestoSeleccionadoId.value
  const tenantId = tenantStore.activeTenant?.id
  if (!presupuestoId || !tenantId) return

  activandoPresupuesto.value = true
  try {
    await presupuestoStore.activarPresupuesto(presupuestoId, tenantId)
  } catch (excepcion) {
    errorActivar.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo activar el presupuesto.'
  } finally {
    activandoPresupuesto.value = false
  }
}

async function registrar(): Promise<void> {
  error.value = null
  const presupuestoId = presupuestoSeleccionadoId.value
  if (!presupuestoId || valorDisponible.value === null) return

  cargando.value = true
  try {
    await presupuestoStore.registrarFuenteFinanciacion({
      presupuestoId,
      tipo: tipo.value,
      valorDisponible: valorDisponible.value,
      valorAplicado: valorAplicado.value ?? 0,
      descripcion: descripcion.value || undefined,
      fundamentoNormativoId: fuenteFundamentoId.value ?? undefined,
    })
    valorDisponible.value = null
    valorAplicado.value = null
    descripcion.value = ''
    fuenteFundamentoId.value = null
    // Una fuente nueva cambia la necesidad financiera — la previsualización
    // anterior ya no refleja el presupuesto actual.
    previsualizacion.value = null
  } catch (excepcion) {
    error.value =
      excepcion instanceof Error
        ? excepcion.message
        : 'No se pudo registrar la fuente de financiación.'
  } finally {
    cargando.value = false
  }
}

async function previsualizar(): Promise<void> {
  errorPrevisualizacion.value = null
  const presupuestoId = presupuestoSeleccionadoId.value
  if (!presupuestoId) return

  previsualizando.value = true
  try {
    previsualizacion.value = await presupuestoStore.previsualizarDistribucion(presupuestoId)
  } catch (excepcion) {
    errorPrevisualizacion.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo previsualizar la distribución.'
  } finally {
    previsualizando.value = false
  }
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-xl font-semibold mb-2">Presupuesto</h1>
      <p class="text-sm text-gray-500">
        Rubros, fuentes de financiación distintas de la cuota ordinaria, y previsualización de la
        distribución — GAP-19.
      </p>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-2">Crear presupuesto</h2>
      <form class="flex items-end gap-4" @submit.prevent="crearPresupuesto">
        <UFormField label="Año" name="anio">
          <UInput v-model.number="nuevoAnio" type="number" required class="w-28" />
        </UFormField>
        <UFormField label="Monto total" name="monto_total">
          <UInput v-model.number="nuevoMontoTotal" type="number" min="0" required class="w-40" />
        </UFormField>
        <UButton type="submit" :loading="creandoPresupuesto">Crear</UButton>
      </form>
      <UAlert
        v-if="errorPresupuesto"
        color="error"
        variant="soft"
        :title="errorPresupuesto"
        class="mt-2"
      />
    </div>

    <p v-if="presupuestoStore.presupuestos.length === 0" class="text-gray-500 text-sm">
      Esta copropiedad todavía no tiene un presupuesto registrado.
    </p>

    <template v-else>
      <UFormField label="Presupuesto" name="presupuesto">
        <select
          v-model="presupuestoSeleccionadoId"
          class="rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm"
        >
          <option v-for="p in presupuestoStore.presupuestos" :key="p.id" :value="p.id">
            {{ p.anio }} — v{{ p.version }} ({{ p.estado }})
          </option>
        </select>
      </UFormField>

      <div>
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-lg font-semibold">Rubros</h2>
          <UButton
            v-if="presupuestoSeleccionado?.estado === 'borrador'"
            size="xs"
            variant="soft"
            :loading="activandoPresupuesto"
            @click="activarPresupuesto"
          >
            Activar presupuesto
          </UButton>
        </div>

        <p v-if="presupuestoStore.rubros.length === 0" class="text-gray-500 text-sm">Ninguno.</p>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
              <th class="py-1 font-medium">Código</th>
              <th class="py-1 font-medium">Nombre</th>
              <th class="py-1 font-medium">Monto anual</th>
              <th class="py-1 font-medium">Fundamento</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="rubro in presupuestoStore.rubros"
              :key="rubro.id"
              class="border-b border-gray-100 dark:border-gray-900"
            >
              <td class="py-1.5">{{ rubro.codigo }}</td>
              <td class="py-1.5">{{ rubro.nombre }}</td>
              <td class="py-1.5">{{ formatoMoneda(rubro.monto_anual) }}</td>
              <td class="py-1.5 text-gray-500">
                {{
                  rubro.fundamento_normativo_id
                    ? fundamentoPorId.get(rubro.fundamento_normativo_id)
                    : '—'
                }}
              </td>
            </tr>
          </tbody>
        </table>

        <p v-if="presupuestoSeleccionado" class="text-sm text-gray-500 mt-2">
          Σ rubros: {{ formatoMoneda(sumaRubros) }} / monto_total:
          {{ formatoMoneda(presupuestoSeleccionado.monto_total) }}
          <span
            v-if="sumaRubros !== Number(presupuestoSeleccionado.monto_total)"
            class="text-amber-500"
          >
            — no coinciden, activar fallará hasta que cuadren
          </span>
        </p>

        <UAlert
          v-if="errorActivar"
          color="error"
          variant="soft"
          :title="errorActivar"
          class="mt-2"
        />

        <form
          v-if="presupuestoSeleccionado?.estado === 'borrador'"
          class="space-y-4 max-w-sm mt-4"
          @submit.prevent="crearRubro"
        >
          <UFormField label="Código" name="codigo">
            <UInput v-model="rubroCodigo" required class="w-full" />
          </UFormField>
          <UFormField label="Nombre" name="nombre">
            <UInput v-model="rubroNombre" required class="w-full" />
          </UFormField>
          <UFormField label="Categoría" name="categoria">
            <select
              v-model="rubroCategoriaId"
              class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
            >
              <option :value="null" disabled>— Elegir —</option>
              <option v-for="c in presupuestoStore.categoriasRubro" :key="c.id" :value="c.id">
                {{ c.nombre }}
              </option>
            </select>
          </UFormField>
          <UFormField label="Monto anual" name="monto_anual">
            <UInput
              v-model.number="rubroMontoAnual"
              type="number"
              min="0"
              required
              class="w-full"
            />
          </UFormField>
          <UFormField label="Fundamento normativo" name="fundamento_normativo_id">
            <select
              v-model="rubroFundamentoId"
              class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
            >
              <option :value="null">— Ninguno —</option>
              <option v-for="f in fundamentoStore.fundamentos" :key="f.id" :value="f.id">
                {{ f.norma }}
              </option>
            </select>
          </UFormField>
          <UAlert v-if="errorRubro" color="error" variant="soft" :title="errorRubro" />
          <UButton type="submit" :loading="creandoRubro">Agregar rubro</UButton>
        </form>
      </div>

      <div>
        <h2 class="text-lg font-semibold mb-2">Fuentes registradas</h2>
        <p v-if="presupuestoStore.fuentes.length === 0" class="text-gray-500 text-sm">Ninguna.</p>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
              <th class="py-1 font-medium">Tipo</th>
              <th class="py-1 font-medium">Disponible</th>
              <th class="py-1 font-medium">Aplicado</th>
              <th class="py-1 font-medium">Descripción</th>
              <th class="py-1 font-medium">Fundamento</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="fuente in presupuestoStore.fuentes"
              :key="fuente.id"
              class="border-b border-gray-100 dark:border-gray-900"
            >
              <td class="py-1.5">{{ fuente.tipo }}</td>
              <td class="py-1.5">{{ formatoMoneda(fuente.valor_disponible) }}</td>
              <td class="py-1.5">{{ formatoMoneda(fuente.valor_aplicado) }}</td>
              <td class="py-1.5 text-gray-500">{{ fuente.descripcion ?? '—' }}</td>
              <td class="py-1.5 text-gray-500">
                {{
                  fuente.fundamento_normativo_id
                    ? fundamentoPorId.get(fuente.fundamento_normativo_id)
                    : '—'
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-lg font-semibold">Previsualizar distribución</h2>
          <UButton size="xs" variant="soft" :loading="previsualizando" @click="previsualizar">
            Previsualizar
          </UButton>
        </div>
        <p class="text-sm text-gray-500 mb-2">
          Simula cómo quedaría el reparto por coeficiente sin liquidar nada — netea las fuentes de
          tipo "otros ingresos" contra el total antes de repartir.
        </p>

        <UAlert
          v-if="errorPrevisualizacion"
          color="error"
          variant="soft"
          :title="errorPrevisualizacion"
        />

        <template v-if="previsualizacion">
          <p class="text-sm mb-2">
            Necesidad financiera:
            <span class="font-medium">{{
              formatoMoneda(previsualizacion.necesidad_financiera)
            }}</span>
            <span class="text-gray-500">
              ({{ formatoMoneda(previsualizacion.monto_total) }} − otros ingresos
              {{ formatoMoneda(previsualizacion.otros_ingresos_aplicados) }})
            </span>
          </p>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
                <th class="py-1 font-medium">Inmueble</th>
                <th class="py-1 font-medium">Coeficiente</th>
                <th class="py-1 font-medium">Valor asignado</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="fila in previsualizacion.distribucion"
                :key="fila.inmueble_id"
                class="border-b border-gray-100 dark:border-gray-900"
              >
                <td class="py-1.5">{{ fila.codigo }}</td>
                <td class="py-1.5 text-gray-500">{{ fila.coeficiente ?? '—' }}</td>
                <td class="py-1.5">{{ formatoMoneda(fila.valor_asignado) }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </div>

      <div>
        <h2 class="text-lg font-semibold mb-2">Registrar fuente de financiación</h2>
        <p v-if="presupuestoSeleccionado?.estado !== 'borrador'" class="text-sm text-gray-500">
          Solo se puede registrar mientras el presupuesto está en borrador — una vez vigente,
          `guard_fuente_financiacion` lo bloquea (corrige creando una versión nueva).
        </p>
        <form v-else class="space-y-4 max-w-sm" @submit.prevent="registrar">
          <UFormField label="Tipo" name="tipo">
            <select
              v-model="tipo"
              class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
            >
              <option value="otros_ingresos">Otros ingresos</option>
              <option value="cuota_extraordinaria">Cuota extraordinaria</option>
              <option value="fondo_imprevistos">Fondo de imprevistos</option>
              <option value="saldo_aplicable">Saldo aplicable</option>
            </select>
          </UFormField>

          <UFormField label="Valor disponible" name="valor_disponible">
            <UInput
              v-model.number="valorDisponible"
              type="number"
              min="0"
              required
              class="w-full"
            />
          </UFormField>

          <UFormField label="Valor aplicado" name="valor_aplicado">
            <UInput v-model.number="valorAplicado" type="number" min="0" class="w-full" />
          </UFormField>

          <UFormField label="Descripción" name="descripcion">
            <UInput v-model="descripcion" class="w-full" />
          </UFormField>

          <UFormField label="Fundamento normativo" name="fundamento_normativo_id">
            <select
              v-model="fuenteFundamentoId"
              class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
            >
              <option :value="null">— Ninguno —</option>
              <option v-for="f in fundamentoStore.fundamentos" :key="f.id" :value="f.id">
                {{ f.norma }}
              </option>
            </select>
          </UFormField>

          <UAlert v-if="error" color="error" variant="soft" :title="error" />

          <UButton type="submit" :loading="cargando">Registrar</UButton>
        </form>
      </div>
    </template>
  </div>
</template>
