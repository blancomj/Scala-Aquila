<script setup lang="ts">
// Drawer "Agregar rubro" — mismo criterio que MiembroDrawer.vue/
// PresupuestoCrearDrawer.vue (.ficha-inmueble + .form-grid/.field/.btn).
// Selects planos para cuenta/fundamento, no UiSelectorBuscable — mismo
// criterio que el resto de selects dentro de un drawer (rol/estado en
// MiembroDrawer.vue), listas cortas que no necesitan búsqueda. Solo se
// listan cuentas hoja (es_hoja) — guard_presupuesto_rubro_cuenta (E8)
// rechaza un rubro contra una cuenta que agrupa subcuentas, así que ni
// se ofrecen como opción.
const props = defineProps<{ presupuestoId: string }>()
const emit = defineEmits<{ cerrar: []; creado: [] }>()

const tenantStore = useTenantStore()
const presupuestoStore = usePresupuestoStore()
const fundamentoStore = useFundamentoNormativoStore()

const codigo = ref('')
const nombre = ref('')
const cuentaId = ref<string | null>(null)
const montoAnual = ref<number | null>(null)
const fundamentoNormativoId = ref<number | null>(null)
const guardando = ref(false)
const error = ref<string | null>(null)

/** Ruta legible (ej. "Servicios Públicos › Energía Eléctrica") — se arma
 * siguiendo parent_id en vez de repetir la lógica de `ruta` (BD), que es
 * un path de orden, no de nombres. */
const cuentasHoja = computed(() => {
  const porId = new Map(presupuestoStore.cuentas.map((c) => [c.id, c]))
  function rutaNombres(cuenta: (typeof presupuestoStore.cuentas)[number]): string {
    const segmentos = [cuenta.nombre]
    let actual = cuenta
    while (actual.parent_id) {
      const padre = porId.get(actual.parent_id)
      if (!padre) break
      segmentos.unshift(padre.nombre)
      actual = padre
    }
    return segmentos.join(' › ')
  }
  return presupuestoStore.cuentas
    .filter((c) => c.es_hoja)
    .map((c) => ({ id: c.id, etiqueta: `${rutaNombres(c)} (${c.naturaleza})` }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta))
})

async function guardar(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  if (!codigo.value || !nombre.value || cuentaId.value === null || montoAnual.value === null) {
    error.value = 'Completa código, nombre, cuenta y monto anual.'
    return
  }

  guardando.value = true
  try {
    await presupuestoStore.crearRubro({
      presupuestoId: props.presupuestoId,
      tenantId,
      codigo: codigo.value,
      nombre: nombre.value,
      cuentaId: cuentaId.value,
      montoAnual: montoAnual.value,
      fundamentoNormativoId: fundamentoNormativoId.value ?? undefined,
    })
    emit('creado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo agregar el rubro.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer :abierto="true" titulo="Agregar rubro" @cerrar="emit('cerrar')">
      <div class="form-grid">
        <div class="field">
          <label for="r-codigo">Código</label>
          <input id="r-codigo" v-model="codigo" type="text" />
        </div>
        <div class="field">
          <label for="r-nombre">Nombre</label>
          <input id="r-nombre" v-model="nombre" type="text" />
        </div>
        <div class="field">
          <label for="r-cuenta">Cuenta</label>
          <select id="r-cuenta" v-model="cuentaId">
            <option :value="null">— Elegir —</option>
            <option v-for="c in cuentasHoja" :key="c.id" :value="c.id">
              {{ c.etiqueta }}
            </option>
          </select>
        </div>
        <div class="field">
          <label for="r-monto">Monto anual</label>
          <input id="r-monto" v-model.number="montoAnual" type="number" min="0" />
        </div>
        <div class="field span-2">
          <label for="r-fundamento">Fundamento normativo</label>
          <select id="r-fundamento" v-model="fundamentoNormativoId">
            <option :value="null">— Ninguno —</option>
            <option v-for="f in fundamentoStore.fundamentos" :key="f.id" :value="f.id">
              {{ f.norma }}
            </option>
          </select>
        </div>
      </div>

      <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>

      <template #foot>
        <button type="button" class="btn btn--ghost" @click="emit('cerrar')">Cancelar</button>
        <button type="button" class="btn btn--primary" :disabled="guardando" @click="guardar">
          {{ guardando ? 'Agregando…' : 'Agregar rubro' }}
        </button>
      </template>
    </UiDrawer>
  </div>
</template>
