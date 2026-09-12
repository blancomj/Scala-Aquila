<script setup lang="ts">
// EXS-4 · Directorio de la copropiedad.
//
// La pestaña de consulta muestra EXACTAMENTE lo que verá quien no es
// administrador el día que exista el portal: sale de fn_directorio_listar,
// la misma función, sin datos de más. Así la vista de gestión no puede
// generar la ilusión de que una ficha se ve mejor de lo que se ve.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const directorioStore = useDirectorioStore()
const tercerosStore = useTercerosStore()
const catalogosStore = useCatalogosStore()
const documentosStore = useDocumentosStore()

// ── Fotos (20260933810000) ──
//
// La función del directorio devuelve la RUTA de la portada, no una URL: el
// bucket es privado y firmar en SQL exigiría meter ahí su clave. Se firma
// aquí, una vez por ficha visible, y se guarda en un mapa para no volver a
// pedirlo en cada re-render.
const portadas = ref<Record<string, string>>({})

async function firmarPortadas(): Promise<void> {
  const pendientes = directorioStore.fichas.filter(
    (f) => f.portadaPath !== null && !(f.perfilId in portadas.value),
  )
  await Promise.all(
    pendientes.map(async (f) => {
      try {
        portadas.value[f.perfilId] = await documentosStore.urlDescarga(f.portadaPath!)
      } catch {
        // Una portada que no se puede firmar no debe tumbar el directorio:
        // la ficha se muestra sin imagen, que es como estaba antes.
      }
    }),
  )
}

type Tab = 'consultar' | 'gestion'
const TABS: ReadonlyArray<{ id: Tab; etiqueta: string }> = [
  { id: 'consultar', etiqueta: 'Directorio' },
  { id: 'gestion', etiqueta: 'Gestión de fichas' },
]
const tabActiva = ref<Tab>('consultar')

const categorias = ref<{ id: number; codigo: string; nombre: string }[]>([])
const SENTINEL_TODAS = 'todas'
const filtroCategoria = ref<string>(SENTINEL_TODAS)
const busqueda = ref('')

async function cargarTodo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const valores = await catalogosStore.cargarValores(tenantId)
  categorias.value = valores
    .filter((v) => v.tipo === 'CATEGORIA_COMERCIO')
    .map((v) => ({ id: v.id, codigo: v.codigo, nombre: v.nombre }))
  await Promise.all([
    directorioStore.cargarDirectorio(tenantId),
    directorioStore.cargarPerfiles(tenantId),
    tercerosStore.cargarTerceros(tenantId),
  ])
  await firmarPortadas()
}
onMounted(cargarTodo)
watch(() => tenantStore.activeTenant?.id, cargarTodo)

async function aplicarFiltros(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await directorioStore.cargarDirectorio(tenantId, {
    categoriaId: filtroCategoria.value === SENTINEL_TODAS ? null : Number(filtroCategoria.value),
    texto: busqueda.value.trim() || undefined,
  })
  await firmarPortadas()
}

const itemsCategoria = computed(() => [
  { value: SENTINEL_TODAS, label: 'Todas las categorías' },
  ...categorias.value.map((c) => ({ value: String(c.id), label: c.nombre })),
])

// ── Gestión ──
const nombreTercero = computed(
  () => new Map(tercerosStore.terceros.map((t) => [t.id, t.nombre_completo ?? t.razon_social ?? '—'])),
)

const drawerAbierto = ref(false)
const guardando = ref(false)
const edicion = ref({
  terceroId: '',
  nombreComercial: '',
  descripcion: '',
  // USelect de Nuxt UI no admite null en el modelo (espera number | undefined):
  // "sin categoría" viaja como undefined y se normaliza a null al guardar.
  categoriaComercioId: undefined as number | undefined,
  horario: '',
  contactoPublico: '',
})

function abrirNuevo(): void {
  edicion.value = {
    terceroId: '',
    nombreComercial: '',
    descripcion: '',
    categoriaComercioId: categorias.value[0]?.id,
    horario: '',
    contactoPublico: '',
  }
  drawerAbierto.value = true
}

function abrirEdicion(terceroId: string): void {
  const p = directorioStore.perfiles.find((x) => x.terceroId === terceroId)
  edicion.value = {
    terceroId,
    nombreComercial: p?.nombreComercial ?? '',
    descripcion: p?.descripcion ?? '',
    categoriaComercioId: p?.categoriaComercioId ?? categorias.value[0]?.id,
    horario: p?.horario ?? '',
    contactoPublico: p?.contactoPublico ?? '',
  }
  drawerAbierto.value = true
}

const puedeGuardar = computed(() => edicion.value.terceroId.length > 0)

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !puedeGuardar.value) return
  guardando.value = true
  try {
    const ok = await directorioStore.guardarPerfil({
      tenantId,
      terceroId: edicion.value.terceroId,
      nombreComercial: edicion.value.nombreComercial.trim() || null,
      descripcion: edicion.value.descripcion.trim() || null,
      categoriaComercioId: edicion.value.categoriaComercioId ?? null,
      horario: edicion.value.horario.trim() || null,
      contactoPublico: edicion.value.contactoPublico.trim() || null,
    })
    if (ok) {
      drawerAbierto.value = false
      await cargarTodo()
    }
  } finally {
    guardando.value = false
  }
}

// Las fotos se gestionan por PERFIL, no por tercero: la FK cuelga del
// perfil porque es lo publicable (20260933810000).
const fotosAbierto = ref(false)
const perfilFotos = ref<string | null>(null)

function abrirFotos(perfilId: string): void {
  perfilFotos.value = perfilId
  fotosAbierto.value = true
}

async function cerrarFotos(): Promise<void> {
  fotosAbierto.value = false
  // La portada de la tarjeta sale de la función, así que hay que releer
  // para que una foto recién subida aparezca en la pestaña de consulta.
  await cargarTodo()
}

async function alternarPublicacion(terceroId: string, publicado: boolean): Promise<void> {
  const ok = await directorioStore.cambiarPublicacion(terceroId, publicado)
  if (ok) await cargarTodo()
}

// UiSelectorBuscable usa valor/etiqueta, no value/label: el catálogo de
// terceros de una copropiedad puede tener decenas de entradas, así que va
// con búsqueda local en vez de un USelect largo (convención del proyecto).
const itemsTercero = computed(() =>
  tercerosStore.terceros.map((t) => ({
    valor: t.id,
    etiqueta: t.nombre_completo ?? t.razon_social ?? t.numero_documento,
  })),
)
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion>
      <template #titulo>
        <h1 class="text-xl font-semibold">Directorio</h1>
      </template>
      <template #descripcion>
        Los negocios, comercios y proveedores de la copropiedad, con lo que cada uno acepta
        mostrar. No es la lista de terceros: aquí solo aparece quien tiene ficha publicada, y de
        cada ficha solo se muestra lo comercial — nunca el documento, el correo o el teléfono de
        notificación.
      </template>
    </UiTituloDescripcion>

    <nav
      class="flex gap-1 border-b border-neutral-200 dark:border-neutral-800"
      role="tablist"
      aria-label="Secciones del Directorio"
    >
      <button
        v-for="tab in TABS"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="tabActiva === tab.id"
        class="px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors"
        :class="
          tabActiva === tab.id
            ? 'border-primary text-primary font-medium'
            : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
        "
        @click="tabActiva = tab.id"
      >
        {{ tab.etiqueta }}
      </button>
    </nav>

    <p v-if="directorioStore.error" class="text-sm text-red-600 dark:text-red-400">
      {{ directorioStore.error }}
    </p>

    <!-- ── Consulta ── -->
    <div v-if="tabActiva === 'consultar'" role="tabpanel" class="space-y-4">
      <div class="flex items-center gap-3">
        <UInput
          v-model="busqueda"
          placeholder="Buscar por nombre o descripción"
          class="w-72"
          @keyup.enter="aplicarFiltros"
        />
        <USelect v-model="filtroCategoria" :items="itemsCategoria" class="w-56" />
        <UButton size="xs" variant="outline" @click="aplicarFiltros">Buscar</UButton>
      </div>

      <p v-if="directorioStore.fichas.length === 0" class="text-sm text-neutral-500 py-8 text-center">
        Todavía no hay fichas publicadas. Crea una en «Gestión de fichas» y publícala.
      </p>

      <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="f in directorioStore.fichas"
          :key="f.terceroId"
          class="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden"
        >
          <img
            v-if="portadas[f.perfilId]"
            :src="portadas[f.perfilId]"
            :alt="`Imagen de ${f.nombreComercial ?? 'la ficha'}`"
            class="w-full h-32 object-cover"
            loading="lazy"
          >
          <div class="p-4 space-y-2">
          <div>
            <h3 class="text-sm font-medium">{{ f.nombreComercial }}</h3>
            <p v-if="f.categoriaNombre" class="text-xs text-neutral-500">{{ f.categoriaNombre }}</p>
          </div>
          <p v-if="f.descripcion" class="text-xs text-neutral-600 dark:text-neutral-400">
            {{ f.descripcion }}
          </p>
          <dl class="text-xs space-y-1">
            <div v-if="f.ubicaciones.length > 0" class="flex gap-1">
              <dt class="text-neutral-500">Ubicación:</dt>
              <dd>{{ f.ubicaciones.join(', ') }}</dd>
            </div>
            <div v-if="f.horario" class="flex gap-1">
              <dt class="text-neutral-500">Horario:</dt>
              <dd>{{ f.horario }}</dd>
            </div>
            <div v-if="f.contactoPublico" class="flex gap-1">
              <dt class="text-neutral-500">Contacto:</dt>
              <dd class="font-mono">{{ f.contactoPublico }}</dd>
            </div>
          </dl>

          <!-- Enlace al tablón como BÚSQUEDA por el nombre comercial, no
               como consulta por tercero. El marketplace solo expone
               `identidad_publica` y nunca el tercero que publicó (EXS-6):
               cruzar ficha y avisos por el id delataría, en todos los demás
               avisos, a quién pertenece cada uno. Esto no revela nada que
               el usuario no pudiera teclear él mismo en el buscador. -->
          <NuxtLink
            v-if="f.nombreComercial"
            :to="`/marketplace?texto=${encodeURIComponent(f.nombreComercial)}`"
            class="inline-block text-xs text-primary hover:underline"
          >
            Buscar sus avisos en el tablón →
          </NuxtLink>
          </div>
        </article>
      </div>
    </div>

    <!-- ── Gestión ── -->
    <div v-else role="tabpanel" class="space-y-3">
      <div class="flex items-center justify-between">
        <p class="text-xs text-neutral-500">
          Una ficha no se publica sola: créala y publícala cuando su contenido esté listo.
        </p>
        <UButton icon="i-lucide-plus" size="xs" @click="abrirNuevo">Nueva ficha</UButton>
      </div>

      <UiTabla
        :columnas="[
          { clave: 'nombre', etiqueta: 'Nombre comercial' },
          { clave: 'tercero', etiqueta: 'Tercero' },
          { clave: 'estado', etiqueta: 'Estado' },
          { clave: 'acciones', etiqueta: '' },
        ]"
        :filas="directorioStore.perfiles"
        :clave-fila="(p) => p.id"
        vacio="Todavía no hay fichas."
      >
        <template #celda-nombre="{ fila }">
          {{ fila.nombreComercial ?? '— sin nombre comercial —' }}
        </template>
        <template #celda-tercero="{ fila }">
          {{ nombreTercero.get(fila.terceroId) ?? '—' }}
        </template>
        <template #celda-estado="{ fila }">
          <span
            class="px-2 py-0.5 rounded-full text-[11px]"
            :class="
              fila.publicado
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
            "
          >
            {{ fila.publicado ? 'Publicada' : 'Sin publicar' }}
          </span>
        </template>
        <template #celda-acciones="{ fila }">
          <div class="flex gap-2 justify-end">
            <UButton size="xs" variant="ghost" @click="abrirEdicion(fila.terceroId)">Editar</UButton>
            <UButton size="xs" variant="ghost" @click="abrirFotos(fila.id)">Fotos</UButton>
            <UButton
              size="xs"
              :variant="fila.publicado ? 'ghost' : 'outline'"
              @click="alternarPublicacion(fila.terceroId, !fila.publicado)"
            >
              {{ fila.publicado ? 'Despublicar' : 'Publicar' }}
            </UButton>
          </div>
        </template>
      </UiTabla>
    </div>

    <UiDrawer
      :abierto="drawerAbierto"
      titulo="Ficha de directorio"
      subtitulo="Datos comerciales visibles. Los datos legales del tercero se editan en Terceros."
      @cerrar="drawerAbierto = false"
    >
      <div class="space-y-4">
        <UFormField label="Tercero" required>
          <UiSelectorBuscable
            v-model="edicion.terceroId"
            :opciones="itemsTercero"
            placeholder="Buscar tercero…"
          />
        </UFormField>

        <UFormField label="Nombre comercial" hint="Requerido para poder publicar la ficha">
          <UInput v-model="edicion.nombreComercial" placeholder="Panadería La Espiga" class="w-full" />
        </UFormField>

        <UFormField label="Categoría">
          <USelect
            v-model="edicion.categoriaComercioId"
            :items="categorias.map((c) => ({ value: c.id, label: c.nombre }))"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Descripción">
          <UTextarea v-model="edicion.descripcion" :rows="3" class="w-full" />
        </UFormField>

        <UFormField label="Horario">
          <UInput v-model="edicion.horario" placeholder="Lunes a sábado, 6:00 a.m. – 8:00 p.m." class="w-full" />
        </UFormField>

        <UFormField
          label="Contacto público"
          hint="El que el negocio acepta publicar. No se usa el teléfono ni el correo de notificación."
        >
          <UInput v-model="edicion.contactoPublico" class="w-full" />
        </UFormField>

        <p v-if="directorioStore.error" class="text-sm text-red-600 dark:text-red-400">
          {{ directorioStore.error }}
        </p>
      </div>

      <template #foot>
        <UButton variant="ghost" @click="drawerAbierto = false">Cancelar</UButton>
        <UButton :disabled="!puedeGuardar || guardando" :loading="guardando" @click="guardar">
          Guardar ficha
        </UButton>
      </template>
    </UiDrawer>

    <UiDrawer
      :abierto="fotosAbierto"
      titulo="Fotos de la ficha"
      subtitulo="La más antigua es la portada que se ve en el directorio. Cada imagen se guarda aparte: subir una nueva no reemplaza a las anteriores."
      @cerrar="cerrarFotos"
    >
      <UiGaleriaDocumentos
        v-if="perfilFotos"
        :perfil-id="perfilFotos"
        vacio="Esta ficha todavía no tiene imágenes."
      />
    </UiDrawer>
  </div>
</template>
