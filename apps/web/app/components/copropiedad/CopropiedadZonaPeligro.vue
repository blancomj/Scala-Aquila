<script setup lang="ts">
// Zona de peligro — resetear una copropiedad a su estado recién creada
// (D-39). Solo administrador (has_role en la RPC decide, esto es defensa en
// profundidad en la UI). Confirmación escribiendo el nombre exacto: mismo
// criterio que un borrado irreversible, sin componente compartido porque es
// el primer "danger zone" del proyecto — no hay otro caso que justifique
// extraerlo todavía.
//
// El resumen se agrupa por dominio y oculta lo que borró 0 filas: la RPC
// devuelve las 58 tablas siempre, y quien usa esta pantalla administra una
// copropiedad, no la base de datos — "posiciones_cartera_snapshot: 1188" no
// le dice nada. El detalle técnico queda en el desplegable, para cuando sí
// haga falta.
const tenantStore = useTenantStore()
const copropiedadStore = useCopropiedadStore()

/** Dominio → tablas de fn_resetear_copropiedad que agrega. Cubre las 58; una
 *  tabla nueva en la RPC que nadie sume aquí cae en "Otros" (nunca se pierde
 *  del total) — el trinquete de tests/governance la obliga a clasificarse. */
const GRUPOS: ReadonlyArray<{ etiqueta: string; tablas: readonly string[] }> = [
  {
    etiqueta: 'Inmuebles y terceros',
    tablas: [
      'inmuebles', 'terceros', 'tenant_tercero_rol', 'inmueble_persona_rol',
      'inmueble_transferencias', 'terceros_contacto_procedencia', 'coeficientes',
      'coeficiente_sets',
    ],
  },
  {
    etiqueta: 'Presupuesto y liquidación',
    tablas: [
      'presupuestos', 'presupuesto_rubros', 'presupuesto_ejecucion', 'periodos',
      'liquidaciones', 'liquidacion_lineas',
    ],
  },
  {
    etiqueta: 'Cargos y pagos',
    tablas: ['cargos', 'pagos', 'pago_aplicaciones', 'intenciones_pago', 'estados_cuenta_generados'],
  },
  {
    etiqueta: 'Cartera y cobranza',
    tablas: [
      'cartera_corridas_diarias', 'cartera_etapas', 'posiciones_cartera_snapshot',
      'eventos_cartera', 'acciones_cobranza', 'acciones_cobranza_acuses',
      'acciones_cobranza_envios', 'promesas_pago', 'acuerdos_pago', 'acuerdo_pago_cuotas',
      'certificaciones_deuda',
    ],
  },
  {
    etiqueta: 'Jurídico',
    tablas: [
      'casos_juridicos', 'caso_juridico_actuaciones', 'costas_judiciales',
      'prescripcion_actos_interruptivos',
    ],
  },
  {
    etiqueta: 'Conciliación bancaria',
    tablas: ['extracto_bancario', 'extracto_linea', 'conciliacion_propuesta'],
  },
  { etiqueta: 'Novedades', tablas: ['novedades', 'novedad_cuotas'] },
  { etiqueta: 'Fondos', tablas: ['fondo_movimientos'] },
  {
    etiqueta: 'Auditoría',
    tablas: [
      'auditoria_engagements', 'auditoria_planes', 'auditoria_plan_items',
      'auditoria_procedimientos', 'auditoria_muestras', 'auditoria_evidencias',
      'auditoria_hallazgos', 'auditoria_ejecuciones', 'auditoria_acciones',
      'auditoria_controles', 'auditoria_riesgos', 'auditoria_riesgo_residual_historial',
      'auditoria_normativa',
    ],
  },
  { etiqueta: 'Documentos', tablas: ['documentos', 'documentos_legal_holds'] },
  {
    etiqueta: 'Fórmulas y normativa',
    tablas: ['concepto_test_cases', 'fundamento_normativo', 'fundamento_propuesta'],
  },
]

const modalAbierto = ref(false)
const confirmacionTexto = ref('')
const reseteando = ref(false)
const error = ref<string | null>(null)
const resumen = ref<Record<string, number> | null>(null)

const esAdministrador = computed(() => tenantStore.role === 'administrador')
const nombreTenant = computed(() => copropiedadStore.tenant?.name ?? '')
const confirmacionValida = computed(
  () => confirmacionTexto.value.trim() === nombreTenant.value && nombreTenant.value !== '',
)

function formatoNumero(valor: number): string {
  return new Intl.NumberFormat('es-CO').format(valor)
}

const totalBorrado = computed(() =>
  Object.values(resumen.value ?? {}).reduce((suma, cantidad) => suma + cantidad, 0),
)

const gruposConDatos = computed(() => {
  const datos = resumen.value
  if (!datos) return []

  const reclamadas = new Set<string>()
  const filas = GRUPOS.map((grupo) => ({
    etiqueta: grupo.etiqueta,
    total: grupo.tablas.reduce((suma, tabla) => {
      if (tabla in datos) reclamadas.add(tabla)
      return suma + (datos[tabla] ?? 0)
    }, 0),
  }))

  const otros = Object.entries(datos)
    .filter(([tabla]) => !reclamadas.has(tabla))
    .reduce((suma, [, cantidad]) => suma + cantidad, 0)
  if (otros > 0) filas.push({ etiqueta: 'Otros', total: otros })

  return filas.filter((fila) => fila.total > 0)
})

/** Detalle técnico: solo lo que borró algo, de mayor a menor. */
const detalleConDatos = computed(() =>
  Object.entries(resumen.value ?? {})
    .filter(([, cantidad]) => cantidad > 0)
    .sort(([, a], [, b]) => b - a),
)

function abrirModal(): void {
  confirmacionTexto.value = ''
  error.value = null
  resumen.value = null
  modalAbierto.value = true
}

async function confirmarReset(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !confirmacionValida.value) return

  error.value = null
  reseteando.value = true
  try {
    const cliente = useSupabaseClient()
    const { data, error: errorFn } = await cliente.functions.invoke<{
      borrados: Record<string, number>
    }>('resetear-copropiedad', { body: { tenant_id: tenantId } })
    if (errorFn) throw await extraerErrorFuncion(errorFn)
    resumen.value = data?.borrados ?? {}
    confirmacionTexto.value = ''
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo resetear la copropiedad.')
  } finally {
    reseteando.value = false
  }
}
</script>

<template>
  <div v-if="esAdministrador" class="mt-10 border border-error-200 dark:border-error-800 rounded-md p-4">
    <h3 class="text-sm font-semibold text-error-600 dark:text-error-400">Zona de peligro</h3>
    <p class="text-sm text-neutral-500 mt-1 max-w-2xl">
      Borra todos los datos operativos de esta copropiedad (inmuebles, terceros, cargos, pagos,
      liquidaciones, cartera, auditoría y documentos) y la deja como recién creada. La
      configuración ya hecha — conceptos, cuentas contables, presupuesto, plantillas, pasarela,
      políticas, agrupaciones, zonas comunes — y los usuarios de la copropiedad no se tocan. No
      se puede deshacer.
    </p>
    <UButton color="error" variant="soft" class="mt-3" @click="abrirModal">
      Resetear copropiedad
    </UButton>

    <UModal v-model:open="modalAbierto" title="Resetear copropiedad">
      <template #body>
        <div v-if="resumen" class="space-y-4 text-sm">
          <UAlert
            color="success"
            variant="soft"
            :title="
              totalBorrado > 0
                ? `Copropiedad reseteada — ${formatoNumero(totalBorrado)} registros borrados.`
                : 'Copropiedad reseteada — no había datos operativos que borrar.'
            "
          />
          <ul v-if="gruposConDatos.length > 0" class="divide-y divide-default">
            <li
              v-for="grupo in gruposConDatos"
              :key="grupo.etiqueta"
              class="flex items-center justify-between gap-3 py-1.5"
            >
              <span>{{ grupo.etiqueta }}</span>
              <span class="font-medium tabular-nums">{{ formatoNumero(grupo.total) }}</span>
            </li>
          </ul>
          <details v-if="detalleConDatos.length > 0" class="text-xs">
            <summary class="cursor-pointer text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
              Ver detalle por tabla
            </summary>
            <ul class="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 max-h-56 overflow-y-auto">
              <li
                v-for="[tabla, cantidad] in detalleConDatos"
                :key="tabla"
                class="flex justify-between gap-2"
              >
                <span class="text-neutral-500 truncate">{{ tabla }}</span>
                <span class="font-medium tabular-nums">{{ formatoNumero(cantidad) }}</span>
              </li>
            </ul>
          </details>
        </div>
        <div v-else class="space-y-3 text-sm">
          <p>
            Esto borra permanentemente los datos operativos de
            <strong>{{ nombreTenant }}</strong> — no hay forma de deshacerlo. La configuración y
            los usuarios se conservan.
          </p>
          <UFormField :label="`Escribe «${nombreTenant}» para confirmar`" name="confirmacion">
            <UInput v-model="confirmacionTexto" :disabled="reseteando" class="w-full" />
          </UFormField>
          <UAlert v-if="error" color="error" variant="soft" :title="error" />
        </div>
      </template>
      <template #footer>
        <UButton v-if="resumen" @click="modalAbierto = false">Cerrar</UButton>
        <template v-else>
          <UButton variant="ghost" :disabled="reseteando" @click="modalAbierto = false">Cancelar</UButton>
          <UButton
            color="error"
            :loading="reseteando"
            :disabled="!confirmacionValida"
            @click="confirmarReset"
          >
            Resetear
          </UButton>
        </template>
      </template>
    </UModal>
  </div>
</template>
