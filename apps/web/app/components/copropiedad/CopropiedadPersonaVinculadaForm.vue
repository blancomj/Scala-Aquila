<script setup lang="ts">
// Modal "Agregar persona" — Personas vinculadas a la copropiedad
// (PROMPT_FICHA_COPROPIEDAD.md §7.3). A diferencia de InmueblePersonaForm,
// aquí se elige entre terceros YA REGISTRADOS (select, sin crear inline) y
// sin restricción de tipo_persona — un administrador o contador puede ser
// natural o jurídico indistintamente (a diferencia de representante
// legal/pagador, donde sí aplica esa restricción).
//
// Genérico por familia de rol (`familiaRol`) — reutilizado tanto para
// "Personas vinculadas" (PERSONA_COPROPIEDAD) como para "Consejo de
// administración" (ROL_CONCEJO_COPROPIEDAD): tenant_tercero_rol.rol_id no
// lleva guard de familia (20260822090000_tenant_tercero_rol.sql), así que
// la única diferencia entre ambos usos es qué familia de lista_tipos
// alimenta el selector de rol.
//
// Contenido en Nuxt UI (UFormField/UInput/UCheckbox/UButton), mismo
// criterio que politicas/PoliticasVersionDrawer.vue (23-08-2026). De paso
// se agrega el <div class="ficha-inmueble"> que faltaba alrededor de
// <UiDrawer> (bug documentado en MiembroDrawer.vue).
import type { Database } from '@aquila/shared'

const props = withDefaults(
  defineProps<{
    familiaRol: string
    titulo?: string
    subtitulo?: string
    mostrarTarjetaProfesional?: boolean
  }>(),
  {
    titulo: 'Agregar persona',
    subtitulo: 'Vincula un tercero a la copropiedad con un rol',
    mostrarTarjetaProfesional: true,
  },
)

const emit = defineEmits<{ cerrar: []; guardado: [] }>()

const tenantStore = useTenantStore()
const tercerosStore = useTercerosStore()

const terceroId = ref('')
const rolId = ref<number | null>(null)
const vigenteDesde = ref(new Date().toISOString().slice(0, 10))
const recibeNotificaciones = ref(true)
const numeroTarjetaProfesional = ref('')

const guardando = ref(false)
const error = ref<string | null>(null)

const rolesFamilia = shallowRef<Database['public']['Tables']['lista_tipos']['Row'][]>([])


const opcionesTercero = computed(() =>
  tercerosStore.terceros.map((t) => ({
    valor: t.id,
    etiqueta: `${t.nombre_completo} — ${t.numero_documento}`,
  })),
)
const opcionesRol = computed(() =>
  rolesFamilia.value.map((r) => ({ valor: r.id, etiqueta: r.nombre })),
)

watchEffect(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  rolesFamilia.value = await cargarListaTipos(tenantId, props.familiaRol)
})

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !terceroId.value || rolId.value === null) return

  error.value = null
  guardando.value = true
  try {
    await tercerosStore.asociarTerceroTenant({
      tenantId,
      terceroId: terceroId.value,
      rolId: rolId.value,
      vigenteDesde: vigenteDesde.value,
      recibeNotificaciones: recibeNotificaciones.value,
      numeroTarjetaProfesional: numeroTarjetaProfesional.value || undefined,
    })
    emit('guardado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo vincular la persona.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer
      :abierto="true"
      :titulo="titulo"
      :subtitulo="subtitulo"
      @cerrar="emit('cerrar')"
    >
      <div class="space-y-4 text-sm">
        <UFormField label="Tercero" name="tercero_id" help="Natural o jurídico, sin restricción.">
          <UiSelectorBuscable v-model="terceroId" :opciones="opcionesTercero" placeholder="Buscar tercero…" />
        </UFormField>
        <UFormField label="Rol" name="rol_id">
          <UiSelectorBuscable v-model="rolId" :opciones="opcionesRol" placeholder="Seleccione" />
        </UFormField>
        <UFormField label="Vigente desde" name="vigente_desde">
          <UInput v-model="vigenteDesde" type="date" class="w-full" />
        </UFormField>
        <UFormField
          v-if="mostrarTarjetaProfesional"
          label="Tarjeta profesional"
          name="numero_tarjeta_profesional"
          help="Opcional — aplica a contador, revisor fiscal, abogado."
        >
          <UInput v-model="numeroTarjetaProfesional" type="text" placeholder="Número de tarjeta profesional" class="w-full" />
        </UFormField>
        <UCheckbox v-model="recibeNotificaciones" label="Recibe notificaciones" />
      </div>
      <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-4" />

      <template #foot>
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="guardando" @click="guardar">Guardar</UButton>
      </template>
    </UiDrawer>
  </div>
</template>
