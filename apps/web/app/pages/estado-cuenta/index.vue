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
const inmueblesStore = useInmueblesStore()
const copropiedadStore = useCopropiedadStore()
const toast = useToast()

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

const { pending: cargandoBase } = await useAsyncData('cuenta-corriente-base', async () => {
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
    cargandoContenido.value = true
    try {
      await Promise.all([
        cuentaStore.cargarCargosAbiertos(tenantId, id),
        cuentaStore.cargarPagos(tenantId, id),
        cuentaStore.cargarComprobantesEmitidos(tenantId, id),
      ])
    } catch (excepcion) {
      error.value = mensajeError(excepcion, 'No se pudo cargar la cuenta.')
    } finally {
      cargandoContenido.value = false
    }
  },
  { immediate: true },
)

/** Etiqueta de periodo para el historial de comprobantes — "A hoy" cuando se
 * generó a mano desde la ficha (sin periodo, ver ComprobanteEmitido). */
function etiquetaPeriodoComprobante(periodoId: string | null): string {
  if (!periodoId) return 'A hoy'
  return periodoPorId.value.get(periodoId) ?? '—'
}


function origenLegible(cargo: { concepto_id: string | null; categoria: string | null }): string {
  if (cargo.concepto_id) return conceptoPorId.value.get(cargo.concepto_id) ?? cargo.concepto_id
  return cargo.categoria ? (etiquetaCategoria[cargo.categoria] ?? cargo.categoria) : '—'
}

const generandoPdf = ref(false)
const errorPdf = ref<string | null>(null)
// Último comprobante generado en esta sesión — objetivo del botón de correo
// de arriba. El historial de abajo reenvía cualquier comprobante por su id.
const ultimoComprobanteId = ref<string | null>(null)
const enviandoId = ref<string | null>(null)
const resultadoCorreo = ref<string | null>(null)
const cargandoContenido = ref(false)

// P0: confirmación antes de enviar correo
const modalCorreoAbierto = ref(false)
const comprobanteParaCorreo = ref<{ id: string; reenviar: boolean } | null>(null)
const inmuebleActual = computed(() =>
  cuentaStore.inmuebles.find((i) => i.id === inmuebleSeleccionadoId.value) ?? null,
)

function pedirConfirmacionCorreo(id: string, reenviar: boolean): void {
  comprobanteParaCorreo.value = { id, reenviar }
  modalCorreoAbierto.value = true
}

function cerrarModalCorreo(): void {
  modalCorreoAbierto.value = false
  comprobanteParaCorreo.value = null
}

async function confirmarEnvioCorreo(): Promise<void> {
  const datos = comprobanteParaCorreo.value
  cerrarModalCorreo()
  if (datos) await enviarPorCorreo(datos.id, datos.reenviar)
}

async function generarEstadoCuenta(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const inmueble = cuentaStore.inmuebles.find((i) => i.id === inmuebleSeleccionadoId.value)
  if (!tenantId || !inmueble) return

  errorPdf.value = null
  generandoPdf.value = true
  try {
    // Propietario vigente del inmueble (mapa nombre por inmueble, ya cargado).
    const propietarioNombre = cuentaStore.propietariosPorInmueble.get(inmueble.id) ?? null
    const [coeficienteVigente, cuentasBancarias, entidadesFinancieras] = await Promise.all([
      inmueblesStore.cargarCoeficienteVigente(tenantId, inmueble.id),
      copropiedadStore.cargarCuentasBancarias(tenantId),
      copropiedadStore.cargarEntidadesFinancieras(tenantId),
    ])
    // cuentas_bancarias.banco (texto) se reemplazó por entidad_financiera_id
    // (FK a lista_tipos, 20260822170000) — el nombre sale de ese catálogo.
    const nombrePorEntidad = new Map(entidadesFinancieras.map((e) => [e.id, e.nombre]))
    const tenant = tenantStore.activeTenant
    const id = await cuentaStore.generarEstadoCuenta({
      tenantId,
      inmuebleId: inmueble.id,
      inmuebleCodigo: inmueble.codigo,
      tenantNombre: tenant?.name ?? '',
      tenantNit: tenant?.nit ?? null,
      tenantDireccion: tenant?.direccion ?? null,
      tenantCiudad: tenant?.ciudad ?? null,
      tenantTelefono: tenant?.telefono_1 ?? null,
      tenantEmail: tenant?.email ?? null,
      coeficiente: coeficienteVigente ? Number(coeficienteVigente.valor) : null,
      canalesPago: cuentasBancarias
        .filter((c) => c.es_recaudo && c.activa)
        .map((c) => ({
          banco: nombrePorEntidad.get(c.entidad_financiera_id) ?? '—',
          tipo_cuenta: c.tipo_cuenta,
          numero_cuenta: c.numero_cuenta,
        })),
      propietarioNombre,
      etiquetasConcepto: Object.fromEntries(
        conceptoStore.conceptos.map((c) => [c.id, c.codigo]),
      ),
    })
    ultimoComprobanteId.value = id
    await cuentaStore.cargarComprobantesEmitidos(tenantId, inmueble.id)
    toast.add({ title: 'Comprobante generado', color: 'success' })
    window.open(`/comprobante-cuenta/${id}`, '_blank')
  } catch (excepcion) {
    errorPdf.value = mensajeError(excepcion, 'No se pudo generar el comprobante de cuenta.')
  } finally {
    generandoPdf.value = false
  }
}

/** D-28: envía un comprobante por correo a los propietarios vigentes del
 * inmueble (Edge Function enviar-estado-cuenta). El enlace que recibe el
 * propietario lleva un token firmado NUEVO cada vez — nunca montos en la
 * URL — pero apunta al MISMO documento sellado (mismo folio/hash/datos):
 * reenviar desde el historial no genera uno distinto, reabre el original.
 *
 * `reenviar: true` para las filas del historial — es una acción explícita
 * de quien la pide, así que se salta el guard anti-doble-envío de <12h que
 * sí aplica al botón de arriba (ese es el flujo rutinario recién generado). */
async function enviarPorCorreo(id: string | null, reenviar = false): Promise<void> {
  if (!id) return
  enviandoId.value = id
  resultadoCorreo.value = null
  try {
    const cliente = useSupabaseClient()
    const { data, error: errorFuncion } = await cliente.functions.invoke<{
      enviados: string[]
      omitidosSinEmail: number
      enlace: string
    }>('enviar-estado-cuenta', {
      body: { estado_cuenta_id: id, reenviar },
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
    toast.add({ title: 'Correo enviado', color: 'success' })
  } catch (excepcion) {
    resultadoCorreo.value = mensajeError(excepcion, 'No se pudo enviar el correo.')
  } finally {
    enviandoId.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold mb-2">Estado de cuenta</h1>
      <p class="text-sm text-neutral-500">
        Cargos pendientes e historial de pagos por inmueble.
      </p>
    </div>

    <p v-if="cuentaStore.inmuebles.length === 0 && !cargandoBase" class="text-neutral-500 text-sm">
      Esta copropiedad todavía no tiene inmuebles registrados.
    </p>

    <!-- P1: skeleton mientras carga la base -->
    <template v-else-if="cargandoBase">
      <USkeleton class="h-10 w-72" />
      <div class="flex gap-3">
        <USkeleton class="h-9 w-40" />
        <USkeleton class="h-9 w-56" />
      </div>
      <USkeleton class="h-48 w-full rounded-lg" />
      <USkeleton class="h-64 w-full rounded-lg" />
      <USkeleton class="h-48 w-full rounded-lg" />
    </template>

    <template v-else>
      <!-- selector de inmueble -->
      <UFormField label="Inmueble" name="inmueble">
        <UiSelectorBuscable v-model="inmuebleSeleccionadoId" :opciones="opcionesInmueble" class="w-64" />
      </UFormField>

      <!-- P2: botones de acción en fila separada -->
      <div class="flex items-center gap-3">
        <UButton
          variant="soft"
          :loading="generandoPdf"
          title="Genera un PDF con el estado de cuenta del inmueble seleccionado"
          @keydown.ctrl.enter="generarEstadoCuenta"
          @click="generarEstadoCuenta"
        >
          Generar comprobante de cuenta
        </UButton>
        <UButton
          variant="outline"
          :loading="enviandoId === ultimoComprobanteId && enviandoId !== null"
          :disabled="!ultimoComprobanteId"
          title="Envía el comprobante generado a los propietarios registrados del inmueble"
          @click="pedirConfirmacionCorreo(ultimoComprobanteId!, false)"
        >
          Enviar por correo al propietario
        </UButton>
      </div>

      <UAlert v-if="resultadoCorreo" color="info" variant="soft" :title="resultadoCorreo" />

      <!-- P3: retry en error de PDF -->
      <UAlert v-if="errorPdf" color="error" variant="soft" :title="errorPdf">
        <template #actions>
          <UButton size="xs" variant="soft" @click="generarEstadoCuenta">Reintentar</UButton>
        </template>
      </UAlert>
      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <div>
        <UiTituloDescripcion clase-descripcion="text-xs text-neutral-500 mt-1 mb-2">
          <template #titulo>
            <h2 class="text-lg font-semibold">Comprobantes emitidos</h2>
          </template>
          <template #descripcion>
            El historial oficial — cada uno tiene su folio y hash propios y no cambia. Para
            reenviar exactamente lo que ya se envió, usa "Reenviar" aquí en vez de generar uno
            nuevo arriba.
          </template>
        </UiTituloDescripcion>
        <template v-if="cargandoContenido">
          <div class="space-y-2">
            <USkeleton v-for="n in 3" :key="n" class="h-10 w-full rounded-lg" />
          </div>
        </template>
        <UiTabla
          v-else
          :columnas="[
            { clave: 'folio', etiqueta: 'Folio' },
            { clave: 'periodo', etiqueta: 'Periodo' },
            { clave: 'generado', etiqueta: 'Generado' },
            { clave: 'acciones', etiqueta: '' },
          ]"
          :filas="cuentaStore.comprobantesEmitidos"
          :clave-fila="(c) => c.id"
          vacio="Todavía no se ha emitido ningún comprobante para este inmueble."
        >
          <template #celda-folio="{ fila }">
            <span class="font-mono text-xs">{{ fila.folio ?? '—' }}</span>
          </template>
          <template #celda-periodo="{ fila }">
            <span class="text-neutral-500">{{ etiquetaPeriodoComprobante(fila.periodo_id) }}</span>
          </template>
          <template #celda-generado="{ fila }">
            <span class="text-neutral-500">{{ new Date(fila.created_at).toLocaleString('es-CO') }}</span>
          </template>
          <template #celda-acciones="{ fila }">
            <div class="flex justify-end gap-2">
              <UButton
                size="xs"
                variant="ghost"
                icon="i-lucide-external-link"
                :to="`/comprobante-cuenta/${fila.id}`"
                target="_blank"
              >
                Ver
              </UButton>
              <UButton
                size="xs"
                variant="ghost"
                :loading="enviandoId === fila.id"
                @click="pedirConfirmacionCorreo(fila.id, true)"
              >
                Reenviar
              </UButton>
            </div>
          </template>
        </UiTabla>
      </div>

      <div>
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-lg font-semibold">Cargos pendientes</h2>
          <p class="text-sm text-neutral-500">Total: {{ formatoMoneda(totalPendiente) }}</p>
        </div>
        <template v-if="cargandoContenido">
          <div class="space-y-2">
            <USkeleton v-for="n in 5" :key="n" class="h-10 w-full rounded-lg" />
          </div>
        </template>
        <UiTabla
          v-else
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
          <template #celda-origen="{ fila }"><span class="text-neutral-500">{{ origenLegible(fila) }}</span></template>
          <template #celda-periodo="{ fila }">
            <span class="text-neutral-500">{{ fila.periodo_id ? (periodoPorId.get(fila.periodo_id) ?? '—') : '—' }}</span>
          </template>
          <template #celda-pendiente="{ fila }">{{ formatoMoneda(fila.monto_pendiente ?? 0) }}</template>
          <template #celda-creado="{ fila }">
            <span class="text-neutral-500">{{ fila.created_at ? new Date(fila.created_at).toLocaleDateString('es-CO') : '—' }}</span>
          </template>
        </UiTabla>
      </div>

      <div>
        <h2 class="text-lg font-semibold mb-2">Pagos recientes</h2>
        <template v-if="cargandoContenido">
          <div class="space-y-2">
            <USkeleton v-for="n in 3" :key="n" class="h-10 w-full rounded-lg" />
          </div>
        </template>
        <UiTabla
          v-else
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
          <template #celda-referencia="{ fila }"><span class="text-neutral-500">{{ fila.referencia ?? '—' }}</span></template>
        </UiTabla>
      </div>
    </template>

    <!-- P0: modal de confirmación antes de enviar correo -->
    <UModal v-model:open="modalCorreoAbierto" title="Enviar comprobante por correo">
      <template #body>
        <p class="text-sm">
          Se enviará el comprobante de cuenta a los propietarios de
          <strong>{{ inmuebleActual?.codigo ?? '—' }}</strong>.
        </p>
        <p v-if="comprobanteParaCorreo?.reenviar" class="text-xs text-neutral-500 mt-2">
          Es un reenvío — se abrirá el mismo documento sellado con un nuevo enlace.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="outline" @click="cerrarModalCorreo">Cancelar</UButton>
          <UButton @click="confirmarEnvioCorreo">Confirmar envío</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
