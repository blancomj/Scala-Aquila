<script setup lang="ts">
// Drawer "Nueva cuenta" / "Editar cuenta" (PC-1/PC-6). Mismo componente para ambos modos —
// modoEdicion sale de si llega `cuenta` (editar) o `cuentaPadre` (crear un auxiliar debajo).
//
// Código y padre NO se editan: a diferencia de PresupuestoCuentaDrawer.vue, contable_cuenta no
// tiene UI de reparentado — cambiar el código reabre la jerarquía que valida
// guard_contable_cuenta_arbol, y las clases 1-8 vienen fijas de la plantilla global (PC-1), no
// se inventan por tenant. En edición el código se muestra fijo, solo informativo.
//
// Al crear, el código del hijo DEBE extender el del padre y saltar exactamente un nivel
// (guard_contable_cuenta_arbol: CUENTA_CODIGO_INCOHERENTE / CUENTA_NIVEL_SALTADO) — por eso el
// código del padre se muestra fijo y el usuario solo escribe el sufijo que falta para completar
// la longitud del siguiente nivel (2→4→6→9 dígitos — el Auxiliar usa 3 dígitos propios en vez
// de 2, ajuste 2026-08-24), en vez de un campo de texto libre donde cualquier error de longitud
// o prefijo rebota como excepción de la base.
import type { ContableCuentaNodo } from '~/stores/contabilidad'

const props = defineProps<{
  tenantId: string
  cuentaPadre?: ContableCuentaNodo
  cuenta?: ContableCuentaNodo
}>()
const emit = defineEmits<{ cerrar: []; creada: []; editada: [] }>()

const contabilidadStore = useContabilidadStore()

const modoEdicion = computed(() => props.cuenta !== undefined)

/** Longitud de código del siguiente nivel, por longitud del padre — mismo mapa que
 * guard_contable_cuenta_arbol (1→2, 2→4, 4→6, 6→9 dígitos: el Auxiliar usa 3 dígitos propios). */
const LONGITUD_HIJO: Record<number, number> = { 1: 2, 2: 4, 4: 6, 6: 9 }
const longitudSufijo = computed(() => {
  const padre = props.cuentaPadre
  if (!padre) return 0
  const requerida = LONGITUD_HIJO[padre.codigo.length]
  return requerida === undefined ? 0 : requerida - padre.codigo.length
})

const sufijo = ref('')
const nombre = ref(props.cuenta?.nombre ?? '')
const naturaleza = ref<'debito' | 'credito'>(
  props.cuenta?.naturaleza ?? props.cuentaPadre?.naturaleza ?? 'debito',
)
const requiereTercero = ref(props.cuenta?.requiere_tercero ?? false)
const requiereCentroCosto = ref(props.cuenta?.requiere_centro_costo ?? false)
const requiereFondo = ref(props.cuenta?.requiere_fondo ?? false)
const requiereInmueble = ref(props.cuenta?.requiere_inmueble ?? false)
const activa = ref(props.cuenta?.activa ?? true)
const guardando = ref(false)
const error = ref<string | null>(null)

const codigoMostrado = computed(() =>
  modoEdicion.value ? (props.cuenta?.codigo ?? '') : (props.cuentaPadre?.codigo ?? ''),
)
const codigoCompleto = computed(() =>
  modoEdicion.value ? codigoMostrado.value : `${codigoMostrado.value}${sufijo.value}`,
)

const sufijoValido = computed(
  () => sufijo.value.length === longitudSufijo.value && /^[0-9]+$/.test(sufijo.value),
)

const sufijoPlaceholder = computed(() => '0'.repeat(Math.max(longitudSufijo.value - 1, 0)) + '1')

async function guardar(): Promise<void> {
  error.value = null
  if (!modoEdicion.value && !sufijoValido.value) {
    error.value = `El código debe completar ${longitudSufijo.value} dígito(s) tras ${codigoMostrado.value}.`
    return
  }
  if (!nombre.value.trim()) {
    error.value = 'Completa el nombre.'
    return
  }

  guardando.value = true
  try {
    if (modoEdicion.value && props.cuenta) {
      await contabilidadStore.actualizarCuenta(props.tenantId, props.cuenta.id, {
        nombre: nombre.value.trim(),
        naturaleza: naturaleza.value,
        activa: activa.value,
        requiereTercero: requiereTercero.value,
        requiereCentroCosto: requiereCentroCosto.value,
        requiereFondo: requiereFondo.value,
        requiereInmueble: requiereInmueble.value,
      })
      emit('editada')
    } else if (props.cuentaPadre) {
      await contabilidadStore.crearCuenta({
        tenantId: props.tenantId,
        parentId: props.cuentaPadre.id,
        codigo: codigoCompleto.value,
        nombre: nombre.value.trim(),
        naturaleza: naturaleza.value,
        requiereTercero: requiereTercero.value,
        requiereCentroCosto: requiereCentroCosto.value,
        requiereFondo: requiereFondo.value,
        requiereInmueble: requiereInmueble.value,
      })
      emit('creada')
    }
  } catch (excepcion) {
    error.value = mensajeError(
      excepcion,
      modoEdicion.value ? 'No se pudo guardar la cuenta.' : 'No se pudo crear la cuenta.',
    )
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer
      :abierto="true"
      :titulo="modoEdicion ? 'Editar cuenta' : 'Nueva cuenta'"
      :subtitulo="
        modoEdicion
          ? `${cuenta!.codigo} · ${cuenta!.nombre}`
          : `Auxiliar propio bajo ${cuentaPadre!.codigo} · ${cuentaPadre!.nombre}`
      "
      @cerrar="emit('cerrar')"
    >
      <div class="space-y-4 text-sm">
        <UFormField label="Código" name="codigo">
          <div v-if="modoEdicion" class="tabular-nums font-medium">{{ codigoMostrado }}</div>
          <template v-else>
            <div class="flex items-center gap-1">
              <span class="tabular-nums font-medium text-muted">{{ codigoMostrado }}</span>
              <UInput
                v-model="sufijo"
                type="text"
                :maxlength="longitudSufijo"
                :placeholder="sufijoPlaceholder"
                class="w-24"
              />
            </div>
            <p class="text-xs text-muted mt-1">
              Debe completar {{ longitudSufijo }} dígito(s) — código final: {{ codigoCompleto }}
            </p>
          </template>
        </UFormField>
        <UFormField label="Nombre" name="nombre">
          <UInput v-model="nombre" type="text" class="w-full" />
        </UFormField>
        <UFormField label="Naturaleza" name="naturaleza">
          <USelect
            v-model="naturaleza"
            :items="[
              { label: 'Débito', value: 'debito' },
              { label: 'Crédito', value: 'credito' },
            ]"
            value-key="value"
            class="w-full"
          />
          <p v-if="!modoEdicion" class="text-xs text-muted mt-1">
            Hereda la del padre por defecto; solo cámbiala para una cuenta correctora (ej. una
            provisión de naturaleza contraria dentro de la misma clase).
          </p>
        </UFormField>
        <UFormField label="Dimensiones obligatorias" name="dimensiones">
          <div class="flex flex-wrap gap-4">
            <UCheckbox v-model="requiereTercero" label="Tercero" />
            <UCheckbox v-model="requiereCentroCosto" label="Centro de costo" />
            <UCheckbox v-model="requiereFondo" label="Fondo" />
            <UCheckbox v-model="requiereInmueble" label="Inmueble" />
          </div>
        </UFormField>
        <UFormField v-if="modoEdicion" label="Estado" name="activa">
          <USelect
            v-model="activa"
            :items="[
              { label: 'Activa', value: true },
              { label: 'Inactiva', value: false },
            ]"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-4" />

      <template #foot>
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="guardando" @click="guardar">
          {{ modoEdicion ? 'Guardar cambios' : 'Crear cuenta' }}
        </UButton>
      </template>
    </UiDrawer>
  </div>
</template>
