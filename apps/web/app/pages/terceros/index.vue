<script setup lang="ts">
// Mantenimiento de terceros (PROMPT_MANTENIMIENTO_TERCEROS.md §6.1, T1-T4).
// Una sola ruta: crear y editar comparten el mismo modal sobre esta misma
// página (§6.1) — a diferencia de la ficha de inmueble no hace falta
// separar rutas.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const tercerosStore = useTercerosStore()

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
  await Promise.all([tercerosStore.cargarTerceros(tenantId), tercerosStore.cargarCatalogos(tenantId)])
})
</script>

<template>
  <div class="ficha-inmueble">
    <div class="sheet">
      <div class="masthead">
        <div>
          <p class="eyebrow">Configuración</p>
          <h1>Terceros</h1>
          <p class="title-sub">Personas naturales y jurídicas del tenant — base para roles sobre inmuebles.</p>
        </div>
        <UButton @click="abrirCrear">Nuevo tercero</UButton>
      </div>

      <UButtonGroup size="xs" class="mb-3">
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
      </UButtonGroup>

      <UiTabla
        :columnas="[
          { clave: 'tercero', etiqueta: 'Tercero' },
          { clave: 'documento', etiqueta: 'Documento', claseCelda: 'mono' },
          { clave: 'email', etiqueta: 'Email' },
          { clave: 'telefono', etiqueta: 'Teléfono', claseCelda: 'mono' },
          { clave: 'estado', etiqueta: 'Estado' },
          { clave: 'acciones', etiqueta: '' },
        ]"
        :filas="tercerosFiltrados"
        :clave-fila="(t) => t.id"
        vacio="Ninguno."
      >
        <template #celda-tercero="{ fila }">
          <div class="tercero-nombre">{{ fila.nombre_completo }}</div>
          <div class="tercero-sub">
            {{ fila.tipo_persona === 'natural' ? 'Persona natural' : 'Persona jurídica' }}
          </div>
        </template>
        <template #celda-documento="{ fila }">{{ fila.numero_documento }}<template v-if="fila.digito_verificacion">-{{ fila.digito_verificacion }}</template></template>
        <template #celda-email="{ fila }">{{ fila.email ?? '—' }}</template>
        <template #celda-telefono="{ fila }">{{ fila.telefono ?? '—' }}</template>
        <template #celda-estado="{ fila }">
          <UBadge :color="nombreEstado(fila.estado_id) === 'Activo' ? 'success' : 'neutral'" variant="subtle">
            {{ nombreEstado(fila.estado_id) }}
          </UBadge>
        </template>
        <template #celda-acciones="{ fila }">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Editar"
            @click="abrirEditar(fila.id)"
          >
            ✎
          </UButton>
        </template>
      </UiTabla>
    </div>

    <TercerosTerceroModal v-if="modalAbierto" :tercero-id="terceroEditando" @cerrar="cerrarModal" @guardado="alGuardar" />
  </div>
</template>
