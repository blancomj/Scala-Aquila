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

const props = withDefaults(
  defineProps<{ roles: readonly ListaTipoRow[]; guardando?: boolean }>(),
  { guardando: false },
)
const emit = defineEmits<{ guardar: [PersonaFormPayload]; cancelar: [] }>()

const errorValidacion = ref<string | null>(null)

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

const opcionesRol = computed(() => props.roles.map((r) => ({ valor: r.id, etiqueta: r.nombre })))
const opcionesTipoIdentificacion = computed(() =>
  tiposIdentificacion.value.map((t) => ({ valor: t.id, etiqueta: t.nombre })),
)

function guardar(): void {
  if (rolId.value === null) {
    errorValidacion.value = 'Elige un rol.'
    return
  }
  if (tipoIdentificacionId.value === null) {
    errorValidacion.value = 'Elige un tipo de documento.'
    return
  }
  if (!nombre.value.trim() || !numeroDocumento.value.trim()) {
    errorValidacion.value = 'Nombre completo y número de documento son obligatorios.'
    return
  }
  errorValidacion.value = null
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
  <div class="space-y-4 text-sm">
    <UFormField label="Rol" name="rol_id">
      <UiSelectorBuscable v-model="rolId" :opciones="opcionesRol" placeholder="— Elegir —" />
    </UFormField>
    <UFormField label="Nombre completo" name="nombre">
      <UInput v-model="nombre" type="text" placeholder="María Fernanda Restrepo Ortiz" class="w-full" />
    </UFormField>
    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Tipo de documento" name="tipo_identificacion_id">
        <UiSelectorBuscable v-model="tipoIdentificacionId" :opciones="opcionesTipoIdentificacion" placeholder="— Elegir —" />
      </UFormField>
      <UFormField label="Número de documento" name="numero_documento">
        <UInput v-model="numeroDocumento" type="text" placeholder="45.678.912" class="w-full" />
      </UFormField>
    </div>
    <UFormField v-if="esCopropietario" label="Participación (solo copropietario)" name="porcentaje">
      <UInput v-model.number="porcentaje" type="number" min="0" max="100" step="0.001" placeholder="100" class="w-full" />
    </UFormField>
    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Email" name="email">
        <UInput v-model="email" type="email" placeholder="correo@ejemplo.com" class="w-full" />
      </UFormField>
      <UFormField label="Teléfono" name="telefono">
        <UInput v-model="telefono" type="text" placeholder="300 456 7890" class="w-full" />
      </UFormField>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Vigente desde" name="vigente_desde">
        <UInput v-model="vigenteDesde" type="date" class="w-full" />
      </UFormField>
      <UFormField label="Vigente hasta (opcional)" name="vigente_hasta">
        <UInput v-model="vigenteHasta" type="date" class="w-full" />
      </UFormField>
    </div>
    <div class="flex items-center gap-5">
      <UCheckbox v-model="esPagador" label="Recibe la factura (pagador)" />
      <UCheckbox v-model="recibeNotificaciones" label="Recibe notificaciones" />
    </div>
  </div>
  <p class="text-xs text-neutral-500 mt-4">
    Cualquier persona puede marcarse como <strong>pagador</strong> — no tiene que ser el
    copropietario. Solo puede haber un pagador vigente por inmueble a la vez. El
    <strong>coeficiente de copropiedad</strong> tampoco se asigna aquí: se define al incluir
    este inmueble en el set de coeficientes vigente, desde Configuración → Coeficientes.
  </p>
  <UAlert v-if="errorValidacion" color="error" variant="soft" :title="errorValidacion" class="mt-3" />
  <div class="flex gap-2 mt-3">
    <UButton :loading="guardando" :disabled="guardando" @click="guardar">Guardar persona</UButton>
    <UButton variant="ghost" :disabled="guardando" @click="emit('cancelar')">Cancelar</UButton>
  </div>
</template>
