<script setup lang="ts">
// Mantenimiento de lista_tipos por tenant (fuera de alcance histórico,
// señalado en composables/useListaTipos.ts: "Configuración → Catálogos").
// Cada familia (`tipos`) es fija — no se crea ninguna acá, tipos no tiene
// política INSERT. Dentro de una familia, un tenant ve los valores de
// plataforma (tenant_id null, solo lectura) junto a los suyos propios
// (editables — nombre/orden, nunca codigo — y desactivables, nunca
// borrados). RLS ya impide escribir sobre filas de plataforma
// (lista_tipos_insert_agent/update_agent exigen tenant_id is not null).
//
// Lo único que un tenant sí puede hacer sobre una fila de plataforma es
// ocultarla de sus propios selectores (lista_tipos_ocultos, 20260830360000)
// — no la edita ni la borra, y no afecta a otros tenants. Registros ya
// guardados que usan un valor oculto lo siguen mostrando normal.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

const tenantStore = useTenantStore()
const catalogosStore = useCatalogosStore()

const error = ref<string | null>(null)
const guardando = ref(false)

await useAsyncData('catalogos-base', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return null
  await Promise.all([
    catalogosStore.cargarFamilias(),
    catalogosStore.cargarValores(tenantId),
    catalogosStore.cargarOcultos(tenantId),
  ])
  return null
})

const familiaActivaCodigo = ref<string | null>(null)

const familiaActiva = computed(() => {
  const buscado = catalogosStore.familias.find((f) => f.codigo === familiaActivaCodigo.value)
  return buscado ?? catalogosStore.familias[0] ?? null
})

const conteoPorFamilia = computed(() => {
  const mapa = new Map<string, number>()
  for (const v of catalogosStore.valores) {
    if (!v.activo) continue
    mapa.set(v.tipo, (mapa.get(v.tipo) ?? 0) + 1)
  }
  return mapa
})

const valoresFamilia = computed(() => {
  if (!familiaActiva.value) return []
  return catalogosStore.valores
    .filter((v) => v.tipo === familiaActiva.value!.codigo)
    .sort((a, b) => a.orden - b.orden)
})

const opcionesFamilia = computed(() =>
  catalogosStore.familias.map((f) => ({
    valor: f.codigo,
    etiqueta: `${f.nombre} (${conteoPorFamilia.value.get(f.codigo) ?? 0})`,
  })),
)

// ── modal crear/editar ───────────────────────────────────────────────
const modalAbierto = ref(false)
const valorEditando = ref<(typeof catalogosStore.valores)[number] | null>(null)
const formCodigo = ref('')
const formNombre = ref('')
const formOrden = ref(1)

function abrirNuevo(): void {
  valorEditando.value = null
  formCodigo.value = ''
  formNombre.value = ''
  formOrden.value = valoresFamilia.value.length + 1
  modalAbierto.value = true
}

function abrirEdicion(valor: (typeof catalogosStore.valores)[number]): void {
  valorEditando.value = valor
  formCodigo.value = valor.codigo
  formNombre.value = valor.nombre
  formOrden.value = valor.orden
  modalAbierto.value = true
}

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !familiaActiva.value || !formNombre.value.trim()) return

  error.value = null
  guardando.value = true
  try {
    if (valorEditando.value) {
      await catalogosStore.actualizarValor(valorEditando.value.id, tenantId, {
        nombre: formNombre.value.trim(),
        orden: formOrden.value,
      })
    } else {
      if (!formCodigo.value.trim()) return
      await catalogosStore.crearValor({
        tenantId,
        tipo: familiaActiva.value.codigo,
        codigo: formCodigo.value.trim(),
        nombre: formNombre.value.trim(),
        orden: formOrden.value,
      })
    }
    modalAbierto.value = false
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar el valor.')
  } finally {
    guardando.value = false
  }
}

async function alternarActivo(valor: (typeof catalogosStore.valores)[number]): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    await catalogosStore.cambiarActivo(valor.id, tenantId, !valor.activo)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo cambiar el estado.')
  }
}

async function alternarOculto(valor: (typeof catalogosStore.valores)[number]): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    if (catalogosStore.ocultosIds.has(valor.id)) {
      await catalogosStore.mostrarValor(valor.id, tenantId)
    } else {
      await catalogosStore.ocultarValor(valor.id, tenantId)
    }
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo cambiar la visibilidad.')
  }
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <h1 class="text-xl font-semibold mb-1">Catálogos</h1>
      <p class="text-sm text-neutral-500 max-w-2xl">
        Cada familia mezcla los valores de plataforma (comunes a todos los tenants, solo lectura)
        con los que esta copropiedad agregó por su cuenta.
      </p>
    </div>

    <UAlert v-if="error" color="error" variant="soft" :title="error" />

    <div class="flex items-end justify-between gap-4 flex-wrap">
      <div class="max-w-xs w-64">
        <label class="block text-xs font-medium uppercase tracking-wide text-neutral-400 mb-1.5" for="familia-selector">
          Familia
        </label>
        <UiSelectorBuscable
          id="familia-selector"
          :model-value="familiaActiva?.codigo ?? null"
          :opciones="opcionesFamilia"
          placeholder="Selecciona una familia…"
          @update:model-value="(v) => (familiaActivaCodigo = v as string | null)"
        />
      </div>
      <UButton v-if="familiaActiva" size="sm" @click="abrirNuevo">Agregar valor</UButton>
    </div>

    <section v-if="familiaActiva" class="min-w-0 space-y-3">
      <p v-if="familiaActiva.descripcion" class="text-sm text-neutral-500 max-w-2xl -mt-1">
        {{ familiaActiva.descripcion }}
      </p>

      <UiTabla
        :columnas="[
          { clave: 'codigo', etiqueta: 'Código', claseCelda: 'font-mono text-xs text-neutral-500' },
          { clave: 'nombre', etiqueta: 'Nombre' },
          { clave: 'orden', etiqueta: 'Orden', alinear: 'derecha' },
          { clave: 'origen', etiqueta: 'Origen' },
          { clave: 'estado', etiqueta: 'Estado' },
          { clave: 'acciones', etiqueta: '' },
        ]"
        :filas="valoresFamilia"
        :clave-fila="(v) => v.id"
        vacio="Sin valores en esta familia."
      >
        <template #celda-orden="{ fila }">
          <span class="tabular-nums text-neutral-500">{{ fila.orden }}</span>
        </template>
        <template #celda-origen="{ fila }">
          <span v-if="fila.tenant_id === null" class="inline-flex text-neutral-400" title="Item bloqueado">
            <UIcon name="i-lucide-lock" class="size-4" />
          </span>
          <UBadge v-else color="primary" variant="subtle" size="sm">Copropiedad</UBadge>
        </template>
        <template #celda-estado="{ fila }">
          <UBadge v-if="!fila.activo" color="neutral" variant="subtle" size="sm">Inactivo</UBadge>
          <UBadge
            v-else-if="fila.tenant_id === null && catalogosStore.ocultosIds.has(fila.id)"
            color="neutral"
            variant="subtle"
            size="sm"
          >
            Oculto
          </UBadge>
        </template>
        <template #celda-acciones="{ fila }">
          <div v-if="fila.tenant_id !== null" class="flex justify-end gap-1">
            <UButton size="xs" variant="ghost" icon="i-lucide-pencil" title="Editar" @click="abrirEdicion(fila)" />
            <UButton
              size="xs"
              variant="ghost"
              :icon="fila.activo ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              :title="fila.activo ? 'Desactivar' : 'Reactivar'"
              @click="alternarActivo(fila)"
            />
          </div>
          <div v-else class="flex justify-end gap-1">
            <UButton
              size="xs"
              variant="ghost"
              :icon="catalogosStore.ocultosIds.has(fila.id) ? 'i-lucide-eye' : 'i-lucide-eye-off'"
              :title="catalogosStore.ocultosIds.has(fila.id) ? 'Mostrar' : 'Ocultar'"
              @click="alternarOculto(fila)"
            />
          </div>
        </template>
      </UiTabla>
      <p class="text-xs text-neutral-400 flex items-center gap-1">
        <UIcon name="i-lucide-lock" class="size-3.5" /> — valor de referencia de plataforma, no
        editable acá (se puede ocultar solo para esta copropiedad).
        <strong class="text-neutral-500 font-medium">Copropiedad</strong> — agregado por este
        tenant; se puede desactivar, nunca se borra.
      </p>
    </section>

    <UModal
      :open="modalAbierto"
      :title="valorEditando ? 'Editar valor' : 'Agregar valor'"
      @update:open="(abierto) => { if (!abierto) modalAbierto = false }"
    >
      <template #body>
        <div class="space-y-4 text-sm">
          <UFormField name="codigo">
            <template #label>
              <span class="inline-flex items-baseline gap-1.5">
                <span>Código</span>
                <span v-if="valorEditando" class="text-xs font-normal text-neutral-400">— no se puede cambiar</span>
                <span v-else class="text-xs font-normal text-neutral-400">— minúsculas, sin espacios</span>
              </span>
            </template>
            <UInput v-model="formCodigo" :disabled="!!valorEditando" placeholder="ej. fondo_reserva" class="w-full" />
          </UFormField>
          <UFormField label="Nombre" name="nombre">
            <UInput v-model="formNombre" placeholder="ej. Fondo de reserva" class="w-full" />
          </UFormField>
          <UFormField label="Orden" name="orden" class="w-28">
            <UInput v-model.number="formOrden" type="number" min="1" class="w-full" />
          </UFormField>
          <p v-if="!valorEditando" class="text-xs text-neutral-400">
            Queda marcado como "Copropiedad" — visible solo para este tenant.
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="modalAbierto = false">Cancelar</UButton>
          <UButton :loading="guardando" :disabled="!formNombre.trim() || (!valorEditando && !formCodigo.trim())" @click="guardar">
            {{ valorEditando ? 'Guardar' : 'Crear' }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
