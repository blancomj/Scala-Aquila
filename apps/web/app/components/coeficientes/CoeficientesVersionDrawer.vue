<script setup lang="ts">
// Drawer "Nueva versión de coeficientes" — migrado del formulario inline
// que tenía coeficientes/index.vue. Mismo criterio de drawer que el resto
// (.ficha-inmueble + .field/.btn), con UiTabla variante="ficha" para la
// tabla de inmuebles+coeficiente (mismo componente headless de siempre,
// solo con el estilo ambiental de .ficha-inmueble en vez de Tailwind).
const emit = defineEmits<{ cerrar: []; creado: [] }>()

const tenantStore = useTenantStore()
const coeficientesStore = useCoeficientesStore()
const cuentaStore = useCuentaCorrienteStore()
const politicaStore = usePoliticaFinancieraStore()

const vigenteDesde = ref('')
const valores = ref<Record<string, number | undefined>>({})
const guardando = ref(false)
const error = ref<string | null>(null)

const inmueblesActivos = computed(() => cuentaStore.inmuebles.filter((i) => i.estado === 'activo'))

const politicaVigente = computed(() => politicaStore.politicas.find((p) => p.estado === 'vigente'))
const sumaEsperada = computed(() => politicaVigente.value?.coeficientes_suma_esperada ?? 1)

const sumaActual = computed(() =>
  inmueblesActivos.value.reduce((acc, i) => acc + (valores.value[i.id] ?? 0), 0),
)
const sumaDifiere = computed(() => Math.abs(sumaActual.value - sumaEsperada.value) > 1e-9)

async function guardar(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !vigenteDesde.value || inmueblesActivos.value.length === 0) {
    error.value = 'Completa la fecha de vigencia — se necesita al menos un inmueble activo.'
    return
  }

  guardando.value = true
  try {
    await coeficientesStore.crearCoeficienteSet({
      tenantId,
      vigenteDesde: vigenteDesde.value,
      valores: inmueblesActivos.value.map((i) => ({
        inmuebleId: i.id,
        valor: valores.value[i.id] ?? 0,
      })),
    })
    emit('creado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear el set de coeficientes.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer :abierto="true" titulo="Nueva versión de coeficientes" @cerrar="emit('cerrar')">
      <div class="form-grid">
        <div class="field span-2">
          <label for="cv-desde">Vigente desde</label>
          <input id="cv-desde" v-model="vigenteDesde" type="date" />
        </div>
      </div>

      <p v-if="inmueblesActivos.length === 0" class="note">
        Esta copropiedad todavía no tiene inmuebles activos.
      </p>
      <UiTabla
        v-else
        variante="ficha"
        :columnas="[
          { clave: 'inmueble', etiqueta: 'Inmueble' },
          { clave: 'coeficiente', etiqueta: 'Coeficiente', alinear: 'derecha' },
        ]"
        :filas="inmueblesActivos"
        :clave-fila="(inmueble) => inmueble.id"
      >
        <template #celda-inmueble="{ fila }">{{ fila.codigo }}</template>
        <template #celda-coeficiente="{ fila }">
          <input
            v-model.number="valores[fila.id]"
            type="number"
            step="0.0000000001"
            min="0"
            style="width: 100%; text-align: right"
          />
        </template>
      </UiTabla>

      <p class="note" :style="sumaDifiere ? 'color: var(--ladrillo-text)' : undefined">
        Σ = {{ sumaActual }} (esperada {{ sumaEsperada }})
        <template v-if="sumaDifiere">— no coincide, pero no bloquea el guardado.</template>
      </p>

      <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>

      <template #foot>
        <button type="button" class="btn btn--ghost" @click="emit('cerrar')">Cancelar</button>
        <button type="button" class="btn btn--primary" :disabled="guardando" @click="guardar">
          {{ guardando ? 'Creando…' : 'Crear versión' }}
        </button>
      </template>
    </UiDrawer>
  </div>
</template>
