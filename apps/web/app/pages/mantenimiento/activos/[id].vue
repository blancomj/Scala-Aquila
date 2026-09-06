<script setup lang="ts">
// MANT-1 §3.4: pestaña Técnico (atributos según su tipo de dato y unidad) + panel de
// criticidad con desglose por criterio. Única pestaña real de esta ficha por ahora — MANT-0
// no construyó Plan/Programación/OT/Evidencias/Historial (cortes futuros de la serie).
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const route = useRoute()
const tenantStore = useTenantStore()
const activosStore = useActivosStore()

const activoId = route.params.id as string
const unidades = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const nombreUnidad = computed(() => new Map(unidades.value.map((u) => [u.id, u.nombre])))

// Formulario de atributos — copia local de activo.atributos, editable por definición.
// `undefined`, no `null`: los v-model de UInput/USelect (Nuxt UI) no aceptan `null`.
const form = reactive<Record<string, string | number | boolean | undefined>>({})
const guardadoOk = ref(false)
const errorGuardar = ref<string | null>(null)

function sincronizarForm(): void {
  for (const key of Object.keys(form)) Reflect.deleteProperty(form, key)
  const atributos = (activosStore.activo?.atributos ?? {}) as Record<string, string | number | boolean | undefined>
  for (const def of activosStore.definiciones) {
    form[def.codigo] = atributos[def.codigo] ?? (def.tipo_dato === 'booleano' ? false : undefined)
  }
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    activosStore.cargarFicha(tenantId, activoId),
    unidades.value.length === 0
      ? cargarListaTipos(tenantId, 'UNIDAD_MEDIDA').then((data) => { unidades.value = data })
      : Promise.resolve(),
  ])
  sincronizarForm()
}

onMounted(cargar)

async function guardarAtributos(): Promise<void> {
  errorGuardar.value = null
  guardadoOk.value = false
  // Solo se envían las claves con valor presente — omitir un atributo opcional que no aplica no
  // debe forzar a mandar `null` (el guard de validación de tipo lo rechazaría igual para
  // 'numero'/'texto'/'fecha'/'opcion', que no aceptan null como valor de dato).
  const payload: Record<string, string | number | boolean> = {}
  for (const [codigo, valor] of Object.entries(form)) {
    if (valor !== undefined && valor !== '') payload[codigo] = valor
  }
  try {
    await activosStore.actualizarAtributos(activoId, payload)
    guardadoOk.value = true
  } catch (e) {
    errorGuardar.value = e instanceof Error ? e.message : 'No se pudo guardar'
  }
}

async function evaluar(criterioId: string, valor: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await activosStore.evaluarCriterio(tenantId, activoId, criterioId, valor)
}

function valorEvaluado(criterioId: string): string | undefined {
  return activosStore.evaluaciones.find((e) => e.criterio_id === criterioId)?.valor
}

// Extraídos a funciones (en vez de `as boolean | undefined` inline en el template): el `|` de
// una unión de tipos dentro de una expresión de plantilla se confunde con la sintaxis de
// filtros de Vue 2, ya deprecada (vue/no-deprecated-filter).
function booleanoValor(codigo: string): boolean | undefined {
  return form[codigo] as boolean | undefined
}
function actualizarBooleano(codigo: string, valor: unknown): void {
  form[codigo] = valor as boolean | undefined
}
function opcionValor(codigo: string): string | undefined {
  return form[codigo] as string | undefined
}
function actualizarOpcion(codigo: string, valor: unknown): void {
  form[codigo] = valor as string | undefined
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
        <template #titulo>
          <h1 class="text-xl font-semibold">{{ activosStore.activo?.nombre ?? 'Activo' }}</h1>
        </template>
        <template #descripcion>
          {{ activosStore.activo?.codigo }} —
          <span class="capitalize">{{ activosStore.activo?.estado.replace('_', ' ') }}</span>
        </template>
      </UiTituloDescripcion>
      <UButton variant="ghost" icon="i-lucide-refresh-cw" :loading="activosStore.loading" @click="cargar()">
        Actualizar
      </UButton>
    </div>

    <!-- §3.4: pestaña Técnico -->
    <section class="space-y-4 rounded-lg border border-default p-4">
      <h2 class="font-medium">Técnico</h2>
      <p v-if="activosStore.definiciones.length === 0" class="text-sm text-muted">
        Este tipo de activo no tiene atributos técnicos definidos —
        <NuxtLink to="/mantenimiento/configuracion" class="text-primary underline">configúralos aquí</NuxtLink>.
      </p>
      <div v-else class="grid sm:grid-cols-2 gap-4">
        <UFormField
          v-for="def in activosStore.definiciones" :key="def.id"
          :label="`${def.nombre}${def.unidad_id ? ` (${nombreUnidad.get(def.unidad_id) ?? ''})` : ''}${def.obligatorio ? ' *' : ''}`"
          :name="def.codigo"
        >
          <UInput v-if="def.tipo_dato === 'numero'" v-model.number="form[def.codigo]" type="number" />
          <UInput v-else-if="def.tipo_dato === 'texto'" v-model="form[def.codigo]" type="text" />
          <UInput v-else-if="def.tipo_dato === 'fecha'" v-model="form[def.codigo]" type="date" />
          <USelect
            v-else-if="def.tipo_dato === 'booleano'"
            :model-value="booleanoValor(def.codigo)"
            :items="[{ label: 'Sí', value: true }, { label: 'No', value: false }]"
            class="w-full"
            @update:model-value="(v) => actualizarBooleano(def.codigo, v)"
          />
          <USelect
            v-else-if="def.tipo_dato === 'opcion'"
            :model-value="opcionValor(def.codigo)"
            :items="(def.opciones ?? []).map((o) => ({ label: o, value: o }))"
            class="w-full"
            @update:model-value="(v) => actualizarOpcion(def.codigo, v)"
          />
        </UFormField>
      </div>
      <UAlert v-if="errorGuardar" color="error" variant="soft" :title="errorGuardar" />
      <UAlert v-if="guardadoOk" color="success" variant="soft" title="Atributos guardados" />
      <UButton
        v-if="activosStore.definiciones.length > 0" :loading="activosStore.guardando"
        @click="guardarAtributos()"
      >
        Guardar atributos
      </UButton>
    </section>

    <!-- §3.4: panel de criticidad, siempre con desglose -->
    <section class="space-y-4 rounded-lg border border-default p-4">
      <h2 class="font-medium">Criticidad</h2>

      <UAlert
        v-if="activosStore.errorCriticidad?.includes('CRITICIDAD_SIN_SET_VIGENTE')"
        color="warning" variant="soft"
        title="No hay un set de criterios de criticidad vigente para esta copropiedad."
      >
        <template #description>
          <NuxtLink to="/mantenimiento/configuracion" class="text-primary underline">
            Configura y activa un set de criterios
          </NuxtLink>
        </template>
      </UAlert>
      <UAlert
        v-else-if="activosStore.errorCriticidad" color="warning" variant="soft"
        :title="activosStore.errorCriticidad"
      />

      <div v-if="activosStore.criteriosVigentes.length > 0" class="space-y-3">
        <div
          v-for="c in activosStore.criteriosVigentes" :key="c.id"
          class="flex items-center justify-between gap-4 flex-wrap"
        >
          <div>
            <p class="text-sm font-medium">{{ c.nombre }} <span class="text-muted">(peso {{ c.peso }})</span></p>
          </div>
          <USelect
            :model-value="valorEvaluado(c.id)"
            :items="Object.keys(c.escala as Record<string, number>).map((k) => ({ label: k, value: k }))"
            placeholder="Sin evaluar"
            class="w-40"
            @update:model-value="(v) => v && evaluar(c.id, v as string)"
          />
        </div>
      </div>

      <div v-if="activosStore.criticidad" class="rounded-lg bg-elevated p-4 space-y-2">
        <div class="flex items-center gap-3">
          <p class="text-2xl font-semibold">{{ activosStore.criticidad.puntaje_total }}</p>
          <UBadge v-if="activosStore.criticidad.banda" variant="soft" size="lg" class="capitalize">
            {{ activosStore.criticidad.banda }}
          </UBadge>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted">
              <th class="font-normal py-1">Criterio</th>
              <th class="font-normal py-1">Peso</th>
              <th class="font-normal py-1">Valor</th>
              <th class="font-normal py-1">Puntaje</th>
              <th class="font-normal py-1">Contribución</th>
            </tr>
          </thead>
          <tbody>
            <tr
v-for="fila in (activosStore.criticidad.desglose as unknown as {
              criterio_codigo: string; criterio_nombre: string; peso: number
              valor: string; puntaje: number; contribucion: number
            }[])" :key="fila.criterio_codigo">
              <td class="py-1">{{ fila.criterio_nombre }}</td>
              <td class="py-1">{{ fila.peso }}</td>
              <td class="py-1">{{ fila.valor }}</td>
              <td class="py-1">{{ fila.puntaje }}</td>
              <td class="py-1">{{ fila.contribucion }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
