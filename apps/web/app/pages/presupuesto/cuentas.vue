<script setup lang="ts">
// Catálogo de cuentas presupuestales (E8) — administración completa del
// árbol: crear, editar (nombre/código/orden/estado/padre) y
// activar/desactivar. Mismo patrón que conceptos/dependencias.vue
// (página anidada, enlazada desde la página padre) y el patrón
// tabla-solo-lectura + acciones por fila de conceptos/index.vue — no se
// inventa un patrón de edición inline nuevo (no existe ninguno en el
// resto del proyecto).
//
// Reparentar (mover "Editar" → cambiar "Cuenta padre") es seguro desde
// 20260823210000: el guard rechaza de antemano cualquier movida que
// dejaría un descendiente más allá del nivel 4, y
// propagar_presupuesto_cuenta_ruta recalcula en cascada el nivel/ruta de
// todos los descendientes. La naturaleza sigue siendo inmutable una vez
// creada la cuenta — eso no cambia.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()

await useAsyncData('presupuesto-cuentas', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return []
  return presupuestoStore.cargarCuentas(tenantId)
})

// `ruta` es un path materializado zero-padded — el orden lexicográfico ya
// coincide con el orden del árbol (mismo criterio que
// PresupuestoTabComponentes.vue).
const arbol = computed(() =>
  [...presupuestoStore.cuentas].sort((a, b) => a.ruta.localeCompare(b.ruta)),
)

const drawerAbierto = ref(false)
const cuentaEnEdicion = ref<(typeof presupuestoStore.cuentas)[number] | null>(null)
const parentIdParaNueva = ref<string | undefined>(undefined)

function abrirNueva(parentId?: string): void {
  cuentaEnEdicion.value = null
  parentIdParaNueva.value = parentId
  drawerAbierto.value = true
}

function abrirEdicion(cuenta: (typeof presupuestoStore.cuentas)[number]): void {
  cuentaEnEdicion.value = cuenta
  parentIdParaNueva.value = undefined
  drawerAbierto.value = true
}

function cerrarDrawer(): void {
  drawerAbierto.value = false
  cuentaEnEdicion.value = null
}

const cambiandoActivaId = ref<string | null>(null)
const errorActiva = ref<string | null>(null)

async function alternarActiva(cuenta: (typeof presupuestoStore.cuentas)[number]): Promise<void> {
  errorActiva.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  cambiandoActivaId.value = cuenta.id
  try {
    await presupuestoStore.actualizarCuenta({
      id: cuenta.id,
      tenantId,
      activa: !cuenta.activa,
    })
  } catch (excepcion) {
    errorActiva.value =
      excepcion instanceof Error ? excepcion.message : 'No se pudo cambiar el estado.'
  } finally {
    cambiandoActivaId.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold mb-2">Catálogo de cuentas presupuestales</h1>
        <p class="text-sm text-gray-500">
          Árbol de cuentas por tenant (E8) — estable entre versiones de presupuesto, hasta 4
          niveles.
        </p>
      </div>
      <div class="flex items-center gap-4">
        <NuxtLink to="/presupuesto" class="text-sm text-primary hover:underline">
          ← Volver a Presupuesto
        </NuxtLink>
        <UButton size="sm" @click="abrirNueva()">Nueva cuenta raíz</UButton>
      </div>
    </div>

    <UAlert v-if="errorActiva" color="error" variant="soft" :title="errorActiva" />

    <p v-if="arbol.length === 0" class="text-gray-500 text-sm">
      Esta copropiedad todavía no tiene cuentas presupuestales.
    </p>

    <UiTabla
      v-else
      :columnas="[
        { clave: 'nombre', etiqueta: 'Cuenta' },
        { clave: 'codigo', etiqueta: 'Código' },
        { clave: 'naturaleza', etiqueta: 'Naturaleza' },
        { clave: 'tipo', etiqueta: 'Tipo' },
        { clave: 'orden', etiqueta: 'Orden', alinear: 'derecha' },
        { clave: 'estado', etiqueta: 'Estado' },
        { clave: 'acciones', etiqueta: '' },
      ]"
      :filas="arbol"
      :clave-fila="(fila) => fila.id"
    >
      <template #celda-nombre="{ fila }">
        <span :style="{ paddingLeft: `${(fila.nivel - 1) * 16}px` }" :class="{ 'font-medium': fila.nivel === 1 }">
          {{ fila.nombre }}
        </span>
      </template>
      <template #celda-codigo="{ fila }"><span class="font-mono text-xs">{{ fila.codigo }}</span></template>
      <template #celda-naturaleza="{ fila }">
        <span class="text-gray-500">{{ fila.naturaleza === 'egreso' ? 'Egreso' : 'Ingreso' }}</span>
      </template>
      <template #celda-tipo="{ fila }">
        <span class="text-gray-500">{{ fila.es_hoja ? 'Hoja' : 'Grupo' }}</span>
      </template>
      <template #celda-orden="{ fila }"><span class="text-gray-500">{{ fila.orden }}</span></template>
      <template #celda-estado="{ fila }">
        <span :class="fila.activa ? 'text-green-600' : 'text-gray-400'">
          {{ fila.activa ? 'Activa' : 'Inactiva' }}
        </span>
      </template>
      <template #celda-acciones="{ fila }">
        <div class="flex gap-2">
          <UButton size="xs" variant="soft" @click="abrirEdicion(fila)">Editar</UButton>
          <UButton size="xs" variant="soft" @click="abrirNueva(fila.id)">+ Subcuenta</UButton>
          <UButton
            size="xs"
            variant="ghost"
            :loading="cambiandoActivaId === fila.id"
            @click="alternarActiva(fila)"
          >
            {{ fila.activa ? 'Desactivar' : 'Activar' }}
          </UButton>
        </div>
      </template>
    </UiTabla>

    <PresupuestoCuentaDrawer
      v-if="drawerAbierto && tenantStore.activeTenant"
      :tenant-id="tenantStore.activeTenant.id"
      :cuenta="cuentaEnEdicion ?? undefined"
      :parent-id-inicial="parentIdParaNueva"
      @cerrar="cerrarDrawer"
      @creada="cerrarDrawer"
      @editada="cerrarDrawer"
    />
  </div>
</template>
