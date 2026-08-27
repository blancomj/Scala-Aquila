<script setup lang="ts">
// Visor público del recibo de caja — RC-4, clon de comprobante-cuenta/[id].vue
// (D-27/D-28 aplicados al recaudo). Sin sesión por defecto (AD-26): el
// acceso anónimo exige el token HMAC `t` que mintió enviar-recibo-caja; un
// miembro autenticado también puede abrirlo sin t.
definePageMeta({ layout: 'blank', publico: true })

import { montoEnLetras } from '@aquila/shared'

interface ConceptoRecibo {
  descripcion: string
  monto: number
}

interface ReciboCajaDatos {
  tenant_nombre: string
  tenant_nit: string | null
  tenant_direccion: string | null
  tenant_ciudad: string | null
  tenant_telefono: string | null
  tenant_email: string | null
  inmueble_codigo: string
  recibi_de_nombre: string | null
  recibi_de_documento_tipo: string | null
  recibi_de_documento_numero: string | null
  monto: number
  fecha_pago: string
  forma_pago: string | null
  referencia: string | null
  conceptos: ConceptoRecibo[]
  anticipo: number
  saldo_pendiente_despues: number
  generado_en: string
}

interface RespuestaReciboCaja {
  datos: ReciboCajaDatos
  folio: string | null
  contenido_hash: string | null
  anulado: boolean
  anulado_motivo: string | null
  anulado_fecha: string | null
}

const route = useRoute()
const id = route.params.id as string
const tokenEnlace = computed(() => {
  const t = route.query.t
  return typeof t === 'string' && t.length > 0 ? t : undefined
})

const cliente = useSupabaseClient()

const {
  data: respuesta,
  error: errorCarga,
  pending,
} = await useAsyncData(`recibo-caja-${id}`, async () => {
  const { data, error: errorFuncion } = await cliente.functions.invoke<RespuestaReciboCaja>(
    'ver-recibo-caja',
    { body: tokenEnlace.value ? { id, t: tokenEnlace.value } : { id } },
  )
  if (errorFuncion) {
    const err = await extraerErrorFuncion(errorFuncion)
    throw createError({ message: err.message, fatal: false })
  }
  if (!data) throw createError({ message: 'No se encontró el recibo de caja.', fatal: false })
  return data
})

const datos = computed(() => respuesta.value?.datos ?? null)
const anulado = computed(() => respuesta.value?.anulado ?? false)

function formatoFecha(iso: string): string {
  const [anio, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${anio}`
}

const montoLetras = computed(() => (datos.value ? montoEnLetras(datos.value.monto) : ''))

const recibiDocumento = computed(() => {
  const d = datos.value
  if (!d?.recibi_de_documento_numero) return null
  return d.recibi_de_documento_tipo
    ? `${d.recibi_de_documento_tipo} ${d.recibi_de_documento_numero}`
    : d.recibi_de_documento_numero
})

const contactoPartes = computed(() => {
  const d = datos.value
  if (!d) return []
  const partes: string[] = []
  if (d.tenant_direccion) partes.push(d.tenant_ciudad ? `${d.tenant_direccion}, ${d.tenant_ciudad}` : d.tenant_direccion)
  if (d.tenant_telefono) partes.push(`Tel. ${d.tenant_telefono}`)
  if (d.tenant_email) partes.push(d.tenant_email)
  return partes
})

const hashCorto = computed(() => respuesta.value?.contenido_hash?.slice(0, 12) ?? '')

function imprimir(): void {
  window.print()
}

const textoCompartir = computed(
  () =>
    `Recibo de caja ${respuesta.value?.folio ?? ''} — ${datos.value?.tenant_nombre ?? ''}, inmueble ${datos.value?.inmueble_codigo ?? ''}`,
)
const toastVisible = ref(false)
const toastMensaje = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

async function compartir(): Promise<void> {
  const url = window.location.href
  if (navigator.share) {
    try {
      await navigator.share({ title: textoCompartir.value, url })
    } catch {
      // El usuario cerró el cuadro de compartir — no es un error.
    }
    return
  }
  try {
    await navigator.clipboard.writeText(`${textoCompartir.value} ${url}`)
    mostrarToast('Enlace copiado al portapapeles')
  } catch {
    mostrarToast('No se pudo copiar el enlace')
  }
}

function mostrarToast(mensaje: string): void {
  toastMensaje.value = mensaje
  toastVisible.value = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toastVisible.value = false), 2600)
}
</script>

<template>
  <div class="recibo">
    <div class="acciones">
      <button type="button" @click="compartir">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/></svg>
        Compartir
      </button>
      <button type="button" @click="imprimir">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Imprimir / Guardar como PDF
      </button>
    </div>

    <main class="hoja">
      <template v-if="pending">
        <p class="mensaje">Cargando recibo de caja…</p>
      </template>
      <template v-else-if="errorCarga || !datos">
        <p class="mensaje">
          {{ mensajeError(errorCarga, 'No se pudo cargar el recibo de caja.') }}
        </p>
      </template>
      <template v-else>
        <div
          v-if="anulado"
          class="bg-error-600 text-white text-center text-xs font-bold tracking-wide py-2 px-4"
        >
          RECIBO ANULADO — {{ respuesta?.anulado_motivo ?? 'sin motivo registrado' }}
          <template v-if="respuesta?.anulado_fecha"> · {{ formatoFecha(respuesta.anulado_fecha) }}</template>
        </div>

        <header class="cabecera">
          <div class="marca">
            <span class="monograma" aria-hidden="true">{{
              datos.tenant_nombre.slice(0, 2).toUpperCase()
            }}</span>
            <div>
              <div class="nombre">{{ datos.tenant_nombre }}</div>
              <div class="nit">PROPIEDAD HORIZONTAL<template v-if="datos.tenant_nit"> · NIT {{ datos.tenant_nit }}</template></div>
            </div>
          </div>
          <div v-if="contactoPartes.length > 0" class="contacto">
            <span v-for="(parte, i) in contactoPartes" :key="i">{{ parte }}</span>
          </div>
        </header>

        <div class="titulo">
          <div>
            <h1>Recibo de caja</h1>
            <p>Soporte de pago recibido</p>
          </div>
          <span class="corte-tag">No. {{ respuesta?.folio ?? 'PREVIO-A-FOLIO' }}</span>
        </div>

        <section class="info">
          <dl>
            <div class="fila">
              <dt>Recibí de</dt>
              <dd>{{ datos.recibi_de_nombre ?? '—' }}</dd>
            </div>
            <div v-if="recibiDocumento" class="fila mono">
              <dt>Identificación</dt>
              <dd>{{ recibiDocumento }}</dd>
            </div>
            <div class="fila">
              <dt>Inmueble</dt>
              <dd>{{ datos.inmueble_codigo }}</dd>
            </div>
          </dl>
          <dl>
            <div class="fila mono">
              <dt>Fecha de pago</dt>
              <dd>{{ formatoFecha(datos.fecha_pago) }}</dd>
            </div>
            <div class="fila">
              <dt>Forma de pago</dt>
              <dd>{{ datos.forma_pago ?? '—' }}</dd>
            </div>
            <div v-if="datos.referencia" class="fila mono">
              <dt>Referencia</dt>
              <dd>{{ datos.referencia }}</dd>
            </div>
          </dl>
        </section>

        <div class="monto-caja">
          <div class="monto-caja-etiqueta">La suma de</div>
          <div class="monto-caja-letras">{{ montoLetras }}</div>
          <div class="monto-caja-cifra">{{ formatoMoneda(datos.monto) }}</div>
        </div>

        <h2 class="etiqueta-seccion">Por concepto de</h2>
        <div class="tabla-marco">
          <div class="scroll-x">
            <table>
              <caption class="visualmente-oculto">
                Conceptos cubiertos por este pago
              </caption>
              <thead>
                <tr>
                  <th scope="col">Concepto</th>
                  <th scope="col" class="num">Monto</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(c, i) in datos.conceptos" :key="i">
                  <td class="concepto">{{ c.descripcion }}</td>
                  <td class="num">{{ formatoMoneda(c.monto) }}</td>
                </tr>
                <tr v-if="datos.anticipo > 0">
                  <td class="concepto">Anticipo — sin aplicar a ningún cargo todavía</td>
                  <td class="num">{{ formatoMoneda(datos.anticipo) }}</td>
                </tr>
                <tr v-if="datos.conceptos.length === 0 && datos.anticipo <= 0">
                  <td colspan="2" class="concepto">Sin conceptos asociados.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="resumen">
          <div class="resumen-total">
            <span>Saldo pendiente después de este pago</span>
            <span class="total-monto">{{ formatoMoneda(datos.saldo_pendiente_despues) }}</span>
          </div>
        </div>

        <aside class="notas">
          <ol>
            <li><b>Soporte.</b> Este recibo es soporte de pago; no reemplaza la factura o el recibo de caja tributario si aplica.</li>
            <li><b>Verificación.</b> Este documento corresponde al folio {{ respuesta?.folio ?? 'sin folio' }} con huella SHA-256 <span class="mono">{{ hashCorto || '(no disponible)' }}</span>. La administración puede confirmar su autenticidad.</li>
            <li><b>Nota.</b> Documento informativo; las cuotas de administración no requieren factura electrónica (Concepto DIAN 106/2022).</li>
          </ol>
        </aside>

        <div class="firmas">
          <div class="firma">
            <div class="linea-firma"></div>
            <div class="rol-firma">Recibido por — Administración</div>
          </div>
          <div class="firma">
            <div class="linea-firma"></div>
            <div class="rol-firma">Entregado por — Propietario / Residente</div>
          </div>
        </div>

        <footer class="pie">
          <span class="mono">{{ respuesta?.folio ?? 'SIN-FOLIO' }} · SHA-256 {{ hashCorto || '—' }}</span>
          <span class="legal">{{ datos.tenant_nombre }} — administración transparente</span>
        </footer>
      </template>
    </main>

    <div class="toast" role="status" aria-live="polite" :class="{ visible: toastVisible }">
      {{ toastMensaje }}
    </div>
  </div>
</template>

<style scoped>
/* Paleta exclusivamente vía tokens.css (D-26) — mismos tokens que
 * comprobante-cuenta/[id].vue, del que este visor es un clon deliberado. */
.recibo {
  font-family: var(--font-sans);
  color: var(--color-neutral-900);
  background: var(--color-neutral-100);
  min-height: 100vh;
  padding: 40px 16px 72px;
}
.acciones {
  max-width: 640px;
  margin: 0 auto 16px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.acciones button {
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-brand-700);
  background: var(--color-neutral-50);
  border: 1px solid var(--color-neutral-200);
  padding: 9px 16px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.acciones button:hover {
  background: var(--color-brand-50);
  border-color: var(--color-brand-400);
}
.acciones button:focus-visible {
  outline: 2px solid var(--color-brand-500);
  outline-offset: 2px;
}
.hoja {
  max-width: 640px;
  margin: 0 auto;
  background: var(--color-neutral-50);
  border-radius: var(--radius-xl);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}
.mensaje {
  padding: 32px;
  color: var(--color-neutral-500);
  font-size: 14px;
}

.cabecera {
  background: var(--color-brand-800);
  color: var(--color-neutral-50);
  padding: 26px 34px;
}
.marca {
  display: flex;
  align-items: center;
  gap: 14px;
}
.monograma {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-lg);
  background: var(--color-brand-600);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 17px;
  letter-spacing: 0.02em;
}
.nombre {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  line-height: 1.15;
}
.nit {
  margin-top: 4px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-neutral-300);
}
.contacto {
  margin-top: 16px;
  font-size: 11.5px;
  color: var(--color-neutral-200);
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.contacto span:not(:last-child)::after {
  content: '·';
  margin-left: 10px;
  color: var(--color-neutral-400);
}

.titulo {
  padding: 20px 34px 16px;
  border-bottom: 1px solid var(--color-neutral-200);
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.titulo h1 {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  margin: 0;
  color: var(--color-brand-900);
}
.titulo p {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--color-neutral-500);
}
.corte-tag {
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--color-brand-800);
  background: var(--color-brand-100);
  padding: 5px 10px;
  border-radius: var(--radius-xs);
  white-space: nowrap;
}

.info {
  padding: 22px 34px 6px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 28px;
}
.info dl {
  margin: 0;
}
.fila {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--color-neutral-200);
  font-size: 13px;
}
.fila:last-child {
  border-bottom: none;
}
.fila dt {
  color: var(--color-neutral-500);
}
.fila dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
}
.mono dd {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
}

.monto-caja {
  margin: 20px 34px 0;
  padding: 18px;
  background: var(--color-brand-50);
  border: 1px solid var(--color-brand-200);
  border-radius: var(--radius-lg);
  text-align: center;
}
.monto-caja-etiqueta {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-brand-700);
  margin-bottom: 6px;
}
.monto-caja-letras {
  font-size: 14px;
  color: var(--color-brand-900);
  margin-bottom: 8px;
}
.monto-caja-cifra {
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 700;
  color: var(--color-brand-800);
  font-variant-numeric: tabular-nums;
}

.etiqueta-seccion {
  margin: 26px 34px 10px;
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-brand-700);
}

.tabla-marco {
  margin: 0 34px;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.scroll-x {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  min-width: 400px;
}
.visualmente-oculto {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
thead th {
  background: var(--color-brand-700);
  color: var(--color-neutral-50);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: left;
  padding: 9px 14px;
}
thead th.num {
  text-align: right;
}
tbody td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-neutral-200);
  vertical-align: top;
}
tbody tr:nth-child(even) td {
  background: var(--color-neutral-100);
}
.concepto {
  font-weight: 500;
}
td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.resumen {
  margin: 16px 34px 0;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.resumen-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 18px;
  background: var(--color-brand-50);
  font-size: 13px;
  font-weight: 700;
  color: var(--color-brand-800);
}
.total-monto {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.notas {
  margin: 22px 34px 0;
  padding: 15px 18px;
  background: var(--color-neutral-100);
  border-left: 3px solid var(--color-brand-400);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}
.notas ol {
  margin: 0;
  padding-left: 18px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--color-neutral-600);
}
.notas li {
  margin-bottom: 6px;
}
.notas li:last-child {
  margin-bottom: 0;
}
.notas b {
  color: var(--color-neutral-800);
}
.mono {
  font-variant-numeric: tabular-nums;
}

.firmas {
  display: flex;
  gap: 40px;
  margin: 30px 34px 0;
  padding-top: 18px;
}
.firma {
  flex: 1;
}
.linea-firma {
  border-top: 1px solid var(--color-neutral-900);
  margin-bottom: 6px;
}
.rol-firma {
  font-size: 11px;
  color: var(--color-neutral-500);
}

.pie {
  margin-top: 24px;
  padding: 14px 34px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 10px;
  color: var(--color-neutral-500);
  letter-spacing: 0.04em;
}
.legal {
  font-style: italic;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translate(-50%, 12px);
  background: var(--color-brand-900);
  color: var(--color-neutral-50);
  font-size: 13px;
  padding: 11px 20px;
  border-radius: var(--radius-md);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.22s ease, transform 0.22s ease;
  z-index: 20;
}
.toast.visible {
  opacity: 1;
  transform: translate(-50%, 0);
}

@media (max-width: 600px) {
  .recibo {
    padding: 20px 8px 48px;
  }
  .cabecera,
  .titulo,
  .info,
  .notas,
  .firmas,
  .pie {
    padding-left: 20px;
    padding-right: 20px;
  }
  .info {
    grid-template-columns: 1fr;
  }
  .resumen,
  .tabla-marco,
  .monto-caja {
    margin-left: 20px;
    margin-right: 20px;
  }
  .firmas {
    flex-direction: column;
    gap: 20px;
  }
  .acciones {
    justify-content: stretch;
  }
  .acciones button {
    flex: 1;
    justify-content: center;
  }
  .total-monto {
    font-size: 18px;
  }
}

@media print {
  .recibo {
    background: white;
    padding: 0;
    min-height: auto;
  }
  .acciones,
  .toast {
    display: none;
  }
  .hoja {
    box-shadow: none;
    border-radius: 0;
    max-width: 100%;
  }
}
</style>
