<script setup lang="ts">
// Drawer "Detalle del fondo" — autorizaciones (append-only) y fuentes de alimentación
// (editable solo en activa/inactiva). Ambas listas cargan al abrir, no de entrada en el
// dashboard, porque solo importan cuando alguien las va a mirar (mismo criterio que
// cargarRubros/cargarFuentesFinanciacion en presupuesto.ts: solo el fondo seleccionado).
import type { Database } from '@aquila/shared'
import type { ColumnaTabla } from '~/components/ui/UiTabla.vue'

const props = defineProps<{ fondo: Database['public']['Tables']['fondos']['Row'] }>()
const emit = defineEmits<{ cerrar: [] }>()

const tenantStore = useTenantStore()
const fondosStore = useFondosStore()

const cargando = ref(true)
onMounted(async () => {
  await Promise.all([
    fondosStore.cargarAutorizaciones(props.fondo.id),
    fondosStore.cargarFuentes(props.fondo.id),
    fondosStore.cargarRemanentes(props.fondo.id),
  ])
  cargando.value = false
})

const puedeConfigurar = computed(() => tenantStore.puede('settings:manage'))

const mostrarDrawerAutorizacion = ref(false)
const mostrarDrawerFuente = ref(false)

const opcionesAutorizacion = computed(() =>
  fondosStore.autorizaciones.map((a) => ({ valor: a.id, etiqueta: `${a.tipo_decision} — ${new Date(a.created_at).toLocaleDateString('es-CO')}` })),
)

const columnasAutorizaciones: ColumnaTabla<Database['public']['Tables']['fondo_autorizaciones']['Row']>[] = [
  { clave: 'tipo_decision', etiqueta: 'Tipo de decisión' },
  { clave: 'numero_acta', etiqueta: 'N.º acta' },
  { clave: 'fecha_acta', etiqueta: 'Fecha del acta' },
  { clave: 'decision', etiqueta: 'Decisión' },
]

const columnasRemanentes: ColumnaTabla<Database['public']['Tables']['fondo_remanentes']['Row']>[] = [
  { clave: 'monto', etiqueta: 'Monto', alinear: 'derecha' },
  { clave: 'destino', etiqueta: 'Destino' },
  { clave: 'decision', etiqueta: 'Decisión' },
  { clave: 'created_at', etiqueta: 'Fecha' },
]

const columnasFuentes: ColumnaTabla<Database['public']['Tables']['fondo_fuentes']['Row']>[] = [
  { clave: 'porcentaje', etiqueta: 'Porcentaje', alinear: 'derecha' },
  { clave: 'valor', etiqueta: 'Valor', alinear: 'derecha' },
  { clave: 'base_calculo', etiqueta: 'Base de cálculo' },
  { clave: 'activa', etiqueta: 'Activa' },
  { clave: 'operaciones', etiqueta: '' },
]

async function alternarFuenteActiva(id: string, activaActual: boolean): Promise<void> {
  await fondosStore.cambiarFuenteActiva(id, props.fondo.id, !activaActual)
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer :abierto="true" :titulo="`${fondo.codigo} — ${fondo.nombre}`" subtitulo="Autorizaciones y fuentes de alimentación" @cerrar="emit('cerrar')">
      <USkeleton v-if="cargando" class="h-40 w-full" />
      <div v-else class="space-y-6">
        <div class="flex justify-end">
          <AuditoriaAuditarAhoraBoton
            origen-tipo="fondo"
            :origen-id="fondo.id"
            :nombre-sugerido="`Auditoría — ${fondo.codigo} ${fondo.nombre}`"
            objetivo-sugerido="Evaluar autorización, fuentes, movimientos y compromisos de este fondo."
            tipo-sugerido="FINANCIERA"
          />
        </div>

        <section>
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-semibold">Autorizaciones</h3>
            <UButton v-if="puedeConfigurar" size="sm" variant="soft" @click="mostrarDrawerAutorizacion = true">
              Registrar autorización
            </UButton>
          </div>
          <UiTabla
            :columnas="columnasAutorizaciones"
            :filas="fondosStore.autorizaciones"
            :clave-fila="(f) => f.id"
            vacio="Este fondo no tiene autorizaciones registradas."
          />
        </section>

        <section>
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-semibold">Fuentes de alimentación</h3>
            <UButton v-if="puedeConfigurar" size="sm" variant="soft" @click="mostrarDrawerFuente = true">
              Registrar fuente
            </UButton>
          </div>
          <UiTabla
            :columnas="columnasFuentes"
            :filas="fondosStore.fuentes"
            :clave-fila="(f) => f.id"
            vacio="Este fondo no tiene fuentes de alimentación registradas."
          >
            <template #celda-porcentaje="{ fila }">{{ fila.porcentaje !== null ? `${fila.porcentaje}%` : '—' }}</template>
            <template #celda-valor="{ fila }">{{ fila.valor !== null ? formatoMoneda(fila.valor) : '—' }}</template>
            <template #celda-activa="{ fila }">
              <UBadge :color="fila.activa ? 'success' : 'neutral'" variant="subtle">{{ fila.activa ? 'Activa' : 'Inactiva' }}</UBadge>
            </template>
            <template #celda-operaciones="{ fila }">
              <UButton
                v-if="puedeConfigurar"
                size="xs"
                variant="ghost"
                @click="alternarFuenteActiva(fila.id, fila.activa)"
              >
                {{ fila.activa ? 'Desactivar' : 'Activar' }}
              </UButton>
            </template>
          </UiTabla>
        </section>

        <section v-if="fondosStore.remanentes.length > 0">
          <h3 class="text-sm font-semibold mb-2">Remanente al cierre</h3>
          <UiTabla
            :columnas="columnasRemanentes"
            :filas="fondosStore.remanentes"
            :clave-fila="(r) => r.id"
            vacio="Este fondo no tiene remanente registrado."
          >
            <template #celda-monto="{ fila }">{{ formatoMoneda(fila.monto) }}</template>
            <template #celda-destino="{ fila }">{{ ETIQUETA_DESTINO_REMANENTE[fila.destino] ?? fila.destino }}</template>
            <template #celda-created_at="{ fila }">{{ new Date(fila.created_at).toLocaleDateString('es-CO') }}</template>
          </UiTabla>
        </section>
      </div>

      <template #foot>
        <UButton variant="ghost" @click="emit('cerrar')">Cerrar</UButton>
      </template>
    </UiDrawer>

    <FondosFondoAutorizacionDrawer
      v-if="mostrarDrawerAutorizacion"
      :fondo-id="fondo.id"
      @cerrar="mostrarDrawerAutorizacion = false"
      @creado="mostrarDrawerAutorizacion = false"
    />
    <FondosFondoFuenteDrawer
      v-if="mostrarDrawerFuente"
      :fondo-id="fondo.id"
      :autorizaciones="opcionesAutorizacion"
      @cerrar="mostrarDrawerFuente = false"
      @creado="mostrarDrawerFuente = false"
    />
  </div>
</template>
