<script setup lang="ts">
// Motor de cuenta corriente (E4) — novedades: ajustes manuales con
// aprobación separada del motor de cálculo (Docs/19 §284, AD-33). Crear es
// agent-only (rechazo/aprobación también) porque materializa un cargo real
// en el ledger al aprobar.
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:create' })

const tenantStore = useTenantStore()
const cuentaStore = useCuentaCorrienteStore()
const presupuestoStore = usePresupuestoStore()
const conceptoStore = useConceptoStore()

const inmueblePorId = computed(() => new Map(cuentaStore.inmuebles.map((i) => [i.id, i.codigo])))
const opcionesInmueble = computed(() =>
  cuentaStore.inmuebles.map((i) => ({ valor: i.id, etiqueta: i.codigo })),
)

// Fase 4 conceptos avanzados — el concepto "Novedad" es un singleton por
// tenant (conceptos_novedad_singleton_idx); permanente/prorrateable exigen
// vincularse a él para que el cargo generado se clasifique en cuenta
// corriente igual que cualquier otra línea.
const conceptoNovedad = computed(() =>
  conceptoStore.conceptos.find((c) => c.tipo_recurrencia === 'novedad' && c.estado !== 'archivado'),
)

// Fase 3 conceptos avanzados — solo cuentas hoja + naturaleza=ingreso pueden
// ser "componente presupuestal" de una novedad (guard_novedad_tipo_presupuesto,
// mismo criterio que presupuesto_cuenta.concepto_id).
const opcionesComponentePresupuestal = computed(() =>
  presupuestoStore.cuentas.filter((c) => c.es_hoja && c.naturaleza === 'ingreso'),
)
const tipoNovedadPorId = computed(() => new Map(cuentaStore.tiposNovedad.map((t) => [t.id, t.nombre])))
const cuentaPorId = computed(() => new Map(presupuestoStore.cuentas.map((c) => [c.id, c.nombre])))

await useAsyncData('cuenta-corriente-novedades-base', async () => {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return null
  await Promise.all([
    cuentaStore.cargarInmuebles(tenantId),
    cuentaStore.cargarNovedades(tenantId),
    cuentaStore.cargarTiposNovedad(tenantId),
    cuentaStore.cargarNovedadCuotas(tenantId),
    presupuestoStore.cargarCuentas(tenantId),
    conceptoStore.cargarConceptos(tenantId),
  ])
  return null
})

function formatoMoneda(valor: string | number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(valor))
}

// ── crear novedad ──────────────────────────────────────────────────────
const inmuebleId = ref<string | null>(null)
const tipo = ref<'CHARGE' | 'DISCOUNT' | 'ADJUSTMENT' | 'REFUND' | 'CREDIT' | 'DEBIT'>('CHARGE')
const tipoNovedadId = ref<number | null>(null)
const presupuestoCuentaId = ref<string | null>(null)
const monto = ref<number | null>(null)
const descripcion = ref('')
const fechaEfectiva = ref(new Date().toISOString().slice(0, 10))
const creando = ref(false)
const errorCrear = ref<string | null>(null)

// Fase 4 conceptos avanzados — mutuamente excluyentes
// (novedades_permanente_prorrateable_exclusivos).
const repeticion = ref<'ninguna' | 'permanente' | 'prorrateable'>('ninguna')
const cuotasTotales = ref<number | null>(null)
watch(repeticion, (valor) => {
  if (valor !== 'prorrateable') cuotasTotales.value = null
})

async function crearNovedad(): Promise<void> {
  errorCrear.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !inmuebleId.value || monto.value === null || !descripcion.value) return

  creando.value = true
  try {
    await cuentaStore.crearNovedad({
      tenantId,
      inmuebleId: inmuebleId.value,
      tipo: tipo.value,
      tipoNovedadId: tipoNovedadId.value,
      presupuestoCuentaId: presupuestoCuentaId.value,
      conceptoId: repeticion.value !== 'ninguna' ? (conceptoNovedad.value?.id ?? null) : null,
      monto: monto.value,
      descripcion: descripcion.value,
      fechaEfectiva: fechaEfectiva.value,
      permanente: repeticion.value === 'permanente',
      prorrateable: repeticion.value === 'prorrateable',
      cuotasTotales: repeticion.value === 'prorrateable' ? cuotasTotales.value : null,
    })
    monto.value = null
    descripcion.value = ''
    repeticion.value = 'ninguna'
    cuotasTotales.value = null
  } catch (excepcion) {
    errorCrear.value = mensajeError(excepcion, 'No se pudo crear la novedad.')
  } finally {
    creando.value = false
  }
}

// ── aprobar / rechazar ────────────────────────────────────────────────
const accionEnCursoId = ref<string | null>(null)
const errorAccion = ref<string | null>(null)
const motivoPorNovedad = ref<Record<string, string>>({})

async function aprobar(novedadId: string): Promise<void> {
  errorAccion.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  accionEnCursoId.value = novedadId
  try {
    await cuentaStore.aprobarNovedad(novedadId, tenantId)
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo aprobar la novedad.')
  } finally {
    accionEnCursoId.value = null
  }
}

async function rechazar(novedadId: string): Promise<void> {
  errorAccion.value = null
  const tenantId = tenantStore.activeTenant?.id
  const motivo = motivoPorNovedad.value[novedadId]
  if (!tenantId || !motivo) return

  accionEnCursoId.value = novedadId
  try {
    await cuentaStore.rechazarNovedad(novedadId, motivo, tenantId)
    motivoPorNovedad.value[novedadId] = ''
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo rechazar la novedad.')
  } finally {
    accionEnCursoId.value = null
  }
}

// Fase 4 conceptos avanzados — apaga una novedad permanente (deja de generar
// cargos futuros; los ya generados no se tocan).
async function inhabilitar(novedadId: string): Promise<void> {
  errorAccion.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return

  accionEnCursoId.value = novedadId
  try {
    await cuentaStore.inhabilitarNovedad(novedadId, tenantId)
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo inhabilitar la novedad.')
  } finally {
    accionEnCursoId.value = null
  }
}

// Fase 4 conceptos avanzados — "cuota N de M, saldo pendiente" por novedad
// prorrateable, agrupando cuentaStore.novedadCuotas (todas las del tenant).
const progresoCuotasPorNovedad = computed(() => {
  const mapa = new Map<string, { generadas: number; total: number; saldo: number }>()
  for (const cuota of cuentaStore.novedadCuotas) {
    const entrada = mapa.get(cuota.novedad_id) ?? { generadas: 0, total: 0, saldo: 0 }
    entrada.total += 1
    if (cuota.generada_at) entrada.generadas += 1
    else entrada.saldo += Number(cuota.monto_cuota)
    mapa.set(cuota.novedad_id, entrada)
  }
  return mapa
})
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-xl font-semibold mb-2">Novedades</h1>
      <p class="text-sm text-gray-500">
        Ajustes manuales (cargo, descuento, reembolso...) con aprobación separada del motor de
        cálculo — solo al aprobar se materializa un cargo en el ledger.
      </p>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-2">Crear novedad</h2>
      <p v-if="cuentaStore.inmuebles.length === 0" class="text-gray-500 text-sm">
        Esta copropiedad todavía no tiene inmuebles registrados.
      </p>
      <form v-else class="space-y-4 max-w-sm" @submit.prevent="crearNovedad">
        <UFormField label="Inmueble" name="inmueble">
          <UiSelectorBuscable v-model="inmuebleId" :opciones="opcionesInmueble" placeholder="— Elegir —" />
        </UFormField>
        <UFormField label="Tipo" name="tipo">
          <select
            v-model="tipo"
            class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
          >
            <option value="CHARGE">Cargo (CHARGE)</option>
            <option value="DEBIT">Débito (DEBIT)</option>
            <option value="DISCOUNT">Descuento (DISCOUNT)</option>
            <option value="CREDIT">Crédito (CREDIT)</option>
            <option value="REFUND">Reembolso (REFUND)</option>
            <option value="ADJUSTMENT">Ajuste (ADJUSTMENT)</option>
          </select>
        </UFormField>
        <UFormField label="Monto" name="monto">
          <UInput v-model.number="monto" type="number" step="0.01" required class="w-full" />
        </UFormField>
        <p class="text-xs text-gray-500 -mt-2">
          CHARGE/DEBIT deben ser positivos; DISCOUNT/CREDIT/REFUND, negativos; ADJUSTMENT admite
          cualquier signo distinto de cero.
        </p>
        <UFormField label="Tipo de novedad" name="tipo_novedad">
          <select
            v-model="tipoNovedadId"
            class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
          >
            <option :value="null">— Sin clasificar —</option>
            <option v-for="t in cuentaStore.tiposNovedad" :key="t.id" :value="t.id">
              {{ t.nombre }}
            </option>
          </select>
        </UFormField>
        <UFormField label="Componente presupuestal" name="componente_presupuestal">
          <select
            v-model="presupuestoCuentaId"
            class="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5"
          >
            <option :value="null">— Sin vincular —</option>
            <option v-for="c in opcionesComponentePresupuestal" :key="c.id" :value="c.id">
              {{ c.codigo }} — {{ c.nombre }}
            </option>
          </select>
          <p class="text-xs text-gray-500 mt-1">
            Bajo qué componente del presupuesto se explica este cobro — solo cuentas hoja de
            ingreso.
          </p>
        </UFormField>
        <UFormField label="Repetición" name="repeticion">
          <div class="flex flex-col gap-1">
            <label class="flex items-center gap-2 text-sm">
              <input v-model="repeticion" type="radio" value="ninguna" />
              Única vez (comportamiento actual)
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input v-model="repeticion" type="radio" value="permanente" />
              Permanente (se repite cada periodo hasta inhabilitarse)
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input v-model="repeticion" type="radio" value="prorrateable" />
              Prorrateable (dividida en N cuotas iguales, una por periodo)
            </label>
          </div>
          <p v-if="repeticion !== 'ninguna' && !conceptoNovedad" class="text-xs text-red-500 mt-1">
            No existe el concepto "Novedad" del tenant — créalo primero en Conceptos (Tipo =
            Novedad).
          </p>
        </UFormField>
        <UFormField v-if="repeticion === 'prorrateable'" label="Número de cuotas" name="cuotas_totales">
          <UInput v-model.number="cuotasTotales" type="number" min="2" step="1" required class="w-full" />
        </UFormField>
        <UFormField label="Descripción" name="descripcion">
          <UInput v-model="descripcion" required class="w-full" />
        </UFormField>
        <UFormField label="Fecha efectiva" name="fecha_efectiva">
          <UInput v-model="fechaEfectiva" type="date" required class="w-full" />
        </UFormField>
        <UAlert v-if="errorCrear" color="error" variant="soft" :title="errorCrear" />
        <UButton
          type="submit"
          :loading="creando"
          :disabled="repeticion !== 'ninguna' && !conceptoNovedad"
        >
          Crear novedad
        </UButton>
      </form>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-2">Novedades registradas</h2>
      <UAlert v-if="errorAccion" color="error" variant="soft" :title="errorAccion" class="mb-2" />
      <UiTabla
        :columnas="[
          { clave: 'fechaEfectiva', etiqueta: 'Fecha efectiva' },
          { clave: 'inmueble', etiqueta: 'Inmueble' },
          { clave: 'tipo', etiqueta: 'Tipo' },
          { clave: 'tipoNovedad', etiqueta: 'Tipo de novedad' },
          { clave: 'componentePresupuestal', etiqueta: 'Componente presupuestal' },
          { clave: 'monto', etiqueta: 'Monto' },
          { clave: 'descripcion', etiqueta: 'Descripción' },
          { clave: 'repeticion', etiqueta: 'Repetición' },
          { clave: 'progreso', etiqueta: 'Progreso' },
          { clave: 'estado', etiqueta: 'Estado' },
          { clave: 'acciones', etiqueta: 'Acciones' },
        ]"
        :filas="cuentaStore.novedades"
        :clave-fila="(novedad) => novedad.id"
        vacio="Ninguna."
      >
        <template #celda-fechaEfectiva="{ fila }">{{ fila.fecha_efectiva }}</template>
        <template #celda-inmueble="{ fila }">
          <span class="text-gray-500">{{ inmueblePorId.get(fila.inmueble_id) ?? fila.inmueble_id }}</span>
        </template>
        <template #celda-tipo="{ fila }">{{ fila.tipo }}</template>
        <template #celda-tipoNovedad="{ fila }">
          <span class="text-gray-500">
            {{ fila.tipo_novedad_id ? (tipoNovedadPorId.get(fila.tipo_novedad_id) ?? '—') : '—' }}
          </span>
        </template>
        <template #celda-componentePresupuestal="{ fila }">
          <span class="text-gray-500">
            {{
              fila.presupuesto_cuenta_id ? (cuentaPorId.get(fila.presupuesto_cuenta_id) ?? '—') : '—'
            }}
          </span>
        </template>
        <template #celda-monto="{ fila }">{{ formatoMoneda(fila.monto) }}</template>
        <template #celda-descripcion="{ fila }"><span class="text-gray-500">{{ fila.descripcion }}</span></template>
        <template #celda-repeticion="{ fila }">
          <span class="text-gray-500">
            {{
              fila.permanente
                ? fila.inhabilitada_at
                  ? 'Permanente (inhabilitada)'
                  : 'Permanente'
                : fila.prorrateable
                  ? `Prorrateable (${fila.cuotas_totales} cuotas)`
                  : '—'
            }}
          </span>
        </template>
        <template #celda-progreso="{ fila }">
          <span v-if="fila.prorrateable" class="text-gray-500">
            {{ progresoCuotasPorNovedad.get(fila.id)?.generadas ?? 0 }} de {{ fila.cuotas_totales }}
            — saldo {{ formatoMoneda(progresoCuotasPorNovedad.get(fila.id)?.saldo ?? 0) }}
          </span>
          <span v-else class="text-gray-500">—</span>
        </template>
        <template #celda-estado="{ fila }"><span class="text-gray-500">{{ fila.estado }}</span></template>
        <template #celda-acciones="{ fila }">
          <div v-if="fila.estado === 'pendiente'" class="flex items-center gap-2">
            <UButton
              size="xs"
              variant="soft"
              :loading="accionEnCursoId === fila.id"
              @click="aprobar(fila.id)"
            >
              Aprobar
            </UButton>
            <UInput
              v-model="motivoPorNovedad[fila.id]"
              placeholder="Motivo de rechazo"
              size="xs"
              class="w-36"
            />
            <UButton
              size="xs"
              variant="soft"
              color="error"
              :disabled="!motivoPorNovedad[fila.id]"
              :loading="accionEnCursoId === fila.id"
              @click="rechazar(fila.id)"
            >
              Rechazar
            </UButton>
          </div>
          <UButton
            v-else-if="fila.estado === 'aprobada' && fila.permanente && !fila.inhabilitada_at"
            size="xs"
            variant="soft"
            color="error"
            :loading="accionEnCursoId === fila.id"
            @click="inhabilitar(fila.id)"
          >
            Inhabilitar
          </UButton>
          <span v-else class="text-gray-500">—</span>
        </template>
      </UiTabla>
    </div>
  </div>
</template>
