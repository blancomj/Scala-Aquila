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
    error.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo crear el fundamento normativo.'
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
        Referencias legales reutilizables (Ley, decreto, reglamento PH, decisión de asamblea) —
        GAP-19.
      </p>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-2">Registrados</h2>
      <p v-if="fundamentoStore.fundamentos.length === 0" class="text-gray-500 text-sm">
        Ninguno todavía.
      </p>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
            <th class="py-1 font-medium">Tipo</th>
            <th class="py-1 font-medium">Norma</th>
            <th class="py-1 font-medium">Artículo</th>
            <th class="py-1 font-medium">Origen</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="fundamento in fundamentoStore.fundamentos"
            :key="fundamento.id"
            class="border-b border-gray-100 dark:border-gray-900"
          >
            <td class="py-1.5">{{ fundamento.tipo }}</td>
            <td class="py-1.5">{{ fundamento.norma }}</td>
            <td class="py-1.5 text-gray-500">{{ fundamento.articulo ?? '—' }}</td>
            <td class="py-1.5 text-gray-500">
              {{ fundamento.tenant_id === null ? 'Plataforma' : 'Esta copropiedad' }}
            </td>
          </tr>
        </tbody>
      </table>
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
