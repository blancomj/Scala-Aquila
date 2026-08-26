<script setup lang="ts">
// GAP-19 — fundamentos normativos reutilizables (Ley, decreto, reglamento
// PH, decisión de asamblea) asociables a fuente_financiacion /
// presupuesto_rubros (E-16 §7). Pantalla pequeña y aislada: crear/listar,
// sin decisiones de diseño pendientes — mismo criterio de UI mínima que
// presupuesto/index.vue.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const fundamentoStore = useFundamentoNormativoStore()

const tipo = ref<'ley' | 'decreto' | 'reglamento_ph' | 'decision_asamblea' | 'otra'>(
  'reglamento_ph',
)
const norma = ref('')
const articulo = ref('')
const descripcion = ref('')
const referencia = ref('')
const cargando = ref(false)
const error = ref<string | null>(null)

await useAsyncData('fundamentos-normativos', () => fundamentoStore.cargarFundamentos())

async function crear(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !norma.value) return

  cargando.value = true
  try {
    await fundamentoStore.crearFundamento({
      tenantId,
      tipo: tipo.value,
      norma: norma.value,
      articulo: articulo.value || undefined,
      descripcion: descripcion.value || undefined,
      referencia: referencia.value || undefined,
    })
    norma.value = ''
    articulo.value = ''
    descripcion.value = ''
    referencia.value = ''
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear el fundamento normativo.')
  } finally {
    cargando.value = false
  }
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-xl font-semibold mb-2">Fundamentos normativos</h1>
      <p class="text-sm text-gray-500">
        Referencias legales reutilizables (Ley, decreto, reglamento PH, decisión de asamblea).
      </p>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-2">Registrados</h2>
      <p v-if="fundamentoStore.fundamentos.length === 0" class="text-gray-500 text-sm">
        Ninguno todavía.
      </p>
      <UiTabla
        v-else
        :columnas="[
          { clave: 'tipo', etiqueta: 'Tipo' },
          { clave: 'norma', etiqueta: 'Norma' },
          { clave: 'articulo', etiqueta: 'Artículo' },
          { clave: 'origen', etiqueta: 'Origen' },
        ]"
        :filas="fundamentoStore.fundamentos"
        :clave-fila="(fundamento) => fundamento.id"
      >
        <template #celda-tipo="{ fila }">{{ fila.tipo }}</template>
        <template #celda-norma="{ fila }">{{ fila.norma }}</template>
        <template #celda-articulo="{ fila }"><span class="text-gray-500">{{ fila.articulo ?? '—' }}</span></template>
        <template #celda-origen="{ fila }">
          <span class="text-gray-500">{{ fila.tenant_id === null ? 'Plataforma' : 'Esta copropiedad' }}</span>
        </template>
      </UiTabla>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-2">Registrar fundamento normativo</h2>
      <form class="space-y-4 max-w-sm" @submit.prevent="crear">
        <UFormField label="Tipo" name="tipo">
          <select
            v-model="tipo"
            class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
          >
            <option value="ley">Ley</option>
            <option value="decreto">Decreto</option>
            <option value="reglamento_ph">Reglamento PH</option>
            <option value="decision_asamblea">Decisión de asamblea</option>
            <option value="otra">Otra</option>
          </select>
        </UFormField>

        <UFormField label="Norma" name="norma">
          <UInput v-model="norma" required class="w-full" />
        </UFormField>

        <UFormField label="Artículo" name="articulo">
          <UInput v-model="articulo" class="w-full" />
        </UFormField>

        <UFormField label="Descripción" name="descripcion">
          <UInput v-model="descripcion" class="w-full" />
        </UFormField>

        <UFormField label="Referencia" name="referencia">
          <UInput v-model="referencia" class="w-full" />
        </UFormField>

        <UAlert v-if="error" color="error" variant="soft" :title="error" />

        <UButton type="submit" :loading="cargando">Registrar</UButton>
      </form>
    </div>
  </div>
</template>
