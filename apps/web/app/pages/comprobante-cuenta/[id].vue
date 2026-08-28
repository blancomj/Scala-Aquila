<script setup lang="ts">
// Visor público del estado de cuenta — D-27/D-28 (Docs/evaluacion/13).
// Sin sesión por defecto (AD-26): el acceso anónimo exige el token HMAC `t`
// que mintió enviar-estado-cuenta; un miembro autenticado también puede
// abrirlo sin t (ver-estado-cuenta valida su membresía). Por eso
// `publico: true` (auth.global.ts lo exime) y layout 'blank'.
//
// La respuesta es un sobre { datos, folio, contenido_hash }:
//   · datos      — snapshot sellado a la fecha de corte (nunca datos vivos).
//   · folio      — identidad pública del documento (EDC-YYYYMM-NNNNNN).
//   · contenido_hash — SHA-256 del snapshot; se imprime como sello junto al
//     folio: cualquier tercero puede confirmar que este documento es
//     exactamente el expedido (papel incluido — sobrevive a @media print).
//
// El botón de pago permanece APAGADO hasta que existan pasarelas (punto 2):
// cuando llegue, será intención de pago server-side con token propio —
// jamás un monto en la URL (crítico §A.1 de la evaluación 13). Mientras,
// las notas apuntan a los canales tradicionales.
definePageMeta({ layout: 'blank', publico: true })

const route = useRoute()
const id = route.params.id as string
const tokenEnlace = computed(() => {
  const t = route.query.t
  return typeof t === 'string' && t.length > 0 ? t : undefined
})

const cliente = useSupabaseClient()

interface RespuestaEstadoCuenta {
  datos: EstadoCuentaDatos
  folio: string | null
  contenido_hash: string | null
  pago_habilitado?: boolean
}

const {
  data: respuesta,
  error: errorCarga,
  pending,
} = await useAsyncData(`estado-cuenta-${id}`, async () => {
  const { data, error: errorFuncion } = await cliente.functions.invoke<RespuestaEstadoCuenta>(
    'ver-estado-cuenta',
    { body: tokenEnlace.value ? { id, t: tokenEnlace.value } : { id } },
  )
  if (errorFuncion) {
    // createError(), no `new Error()` a secas: useAsyncData corre en SSR y un
    // Error normal pierde `.message` (propiedad no enumerable) al serializarse
    // en el payload hacia el cliente — el visor quedaba mostrando siempre el
    // mensaje genérico. NuxtError sí sobrevive esa frontera intacto.
    const err = await extraerErrorFuncion(errorFuncion)
    throw createError({ message: err.message, fatal: false })
  }
  if (!data) throw createError({ message: 'No se encontró el comprobante de cuenta.', fatal: false })
  return data
})

const datos = computed(() => respuesta.value?.datos ?? null)


function formatoFecha(iso: string): string {
  // Fecha contable del corte/movimiento — UTC fijo, no la zona del cliente.
  const d = new Date(iso)
  const dia = String(d.getUTCDate()).padStart(2, '0')
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${d.getUTCFullYear()}`
}

const totales = computed(() => {
  const movimientos = datos.value?.movimientos ?? []
  let cargos = 0
  let abonos = 0
  for (const m of movimientos) {
    cargos += m.cargo ?? 0
    abonos += m.abono ?? 0
  }
  return { cargos, abonos }
})

const saldoPendiente = computed(() => (datos.value?.saldo_final ?? 0) > 0)

// ── Pagar ahora (D-32, cierra D-28 punto 4) ─────────────────────────────
// Se enciende solo cuando el propio servidor (ver-estado-cuenta) confirma
// que el tenant tiene una pasarela activa — nunca una condición local. El
// monto NO se decide aquí: crear-intencion-pago lo calcula del lado del
// servidor a partir del saldo real (§5.3), el mismo criterio de "jamás un
// monto en la URL" que ya regía este visor.
const pagoHabilitado = computed(() => respuesta.value?.pago_habilitado === true && saldoPendiente.value)
const pagando = ref(false)
const errorPago = ref<string | null>(null)

async function pagarAhora(): Promise<void> {
  if (!tokenEnlace.value) {
    errorPago.value = 'Este enlace no tiene la firma necesaria para iniciar un pago. Pide uno nuevo a la administración.'
    return
  }
  pagando.value = true
  errorPago.value = null
  try {
    const { data, error: errorFuncion } = await cliente.functions.invoke<{
      resultado: { tipo: string; checkoutUrl?: string }
    }>('crear-intencion-pago', {
      body: { via: 'token', estado_cuenta_id: id, t: tokenEnlace.value, metodo: 'pse' },
    })
    if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
    if (data?.resultado.tipo === 'redirect' && data.resultado.checkoutUrl) {
      window.location.href = data.resultado.checkoutUrl
      return
    }
    throw new Error('La pasarela no devolvió un enlace de pago.')
  } catch (excepcion) {
    errorPago.value = mensajeError(excepcion, 'No se pudo iniciar el pago. Inténtalo de nuevo.')
  } finally {
    pagando.value = false
  }
}

// Solo presente en estados emitidos por liquidación (periodo concreto) — los
// generados a mano desde la ficha ("a hoy") no tienen periodo que mostrar.
const saldoAnterior = computed(() => datos.value?.saldo_anterior ?? 0)

const periodoTexto = computed(() => {
  const d = datos.value
  if (!d?.periodo_inicio || !d?.periodo_fin) return null
  return `${formatoFecha(d.periodo_inicio)} – ${formatoFecha(d.periodo_fin)}`
})

const fechaLimiteTexto = computed(() =>
  datos.value?.periodo_fecha_limite_pago ? formatoFecha(datos.value.periodo_fecha_limite_pago) : null,
)

const coeficienteTexto = computed(() => {
  const valor = datos.value?.inmueble_coeficiente
  return valor != null ? `${(valor * 100).toFixed(4)}%` : null
})

const ETIQUETA_TIPO_CUENTA: Record<string, string> = {
  ahorros: 'Cuenta de ahorros',
  corriente: 'Cuenta corriente',
  billetera: 'Billetera digital',
}

const canalesPagoTexto = computed(() => {
  const canales = datos.value?.canales_pago ?? []
  if (canales.length === 0) return null
  return canales
    .map((c) => `${ETIQUETA_TIPO_CUENTA[c.tipo_cuenta] ?? c.tipo_cuenta} No. ${c.numero_cuenta} — ${c.banco}`)
    .join('; ')
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

// ── Compartir ────────────────────────────────────────────────────────────────
// Texto genérico a propósito: NUNCA incluye el saldo (el documento se
// reenvía; el saldo es del destinatario, no de todo el chat).
const textoCompartir = computed(
  () =>
    `Estado de cuenta — ${datos.value?.tenant_nombre ?? ''}, inmueble ${datos.value?.inmueble_codigo ?? ''}, corte ${datos.value ? formatoFecha(datos.value.generado_en) : ''}`,
)
const toastVisible = ref(false)
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

const toastMensaje = ref('')
</script>

<template>
  <div class="estado-cuenta">
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
        <p class="mensaje">Cargando estado de cuenta…</p>
      </template>
      <template v-else-if="errorCarga || !datos">
        <p class="mensaje">
          {{ mensajeError(errorCarga, 'No se pudo cargar el estado de cuenta.') }}
        </p>
      </template>
      <template v-else>
        <!-- ENCABEZADO -->
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

        <!-- TÍTULO -->
        <div class="titulo">
          <div>
            <h1>Estado de cuenta</h1>
            <p>Liquidación de cuotas de administración</p>
          </div>
          <span class="corte-tag">CORTE {{ formatoFecha(datos.generado_en) }}</span>
        </div>

        <!-- DATOS -->
        <section class="info">
          <dl>
            <div class="fila">
              <dt>Propietario / Residente</dt>
              <dd>{{ datos.propietario_nombre ?? '—' }}</dd>
            </div>
            <div class="fila mono">
              <dt>Identificación</dt>
              <dd>{{ datos.propietario_documento_enmascarado ?? '—' }}</dd>
            </div>
            <div class="fila">
              <dt>Inmueble</dt>
              <dd>{{ datos.inmueble_codigo }}</dd>
            </div>
            <div v-if="coeficienteTexto" class="fila mono">
              <dt>Coeficiente</dt>
              <dd>{{ coeficienteTexto }}</dd>
            </div>
          </dl>
          <dl>
            <div class="fila mono">
              <dt>Folio del documento</dt>
              <dd>{{ respuesta?.folio ?? 'PREVIO-A-FOLIO' }}</dd>
            </div>
            <div class="fila mono">
              <dt>{{ periodoTexto ? 'Periodo facturado' : 'Expedición' }}</dt>
              <dd>{{ periodoTexto ?? formatoFecha(datos.generado_en) }}</dd>
            </div>
            <div v-if="fechaLimiteTexto" class="fila mono">
              <dt>Fecha límite de pago</dt>
              <dd>{{ fechaLimiteTexto }}</dd>
            </div>
            <div class="fila mono">
              <dt>No. de cuenta</dt>
              <dd>{{ datos.inmueble_codigo }}</dd>
            </div>
          </dl>
        </section>

        <!-- AVISO DE LA ADMINISTRACIÓN -->
        <div v-if="datos.mensaje_divulgacion" class="aviso">
          <p class="aviso-titulo">Aviso de la administración</p>
          <p class="aviso-cuerpo">{{ datos.mensaje_divulgacion }}</p>
        </div>

        <!-- RESUMEN -->
        <h2 class="etiqueta-seccion">Resumen del periodo</h2>
        <div class="resumen">
          <div class="resumen-fila">
            <span>Saldo anterior</span>
            <span class="monto">{{ formatoMoneda(saldoAnterior) }}</span>
          </div>
          <div class="resumen-fila">
            <span>(+) Cargos del periodo<span class="pista">Cuotas, intereses y multas facturadas</span></span>
            <span class="monto">{{ formatoMoneda(totales.cargos) }}</span>
          </div>
          <div class="resumen-fila">
            <span>(–) Abonos y pagos recibidos<span class="pista">Pagos aplicados durante el periodo</span></span>
            <span class="monto">{{ formatoMoneda(totales.abonos) }}</span>
          </div>
          <div class="resumen-total">
            <span>{{ saldoPendiente ? 'Saldo pendiente a la fecha de corte' : 'Sin saldo pendiente' }}<template v-if="(datos.saldo_final ?? 0) < 0"> · Saldo a tu favor</template></span>
            <span class="total-monto">{{ formatoMoneda(datos.saldo_final) }}</span>
          </div>
          <div v-if="pagoHabilitado" class="pagar-fila">
            <button type="button" class="pagar-boton" :disabled="pagando" @click="pagarAhora">
              {{ pagando ? 'Abriendo pasarela…' : 'Pagar ahora en línea' }}
            </button>
            <p v-if="errorPago" class="pagar-error">{{ errorPago }}</p>
          </div>
        </div>

        <!-- MOVIMIENTOS -->
        <h2 class="etiqueta-seccion">Detalle de movimientos</h2>
        <div class="tabla-marco">
          <div class="scroll-x">
            <table>
              <caption class="visualmente-oculto">
                Movimientos de cuenta corriente del inmueble {{ datos.inmueble_codigo }}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Concepto</th>
                  <th scope="col">Documento</th>
                  <th scope="col" class="num">Cargo</th>
                  <th scope="col" class="num">Abono</th>
                  <th scope="col" class="num">Saldo</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(m, i) in datos.movimientos" :key="i">
                  <td class="fecha">{{ formatoFecha(m.fecha) }}</td>
                  <td class="concepto">{{ m.descripcion }}</td>
                  <td class="documento">{{ m.documento ?? '—' }}</td>
                  <td class="num cargo">{{ m.cargo !== null ? formatoMoneda(m.cargo) : '—' }}</td>
                  <td class="num abono">{{ m.abono !== null ? formatoMoneda(m.abono) : '—' }}</td>
                  <td class="num saldo-col">{{ formatoMoneda(m.saldo) }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="3">Totales del periodo</td>
                  <td class="num">{{ formatoMoneda(totales.cargos) }}</td>
                  <td class="num">{{ formatoMoneda(totales.abonos) }}</td>
                  <td class="num">{{ formatoMoneda(datos.saldo_final) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <!-- NOTAS -->
        <aside class="notas">
          <ol>
            <li><b>Origen.</b> Liquidación conforme al reglamento de propiedad horizontal y al presupuesto aprobado por la asamblea.</li>
            <li><b>Canales de pago.</b> {{ canalesPagoTexto ?? 'Los canales vigentes los publica la administración; conserva tu soporte de pago.' }}</li>
            <li><b>Intereses de mora.</b> Los pagos posteriores al vencimiento se liquidan a la tasa máxima legal certificada por la Superintendencia Financiera.</li>
            <li><b>Reclamaciones.</b> Repórtalas dentro de los 5 días hábiles siguientes a la expedición, adjuntando el soporte de pago si aplica.</li>
            <li><b>Verificación.</b> Este documento corresponde al folio {{ respuesta?.folio ?? 'sin folio' }} con huella SHA-256 <span class="mono">{{ hashCorto || '(no disponible)' }}</span>. La administración puede confirmar su autenticidad.</li>
            <li><b>Nota.</b> Documento informativo; las cuotas de administración no requieren factura electrónica (Concepto DIAN 106/2022).</li>
          </ol>
        </aside>

        <div class="firmas">
          <div class="firma">
            <div class="linea-firma"></div>
            <div class="rol-firma">Administrador(a)</div>
          </div>
          <div class="firma">
            <div class="linea-firma"></div>
            <div class="rol-firma">Revisor Fiscal / Contador (si aplica)</div>
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
/* Paleta exclusivamente vía tokens.css (D-26) — este archivo ya no necesita
 * estar en el allowlist de hex del test-guardia. Tipografía: Inter /
 * Inter Tight (self-hosted). Sin fuentes externas: el documento renderiza
 * igual offline/impresso y no filtra aperturas a terceros. */
.estado-cuenta {
  font-family: var(--font-sans);
  color: var(--color-neutral-900);
  background: var(--color-neutral-100);
  min-height: 100vh;
  padding: 40px 16px 72px;
}
.acciones {
  max-width: 800px;
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
  max-width: 800px;
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

/* Cabecera */
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

/* Título */
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

/* Datos */
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

/* Aviso de la administración */
.aviso {
  margin: 20px 34px 0;
  padding: 14px 18px;
  background: var(--color-brand-50);
  border: 1px solid var(--color-brand-200);
  border-radius: var(--radius-lg);
}
.aviso-titulo {
  margin: 0 0 4px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-brand-800);
}
.aviso-cuerpo {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-brand-900);
  white-space: pre-wrap;
}

/* Secciones */
.etiqueta-seccion {
  margin: 26px 34px 10px;
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-brand-700);
}

/* Resumen */
.resumen {
  margin: 0 34px;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.resumen-fila {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 18px;
  font-size: 13px;
  border-bottom: 1px solid var(--color-neutral-200);
}
.monto {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
.pista {
  display: block;
  font-size: 11px;
  color: var(--color-neutral-400);
  font-weight: 400;
  margin-top: 2px;
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
  font-size: 24px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.pagar-fila {
  padding: 14px 18px 18px;
  background: var(--color-brand-50);
  border-top: 1px solid var(--color-neutral-200);
}
.pagar-boton {
  width: 100%;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-neutral-50);
  background: var(--color-brand-700);
  border: none;
  padding: 13px 18px;
  border-radius: var(--radius-md);
  cursor: pointer;
}
.pagar-boton:hover:not(:disabled) {
  background: var(--color-brand-800);
}
.pagar-boton:focus-visible {
  outline: 2px solid var(--color-brand-500);
  outline-offset: 2px;
}
.pagar-boton:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.pagar-error {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--ui-color-error-600);
}

/* Tabla */
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
  min-width: 560px;
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
.fecha {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  color: var(--color-neutral-500);
}
.documento {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  color: var(--color-neutral-500);
}
.concepto {
  font-weight: 500;
}
td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
td.cargo {
  color: var(--color-brand-800);
}
td.abono {
  color: var(--color-neutral-600);
}
td.saldo-col {
  font-weight: 600;
}
tfoot td {
  padding: 11px 14px;
  background: var(--color-neutral-100);
  border-top: 2px solid var(--color-brand-300);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
tfoot td.num {
  text-align: right;
}

/* Notas */
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

/* Firmas */
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

/* Pie */
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

/* Toast */
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
  .estado-cuenta {
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
  .aviso {
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
    font-size: 20px;
  }
}

@media print {
  .estado-cuenta {
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
  /* Folio y hash SÍ se imprimen — son el sello de autenticidad del papel. */
}
</style>
