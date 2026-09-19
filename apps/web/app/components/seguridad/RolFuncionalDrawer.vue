<script setup lang="ts">
// Drawer crear/editar rol funcional — PROMPT_PERMISOS_CAPA2.md §A3, el
// entregable principal del corte. Mismo criterio esCreacion que
// MiembroDrawer.vue (!rolId, no un prop aparte).
//
// Solo roles TENANT_ID propio son editables aquí (RLS lo exige igual,
// 20260950000000): los de plataforma (tenantId null) llegan de solo
// lectura — este drawer no se abre en modo edición para esos, seguridad/
// index.vue no ofrece el botón de editar sobre ellos.
import type { AccionRolFuncional, RolFuncionalTenant } from '~/stores/members'

const props = defineProps<{ rol?: RolFuncionalTenant }>()
const emit = defineEmits<{ cerrar: []; guardado: [] }>()

const tenantStore = useTenantStore()
const membersStore = useMembersStore()

const esCreacion = computed(() => !props.rol)

const nombre = ref('')
const descripcion = ref('')
const activo = ref(true)

// 'no' además de AccionRolFuncional: un módulo puede estar sin cubrir —
// eso no existe como valor de accion en la base (la fila simplemente no
// existe), así que a nivel de UI se modela como un tercer estado.
type EstadoModulo = AccionRolFuncional | 'no'
// Módulo → estado. Reemplaza el Set<string> de antes de la dimensión
// ver/actuar (20260951000000): un módulo ya no es "cubierto sí/no", tiene
// 3 estados — no cubre / solo ver / ver y actuar. "Actuar sin ver" no
// existe en el modelo de datos, por eso es un solo control de 3 valores
// por módulo (USelect) y no dos checkboxes independientes.
const estadoModulos = ref<Map<string, EstadoModulo>>(new Map())

const guardando = ref(false)
const eliminando = ref(false)
const error = ref<string | null>(null)
const asignaciones = ref<number | null>(null)

const OPCIONES_ESTADO: { label: string; value: EstadoModulo }[] = [
  { label: 'No cubre', value: 'no' },
  { label: 'Solo ver', value: 'ver' },
  { label: 'Ver y actuar', value: 'actuar' },
]

function precargar(): void {
  if (!props.rol) return
  nombre.value = props.rol.nombre
  descripcion.value = props.rol.descripcion ?? ''
  activo.value = props.rol.activo
  estadoModulos.value = new Map(props.rol.modulos.map((m) => [m.modulo, m.accion]))
}

watchEffect(() => {
  precargar()
})

onMounted(async () => {
  await membersStore.cargarCoberturaModulos()
  if (props.rol) {
    asignaciones.value = await membersStore.contarAsignacionesRolFuncional(props.rol.id)
  }
})

// §A3 guarda 2: avisar del efecto real ANTES de guardar, no después.
const quedaSinModulos = computed(() => estadoModulos.value.size === 0)

function estadoDe(codigo: string): EstadoModulo {
  return estadoModulos.value.get(codigo) ?? 'no'
}

function cambiarEstadoModulo(codigo: string, estado: EstadoModulo): void {
  const mapa = new Map(estadoModulos.value)
  if (estado === 'no') mapa.delete(codigo)
  else mapa.set(codigo, estado)
  estadoModulos.value = mapa
}

function validar(): string | null {
  if (!nombre.value.trim()) return 'El nombre es obligatorio.'
  return null
}

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const mensajeValidacion = validar()
  if (mensajeValidacion) {
    error.value = mensajeValidacion
    return
  }
  error.value = null
  guardando.value = true
  try {
    if (esCreacion.value) {
      await membersStore.crearRolFuncional(tenantId, {
        nombre: nombre.value.trim(),
        descripcion: descripcion.value.trim() || null,
      })
      // El rol recién creado ya está en rolesFuncionalesTenant — se le
      // agregan los módulos marcados en la misma sesión de guardado.
      const creado = membersStore.rolesFuncionalesTenant.find(
        (r) => r.nombre === nombre.value.trim() && r.tenantId === tenantId,
      )
      if (creado) {
        for (const [modulo, accion] of estadoModulos.value) {
          await membersStore.agregarModuloARol(creado.id, modulo, tenantId, accion as AccionRolFuncional)
        }
      }
    } else if (props.rol) {
      await membersStore.actualizarRolFuncional(
        props.rol.id,
        { nombre: nombre.value.trim(), descripcion: descripcion.value.trim() || null },
        tenantId,
      )
      if (activo.value !== props.rol.activo) {
        await membersStore.establecerActivoRolFuncional(props.rol.id, activo.value, tenantId)
      }
      const actuales = new Map(props.rol.modulos.map((m) => [m.modulo, m.accion]))
      for (const [modulo, accion] of estadoModulos.value) {
        const actual = actuales.get(modulo)
        if (!actual) await membersStore.agregarModuloARol(props.rol.id, modulo, tenantId, accion as AccionRolFuncional)
        else if (actual !== accion) await membersStore.cambiarAccionModulo(props.rol.id, modulo, accion as AccionRolFuncional, tenantId)
      }
      for (const modulo of actuales.keys()) {
        if (!estadoModulos.value.has(modulo)) {
          await membersStore.quitarModuloDeRol(props.rol.id, modulo, tenantId)
        }
      }
    }
    emit('guardado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar el rol funcional.')
  } finally {
    guardando.value = false
  }
}

async function eliminar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !props.rol) return
  error.value = null
  eliminando.value = true
  try {
    await membersStore.eliminarRolFuncional(props.rol.id, tenantId)
    emit('guardado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo eliminar el rol funcional.')
  } finally {
    eliminando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer
      :abierto="true"
      :titulo="esCreacion ? 'Crear rol funcional' : 'Editar rol funcional'"
      subtitulo="Solo administradores pueden crear roles y decidir qué módulos cubren."
      @cerrar="emit('cerrar')"
    >
      <div class="space-y-4 text-sm">
        <UFormField label="Nombre" name="nombre">
          <UInput v-model="nombre" type="text" placeholder="Ej. Director Financiero" class="w-full" />
        </UFormField>

        <UFormField label="Descripción" name="descripcion" help="Opcional — para qué sirve este rol.">
          <UTextarea v-model="descripcion" :rows="2" class="w-full" />
        </UFormField>

        <UFormField v-if="!esCreacion" label="Estado" name="activo">
          <UCheckbox v-model="activo" label="Rol activo" />
        </UFormField>

        <UFormField
          label="Módulos que cubre"
          name="modulos"
          help="'Ver' es solo visibilidad; 'ver y actuar' además permite crear/editar ahí. Sin ninguno marcado, el rol no restringe ni otorga nada."
        >
          <div class="space-y-1.5 mt-1">
            <div
              v-for="m in membersStore.coberturaModulos"
              :key="m.codigo ?? ''"
              class="flex items-center justify-between gap-3"
            >
              <span class="text-sm">{{ m.nombre ?? m.codigo ?? '' }}</span>
              <USelect
                :model-value="estadoDe(m.codigo ?? '')"
                :items="OPCIONES_ESTADO"
                value-key="value"
                class="w-40"
                @update:model-value="(v) => cambiarEstadoModulo(m.codigo ?? '', v as EstadoModulo)"
              />
            </div>
          </div>
        </UFormField>

        <UAlert
          v-if="quedaSinModulos"
          icon="i-lucide-info"
          color="warning"
          variant="soft"
          title="Este rol no otorga nada"
          description="Sin ningún módulo marcado, asignarle este rol a alguien no restringe ni le abre nada distinto de lo que ya ve por su nivel de acceso."
        />

        <UAlert
          v-if="asignaciones !== null && asignaciones > 0"
          icon="i-lucide-users"
          color="neutral"
          variant="soft"
          :title="`${asignaciones} miembro${asignaciones === 1 ? '' : 's'} ${asignaciones === 1 ? 'tiene' : 'tienen'} este rol asignado`"
          description="Revísalo desde la ficha de cada miembro antes de eliminarlo — un rol asignado no se puede borrar."
        />
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-4" />

      <template #foot>
        <UButton
          v-if="!esCreacion"
          variant="ghost"
          color="error"
          :loading="eliminando"
          :disabled="!!asignaciones"
          @click="eliminar"
        >
          Eliminar
        </UButton>
        <div class="flex-1" />
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="guardando" @click="guardar">Guardar</UButton>
      </template>
    </UiDrawer>
  </div>
</template>
