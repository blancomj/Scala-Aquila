<script setup lang="ts">
// GOB-9 §3.4 · Tablero de gobierno — una sola pantalla para administración y consejo, compuesta
// enteramente por gobierno_tablero_resumen() (un solo RPC, ver stores/gobiernoTablero.ts). No
// consulta ninguna tabla de otro corte directamente (prueba estructural 10).
definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const tenantStore = useTenantStore()
const tablero = useGobiernoTableroStore()

const SEMAFORO_COLOR: Record<string, 'error' | 'warning' | 'success' | 'neutral'> = {
  bloqueado: 'error', vencido: 'error', proximo_vencer: 'warning', en_plazo: 'success',
}

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await tablero.cargarResumen(tenantId)
}

onMounted(cargar)
watch(() => tenantStore.activeTenant?.id, cargar)

const slaVencidas = computed(() => tablero.resumen?.solicitudes_sla.find((s) => s.estado === 'vencida')?.cantidad ?? 0)
const slaProximas = computed(() => tablero.resumen?.solicitudes_sla.find((s) => s.estado === 'proxima')?.cantidad ?? 0)
const actasSinSuscribir = computed(() => tablero.resumen?.actas_pendientes.find((a) => a.concepto === 'sin_suscribir')?.cantidad ?? 0)
const actasSinDisposicion = computed(() => tablero.resumen?.actas_pendientes.find((a) => a.concepto === 'sin_disposicion')?.cantidad ?? 0)

// ── Informes de gestión (GOB-9 §3.5) — un solo cálculo servidor
// (gobierno_informe_gestion), dos exportaciones que solo cambian el rango de fechas y el título:
// asamblea = el período que elija quien exporta; consejo = el mes en curso, foco en lo pendiente.
// Mismo patrón pdfmake que gobierno/actas/[id].vue.
interface InformeGestion {
  periodo: { desde: string; hasta: string }
  decisiones: { id: string; titulo: string; fecha: string; ejecucion: { estado_ejecucion: string; porcentaje_avance: number } }[]
  compromisos: { titulo: string; responsable: string; estado: string; vencido: boolean }[]
  expedientes_convivencia: { id: string; etapa: string; estado_final: string | null; cerrado_at: string | null }[]
  solicitudes: { atendidas: number; abiertas: number }
  impugnaciones_en_tramite: { impugnacion_id: string; dias_restantes: number }[]
}

const exportandoInforme = ref<'asamblea' | 'consejo' | null>(null)
const errorInforme = ref<string | null>(null)

function rangoInforme(tipo: 'asamblea' | 'consejo'): { desde: string; hasta: string } {
  const hoy = new Date()
  if (tipo === 'consejo') {
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)
    return { desde: inicioMes, hasta: hoy.toISOString().slice(0, 10) }
  }
  const inicioAnio = new Date(hoy.getFullYear(), 0, 1).toISOString().slice(0, 10)
  return { desde: inicioAnio, hasta: hoy.toISOString().slice(0, 10) }
}

async function exportarInforme(tipo: 'asamblea' | 'consejo'): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  errorInforme.value = null
  exportandoInforme.value = tipo
  try {
    const { desde, hasta } = rangoInforme(tipo)
    const cliente = useSupabaseClient()
    const { data, error } = await cliente.rpc('gobierno_informe_gestion', { p_tenant_id: tenantId, p_desde: desde, p_hasta: hasta })
    if (error) throw error
    const informe = data as unknown as InformeGestion

    const pdfMake = (await import('pdfmake/build/pdfmake')).default
    const pdfFonts = (await import('pdfmake/build/vfs_fonts')).default as unknown as {
      pdfMake?: { vfs: Record<string, string> }; vfs?: Record<string, string>
    }
    pdfMake.vfs = pdfFonts.pdfMake?.vfs ?? pdfFonts.vfs ?? {}

    const titulo = tipo === 'asamblea' ? 'Informe de gestión para asamblea' : 'Informe mensual para consejo'
    const contenido: import('pdfmake/interfaces').Content[] = [
      { text: titulo, style: 'titulo' },
      { text: `Copropiedad: ${tenantStore.activeTenant?.name ?? ''}`, style: 'sub' },
      { text: `Período: ${informe.periodo.desde} a ${informe.periodo.hasta}`, style: 'sub' },
      { text: 'Decisiones y su ejecución', style: 'seccion' },
      informe.decisiones.length === 0
        ? { text: 'Sin decisiones en el período.', style: 'sub' }
        : {
            table: {
              headerRows: 1, widths: ['*', 'auto', 'auto'],
              body: [
                ['Título', 'Estado', 'Avance'],
                ...informe.decisiones.map((d) => [d.titulo, d.ejecucion.estado_ejecucion, `${String(d.ejecucion.porcentaje_avance)}%`]),
              ],
            },
          },
      { text: 'Compromisos', style: 'seccion' },
      informe.compromisos.length === 0
        ? { text: 'Sin compromisos activos.', style: 'sub' }
        : {
            table: {
              headerRows: 1, widths: ['*', 'auto', 'auto', 'auto'],
              body: [
                ['Título', 'Responsable', 'Estado', 'Vencido'],
                ...informe.compromisos.map((c) => [c.titulo, c.responsable, c.estado, c.vencido ? 'Sí' : 'No']),
              ],
            },
          },
      { text: 'Expedientes de convivencia resueltos', style: 'seccion' },
      { text: `${String(informe.expedientes_convivencia.filter((e) => e.cerrado_at !== null).length)} cerrados en el período.`, style: 'sub' },
      { text: 'Solicitudes', style: 'seccion' },
      { text: `Atendidas: ${String(informe.solicitudes.atendidas)} · Abiertas: ${String(informe.solicitudes.abiertas)}`, style: 'sub' },
      { text: 'Impugnaciones en trámite', style: 'seccion' },
      { text: `${String(informe.impugnaciones_en_tramite.length)} en trámite.`, style: 'sub' },
    ]
    pdfMake.createPdf({
      content: contenido,
      styles: {
        titulo: { fontSize: 16, bold: true, margin: [0, 0, 0, 8] },
        seccion: { fontSize: 11, bold: true, margin: [0, 10, 0, 4] },
        sub: { fontSize: 9, margin: [0, 0, 0, 2] },
      },
      footer: (paginaActual: number, totalPaginas: number) => ({
        text: `Página ${paginaActual} de ${totalPaginas}`, alignment: 'center', fontSize: 8,
      }),
    }).download(`informe-gobierno-${tipo}-${hasta}.pdf`)
  } catch (e) {
    errorInforme.value = mensajeError(e, 'No se pudo exportar el informe.')
  } finally {
    exportandoInforme.value = null
  }
}
</script>

<template>
  <div class="space-y-8">
    <UiTituloDescripcion clase-descripcion="text-sm text-muted mt-1 max-w-2xl">
      <template #titulo>
        <h1 class="text-xl font-semibold">Tablero de gobierno</h1>
      </template>
      <template #descripcion>
        Compromisos, decisiones, expedientes, solicitudes, actas e impugnaciones en un solo lugar —
        compuesto exclusivamente por lo que cada corte anterior ya expuso, sin automatismos que
        cambien ningún estado (GOB-9 §3.4).
      </template>
    </UiTituloDescripcion>

    <UAlert v-if="tablero.error" color="error" variant="soft" :title="tablero.error" />
    <UAlert v-if="errorInforme" color="error" variant="soft" :title="errorInforme" />

    <div class="flex gap-2">
      <UButton
        size="sm" variant="outline" :loading="exportandoInforme === 'asamblea'" :disabled="exportandoInforme !== null"
        @click="exportarInforme('asamblea')"
      >
        Exportar informe de gestión (asamblea)
      </UButton>
      <UButton
        size="sm" variant="outline" :loading="exportandoInforme === 'consejo'" :disabled="exportandoInforme !== null"
        @click="exportarInforme('consejo')"
      >
        Exportar informe mensual (consejo)
      </UButton>
    </div>

    <div v-if="tablero.resumen" class="space-y-8">
      <!-- ── alertas de órgano ─────────────────────────────────────────── -->
      <section v-if="tablero.resumen.alertas_organo.length > 0" class="rounded-lg border border-error/40 bg-error/5">
        <header class="px-4 py-2.5 border-b border-error/30">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-error">Alertas de órgano</h2>
        </header>
        <ul class="p-4 space-y-1 text-sm">
          <li v-for="(a, i) in tablero.resumen.alertas_organo" :key="i">{{ a.detalle }}</li>
        </ul>
      </section>

      <!-- ── compromisos y decisiones ──────────────────────────────────── -->
      <section class="rounded-lg border border-default">
        <header class="px-4 py-2.5 border-b border-default bg-muted/30">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-muted">Compromisos pendientes</h2>
        </header>
        <div class="p-4">
          <p v-if="tablero.resumen.compromisos.length === 0" class="text-sm text-muted">No hay compromisos pendientes.</p>
          <div v-else class="overflow-x-auto rounded-lg border border-default">
            <table class="w-full text-sm">
              <thead class="bg-muted/30">
                <tr><th class="p-2 text-left">Título</th><th class="p-2 text-left">Responsable</th><th class="p-2 text-left">Límite</th><th class="p-2 text-left">Vencido</th></tr>
              </thead>
              <tbody>
                <tr v-for="c in tablero.resumen.compromisos" :key="c.compromiso_id" class="border-t border-default">
                  <td class="p-2">{{ c.titulo }}</td>
                  <td class="p-2 text-muted">{{ c.responsable }}</td>
                  <td class="p-2 text-muted">{{ c.fecha_limite ?? '—' }}</td>
                  <td class="p-2"><UBadge :color="c.vencido ? 'error' : 'neutral'" variant="subtle" size="sm">{{ c.vencido ? 'Sí' : 'No' }}</UBadge></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="rounded-lg border border-default">
        <header class="px-4 py-2.5 border-b border-default bg-muted/30">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-muted">Decisiones</h2>
        </header>
        <div class="p-4">
          <p v-if="tablero.resumen.decisiones.length === 0" class="text-sm text-muted">No hay decisiones registradas.</p>
          <div v-else class="overflow-x-auto rounded-lg border border-default">
            <table class="w-full text-sm">
              <thead class="bg-muted/30">
                <tr><th class="p-2 text-left">Título</th><th class="p-2 text-left">Semáforo</th><th class="p-2 text-left">Sin compromisos</th></tr>
              </thead>
              <tbody>
                <tr v-for="d in tablero.resumen.decisiones" :key="d.decision_id" class="border-t border-default">
                  <td class="p-2">{{ d.titulo }}</td>
                  <td class="p-2"><UBadge :color="SEMAFORO_COLOR[d.semaforo] ?? 'neutral'" variant="subtle" size="sm">{{ d.semaforo }}</UBadge></td>
                  <td class="p-2 text-muted">{{ d.sin_compromisos ? 'Sí' : 'No' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ── expedientes, solicitudes, actas, impugnaciones ───────────── -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section class="rounded-lg border border-default">
          <header class="px-4 py-2.5 border-b border-default bg-muted/30">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-muted">Expedientes de convivencia detenidos</h2>
          </header>
          <div class="p-4">
            <p v-if="tablero.resumen.expedientes_detenidos.length === 0" class="text-sm text-muted">Ningún expediente abierto.</p>
            <ul v-else class="text-sm space-y-1">
              <li v-for="e in tablero.resumen.expedientes_detenidos" :key="e.expediente_id" class="flex justify-between">
                <span class="text-muted">{{ e.etapa }}</span><span class="font-medium">{{ e.dias_detenido }} días</span>
              </li>
            </ul>
          </div>
        </section>

        <section class="rounded-lg border border-default">
          <header class="px-4 py-2.5 border-b border-default bg-muted/30">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-muted">Solicitudes por SLA</h2>
          </header>
          <div class="p-4 grid grid-cols-2 gap-4 text-sm">
            <div><dt class="text-xs text-muted mb-0.5">Vencidas</dt><dd class="font-medium text-error">{{ slaVencidas }}</dd></div>
            <div><dt class="text-xs text-muted mb-0.5">Próximas</dt><dd class="font-medium text-warning">{{ slaProximas }}</dd></div>
          </div>
        </section>

        <section class="rounded-lg border border-default">
          <header class="px-4 py-2.5 border-b border-default bg-muted/30">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-muted">Actas</h2>
          </header>
          <div class="p-4 grid grid-cols-2 gap-4 text-sm">
            <div><dt class="text-xs text-muted mb-0.5">Sin suscribir</dt><dd class="font-medium">{{ actasSinSuscribir }}</dd></div>
            <div><dt class="text-xs text-muted mb-0.5">Sin disposición</dt><dd class="font-medium">{{ actasSinDisposicion }}</dd></div>
          </div>
        </section>

        <section class="rounded-lg border border-default">
          <header class="px-4 py-2.5 border-b border-default bg-muted/30">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-muted">Impugnaciones en trámite</h2>
          </header>
          <div class="p-4">
            <p v-if="tablero.resumen.impugnaciones_en_tramite.length === 0" class="text-sm text-muted">Ninguna impugnación en trámite.</p>
            <ul v-else class="text-sm space-y-1">
              <li v-for="i in tablero.resumen.impugnaciones_en_tramite" :key="i.impugnacion_id" class="flex justify-between">
                <span class="text-muted">Plazo {{ i.plazo_limite }}</span><span class="font-medium">{{ i.dias_restantes }} días</span>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
