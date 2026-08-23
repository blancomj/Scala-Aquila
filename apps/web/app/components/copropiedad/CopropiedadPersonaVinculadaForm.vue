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
  <UiDrawer
    :abierto="true"
    :titulo="titulo"
    :subtitulo="subtitulo"
    @cerrar="emit('cerrar')"
  >
    <div class="form-grid" style="grid-template-columns: 1fr">
      <div class="field">
        <label for="pvt-tercero">Tercero</label>
        <UiSelectorBuscable
          id="pvt-tercero"
          v-model="terceroId"
          variante="ficha"
          :opciones="opcionesTercero"
          placeholder="Buscar tercero…"
        />
        <span class="field-hint">Natural o jurídico, sin restricción.</span>
      </div>
      <div class="field">
        <label for="pvt-rol">Rol</label>
        <UiSelectorBuscable
          id="pvt-rol"
          v-model="rolId"
          variante="ficha"
          :opciones="opcionesRol"
          placeholder="Seleccione"
        />
      </div>
      <div class="field">
        <label for="pvt-desde">Vigente desde</label>
        <input id="pvt-desde" v-model="vigenteDesde" type="date">
      </div>
      <div v-if="mostrarTarjetaProfesional" class="field">
        <label for="pvt-tarjeta">Tarjeta profesional</label>
        <input id="pvt-tarjeta" v-model="numeroTarjetaProfesional" type="text" placeholder="Número de tarjeta profesional">
        <span class="field-hint">Opcional — aplica a contador, revisor fiscal, abogado.</span>
      </div>
      <div class="field" style="flex-direction: row; align-items: center; gap: 8px">
        <input id="pvt-notif" v-model="recibeNotificaciones" type="checkbox" style="width: auto">
        <label for="pvt-notif" style="font-weight: 400">Recibe notificaciones</label>
      </div>
    </div>
    <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>

    <template #foot>
      <button type="button" class="btn btn--ghost" @click="emit('cerrar')">Cancelar</button>
      <button type="button" class="btn btn--primary" :disabled="guardando" @click="guardar">
        {{ guardando ? 'Guardando…' : 'Guardar' }}
      </button>
    </template>
  </UiDrawer>
</template>
