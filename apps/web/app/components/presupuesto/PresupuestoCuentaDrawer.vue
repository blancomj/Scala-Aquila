<script setup lang="ts">
// Drawer "Nueva cuenta" / "Editar cuenta" (E8) — crea o edita un nodo del
// árbol de presupuesto_cuenta, incluido reparentar (mover a otro padre).
// Mismo criterio que PresupuestoRubroDrawer.vue (.ficha-inmueble +
// .form-grid/.field).
//
// La naturaleza es inmutable siempre (se elige solo al crear una cuenta
// raíz; una subcuenta hereda la del padre). Reparentar en edición solo
// ofrece padres de la MISMA naturaleza y excluye a la propia cuenta y a
// sus descendientes (el guard también lo rechazaría, pero filtrarlo aquí
// evita una vuelta de error innecesaria). El recálculo de nivel/ruta de
// los descendientes ante un reparentado lo hace el trigger
// propagar_presupuesto_cuenta_ruta (20260823210000) — no hay nada que
// hacer del lado del cliente más que enviar el nuevo parent_id.
import type { Database } from '@aquila/shared'

type PresupuestoCuentaRow = Database['public']['Tables']['presupuesto_cuenta']['Row']

const props = defineProps<{
  tenantId: string
  cuenta?: PresupuestoCuentaRow
  parentIdInicial?: string
}>()
const emit = defineEmits<{ cerrar: []; creada: []; editada: [] }>()

const presupuestoStore = usePresupuestoStore()
const conceptoStore = useConceptoStore()

const modoEdicion = computed(() => props.cuenta !== undefined)

const parentId = ref<string | null>(props.cuenta?.parent_id ?? props.parentIdInicial ?? null)
const naturaleza = ref<'ingreso' | 'egreso'>(props.cuenta?.naturaleza ?? 'egreso')
const codigo = ref(props.cuenta?.codigo ?? '')
const nombre = ref(props.cuenta?.nombre ?? '')
const orden = ref<number | null>(props.cuenta?.orden ?? 0)
const activa = ref(props.cuenta?.activa ?? true)
const conceptoId = ref<string | null>(props.cuenta?.concepto_id ?? null)
const guardando = ref(false)
const error = ref<string | null>(null)

onMounted(() => {
  if (conceptoStore.conceptos.length === 0) conceptoStore.cargarConceptos(props.tenantId)
})

/** Solo cuentas de ingreso que hoy son hoja pueden vincular un concepto de cobro
 * (guard_presupuesto_cuenta_concepto, 20260823290000) — en creación toda cuenta nueva nace hoja. */
const mostrarConcepto = computed(
  () => naturaleza.value === 'ingreso' && (!modoEdicion.value || props.cuenta?.es_hoja === true),
)

const cuentaPadre = computed(
  () => presupuestoStore.cuentas.find((c) => c.id === parentId.value) ?? null,
)

// Descendientes de la cuenta en edición — un padre válido nunca puede ser uno de ellos (ni la
// propia cuenta). El guard también lo rechazaría (CUENTA_CICLO), pero filtrarlo aquí evita
// ofrecer una opción que sabemos que va a fallar.
const descendientesIds = computed(() => {
  if (!props.cuenta) return new Set<string>()
  const hijosPorPadre = new Map<string, string[]>()
  for (const c of presupuestoStore.cuentas) {
    if (!c.parent_id) continue
    const lista = hijosPorPadre.get(c.parent_id) ?? []
    lista.push(c.id)
    hijosPorPadre.set(c.parent_id, lista)
  }
  const ids = new Set<string>()
  const pendientes = [props.cuenta.id]
  while (pendientes.length > 0) {
    const actual = pendientes.pop()
    if (actual === undefined) continue
    for (const hijoId of hijosPorPadre.get(actual) ?? []) {
      ids.add(hijoId)
      pendientes.push(hijoId)
    }
  }
  return ids
})

// Cualquier cuenta puede ganar hijos — una hoja se convierte en grupo al insertarle el primer
// hijo (guard_presupuesto_cuenta_arbol lo hace solo), así que no se excluyen las hojas aquí.
// En edición además se filtra por naturaleza (el guard exige que coincida con la propia).
const opcionesPadre = computed(() =>
  [...presupuestoStore.cuentas]
    .filter((c) => c.id !== props.cuenta?.id)
    .filter((c) => !descendientesIds.value.has(c.id))
    .filter((c) => !modoEdicion.value || c.naturaleza === props.cuenta?.naturaleza)
    .sort((a, b) => a.ruta.localeCompare(b.ruta))
    .map((c) => ({ id: c.id, etiqueta: `${'— '.repeat(c.nivel - 1)}${c.nombre} (${c.naturaleza})` })),
)

watch(cuentaPadre, (padre) => {
  if (padre && !modoEdicion.value) naturaleza.value = padre.naturaleza
})

async function guardar(): Promise<void> {
  error.value = null
  if (!codigo.value || !nombre.value) {
    error.value = 'Completa código y nombre.'
    return
  }

  guardando.value = true
  try {
    if (modoEdicion.value && props.cuenta) {
      await presupuestoStore.actualizarCuenta({
        id: props.cuenta.id,
        tenantId: props.tenantId,
        codigo: codigo.value,
        nombre: nombre.value,
        orden: orden.value ?? 0,
        activa: activa.value,
        parentId: parentId.value,
        conceptoId: mostrarConcepto.value ? conceptoId.value : undefined,
      })
      emit('editada')
    } else {
      await presupuestoStore.crearCuenta({
        tenantId: props.tenantId,
        naturaleza: naturaleza.value,
        codigo: codigo.value,
        nombre: nombre.value,
        parentId: parentId.value ?? undefined,
        orden: orden.value ?? 0,
        conceptoId: mostrarConcepto.value ? (conceptoId.value ?? undefined) : undefined,
      })
      emit('creada')
    }
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar la cuenta.')
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
          ? 'Nombre, código, orden, estado y padre — la naturaleza no se puede cambiar aquí'
          : 'Nodo del árbol de cuentas presupuestales — grupo o cuenta hoja'
      "
      @cerrar="emit('cerrar')"
    >
      <div class="form-grid">
        <div class="field span-2">
          <label for="c-padre">Cuenta padre</label>
          <select id="c-padre" v-model="parentId">
            <option :value="null">— Ninguna (cuenta raíz) —</option>
            <option v-for="c in opcionesPadre" :key="c.id" :value="c.id">{{ c.etiqueta }}</option>
          </select>
        </div>
        <div class="field">
          <label for="c-naturaleza">Naturaleza</label>
          <select id="c-naturaleza" v-model="naturaleza" :disabled="modoEdicion || cuentaPadre !== null">
            <option value="egreso">Egreso</option>
            <option value="ingreso">Ingreso</option>
          </select>
        </div>
        <div class="field">
          <label for="c-orden">Orden</label>
          <input id="c-orden" v-model.number="orden" type="number" min="0" />
        </div>
        <div class="field">
          <label for="c-codigo">Código</label>
          <input id="c-codigo" v-model="codigo" type="text" />
        </div>
        <div class="field">
          <label for="c-nombre">Nombre</label>
          <input id="c-nombre" v-model="nombre" type="text" />
        </div>
        <div v-if="modoEdicion" class="field">
          <label for="c-activa">Estado</label>
          <select id="c-activa" v-model="activa">
            <option :value="true">Activa</option>
            <option :value="false">Inactiva</option>
          </select>
        </div>
        <div v-if="mostrarConcepto" class="field span-2">
          <label for="c-concepto">Concepto de cobro</label>
          <select id="c-concepto" v-model="conceptoId">
            <option :value="null">— Ninguno (movimientos manuales) —</option>
            <option v-for="c in conceptoStore.conceptos" :key="c.id" :value="c.id">
              {{ c.codigo }} — {{ c.nombre }}
            </option>
          </select>
          <p class="text-xs text-gray-500 mt-1">
            Si eliges un concepto, el ejecutado de esta cuenta se calcula solo (Σ cargos
            facturados) — deja de admitir movimientos manuales de ejecución.
          </p>
        </div>
      </div>

      <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>

      <template #foot>
        <button type="button" class="btn btn--ghost" @click="emit('cerrar')">Cancelar</button>
        <button type="button" class="btn btn--primary" :disabled="guardando" @click="guardar">
          {{ guardando ? 'Guardando…' : modoEdicion ? 'Guardar cambios' : 'Crear cuenta' }}
        </button>
      </template>
    </UiDrawer>
  </div>
</template>
