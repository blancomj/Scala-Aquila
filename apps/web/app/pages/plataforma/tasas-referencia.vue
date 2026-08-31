<script setup lang="ts">
// Consola de plataforma — registro de tasas de referencia certificadas
// (CAR §3.4, bloque 27 del roadmap). Es el único punto del producto donde se
// carga el IBC: hasta 2026-08-29 no existía ninguno y las 62 filas de la
// tabla eran fixtures de test, así que una política de mora activada se
// habría validado contra un dato de prueba.
//
// No lleva middleware `tenant`/`rbac`: `is_platform_admin` es un plano de
// autorización aparte (AD-09/SEC-10), igual que en plataforma/index.vue.
definePageMeta({ layout: 'default', middleware: ['platform'] })

const tasasStore = useTasasReferenciaStore()

await useAsyncData('plataforma-tasas-referencia', () => tasasStore.cargarTasas())

const opcionesTipoTasa = [
  { label: 'IBC consumo y ordinario', value: 'ibc_consumo_ordinario' as const },
]

const tipoTasa = ref<'ibc_consumo_ordinario'>('ibc_consumo_ordinario')
const vigenteDesde = ref('')
const vigenteHasta = ref('')
const valorEa = ref<number | null>(null)
const valorMensual = ref<number | null>(null)
const resolucionNumero = ref('')
const resolucionFecha = ref('')
const entidadFuente = ref('Superintendencia Financiera de Colombia')
const urlFuente = ref('')

const confirmando = ref(false)
const guardando = ref(false)
const error = ref<string | null>(null)
const exito = ref<string | null>(null)

const hoy = new Date().toISOString().slice(0, 10)

/** Fracción decimal → porcentaje legible. La tabla guarda 0.02, la gente lee 2%. */
function comoPorcentaje(valor: number | string | null): string {
  if (valor === null) return '—'
  return `${(Number(valor) * 100).toFixed(4)}%`
}

const tasaVigenteHoy = computed(() =>
  tasasStore.tasas.find(
    (t) =>
      t.tipo_tasa === tipoTasa.value &&
      t.vigente_desde <= hoy &&
      (t.vigente_hasta === null || t.vigente_hasta >= hoy),
  ),
)

// Equivalencia compuesta, SOLO como detector de errores de captura. No se
// autocompleta ni se impone: cuál es el método de conversión jurídicamente
// correcto es justo lo que pregunta CJ-1 y VER-CAR-01 sigue abierto, así que
// el valor mensual se captura de la resolución, no se deriva (ver el
// comentario de la columna en 20260822220000).
const equivalenciaCompuesta = computed<number | null>(() => {
  if (valorEa.value === null || valorEa.value <= 0) return null
  return Math.pow(1 + valorEa.value, 1 / 12) - 1
})

const posibleErrorDeCaptura = computed(() => {
  const equivalente = equivalenciaCompuesta.value
  if (equivalente === null || valorMensual.value === null || valorMensual.value <= 0) return false
  // Un factor de 2 en cualquier sentido no se explica por el método de
  // conversión; sí por un decimal corrido o por escribir un porcentaje.
  return valorMensual.value > equivalente * 2 || valorMensual.value < equivalente / 2
})

const solapaVigencia = computed(() => {
  if (!vigenteDesde.value || !vigenteHasta.value) return false
  return tasasStore.tasas.some(
    (t) =>
      t.tipo_tasa === tipoTasa.value &&
      t.vigente_desde <= vigenteHasta.value &&
      (t.vigente_hasta ?? '9999-12-31') >= vigenteDesde.value,
  )
})

const rangoInvalido = computed(
  () => Boolean(vigenteDesde.value && vigenteHasta.value) && vigenteHasta.value < vigenteDesde.value,
)

const completo = computed(
  () =>
    Boolean(vigenteDesde.value) &&
    Boolean(vigenteHasta.value) &&
    valorEa.value !== null &&
    valorEa.value > 0 &&
    valorMensual.value !== null &&
    valorMensual.value > 0 &&
    resolucionNumero.value.trim().length > 0 &&
    Boolean(resolucionFecha.value) &&
    entidadFuente.value.trim().length > 0,
)

const puedeRegistrar = computed(
  () => completo.value && !rangoInvalido.value && !solapaVigencia.value,
)

function limpiarFormulario(): void {
  vigenteDesde.value = ''
  vigenteHasta.value = ''
  valorEa.value = null
  valorMensual.value = null
  resolucionNumero.value = ''
  resolucionFecha.value = ''
  urlFuente.value = ''
}

async function registrar(): Promise<void> {
  error.value = null
  exito.value = null
  guardando.value = true
  try {
    await tasasStore.registrarTasa({
      tipoTasa: tipoTasa.value,
      vigenteDesde: vigenteDesde.value,
      vigenteHasta: vigenteHasta.value,
      valorEa: valorEa.value as number,
      valorMensual: valorMensual.value as number,
      resolucionNumero: resolucionNumero.value.trim(),
      resolucionFecha: resolucionFecha.value,
      entidadFuente: entidadFuente.value.trim(),
      urlFuente: urlFuente.value.trim() || undefined,
    })
    exito.value = `Resolución ${resolucionNumero.value.trim()} registrada.`
    limpiarFormulario()
    confirmando.value = false
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar la tasa de referencia.')
    confirmando.value = false
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <UiTituloDescripcion>
      <template #titulo>
        <h1 class="text-xl font-semibold">Tasas de referencia certificadas</h1>
      </template>
      <template #descripcion>
        Interés bancario corriente que certifica la Superintendencia Financiera. Es el valor contra
        el que se valida el tope de mora de todas las copropiedades (art. 30 Ley 675 de 2001), así
        que es global y no pertenece a ninguna.
      </template>
    </UiTituloDescripcion>

    <UAlert
      v-if="!tasaVigenteHoy"
      color="warning"
      variant="soft"
      title="No hay tasa vigente hoy"
      description="Ninguna copropiedad puede activar una política que cobre interés de mora mientras falte la resolución vigente."
    />
    <UAlert
      v-else
      color="neutral"
      variant="soft"
      :title="`Vigente hoy: ${comoPorcentaje(tasaVigenteHoy.valor_mensual)} mensual`"
      :description="`Resolución ${tasaVigenteHoy.resolucion_numero} · ${tasaVigenteHoy.entidad_fuente} · hasta ${tasaVigenteHoy.vigente_hasta ?? 'sin cierre'}`"
    />

    <div class="border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4">
      <UiTituloDescripcion clase-descripcion="text-xs text-neutral-500 mt-1 max-w-3xl">
        <template #titulo>
          <h2 class="text-sm font-semibold">Registrar una resolución</h2>
        </template>
        <template #descripcion>
          El registro es definitivo: la tabla no admite editar ni borrar, y una vigencia ocupada no
          se puede volver a usar. Revisa los valores antes de confirmar.
        </template>
      </UiTituloDescripcion>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UFormField label="Tipo de tasa" name="tipo_tasa">
          <USelect v-model="tipoTasa" :items="opcionesTipoTasa" value-key="value" class="w-full" />
        </UFormField>
        <UFormField
          label="Número de resolución"
          name="resolucion_numero"
          help="Tal como aparece en el acto administrativo."
        >
          <UInput v-model="resolucionNumero" class="w-full" />
        </UFormField>
        <UFormField label="Vigente desde" name="vigente_desde">
          <UInput v-model="vigenteDesde" type="date" class="w-full" />
        </UFormField>
        <UFormField
          label="Vigente hasta"
          name="vigente_hasta"
          help="Obligatoria: una tasa sin cierre ocupa todo el futuro y, al ser la tabla append-only, impediría registrar la siguiente."
        >
          <UInput v-model="vigenteHasta" type="date" class="w-full" />
        </UFormField>
        <UFormField
          label="Valor efectivo anual"
          name="valor_ea"
          help="Fracción decimal, no porcentaje: 0.2412 = 24.12% E.A."
        >
          <UInput v-model.number="valorEa" type="number" step="0.000001" class="w-full" />
        </UFormField>
        <UFormField
          label="Valor mensual"
          name="valor_mensual"
          help="Fracción decimal: 0.0181 = 1.81% mensual. Se captura de la fuente, no se deriva del anual."
        >
          <UInput v-model.number="valorMensual" type="number" step="0.000001" class="w-full" />
        </UFormField>
        <UFormField label="Fecha de la resolución" name="resolucion_fecha">
          <UInput v-model="resolucionFecha" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Entidad que certifica" name="entidad_fuente">
          <UInput v-model="entidadFuente" class="w-full" />
        </UFormField>
        <UFormField
          label="URL de la fuente"
          name="url_fuente"
          help="Opcional, pero es lo que hace auditable el registro."
          class="md:col-span-2"
        >
          <UInput v-model="urlFuente" type="url" class="w-full" />
        </UFormField>
      </div>

      <p v-if="equivalenciaCompuesta !== null" class="text-xs text-neutral-500">
        Referencia de captura: la equivalencia compuesta del anual declarado sería
        <span class="font-semibold tabular-nums">{{ comoPorcentaje(equivalenciaCompuesta) }}</span>
        mensual. No se autocompleta a propósito — cuál es el método de conversión aplicable es
        justamente lo que está en consulta jurídica (VER-CAR-01).
      </p>

      <UAlert
        v-if="rangoInvalido"
        color="error"
        variant="soft"
        title="La fecha de cierre es anterior al inicio"
      />
      <UAlert
        v-else-if="solapaVigencia"
        color="error"
        variant="soft"
        title="Ya hay una tasa registrada en ese rango"
        description="Las vigencias no se pueden solapar para un mismo tipo de tasa, y la existente no se puede modificar."
      />
      <UAlert
        v-else-if="posibleErrorDeCaptura"
        color="warning"
        variant="soft"
        title="El valor mensual se aleja mucho del anual declarado"
        description="Difieren más del doble, lo que no se explica por el método de conversión. Verifica que no sea un decimal corrido o un porcentaje escrito como fracción."
      />

      <UAlert v-if="error" color="error" variant="soft" :title="error" />
      <UAlert v-if="exito" color="success" variant="soft" :title="exito" />

      <div v-if="!confirmando" class="flex justify-end">
        <UButton :disabled="!puedeRegistrar" @click="confirmando = true">
          Registrar resolución
        </UButton>
      </div>
      <div v-else class="flex items-center justify-end gap-3">
        <span class="text-xs text-neutral-500">
          Se registrará {{ comoPorcentaje(valorMensual) }} mensual desde {{ vigenteDesde }} hasta
          {{ vigenteHasta }}. No se podrá corregir.
        </span>
        <UButton variant="ghost" :disabled="guardando" @click="confirmando = false">
          Cancelar
        </UButton>
        <UButton color="primary" :loading="guardando" @click="registrar">Confirmar</UButton>
      </div>
    </div>

    <div>
      <h2 class="text-sm font-semibold mb-3">Resoluciones registradas</h2>
      <p v-if="tasasStore.tasas.length === 0" class="text-sm text-neutral-500">
        Ninguna todavía.
      </p>
      <UiTabla
        v-else
        :columnas="[
          { clave: 'vigencia', etiqueta: 'Vigencia' },
          { clave: 'mensual', etiqueta: 'Mensual' },
          { clave: 'anual', etiqueta: 'Efectivo anual' },
          { clave: 'resolucion', etiqueta: 'Resolución' },
          { clave: 'entidad', etiqueta: 'Entidad' },
        ]"
        :filas="tasasStore.tasas"
        :clave-fila="(tasa) => tasa.id"
      >
        <template #celda-vigencia="{ fila }">
          <span class="whitespace-nowrap">
            {{ fila.vigente_desde }} → {{ fila.vigente_hasta ?? 'sin cierre' }}
          </span>
        </template>
        <template #celda-mensual="{ fila }">
          <span class="tabular-nums">{{ comoPorcentaje(fila.valor_mensual) }}</span>
        </template>
        <template #celda-anual="{ fila }">
          <span class="tabular-nums text-neutral-500">{{ comoPorcentaje(fila.valor_ea) }}</span>
        </template>
        <template #celda-resolucion="{ fila }">{{ fila.resolucion_numero }}</template>
        <template #celda-entidad="{ fila }">
          <span class="text-neutral-500">{{ fila.entidad_fuente }}</span>
        </template>
      </UiTabla>
    </div>
  </div>
</template>
