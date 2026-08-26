<script setup lang="ts">
// Motor de cuenta corriente (E1-E8) — estado de cuenta por inmueble.
// Puramente de lectura (v_cargo_saldo + pagos, ambas RLS agent+auditor) —
// por eso el permiso de la página es 'data:read' y no 'data:create' como el
// resto de F6: un auditor debe poder ver el saldo sin poder escribir nada.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const cuentaStore = useCuentaCorrienteStore()
const conceptoStore = useConceptoStore()
const liquidacionStore = useLiquidacionStore()

const error = ref<string | null>(null)
const inmuebleSeleccionadoId = ref<string | null>(null)

const conceptoPorId = computed(() => new Map(conceptoStore.conceptos.map((c) => [c.id, c.codigo])))
const periodoPorId = computed(
  () =>
    new Map(
      liquidacionStore.periodos.map((p) => [p.id, `${p.anio}-${String(p.mes).padStart(2, '0')}`]),
    ),
)

const etiquetaCategoria: Record<string, string> = {
  capital: 'Capital',
  interes: 'Interés',
  otro: 'Otro',
}

const totalPendiente = computed(() =>
  cuentaStore.cargosAbiertos.reduce((acc, c) => acc + Number(c.monto_pendiente ?? 0), 0),
)

const opcionesInmueble = computed(() =>
  cuentaStore.inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo })),
)

await useAsyncData('cuenta-corriente-base', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return null
    await Promise.all([
      cuentaStore.cargarInmuebles(tenantId),
      cuentaStore.cargarPropietarios(tenantId),
      conceptoStore.cargarConceptos(tenantId),
      liquidacionStore.cargarPeriodos(tenantId),
    ])
  return null
})

watch(
  () => cuentaStore.inmuebles,
  (lista) => {
    if (!inmuebleSeleccionadoId.value && lista.length > 0) {
      inmuebleSeleccionadoId.value = lista[0]!.id
    }
  },
  { immediate: true },
)

watch(
  inmuebleSeleccionadoId,
  async (id) => {
    error.value = null
    const tenantId = tenantStore.activeTenant?.id
    if (!id || !tenantId) return
    try {
      await Promise.all([
        cuentaStore.cargarCargosAbiertos(tenantId, id),
        cuentaStore.cargarPagos(tenantId, id),
      ])
    } catch (excepcion) {
      error.value = mensajeError(excepcion, 'No se pudo cargar la cuenta.')
    }
  },
  { immediate: true },
)


function origenLegible(cargo: { concepto_id: string | null; categoria: string | null }): string {
  if (cargo.concepto_id) return conceptoPorId.value.get(cargo.concepto_id) ?? cargo.concepto_id
  return cargo.categoria ? (etiquetaCategoria[cargo.categoria] ?? cargo.categoria) : '—'
}

const generandoPdf = ref(false)
const errorPdf = ref<string | null>(null)
// Último comprobante generado en esta sesión — objetivo del botón de correo.
const ultimoComprobanteId = ref<string | null>(null)
const enviandoCorreo = ref(false)
const resultadoCorreo = ref<string | null>(null)

async function generarEstadoCuenta(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const inmueble = cuentaStore.inmuebles.find((i) => i.id === inmuebleSeleccionadoId.value)
  if (!tenantId || !inmueble) return

  errorPdf.value = null
  generandoPdf.value = true
  try {
    // Propietario vigente del inmueble (mapa nombre por inmueble, ya cargado).
    const propietarioNombre = cuentaStore.propietariosPorInmueble.get(inmueble.id) ?? null
    const id = await cuentaStore.generarEstadoCuenta({
      tenantId,
      inmuebleId: inmueble.id,
      inmuebleCodigo: inmueble.codigo,
      tenantNombre: tenantStore.activeTenant?.name ?? '',
      tenantNit: tenantStore.activeTenant?.nit ?? null,
      propietarioNombre,
      etiquetasConcepto: Object.fromEntries(
        conceptoStore.conceptos.map((c) => [c.id, c.codigo]),
      ),
    })
    ultimoComprobanteId.value = id
    window.open(`/comprobante-cuenta/${id}`, '_blank')
  } catch (excepcion) {
    errorPdf.value = mensajeError(excepcion, 'No se pudo generar el comprobante de cuenta.')
  } finally {
    generandoPdf.value = false
  }
}

/** D-28: envía el último comprobante generado al correo de los propietarios
 * vigentes del inmueble (Edge Function enviar-estado-cuenta). El enlace que
 * recibe el propietario lleva token firmado — nunca montos en la URL. */
async function enviarPorCorreo(): Promise<void> {
  if (!ultimoComprobanteId.value) return
  enviandoCorreo.value = true
  resultadoCorreo.value = null
  try {
    const cliente = useSupabaseClient()
    const { data, error: errorFuncion } = await cliente.functions.invoke<{
      enviados: string[]
      omitidosSinEmail: number
      enlace: string
    }>('enviar-estado-cuenta', {
      body: { estado_cuenta_id: ultimoComprobanteId.value },
    })
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (!data) throw new Error('Respuesta vacía del servidor.')
    const partes = [
      `Enviado a ${data.enviados.length} destinatario(s).`,
      data.omitidosSinEmail > 0
        ? `${data.omitidosSinEmail} propietario(s) sin correo registrado.`
        : null,
    ].filter(Boolean)
    resultadoCorreo.value = partes.join(' ')
  } catch (excepcion) {
    resultadoCorreo.value = mensajeError(excepcion, 'No se pudo enviar el correo.')
  } finally {
    enviandoCorreo.value = false
  }
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-xl font-semibold mb-2">Estado de cuenta</h1>
      <p class="text-sm text-gray-500">
        Cargos pendientes e historial de pagos por inmueble.
      </p>
    </div>

    <p v-if="cuentaStore.inmuebles.length === 0" class="text-gray-500 text-sm">
      Esta copropiedad todavía no tiene inmuebles registrados.
    </p>

    <template v-else>
      <div class="flex items-end gap-3">
        <UFormField label="Inmueble" name="inmueble">
          <UiSelectorBuscable v-model="inmuebleSeleccionadoId" :opciones="opcionesInmueble" />
        </UFormField>
        <UButton variant="soft" :loading="generandoPdf" @click="generarEstadoCuenta">
          Generar comprobante de cuenta
        </UButton>
        <UButton
          variant="outline"
          :loading="enviandoCorreo"
          :disabled="!ultimoComprobanteId"
          @click="enviarPorCorreo"
        >
          Enviar por correo al propietario
        </UButton>
      </div>

      <UAlert v-if="resultadoCorreo" color="info" variant="soft" :title="resultadoCorreo" />

      <UAlert v-if="errorPdf" color="error" variant="soft" :title="errorPdf" />
      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <div>
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-lg font-semibold">Cargos pendientes</h2>
          <p class="text-sm text-gray-500">Total: {{ formatoMoneda(totalPendiente) }}</p>
        </div>
        <UiTabla
          :columnas="[
            { clave: 'categoria', etiqueta: 'Categoría' },
            { clave: 'origen', etiqueta: 'Concepto / origen' },
            { clave: 'periodo', etiqueta: 'Periodo' },
            { clave: 'pendiente', etiqueta: 'Pendiente' },
            { clave: 'creado', etiqueta: 'Creado' },
          ]"
          :filas="cuentaStore.cargosAbiertos"
          :clave-fila="(cargo, i) => cargo.id ?? i"
          vacio="Sin saldo pendiente."
        >
          <template #celda-categoria="{ fila }">
            {{ fila.categoria ? (etiquetaCategoria[fila.categoria] ?? fila.categoria) : '—' }}
          </template>
          <template #celda-origen="{ fila }"><span class="text-gray-500">{{ origenLegible(fila) }}</span></template>
          <template #celda-periodo="{ fila }">
            <span class="text-gray-500">{{ fila.periodo_id ? (periodoPorId.get(fila.periodo_id) ?? '—') : '—' }}</span>
          </template>
          <template #celda-pendiente="{ fila }">{{ formatoMoneda(fila.monto_pendiente ?? 0) }}</template>
          <template #celda-creado="{ fila }">
            <span class="text-gray-500">{{ fila.created_at ? new Date(fila.created_at).toLocaleDateString('es-CO') : '—' }}</span>
          </template>
        </UiTabla>
      </div>

      <div>
        <h2 class="text-lg font-semibold mb-2">Pagos recientes</h2>
        <UiTabla
          :columnas="[
            { clave: 'fecha', etiqueta: 'Fecha' },
            { clave: 'monto', etiqueta: 'Monto' },
            { clave: 'referencia', etiqueta: 'Referencia' },
          ]"
          :filas="cuentaStore.pagos"
          :clave-fila="(pago) => pago.id"
          vacio="Sin pagos registrados todavía."
        >
          <template #celda-fecha="{ fila }">{{ fila.fecha_pago }}</template>
          <template #celda-monto="{ fila }">{{ formatoMoneda(fila.monto) }}</template>
          <template #celda-referencia="{ fila }"><span class="text-gray-500">{{ fila.referencia ?? '—' }}</span></template>
        </UiTabla>
      </div>
    </template>
  </div>
</template>
