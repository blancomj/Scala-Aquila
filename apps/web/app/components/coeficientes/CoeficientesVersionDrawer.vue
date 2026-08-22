<script setup lang="ts">
// Drawer de una versión de coeficientes — sirve para los 3 casos según el
// prop `setId`: sin él, crea una versión nueva; con él sobre un set
// 'borrador', la continúa (autoguardado, retoma lo ya digitado); con él
// sobre cualquier otro estado, solo la muestra (soloLectura).
//
// Ya no hay "Crear versión" ni "Cancelar" que descarte algo: el set se crea
// vacío apenas se confirma la fecha, y cada coeficiente se guarda solo
// (debounce corto) o en lote vía importación CSV — pensado para
// copropiedades con cientos de inmuebles, donde digitarlos todos en una
// sola sesión no es viable y perder lo ya escrito al cerrar por accidente
// tampoco.
const props = defineProps<{ setId?: string }>()
const emit = defineEmits<{ cerrar: [] }>()

const tenantStore = useTenantStore()
const coeficientesStore = useCoeficientesStore()
const cuentaStore = useCuentaCorrienteStore()
const politicaStore = usePoliticaFinancieraStore()

const cargando = ref(false)
const guardando = ref(false)
const error = ref<string | null>(null)
const resumenImportacion = ref<string | null>(null)

const setExistente = computed(() =>
  props.setId ? coeficientesStore.coeficienteSets.find((s) => s.id === props.setId) : undefined,
)
const estadoSet = computed(() => setExistente.value?.estado)
const soloLectura = computed(() => estadoSet.value !== undefined && estadoSet.value !== 'borrador')

const setIdInterno = ref<string | null>(props.setId ?? null)
const vigenteDesde = ref(setExistente.value?.vigente_desde ?? '')

const valores = ref<Record<string, number | undefined>>({})

const inmueblesActivos = computed(() => cuentaStore.inmuebles.filter((i) => i.estado === 'activo'))

const soloVacios = ref(false)
const inmueblesVisibles = computed(() =>
  soloVacios.value
    ? inmueblesActivos.value.filter((i) => valores.value[i.id] === undefined)
    : inmueblesActivos.value,
)

const politicaVigente = computed(() => politicaStore.politicas.find((p) => p.estado === 'vigente'))
const sumaEsperada = computed(() => politicaVigente.value?.coeficientes_suma_esperada ?? 1)

const sumaActual = computed(() =>
  inmueblesActivos.value.reduce((acc, i) => acc + (valores.value[i.id] ?? 0), 0),
)
const sumaDifiere = computed(() => Math.abs(sumaActual.value - sumaEsperada.value) > 1e-9)

onMounted(async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  cargando.value = true
  try {
    await Promise.all([cuentaStore.cargarInmuebles(tenantId), politicaStore.cargarPoliticas(tenantId)])
    if (setIdInterno.value) {
      const mapa = await coeficientesStore.cargarCoeficientesDeSet(setIdInterno.value, tenantId)
      for (const [inmuebleId, valor] of mapa) valores.value[inmuebleId] = valor
    }
  } finally {
    cargando.value = false
  }
})

/** Confirmar la fecha (evento `change` del input, no cada tecla) crea el set
 * vacío una sola vez — a partir de ahí la tabla queda activa para digitar. */
async function confirmarFecha(): Promise<void> {
  if (setIdInterno.value || !vigenteDesde.value) return
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  error.value = null
  try {
    const set = await coeficientesStore.crearSetVacio({ tenantId, vigenteDesde: vigenteDesde.value })
    setIdInterno.value = set.id
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo crear la versión.')
  }
}

const temporizadores = new Map<string, ReturnType<typeof setTimeout>>()

function onCambioValor(inmuebleId: string): void {
  if (soloLectura.value || !setIdInterno.value) return
  const previo = temporizadores.get(inmuebleId)
  if (previo) clearTimeout(previo)
  temporizadores.set(
    inmuebleId,
    setTimeout(() => guardarFila(inmuebleId), 600),
  )
}

async function guardarFila(inmuebleId: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const valor = valores.value[inmuebleId]
  if (!tenantId || !setIdInterno.value || valor === undefined) return

  guardando.value = true
  error.value = null
  try {
    await coeficientesStore.guardarLoteCoeficientes({
      tenantId,
      setId: setIdInterno.value,
      valores: [{ inmuebleId, valor }],
    })
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar el coeficiente.')
  } finally {
    guardando.value = false
  }
}

const vacios = computed(() => inmueblesActivos.value.filter((i) => valores.value[i.id] === undefined))
const restantePorRepartir = computed(() => sumaEsperada.value - sumaActual.value)
const puedeRepartir = computed(() => vacios.value.length > 0 && restantePorRepartir.value > 0)

/** Reparte lo que falta para llegar a `sumaEsperada` (Σ política vigente, normalmente 1) entre
 * los inmuebles todavía vacíos, proporcional a su `area_privada` — así se calculan los
 * coeficientes reales de copropiedad (un apartamento grande recibe más % que un parqueadero).
 * Si ningún vacío tiene área registrada, cae a partes iguales para no dividir por cero. */
async function repartirRestante(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !setIdInterno.value || !puedeRepartir.value) return

  const areaTotal = vacios.value.reduce((acc, i) => acc + (Number(i.area_privada) || 0), 0)
  const nuevos = vacios.value.map((i) => ({
    inmuebleId: i.id,
    valor:
      areaTotal > 0
        ? (restantePorRepartir.value * (Number(i.area_privada) || 0)) / areaTotal
        : restantePorRepartir.value / vacios.value.length,
  }))

  guardando.value = true
  error.value = null
  try {
    await coeficientesStore.guardarLoteCoeficientes({ tenantId, setId: setIdInterno.value, valores: nuevos })
    for (const n of nuevos) valores.value[n.inmuebleId] = n.valor
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo repartir el resto.')
  } finally {
    guardando.value = false
  }
}

const inputArchivo = ref<HTMLInputElement | null>(null)
function abrirSelectorArchivo(): void {
  inputArchivo.value?.click()
}

/** Formato fijo: primera fila encabezado, columnas `codigo,coeficiente` —
 * sin soporte de comillas/comas dentro de un campo, no hace falta para este
 * formato de 2 columnas simples. */
async function onArchivoSeleccionado(evento: Event): Promise<void> {
  const input = evento.target as HTMLInputElement
  const archivo = input.files?.[0]
  input.value = ''
  const tenantId = tenantStore.activeTenant?.id
  if (!archivo || !setIdInterno.value || !tenantId) return

  resumenImportacion.value = null
  const texto = await archivo.text()
  const lineas = texto
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0)
  const filas = lineas.slice(1)

  const inmueblePorCodigo = new Map(
    inmueblesActivos.value.map((i) => [i.codigo.trim().toLowerCase(), i]),
  )

  const coincidencias: { inmuebleId: string; valor: number }[] = []
  const noEncontrados: string[] = []

  for (const linea of filas) {
    const [codigoCrudo, valorCrudo] = linea.split(',')
    const codigo = (codigoCrudo ?? '').trim()
    const valor = Number((valorCrudo ?? '').trim())
    if (!codigo || Number.isNaN(valor)) continue
    const inmueble = inmueblePorCodigo.get(codigo.toLowerCase())
    if (!inmueble) {
      noEncontrados.push(codigo)
      continue
    }
    coincidencias.push({ inmuebleId: inmueble.id, valor })
  }

  if (coincidencias.length === 0) {
    resumenImportacion.value = 'Ningún código del archivo coincide con un inmueble activo de esta copropiedad.'
    return
  }

  guardando.value = true
  error.value = null
  try {
    await coeficientesStore.guardarLoteCoeficientes({
      tenantId,
      setId: setIdInterno.value,
      valores: coincidencias,
    })
    for (const c of coincidencias) valores.value[c.inmuebleId] = c.valor

    const faltantes = inmueblesActivos.value.filter((i) => valores.value[i.id] === undefined).length
    const partes = [`${coincidencias.length} de ${filas.length} filas del archivo se cargaron.`]
    if (noEncontrados.length > 0) {
      partes.push(`${noEncontrados.length} código(s) no reconocidos: ${noEncontrados.join(', ')}.`)
    }
    partes.push(`${faltantes} inmueble(s) activo(s) siguen sin coeficiente.`)
    resumenImportacion.value = partes.join(' ')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo importar el archivo.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer
      :abierto="true"
      :titulo="soloLectura ? `Coeficientes — v${setExistente?.version}` : 'Nueva versión de coeficientes'"
      @cerrar="emit('cerrar')"
    >
      <div class="form-grid">
        <div class="field span-2">
          <label for="cv-desde">Vigente desde</label>
          <input
            id="cv-desde"
            v-model="vigenteDesde"
            type="date"
            :disabled="soloLectura || setIdInterno !== null"
            @change="confirmarFecha"
          />
        </div>
      </div>

      <p v-if="!setIdInterno" class="note">Elige la fecha de vigencia para empezar a cargar coeficientes.</p>

      <template v-else>
        <div v-if="!soloLectura" style="display: flex; align-items: center; gap: 8px; margin: 8px 0; flex-wrap: wrap">
          <button type="button" class="btn btn--ghost" @click="abrirSelectorArchivo">Importar CSV</button>
          <input
            ref="inputArchivo"
            type="file"
            accept=".csv"
            style="display: none"
            @change="onArchivoSeleccionado"
          />
          <button
            type="button"
            class="btn btn--ghost"
            :disabled="!puedeRepartir"
            :title="`Reparte ${restantePorRepartir} entre los ${vacios.length} inmuebles vacíos, proporcional a su área privada.`"
            @click="repartirRestante"
          >
            Repartir el resto entre los vacíos
          </button>
          <span class="note" style="margin: 0">Archivo con encabezado y columnas codigo,coeficiente.</span>
          <span v-if="guardando" class="note" style="margin: 0">Guardando…</span>
        </div>

        <p v-if="resumenImportacion" class="note">{{ resumenImportacion }}</p>

        <label style="display: flex; align-items: center; gap: 6px; margin: 8px 0; font-size: 0.85em">
          <input v-model="soloVacios" type="checkbox" />
          Ver solo los vacíos
        </label>

        <p v-if="inmueblesActivos.length === 0" class="note">
          Esta copropiedad todavía no tiene inmuebles activos.
        </p>
        <p v-else-if="inmueblesVisibles.length === 0" class="note">
          Todos los inmuebles activos ya tienen coeficiente.
        </p>
        <UiTabla
          v-else
          variante="ficha"
          :columnas="[
            { clave: 'inmueble', etiqueta: 'Inmueble' },
            { clave: 'coeficiente', etiqueta: 'Coeficiente', alinear: 'derecha' },
          ]"
          :filas="inmueblesVisibles"
          :clave-fila="(inmueble) => inmueble.id"
        >
          <template #celda-inmueble="{ fila }">{{ fila.codigo }}</template>
          <template #celda-coeficiente="{ fila }">
            <input
              v-model.number="valores[fila.id]"
              type="text"
              inputmode="decimal"
              placeholder="0.00"
              :disabled="soloLectura"
              style="width: 100%; text-align: right"
              @input="onCambioValor(fila.id)"
            />
          </template>
        </UiTabla>

        <p class="note" :style="sumaDifiere ? 'color: var(--ladrillo-text)' : undefined">
          Σ = {{ sumaActual }} (esperada {{ sumaEsperada }})
          <template v-if="sumaDifiere">— no coincide, pero no bloquea el guardado.</template>
        </p>
      </template>

      <p v-if="error" class="note" style="color: var(--ladrillo-text)">{{ error }}</p>

      <template #foot>
        <button type="button" class="btn btn--primary" @click="emit('cerrar')">Cerrar</button>
      </template>
    </UiDrawer>
  </div>
</template>
