<script setup lang="ts">
// Depreciación por defecto, por categoría de activo — gap de configurabilidad contable
// (2026-09-14). Hoy vida_util_meses/metodo_depreciacion (MANT-0) se definen activo por activo,
// sin ningún default de copropiedad: cada alta parte de cero. Esta pantalla deja un default
// SUGERIDO por categoría (lista_tipos CATEGORIA_ACTIVO) que ActivoFormDrawer precarga al crear
// un activo nuevo — el usuario lo puede sobrescribir sin fricción, nunca es un bloqueo.
//
// Deliberadamente SIN el versionado borrador/vigente/histórica de contable_politica_deterioro
// (CO-7): esto no recalcula saldos ni necesita auditoría de cambios, es una conveniencia de
// captura — el mismo criterio de proporcionalidad que D-127/MANT-6 ya estableció para otras
// parametrizaciones pequeñas.
import type { Database } from '@aquila/shared'

type MetodoDepreciacion = Database['public']['Enums']['depreciacion_metodo_t']
type CategoriaOpcion = { id: number; nombre: string }

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const store = useDepreciacionDefaultStore()

const error = ref<string | null>(null)
const aviso = ref<string | null>(null)
const categorias = ref<CategoriaOpcion[]>([])

const OPCIONES_METODO: { label: string; value: MetodoDepreciacion }[] = [
  { label: 'Línea recta', value: 'linea_recta' },
  { label: 'No deprecia', value: 'no_deprecia' },
]

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    const [cats] = await Promise.all([
      cargarListaTipos(tenantId, 'CATEGORIA_ACTIVO'),
      store.cargarDefaults(tenantId),
    ])
    categorias.value = cats.map((c) => ({ id: c.id, nombre: c.nombre }))
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo cargar la configuración de depreciación.')
  }
}
onMounted(cargar)
watch(() => tenantStore.activeTenant?.id, cargar)

/** Borrador editable por categoría — separado de lo guardado, mismo criterio que el resto de
 * pantallas de configuración (no se escribe en cada keystroke). */
const filas = computed(() =>
  categorias.value.map((c) => {
    const existente = store.defaults.find((d) => d.categoria_id === c.id)
    return {
      categoriaId: c.id,
      categoriaNombre: c.nombre,
      defaultId: existente?.id ?? null,
      metodo: (existente?.metodo_depreciacion ?? null) as MetodoDepreciacion | null,
      vidaUtilMeses: existente?.vida_util_meses ?? null,
    }
  }),
)

const borrador = reactive(new Map<number, { metodo: MetodoDepreciacion | null; vidaUtilMeses: number | null }>())

function valorMetodo(categoriaId: number): MetodoDepreciacion | null {
  return borrador.get(categoriaId)?.metodo ?? filas.value.find((f) => f.categoriaId === categoriaId)?.metodo ?? null
}
function valorVidaUtil(categoriaId: number): number | null {
  return borrador.get(categoriaId)?.vidaUtilMeses ?? filas.value.find((f) => f.categoriaId === categoriaId)?.vidaUtilMeses ?? null
}
function actualizarMetodo(categoriaId: number, metodo: MetodoDepreciacion | null): void {
  borrador.set(categoriaId, { metodo, vidaUtilMeses: valorVidaUtil(categoriaId) })
}
function actualizarVidaUtil(categoriaId: number, vidaUtilMeses: number | null): void {
  borrador.set(categoriaId, { metodo: valorMetodo(categoriaId), vidaUtilMeses })
}

async function guardarFila(categoriaId: number): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const metodo = valorMetodo(categoriaId)
  if (!tenantId || !metodo) return
  error.value = null
  aviso.value = null
  try {
    await store.guardarDefault({
      tenantId, categoriaId, metodoDepreciacion: metodo,
      vidaUtilMeses: valorVidaUtil(categoriaId),
    })
    borrador.delete(categoriaId)
    aviso.value = 'Default guardado.'
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar el default de esta categoría.')
  }
}

async function quitarFila(categoriaId: number): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const fila = filas.value.find((f) => f.categoriaId === categoriaId)
  if (!tenantId || !fila?.defaultId) return
  error.value = null
  try {
    await store.eliminarDefault(tenantId, fila.defaultId)
    borrador.delete(categoriaId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo quitar el default de esta categoría.')
  }
}
</script>

<template>
  <div class="max-w-3xl space-y-6">
    <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
      <template #titulo>
        <h1 class="text-xl font-semibold">Depreciación por defecto</h1>
      </template>
      <template #descripcion>
        Un método y vida útil sugeridos por categoría de activo, para no repetirlos cada vez que
        se da de alta un activo nuevo. Es solo una sugerencia: el formulario de alta se puede
        sobrescribir sin fricción, y no cambia nada de los activos que ya existen.
      </template>
    </UiTituloDescripcion>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />
    <UAlert v-if="aviso" color="success" variant="soft" :title="aviso" />

    <div class="overflow-x-auto rounded-lg border border-default">
      <table class="w-full text-sm">
        <thead class="bg-muted/30">
          <tr>
            <th class="p-2 text-left">Categoría</th>
            <th class="p-2 text-left">Método</th>
            <th class="p-2 text-left">Vida útil (meses)</th>
            <th class="p-2 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in filas" :key="f.categoriaId" class="border-t border-default">
            <td class="p-2">{{ f.categoriaNombre }}</td>
            <td class="p-2">
              <USelect
                :model-value="valorMetodo(f.categoriaId) ?? undefined"
                :items="OPCIONES_METODO" placeholder="Sin definir" size="sm" class="w-40"
                @update:model-value="(v) => actualizarMetodo(f.categoriaId, (v as MetodoDepreciacion) ?? null)"
              />
            </td>
            <td class="p-2">
              <UInputNumber
                :model-value="valorVidaUtil(f.categoriaId) ?? undefined"
                :min="0" size="sm" class="w-32"
                :disabled="valorMetodo(f.categoriaId) !== 'linea_recta'"
                @update:model-value="(v) => actualizarVidaUtil(f.categoriaId, (v as number) ?? null)"
              />
            </td>
            <td class="p-2 text-right">
              <div class="flex justify-end gap-2">
                <UButton
                  size="xs" :loading="store.guardando" :disabled="!valorMetodo(f.categoriaId)"
                  @click="guardarFila(f.categoriaId)"
                >
                  Guardar
                </UButton>
                <UButton
                  v-if="f.defaultId" size="xs" variant="ghost" color="error"
                  @click="quitarFila(f.categoriaId)"
                >
                  Quitar
                </UButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
