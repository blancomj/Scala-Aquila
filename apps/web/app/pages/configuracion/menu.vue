<script setup lang="ts">
// Personalización del menú lateral por tenant — el administrador reordena
// grupos, mueve ítems entre ellos, les cambia el nombre (con botón de
// restablecer al original) y los apaga/prende; el resto de miembros con
// acceso a Configuración puede ver esta pantalla (mismo permiso que las
// demás páginas de configuracion/), pero no editar ni guardar: la RLS de
// sidebar_config ya lo impide, esto solo evita el intento inútil en la UI.
import draggable from 'vuedraggable'
import { NAV_GRUPOS } from '~/utils/navegacion'
import {
  aplicarConfiguracionMenu,
  type NavItemPersonalizado,
} from '~/composables/useMenuPersonalizado'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'settings:manage' })

interface GrupoEditable {
  titulo: string
  items: NavItemPersonalizado[]
}

const tenantStore = useTenantStore()
const sidebarConfigStore = useSidebarConfigStore()
const toast = useToast()

const esAdministrador = computed(() => tenantStore.role === 'administrador')

const gruposEditables = ref<GrupoEditable[]>([])

// Todos los grupos arrancan colapsados — tanto en el editor como en la vista
// previa, con el mismo estado (abrir uno se refleja en ambos paneles a la
// vez). Guarda los títulos ABIERTOS, al revés que NavSidebar.vue (que guarda
// los cerrados en cookie): acá no hace falta persistir entre visitas, es
// solo una comodidad mientras se edita.
const gruposAbiertos = ref<Set<string>>(new Set())

function alternarGrupoAbierto(titulo: string): void {
  const nuevo = new Set(gruposAbiertos.value)
  if (nuevo.has(titulo)) nuevo.delete(titulo)
  else nuevo.add(titulo)
  gruposAbiertos.value = nuevo
}

// Nombre original de cada ítem (catálogo de código, nunca personalizado) —
// para saber si un ítem tiene un nombre custom y poder restablecerlo.
const labelOriginalPorRuta = new Map<string, string>()
for (const grupo of NAV_GRUPOS) {
  for (const item of grupo.items) labelOriginalPorRuta.set(item.to, item.label)
}

function esNombrePersonalizado(item: NavItemPersonalizado): boolean {
  return item.label !== labelOriginalPorRuta.get(item.to)
}

function restablecerNombre(item: NavItemPersonalizado): void {
  item.label = labelOriginalPorRuta.get(item.to) ?? item.label
}

function alternarVisibilidad(item: NavItemPersonalizado): void {
  item.oculto = !item.oculto
}

function copiarDesdeConfiguracionActual(): void {
  gruposEditables.value = aplicarConfiguracionMenu(NAV_GRUPOS, sidebarConfigStore.configuracion).map(
    (grupo) => ({ titulo: grupo.titulo, items: [...grupo.items] }),
  )
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await sidebarConfigStore.cargar(tenantId)
  copiarDesdeConfiguracionActual()
}
watch(() => tenantStore.activeTenant?.id, cargar, { immediate: true })

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  try {
    await sidebarConfigStore.guardar(tenantId, {
      grupos: gruposEditables.value.map((g) => g.titulo),
      items: Object.fromEntries(gruposEditables.value.map((g) => [g.titulo, g.items.map((i) => i.to)])),
      etiquetas: Object.fromEntries(
        gruposEditables.value
          .flatMap((g) => g.items)
          .filter(esNombrePersonalizado)
          .map((item) => [item.to, item.label]),
      ),
      ocultos: gruposEditables.value
        .flatMap((g) => g.items)
        .filter((item) => item.oculto)
        .map((item) => item.to),
    })
    toast.add({ title: 'Orden del menú guardado.', color: 'success' })
  } catch {
    toast.add({ title: 'No se pudo guardar el orden del menú.', color: 'error' })
  }
}

async function restablecer(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await sidebarConfigStore.restablecer(tenantId)
  copiarDesdeConfiguracionActual()
  toast.add({ title: 'Menú restablecido al orden predeterminado.', color: 'success' })
}
</script>

<template>
  <div class="max-w-4xl mx-auto p-6 space-y-6">
    <div>
      <h1 class="text-lg font-medium">Orden del menú lateral</h1>
      <p class="text-sm text-muted mt-1">
        Arrastrá los grupos y los ítems para cambiar el orden en que aparecen en el menú lateral de
        esta copropiedad, editá el nombre de cualquier ítem y apagalo si no lo necesitás. Los
        cambios aplican para todos los miembros del tenant.
      </p>
    </div>

    <p v-if="!esAdministrador" class="text-sm text-muted rounded-md border p-3">
      Solo un administrador puede cambiar el orden del menú. Podés ver cómo está configurado hoy.
    </p>

    <div class="grid gap-6 md:grid-cols-2">
      <div class="space-y-2">
        <p class="text-xs font-medium text-muted uppercase tracking-wide">Editor</p>
        <draggable
          v-model="gruposEditables"
          item-key="titulo"
          handle=".grip-grupo"
          :disabled="!esAdministrador"
          class="space-y-2"
        >
          <template #item="{ element: grupo }">
            <div class="rounded-md border">
              <div class="flex items-center gap-2 px-2 py-2 bg-elevated/50">
                <UIcon
                  name="i-lucide-grip-vertical"
                  class="grip-grupo size-4 text-muted"
                  :class="esAdministrador ? 'cursor-grab' : 'cursor-not-allowed'"
                />
                <button
                  type="button"
                  class="flex items-center gap-1.5 flex-1 text-left"
                  @click="alternarGrupoAbierto(grupo.titulo)"
                >
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="size-3.5 text-muted transition-transform"
                    :class="gruposAbiertos.has(grupo.titulo) ? 'rotate-90' : ''"
                  />
                  <span class="text-sm font-medium">{{ grupo.titulo }}</span>
                </button>
              </div>
              <draggable
                v-show="gruposAbiertos.has(grupo.titulo)"
                v-model="grupo.items"
                item-key="to"
                group="menu-items"
                handle=".grip-item"
                :disabled="!esAdministrador"
                class="px-2 py-1.5 pl-8 space-y-1 min-h-8"
              >
                <template #item="{ element: item }">
                  <div class="flex items-center gap-2 text-sm" :class="item.oculto ? 'opacity-50' : ''">
                    <UIcon
                      name="i-lucide-grip-vertical"
                      class="grip-item size-3.5 text-muted"
                      :class="esAdministrador ? 'cursor-grab' : 'cursor-not-allowed'"
                    />
                    <span v-if="!esAdministrador">{{ item.label }}</span>
                    <template v-else>
                      <UInput v-model="item.label" size="xs" class="flex-1" />
                      <UButton
                        v-if="esNombrePersonalizado(item)"
                        icon="i-lucide-rotate-ccw"
                        size="xs"
                        variant="ghost"
                        aria-label="Restablecer nombre original"
                        :title="`Restablecer a «${labelOriginalPorRuta.get(item.to)}»`"
                        @click="restablecerNombre(item)"
                      />
                      <UButton
                        :icon="item.oculto ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                        size="xs"
                        variant="ghost"
                        :aria-label="item.oculto ? 'Mostrar en el menú' : 'Ocultar del menú'"
                        :title="item.oculto ? 'Oculto — no aparece en el menú' : 'Visible en el menú'"
                        @click="alternarVisibilidad(item)"
                      />
                    </template>
                  </div>
                </template>
              </draggable>
            </div>
          </template>
        </draggable>
      </div>

      <div class="space-y-2">
        <p class="text-xs font-medium text-muted uppercase tracking-wide">Vista previa</p>
        <div class="rounded-md border p-3 space-y-3">
          <div
            v-for="grupo in gruposEditables"
            v-show="grupo.items.some((item) => !item.oculto)"
            :key="grupo.titulo"
          >
            <button
              type="button"
              class="flex items-center gap-1.5 mb-1"
              @click="alternarGrupoAbierto(grupo.titulo)"
            >
              <UIcon
                name="i-lucide-chevron-right"
                class="size-3 text-muted transition-transform"
                :class="gruposAbiertos.has(grupo.titulo) ? 'rotate-90' : ''"
              />
              <p class="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {{ grupo.titulo }}
              </p>
            </button>
            <template v-if="gruposAbiertos.has(grupo.titulo)">
              <p
                v-for="item in grupo.items.filter((i) => !i.oculto)"
                :key="item.to"
                class="text-sm pl-2 py-0.5"
              >
                {{ item.label }}
              </p>
            </template>
          </div>
        </div>
      </div>
    </div>

    <div v-if="esAdministrador" class="flex gap-2">
      <UButton :loading="sidebarConfigStore.guardando" @click="guardar">Guardar</UButton>
      <UButton variant="soft" :loading="sidebarConfigStore.guardando" @click="restablecer">
        Restablecer al orden predeterminado
      </UButton>
    </div>
  </div>
</template>
