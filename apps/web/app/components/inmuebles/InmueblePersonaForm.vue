<script setup lang="ts">
// Formulario de persona asociada — rol condicional (PROMPT_FICHA_INMUEBLE.md
// §7.2). No sabe si el resultado se persiste de inmediato (modo ficha) o
// queda en espera hasta guardar el inmueble (modo creación) — eso lo
// decide InmuebleDatosBase, este componente solo recolecta y emite.
import type { Database } from '@aquila/shared'

type ListaTipoRow = Database['public']['Tables']['lista_tipos']['Row']

export interface PersonaFormPayload {
  readonly rolId: number
  readonly tipoIdentificacionId: number
  readonly numeroDocumento: string
  readonly nombre: string
  readonly email?: string
  readonly telefono?: string
  readonly porcentaje?: number
  readonly esPagador: boolean
  readonly recibeNotificaciones: boolean
  readonly vigenteDesde: string
  readonly vigenteHasta?: string
}

const props = defineProps<{ roles: readonly ListaTipoRow[] }>()
const emit = defineEmits<{ guardar: [PersonaFormPayload]; cancelar: [] }>()

const tenantStore = useTenantStore()
const tiposIdentificacion = shallowRef<ListaTipoRow[]>([])

watchEffect(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  tiposIdentificacion.value = await cargarListaTipos(tenantId, 'TIPO_IDENTIFICACION')
})

const rolId = ref<number | null>(null)
const tipoIdentificacionId = ref<number | null>(null)
const numeroDocumento = ref('')
const nombre = ref('')
const email = ref('')
const telefono = ref('')
const porcentaje = ref<number | null>(null)
const esPagador = ref(false)
const recibeNotificaciones = ref(true)
const vigenteDesde = ref(new Date().toISOString().slice(0, 10))
const vigenteHasta = ref('')

const rolSeleccionado = computed(() => props.roles.find((r) => r.id === rolId.value) ?? null)
const esCopropietario = computed(() => rolSeleccionado.value?.codigo === 'copropietario')

function guardar(): void {
  if (
    rolId.value === null ||
    tipoIdentificacionId.value === null ||
    !nombre.value.trim() ||
    !numeroDocumento.value.trim()
  )
    return
  emit('guardar', {
    rolId: rolId.value,
    tipoIdentificacionId: tipoIdentificacionId.value,
    numeroDocumento: numeroDocumento.value.trim(),
    nombre: nombre.value.trim(),
    email: email.value.trim() || undefined,
    telefono: telefono.value.trim() || undefined,
    porcentaje: esCopropietario.value && porcentaje.value !== null ? porcentaje.value : undefined,
    esPagador: esPagador.value,
    recibeNotificaciones: recibeNotificaciones.value,
    vigenteDesde: vigenteDesde.value,
    vigenteHasta: vigenteHasta.value || undefined,
  })
}
</script>

<template>
  <div class="form-grid">
    <div class="field">
      <label for="pf-rol">Rol</label>
      <select id="pf-rol" v-model.number="rolId">
        <option :value="null" disabled>— Elegir —</option>
        <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.nombre }}</option>
      </select>
    </div>
    <div class="field">
      <label for="pf-nombre">Nombre completo</label>
      <input id="pf-nombre" v-model="nombre" type="text" placeholder="María Fernanda Restrepo Ortiz">
    </div>
    <div class="field">
      <label for="pf-tipo-doc">Tipo de documento</label>
      <select id="pf-tipo-doc" v-model.number="tipoIdentificacionId">
        <option :value="null" disabled>— Elegir —</option>
        <option v-for="t in tiposIdentificacion" :key="t.id" :value="t.id">{{ t.nombre }}</option>
      </select>
    </div>
    <div class="field">
      <label for="pf-num-doc">Número de documento</label>
      <input id="pf-num-doc" v-model="numeroDocumento" type="text" placeholder="45.678.912">
    </div>
    <div v-if="esCopropietario" class="field">
      <label for="pf-pct">Participación (solo copropietario)</label>
      <input id="pf-pct" v-model.number="porcentaje" type="number" min="0" max="100" step="0.001" placeholder="100">
    </div>
    <div class="field">
      <label for="pf-email">Email</label>
      <input id="pf-email" v-model="email" type="email" placeholder="correo@ejemplo.com">
    </div>
    <div class="field">
      <label for="pf-tel">Teléfono</label>
      <input id="pf-tel" v-model="telefono" type="text" placeholder="300 456 7890">
    </div>
    <div class="field">
      <label for="pf-desde">Vigente desde</label>
      <input id="pf-desde" v-model="vigenteDesde" type="date">
    </div>
    <div class="field">
      <label for="pf-hasta">Vigente hasta (opcional)</label>
      <input id="pf-hasta" v-model="vigenteHasta" type="date">
    </div>
    <div class="field span-2" style="flex-direction: row; gap: 20px; align-items: center">
      <label style="display: flex; align-items: center; gap: 7px; font-weight: 400">
        <input v-model="esPagador" type="checkbox" style="width: auto"> Recibe la factura (pagador)
      </label>
      <label style="display: flex; align-items: center; gap: 7px; font-weight: 400">
        <input v-model="recibeNotificaciones" type="checkbox" style="width: auto"> Recibe notificaciones
      </label>
    </div>
  </div>
  <p class="note">
    Cualquier persona puede marcarse como <strong>pagador</strong> — no tiene que ser el
    copropietario. Solo puede haber un pagador vigente por inmueble a la vez. El
    <strong>coeficiente de copropiedad</strong> tampoco se asigna aquí: se define al incluir
    este inmueble en el set de coeficientes vigente, desde Configuración → Coeficientes.
  </p>
  <div style="display: flex; gap: 8px; margin-top: 12px">
    <button type="button" class="btn btn--primary" @click="guardar">Guardar persona</button>
    <button type="button" class="btn btn--ghost" @click="emit('cancelar')">Cancelar</button>
  </div>
</template>
