<script setup lang="ts">
// Drawer "Registrar movimiento" — solo tipos manuales (ver TIPOS_MOVIMIENTO_MANUAL,
// fondos-labels.ts): 'uso' queda fuera a propósito, pasa por Solicitudes de uso (D-37); '
// cierre_remanente' pertenece a BLOQUE O (cierre) y solo lo genera fn_fondo_cerrar.
//
// Soporte documental obligatorio (D-42, Modelo §36): todo movimiento manual exige un soporte —
// guard_fondo_movimiento lo exige a nivel de BD (documento_id, salvo un aporte con pago_id, que
// esta pantalla nunca produce). Se sube ANTES de registrar el movimiento (no después, como el
// comprobante de un pago RC-7): documento_id vive en la propia fila de fondo_movimientos, así
// que tiene que existir antes del insert, no se adjunta a posteriori. Mismos límites de archivo
// que UiLibreriaDocumentos.vue/RegistrarPagoForm.vue.
const props = defineProps<{ fondoId: string }>()
const emit = defineEmits<{ cerrar: []; creado: [] }>()

const tenantStore = useTenantStore()
const fondosStore = useFondosStore()
const documentosStore = useDocumentosStore()

const opcionesTipo = TIPOS_MOVIMIENTO_MANUAL.map((t) => ({
  value: t,
  label: ETIQUETA_TIPO_MOVIMIENTO_FONDO[t] ?? t,
}))

const tipo = ref<(typeof TIPOS_MOVIMIENTO_MANUAL)[number]>('aporte')
const monto = ref<number | null>(null)
const fecha = ref('')
const descripcion = ref('')
const motivo = ref('')
const guardando = ref(false)
const error = ref<string | null>(null)

// ajuste/reversión aceptan monto <>0 (guard fondo_movimientos_monto_signo); el resto exige >0 —
// se deja la validación real al guard, este solo ajusta el placeholder/mínimo por tipo.
const exigeMotivo = computed(() => tipo.value === 'ajuste')

const MIME_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const TAMANO_MAXIMO = 15 * 1024 * 1024
const archivoSoporte = ref<File | null>(null)

function elegirArchivo(evento: Event): void {
  const input = evento.target as HTMLInputElement
  const archivo = input.files?.[0] ?? null
  if (archivo && (!MIME_PERMITIDOS.has(archivo.type) || archivo.size > TAMANO_MAXIMO)) {
    error.value = 'El soporte debe ser PDF, JPG o PNG, hasta 15 MB.'
    archivoSoporte.value = null
    input.value = ''
    return
  }
  archivoSoporte.value = archivo
}

async function subirSoporte(tenantId: string): Promise<string> {
  const tipos = await cargarListaTipos(tenantId, 'TIPO_DOCUMENTO')
  const tipoSoporte = tipos.find((t) => t.codigo === 'soporte_movimiento_fondo')
  if (!tipoSoporte) throw new Error('No se encontró el tipo de documento "soporte_movimiento_fondo".')
  const documento = await documentosStore.subirDocumento({
    tenantId,
    inmuebleId: null,
    tipoDocumentoId: tipoSoporte.id,
    archivo: archivoSoporte.value!,
  })
  if (!documento.id) throw new Error('El documento subido no devolvió id.')
  return documento.id
}

async function guardar(): Promise<void> {
  error.value = null
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || monto.value === null || monto.value === 0) {
    error.value = 'Indica un monto.'
    return
  }
  if (exigeMotivo.value && !motivo.value.trim()) {
    error.value = 'Un ajuste exige motivo.'
    return
  }
  if (!archivoSoporte.value) {
    error.value = 'Adjunta el soporte del movimiento (factura, acta o comprobante).'
    return
  }

  guardando.value = true
  try {
    const documentoId = await subirSoporte(tenantId)
    await fondosStore.registrarMovimiento({
      tenantId,
      fondoId: props.fondoId,
      tipo: tipo.value,
      monto: monto.value,
      fecha: fecha.value || undefined,
      descripcion: descripcion.value.trim() || undefined,
      motivo: motivo.value.trim() || undefined,
      documentoId,
    })
    emit('creado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo registrar el movimiento.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer
      :abierto="true"
      titulo="Registrar movimiento"
      subtitulo="Movimiento manual — un uso pasa por Solicitudes de uso"
      @cerrar="emit('cerrar')"
    >
      <div class="grid grid-cols-2 gap-4 text-sm">
        <UFormField label="Tipo" name="tipo" class="col-span-2">
          <USelect v-model="tipo" :items="opcionesTipo" class="w-full" />
        </UFormField>
        <UFormField label="Monto" name="monto">
          <UInput v-model.number="monto" type="number" class="w-full" />
        </UFormField>
        <UFormField label="Fecha" name="fecha">
          <UInput v-model="fecha" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Descripción (opcional)" name="descripcion" class="col-span-2">
          <UTextarea v-model="descripcion" class="w-full" :rows="2" />
        </UFormField>
        <UFormField
          :label="exigeMotivo ? 'Motivo (obligatorio)' : 'Motivo (opcional)'"
          name="motivo"
          class="col-span-2"
        >
          <UTextarea v-model="motivo" class="w-full" :rows="2" />
        </UFormField>
        <UFormField
          label="Soporte (obligatorio)"
          name="soporte"
          class="col-span-2"
          help="Factura, acta o comprobante que respalda el movimiento — PDF, JPG o PNG, hasta 15 MB."
        >
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" class="text-sm" @change="elegirArchivo">
        </UFormField>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-4" />

      <template #foot>
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="guardando" @click="guardar">Registrar</UButton>
      </template>
    </UiDrawer>
  </div>
</template>
