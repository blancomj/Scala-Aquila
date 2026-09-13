<script setup lang="ts">
// Mantenimiento → Activos, Fase 2 (Crear/Editar) — PROMPT_IMPLEMENTACION_MANTENIMIENTO_
// ACTIVOS_AQUILA.md §9-12, D-88. Un solo drawer para crear y editar: la única diferencia es
// si `activo` (prop) trae una fila o es null. No hay ninguna validación de negocio duplicada
// aquí — todo lo que puede rechazar un guard (categoría/tipo válidos, jerarquía sin ciclos,
// bloque contable completo, bien esencial no capitalizable...) se deja para que lo rechace
// `guard_activo_ficha` tal cual, y su mensaje (ya en español, con el código por delante) se
// muestra sin traducir — el único chequeo de cliente es el código duplicado, por UX (evita un
// viaje redondo para el error más común), con el UNIQUE de BD como respaldo real.
//
// §12: una vez `capitalizado = true`, el bloque contable y el propio interruptor quedan de
// solo lectura — cambiarlos con un UPDATE plano después de capitalizar corrompería asientos ya
// contabilizados. La vía correcta (fn_mant_capitalizar_activo/fn_mant_dar_baja_activo) es Fase
// 4, todavía sin UI — así que aquí simplemente no se ofrece la edición, en vez de simularla.
import type { Database } from '@aquila/shared'
import { mensajeError } from '~/utils/error-message'

type ActivoRow = Database['public']['Tables']['activos']['Row']
type ListaTipoRow = Database['public']['Tables']['lista_tipos']['Row']
type NaturalezaBien = Database['public']['Enums']['activo_naturaleza_bien_t']
type Origen = Database['public']['Enums']['activo_origen_t']
type MetodoDepreciacion = Database['public']['Enums']['depreciacion_metodo_t']

const props = defineProps<{
  abierto: boolean
  activo: ActivoRow | null
  tenantId: string
  tiposActivo: ListaTipoRow[]
  categoriasActivo: ListaTipoRow[]
  activosExistentes: ActivoRow[]
}>()
const emit = defineEmits<{ cerrar: []; guardado: [ActivoRow] }>()

const activosStore = useActivosStore()
const agrupacionesStore = useAgrupacionesStore()
const zonasComunesStore = useZonasComunesStore()
const contabilidadStore = useContabilidadStore()

const centrosCosto = ref<ListaTipoRow[]>([])
const catalogosCargados = ref(false)

async function cargarCatalogos(): Promise<void> {
  if (catalogosCargados.value) return
  await Promise.all([
    agrupacionesStore.agrupaciones.length === 0
      ? agrupacionesStore.cargarAgrupaciones(props.tenantId)
      : Promise.resolve(),
    zonasComunesStore.zonasComunes.length === 0
      ? zonasComunesStore.cargarZonasComunes(props.tenantId)
      : Promise.resolve(),
    contabilidadStore.cuentas.length === 0 ? contabilidadStore.cargarPlan(props.tenantId) : Promise.resolve(),
    cargarListaTipos(props.tenantId, 'CENTRO_COSTO').then((d) => { centrosCosto.value = d }),
  ])
  catalogosCargados.value = true
}

const modoEdicion = computed(() => props.activo !== null)
const yaCapitalizado = computed(() => props.activo?.capitalizado === true)

interface FormActivo {
  codigo: string
  nombre: string
  descripcion: string
  // USelect no acepta `null` como model-value (a diferencia de UiSelectorBuscable/UInputNumber,
  // que sí) — `undefined` es "sin elegir" para estos cuatro.
  categoriaId: number | undefined
  tipoId: number | undefined
  naturalezaBien: NaturalezaBien
  origen: Origen
  activoPadreId: string | null
  agrupacionId: string | null
  zonaComunId: string | null
  ubicacionDetalle: string
  marca: string
  modelo: string
  fabricante: string
  numeroSerie: string
  fechaAdquisicion: string
  fechaInstalacion: string
  fechaPuestaServicio: string
  capitalizado: boolean
  valorAdquisicion: number | null
  contableCuentaId: string | null
  centroCostoId: number | undefined
  vidaUtilMeses: number | null
  metodoDepreciacion: MetodoDepreciacion | undefined
  valorResidual: number | null
  fechaInicioDepreciacion: string
}

function formVacio(): FormActivo {
  return {
    codigo: '', nombre: '', descripcion: '', categoriaId: undefined, tipoId: undefined,
    naturalezaBien: 'bien_propio', origen: 'comprado', activoPadreId: null,
    agrupacionId: null, zonaComunId: null, ubicacionDetalle: '',
    marca: '', modelo: '', fabricante: '', numeroSerie: '',
    fechaAdquisicion: '', fechaInstalacion: '', fechaPuestaServicio: '',
    capitalizado: false, valorAdquisicion: null, contableCuentaId: null, centroCostoId: undefined,
    vidaUtilMeses: null, metodoDepreciacion: undefined, valorResidual: 0, fechaInicioDepreciacion: '',
  }
}

const form = reactive<FormActivo>(formVacio())
const errorGuardar = ref<string | null>(null)

function sincronizarDesdeActivo(): void {
  const a = props.activo
  errorGuardar.value = null
  if (!a) {
    Object.assign(form, formVacio())
    return
  }
  Object.assign(form, {
    codigo: a.codigo, nombre: a.nombre, descripcion: a.descripcion ?? '',
    categoriaId: a.categoria_id, tipoId: a.tipo_id,
    naturalezaBien: a.naturaleza_bien, origen: a.origen, activoPadreId: a.activo_padre_id,
    agrupacionId: a.agrupacion_id, zonaComunId: a.zona_comun_id, ubicacionDetalle: a.ubicacion_detalle ?? '',
    marca: a.marca ?? '', modelo: a.modelo ?? '', fabricante: a.fabricante ?? '', numeroSerie: a.numero_serie ?? '',
    fechaAdquisicion: a.fecha_adquisicion ?? '', fechaInstalacion: a.fecha_instalacion ?? '',
    fechaPuestaServicio: a.fecha_puesta_servicio ?? '',
    capitalizado: a.capitalizado, valorAdquisicion: a.valor_adquisicion, contableCuentaId: a.contable_cuenta_id,
    centroCostoId: a.centro_costo_id ?? undefined, vidaUtilMeses: a.vida_util_meses,
    metodoDepreciacion: a.metodo_depreciacion ?? undefined,
    valorResidual: a.valor_residual, fechaInicioDepreciacion: a.fecha_inicio_depreciacion ?? '',
  } satisfies Partial<FormActivo>)
}

watch(() => props.abierto, (abierto) => {
  if (!abierto) return
  sincronizarDesdeActivo()
  void cargarCatalogos()
})

const opcionesCategoria = computed(() => props.categoriasActivo.map((c) => ({ label: c.nombre, value: c.id })))
const opcionesTipo = computed(() => props.tiposActivo.map((t) => ({ label: t.nombre, value: t.id })))
const opcionesCentroCosto = computed(() => centrosCosto.value.map((c) => ({ label: c.nombre, value: c.id })))

const opcionesActivoPadre = computed(() =>
  props.activosExistentes
    .filter((a) => a.id !== props.activo?.id)
    .map((a) => ({ valor: a.id, etiqueta: `${a.codigo} — ${a.nombre}` })),
)
const opcionesAgrupacion = computed(() =>
  agrupacionesStore.arbolPlano.map((n) => ({ valor: n.id, etiqueta: n.ruta })),
)
const opcionesZonaComun = computed(() =>
  zonasComunesStore.zonasComunes.map((z) => ({ valor: z.id, etiqueta: z.nombre })),
)
// Guía, no validación: guard_activo_ficha exige clase 1 / código '15xx' / permite_movimiento —
// se acota la lista a esas para no ofrecer una cuenta que el guard va a rechazar de todas
// formas, sin reimplementar el chequeo (el guard sigue siendo la autoridad).
const opcionesCuentaContable = computed(() =>
  contabilidadStore.cuentasDeMovimiento
    .filter((c) => c.codigo.startsWith('15'))
    .map((c) => ({ valor: c.id, etiqueta: `${c.codigo} — ${c.nombre}` })),
)

const codigoDuplicado = computed(() => {
  const codigo = form.codigo.trim().toLowerCase()
  if (!codigo) return false
  return props.activosExistentes.some(
    (a) => a.id !== props.activo?.id && a.codigo.trim().toLowerCase() === codigo,
  )
})

const formularioValido = computed(() =>
  form.codigo.trim() !== '' && form.nombre.trim() !== ''
  && form.categoriaId !== undefined && form.tipoId !== undefined
  && !codigoDuplicado.value,
)

async function guardar(): Promise<void> {
  errorGuardar.value = null
  if (!formularioValido.value) return

  const base = {
    codigo: form.codigo.trim(),
    nombre: form.nombre.trim(),
    descripcion: form.descripcion.trim() || null,
    categoria_id: form.categoriaId!,
    tipo_id: form.tipoId!,
    naturaleza_bien: form.naturalezaBien,
    origen: form.origen,
    activo_padre_id: form.activoPadreId,
    agrupacion_id: form.agrupacionId,
    zona_comun_id: form.zonaComunId,
    ubicacion_detalle: form.ubicacionDetalle.trim() || null,
    marca: form.marca.trim() || null,
    modelo: form.modelo.trim() || null,
    fabricante: form.fabricante.trim() || null,
    numero_serie: form.numeroSerie.trim() || null,
    fecha_adquisicion: form.fechaAdquisicion || null,
    fecha_instalacion: form.fechaInstalacion || null,
    fecha_puesta_servicio: form.fechaPuestaServicio || null,
  }
  // El bloque contable solo viaja si el activo NO está ya capitalizado (creación, o edición de
  // uno que todavía no lo está) — una vez capitalizado, la sección es de solo lectura y no se
  // reenvían sus valores (evita un UPDATE que "confirme" los mismos datos por un camino que no
  // es la función transaccional).
  const bloqueContable = yaCapitalizado.value ? {} : {
    capitalizado: form.capitalizado,
    valor_adquisicion: form.valorAdquisicion,
    contable_cuenta_id: form.contableCuentaId,
    centro_costo_id: form.centroCostoId ?? null,
    vida_util_meses: form.vidaUtilMeses,
    metodo_depreciacion: form.metodoDepreciacion ?? null,
    valor_residual: form.valorResidual ?? 0,
    fecha_inicio_depreciacion: form.fechaInicioDepreciacion || null,
  }

  try {
    const guardado = props.activo
      ? await activosStore.actualizarActivo(props.activo.id, { ...base, ...bloqueContable })
      : await activosStore.crearActivo({ tenant_id: props.tenantId, ...base, ...bloqueContable })
    emit('guardado', guardado)
  } catch (excepcion) {
    errorGuardar.value = mensajeError(
      excepcion,
      modoEdicion.value ? 'No se pudo guardar los cambios.' : 'No se pudo crear el activo.',
    )
  }
}
</script>

<template>
  <UiDrawer
    :abierto="abierto"
    :titulo="modoEdicion ? `Editar ${activo?.codigo ?? ''}` : 'Nuevo activo'"
    ancho="ancho"
    @cerrar="emit('cerrar')"
  >
    <div class="space-y-6">
      <UAlert v-if="errorGuardar" color="error" variant="soft" :title="errorGuardar" />
      <UAlert
        v-if="codigoDuplicado"
        color="warning"
        variant="soft"
        title="Ya existe un activo con este código en esta copropiedad."
      />

      <section class="space-y-3">
        <h3 class="text-sm font-semibold text-muted">Identificación</h3>
        <div class="grid sm:grid-cols-2 gap-3">
          <UFormField label="Código *" name="codigo"><UInput v-model="form.codigo" class="w-full" /></UFormField>
          <UFormField label="Nombre *" name="nombre"><UInput v-model="form.nombre" class="w-full" /></UFormField>
        </div>
        <UFormField label="Descripción" name="descripcion">
          <UTextarea v-model="form.descripcion" class="w-full" />
        </UFormField>
        <div class="grid sm:grid-cols-2 gap-3">
          <UFormField label="Categoría *" name="categoria">
            <USelect v-model="form.categoriaId" :items="opcionesCategoria" class="w-full" />
          </UFormField>
          <UFormField label="Tipo *" name="tipo">
            <USelect v-model="form.tipoId" :items="opcionesTipo" class="w-full" />
          </UFormField>
        </div>
      </section>

      <section class="space-y-3">
        <h3 class="text-sm font-semibold text-muted">Clasificación</h3>
        <div class="grid sm:grid-cols-2 gap-3">
          <UFormField label="Naturaleza del bien" name="naturaleza">
            <USelect
              v-model="form.naturalezaBien"
              class="w-full"
              :items="[
                { label: 'Bien propio', value: 'bien_propio' },
                { label: 'Bien común esencial', value: 'bien_comun_esencial' },
                { label: 'Bien común no esencial desafectado', value: 'bien_comun_no_esencial_desafectado' },
              ]"
            />
          </UFormField>
          <UFormField label="Origen" name="origen">
            <USelect
              v-model="form.origen"
              class="w-full"
              :items="[
                { label: 'Comprado', value: 'comprado' },
                { label: 'Recibido de la constructora', value: 'recibido_constructora' },
                { label: 'Donado', value: 'donado' },
                { label: 'Reposición', value: 'reposicion' },
              ]"
            />
          </UFormField>
        </div>
        <UFormField label="Activo padre (opcional)" name="activoPadre">
          <UiSelectorBuscable v-model="form.activoPadreId" :opciones="opcionesActivoPadre" placeholder="Sin activo padre" />
        </UFormField>
      </section>

      <section class="space-y-3">
        <h3 class="text-sm font-semibold text-muted">Ubicación</h3>
        <div class="grid sm:grid-cols-2 gap-3">
          <UFormField label="Agrupación (opcional)" name="agrupacion">
            <UiSelectorBuscable v-model="form.agrupacionId" :opciones="opcionesAgrupacion" placeholder="Sin agrupación" />
          </UFormField>
          <UFormField label="Zona común (opcional)" name="zonaComun">
            <UiSelectorBuscable v-model="form.zonaComunId" :opciones="opcionesZonaComun" placeholder="Sin zona común" />
          </UFormField>
        </div>
        <UFormField label="Ubicación detallada" name="ubicacionDetalle">
          <UInput v-model="form.ubicacionDetalle" class="w-full" placeholder="Ej. Torre B - Sótano 2" />
        </UFormField>
      </section>

      <section class="space-y-3">
        <h3 class="text-sm font-semibold text-muted">Información técnica</h3>
        <div class="grid sm:grid-cols-2 gap-3">
          <UFormField label="Marca" name="marca"><UInput v-model="form.marca" class="w-full" /></UFormField>
          <UFormField label="Modelo" name="modelo"><UInput v-model="form.modelo" class="w-full" /></UFormField>
          <UFormField label="Fabricante" name="fabricante"><UInput v-model="form.fabricante" class="w-full" /></UFormField>
          <UFormField label="Número de serie" name="numeroSerie"><UInput v-model="form.numeroSerie" class="w-full" /></UFormField>
        </div>
        <p v-if="modoEdicion" class="text-xs text-muted">
          Los atributos técnicos dinámicos (según el tipo de activo) se editan en la pestaña
          Técnico de la ficha, no aquí.
        </p>
      </section>

      <section class="space-y-3">
        <h3 class="text-sm font-semibold text-muted">Fechas</h3>
        <div class="grid sm:grid-cols-3 gap-3">
          <UFormField label="Fecha adquisición" name="fechaAdquisicion">
            <UInput v-model="form.fechaAdquisicion" type="date" class="w-full" :disabled="yaCapitalizado" />
          </UFormField>
          <UFormField label="Fecha instalación" name="fechaInstalacion">
            <UInput v-model="form.fechaInstalacion" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Fecha puesta en servicio" name="fechaPuestaServicio">
            <UInput v-model="form.fechaPuestaServicio" type="date" class="w-full" />
          </UFormField>
        </div>
      </section>

      <section class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-sm font-semibold text-muted">Información contable</h3>
          <UBadge v-if="yaCapitalizado" color="neutral" variant="soft">Ya capitalizado — solo lectura</UBadge>
        </div>
        <p v-if="yaCapitalizado" class="text-xs text-muted">
          Este activo ya está capitalizado: cambiar su valor, cuenta o vida útil desde aquí
          podría descuadrar asientos ya contabilizados. Capitalizar/dar de baja tendrán su
          propia acción más adelante.
        </p>
        <div class="grid sm:grid-cols-2 gap-3">
          <UFormField label="Cuenta contable" name="cuenta">
            <UiSelectorBuscable
              v-model="form.contableCuentaId" :opciones="opcionesCuentaContable"
              placeholder="Cuenta de clase 15" :deshabilitado="yaCapitalizado"
            />
          </UFormField>
          <UFormField label="Centro de costo" name="centroCosto">
            <USelect v-model="form.centroCostoId" :items="opcionesCentroCosto" class="w-full" :disabled="yaCapitalizado" />
          </UFormField>
          <UFormField label="Valor adquisición" name="valorAdquisicion">
            <UInputNumber
              v-model="form.valorAdquisicion" :min="0" :increment="false" :decrement="false"
              :format-options="{ style: 'currency', currency: 'COP', maximumFractionDigits: 0 }"
              locale="es-CO" class="w-full" :disabled="yaCapitalizado"
            />
          </UFormField>
          <UFormField label="Valor residual" name="valorResidual">
            <UInputNumber
              v-model="form.valorResidual" :min="0" :increment="false" :decrement="false"
              :format-options="{ style: 'currency', currency: 'COP', maximumFractionDigits: 0 }"
              locale="es-CO" class="w-full" :disabled="yaCapitalizado"
            />
          </UFormField>
          <UFormField label="Vida útil (meses)" name="vidaUtil">
            <UInputNumber v-model="form.vidaUtilMeses" :min="0" class="w-full" :disabled="yaCapitalizado" />
          </UFormField>
          <UFormField label="Método de depreciación" name="metodoDepreciacion">
            <USelect
              v-model="form.metodoDepreciacion" class="w-full" :disabled="yaCapitalizado"
              :items="[
                { label: 'Línea recta', value: 'linea_recta' },
                { label: 'No deprecia', value: 'no_deprecia' },
              ]"
            />
          </UFormField>
          <UFormField label="Fecha inicio depreciación" name="fechaInicioDepreciacion">
            <UInput v-model="form.fechaInicioDepreciacion" type="date" class="w-full" :disabled="yaCapitalizado" />
          </UFormField>
        </div>
        <UFormField label="Capitalizado" name="capitalizado">
          <USwitch v-model="form.capitalizado" :disabled="yaCapitalizado" />
        </UFormField>
      </section>
    </div>
    <template #foot>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="activosStore.guardando" :disabled="!formularioValido" @click="guardar()">
          {{ modoEdicion ? 'Guardar cambios' : 'Crear activo' }}
        </UButton>
      </div>
    </template>
  </UiDrawer>
</template>
