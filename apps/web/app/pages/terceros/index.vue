<script setup lang="ts">
// Mantenimiento de terceros (PROMPT_MANTENIMIENTO_TERCEROS.md §6.1, T1-T4).
// Una sola ruta: crear y editar comparten el mismo modal sobre esta misma
// página (§6.1) — a diferencia de la ficha de inmueble no hace falta
// separar rutas.
import type { VinculoInmueble } from '~/stores/terceros'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const tercerosStore = useTercerosStore()
const { abrirPara: abrirCompositorPara } = useCompositorCorreo()

const compositorActivo = computed(() => tenantStore.activeTenant?.compositor_correo_activo === true)

const filtro = ref<'todos' | 'natural' | 'juridica'>('todos')
const modalAbierto = ref(false)
const terceroEditando = ref<string | undefined>(undefined)

const tercerosFiltrados = computed(() => {
  if (filtro.value === 'todos') return tercerosStore.terceros
  return tercerosStore.terceros.filter((t) => t.tipo_persona === filtro.value)
})

function nombreEstado(estadoId: number): string {
  return tercerosStore.estadosGenerales.find((e) => e.id === estadoId)?.nombre ?? '—'
}

function vinculosDe(terceroId: string): VinculoInmueble[] {
  return tercerosStore.inmueblesPorTercero.get(terceroId) ?? []
}

function rolesDe(terceroId: string): string[] {
  return [...new Set(vinculosDe(terceroId).map((v) => v.rol))]
}

function abrirCrear(): void {
  terceroEditando.value = undefined
  modalAbierto.value = true
}

function abrirEditar(id: string): void {
  terceroEditando.value = id
  modalAbierto.value = true
}

function cerrarModal(): void {
  modalAbierto.value = false
}

async function alGuardar(): Promise<void> {
  modalAbierto.value = false
}

watchEffect(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    tercerosStore.cargarTerceros(tenantId),
    tercerosStore.cargarCatalogos(tenantId),
    tercerosStore.cargarInmueblesVinculados(tenantId),
  ])
})
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion clase-descripcion="text-sm text-neutral-500 mt-1 max-w-2xl">
      <template #titulo>
        <h1 class="text-xl font-semibold">Terceros</h1>
      </template>
      <template #descripcion>
        Personas naturales y jurídicas del tenant — base para roles sobre inmuebles.
      </template>
    </UiTituloDescripcion>

    <div class="flex items-center justify-between gap-4 flex-wrap">
      <UFieldGroup size="xs">
        <UButton
          :color="filtro === 'todos' ? 'primary' : 'neutral'"
          :variant="filtro === 'todos' ? 'solid' : 'outline'"
          @click="filtro = 'todos'"
        >
          Todos
        </UButton>
        <UButton
          :color="filtro === 'natural' ? 'primary' : 'neutral'"
          :variant="filtro === 'natural' ? 'solid' : 'outline'"
          @click="filtro = 'natural'"
        >
          Persona natural
        </UButton>
        <UButton
          :color="filtro === 'juridica' ? 'primary' : 'neutral'"
          :variant="filtro === 'juridica' ? 'solid' : 'outline'"
          @click="filtro = 'juridica'"
        >
          Persona jurídica
        </UButton>
      </UFieldGroup>
      <UButton icon="i-lucide-plus" size="xs" @click="abrirCrear">Nuevo tercero</UButton>
    </div>

    <UiTabla
      :columnas="[
        { clave: 'tercero', etiqueta: 'Tercero', ordenar: (t) => t.nombre_completo },
        { clave: 'documento', etiqueta: 'Documento', claseCelda: 'mono', ordenar: (t) => t.numero_documento },
        {
          clave: 'inmueble',
          etiqueta: 'Inmueble',
          ordenar: (t) => vinculosDe(t.id).map((v) => v.codigo).join(', ') || null,
        },
        { clave: 'email', etiqueta: 'Email', ordenar: (t) => t.email },
        { clave: 'telefono', etiqueta: 'Teléfono', claseCelda: 'mono', ordenar: (t) => t.telefono },
        { clave: 'estado', etiqueta: 'Estado', ordenar: (t) => nombreEstado(t.estado_id) },
        { clave: 'acciones', etiqueta: '' },
      ]"
      :filas="tercerosFiltrados"
      :clave-fila="(t) => t.id"
      vacio="Ninguno."
    >
      <template #celda-tercero="{ fila }">
        <button type="button" class="font-medium hover:text-primary hover:underline text-left" @click="abrirEditar(fila.id)">
          {{ fila.nombre_completo }}
        </button>
        <div class="text-xs text-neutral-400">
          {{ fila.tipo_persona === 'natural' ? 'Persona natural' : 'Persona jurídica' }}
          <template v-if="rolesDe(fila.id).length > 0"> · {{ rolesDe(fila.id).join(', ') }}</template>
        </div>
      </template>
      <template #celda-documento="{ fila }">{{ fila.numero_documento }}<template v-if="fila.digito_verificacion">-{{ fila.digito_verificacion }}</template></template>
      <template #celda-inmueble="{ fila }">
        <span v-if="vinculosDe(fila.id).length === 0" class="text-neutral-400">—</span>
        <template v-else>
          <template v-for="(vinculo, indice) in vinculosDe(fila.id)" :key="vinculo.inmuebleId">
            <span v-if="indice > 0">, </span>
            <NuxtLink :to="`/inmuebles/${vinculo.inmuebleId}`" class="hover:text-primary hover:underline">{{ vinculo.codigo }}</NuxtLink>
          </template>
        </template>
      </template>
      <template #celda-email="{ fila }">
        <button
          v-if="fila.email && compositorActivo"
          type="button"
          class="hover:text-primary hover:underline"
          @click="abrirCompositorPara(fila.id)"
        >
          {{ fila.email }}
        </button>
        <template v-else>{{ fila.email ?? '—' }}</template>
      </template>
      <template #celda-telefono="{ fila }">{{ fila.telefono ?? '—' }}</template>
      <template #celda-estado="{ fila }">
        <UBadge :color="nombreEstado(fila.estado_id) === 'Activo' ? 'success' : 'neutral'" variant="subtle">
          {{ nombreEstado(fila.estado_id) }}
        </UBadge>
      </template>
      <template #celda-acciones="{ fila }">
        <UTooltip text="Editar">
          <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-pencil" aria-label="Editar" @click="abrirEditar(fila.id)" />
        </UTooltip>
      </template>
    </UiTabla>

    <TercerosTerceroModal v-if="modalAbierto" :tercero-id="terceroEditando" @cerrar="cerrarModal" @guardado="alGuardar" />
  </div>
</template>
