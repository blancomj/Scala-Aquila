<script setup lang="ts">
// Informe de auditoría imprimible (PROMPT AUDITORÍA §44, §72-74) — mismo
// patrón que la certificación de deuda (/cartera/certificaciones/[id].vue):
// @media print + window.print(), sin librería de PDF, papel siempre claro.
//
// Es UN solo informe, no cuatro plantillas separadas por audiencia: el
// resumen ejecutivo (§44 "informe ejecutivo") es la primera sección, y el
// detalle técnico (§44 "informe técnico", §73 revisor fiscal) es el resto
// de la página — quien solo necesita el resumen simplemente no baja más.
// Separar en documentos distintos habría significado mantener la misma
// información dos veces; aquí es la misma fuente, presentada en orden de
// interés decreciente.
import type { Database } from '@aquila/shared'

type Engagement = Database['public']['Tables']['auditoria_engagements']['Row']
type Hallazgo = Database['public']['Tables']['auditoria_hallazgos']['Row']
type Accion = Database['public']['Tables']['auditoria_acciones']['Row']
type Ejecucion = Database['public']['Tables']['auditoria_ejecuciones']['Row']
type Riesgo = Database['public']['Tables']['auditoria_riesgos']['Row']
type Control = Database['public']['Tables']['auditoria_controles']['Row']

definePageMeta({ layout: 'blank', middleware: ['tenant', 'rbac'], permiso: 'audit:view' })

const route = useRoute()
const tenantStore = useTenantStore()
const auditoriaStore = useAuditoriaStore()
const membersStore = useMembersStore()

const engagementId = computed(() => String(route.params.id))

const engagement = ref<Engagement | null>(null)
const hallazgosEngagement = ref<Hallazgo[]>([])
const accionesPorHallazgo = ref<Map<string, Accion[]>>(new Map())
const ejecucionesEngagement = ref<Ejecucion[]>([])
const riesgosPorId = ref<Map<string, Riesgo>>(new Map())
const controlesPorId = ref<Map<string, Control>>(new Map())
const cargando = ref(false)
const errorCarga = ref<string | null>(null)

const NIVEL_ORDEN = ['CRITICO', 'ALTO', 'MEDIO', 'BAJO', 'OBSERVACION'] as const
const ETIQUETA_ESTADO_ENGAGEMENT: Record<string, string> = {
  BORRADOR: 'Borrador',
  PLANIFICADA: 'Planificada',
  EN_EJECUCION: 'En ejecución',
  EN_REVISION: 'En revisión',
  FINALIZADA: 'Finalizada',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
}
const ETIQUETA_ESTADO_HALLAZGO: Record<string, string> = {
  ABIERTO: 'Abierto',
  EN_REVISION: 'En revisión',
  EN_CORRECCION: 'En corrección',
  EN_VERIFICACION: 'En verificación',
  CERRADO: 'Cerrado',
  RECHAZADO: 'Rechazado',
}
const ETIQUETA_RESULTADO_EJECUCION: Record<string, string> = {
  PASS: 'Conforme',
  FAIL: 'Excepción',
  REVIEW: 'Para revisión',
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  cargando.value = true
  errorCarga.value = null
  try {
    const [engagements, hallazgos, ejecuciones, riesgos, controles] = await Promise.all([
      auditoriaStore.cargarEngagements(tenantId),
      auditoriaStore.cargarHallazgos(tenantId, engagementId.value),
      auditoriaStore.cargarEjecucionesPorEngagement(tenantId, engagementId.value),
      auditoriaStore.cargarRiesgos(tenantId),
      auditoriaStore.cargarControles(tenantId),
      membersStore.cargarMiembros(tenantId),
    ])

    const propio = engagements.find((e) => e.id === engagementId.value) ?? null
    if (!propio) {
      errorCarga.value = 'Auditoría no encontrada.'
      return
    }
    engagement.value = propio
    hallazgosEngagement.value = hallazgos
    ejecucionesEngagement.value = ejecuciones
    riesgosPorId.value = new Map(riesgos.map((r) => [r.id, r]))
    controlesPorId.value = new Map(controles.map((c) => [c.id, c]))

    const idsHallazgos = new Set(hallazgos.map((h) => h.id))
    const todasLasAcciones = await auditoriaStore.cargarAcciones(tenantId)
    const mapa = new Map<string, Accion[]>()
    for (const accion of todasLasAcciones) {
      if (!idsHallazgos.has(accion.hallazgo_id)) continue
      mapa.set(accion.hallazgo_id, [...(mapa.get(accion.hallazgo_id) ?? []), accion])
    }
    accionesPorHallazgo.value = mapa
  } catch (excepcion) {
    errorCarga.value = mensajeError(excepcion, 'No se pudo cargar el informe.')
  } finally {
    cargando.value = false
  }
}

onMounted(() => {
  void cargar()
})

const hallazgosOrdenados = computed(() =>
  [...hallazgosEngagement.value].sort(
    (a, b) => NIVEL_ORDEN.indexOf(a.nivel as (typeof NIVEL_ORDEN)[number]) - NIVEL_ORDEN.indexOf(b.nivel as (typeof NIVEL_ORDEN)[number]),
  ),
)

const conteoPorNivel = computed(() => {
  const mapa = new Map<string, number>()
  for (const h of hallazgosEngagement.value) mapa.set(h.nivel, (mapa.get(h.nivel) ?? 0) + 1)
  return NIVEL_ORDEN.map((nivel) => ({ nivel, cantidad: mapa.get(nivel) ?? 0 })).filter((n) => n.cantidad > 0)
})

const conteoPorEstadoHallazgo = computed(() => {
  const mapa = new Map<string, number>()
  for (const h of hallazgosEngagement.value) mapa.set(h.estado, (mapa.get(h.estado) ?? 0) + 1)
  return [...mapa.entries()].map(([estado, cantidad]) => ({ estado, cantidad }))
})

const conteoPorResultadoEjecucion = computed(() => {
  const mapa = new Map<string, number>()
  for (const e of ejecucionesEngagement.value) {
    const resultado = e.resultado ?? 'SIN_RESULTADO'
    mapa.set(resultado, (mapa.get(resultado) ?? 0) + 1)
  }
  return [...mapa.entries()].map(([resultado, cantidad]) => ({ resultado, cantidad }))
})

const totalAccionesVencidas = computed(() => {
  const hoy = new Date()
  let total = 0
  for (const lista of accionesPorHallazgo.value.values()) {
    for (const a of lista) {
      if (a.estado !== 'CERRADA' && a.estado !== 'RECHAZADA' && a.fecha_compromiso && new Date(a.fecha_compromiso) < hoy) {
        total += 1
      }
    }
  }
  return total
})

function nombrePorId(id: string | null): string {
  if (!id) return '—'
  return membersStore.miembros.find((m) => m.user_id === id)?.profile?.full_name ?? id
}

function fecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
}

function imprimir(): void {
  window.print()
}
</script>

<template>
  <div class="informe">
    <div class="acciones">
      <NuxtLink to="/auditoria" class="volver">← Volver a auditoría</NuxtLink>
      <button type="button" :disabled="cargando || engagement === null" @click="imprimir">
        Imprimir / Guardar PDF
      </button>
    </div>

    <p v-if="cargando" class="mensaje">Cargando informe…</p>
    <p v-else-if="errorCarga" class="mensaje error">{{ errorCarga }}</p>

    <div v-else-if="engagement" class="hoja">
      <header class="portada">
        <div class="portada-linea">
          <h1>Informe de auditoría</h1>
          <span class="estado">{{ ETIQUETA_ESTADO_ENGAGEMENT[engagement.estado] ?? engagement.estado }}</span>
        </div>
        <p class="copropiedad">
          {{ tenantStore.activeTenant?.name ?? '—' }}
          <span v-if="tenantStore.activeTenant?.nit">· NIT {{ tenantStore.activeTenant.nit }}</span>
        </p>
        <p class="corte">
          <strong>{{ engagement.nombre }}</strong>
          <template v-if="engagement.periodo"> · período {{ engagement.periodo }}</template>
          <template v-if="engagement.tipo"> · {{ engagement.tipo }}</template>
        </p>
      </header>

      <section>
        <h2>Resumen ejecutivo</h2>
        <dl class="datos">
          <dt>Objetivo</dt>
          <dd>{{ engagement.objetivo ?? 'No registrado.' }}</dd>
          <dt>Alcance</dt>
          <dd>{{ engagement.alcance ?? 'No registrado.' }}</dd>
          <dt>Responsable</dt>
          <dd>{{ nombrePorId(engagement.responsable) }}</dd>
          <dt>Fechas</dt>
          <dd>{{ fecha(engagement.fecha_inicio) }} — {{ fecha(engagement.fecha_fin) }}</dd>
        </dl>

        <table>
          <thead>
            <tr><th>Hallazgos por severidad</th><th class="num">Cantidad</th></tr>
          </thead>
          <tbody>
            <tr v-for="fila in conteoPorNivel" :key="fila.nivel">
              <td>{{ fila.nivel }}</td>
              <td class="num">{{ fila.cantidad }}</td>
            </tr>
            <tr v-if="conteoPorNivel.length === 0">
              <td colspan="2" class="vacio">Sin hallazgos en esta auditoría.</td>
            </tr>
          </tbody>
        </table>

        <div class="resumen-grid">
          <div v-for="fila in conteoPorEstadoHallazgo" :key="fila.estado" class="resumen-item">
            <span class="resumen-valor">{{ fila.cantidad }}</span>
            <span class="resumen-etiqueta">{{ ETIQUETA_ESTADO_HALLAZGO[fila.estado] ?? fila.estado }}</span>
          </div>
          <div v-for="fila in conteoPorResultadoEjecucion" :key="fila.resultado" class="resumen-item">
            <span class="resumen-valor">{{ fila.cantidad }}</span>
            <span class="resumen-etiqueta">{{ ETIQUETA_RESULTADO_EJECUCION[fila.resultado] ?? fila.resultado }} (pruebas)</span>
          </div>
          <div class="resumen-item" :class="{ 'resumen-alerta': totalAccionesVencidas > 0 }">
            <span class="resumen-valor">{{ totalAccionesVencidas }}</span>
            <span class="resumen-etiqueta">Acciones vencidas</span>
          </div>
        </div>
      </section>

      <section>
        <h2>Metodología</h2>
        <p class="nota">
          Auditoría basada en riesgos: identificación de riesgo, control asociado, prueba (manual o
          automática mediante Continuous Control Monitoring), evidencia, resultado y hallazgo, con
          seguimiento hasta el cierre. Marco metodológico de referencia: Global Internal Audit
          Standards del IIA (2024). Este informe documenta el trabajo realizado dentro de AQUILA y
          no constituye una opinión de aseguramiento profesional — no sustituye al revisor fiscal,
          auditor externo o asesor profesional que corresponda.
        </p>
      </section>

      <section v-if="hallazgosOrdenados.length > 0">
        <h2>Hallazgos</h2>
        <div v-for="hallazgo in hallazgosOrdenados" :key="hallazgo.id" class="hallazgo">
          <div class="hallazgo-cabecera">
            <span class="badge-nivel" :class="`nivel-${hallazgo.nivel.toLowerCase()}`">{{ hallazgo.nivel }}</span>
            <strong>{{ hallazgo.proceso }}</strong>
            <span class="hallazgo-estado">{{ ETIQUETA_ESTADO_HALLAZGO[hallazgo.estado] ?? hallazgo.estado }}</span>
          </div>
          <dl class="datos datos-hallazgo">
            <template v-if="hallazgo.riesgo_id && riesgosPorId.get(hallazgo.riesgo_id)">
              <dt>Riesgo</dt>
              <dd>
                {{ riesgosPorId.get(hallazgo.riesgo_id)!.nombre }}
                <span v-if="hallazgo.riesgo_version_utilizada"> (versión {{ hallazgo.riesgo_version_utilizada }})</span>
              </dd>
            </template>
            <template v-if="hallazgo.control_id && controlesPorId.get(hallazgo.control_id)">
              <dt>Control</dt>
              <dd>{{ controlesPorId.get(hallazgo.control_id)!.nombre }} (automático)</dd>
            </template>
            <dt>Criterio</dt>
            <dd>{{ hallazgo.criterio ?? '—' }}</dd>
            <dt>Condición</dt>
            <dd>{{ hallazgo.condicion ?? '—' }}</dd>
            <dt v-if="hallazgo.causa">Causa</dt>
            <dd v-if="hallazgo.causa">
              {{ hallazgo.causa }}
              <span v-if="hallazgo.causa_raiz"> ({{ hallazgo.causa_raiz }})</span>
            </dd>
            <dt v-if="hallazgo.efecto">Efecto</dt>
            <dd v-if="hallazgo.efecto">{{ hallazgo.efecto }}</dd>
            <dt>Recomendación</dt>
            <dd>{{ hallazgo.recomendacion ?? '—' }}</dd>
            <dt>Responsable</dt>
            <dd>{{ nombrePorId(hallazgo.responsable) }}</dd>
          </dl>

          <table v-if="(accionesPorHallazgo.get(hallazgo.id)?.length ?? 0) > 0" class="tabla-acciones">
            <thead>
              <tr><th>Acción</th><th>Responsable</th><th>Compromiso</th><th>Estado</th></tr>
            </thead>
            <tbody>
              <tr v-for="accion in accionesPorHallazgo.get(hallazgo.id)" :key="accion.id">
                <td>{{ accion.accion }}</td>
                <td>{{ nombrePorId(accion.responsable) }}</td>
                <td>{{ fecha(accion.fecha_compromiso) }}</td>
                <td>{{ accion.estado.replace('_', ' ') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section v-else>
        <h2>Hallazgos</h2>
        <p class="vacio">Sin hallazgos registrados en esta auditoría.</p>
      </section>

      <section>
        <h2>Conclusión</h2>
        <p>{{ engagement.conclusion ?? 'Sin conclusión registrada — auditoría en curso.' }}</p>
      </section>

      <footer class="pie">
        Informe generado el {{ fecha(new Date().toISOString()) }} · auditoría {{ engagement.id }}
      </footer>
    </div>
  </div>
</template>

<style scoped>
.informe {
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
  color: var(--color-brand-600);
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

.datos {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 4px 16px;
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

.nota {
  color: var(--color-neutral-600);
  margin: 8px 0 0;
}

.vacio {
  color: var(--color-neutral-400);
  font-style: italic;
}

.resumen-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 12px;
}

.resumen-item {
  display: flex;
  flex-direction: column;
  min-width: 90px;
}

.resumen-item.resumen-alerta .resumen-valor {
  color: var(--ui-color-error-600);
}

.resumen-valor {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.resumen-etiqueta {
  font-size: 11px;
  color: var(--color-neutral-600);
}

.hallazgo {
  border: 1px solid var(--color-neutral-200);
  border-radius: 6px;
  padding: 12px 14px;
  margin-bottom: 14px;
  break-inside: avoid;
}

.hallazgo-cabecera {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.hallazgo-estado {
  margin-left: auto;
  font-size: 11px;
  color: var(--color-neutral-600);
  text-transform: uppercase;
}

.badge-nivel {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 3px;
  color: white;
}

.nivel-critico { background: var(--ui-color-error-600); }
.nivel-alto { background: var(--ui-color-warning-600); }
.nivel-medio { background: var(--color-neutral-600); }
.nivel-bajo { background: var(--ui-color-success-600); }
.nivel-observacion { background: var(--color-neutral-600); }

.datos-hallazgo {
  grid-template-columns: 110px 1fr;
  font-size: 12px;
}

.tabla-acciones {
  margin-top: 8px;
  font-size: 12px;
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
  .informe {
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
