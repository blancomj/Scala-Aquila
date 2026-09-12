<script setup lang="ts">
// EXS-6 · Marketplace de la copropiedad.
//
// La pestaña del tablón sale de fn_marketplace_listar — la MISMA función
// que verá el residente cuando exista la capa externa—, así que la vista de
// gestión no puede dar la ilusión de que un aviso se ve mejor de lo que se
// ve: si aquí no aparece un dato, allá tampoco.
//
// La escalera de aprobación no se replica en el cliente: la impone el guard
// de la base. Aquí solo se ocultan los botones que sabemos que fallarían.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const marketplaceStore = useMarketplaceStore()
const tercerosStore = useTercerosStore()
const catalogosStore = useCatalogosStore()

type Tab = 'tablon' | 'gestion'
const TABS: ReadonlyArray<{ id: Tab; etiqueta: string }> = [
  { id: 'tablon', etiqueta: 'Tablón' },
  { id: 'gestion', etiqueta: 'Gestión' },
]
const tabActiva = ref<Tab>('tablon')

const tipos = ref<{ id: number; codigo: string; nombre: string }[]>([])
const categorias = ref<{ id: number; codigo: string; nombre: string }[]>([])
const condiciones = ref<{ id: number; codigo: string; nombre: string }[]>([])
const motivos = ref<{ id: number; codigo: string; nombre: string }[]>([])

const SENTINEL_TODAS = 'todas'
const filtroCategoria = ref<string>(SENTINEL_TODAS)
const busqueda = ref('')

// El rol sale de la membresía de la copropiedad ACTIVA (store §7.1/§10.3):
// la misma persona puede ser administrador en una y auxiliar en otra.
const esAdministrador = computed(() => tenantStore.role === 'administrador')

async function cargarTodo(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const valores = await catalogosStore.cargarValores(tenantId)
  const de = (tipo: string) =>
    valores.filter((v) => v.tipo === tipo).map((v) => ({ id: v.id, codigo: v.codigo, nombre: v.nombre }))
  tipos.value = de('TIPO_PUBLICACION_MARKETPLACE')
  categorias.value = de('CATEGORIA_MARKETPLACE')
  condiciones.value = de('CONDICION_ARTICULO')
  motivos.value = de('MOTIVO_REPORTE_MARKETPLACE')
  await Promise.all([
    marketplaceStore.cargarTablon(tenantId),
    marketplaceStore.cargarGestion(tenantId),
    tercerosStore.cargarTerceros(tenantId),
  ])
  await firmarPortadas()
}
onMounted(async () => {
  await cargarTodo()
  await abrirDesdeEnlace()
})
watch(() => tenantStore.activeTenant?.id, cargarTodo)

// Deep link de EXS-7: `/marketplace?publicacion=<id>` abre el aviso concreto
// en vez de dejar al usuario buscándolo en la lista. Marketplace no tiene
// página de detalle propia, así que el "contexto exacto" que pide el prompt
// 06 §12 se resuelve con la pestaña correcta y el drawer abierto.
const ruta = useRoute()

async function abrirDesdeEnlace(): Promise<void> {
  const id = ruta.query.publicacion
  if (typeof id !== 'string' || id === '') return
  const existe = marketplaceStore.publicaciones.some((p) => p.id === id)
  if (!existe) return
  tabActiva.value = 'gestion'
  await abrirIntereses(id)
}

async function aplicarFiltros(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await marketplaceStore.cargarTablon(tenantId, {
    categoriaId: filtroCategoria.value === SENTINEL_TODAS ? null : Number(filtroCategoria.value),
    texto: busqueda.value.trim() || undefined,
  })
  await firmarPortadas()
}

// El bucket es privado, así que la portada de cada tarjeta necesita su
// propia URL firmada. Se piden todas juntas al terminar de cargar el tablón,
// y no una por tarjeta al renderizar, para no disparar N peticiones desde
// el template.
const portadas = ref<Record<string, string>>({})

async function firmarPortadas(): Promise<void> {
  const conFoto = marketplaceStore.tablon.filter((a) => a.portadaPath !== null)
  const firmadas = await Promise.all(
    conFoto.map(async (a) => {
      try {
        return [a.id, await documentosStore.urlDescarga(a.portadaPath!)] as const
      } catch {
        // Una portada que no se puede firmar no debe tumbar el tablón: la
        // tarjeta se muestra sin imagen.
        return null
      }
    }),
  )
  portadas.value = Object.fromEntries(firmadas.filter((f) => f !== null))
}

const itemsCategoriaFiltro = computed(() => [
  { value: SENTINEL_TODAS, label: 'Todas las categorías' },
  ...categorias.value.map((c) => ({ value: String(c.id), label: c.nombre })),
])

const itemsTercero = computed(() =>
  tercerosStore.terceros.map((t) => ({
    valor: t.id,
    etiqueta: t.nombre_completo ?? t.razon_social ?? t.numero_documento,
  })),
)

const nombreCategoria = computed(() => new Map(categorias.value.map((c) => [c.id, c.nombre])))

// formatoMoneda es el punto único de verdad del repositorio (lo consolidó
// una auditoría tras encontrarlo copiado 18 veces, con una copia divergente).
// Aquí NO se hace aritmética con el precio —solo se muestra—, así que no hay
// cálculo monetario fuera de financial-kernel.
function formatearPrecio(valor: number | null): string {
  return valor === null ? '—' : formatoMoneda(valor)
}

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: 'Borrador',
  pendiente_aprobacion: 'Por aprobar',
  publicada: 'Publicada',
  rechazada: 'Rechazada',
  pausada: 'Pausada',
  cerrada: 'Cerrada',
  expirada: 'Expirada',
}

function claseEstado(estado: string): string {
  if (estado === 'publicada')
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
  if (estado === 'pendiente_aprobacion')
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
  if (estado === 'rechazada')
    return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
  return 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
}

// ── Alta y edición ──
const drawerAbierto = ref(false)
const guardando = ref(false)
const edicion = ref({
  id: undefined as string | undefined,
  publicadorTerceroId: '',
  identidadPublica: '',
  tipoId: undefined as number | undefined,
  categoriaId: undefined as number | undefined,
  condicionId: undefined as number | undefined,
  titulo: '',
  descripcion: '',
  precio: undefined as number | undefined,
  negociable: true,
  vigenteHasta: '',
})

function abrirNueva(): void {
  edicion.value = {
    id: undefined,
    publicadorTerceroId: '',
    identidadPublica: '',
    tipoId: tipos.value[0]?.id,
    categoriaId: categorias.value[0]?.id,
    condicionId: undefined,
    titulo: '',
    descripcion: '',
    precio: undefined as number | undefined,
    negociable: true,
    vigenteHasta: '',
  }
  drawerAbierto.value = true
}

function abrirEdicion(id: string): void {
  const p = marketplaceStore.publicaciones.find((x) => x.id === id)
  if (!p) return
  edicion.value = {
    id: p.id,
    publicadorTerceroId: p.publicadorTerceroId,
    identidadPublica: p.identidadPublica,
    tipoId: p.tipoId,
    categoriaId: p.categoriaId,
    condicionId: p.condicionId ?? undefined,
    titulo: p.titulo,
    descripcion: p.descripcion ?? '',
    precio: p.precio ?? undefined,
    negociable: p.negociable,
    vigenteHasta: p.vigenteHasta ?? '',
  }
  drawerAbierto.value = true
}

const puedeGuardar = computed(
  () =>
    edicion.value.publicadorTerceroId.length > 0 &&
    edicion.value.identidadPublica.trim().length > 0 &&
    edicion.value.titulo.trim().length > 0 &&
    edicion.value.tipoId !== undefined &&
    edicion.value.categoriaId !== undefined,
)

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !puedeGuardar.value) return
  guardando.value = true
  try {
    const ok = await marketplaceStore.guardar({
      id: edicion.value.id,
      tenantId,
      publicadorTerceroId: edicion.value.publicadorTerceroId,
      identidadPublica: edicion.value.identidadPublica.trim(),
      tipoId: edicion.value.tipoId!,
      categoriaId: edicion.value.categoriaId!,
      condicionId: edicion.value.condicionId ?? null,
      titulo: edicion.value.titulo.trim(),
      descripcion: edicion.value.descripcion.trim() || null,
      precio: edicion.value.precio ?? null,
      negociable: edicion.value.negociable,
      vigenteHasta: edicion.value.vigenteHasta || null,
    })
    if (ok) {
      drawerAbierto.value = false
      await cargarTodo()
    }
  } finally {
    guardando.value = false
  }
}

async function transicionar(id: string, estado: Parameters<typeof marketplaceStore.cambiarEstado>[1]): Promise<void> {
  const ok = await marketplaceStore.cambiarEstado(id, estado)
  if (ok) await cargarTodo()
}

// ── Rechazo, que exige motivo ──
const rechazoAbierto = ref(false)
const rechazoId = ref<string | null>(null)
const motivoRechazo = ref('')

function abrirRechazo(id: string): void {
  rechazoId.value = id
  motivoRechazo.value = ''
  rechazoAbierto.value = true
}

async function confirmarRechazo(): Promise<void> {
  if (!rechazoId.value || motivoRechazo.value.trim() === '') return
  const ok = await marketplaceStore.cambiarEstado(rechazoId.value, 'rechazada', {
    motivoRechazo: motivoRechazo.value.trim(),
  })
  if (ok) {
    rechazoAbierto.value = false
    await cargarTodo()
  }
}

// ── Interesados ──
const interesAbierto = ref(false)
const interesPublicacionId = ref<string | null>(null)
const nuevoInteres = ref({ nombre: '', mensaje: '' })

async function abrirIntereses(id: string): Promise<void> {
  interesPublicacionId.value = id
  nuevoInteres.value = { nombre: '', mensaje: '' }
  await marketplaceStore.cargarIntereses(id)
  interesAbierto.value = true
}

async function registrarInteres(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !interesPublicacionId.value || nuevoInteres.value.nombre.trim() === '') return
  const ok = await marketplaceStore.registrarInteres({
    tenantId,
    publicacionId: interesPublicacionId.value,
    interesadoNombre: nuevoInteres.value.nombre.trim(),
    mensaje: nuevoInteres.value.mensaje.trim() || null,
  })
  if (ok) {
    nuevoInteres.value = { nombre: '', mensaje: '' }
    await marketplaceStore.cargarIntereses(interesPublicacionId.value)
    await cargarTodo()
  }
}

// ── Fotos ──
//
// Van por `documentos` con la columna FK `publicacion_id` (EXS-3 hizo lo
// mismo con los anuncios), y la subida pasa por la Edge Function
// subir-documento: `documentos` no tiene policy INSERT para `authenticated`,
// así que no hay —ni debe haber— un insert directo desde aquí.
const documentosStore = useDocumentosStore()
const fotosAbierto = ref(false)
const fotoPublicacionId = ref<string | null>(null)
const fotosUrls = ref<{ id: string; nombre: string; url: string }[]>([])
const errorFoto = ref<string | null>(null)
const tipoDocumentoFoto = ref<number | null>(null)

async function refrescarFotos(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !fotoPublicacionId.value) return
  const filas = await documentosStore.cargarFotosPublicacion(tenantId, fotoPublicacionId.value)
  // El bucket es privado: cada miniatura necesita su propia URL firmada.
  fotosUrls.value = await Promise.all(
    filas.map(async (f) => ({
      id: f.id!,
      nombre: f.nombre_archivo ?? 'foto',
      url: await documentosStore.urlDescarga(f.storage_path!),
    })),
  )
}

async function abrirFotos(id: string): Promise<void> {
  errorFoto.value = null
  fotoPublicacionId.value = id
  fotosUrls.value = []
  const tenantId = tenantStore.activeTenant?.id
  if (tenantId && tipoDocumentoFoto.value === null) {
    const valores = await catalogosStore.cargarValores(tenantId)
    tipoDocumentoFoto.value =
      valores.find((v) => v.tipo === 'TIPO_DOCUMENTO' && v.codigo === 'fotografia')?.id ?? null
  }
  await refrescarFotos()
  fotosAbierto.value = true
}

async function subirFoto(evento: Event): Promise<void> {
  const input = evento.target as HTMLInputElement
  const archivo = input.files?.[0]
  const tenantId = tenantStore.activeTenant?.id
  if (!archivo || !tenantId || !fotoPublicacionId.value || tipoDocumentoFoto.value === null) return
  errorFoto.value = null
  try {
    await documentosStore.subirDocumento({
      tenantId,
      inmuebleId: null,
      tipoDocumentoId: tipoDocumentoFoto.value,
      archivo,
      publicacionId: fotoPublicacionId.value,
    })
    await refrescarFotos()
  } catch (e) {
    errorFoto.value = mensajeError(e, 'No se pudo subir la foto.')
  } finally {
    input.value = ''
  }
}

async function marcarAtendido(id: string): Promise<void> {
  const ok = await marketplaceStore.marcarInteresAtendido(id)
  if (ok && interesPublicacionId.value) {
    await marketplaceStore.cargarIntereses(interesPublicacionId.value)
  }
}
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion>
      <template #titulo>
        <h1 class="text-xl font-semibold">Marketplace</h1>
      </template>
      <template #descripcion>
        El tablón de avisos entre vecinos. La copropiedad <strong>no interviene en la
        transacción</strong>: no cobra, no media y no garantiza nada — el precio es informativo y
        el trato se cierra por fuera. Lo único que hace es poner en contacto: un aviso no muestra
        teléfono ni correo, y quien se interesa deja su dato aquí.
      </template>
    </UiTituloDescripcion>

    <nav
      class="flex gap-1 border-b border-neutral-200 dark:border-neutral-800"
      role="tablist"
      aria-label="Secciones del Marketplace"
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

    <p v-if="marketplaceStore.error" class="text-sm text-red-600 dark:text-red-400">
      {{ marketplaceStore.error }}
    </p>

    <!-- ── Tablón ── -->
    <div v-if="tabActiva === 'tablon'" role="tabpanel" class="space-y-4">
      <div class="flex items-center gap-3">
        <UInput
          v-model="busqueda"
          placeholder="Buscar en los avisos"
          class="w-72"
          @keyup.enter="aplicarFiltros"
        />
        <USelect v-model="filtroCategoria" :items="itemsCategoriaFiltro" class="w-56" />
        <UButton size="xs" variant="outline" @click="aplicarFiltros">Buscar</UButton>
      </div>

      <p
        v-if="marketplaceStore.tablon.length === 0"
        class="text-sm text-neutral-500 py-8 text-center"
      >
        No hay avisos publicados. Crea uno en «Gestión» y apruébalo para que aparezca aquí.
      </p>

      <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="a in marketplaceStore.tablon"
          :key="a.id"
          class="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col"
        >
          <img
            v-if="portadas[a.id]"
            :src="portadas[a.id]"
            :alt="a.titulo"
            class="w-full h-40 object-cover bg-neutral-100 dark:bg-neutral-800"
          >
          <div class="p-4 space-y-2 flex flex-col grow">
          <div class="flex items-start justify-between gap-2">
            <h3 class="text-sm font-medium">{{ a.titulo }}</h3>
            <span class="text-[11px] text-neutral-500 whitespace-nowrap">{{ a.tipoNombre }}</span>
          </div>

          <p class="text-base font-semibold">
            {{ formatearPrecio(a.precio) }}
            <span v-if="a.precio !== null && a.negociable" class="text-xs font-normal text-neutral-500">
              · negociable
            </span>
          </p>

          <p v-if="a.descripcion" class="text-xs text-neutral-600 dark:text-neutral-400 grow">
            {{ a.descripcion }}
          </p>

          <dl class="text-xs space-y-1">
            <div class="flex gap-1">
              <dt class="text-neutral-500">Publica:</dt>
              <dd>{{ a.identidadPublica }}</dd>
            </div>
            <div class="flex gap-1">
              <dt class="text-neutral-500">Categoría:</dt>
              <dd>{{ a.categoriaNombre }}</dd>
            </div>
            <div v-if="a.condicionNombre" class="flex gap-1">
              <dt class="text-neutral-500">Estado:</dt>
              <dd>{{ a.condicionNombre }}</dd>
            </div>
          </dl>

          <div class="flex items-center justify-between pt-1">
            <span class="text-xs text-neutral-500">
              {{ a.intereses }} interesado{{ a.intereses === 1 ? '' : 's' }}
            </span>
            <UButton size="xs" variant="outline" @click="abrirIntereses(a.id)">
              Estoy interesado
            </UButton>
          </div>
          </div>
        </article>
      </div>
    </div>

    <!-- ── Gestión ── -->
    <div v-else role="tabpanel" class="space-y-3">
      <div class="flex items-center justify-between">
        <p class="text-xs text-neutral-500">
          Un aviso no se publica solo: lo que captura un auxiliar lo aprueba un administrador.
        </p>
        <UButton icon="i-lucide-plus" size="xs" @click="abrirNueva">Nuevo aviso</UButton>
      </div>

      <UiTabla
        :columnas="[
          { clave: 'titulo', etiqueta: 'Aviso' },
          { clave: 'categoria', etiqueta: 'Categoría' },
          { clave: 'precio', etiqueta: 'Precio' },
          { clave: 'estado', etiqueta: 'Estado' },
          { clave: 'acciones', etiqueta: '' },
        ]"
        :filas="marketplaceStore.publicaciones"
        :clave-fila="(p) => p.id"
        vacio="Todavía no hay avisos."
      >
        <template #celda-titulo="{ fila }">
          <div>
            <p>{{ fila.titulo }}</p>
            <p class="text-xs text-neutral-500">{{ fila.identidadPublica }}</p>
          </div>
        </template>
        <template #celda-categoria="{ fila }">
          {{ nombreCategoria.get(fila.categoriaId) ?? '—' }}
        </template>
        <template #celda-precio="{ fila }">
          {{ formatearPrecio(fila.precio) }}
        </template>
        <template #celda-estado="{ fila }">
          <span class="px-2 py-0.5 rounded-full text-[11px]" :class="claseEstado(fila.estado)">
            {{ ETIQUETA_ESTADO[fila.estado] ?? fila.estado }}
          </span>
          <p v-if="fila.motivoRechazo" class="text-[11px] text-neutral-500 mt-1">
            {{ fila.motivoRechazo }}
          </p>
        </template>
        <template #celda-acciones="{ fila }">
          <div class="flex gap-2 justify-end flex-wrap">
            <UButton
              v-if="fila.estado === 'borrador'"
              size="xs"
              variant="ghost"
              @click="abrirEdicion(fila.id)"
            >
              Editar
            </UButton>
            <UButton size="xs" variant="ghost" @click="abrirFotos(fila.id)">Fotos</UButton>
            <UButton
              v-if="fila.estado === 'borrador' && !esAdministrador"
              size="xs"
              variant="outline"
              @click="transicionar(fila.id, 'pendiente_aprobacion')"
            >
              Enviar a aprobación
            </UButton>
            <UButton
              v-if="fila.estado === 'borrador' && esAdministrador"
              size="xs"
              variant="outline"
              @click="transicionar(fila.id, 'publicada')"
            >
              Publicar
            </UButton>
            <UButton
              v-if="fila.estado === 'pendiente_aprobacion'"
              size="xs"
              variant="outline"
              @click="transicionar(fila.id, 'publicada')"
            >
              Aprobar
            </UButton>
            <UButton
              v-if="fila.estado === 'pendiente_aprobacion'"
              size="xs"
              variant="ghost"
              @click="abrirRechazo(fila.id)"
            >
              Rechazar
            </UButton>
            <UButton
              v-if="fila.estado === 'publicada'"
              size="xs"
              variant="ghost"
              @click="abrirIntereses(fila.id)"
            >
              Interesados
            </UButton>
            <UButton
              v-if="fila.estado === 'publicada'"
              size="xs"
              variant="ghost"
              @click="transicionar(fila.id, 'pausada')"
            >
              Pausar
            </UButton>
            <UButton
              v-if="fila.estado === 'pausada'"
              size="xs"
              variant="outline"
              @click="transicionar(fila.id, 'publicada')"
            >
              Reanudar
            </UButton>
            <UButton
              v-if="['publicada', 'pausada', 'expirada'].includes(fila.estado)"
              size="xs"
              variant="ghost"
              @click="transicionar(fila.id, 'cerrada')"
            >
              Cerrar
            </UButton>
          </div>
        </template>
      </UiTabla>
    </div>

    <!-- ── Alta y edición ── -->
    <UiDrawer
      :abierto="drawerAbierto"
      titulo="Aviso del marketplace"
      subtitulo="El precio es informativo. La copropiedad no participa en el trato."
      @cerrar="drawerAbierto = false"
    >
      <div class="space-y-4">
        <UFormField label="Quién publica" required hint="El tercero real. No se muestra en el tablón.">
          <UiSelectorBuscable
            v-model="edicion.publicadorTerceroId"
            :opciones="itemsTercero"
            placeholder="Buscar tercero…"
          />
        </UFormField>

        <UFormField
          label="Cómo se firma el aviso"
          required
          hint="Esto sí es lo que ve todo el mundo: «Lucía R. — Torre 2», «Panadería La Espiga»…"
        >
          <UInput v-model="edicion.identidadPublica" class="w-full" />
        </UFormField>

        <UFormField label="Título" required>
          <UInput v-model="edicion.titulo" placeholder="Sofá de tres puestos" class="w-full" />
        </UFormField>

        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Tipo" required>
            <USelect
              v-model="edicion.tipoId"
              :items="tipos.map((t) => ({ value: t.id, label: t.nombre }))"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Categoría" required>
            <USelect
              v-model="edicion.categoriaId"
              :items="categorias.map((c) => ({ value: c.id, label: c.nombre }))"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField label="Condición" hint="Solo para cosas. Un servicio no tiene condición.">
          <USelect
            v-model="edicion.condicionId"
            :items="condiciones.map((c) => ({ value: c.id, label: c.nombre }))"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Descripción">
          <UTextarea v-model="edicion.descripcion" :rows="3" class="w-full" />
        </UFormField>

        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Precio" hint="Vacío si es un regalo">
            <UInput v-model.number="edicion.precio" type="number" class="w-full" />
          </UFormField>
          <UFormField label="Vigente hasta" hint="Vacío = sin caducidad">
            <UInput v-model="edicion.vigenteHasta" type="date" class="w-full" />
          </UFormField>
        </div>

        <UCheckbox v-model="edicion.negociable" label="Precio negociable" />

        <p v-if="marketplaceStore.error" class="text-sm text-red-600 dark:text-red-400">
          {{ marketplaceStore.error }}
        </p>
      </div>

      <template #foot>
        <UButton variant="ghost" @click="drawerAbierto = false">Cancelar</UButton>
        <UButton :disabled="!puedeGuardar || guardando" :loading="guardando" @click="guardar">
          Guardar aviso
        </UButton>
      </template>
    </UiDrawer>

    <!-- ── Rechazo ── -->
    <UiDrawer
      :abierto="rechazoAbierto"
      titulo="Rechazar el aviso"
      subtitulo="El motivo queda guardado: quien lo capturó necesita saber qué corregir."
      @cerrar="rechazoAbierto = false"
    >
      <UFormField label="Motivo del rechazo" required>
        <UTextarea v-model="motivoRechazo" :rows="3" class="w-full" />
      </UFormField>

      <template #foot>
        <UButton variant="ghost" @click="rechazoAbierto = false">Cancelar</UButton>
        <UButton color="error" :disabled="motivoRechazo.trim() === ''" @click="confirmarRechazo">
          Rechazar
        </UButton>
      </template>
    </UiDrawer>

    <!-- ── Fotos ── -->
    <UiDrawer
      :abierto="fotosAbierto"
      titulo="Fotos del aviso"
      subtitulo="JPG o PNG, hasta 15 MB. Cada foto se guarda aparte: subir una nueva no reemplaza a las anteriores."
      @cerrar="fotosAbierto = false"
    >
      <div class="space-y-4">
        <div v-if="fotosUrls.length === 0" class="text-sm text-neutral-500 py-6 text-center">
          Este aviso todavía no tiene fotos.
        </div>

        <div v-else class="grid grid-cols-2 gap-3">
          <figure
            v-for="f in fotosUrls"
            :key="f.id"
            class="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden"
          >
            <img :src="f.url" :alt="f.nombre" class="w-full h-32 object-cover" >
            <figcaption class="text-[11px] text-neutral-500 px-2 py-1 truncate">
              {{ f.nombre }}
            </figcaption>
          </figure>
        </div>

        <UFormField label="Añadir una foto">
          <input
            type="file"
            accept="image/jpeg,image/png"
            class="block w-full text-sm text-neutral-600 dark:text-neutral-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-neutral-100 dark:file:bg-neutral-800 file:text-neutral-700 dark:file:text-neutral-300"
            :disabled="documentosStore.subiendo"
            @change="subirFoto"
          >
        </UFormField>

        <p v-if="documentosStore.subiendo" class="text-xs text-neutral-500">Subiendo…</p>
        <p v-if="errorFoto" class="text-sm text-red-600 dark:text-red-400">{{ errorFoto }}</p>
      </div>

      <template #foot>
        <UButton variant="ghost" @click="fotosAbierto = false">Cerrar</UButton>
      </template>
    </UiDrawer>

    <!-- ── Interesados ── -->
    <UiDrawer
      :abierto="interesAbierto"
      titulo="Interesados"
      subtitulo="Este es el único canal de contacto: el aviso no muestra teléfono ni correo."
      @cerrar="interesAbierto = false"
    >
      <div class="space-y-4">
        <UiTabla
          :columnas="[
            { clave: 'quien', etiqueta: 'Quién' },
            { clave: 'mensaje', etiqueta: 'Mensaje' },
            { clave: 'acciones', etiqueta: '' },
          ]"
          :filas="marketplaceStore.intereses"
          :clave-fila="(i) => i.id"
          vacio="Todavía nadie ha preguntado."
        >
          <template #celda-quien="{ fila }">
            {{ fila.interesadoNombre ?? '—' }}
          </template>
          <template #celda-mensaje="{ fila }">
            {{ fila.mensaje ?? '—' }}
          </template>
          <template #celda-acciones="{ fila }">
            <UButton v-if="!fila.atendido" size="xs" variant="ghost" @click="marcarAtendido(fila.id)">
              Marcar atendido
            </UButton>
            <span v-else class="text-xs text-neutral-500">Atendido</span>
          </template>
        </UiTabla>

        <div class="border-t border-neutral-200 dark:border-neutral-800 pt-4 space-y-3">
          <p class="text-xs text-neutral-500">Registrar un interesado</p>
          <UFormField label="Quién pregunta" required>
            <UInput v-model="nuevoInteres.nombre" placeholder="Alguien del 302" class="w-full" />
          </UFormField>
          <UFormField label="Mensaje">
            <UInput v-model="nuevoInteres.mensaje" placeholder="¿Sigue disponible?" class="w-full" />
          </UFormField>
          <UButton size="xs" :disabled="nuevoInteres.nombre.trim() === ''" @click="registrarInteres">
            Registrar interés
          </UButton>
        </div>
      </div>

      <template #foot>
        <UButton variant="ghost" @click="interesAbierto = false">Cerrar</UButton>
      </template>
    </UiDrawer>
  </div>
</template>
