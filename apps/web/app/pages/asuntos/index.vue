<script setup lang="ts">
// EXS-7 · Mis asuntos.
//
// Es una bandeja de TRABAJO, no un muro de avisos: cada fila es algo que
// este usuario puede hacer ahora mismo, y el enlace lleva al sitio exacto
// donde hacerlo. Lo que solo puede aprobar un administrador no aparece en
// la bandeja de un auxiliar — filtrarlo es cosa de fn_mis_asuntos, que sabe
// quién puede actuar sobre qué.
//
// No hay botón de "marcar como hecho": un asunto desaparece cuando el
// trabajo se resuelve en su dominio. Ofrecer aquí un modo de ocultarlo sin
// hacerlo convertiría la bandeja en una lista de tareas paralela.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const asuntosStore = useAsuntosStore()
const authStore = useAuthStore()

const SENTINEL_TODOS = 'todos'
const filtroModulo = ref<string>(SENTINEL_TODOS)

// Dueño: «todo / lo mío / sin dueño». Solo una de las siete ramas asigna
// persona (las solicitudes de Atención), así que este filtro únicamente
// aparece cuando hay algo asignado — en una copropiedad que no reparte
// solicitudes sería una fila de botones que no cambia nada.
type FiltroDueno = 'todos' | 'mios' | 'sin_dueno'
const filtroDueno = ref<FiltroDueno>('todos')

// profiles.id ES el id del usuario de auth; se usa ese y no
// useSupabaseUser().value.id, que durante SSR puede venir sin id.
const miId = computed(() => authStore.profile?.id ?? null)

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await asuntosStore.cargar(tenantId)
}
onMounted(async () => {
  await authStore.cargarPerfil()
  await cargar()
})
watch(() => tenantStore.activeTenant?.id, cargar)

const ETIQUETA_MODULO: Record<string, string> = {
  anuncios: 'Anuncios',
  marketplace: 'Marketplace',
  movilidad: 'Movilidad',
  atencion: 'Atención',
}

const modulos = computed(() =>
  [...asuntosStore.porModulo.entries()].map(([codigo, cuenta]) => ({
    codigo,
    etiqueta: ETIQUETA_MODULO[codigo] ?? codigo,
    cuenta,
  })),
)

/** Hay reparto de trabajo en esta copropiedad, o no lo hay. */
const hayAsignaciones = computed(() => asuntosStore.asuntos.some((a) => a.asignadoA !== null))

const misAsuntos = computed(() => asuntosStore.mios(miId.value).length)

const filtrados = computed(() => {
  let lista =
    filtroModulo.value === SENTINEL_TODOS
      ? asuntosStore.asuntos
      : asuntosStore.asuntos.filter((a) => a.origenModulo === filtroModulo.value)
  if (filtroDueno.value === 'mios') lista = lista.filter((a) => a.asignadoA === miId.value)
  else if (filtroDueno.value === 'sin_dueno') lista = lista.filter((a) => a.asignadoA === null)
  return lista
})

// Paginación en cliente, no en SQL: la bandeja ya viene acotada a lo que
// este usuario puede atender y en un edificio eso son decenas de filas
// (AD-24). Bajar limit/offset a `fn_mis_asuntos` obligaría a repetir la
// consulta —siete ramas y un union all— por cada cambio de página, que es
// más trabajo para el servidor que traerlo una vez.
const POR_PAGINA = 20
const pagina = ref(1)

const totalPaginas = computed(() => Math.max(1, Math.ceil(filtrados.value.length / POR_PAGINA)))

// Cambiar de filtro con la página 3 abierta dejaría la lista en blanco si
// el nuevo conjunto tiene una sola página.
watch([filtroModulo, filtroDueno], () => {
  pagina.value = 1
})

const visibles = computed(() =>
  filtrados.value.slice((pagina.value - 1) * POR_PAGINA, pagina.value * POR_PAGINA),
)

const desde = computed(() => (filtrados.value.length === 0 ? 0 : (pagina.value - 1) * POR_PAGINA + 1))
const hasta = computed(() => Math.min(pagina.value * POR_PAGINA, filtrados.value.length))

const hoy = new Date().toISOString().slice(0, 10)

function estadoVencimiento(venceAt: string | null): 'vencido' | 'pronto' | 'sin_plazo' {
  if (venceAt === null) return 'sin_plazo'
  const fecha = venceAt.slice(0, 10)
  if (fecha < hoy) return 'vencido'
  return 'pronto'
}

function textoVencimiento(venceAt: string | null): string {
  if (venceAt === null) return ''
  const fecha = venceAt.slice(0, 10)
  const dias = Math.round(
    (new Date(fecha).getTime() - new Date(hoy).getTime()) / (1000 * 60 * 60 * 24),
  )
  if (dias < 0) return `Venció hace ${String(Math.abs(dias))} día${Math.abs(dias) === 1 ? '' : 's'}`
  if (dias === 0) return 'Vence hoy'
  if (dias === 1) return 'Vence mañana'
  return `Vence en ${String(dias)} días`
}

function claseVencimiento(venceAt: string | null): string {
  const estado = estadoVencimiento(venceAt)
  if (estado === 'vencido')
    return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
  if (estado === 'pronto')
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
  return ''
}

function claseModulo(modulo: string): string {
  const mapa: Record<string, string> = {
    anuncios: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
    marketplace: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
    movilidad: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
    atencion: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  }
  return mapa[modulo] ?? 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
}
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion>
      <template #titulo>
        <h1 class="text-xl font-semibold">Mis asuntos</h1>
      </template>
      <template #descripcion>
        Todo lo que está esperando una decisión <strong>tuya</strong>, reunido de los módulos donde
        vive. No es una lista de tareas aparte: cada asunto desaparece de aquí en cuanto el trabajo
        se resuelve en su sitio, y solo aparece si tu rol te permite hacer algo con él.
      </template>
    </UiTituloDescripcion>

    <p v-if="asuntosStore.error" class="text-sm text-red-600 dark:text-red-400">
      {{ asuntosStore.error }}
    </p>

    <div
      v-if="!asuntosStore.loading && asuntosStore.asuntos.length === 0"
      class="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 py-12 text-center"
    >
      <p class="text-sm font-medium">No hay nada esperándote</p>
      <p class="text-xs text-neutral-500 mt-1">
        Cuando algo necesite tu aprobación o tu respuesta, aparecerá aquí.
      </p>
    </div>

    <template v-else>
      <div class="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          class="px-3 py-1 rounded-full text-xs border transition-colors"
          :class="
            filtroModulo === SENTINEL_TODOS
              ? 'border-primary text-primary font-medium'
              : 'border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400'
          "
          @click="filtroModulo = SENTINEL_TODOS"
        >
          Todos ({{ asuntosStore.asuntos.length }})
        </button>
        <button
          v-for="m in modulos"
          :key="m.codigo"
          type="button"
          class="px-3 py-1 rounded-full text-xs border transition-colors"
          :class="
            filtroModulo === m.codigo
              ? 'border-primary text-primary font-medium'
              : 'border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400'
          "
          @click="filtroModulo = m.codigo"
        >
          {{ m.etiqueta }} ({{ m.cuenta }})
        </button>

        <span
          v-if="asuntosStore.vencidos > 0"
          class="ml-auto text-xs px-2 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
        >
          {{ asuntosStore.vencidos }} vencido{{ asuntosStore.vencidos === 1 ? '' : 's' }}
        </span>
      </div>

      <!-- Reparto: solo si alguien reparte. Sin asignaciones, estos
           botones no separarían nada. -->
      <div v-if="hayAsignaciones" class="flex items-center gap-2 flex-wrap">
        <button
          v-for="opcion in [
            { valor: 'todos' as const, etiqueta: `Todo (${asuntosStore.asuntos.length})` },
            { valor: 'mios' as const, etiqueta: `Asignados a mí (${misAsuntos})` },
            { valor: 'sin_dueno' as const, etiqueta: `Sin dueño (${asuntosStore.sinDueno.length})` },
          ]"
          :key="opcion.valor"
          type="button"
          class="px-3 py-1 rounded-full text-xs border transition-colors"
          :class="
            filtroDueno === opcion.valor
              ? 'border-primary text-primary font-medium'
              : 'border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400'
          "
          @click="filtroDueno = opcion.valor"
        >
          {{ opcion.etiqueta }}
        </button>
      </div>

      <ul class="space-y-2">
        <li
          v-for="a in visibles"
          :key="`${a.origenEntidad}-${a.origenId}`"
          class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 space-y-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="px-2 py-0.5 rounded-full text-[11px]" :class="claseModulo(a.origenModulo)">
                  {{ ETIQUETA_MODULO[a.origenModulo] ?? a.origenModulo }}
                </span>
                <span
                  v-if="a.venceAt"
                  class="px-2 py-0.5 rounded-full text-[11px]"
                  :class="claseVencimiento(a.venceAt)"
                >
                  {{ textoVencimiento(a.venceAt) }}
                </span>
                <!-- Solo se marca lo tuyo. Decir «asignado a otra persona»
                     exigiría traer su nombre, y saber quién lo lleva es
                     cosa de la pantalla del dominio, no de la bandeja. -->
                <span
                  v-if="a.asignadoA !== null && a.asignadoA === miId"
                  class="px-2 py-0.5 rounded-full text-[11px] bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300"
                >
                  Tuyo
                </span>
              </div>
              <p class="text-sm font-medium truncate">{{ a.titulo }}</p>
              <p v-if="a.resumen" class="text-xs text-neutral-600 dark:text-neutral-400 truncate">
                {{ a.resumen }}
              </p>
            </div>

            <!-- El enlace lleva al contexto exacto, nunca al home del módulo. -->
            <UButton :to="a.enlace" size="xs" variant="outline" class="shrink-0">
              {{ a.accion }}
            </UButton>
          </div>
        </li>
      </ul>

      <div
        v-if="filtrados.length > POR_PAGINA"
        class="flex items-center justify-between gap-3 pt-1"
      >
        <p class="text-xs text-neutral-500">
          {{ desde }}–{{ hasta }} de {{ filtrados.length }}
        </p>
        <div class="flex items-center gap-2">
          <UButton size="xs" variant="ghost" :disabled="pagina === 1" @click="pagina -= 1">
            Anterior
          </UButton>
          <span class="text-xs text-neutral-500">{{ pagina }} / {{ totalPaginas }}</span>
          <UButton
            size="xs"
            variant="ghost"
            :disabled="pagina >= totalPaginas"
            @click="pagina += 1"
          >
            Siguiente
          </UButton>
        </div>
      </div>

      <p
        v-if="filtrados.length === 0"
        class="text-sm text-neutral-500 py-6 text-center"
      >
        Ningún asunto coincide con este filtro.
      </p>
    </template>
  </div>
</template>
