<script setup lang="ts">
// Formulario de registrar pago — RC-6/RC-7: componente compartido entre la
// ficha del inmueble (vía el modal de InmuebleFicha.vue) y /recaudo (vía su
// propio modal). `inmuebleId` es opcional: cuando el llamador ya sabe de
// qué inmueble se trata (la ficha) se lo pasa fijo y el formulario no
// muestra selector; cuando no (Recaudo es tenant-wide) el formulario
// resuelve su propio selector con cuentaStore.inmuebles — antes existía
// una tercera copia de este formulario en /estado-cuenta/pagos.vue, con su
// propio selector de inmueble; se retiró esa página y este componente
// absorbió esa capacidad en vez de mantener una copia aparte (2026-08-27).
//
// "Quién paga" (2026-08-27, corrige un olvido de RC-3): el backend ya
// soportaba pagador_tercero_id/pagador_nombre desde RC-0 y el recibo de
// caja ya sabía resolver "Recibí de" con esa prioridad — pero ningún
// formulario exponía el campo, así que siempre viajaba null y el recibo
// caía a la inferencia por es_pagador. Quien paga en ventanilla puede no
// ser el propietario registrado (un arrendatario, un familiar, alguien que
// paga por encargo), así que se deja explícito y editable, con la persona
// marcada es_pagador pre-seleccionada como punto de partida cuando existe.
//
// "Aplicar a cargos específicos" (2026-08-27, art. 1653 C.C.): el deudor
// puede declarar a qué obligación aplica su pago. Por defecto sigue la
// política automática de imputación (imputarPago(), sin cambios); si el
// auxiliar marca esta sección, el backend usa construirPlanManual() en su
// lugar SOLO para este pago — no reordena ni reinterpreta la política, solo
// valida integridad (guard_pago_aplicacion_no_excede en la base es el
// límite real). Lo no asignado del monto queda como anticipo, igual que un
// sobrepago hoy — no hay reparto mixto manual+automático todavía.
import type { Database } from '@aquila/shared'
import type { ResultadoPago } from '~/stores/cuentaCorriente'

type CargoRow = Database['public']['Views']['v_cargo_saldo']['Row']

const props = defineProps<{ inmuebleId?: string }>()
const emit = defineEmits<{ registrado: [resultado: ResultadoPago] }>()

const tenantStore = useTenantStore()
const cuentaStore = useCuentaCorrienteStore()
const tercerosStore = useTercerosStore()
const documentosStore = useDocumentosStore()
const toast = useToast()

const inmuebleSeleccionadoId = ref<string | null>(props.inmuebleId ?? null)
const monto = ref<number | null>(null)
const fechaPago = ref(new Date().toISOString().slice(0, 10))
const referencia = ref('')
const formaPago = ref('transferencia_bancaria')
const registrando = ref(false)
const error = ref<string | null>(null)

const opcionesFormaPago = computed(() =>
  cuentaStore.formasPago.map((f) => ({ value: f.codigo, label: f.nombre })),
)
const opcionesInmueble = computed(() =>
  cuentaStore.inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo })),
)

const inmuebleEfectivoId = computed(() => props.inmuebleId ?? inmuebleSeleccionadoId.value)

// ── Saldo pendiente del inmueble — encabezado, para contexto al cobrar ──
const saldoPendiente = ref<number | null>(null)
const cargosDelInmueble = ref<CargoRow[]>([])
const conceptosPorId = ref<Map<string, { codigo: string; nombre: string }>>(new Map())
const novedadesPorId = ref<Map<string, { descripcion: string }>>(new Map())

const ETIQUETA_CATEGORIA: Record<string, string> = {
  capital: 'Capital',
  interes: 'Interés de mora',
  otro: 'Otro',
}

/** Solo lookups directos (id → nombre/descripcion) — NO reimplementa la CASE
 * de "descripción real" (Capital · CÓDIGO / Interés · CÓDIGO) que ya vive en
 * fn_emitir_recibo_caja/fn_emitir_estados_cuenta. Esto es una etiqueta más
 * simple, suficiente para que el auxiliar distinga cargos en la lista. */
function etiquetaCargo(cargo: CargoRow): string {
  if (cargo.concepto_id) {
    const concepto = conceptosPorId.value.get(cargo.concepto_id)
    if (concepto) return concepto.nombre
  }
  if (cargo.novedad_id) {
    const novedad = novedadesPorId.value.get(cargo.novedad_id)
    if (novedad) return novedad.descripcion
  }
  return (cargo.categoria ? ETIQUETA_CATEGORIA[cargo.categoria] : undefined) ?? cargo.categoria ?? 'Cargo'
}

async function cargarEtiquetasCargos(cargos: readonly CargoRow[]): Promise<void> {
  const conceptoIds = [...new Set(cargos.map((c) => c.concepto_id).filter((id): id is string => !!id))]
  const novedadIds = [...new Set(cargos.map((c) => c.novedad_id).filter((id): id is string => !!id))]
  if (conceptoIds.length === 0 && novedadIds.length === 0) return
  const cliente = useSupabaseClient<Database>()
  const [conceptosResp, novedadesResp] = await Promise.all([
    conceptoIds.length > 0
      ? cliente.from('conceptos').select('id, codigo, nombre').in('id', conceptoIds)
      : Promise.resolve({ data: [] }),
    novedadIds.length > 0
      ? cliente.from('novedades').select('id, descripcion').in('id', novedadIds)
      : Promise.resolve({ data: [] }),
  ])
  conceptosPorId.value = new Map((conceptosResp.data ?? []).map((c) => [c.id, c]))
  novedadesPorId.value = new Map((novedadesResp.data ?? []).map((n) => [n.id, n]))
}

async function cargarSaldoPendiente(id: string | null): Promise<void> {
  saldoPendiente.value = null
  cargosDelInmueble.value = []
  aplicacionManualActiva.value = false
  seleccionCargos.value = new Map()
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !id) return
  const cargos = await cuentaStore.cargarCargosAbiertos(tenantId, id)
  saldoPendiente.value = cargos.reduce((acc, c) => acc + (c.monto_pendiente ?? 0), 0)
  cargosDelInmueble.value = cargos
  await cargarEtiquetasCargos(cargos)
}

// ── Imputación manual (art. 1653 C.C.) ──────────────────────────────────
// Opcional: por defecto el pago se imputa con la política automática del
// tenant (comportamiento de siempre, sin cambios). Si el auxiliar marca
// esta sección, elige a mano a qué cargo(s) aplica — el backend reemplaza
// imputarPago() por construirPlanManual() solo para este pago.
const aplicacionManualActiva = ref(false)
const seleccionCargos = ref<Map<string, number>>(new Map())

const montoAsignado = computed(() => [...seleccionCargos.value.values()].reduce((acc, m) => acc + m, 0))
const montoRestante = computed(() => (monto.value ?? 0) - montoAsignado.value)

function alternarCargo(cargo: CargoRow, marcado: boolean): void {
  if (!cargo.id) return
  if (!marcado) {
    seleccionCargos.value.delete(cargo.id)
    seleccionCargos.value = new Map(seleccionCargos.value)
    return
  }
  const pendiente = cargo.monto_pendiente ?? 0
  const propuesto = Math.min(Math.max(montoRestante.value, 0), pendiente)
  seleccionCargos.value.set(cargo.id, propuesto > 0 ? propuesto : pendiente)
  seleccionCargos.value = new Map(seleccionCargos.value)
}

function actualizarMontoCargo(cargoId: string, valor: number): void {
  seleccionCargos.value.set(cargoId, valor)
  seleccionCargos.value = new Map(seleccionCargos.value)
}

// ── Quién paga ───────────────────────────────────────────────────────
const OTRO = '__otro__'
const quienPaga = ref<string | null>(null)
const pagadorNombreLibre = ref('')
const pagadorDocumentoLibre = ref('')

const personasVigentes = computed(() =>
  tercerosStore.tercerosAsociados.filter((p) => !p.vigente_hasta),
)
const opcionesQuienPaga = computed(() => [
  { value: null, label: 'Sin especificar — se usa el pagador registrado' },
  ...personasVigentes.value.map((p) => ({
    value: p.tercero_id,
    label: `${p.tercero.nombre_completo}${p.rol?.nombre ? ` — ${p.rol.nombre}` : ''}${p.es_pagador ? ' (pagador registrado)' : ''}`,
  })),
  { value: OTRO, label: 'Otra persona (escribir nombre)' },
])

async function cargarPersonasDelInmueble(id: string | null): Promise<void> {
  quienPaga.value = null
  pagadorNombreLibre.value = ''
  pagadorDocumentoLibre.value = ''
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !id) return
  await tercerosStore.cargarTercerosAsociados(tenantId, id)
  const pagadorRegistrado = personasVigentes.value.find((p) => p.es_pagador)
  if (pagadorRegistrado) quienPaga.value = pagadorRegistrado.tercero_id
}

watch(
  inmuebleEfectivoId,
  (id) => {
    cargarPersonasDelInmueble(id)
    cargarSaldoPendiente(id)
  },
  { immediate: true },
)

// ── Documento adjunto (comprobante) ─────────────────────────────────────
// RC-7 — el comprobante escaneado (foto del recibo físico, comprobante
// bancario) cuelga del pago vía documentos.pago_id (20260903170000); se
// sube DESPUÉS de registrar el pago, porque necesita el pago_id que aún no
// existe. Mismos límites que UiLibreriaDocumentos.vue (subir-documento los
// vuelve a exigir igual, esto es solo para un error temprano y legible).
const MIME_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const TAMANO_MAXIMO = 15 * 1024 * 1024
const observaciones = ref('')
const archivoComprobante = ref<File | null>(null)

function elegirArchivo(evento: Event): void {
  const input = evento.target as HTMLInputElement
  const archivo = input.files?.[0] ?? null
  if (archivo && (!MIME_PERMITIDOS.has(archivo.type) || archivo.size > TAMANO_MAXIMO)) {
    error.value = 'El comprobante debe ser PDF, JPG o PNG, hasta 15 MB.'
    archivoComprobante.value = null
    input.value = ''
    return
  }
  archivoComprobante.value = archivo
}

async function subirComprobante(pagoId: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const inmuebleId = inmuebleEfectivoId.value
  if (!tenantId || !inmuebleId || !archivoComprobante.value) return
  try {
    const tipos = await cargarListaTipos(tenantId, 'TIPO_DOCUMENTO')
    const tipoComprobante = tipos.find((t) => t.codigo === 'comprobante_pago')
    if (!tipoComprobante) return
    await documentosStore.subirDocumento({
      tenantId,
      inmuebleId,
      tipoDocumentoId: tipoComprobante.id,
      archivo: archivoComprobante.value,
      pagoId,
    })
  } catch (excepcion) {
    toast.add({
      title: mensajeError(excepcion, 'El pago quedó registrado, pero no se pudo adjuntar el comprobante.'),
      color: 'warning',
    })
  }
}

async function registrar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const inmuebleId = inmuebleEfectivoId.value
  if (!tenantId || !inmuebleId || !monto.value || !fechaPago.value) return
  if (aplicacionManualActiva.value && (seleccionCargos.value.size === 0 || montoAsignado.value > monto.value)) return
  error.value = null
  registrando.value = true
  try {
    const resultado = await cuentaStore.registrarPago({
      inmuebleId,
      tenantId,
      monto: monto.value,
      fechaPago: fechaPago.value,
      referencia: referencia.value.trim() || undefined,
      formaPago: formaPago.value,
      pagadorTerceroId: quienPaga.value && quienPaga.value !== OTRO ? quienPaga.value : null,
      pagadorNombre: quienPaga.value === OTRO ? pagadorNombreLibre.value.trim() || null : null,
      pagadorDocumento: quienPaga.value === OTRO ? pagadorDocumentoLibre.value.trim() || null : null,
      observaciones: observaciones.value.trim() || null,
      aplicacionesManuales:
        aplicacionManualActiva.value && seleccionCargos.value.size > 0
          ? [...seleccionCargos.value.entries()].map(([cargoId, montoCargo]) => ({ cargoId, monto: montoCargo }))
          : undefined,
    })
    if (archivoComprobante.value) await subirComprobante(resultado.pago_id)
    monto.value = null
    referencia.value = ''
    observaciones.value = ''
    archivoComprobante.value = null
    aplicacionManualActiva.value = false
    seleccionCargos.value = new Map()
    emit('registrado', resultado)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar el pago.')
  } finally {
    registrando.value = false
  }
}

defineExpose({ registrar })
</script>

<template>
  <div>
    <div class="space-y-4 text-sm max-w-md">
      <UFormField v-if="!inmuebleId" label="Inmueble" name="inmueble">
        <UiSelectorBuscable v-model="inmuebleSeleccionadoId" :opciones="opcionesInmueble" placeholder="Selecciona un inmueble…" />
      </UFormField>
      <div v-if="inmuebleEfectivoId && saldoPendiente !== null" class="rounded-sm border border-neutral-200 bg-neutral-50 px-3 py-2 flex items-center justify-between">
        <span class="text-neutral-500">Saldo pendiente del inmueble</span>
        <span class="font-semibold" :class="saldoPendiente > 0 ? 'text-error-600' : 'text-success-600'">
          {{ formatoMoneda(saldoPendiente) }}
        </span>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Monto" name="monto">
          <UInput v-model.number="monto" type="number" min="0" step="0.01" placeholder="420000" class="w-full" />
        </UFormField>
        <UFormField label="Fecha de pago" name="fecha_pago">
          <UInput v-model="fechaPago" type="date" class="w-full" />
        </UFormField>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Forma de pago" name="forma_pago">
          <USelect v-model="formaPago" :items="opcionesFormaPago" class="w-full" />
        </UFormField>
        <UFormField label="Referencia (opcional)" name="referencia">
          <UInput v-model="referencia" type="text" placeholder="Transferencia · 88213" class="w-full" />
        </UFormField>
      </div>
      <UFormField label="Quién paga" name="quien_paga">
        <USelect
          :model-value="quienPaga"
          :items="opcionesQuienPaga"
          :disabled="!inmuebleEfectivoId"
          class="w-full"
          @update:model-value="(v) => (quienPaga = v as string | null)"
        />
      </UFormField>
      <div v-if="quienPaga === OTRO" class="grid grid-cols-2 gap-4">
        <UFormField label="Nombre de quien paga" name="pagador_nombre">
          <UInput v-model="pagadorNombreLibre" placeholder="Nombre de la persona" class="w-full" />
        </UFormField>
        <UFormField label="Cédula de quien paga" name="pagador_documento">
          <UInput v-model="pagadorDocumentoLibre" placeholder="C.C. 1234567890" class="w-full" />
        </UFormField>
      </div>
      <UFormField
        name="aplicacion_manual"
        :help="
          !inmuebleEfectivoId
            ? 'Selecciona un inmueble primero.'
            : cargosDelInmueble.length === 0
              ? 'Este inmueble no tiene cargos pendientes — no hay nada a qué aplicar.'
              : undefined
        "
      >
        <UCheckbox
          :model-value="aplicacionManualActiva"
          label="Aplicar a cargos específicos"
          :disabled="!inmuebleEfectivoId || cargosDelInmueble.length === 0"
          @update:model-value="(v) => (aplicacionManualActiva = !!v)"
        />
      </UFormField>
      <div v-if="aplicacionManualActiva" class="space-y-2 rounded-sm border border-neutral-200 p-3">
        <div v-for="cargo in cargosDelInmueble" :key="cargo.id ?? undefined" class="flex items-center gap-3">
          <UCheckbox
            :model-value="cargo.id ? seleccionCargos.has(cargo.id) : false"
            @update:model-value="(v) => alternarCargo(cargo, !!v)"
          />
          <div class="flex-1 min-w-0">
            <p class="truncate">{{ etiquetaCargo(cargo) }}</p>
            <p class="text-xs text-neutral-500">Pendiente {{ formatoMoneda(cargo.monto_pendiente ?? 0) }}</p>
          </div>
          <UInput
            v-if="cargo.id && seleccionCargos.has(cargo.id)"
            type="number"
            min="0"
            step="0.01"
            :model-value="seleccionCargos.get(cargo.id)"
            class="w-32"
            @update:model-value="(v) => actualizarMontoCargo(cargo.id as string, Number(v))"
          />
        </div>
        <p class="text-xs" :class="montoAsignado > (monto ?? 0) ? 'text-error-600' : 'text-neutral-500'">
          Asignado: {{ formatoMoneda(montoAsignado) }} de {{ formatoMoneda(monto ?? 0) }}
        </p>
      </div>
      <UFormField label="Comprobante adjunto (opcional)" name="archivo_comprobante" help="PDF, JPG o PNG · hasta 15 MB">
        <div class="flex items-center gap-3">
          <UInput type="file" accept=".pdf,.jpg,.jpeg,.png" class="w-full" @change="elegirArchivo" />
        </div>
        <p v-if="archivoComprobante" class="text-xs text-neutral-500 mt-1 truncate">{{ archivoComprobante.name }}</p>
      </UFormField>
      <UFormField label="Observaciones (opcional)" name="observaciones">
        <UTextarea v-model="observaciones" :rows="2" autoresize placeholder="Nota sobre el pago" class="w-full" />
      </UFormField>
    </div>
    <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-3 max-w-md" />
    <UButton
      class="mt-3"
      :loading="registrando"
      :disabled="
        !monto ||
        !inmuebleEfectivoId ||
        (aplicacionManualActiva && (seleccionCargos.size === 0 || montoAsignado > monto))
      "
      @click="registrar"
    >
      Registrar pago
    </UButton>
  </div>
</template>
