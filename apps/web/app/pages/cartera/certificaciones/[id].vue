<script setup lang="ts">
// Certificación de deuda imprimible (CAR §15.2, bloque 21) — el documento
// que, junto al certificado de existencia y representación legal, presta
// mérito ejecutivo (art. 48 Ley 675). Mismo patrón que el expediente
// probatorio (/cartera/expediente/[inmuebleId].vue): @media print +
// window.print(), sin librería de PDF, papel siempre claro.
//
// Los cinco rubros y detalle_cargos ya están persistidos y son inmutables
// (REC-CAR-014) — esta página solo los lee y los presenta, no recalcula
// nada. GAP-CAR-011 se explica aquí mismo porque es el documento que se
// radica: quien lo lea tiene que saber por qué dos rubros dan $0, no
// asumir un descuido.
import { useCertificacionesStore, type CertificacionDeuda } from '~/stores/certificaciones'
import { useInmueblesStore } from '~/stores/inmuebles'
import { formatoMoneda } from '~/utils/formato'

definePageMeta({ layout: 'blank', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

interface DetalleCargo {
  cargoId: string
  periodoClave: string
  conceptoCodigo: string | null
  fechaVencimiento: string
  montoOriginal: string | number
  saldoPendiente: string | number
  categoria: string
}

// detalle_cargos es Json (tipo recursivo) — mantenerlo así en el ref
// reactivo revienta "Type instantiation is excessively deep" al leerlo en
// el template/computed (mismo problema que UiTabla en certificaciones.vue).
// Se retipa a unknown una sola vez, al asignar, y se hace el cast concreto
// en detalleCargos más abajo.
type CertificacionConDetalle = Omit<CertificacionDeuda, 'detalle_cargos'> & { detalle_cargos: unknown }

useHead({
  bodyAttrs: { style: 'background:var(--color-neutral-50)' },
})

const route = useRoute()
const tenantStore = useTenantStore()
const certStore = useCertificacionesStore()
const inmueblesStore = useInmueblesStore()

const certificacionId = computed(() => String(route.params.id))
const certificacion = ref<CertificacionConDetalle | null>(null)
const inmuebleCodigo = ref<string | null>(null)
const cargando = ref(false)
const errorCarga = ref<string | null>(null)

const ETIQUETA_CATEGORIA: Record<string, string> = {
  capital: 'Expensa ordinaria',
  interes: 'Interés de mora',
  otro: 'Otro cargo',
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  cargando.value = true
  errorCarga.value = null
  try {
    const cert = await certStore.obtenerPorId(certificacionId.value)
    if (!cert || cert.tenant_id !== tenantId) {
      errorCarga.value = 'Certificación no encontrada.'
      certificacion.value = null
      return
    }
    certificacion.value = cert as CertificacionConDetalle
    const inmueble = await inmueblesStore.cargarInmueble(tenantId, cert.inmueble_id)
    inmuebleCodigo.value = inmueble?.codigo ?? null
  } catch (excepcion) {
    errorCarga.value = excepcion instanceof Error ? excepcion.message : 'No se pudo cargar la certificación.'
    certificacion.value = null
  } finally {
    cargando.value = false
  }
}

onMounted(() => {
  void cargar()
})

const detalleCargos = computed<DetalleCargo[]>(() => (certificacion.value?.detalle_cargos as DetalleCargo[] | undefined) ?? [])

/** Ver nota en expediente/[inmuebleId].vue: una fecha sin hora se construye con componentes locales. */
function fecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const valor = soloFecha
    ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
    : new Date(iso)
  return valor.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
}

function imprimir(): void {
  window.print()
}
</script>

<template>
  <div class="certificacion">
    <div class="acciones">
      <NuxtLink to="/cartera/certificaciones" class="volver">← Volver a certificaciones</NuxtLink>
      <button type="button" :disabled="cargando || certificacion === null" @click="imprimir">
        Imprimir / Guardar PDF
      </button>
    </div>

    <p v-if="cargando" class="mensaje">Cargando certificación…</p>
    <p v-else-if="errorCarga" class="mensaje error">{{ errorCarga }}</p>

    <div v-else-if="certificacion" class="hoja">
      <header class="portada">
        <div class="portada-linea">
          <h1>Certificación de deuda</h1>
          <span class="estado" :class="certificacion.estado === 'anulada' ? 'es-anulada' : ''">
            {{ certificacion.estado === 'vigente' ? 'Vigente' : 'Anulada' }}
          </span>
        </div>
        <p class="copropiedad">
          {{ tenantStore.activeTenant?.name ?? '—' }}
          <span v-if="tenantStore.activeTenant?.nit">· NIT {{ tenantStore.activeTenant.nit }}</span>
        </p>
        <p class="corte">
          Inmueble <strong>{{ inmuebleCodigo ?? certificacion.inmueble_id }}</strong> ·
          consecutivo <strong>{{ certificacion.consecutivo }}</strong>
        </p>
      </header>

      <p v-if="certificacion.estado === 'anulada'" class="anulada-aviso">
        Esta certificación fue anulada el {{ fecha(certificacion.anulada_at) }}. Motivo:
        {{ certificacion.anulada_motivo }}. No presta mérito ejecutivo — se expidió una nueva.
      </p>

      <section>
        <h2>Fundamento legal</h2>
        <p class="nota">
          El artículo 48 de la Ley 675 de 2001 faculta al administrador para expedir esta
          certificación del valor adeudado, que, acompañada del certificado de existencia y
          representación legal de la copropiedad, presta mérito ejecutivo.
        </p>
      </section>

      <section>
        <h2>Datos de expedición</h2>
        <dl class="datos">
          <dt>Fecha de expedición</dt>
          <dd>{{ fecha(certificacion.fecha_expedicion) }}</dd>
          <dt>Fecha de corte</dt>
          <dd>{{ fecha(certificacion.fecha_corte) }}</dd>
          <dt>Firmante</dt>
          <dd>{{ certificacion.cargo_firmante }}</dd>
        </dl>
      </section>

      <section>
        <h2>Composición de la deuda</h2>
        <table>
          <thead>
            <tr><th>Rubro</th><th class="num">Valor</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Expensas ordinarias</td>
              <td class="num">{{ formatoMoneda(certificacion.monto_expensas_ordinarias) }}</td>
            </tr>
            <tr>
              <td>
                Expensas extraordinarias
                <span class="nota-inline">— siempre $0, ver nota abajo</span>
              </td>
              <td class="num">{{ formatoMoneda(certificacion.monto_expensas_extraordinarias) }}</td>
            </tr>
            <tr>
              <td>Intereses de mora</td>
              <td class="num">{{ formatoMoneda(certificacion.monto_intereses_mora) }}</td>
            </tr>
            <tr>
              <td>
                Sanciones
                <span class="nota-inline">— siempre $0, ver nota abajo</span>
              </td>
              <td class="num">{{ formatoMoneda(certificacion.monto_sanciones) }}</td>
            </tr>
            <tr>
              <td>Otros cargos</td>
              <td class="num">{{ formatoMoneda(certificacion.monto_otros) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Total certificado</strong></td>
              <td class="num"><strong>{{ formatoMoneda(certificacion.monto_total) }}</strong></td>
            </tr>
          </tfoot>
        </table>
        <p class="nota">
          Expensas extraordinarias y sanciones se certifican en $0: el esquema actual no distingue
          una cuota extraordinaria ni una sanción de cualquier otro cargo a nivel individual — no se
          certifica una clasificación que no puede probarse con exactitud (GAP-CAR-011). Los tres
          rubros restantes reconcilian con la posición de cartera del inmueble.
        </p>
      </section>

      <section>
        <h2>Detalle de los cargos certificados</h2>
        <table>
          <thead>
            <tr>
              <th>Período</th><th>Concepto</th><th>Categoría</th><th>Vencimiento</th>
              <th class="num">Valor original</th><th class="num">Saldo certificado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="cargo in detalleCargos" :key="cargo.cargoId">
              <td>{{ cargo.periodoClave }}</td>
              <td>{{ cargo.conceptoCodigo ?? '—' }}</td>
              <td>{{ ETIQUETA_CATEGORIA[cargo.categoria] ?? cargo.categoria }}</td>
              <td>{{ fecha(cargo.fechaVencimiento) }}</td>
              <td class="num">{{ formatoMoneda(cargo.montoOriginal) }}</td>
              <td class="num">{{ formatoMoneda(cargo.saldoPendiente) }}</td>
            </tr>
            <tr v-if="detalleCargos.length === 0">
              <td colspan="6" class="vacio">Sin cargos en el detalle certificado.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <footer class="pie">
        Certificación {{ certificacion.consecutivo }} · hash {{ certificacion.certificacion_hash.slice(0, 16) }}
        · expedida el {{ fecha(certificacion.fecha_expedicion) }}
      </footer>
    </div>
  </div>
</template>

<style scoped>
.certificacion {
  background: var(--color-neutral-50);
  min-height: 100vh;
  padding: 24px 16px 80px;
}

.acciones {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  max-width: 820px;
  margin: 0 auto 16px;
  flex-wrap: wrap;
}

.volver {
  font-size: 14px;
  color: var(--color-neutral-600);
  text-decoration: none;
}

.acciones button {
  background: var(--color-brand-600);
  color: white;
  border: 0;
  border-radius: 5px;
  padding: 8px 16px;
  font: inherit;
  cursor: pointer;
}

.acciones button:disabled {
  opacity: 0.5;
  cursor: default;
}

.mensaje {
  max-width: 820px;
  margin: 0 auto;
  color: var(--color-neutral-600);
}

.mensaje.error {
  color: var(--ui-color-error-600);
}

.hoja {
  max-width: 820px;
  margin: 0 auto;
  background: white;
  color: var(--color-neutral-900);
  padding: 48px 56px 72px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 12%);
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.55;
}

.portada {
  border-bottom: 2px solid var(--color-neutral-900);
  padding-bottom: 16px;
  margin-bottom: 24px;
}

.portada-linea {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.portada h1 {
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 6px;
}

.estado {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ui-color-success-600);
}

.estado.es-anulada {
  color: var(--ui-color-error-600);
}

.copropiedad {
  font-size: 14px;
  margin: 0 0 2px;
}

.corte {
  font-size: 13px;
  color: var(--color-neutral-600);
  margin: 0;
}

.anulada-aviso {
  border-left: 3px solid var(--ui-color-error-600);
  background: var(--ui-color-error-50);
  padding: 8px 12px;
  margin: 0 0 20px;
  font-size: 12px;
}

section {
  margin-bottom: 28px;
}

h2 {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 10px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--color-neutral-200);
}

.datos {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 2px 16px;
  margin: 0;
}

.datos dt {
  color: var(--color-neutral-600);
}

.datos dd {
  margin: 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0 4px;
}

th,
td {
  text-align: left;
  padding: 6px 8px;
  border-bottom: 1px solid var(--color-neutral-100);
  vertical-align: top;
}

th {
  font-weight: 600;
  border-bottom: 1px solid var(--color-neutral-300);
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

tfoot td {
  border-top: 1px solid var(--color-neutral-300);
  border-bottom: 0;
}

.nota {
  color: var(--color-neutral-600);
  margin: 8px 0 0;
}

.nota-inline {
  color: var(--color-neutral-400);
  font-size: 11px;
}

.vacio {
  color: var(--color-neutral-400);
  font-style: italic;
}

.pie {
  margin-top: 32px;
  padding-top: 8px;
  border-top: 1px solid var(--color-neutral-200);
  font-size: 10px;
  color: var(--color-neutral-600);
  font-family: ui-monospace, monospace;
}

@media print {
  .certificacion {
    background: white;
    padding: 0;
    min-height: auto;
  }

  .acciones {
    display: none;
  }

  .hoja {
    max-width: 100%;
    box-shadow: none;
    border-radius: 0;
    padding: 0;
  }

  .pie {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    margin: 0;
    padding: 4px 0;
    background: white;
  }

  section {
    break-inside: auto;
  }

  h2 {
    break-after: avoid;
  }
}

@page {
  margin: 18mm 16mm 22mm;
}
</style>
