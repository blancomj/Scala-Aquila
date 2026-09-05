<script setup lang="ts">
// Expediente probatorio imprimible (CAR §34.5) — el artefacto que el
// abogado radica.
//
// Criterio de terminación de §34.5: **el abogado debe poder radicar con
// esto sin pedir nada más**. Si tiene que preguntar algo, la sección no
// está completa.
//
// El PDF no es la fuente de verdad: es una materialización fechada de
// fn_compilar_expediente, reproducible. Por eso el hash del expediente va
// impreso y visible — dos compilaciones del mismo corte dan el mismo hash
// aunque entre medias hayan entrado pagos y gestiones nuevas (PH-C44).
//
// Se imprime con @media print + window.print(), igual que el recibo de caja
// y el comprobante de cuenta: sin librería de PDF, el navegador pagina y el
// usuario guarda como PDF. El pie va en position:fixed para que el hash
// aparezca en TODAS las páginas, no solo en la última — un expediente cuyo
// hash solo consta al final es un expediente al que se le pueden quitar
// hojas sin que se note.
import { formatoMoneda } from '~/utils/formato'
import { useCobranzaStore } from '~/stores/cobranza'
import { textoLegible } from '~/utils/mensaje-cobranza'

definePageMeta({ layout: 'blank', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

interface Obligado {
  tercero_id: string
  nombre: string | null
  documento: string
  rol: string
  porcentaje: number | null
  direccion_notificacion: string | null
  municipio: string | null
  email: string | null
}

interface CargoExpediente {
  cargo_id: string
  categoria: string
  fecha_vencimiento: string
  monto_original: string | number
  saldo_al_corte: string | number
  dias_mora: number
}

interface AcuseExpediente {
  estado: string
  ocurrido_at: string
  origen: string
  motivo: string | null
}

interface EnvioExpediente {
  envio_id: string
  intento_numero: number
  canal: string
  destinatario_contacto: string
  plantilla_codigo: string
  /** Solo correo. */
  asunto: string | null
  contenido_renderizado: string
  enviado_at: string
  proveedor: string
  referencia_externa: string | null
  acuses: AcuseExpediente[]
}

interface AccionExpediente {
  accion_id: string
  tipo_accion: string
  canal: string
  fecha_programada: string
  fecha_ejecucion: string | null
  estado: string
  destinatario: { rol: string; contacto: string | null }
  contexto_congelado: { clasificacion: string; dias_mora: number; deuda_total: string | number }
  envios: EnvioExpediente[]
  acreditada: boolean
}

interface Expediente {
  fecha_corte: string
  expediente_hash: string
  generado_at: string
  identificacion: {
    copropiedad: { nombre: string; nit: string | null; direccion: string | null; ciudad: string | null } | null
    inmueble: { codigo: string; matricula_inmobiliaria: string | null; coeficiente: string | null } | null
    obligados: Obligado[]
  }
  titulo_ejecutivo: Record<string, unknown>
  composicion_deuda: CargoExpediente[]
  cronologia_gestion: AccionExpediente[]
  promesas: Record<string, unknown>[]
  acuerdos: Record<string, unknown>[]
  trazabilidad: { etapa_actual: string | null; aprobaciones: Record<string, unknown>[] }
  intentos_fallidos: Record<string, unknown>[]
  caso_juridico: Record<string, unknown> | null
}

// El expediente es un papel: siempre claro, también cuando la aplicación
// está en tema oscuro. Sin esto, el fondo oscuro del layout asoma detrás
// del documento al desplazarse — un documento que se radica no puede
// parpadear en negro.
useHead({
  bodyAttrs: { style: 'background:var(--color-neutral-50)' },
})

const route = useRoute()
const tenantStore = useTenantStore()
const cobranzaStore = useCobranzaStore()

const inmuebleId = computed(() => String(route.params.inmuebleId))
const fechaCorte = ref(
  typeof route.query.corte === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(route.query.corte)
    ? route.query.corte
    : new Date().toISOString().slice(0, 10),
)

const expediente = ref<Expediente | null>(null)
const cargando = ref(false)
const errorCarga = ref<string | null>(null)

const ETIQUETA_ACCION: Record<string, string> = {
  email: 'Comunicación por correo electrónico',
  sms: 'Mensaje de texto (SMS)',
  whatsapp: 'Mensaje por WhatsApp',
  llamada: 'Gestión telefónica',
  carta: 'Comunicación física',
  requerimiento_formal: 'Requerimiento formal',
  aviso_prejuridico: 'Aviso prejurídico',
  propuesta_acuerdo: 'Propuesta de acuerdo de pago',
  asignacion_abogado: 'Asignación de abogado',
  remision_juridica: 'Remisión a cobro jurídico',
  revision_manual: 'Revisión manual',
}

const ETIQUETA_ACUSE: Record<string, string> = {
  encolado: 'Aceptado por el proveedor',
  entregado: 'Entregado',
  leido: 'Leído',
  rebotado: 'Rechazado por el destino',
  fallido: 'Fallo técnico',
  no_entregable: 'No entregable',
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  cargando.value = true
  errorCarga.value = null
  try {
    expediente.value = (await cobranzaStore.compilarExpediente(
      tenantId,
      inmuebleId.value,
      fechaCorte.value,
    )) as unknown as Expediente
  } catch (excepcion) {
    errorCarga.value = excepcion instanceof Error ? excepcion.message : 'No se pudo compilar el expediente.'
    expediente.value = null
  } finally {
    cargando.value = false
  }
}

onMounted(() => {
  void cargar()
})

const tieneTitulo = computed(() => expediente.value?.titulo_ejecutivo?.certificacion_id != null)

const totalAlCorte = computed(() =>
  (expediente.value?.composicion_deuda ?? []).reduce((suma, c) => suma + Number(c.saldo_al_corte), 0),
)

const accionesAcreditadas = computed(
  () => (expediente.value?.cronologia_gestion ?? []).filter((a) => a.acreditada).length,
)

/**
 * Una fecha sin hora ('2026-08-29') la interpreta `new Date` como medianoche
 * UTC, y al formatearla en hora de Colombia (UTC-5) sale el día ANTERIOR.
 * En un documento que se radica, imprimir un corte con un día de menos no
 * es un detalle cosmético: es una fecha equivocada en una prueba.
 * Por eso se construye con componentes locales.
 */
function fecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const valor = soloFecha
    ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
    : new Date(iso)
  return valor.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
}

function fechaHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

function imprimir(): void {
  window.print()
}
</script>

<template>
  <div class="expediente">
    <!-- ── barra de acciones (no se imprime) ────────────────────────── -->
    <div class="acciones">
      <NuxtLink to="/cartera/acciones" class="volver">← Volver a la bandeja</NuxtLink>
      <div class="acciones-derecha">
        <label class="campo-fecha">
          Fecha de corte
          <input v-model="fechaCorte" type="date" @change="cargar" >
        </label>
        <button type="button" :disabled="cargando || expediente === null" @click="imprimir">
          Imprimir / Guardar PDF
        </button>
      </div>
    </div>

    <p v-if="cargando" class="mensaje">Compilando expediente…</p>
    <p v-else-if="errorCarga" class="mensaje error">{{ errorCarga }}</p>

    <div v-else-if="expediente" class="hoja">
      <!-- ── portada ────────────────────────────────────────────────── -->
      <header class="portada">
        <h1>Expediente de cobro</h1>
        <p class="copropiedad">
          {{ expediente.identificacion.copropiedad?.nombre ?? '—' }}
          <span v-if="expediente.identificacion.copropiedad?.nit">
            · NIT {{ expediente.identificacion.copropiedad.nit }}
          </span>
        </p>
        <p class="corte">
          Inmueble <strong>{{ expediente.identificacion.inmueble?.codigo ?? '—' }}</strong> ·
          corte al {{ fecha(expediente.fecha_corte) }}
        </p>
      </header>

      <!-- Índice: §34.5 lo exige, y en un documento que se radica sirve
           para que nadie tenga que buscar una sección hoja por hoja. -->
      <section class="indice">
        <h2>Contenido</h2>
        <ol>
          <li>Identificación del inmueble y de los obligados</li>
          <li>Título ejecutivo (art. 48 Ley 675 de 2001)</li>
          <li>Composición de la deuda al corte</li>
          <li>Cronología de la gestión de cobro</li>
          <li>Promesas y acuerdos de pago</li>
          <li>Trazabilidad de las decisiones</li>
          <li>Intentos de comunicación no entregados</li>
        </ol>
      </section>

      <!-- ── 1. identificación ──────────────────────────────────────── -->
      <section>
        <h2>1. Identificación</h2>
        <dl class="datos">
          <dt>Inmueble</dt>
          <dd>{{ expediente.identificacion.inmueble?.codigo ?? '—' }}</dd>
          <dt>Matrícula inmobiliaria</dt>
          <dd>{{ expediente.identificacion.inmueble?.matricula_inmobiliaria ?? 'No registrada' }}</dd>
          <dt>Coeficiente de copropiedad</dt>
          <dd>{{ expediente.identificacion.inmueble?.coeficiente ?? 'No registrado' }}</dd>
        </dl>

        <h3>Obligados al pago</h3>
        <p class="nota">
          Responden por las expensas comunes en su calidad de copropietarios, conforme al artículo 29
          de la Ley 675 de 2001.
        </p>
        <table>
          <thead>
            <tr><th>Nombre</th><th>Documento</th><th>Calidad</th><th>Dirección de notificación</th></tr>
          </thead>
          <tbody>
            <tr v-for="obligado in expediente.identificacion.obligados" :key="obligado.tercero_id">
              <td>{{ obligado.nombre ?? '—' }}</td>
              <td>{{ obligado.documento }}</td>
              <td>{{ obligado.rol }}</td>
              <td>
                {{ obligado.direccion_notificacion ?? 'No registrada' }}
                <span v-if="obligado.municipio">, {{ obligado.municipio }}</span>
              </td>
            </tr>
            <tr v-if="expediente.identificacion.obligados.length === 0">
              <td colspan="4" class="vacio">Sin obligados vigentes registrados a la fecha de corte.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- ── 2. título ejecutivo ────────────────────────────────────── -->
      <section>
        <h2>2. Título ejecutivo</h2>
        <template v-if="tieneTitulo">
          <dl class="datos">
            <dt>Certificación</dt>
            <dd>{{ expediente.titulo_ejecutivo.consecutivo }}</dd>
            <dt>Fecha de expedición</dt>
            <dd>{{ fecha(expediente.titulo_ejecutivo.fecha_expedicion as string) }}</dd>
            <dt>Expensas ordinarias</dt>
            <dd>{{ formatoMoneda(expediente.titulo_ejecutivo.monto_expensas_ordinarias as string) }}</dd>
            <dt>Intereses de mora</dt>
            <dd>{{ formatoMoneda(expediente.titulo_ejecutivo.monto_intereses_mora as string) }}</dd>
            <dt>Total certificado</dt>
            <dd><strong>{{ formatoMoneda(expediente.titulo_ejecutivo.monto_total as string) }}</strong></dd>
            <dt>Firmante</dt>
            <dd>{{ expediente.titulo_ejecutivo.cargo_firmante }}</dd>
            <dt>Hash de la certificación</dt>
            <dd class="hash">{{ expediente.titulo_ejecutivo.certificacion_hash }}</dd>
          </dl>
        </template>
        <!-- Se dice, no se calla: sin certificación no hay título, y quien
             lea el expediente tiene que saberlo antes de radicar. -->
        <p v-else class="faltante">
          {{ expediente.titulo_ejecutivo.faltante ?? 'Sin certificación de deuda vigente al corte.' }}
        </p>
      </section>

      <!-- ── 3. composición de la deuda ─────────────────────────────── -->
      <section>
        <h2>3. Composición de la deuda al corte</h2>
        <table>
          <thead>
            <tr>
              <th>Vencimiento</th><th>Concepto</th><th class="num">Días de mora</th>
              <th class="num">Valor original</th><th class="num">Saldo al corte</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="cargo in expediente.composicion_deuda" :key="cargo.cargo_id">
              <td>{{ fecha(cargo.fecha_vencimiento) }}</td>
              <td>{{ cargo.categoria }}</td>
              <td class="num">{{ cargo.dias_mora }}</td>
              <td class="num">{{ formatoMoneda(cargo.monto_original) }}</td>
              <td class="num">{{ formatoMoneda(cargo.saldo_al_corte) }}</td>
            </tr>
            <tr v-if="expediente.composicion_deuda.length === 0">
              <td colspan="5" class="vacio">Sin obligaciones vencidas a la fecha de corte.</td>
            </tr>
          </tbody>
          <tfoot v-if="expediente.composicion_deuda.length > 0">
            <tr>
              <td colspan="4"><strong>Total al corte</strong></td>
              <td class="num"><strong>{{ formatoMoneda(totalAlCorte) }}</strong></td>
            </tr>
          </tfoot>
        </table>
      </section>

      <!-- ── 4. cronología ──────────────────────────────────────────── -->
      <section>
        <h2>4. Cronología de la gestión de cobro</h2>
        <p class="nota">
          {{ expediente.cronologia_gestion.length }} gestión(es) registrada(s),
          {{ accionesAcreditadas }} con entrega acreditada por el proveedor.
          Cada comunicación se reproduce con su texto íntegro.
        </p>

        <article v-for="accion in expediente.cronologia_gestion" :key="accion.accion_id" class="gestion">
          <h3>
            {{ ETIQUETA_ACCION[accion.tipo_accion] ?? accion.tipo_accion }}
            <span class="fecha-gestion">{{ fecha(accion.fecha_programada) }}</span>
          </h3>
          <p class="contexto">
            Al momento de la gestión: {{ accion.contexto_congelado.dias_mora }} días de mora,
            saldo de {{ formatoMoneda(accion.contexto_congelado.deuda_total) }},
            clasificación {{ accion.contexto_congelado.clasificacion }}.
          </p>

          <div v-for="envio in accion.envios" :key="envio.envio_id" class="envio">
            <p class="envio-meta">
              Intento {{ envio.intento_numero }} · {{ envio.canal }} · enviado el
              {{ fechaHora(envio.enviado_at) }} a {{ envio.destinatario_contacto }}
              <span v-if="envio.referencia_externa"> · referencia {{ envio.referencia_externa }}</span>
            </p>
            <p v-if="envio.asunto" class="envio-asunto">Asunto: {{ envio.asunto }}</p>
            <blockquote>{{ textoLegible(envio.canal, envio.contenido_renderizado) }}</blockquote>
            <p v-if="envio.acuses.length > 0" class="acuses">
              <span v-for="(acuse, i) in envio.acuses" :key="i">
                {{ ETIQUETA_ACUSE[acuse.estado] ?? acuse.estado }} el {{ fechaHora(acuse.ocurrido_at) }}<span
                  v-if="acuse.motivo"
                > ({{ acuse.motivo }})</span><span v-if="i < envio.acuses.length - 1"> · </span>
              </span>
            </p>
            <p v-else class="acuses">Sin acuse del proveedor.</p>
          </div>

          <p v-if="accion.envios.length === 0" class="nota">
            Gestión registrada sin envío material asociado.
          </p>
        </article>

        <p v-if="expediente.cronologia_gestion.length === 0" class="vacio">
          Sin gestiones de cobro registradas a la fecha de corte.
        </p>
      </section>

      <!-- ── 5. promesas y acuerdos ─────────────────────────────────── -->
      <section>
        <h2>5. Promesas y acuerdos de pago</h2>
        <p v-if="expediente.promesas.length === 0 && expediente.acuerdos.length === 0" class="vacio">
          El deudor no registra promesas ni acuerdos de pago.
        </p>
        <table v-if="expediente.acuerdos.length > 0">
          <thead>
            <tr><th>Acuerdo</th><th>Fecha</th><th class="num">Monto</th><th>Estado</th></tr>
          </thead>
          <tbody>
            <tr v-for="(acuerdo, i) in expediente.acuerdos" :key="i">
              <td>{{ acuerdo.consecutivo }}</td>
              <td>{{ fecha(acuerdo.fecha_acuerdo as string) }}</td>
              <td class="num">{{ formatoMoneda(acuerdo.monto_total as string) }}</td>
              <td>{{ acuerdo.estado }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- ── 6. trazabilidad ────────────────────────────────────────── -->
      <section>
        <h2>6. Trazabilidad de las decisiones</h2>
        <dl class="datos">
          <dt>Etapa de cobranza actual</dt>
          <dd>{{ expediente.trazabilidad.etapa_actual ?? '—' }}</dd>
          <dt>Gestiones aprobadas por un administrador</dt>
          <dd>{{ expediente.trazabilidad.aprobaciones.length }}</dd>
        </dl>
        <p class="nota">
          Las gestiones de alto impacto exigen aprobación de un administrador identificado antes de
          ejecutarse; la autorización queda registrada con su autor y su fecha.
        </p>
      </section>

      <!-- ── 7. intentos fallidos ───────────────────────────────────── -->
      <section>
        <h2>7. Intentos de comunicación no entregados</h2>
        <p class="nota">
          Se relacionan por acreditar la diligencia de la copropiedad, aun cuando la comunicación no
          llegó a su destino.
        </p>
        <table v-if="expediente.intentos_fallidos.length > 0">
          <thead>
            <tr><th>Fecha</th><th>Canal</th><th>Destino</th><th>Resultado</th></tr>
          </thead>
          <tbody>
            <tr v-for="(fallido, i) in expediente.intentos_fallidos" :key="i">
              <td>{{ fechaHora(fallido.enviado_at as string) }}</td>
              <td>{{ fallido.canal }}</td>
              <td>{{ fallido.destinatario_contacto }}</td>
              <td>
                {{ ETIQUETA_ACUSE[fallido.estado_final as string] ?? fallido.estado_final }}
                <span v-if="fallido.motivo"> — {{ fallido.motivo }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="vacio">Sin intentos fallidos registrados.</p>
      </section>

      <!-- Pie en cada página: el hash acompaña a cada hoja, no solo a la
           última (ver cabecera del archivo). -->
      <footer class="pie">
        Expediente {{ expediente.expediente_hash.slice(0, 16) }} · corte {{ expediente.fecha_corte }} ·
        compilado el {{ fechaHora(expediente.generado_at) }}
      </footer>
    </div>
  </div>
</template>

<style scoped>
.expediente {
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

.acciones-derecha {
  display: flex;
  align-items: center;
  gap: 12px;
}

.volver {
  font-size: 14px;
  color: var(--color-neutral-600);
  text-decoration: none;
}

.campo-fecha {
  font-size: 13px;
  color: var(--color-neutral-600);
  display: flex;
  align-items: center;
  gap: 6px;
}

.campo-fecha input {
  border: 1px solid var(--color-neutral-300);
  border-radius: 5px;
  padding: 5px 8px;
  font: inherit;
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

.portada h1 {
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 6px;
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

h3 {
  font-size: 13px;
  font-weight: 600;
  margin: 16px 0 6px;
}

.indice ol {
  margin: 0;
  padding-left: 20px;
  color: var(--color-neutral-700);
}

.datos {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 2px 16px;
  margin: 0 0 12px;
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
  margin: 4px 0 8px;
}

.vacio {
  color: var(--color-neutral-400);
  font-style: italic;
}

.faltante {
  border-left: 3px solid var(--ui-color-warning-600);
  padding: 6px 10px;
  background: var(--ui-color-warning-50);
  margin: 0;
}

.gestion {
  border-left: 2px solid var(--color-neutral-200);
  padding-left: 14px;
  margin: 0 0 18px;
  /* Una gestión no se parte entre dos hojas: su texto y su acuse tienen
     que leerse juntos. */
  break-inside: avoid;
}

.gestion h3 {
  margin-top: 0;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.fecha-gestion {
  font-weight: 400;
  color: var(--color-neutral-600);
}

.contexto {
  color: var(--color-neutral-600);
  margin: 0 0 8px;
}

.envio {
  margin-bottom: 10px;
}

.envio-meta {
  color: var(--color-neutral-600);
  margin: 0 0 4px;
  font-size: 12px;
}

.envio-asunto {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 600;
}

blockquote {
  margin: 0 0 4px;
  padding: 8px 12px;
  background: var(--color-neutral-50);
  border-radius: 3px;
  white-space: pre-wrap;
}

.acuses {
  margin: 0;
  font-size: 12px;
  color: var(--color-neutral-700);
}

.hash {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  word-break: break-all;
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
  .expediente {
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

  /* El hash en TODAS las páginas: position fixed hace que el navegador lo
     repita en cada hoja impresa. */
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
