<script setup lang="ts">
// MANT-4 §3.3/§3.4: ficha de OT — la máquina de estados vive en guard_mant_ot, cerrar SIEMPRE
// pasa por fn_mant_cerrar_ot (nunca un UPDATE directo a 'cerrada'). Misma página en móvil y
// escritorio (diseño confirmado con el usuario): checklist de tareas, medición con unidad, foto
// por tarea — sin ruta separada ni soporte offline.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const route = useRoute()
const otId = route.params.id as string

const tenantStore = useTenantStore()
const ordenesStore = useMantenimientoOrdenesTrabajoStore()
const tercerosStore = useTercerosStore()
const membersStore = useMembersStore()
const documentosStore = useDocumentosStore()
const authStore = useAuthStore()
const inventarioStore = useMantenimientoInventarioStore()
const comprobantesStore = useComprobantesStore()

const tiposMantenimiento = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const tiposEvidencia = ref<Awaited<ReturnType<typeof cargarListaTipos>>>([])
const terceros = ref<Awaited<ReturnType<typeof tercerosStore.cargarTerceros>>>([])
const definicionesAtributo = ref<Database['public']['Tables']['mant_atributo_definicion']['Row'][]>(
  [],
)

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await Promise.all([
    ordenesStore.cargarOt(tenantId, otId),
    membersStore.cargarMiembros(tenantId),
    tiposMantenimiento.value.length === 0
      ? cargarListaTipos(tenantId, 'TIPO_MANTENIMIENTO').then((d) => {
          tiposMantenimiento.value = d
        })
      : Promise.resolve(),
    tiposEvidencia.value.length === 0
      ? cargarListaTipos(tenantId, 'EVIDENCIA_OT_TIPO').then((d) => {
          tiposEvidencia.value = d
        })
      : Promise.resolve(),
    terceros.value.length === 0
      ? tercerosStore.cargarTerceros(tenantId).then((t) => {
          terceros.value = t
        })
      : Promise.resolve(),
  ])
  await Promise.all([
    inventarioStore.cargarCatalogos(tenantId),
    inventarioStore.cargarMovimientos(tenantId, { otId }),
    comprobantesStore.periodos.length === 0 ? comprobantesStore.cargarPeriodos(tenantId) : Promise.resolve(),
  ])
  const activoId = ordenesStore.otActual?.activo_id
  if (activoId) {
    const cliente = useSupabaseClient<Database>()
    const { data: activo } = await cliente
      .from('activos')
      .select('tipo_id')
      .eq('id', activoId)
      .single()
    if (activo) {
      const { data: defs } = await cliente
        .from('mant_atributo_definicion')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('tipo_activo_id', activo.tipo_id)
        .eq('tipo_dato', 'numero')
        .order('orden')
      definicionesAtributo.value = defs ?? []
    }
  } else {
    definicionesAtributo.value = []
  }
}
onMounted(cargar)
onBeforeUnmount(() => ordenesStore.limpiarActual())

const ot = computed(() => ordenesStore.otActual)
const nombreTipo = computed(() => new Map(tiposMantenimiento.value.map((t) => [t.id, t.nombre])))
const nombreDefinicion = computed(() => new Map(definicionesAtributo.value.map((d) => [d.id, d])))

const ESTADO_COLOR: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'primary'> = {
  borrador: 'neutral',
  programada: 'neutral',
  asignada: 'primary',
  en_ejecucion: 'primary',
  ejecutada: 'warning',
  pendiente_aprobacion: 'warning',
  cerrada: 'success',
  cancelada: 'error',
}

const errorAccion = ref<string | null>(null)

type OtEstado = Database['public']['Enums']['ot_estado_t']
async function transicionar(nuevoEstado: OtEstado): Promise<void> {
  if (!ot.value) return
  errorAccion.value = null
  try {
    await ordenesStore.actualizarOt(ot.value.id, { estado: nuevoEstado })
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo cambiar el estado.')
  }
}

// ── Cancelar (exige motivo) ──
const drawerCancelar = ref(false)
const motivoCancelar = ref('')
function abrirCancelar(): void {
  motivoCancelar.value = ''
  drawerCancelar.value = true
}
async function cancelar(): Promise<void> {
  if (!ot.value || !motivoCancelar.value.trim()) return
  errorAccion.value = null
  try {
    await ordenesStore.actualizarOt(ot.value.id, {
      estado: 'cancelada',
      cancelada_motivo: motivoCancelar.value.trim(),
    })
    drawerCancelar.value = false
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo cancelar la OT.')
  }
}

// ── Cerrar ──
const drawerCerrar = ref(false)
const cierre = reactive({
  fechaCierre: new Date().toISOString().slice(0, 10),
  evidenciaReferencia: '',
  aprobadaPor: undefined as string | undefined,
})
function abrirCerrar(): void {
  cierre.fechaCierre = new Date().toISOString().slice(0, 10)
  cierre.evidenciaReferencia = ''
  cierre.aprobadaPor = ot.value?.aprobada_por ?? authStore.profile?.id ?? undefined
  errorAccion.value = null
  drawerCerrar.value = true
}
async function cerrar(): Promise<void> {
  if (!ot.value) return
  errorAccion.value = null
  try {
    await ordenesStore.cerrarOt(ot.value.id, {
      fechaCierre: cierre.fechaCierre,
      evidenciaReferencia: cierre.evidenciaReferencia.trim() || undefined,
      aprobadaPor: cierre.aprobadaPor,
    })
    drawerCerrar.value = false
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo cerrar la OT.')
  }
}

// ── Asignación / datos administrativos ──
const asignacion = reactive({
  asignadoTerceroId: undefined as string | undefined,
  asignadoUsuarioId: undefined as string | undefined,
  acreditacionReferencia: '',
  costoEstimado: null as number | null,
})
watch(
  ot,
  (nueva) => {
    if (!nueva) return
    asignacion.asignadoTerceroId = nueva.asignado_tercero_id ?? undefined
    asignacion.asignadoUsuarioId = nueva.asignado_usuario_id ?? undefined
    asignacion.acreditacionReferencia = nueva.acreditacion_referencia ?? ''
    asignacion.costoEstimado = nueva.costo_estimado
  },
  { immediate: true },
)
async function guardarAsignacion(): Promise<void> {
  if (!ot.value) return
  errorAccion.value = null
  try {
    await ordenesStore.actualizarOt(ot.value.id, {
      asignado_tercero_id: asignacion.asignadoTerceroId ?? null,
      asignado_usuario_id: asignacion.asignadoUsuarioId ?? null,
      acreditacion_referencia: asignacion.acreditacionReferencia.trim() || null,
      costo_estimado: asignacion.costoEstimado,
    })
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo guardar la asignación.')
  }
}

// ── Tareas (checklist) ──
const motivoNoAplicaPorTarea = reactive<Record<string, string>>({})
async function marcarTareaEjecutada(tareaId: string): Promise<void> {
  if (!ot.value) return
  errorAccion.value = null
  try {
    await ordenesStore.actualizarTarea(tareaId, ot.value.id, {
      estado: 'ejecutada',
      ejecutada_at: new Date().toISOString(),
    })
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo marcar la tarea.')
  }
}
async function marcarTareaNoAplica(tareaId: string): Promise<void> {
  if (!ot.value) return
  const motivo = motivoNoAplicaPorTarea[tareaId]?.trim()
  if (!motivo) return
  errorAccion.value = null
  try {
    await ordenesStore.actualizarTarea(tareaId, ot.value.id, {
      estado: 'no_aplica',
      no_aplica_motivo: motivo,
    })
    motivoNoAplicaPorTarea[tareaId] = ''
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo marcar la tarea como no aplica.')
  }
}

// ── MANT-6 §4.3: consumo de materiales — SIEMPRE vía fn_mant_registrar_consumo/devolucion
// (nunca un INSERT directo), y el costo real SIEMPRE junto al estimado, nunca en su lugar. ──
const formConsumo = reactive({
  repuestoId: null as string | null,
  almacenId: undefined as string | undefined,
  cantidad: null as number | null,
  costoUnitario: null as number | null,
  periodoId: undefined as string | undefined,
})
// MANT-6 Fase 1 (D-127): solo un repuesto con politica_contable = 'inventario' necesita periodo
// (y costo) para que fn_mant_registrar_consumo genere el comprobante — 'gasto_directo' (default)
// se registra igual que antes, sin ningún campo contable adicional.
const repuestoConsumoSeleccionado = computed(() =>
  inventarioStore.repuestos.find((r) => r.id === formConsumo.repuestoId) ?? null,
)
const consumoRequiereContabilizacion = computed(
  () => repuestoConsumoSeleccionado.value?.politica_contable === 'inventario',
)
const periodosAbiertosConsumo = computed(() =>
  comprobantesStore.periodos
    .filter((p) => p.contable_estado === 'abierto')
    .map((p) => ({ label: `${MESES_CONSUMO[p.mes - 1]} ${String(p.anio)}`, value: p.id })),
)
const MESES_CONSUMO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
watch(consumoRequiereContabilizacion, (requiere) => {
  if (requiere && !formConsumo.periodoId) formConsumo.periodoId = periodosAbiertosConsumo.value[0]?.value
  if (!requiere) formConsumo.periodoId = undefined
})
async function registrarConsumo(): Promise<void> {
  if (!ot.value || !formConsumo.repuestoId || !formConsumo.almacenId || !formConsumo.cantidad)
    return
  if (consumoRequiereContabilizacion.value && (!formConsumo.costoUnitario || !formConsumo.periodoId))
    return
  errorAccion.value = null
  try {
    await inventarioStore.registrarConsumo({
      otId: ot.value.id,
      repuestoId: formConsumo.repuestoId,
      almacenId: formConsumo.almacenId,
      cantidad: formConsumo.cantidad,
      costoUnitario: formConsumo.costoUnitario ?? undefined,
      periodoId: formConsumo.periodoId,
    })
    formConsumo.cantidad = null
    formConsumo.costoUnitario = null
    formConsumo.periodoId = undefined
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo registrar el consumo.')
  }
}
// Fila del movimiento que se está devolviendo (id -> cantidad tecleada) — inline, sin diálogo
// nativo del navegador, mismo criterio de edición-en-línea que motivoNoAplicaPorTarea arriba.
const devolviendoId = ref<string | null>(null)
const cantidadDevolucion = ref<number | null>(null)
function alternarDevolucion(movimientoId: string): void {
  devolviendoId.value = devolviendoId.value === movimientoId ? null : movimientoId
  cantidadDevolucion.value = null
}
async function devolver(movimiento: {
  id: string
  repuesto_id: string
  almacen_id: string
}): Promise<void> {
  if (!ot.value || !cantidadDevolucion.value || cantidadDevolucion.value <= 0) return
  errorAccion.value = null
  try {
    await inventarioStore.registrarDevolucion({
      otId: ot.value.id,
      repuestoId: movimiento.repuesto_id,
      almacenId: movimiento.almacen_id,
      cantidad: cantidadDevolucion.value,
    })
    devolviendoId.value = null
    cantidadDevolucion.value = null
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo registrar la devolución.')
  }
}
const nombreRepuesto = computed(
  () => new Map(inventarioStore.repuestos.map((r) => [r.id, r.nombre])),
)
const costoRealMateriales = computed(
  () =>
    inventarioStore.movimientos
      .filter((m) => m.tipo === 'salida')
      .reduce((acc, m) => acc + m.cantidad * (m.costo_unitario ?? 0), 0) -
    inventarioStore.movimientos
      .filter((m) => m.tipo === 'entrada')
      .reduce((acc, m) => acc + m.cantidad * (m.costo_unitario ?? 0), 0),
)

const tareasQueMidenOEvidencian = computed(() =>
  ordenesStore.tareas.filter((t) => t.requiere_medicion || t.requiere_evidencia_foto),
)

const formTarea = reactive({
  descripcion: '',
  obligatoria: true,
  requiereMedicion: false,
  requiereEvidenciaFoto: false,
})
async function agregarTareaManual(): Promise<void> {
  if (!ot.value || !formTarea.descripcion.trim()) return
  errorAccion.value = null
  try {
    await ordenesStore.agregarTarea({
      tenant_id: ot.value.tenant_id,
      ot_id: ot.value.id,
      orden: ordenesStore.tareas.length + 1,
      descripcion: formTarea.descripcion.trim(),
      obligatoria: formTarea.obligatoria,
      requiere_medicion: formTarea.requiereMedicion,
      requiere_evidencia_foto: formTarea.requiereEvidenciaFoto,
    })
    formTarea.descripcion = ''
    formTarea.obligatoria = true
    formTarea.requiereMedicion = false
    formTarea.requiereEvidenciaFoto = false
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo agregar la tarea.')
  }
}

// ── Mediciones ──
const formMedicion = reactive({
  tareaId: undefined as string | undefined,
  atributoDefinicionId: undefined as string | undefined,
  valor: null as number | null,
  rangoMin: null as number | null,
  rangoMax: null as number | null,
})
async function agregarMedicion(): Promise<void> {
  if (!ot.value || !formMedicion.atributoDefinicionId || formMedicion.valor === null) return
  errorAccion.value = null
  try {
    await ordenesStore.agregarMedicion({
      tenant_id: ot.value.tenant_id,
      ot_id: ot.value.id,
      tarea_id: formMedicion.tareaId ?? null,
      atributo_definicion_id: formMedicion.atributoDefinicionId,
      valor: formMedicion.valor,
      rango_min: formMedicion.rangoMin,
      rango_max: formMedicion.rangoMax,
    })
    formMedicion.valor = null
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo registrar la medición.')
  }
}

// ── Evidencias ──
const archivoEvidencia = ref<File | null>(null)
const formEvidencia = reactive({
  tareaId: undefined as string | undefined,
  tipoEvidenciaId: undefined as number | undefined,
})
function elegirArchivo(evento: Event): void {
  archivoEvidencia.value = (evento.target as HTMLInputElement).files?.[0] ?? null
}
async function agregarEvidencia(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !ot.value || !archivoEvidencia.value) return
  errorAccion.value = null
  try {
    const tipos = await cargarListaTipos(tenantId, 'TIPO_DOCUMENTO')
    const tipoEvidenciaDocumento = tipos.find((t) => t.codigo === 'evidencia_ot')
    if (!tipoEvidenciaDocumento)
      throw new Error('No se encontró el tipo de documento "evidencia_ot".')
    const documento = await documentosStore.subirDocumento({
      tenantId,
      inmuebleId: null,
      tipoDocumentoId: tipoEvidenciaDocumento.id,
      archivo: archivoEvidencia.value,
    })
    if (!documento.id) throw new Error('El documento subido no devolvió id.')
    await ordenesStore.agregarEvidencia({
      tenant_id: tenantId,
      ot_id: ot.value.id,
      tarea_id: formEvidencia.tareaId ?? null,
      documento_id: documento.id,
      tipo_evidencia_id: formEvidencia.tipoEvidenciaId ?? null,
    })
    archivoEvidencia.value = null
  } catch (excepcion) {
    errorAccion.value = mensajeError(excepcion, 'No se pudo subir la evidencia.')
  }
}
</script>

<template>
  <div v-if="ot" class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <UButton
          variant="link"
          icon="i-lucide-arrow-left"
          to="/mantenimiento/ordenes-trabajo"
          class="px-0 mb-1"
        >
          Órdenes de trabajo
        </UButton>
        <h1 class="text-lg sm:text-xl font-semibold">
          {{ ot.anio }}-{{ ot.numero }} · {{ ot.titulo }}
        </h1>
        <p class="text-sm text-muted">
          {{ nombreTipo.get(ot.tipo_mantenimiento_id) ?? '—' }} · origen {{ ot.origen }}
        </p>
      </div>
      <UBadge
        :color="ESTADO_COLOR[ot.estado] ?? 'neutral'"
        variant="soft"
        size="lg"
        class="capitalize"
      >
        {{ ot.estado.replace('_', ' ') }}
      </UBadge>
    </div>

    <UAlert v-if="errorAccion" color="error" variant="soft" :title="errorAccion" />

    <NuxtLink
      v-if="ot.incidencia_id"
      :to="`/mantenimiento/incidencias/${ot.incidencia_id}`"
      class="text-sm text-primary underline"
    >
      Ver incidencia de origen
    </NuxtLink>
    <NuxtLink
      v-if="ot.inspeccion_id"
      to="/mantenimiento/inspecciones#hallazgos"
      class="text-sm text-primary underline"
    >
      Ver hallazgo de origen (MANT-7 — panel de hallazgos abiertos)
    </NuxtLink>

    <!-- Acciones de estado — arriba, para que quepan sin scroll en móvil -->
    <section class="rounded-lg border border-default p-4 flex flex-wrap gap-2">
      <UButton v-if="ot.estado === 'borrador'" @click="transicionar('programada')"
        >Programar</UButton
      >
      <UButton
        v-if="['borrador', 'programada'].includes(ot.estado)"
        @click="transicionar('asignada')"
        >Asignar</UButton
      >
      <UButton v-if="ot.estado === 'asignada'" @click="transicionar('en_ejecucion')"
        >Iniciar ejecución</UButton
      >
      <UButton
        v-if="ot.estado === 'en_ejecucion'"
        color="success"
        @click="transicionar('ejecutada')"
        >Marcar ejecutada</UButton
      >
      <UButton
        v-if="ot.estado === 'ejecutada' && ot.requiere_aprobacion"
        @click="transicionar('pendiente_aprobacion')"
      >
        Enviar a aprobación
      </UButton>
      <UButton
        v-if="['ejecutada', 'pendiente_aprobacion'].includes(ot.estado)"
        color="success"
        icon="i-lucide-check"
        @click="abrirCerrar()"
      >
        Cerrar OT
      </UButton>
      <UButton
        v-if="!['cerrada', 'cancelada'].includes(ot.estado)"
        variant="soft"
        color="error"
        @click="abrirCancelar()"
      >
        Cancelar
      </UButton>
      <p v-if="['cerrada', 'cancelada'].includes(ot.estado)" class="text-sm text-muted self-center">
        Estado terminal — sin más acciones.
      </p>
    </section>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-6">
        <!-- Tareas -->
        <section class="rounded-lg border border-default p-4 space-y-3">
          <h2 class="font-medium">Tareas</h2>
          <div class="divide-y divide-default">
            <div v-for="t in ordenesStore.tareas" :key="t.id" class="py-3 space-y-2">
              <div class="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p class="text-sm font-medium">{{ t.descripcion }}</p>
                  <p class="text-xs text-muted">
                    <span v-if="t.obligatoria">Obligatoria</span><span v-else>Opcional</span>
                    <span v-if="t.requiere_medicion"> · requiere medición</span>
                    <span v-if="t.requiere_evidencia_foto"> · requiere foto</span>
                  </p>
                </div>
                <UBadge
                  variant="soft"
                  size="sm"
                  :color="
                    t.estado === 'ejecutada'
                      ? 'success'
                      : t.estado === 'no_aplica'
                        ? 'neutral'
                        : 'warning'
                  "
                >
                  {{ t.estado.replace('_', ' ') }}
                </UBadge>
              </div>
              <div
                v-if="t.estado === 'pendiente' && ot.estado !== 'cerrada'"
                class="flex items-center gap-2 flex-wrap"
              >
                <UButton size="sm" @click="marcarTareaEjecutada(t.id)">Marcar ejecutada</UButton>
                <UInput
                  v-model="motivoNoAplicaPorTarea[t.id]"
                  size="sm"
                  placeholder="Motivo de no aplica"
                  class="w-48"
                />
                <UButton
                  size="sm"
                  variant="soft"
                  :disabled="!motivoNoAplicaPorTarea[t.id]?.trim()"
                  @click="marcarTareaNoAplica(t.id)"
                >
                  No aplica
                </UButton>
              </div>
            </div>
            <p v-if="ordenesStore.tareas.length === 0" class="py-4 text-sm text-muted text-center">
              Sin tareas.
            </p>
          </div>
          <div
            v-if="ot.estado !== 'cerrada'"
            class="flex flex-wrap items-end gap-2 pt-2 border-t border-default"
          >
            <UInput
              v-model="formTarea.descripcion"
              placeholder="Nueva tarea…"
              class="flex-1 min-w-40"
            />
            <label class="flex items-center gap-1 text-xs text-muted"
              ><UCheckbox v-model="formTarea.obligatoria" />Obligatoria</label
            >
            <label class="flex items-center gap-1 text-xs text-muted"
              ><UCheckbox v-model="formTarea.requiereMedicion" />Medición</label
            >
            <label class="flex items-center gap-1 text-xs text-muted"
              ><UCheckbox v-model="formTarea.requiereEvidenciaFoto" />Foto</label
            >
            <UButton
              size="sm"
              :loading="ordenesStore.guardando"
              :disabled="!formTarea.descripcion.trim()"
              @click="agregarTareaManual()"
            >
              Agregar tarea
            </UButton>
          </div>
        </section>

        <!-- Mediciones -->
        <section
          v-if="definicionesAtributo.length > 0 || ordenesStore.mediciones.length > 0"
          class="rounded-lg border border-default p-4 space-y-3"
        >
          <h2 class="font-medium">Mediciones</h2>
          <div class="divide-y divide-default">
            <div
              v-for="m in ordenesStore.mediciones"
              :key="m.id"
              class="py-2 text-sm flex items-center justify-between gap-3"
            >
              <span
                >{{ nombreDefinicion.get(m.atributo_definicion_id)?.nombre ?? '—' }}:
                {{ m.valor }}</span
              >
              <UBadge v-if="m.fuera_de_rango" color="error" variant="soft" size="sm"
                >Fuera de rango</UBadge
              >
            </div>
            <p v-if="ordenesStore.mediciones.length === 0" class="py-2 text-sm text-muted">
              Sin mediciones registradas.
            </p>
          </div>
          <div
            v-if="definicionesAtributo.length > 0 && ot.estado !== 'cerrada'"
            class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-default"
          >
            <USelect
              v-model="formMedicion.tareaId"
              class="w-full"
              :items="[
                { label: 'General', value: undefined },
                ...tareasQueMidenOEvidencian
                  .filter((t) => t.requiere_medicion)
                  .map((t) => ({ label: t.descripcion, value: t.id })),
              ]"
            />
            <USelect
              v-model="formMedicion.atributoDefinicionId"
              class="w-full"
              :items="definicionesAtributo.map((d) => ({ label: d.nombre, value: d.id }))"
            />
            <UInput v-model.number="formMedicion.valor" type="number" placeholder="Valor" />
            <div class="flex gap-1">
              <UInput v-model.number="formMedicion.rangoMin" type="number" placeholder="Mín" />
              <UInput v-model.number="formMedicion.rangoMax" type="number" placeholder="Máx" />
            </div>
            <UButton
              class="col-span-full"
              :loading="ordenesStore.guardando"
              :disabled="!formMedicion.atributoDefinicionId || formMedicion.valor === null"
              @click="agregarMedicion()"
            >
              Registrar medición
            </UButton>
          </div>
        </section>

        <!-- Evidencias -->
        <section class="rounded-lg border border-default p-4 space-y-3">
          <h2 class="font-medium">Evidencias</h2>
          <div class="divide-y divide-default">
            <div v-for="e in ordenesStore.evidencias" :key="e.id" class="py-2 text-sm">
              {{
                tiposEvidencia.find((t) => t.id === e.tipo_evidencia_id)?.nombre ??
                'Documento adjunto'
              }}
            </div>
            <p v-if="ordenesStore.evidencias.length === 0" class="py-2 text-sm text-muted">
              Sin evidencias adjuntas.
            </p>
          </div>
          <div
            v-if="ot.estado !== 'cerrada'"
            class="flex flex-wrap items-center gap-2 pt-2 border-t border-default"
          >
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              class="text-sm"
              @change="elegirArchivo"
            >
            <USelect
              v-model="formEvidencia.tareaId"
              :items="[
                { label: 'General', value: undefined },
                ...tareasQueMidenOEvidencian
                  .filter((t) => t.requiere_evidencia_foto)
                  .map((t) => ({ label: t.descripcion, value: t.id })),
              ]"
              class="w-40"
            />
            <USelect
              v-model="formEvidencia.tipoEvidenciaId"
              :items="tiposEvidencia.map((t) => ({ label: t.nombre, value: t.id }))"
              class="w-40"
            />
            <UButton
              size="sm"
              :loading="documentosStore.subiendo"
              :disabled="!archivoEvidencia"
              @click="agregarEvidencia()"
            >
              Subir
            </UButton>
          </div>
        </section>

        <!-- MANT-6 §4.3/§4.4: consumo de materiales — costo real siempre junto al estimado -->
        <section class="rounded-lg border border-default p-4 space-y-3">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <h2 class="font-medium">Materiales</h2>
            <p class="text-sm text-muted">
              Estimado:
              <span class="tabular-nums">{{ formatoMoneda(ot.costo_estimado ?? 0) }}</span> · Real:
              <span class="tabular-nums font-medium text-highlighted">{{
                formatoMoneda(costoRealMateriales)
              }}</span>
            </p>
          </div>
          <div class="divide-y divide-default">
            <div
              v-for="m in inventarioStore.movimientos"
              :key="m.id"
              class="py-2 text-sm space-y-2"
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <span class="font-medium">{{ nombreRepuesto.get(m.repuesto_id) ?? '—' }}</span>
                  <span class="text-muted">
                    · {{ m.tipo === 'salida' ? 'consumo' : 'devolución' }} · {{ m.cantidad }}</span
                  >
                  <span v-if="m.costo_unitario" class="text-muted tabular-nums">
                    · {{ formatoMoneda(m.costo_unitario) }} c/u</span
                  >
                </div>
                <UButton
                  v-if="m.tipo === 'salida' && ot.estado !== 'cerrada'"
                  size="xs"
                  variant="ghost"
                  @click="alternarDevolucion(m.id)"
                >
                  Devolver
                </UButton>
              </div>
              <div v-if="devolviendoId === m.id" class="flex items-center gap-2">
                <UInput
                  v-model.number="cantidadDevolucion"
                  type="number"
                  min="0"
                  size="sm"
                  placeholder="Cantidad a devolver"
                  class="w-40"
                />
                <UButton
                  size="xs"
                  :loading="inventarioStore.guardando"
                  :disabled="!cantidadDevolucion"
                  @click="devolver(m)"
                >
                  Confirmar
                </UButton>
              </div>
            </div>
            <p v-if="inventarioStore.movimientos.length === 0" class="py-2 text-sm text-muted">
              Sin materiales registrados.
            </p>
          </div>
          <div
            v-if="ot.estado !== 'cerrada'"
            class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-default"
          >
            <UiSelectorBuscable
              v-model="formConsumo.repuestoId"
              :opciones="
                inventarioStore.repuestos.map((r) => ({ valor: r.id, etiqueta: r.nombre }))
              "
              placeholder="Repuesto"
            />
            <USelect
              v-model="formConsumo.almacenId"
              class="w-full"
              placeholder="Almacén"
              :items="inventarioStore.almacenes.map((a) => ({ label: a.nombre, value: a.id }))"
            />
            <UInput
              v-model.number="formConsumo.cantidad"
              type="number"
              min="0"
              placeholder="Cantidad"
            />
            <UInput
              v-model.number="formConsumo.costoUnitario"
              type="number"
              min="0"
              :placeholder="consumoRequiereContabilizacion ? 'Costo unitario (requerido)' : 'Costo unitario'"
            />
            <USelect
              v-if="consumoRequiereContabilizacion"
              v-model="formConsumo.periodoId"
              class="w-full"
              placeholder="Período contable"
              :items="periodosAbiertosConsumo"
            />
            <p v-if="consumoRequiereContabilizacion" class="col-span-full text-xs text-muted">
              Este repuesto tiene política contable "inventario": el consumo genera un comprobante
              (débito gasto / crédito existencias) — costo unitario y período son obligatorios.
            </p>
            <UButton
              class="col-span-full"
              size="sm"
              :loading="inventarioStore.guardando"
              :disabled="
                !formConsumo.repuestoId ||
                !formConsumo.almacenId ||
                !formConsumo.cantidad ||
                (consumoRequiereContabilizacion && (!formConsumo.costoUnitario || !formConsumo.periodoId))
              "
              @click="registrarConsumo()"
            >
              Registrar consumo
            </UButton>
          </div>
        </section>

        <!-- Historial -->
        <section class="rounded-lg border border-default p-4 space-y-2">
          <h2 class="font-medium">Historial</h2>
          <div class="divide-y divide-default">
            <div v-for="h in ordenesStore.historial" :key="h.id" class="py-2 text-sm">
              <p class="text-xs text-muted">{{ new Date(h.created_at).toLocaleString() }}</p>
              <p>
                {{ h.estado_anterior ?? '—' }} → {{ h.estado_nuevo
                }}<span v-if="h.motivo"> · {{ h.motivo }}</span>
              </p>
            </div>
            <p
              v-if="ordenesStore.historial.length === 0"
              class="py-4 text-sm text-muted text-center"
            >
              Sin transiciones aún.
            </p>
          </div>
        </section>
      </div>

      <div class="space-y-3">
        <section class="rounded-lg border border-default p-4 space-y-3">
          <h2 class="font-medium">Asignación</h2>
          <UFormField label="Tercero (opcional)" name="tercero">
            <USelect
              v-model="asignacion.asignadoTerceroId"
              class="w-64"
              :items="[
                { label: 'Sin asignar', value: undefined },
                ...terceros.map((t) => ({
                  label: t.nombre_completo ?? t.razon_social ?? '—',
                  value: t.id,
                })),
              ]"
            />
          </UFormField>
          <UFormField label="Personal interno (opcional)" name="usuario">
            <USelect
              v-model="asignacion.asignadoUsuarioId"
              class="w-64"
              :items="[
                { label: 'Sin asignar', value: undefined },
                ...membersStore.miembros.map((m) => ({
                  label: m.profile?.full_name ?? m.user_id,
                  value: m.user_id,
                })),
              ]"
            />
          </UFormField>
          <UFormField label="Referencia de acreditación" name="acreditacion">
            <UInput
              v-model="asignacion.acreditacionReferencia"
              class="w-full"
              placeholder="ej. certificado técnico N°..."
            />
          </UFormField>
          <UFormField label="Costo estimado" name="costo">
            <UInput
              v-model.number="asignacion.costoEstimado"
              type="number"
              min="0"
              class="w-full"
            />
          </UFormField>
          <UButton block :loading="ordenesStore.guardando" @click="guardarAsignacion()"
            >Guardar</UButton
          >
        </section>
      </div>
    </div>

    <UiDrawer :abierto="drawerCancelar" titulo="Cancelar OT" @cerrar="drawerCancelar = false">
      <UFormField label="Motivo (obligatorio)" name="motivo">
        <UTextarea v-model="motivoCancelar" class="w-full" :rows="3" />
      </UFormField>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerCancelar = false">Volver</UButton>
          <UButton
            color="error"
            :disabled="!motivoCancelar.trim()"
            :loading="ordenesStore.guardando"
            @click="cancelar()"
          >
            Cancelar OT
          </UButton>
        </div>
      </template>
    </UiDrawer>

    <UiDrawer
      :abierto="drawerCerrar"
      titulo="Cerrar orden de trabajo"
      @cerrar="drawerCerrar = false"
    >
      <div class="space-y-3">
        <UFormField label="Fecha de cierre" name="fecha">
          <UInput v-model="cierre.fechaCierre" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Referencia de evidencia (opcional)" name="evidencia">
          <UInput v-model="cierre.evidenciaReferencia" class="w-full" />
        </UFormField>
        <UFormField
          v-if="ot.estado === 'pendiente_aprobacion'"
          label="Aprobada por"
          name="aprobadaPor"
        >
          <USelect
            v-model="cierre.aprobadaPor"
            class="w-64"
            :items="
              membersStore.miembros.map((m) => ({
                label: m.profile?.full_name ?? m.user_id,
                value: m.user_id,
              }))
            "
          />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerCerrar = false">Cancelar</UButton>
          <UButton
            color="success"
            :loading="ordenesStore.guardando"
            :disabled="ot.estado === 'pendiente_aprobacion' && !cierre.aprobadaPor"
            @click="cerrar()"
          >
            Cerrar OT
          </UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
  <p v-else class="text-sm text-muted p-6 text-center">Cargando…</p>
</template>
