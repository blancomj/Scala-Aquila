<script setup lang="ts">
// GOB-4 §4.7: vista en dos columnas (secciones generadas en solo lectura + narrativa editable),
// semáforo de completitud del contenido mínimo (art. 47), contador de días hábiles restantes,
// flujo de suscripción con confirmación de ambos firmantes, registro de entregas de copia.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'default', middleware: ['tenant', 'rbac'], permiso: 'data:read' })

const route = useRoute()
const actaId = route.params.id as string
const tenantStore = useTenantStore()
const actasStore = useGobiernoActasStore()
const documentosStore = useDocumentosStore()
const tercerosStore = useTercerosStore()

interface ReunionResumen {
  fecha_hora: string
  organo: { nombre: string | null; tipo: { nombre: string } | null } | null
  tipo: { nombre: string } | null
}
const reunion = ref<ReunionResumen | null>(null)
const diasHabilesRestantes = ref<number | null>(null)
const error = ref<string | null>(null)

async function cargar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await actasStore.cargarActa(actaId)
  const acta = actasStore.acta
  if (!acta) return
  const cliente = useSupabaseClient<Database>()
  const { data } = await cliente
    .from('gobierno_reuniones')
    .select('fecha_hora, organo:organo_id(nombre, tipo:tipo_id(nombre)), tipo:tipo_id(nombre)')
    .eq('id', acta.reunion_id)
    .single<ReunionResumen>()
  reunion.value = data
  diasHabilesRestantes.value = await actasStore.diasHabilesRestantes(acta.plazo_disposicion_limite)
  await tercerosStore.cargarTerceros(tenantId)
}
onMounted(cargar)
onUnmounted(() => actasStore.limpiar())

const estadoColor: Record<string, 'neutral' | 'primary' | 'success' | 'error'> = {
  borrador: 'neutral', en_verificacion: 'primary', suscrita: 'success', publicada: 'success',
}

// ── Semáforo de completitud (art. 47) ────────────────────────────────────
const completitud = computed(() => {
  const contenido = actasStore.acta?.contenido_generado
  return [
    { etiqueta: 'Orden del día', ok: (contenido?.orden_del_dia.length ?? 0) > 0, articulo: 'art. 47' },
    { etiqueta: 'Lista de asistentes', ok: (contenido?.asistentes.length ?? 0) > 0, articulo: 'art. 47' },
  ]
})
const contenidoCompleto = computed(() => completitud.value.every((i) => i.ok))

// ── Narrativa ─────────────────────────────────────────────────────────────
const narrativaLocal = ref('')
watch(() => actasStore.acta?.narrativa, (v) => { narrativaLocal.value = v ?? '' }, { immediate: true })
const editable = computed(() => actasStore.acta && !['suscrita', 'publicada'].includes(actasStore.acta.estado))
async function guardarNarrativa(): Promise<void> {
  const acta = actasStore.acta
  if (!acta) return
  error.value = null
  try {
    await actasStore.actualizarNarrativa(acta.id, narrativaLocal.value)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar la narrativa.')
  }
}

// ── Regenerar ─────────────────────────────────────────────────────────────
async function regenerar(): Promise<void> {
  const acta = actasStore.acta
  if (!acta) return
  error.value = null
  try {
    await actasStore.generarActa(acta.reunion_id)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo regenerar el acta.')
  }
}

// ── Comisión verificadora ────────────────────────────────────────────────
const drawerVerificadorAbierto = ref(false)
const formVerificador = reactive({ terceroId: null as string | null, plazoLimite: '' })
const opcionesTercero = computed(() =>
  tercerosStore.terceros.map((t) => ({ valor: t.id, etiqueta: `${t.nombre_completo} · ${t.numero_documento}` })),
)
function abrirVerificador(): void {
  formVerificador.terceroId = null
  formVerificador.plazoLimite = actasStore.acta?.plazo_disposicion_limite ?? ''
  drawerVerificadorAbierto.value = true
}
async function guardarVerificador(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const acta = actasStore.acta
  if (!tenantId || !acta || !formVerificador.terceroId || !formVerificador.plazoLimite) return
  error.value = null
  try {
    await actasStore.designarVerificador(tenantId, acta.id, formVerificador.terceroId, formVerificador.plazoLimite)
    drawerVerificadorAbierto.value = false
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo designar el verificador.')
  }
}
const observacionesVerificacion = ref<Record<string, string>>({})
async function marcarVerificado(id: string): Promise<void> {
  const acta = actasStore.acta
  if (!acta) return
  error.value = null
  try {
    await actasStore.marcarVerificado(id, acta.id, observacionesVerificacion.value[id] ?? null)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo marcar la verificación.')
  }
}

// ── Suscripción ──────────────────────────────────────────────────────────
const drawerSuscribirAbierto = ref(false)
async function suscribir(): Promise<void> {
  const acta = actasStore.acta
  if (!acta) return
  error.value = null
  try {
    await actasStore.suscribirActa(acta.id, acta.presidente_miembro_id, acta.secretario_miembro_id)
    drawerSuscribirAbierto.value = false
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo suscribir el acta.')
  }
}

// ── Exportar PDF (para imprimir y firmar) ─────────────────────────────────
const exportando = ref(false)
async function exportarPdf(): Promise<void> {
  const acta = actasStore.acta
  if (!acta) return
  exportando.value = true
  try {
    const pdfMake = (await import('pdfmake/build/pdfmake')).default
    const pdfFonts = (await import('pdfmake/build/vfs_fonts')).default as unknown as {
      pdfMake?: { vfs: Record<string, string> }; vfs?: Record<string, string>
    }
    pdfMake.vfs = pdfFonts.pdfMake?.vfs ?? pdfFonts.vfs ?? {}
    const c = acta.contenido_generado
    const contenido: import('pdfmake/interfaces').Content[] = [
      { text: `Acta ${acta.numero ? `N.° ${acta.numero} de ${acta.anio}` : '(borrador)'}`, style: 'titulo' },
      { text: `Copropiedad: ${tenantStore.activeTenant?.name ?? ''}`, style: 'sub' },
      { text: `${reunion.value?.organo?.nombre ?? ''} · ${reunion.value?.tipo?.nombre ?? ''} · ${c.caracter.caracter ?? ''}`, style: 'sub' },
      { text: `Convocatoria: ${c.convocatoria.regimen}`, style: 'sub' },
      { text: 'Orden del día', style: 'seccion' },
      { ol: c.orden_del_dia.map((p) => p.titulo) },
      { text: 'Asistentes', style: 'seccion' },
      {
        table: {
          headerRows: 1, widths: ['*', 'auto', 'auto', 'auto'],
          body: [
            ['Nombre', 'Calidad', 'Unidad', 'Coeficiente'],
            ...c.asistentes.map((a) => [a.nombre, a.calidad, a.inmueble_codigo ?? '—', String(a.coeficiente)]),
          ],
        },
      },
      { text: 'Votaciones', style: 'seccion' },
      ...c.votaciones.map((v): import('pdfmake/interfaces').Content => ({
        text: `${v.pregunta} (${v.materia}) — ${v.resultado ?? v.estado}: favor ${v.favor}, contra ${v.contra}, abstención ${v.abstencion}`,
        style: 'sub',
      })),
      { text: 'Constancias y proposiciones', style: 'seccion' },
      { text: acta.narrativa ?? '—', style: 'sub' },
      { text: `Hash: ${acta.hash_contenido ?? '(sin suscribir)'}`, style: 'sub', margin: [0, 12, 0, 0] },
      { text: 'Firma del presidente: ______________________', margin: [0, 24, 0, 4] },
      { text: 'Firma del secretario: ______________________', margin: [0, 4, 0, 0] },
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
    }).download(`acta-${acta.numero ?? 'borrador'}-${acta.anio}.pdf`)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo exportar el PDF.')
  } finally {
    exportando.value = false
  }
}

// ── Subir el PDF firmado (escaneo) y vincularlo ───────────────────────────
const archivoFirmado = ref<File | null>(null)
async function subirFirmado(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const acta = actasStore.acta
  const archivo = archivoFirmado.value
  if (!tenantId || !acta || !archivo) return
  error.value = null
  try {
    const tipoDocumentoId = await cargarListaTipos(tenantId, 'TIPO_DOCUMENTO').then(
      (tipos) => tipos.find((t) => t.codigo === 'acta_asamblea')?.id,
    )
    if (!tipoDocumentoId) throw new Error('Falta el tipo de documento acta_asamblea.')
    const documento = await documentosStore.subirDocumento({
      tenantId, inmuebleId: null, tipoDocumentoId, archivo,
    })
    if (!documento.id) throw new Error('El documento subido no devolvió un id.')
    await actasStore.vincularDocumento(acta.id, documento.id)
    archivoFirmado.value = null
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo subir el PDF firmado.')
  }
}

// ── Derecho a copia ──────────────────────────────────────────────────────
const enlaceGenerado = ref<{ token: string; expira_en: string } | null>(null)
async function generarEnlace(): Promise<void> {
  const documentoId = actasStore.acta?.documento_id
  if (!documentoId) return
  error.value = null
  try {
    enlaceGenerado.value = await actasStore.generarEnlaceConsulta(documentoId)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo generar el enlace.')
  }
}
const solicitanteEntrega = ref<string | null>(null)
async function registrarEntrega(tipo: 'solicitud' | 'entrega'): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const acta = actasStore.acta
  if (!tenantId || !acta) return
  error.value = null
  try {
    await actasStore.registrarEntrega(tenantId, acta.id, tipo, { solicitanteRef: solicitanteEntrega.value })
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar la entrega.')
  }
}
const motivoNegativa = ref('')
async function registrarNegativa(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  const acta = actasStore.acta
  if (!tenantId || !acta || !motivoNegativa.value.trim()) return
  error.value = null
  try {
    await actasStore.registrarEntrega(tenantId, acta.id, 'negativa', {
      solicitanteRef: solicitanteEntrega.value, motivoNegativa: motivoNegativa.value.trim(),
    })
    motivoNegativa.value = ''
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar la negativa.')
  }
}
</script>

<template>
  <div class="space-y-6">
    <div v-if="actasStore.acta" class="space-y-6">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-xl font-semibold">
            Acta {{ actasStore.acta.numero ? `N.° ${actasStore.acta.numero} de ${actasStore.acta.anio}` : '(borrador)' }}
          </h1>
          <p class="text-sm text-muted">
            {{ reunion?.organo?.nombre || reunion?.organo?.tipo?.nombre }} · {{ reunion?.tipo?.nombre }} · {{ reunion?.fecha_hora }}
          </p>
        </div>
        <UBadge :color="estadoColor[actasStore.acta.estado] ?? 'neutral'" variant="soft" size="lg">
          {{ actasStore.acta.estado }}
        </UBadge>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" />

      <!-- Semáforo de completitud -->
      <section class="rounded-lg border border-default p-4 space-y-2">
        <p class="font-medium">Contenido mínimo (Ley 675 art. 47)</p>
        <ul class="space-y-1 text-sm">
          <li v-for="item in completitud" :key="item.etiqueta" class="flex items-center gap-2">
            <UIcon :name="item.ok ? 'i-lucide-check-circle' : 'i-lucide-alert-circle'" :class="item.ok ? 'text-success' : 'text-error'" />
            {{ item.etiqueta }} <span class="text-muted">({{ item.articulo }})</span>
          </li>
        </ul>
        <p class="text-xs text-muted">
          Plazo de disposición: {{ actasStore.acta.plazo_disposicion_limite }}
          <span v-if="diasHabilesRestantes !== null">
            ({{ diasHabilesRestantes >= 0 ? `${diasHabilesRestantes} días hábiles restantes` : `vencido hace ${-diasHabilesRestantes} días hábiles` }})
          </span>
        </p>
        <UButton v-if="editable" size="xs" variant="ghost" icon="i-lucide-refresh-cw" @click="regenerar()">
          Regenerar desde los datos actuales
        </UButton>
      </section>

      <div class="grid gap-6 lg:grid-cols-2">
        <!-- Secciones generadas (solo lectura) -->
        <section class="rounded-lg border border-default p-4 space-y-3">
          <p class="font-medium">Contenido generado</p>
          <div class="text-sm space-y-3">
            <div>
              <p class="text-xs font-medium text-muted uppercase">Carácter y convocatoria</p>
              <p>{{ actasStore.acta.contenido_generado.caracter.nombre }} ({{ actasStore.acta.contenido_generado.caracter.caracter }})</p>
              <p class="text-muted">Convocatoria: {{ actasStore.acta.contenido_generado.convocatoria.regimen }}</p>
            </div>
            <div>
              <p class="text-xs font-medium text-muted uppercase">Orden del día</p>
              <ol class="list-decimal list-inside">
                <li v-for="p in actasStore.acta.contenido_generado.orden_del_dia" :key="p.orden">{{ p.titulo }}</li>
              </ol>
            </div>
            <div>
              <p class="text-xs font-medium text-muted uppercase">
                Asistentes ({{ actasStore.acta.contenido_generado.asistentes.length }})
              </p>
              <ul>
                <li v-for="(a, i) in actasStore.acta.contenido_generado.asistentes" :key="i">
                  {{ a.nombre }} · {{ a.calidad }} · {{ a.inmueble_codigo ?? '—' }} · {{ a.coeficiente }}
                </li>
              </ul>
            </div>
            <div v-if="actasStore.acta.contenido_generado.poderes.length > 0">
              <p class="text-xs font-medium text-muted uppercase">Poderes</p>
              <ul>
                <li v-for="(p, i) in actasStore.acta.contenido_generado.poderes" :key="i">
                  {{ p.inmueble_codigo }} · {{ p.otorgante }} → {{ p.apoderado }} · {{ p.validado ? 'validado' : 'sin validar' }}
                </li>
              </ul>
            </div>
            <div>
              <p class="text-xs font-medium text-muted uppercase">Quórum al instalar</p>
              <p>
                {{ actasStore.acta.contenido_generado.quorum.coeficiente_presente }}
                / {{ actasStore.acta.contenido_generado.quorum.coeficiente_total }}
                ({{ actasStore.acta.contenido_generado.quorum.quorum_deliberatorio ? 'con quórum' : 'sin quórum' }})
              </p>
            </div>
            <div v-if="actasStore.acta.contenido_generado.votaciones.length > 0">
              <p class="text-xs font-medium text-muted uppercase">Votaciones</p>
              <ul class="space-y-1">
                <li v-for="(v, i) in actasStore.acta.contenido_generado.votaciones" :key="i">
                  {{ v.pregunta }} ({{ v.materia }}) — {{ v.resultado ?? v.estado }}
                  · favor {{ v.favor }} · contra {{ v.contra }} · abstención {{ v.abstencion }}
                  <ul v-if="v.votos_nominales.length > 0" class="ml-4 text-xs text-muted">
                    <li v-for="(voto, j) in v.votos_nominales" :key="j">
                      {{ voto.inmueble_codigo ?? '—' }} · {{ voto.nombre }} · {{ voto.sentido }} · {{ voto.coeficiente }}
                    </li>
                  </ul>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <!-- Narrativa editable -->
        <section class="rounded-lg border border-default p-4 space-y-3">
          <p class="font-medium">Constancias y proposiciones</p>
          <UTextarea v-model="narrativaLocal" :disabled="!editable" :rows="14" class="w-full" />
          <UButton v-if="editable" size="xs" :loading="actasStore.guardando" @click="guardarNarrativa()">
            Guardar narrativa
          </UButton>
        </section>
      </div>

      <!-- Comisión verificadora -->
      <section class="rounded-lg border border-default p-4 space-y-2">
        <div class="flex items-center justify-between">
          <p class="font-medium">Comisión verificadora (opcional)</p>
          <UButton v-if="editable" size="xs" variant="ghost" icon="i-lucide-plus" @click="abrirVerificador()">
            Designar verificador
          </UButton>
        </div>
        <ul class="space-y-1 text-sm">
          <li v-for="v in actasStore.verificadores" :key="v.id" class="flex items-center justify-between gap-2">
            <span>
              {{ v.tercero?.nombre_completo }} · plazo {{ v.plazo_limite }}
              <UBadge size="xs" :color="v.verificado_at ? 'success' : 'neutral'" variant="soft" class="ml-1">
                {{ v.verificado_at ? 'verificado' : 'pendiente' }}
              </UBadge>
            </span>
            <div v-if="!v.verificado_at" class="flex items-center gap-1">
              <UInput v-model="observacionesVerificacion[v.id]" placeholder="observaciones" size="xs" />
              <UButton size="xs" variant="ghost" @click="marcarVerificado(v.id)">Marcar verificado</UButton>
            </div>
          </li>
        </ul>
        <p v-if="actasStore.verificadores.length === 0" class="text-sm text-muted">Sin comisión designada.</p>
      </section>

      <!-- Suscripción -->
      <section v-if="editable" class="rounded-lg border border-default p-4">
        <UButton
          :loading="actasStore.guardando" :disabled="!contenidoCompleto"
          @click="drawerSuscribirAbierto = true"
        >
          Suscribir acta
        </UButton>
        <p v-if="!contenidoCompleto" class="text-xs text-error mt-1">
          Falta contenido obligatorio del art. 47 — completa las secciones marcadas arriba.
        </p>
      </section>

      <!-- Exportación y firma -->
      <section class="rounded-lg border border-default p-4 space-y-3">
        <p class="font-medium">Exportación y firma</p>
        <UButton size="xs" variant="ghost" icon="i-lucide-file-down" :loading="exportando" @click="exportarPdf()">
          Exportar PDF (para imprimir y firmar)
        </UButton>
        <div v-if="actasStore.acta.estado !== 'borrador'" class="flex items-end gap-2">
          <UFormField label="Subir el PDF firmado (escaneo)">
            <input type="file" accept="application/pdf" @change="(e) => (archivoFirmado = (e.target as HTMLInputElement).files?.[0] ?? null)">
          </UFormField>
          <UButton size="xs" :loading="documentosStore.subiendo" :disabled="!archivoFirmado" @click="subirFirmado()">
            Subir y vincular
          </UButton>
        </div>
        <p v-if="actasStore.acta.hash_contenido" class="text-xs text-muted">Hash: {{ actasStore.acta.hash_contenido }}</p>
      </section>

      <!-- Derecho a copia -->
      <section v-if="actasStore.acta.documento_id" class="rounded-lg border border-default p-4 space-y-3">
        <p class="font-medium">Derecho a copia</p>
        <div class="flex items-end gap-2 flex-wrap">
          <UFormField label="Solicitante (opcional)">
            <UiSelectorBuscable v-model="solicitanteEntrega" :opciones="opcionesTercero" placeholder="Tercero" />
          </UFormField>
          <UButton size="xs" variant="ghost" @click="registrarEntrega('solicitud')">Registrar solicitud</UButton>
          <UButton size="xs" @click="generarEnlace()">Generar enlace de consulta</UButton>
          <UButton size="xs" variant="ghost" @click="registrarEntrega('entrega')">Registrar entrega</UButton>
        </div>
        <p v-if="enlaceGenerado" class="text-xs text-muted">
          Enlace válido hasta {{ enlaceGenerado.expira_en }} — token: {{ enlaceGenerado.token.slice(0, 12) }}…
        </p>
        <div class="flex items-end gap-2">
          <UFormField label="Motivo de negativa">
            <UInput v-model="motivoNegativa" size="sm" />
          </UFormField>
          <UButton size="xs" variant="ghost" color="error" :disabled="!motivoNegativa.trim()" @click="registrarNegativa()">
            Registrar negativa
          </UButton>
        </div>
        <ul class="space-y-1 text-xs text-muted">
          <li v-for="ent in actasStore.entregas" :key="ent.id">
            {{ ent.tipo }} · {{ ent.fecha }} · {{ ent.solicitante?.nombre_completo ?? 'anónimo' }}
            <span v-if="ent.motivo_negativa"> · {{ ent.motivo_negativa }}</span>
          </li>
        </ul>
      </section>
    </div>
    <p v-else-if="!actasStore.loading" class="text-sm text-muted">Acta no encontrada.</p>

    <UiDrawer :abierto="drawerVerificadorAbierto" titulo="Designar verificador" @cerrar="drawerVerificadorAbierto = false">
      <div class="space-y-3">
        <UFormField label="Tercero" name="tercero">
          <UiSelectorBuscable v-model="formVerificador.terceroId" :opciones="opcionesTercero" placeholder="Verificador" />
        </UFormField>
        <UFormField label="Plazo límite" name="plazoLimite">
          <UInput v-model="formVerificador.plazoLimite" type="date" class="w-full" />
        </UFormField>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerVerificadorAbierto = false">Cancelar</UButton>
          <UButton
            :loading="actasStore.guardando" :disabled="!formVerificador.terceroId || !formVerificador.plazoLimite"
            @click="guardarVerificador()"
          >
            Designar
          </UButton>
        </div>
      </template>
    </UiDrawer>

    <UiDrawer :abierto="drawerSuscribirAbierto" titulo="Suscribir acta" @cerrar="drawerSuscribirAbierto = false">
      <div class="space-y-3 text-sm">
        <p>
          Al suscribir, el acta asigna su número consecutivo, congela el contenido con su hash y se
          vuelve inmutable. Confirma que el presidente y el secretario de la reunión firmaron.
        </p>
      </div>
      <template #foot>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="drawerSuscribirAbierto = false">Cancelar</UButton>
          <UButton :loading="actasStore.guardando" @click="suscribir()">Confirmar suscripción</UButton>
        </div>
      </template>
    </UiDrawer>
  </div>
</template>
