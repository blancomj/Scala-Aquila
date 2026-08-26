<script setup lang="ts">
// Importación en lote de inmuebles desde plantilla Excel — onboarding
// guiado (Doc 3 auditoría externa, Top-10 #1). El auditor pedía "import
// CSV"; decisión del usuario (2026-08-26): en vez de CSV crudo, la
// plataforma genera una plantilla .xlsx con los valores válidos del
// catálogo del tenant (evita que el admin escriba "Apto" cuando el
// catálogo dice "Apartamento" y la fila falle sin explicación clara).
// Alcance deliberadamente acotado a los campos mínimos de crearInmueble
// (código + tipo obligatorios, el resto opcional) — habitabilidad, uso de
// predio, agrupación y estado legal quedan para editar por inmueble
// después; meterlos en la plantilla habría multiplicado las columnas y el
// catálogo a resolver por fila para un primer alta masiva.
//
// Mismo patrón de SheetJS por carga dinámica que
// contabilidad/movimientos.vue (exportar) — acá además para leer
// (XLSX.read), no solo escribir. Filas inválidas NO se importan
// parcialmente: se listan con su motivo, el usuario corrige el archivo y
// vuelve a subir — evita el estado intermedio "ya importé la mitad, ¿cuál
// falta?".
import type { Database } from '@aquila/shared'

const props = defineProps<{
  abierto: boolean
  tenantId: string
  codigosExistentes: readonly string[]
}>()
const emit = defineEmits<{ cerrar: []; importado: [cantidad: number] }>()

const inmueblesStore = useInmueblesStore()
const tercerosStore = useTercerosStore()
const toast = useToast()

type EstadoInmueble = Database['public']['Enums']['inmueble_estado_t']

const ETIQUETA_ESTADO: Record<EstadoInmueble, string> = { activo: 'Activo', inactivo: 'Inactivo' }
const ENCABEZADOS = [
  'Código*',
  'Tipo*',
  'Estado',
  'Área privada (m²)',
  'Área común (m²)',
  'Matrícula inmobiliaria',
  'Referencia catastral',
  'Propietario (nombre completo)',
  'Propietario (cédula)',
  'Propietario (email)',
  'Propietario (teléfono)',
] as const

interface FilaValidada {
  fila: number
  codigo: string
  tipoTexto: string
  tipoId: number | null
  estado: EstadoInmueble
  areaPrivada?: number
  areaComun?: number
  matriculaInmobiliaria?: string
  referenciaCatastral?: string
  propietarioNombre?: string
  propietarioCedula?: string
  propietarioEmail?: string
  propietarioTelefono?: string
  errores: string[]
}

const tipos = ref<{ id: number; nombre: string }[]>([])
const cargandoTipos = ref(false)
const archivoSeleccionado = ref<File | null>(null)
const filas = ref<FilaValidada[]>([])
const procesando = ref(false)
const importando = ref(false)
const error = ref<string | null>(null)

watch(
  () => props.abierto,
  async (abierto) => {
    if (!abierto) {
      archivoSeleccionado.value = null
      filas.value = []
      error.value = null
      return
    }
    cargandoTipos.value = true
    try {
      tipos.value = await cargarListaTipos(props.tenantId, 'TIPO_INMUEBLE')
    } finally {
      cargandoTipos.value = false
    }
  },
)

const filasValidas = computed(() => filas.value.filter((f) => f.errores.length === 0))
const hayFilas = computed(() => filas.value.length > 0)

async function descargarPlantilla(): Promise<void> {
  const XLSX = await import('xlsx')
  const ejemploTipo = tipos.value[0]?.nombre ?? 'Apartamento'
  const filaEjemplo = [
    'A-101',
    ejemploTipo,
    'Activo',
    45,
    0,
    '050-987654',
    '',
    'María Fernanda Restrepo Ortiz',
    '45678912',
    'maria.restrepo@ejemplo.com',
    '3004567890',
  ]
  const hoja = XLSX.utils.aoa_to_sheet([[...ENCABEZADOS], filaEjemplo])
  hoja['!cols'] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 20 },
    { wch: 20 },
    { wch: 28 },
    { wch: 16 },
    { wch: 26 },
    { wch: 16 },
  ]
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Inmuebles')

  const valoresTipo =
    tipos.value.length > 0
      ? tipos.value.map((t) => [t.nombre])
      : [['Sin tipos configurados — ver Configuración → Catálogos']]
  const hojaValores = XLSX.utils.aoa_to_sheet([
    ['Tipo (copiar el texto exacto en la columna Tipo)'],
    ...valoresTipo,
    [],
    ['Estado (opcional, "Activo" si se deja en blanco)'],
    ['Activo'],
    ['Inactivo'],
    [],
    ['Propietario: nombre y cédula van juntos — los dos o ninguno. Queda como'],
    ['copropietario con el 100% y como quien recibe la factura.'],
  ])
  hojaValores['!cols'] = [{ wch: 45 }]
  XLSX.utils.book_append_sheet(libro, hojaValores, 'Valores válidos')

  XLSX.writeFile(libro, 'plantilla-inmuebles.xlsx')
}

function numeroOIndefinido(valor: unknown): number | undefined | 'invalido' {
  if (valor === undefined || valor === null || valor === '') return undefined
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return 'invalido'
  return n
}

function validarFilas(filasCrudas: Record<string, unknown>[]): FilaValidada[] {
  const mapaTipos = new Map(tipos.value.map((t) => [t.nombre.trim().toLowerCase(), t.id]))
  const codigosExistentesLower = new Set(props.codigosExistentes.map((c) => c.toLowerCase()))
  const codigosEnArchivo = new Map<string, number>()

  return filasCrudas.map((cruda, indice) => {
    const numeroFila = indice + 2 // +1 encabezado, +1 base-1
    const errores: string[] = []

    const codigo = String(cruda['Código*'] ?? '').trim()
    if (!codigo) {
      errores.push('Falta el código.')
    } else {
      const codigoLower = codigo.toLowerCase()
      if (codigosExistentesLower.has(codigoLower)) {
        errores.push('Ya existe un inmueble con este código.')
      }
      const filaPrevia = codigosEnArchivo.get(codigoLower)
      if (filaPrevia !== undefined) {
        errores.push(`Código repetido en la fila ${filaPrevia}.`)
      } else {
        codigosEnArchivo.set(codigoLower, numeroFila)
      }
    }

    const tipoTexto = String(cruda['Tipo*'] ?? '').trim()
    let tipoId: number | null = null
    if (!tipoTexto) {
      errores.push('Falta el tipo.')
    } else {
      tipoId = mapaTipos.get(tipoTexto.toLowerCase()) ?? null
      if (tipoId === null) {
        errores.push(`Tipo "${tipoTexto}" no existe en el catálogo — ver hoja "Valores válidos".`)
      }
    }

    const estadoTexto = String(cruda['Estado'] ?? '').trim().toLowerCase()
    let estado: EstadoInmueble = 'activo'
    if (estadoTexto && estadoTexto !== 'activo' && estadoTexto !== 'inactivo') {
      errores.push('Estado debe ser "Activo" o "Inactivo".')
    } else if (estadoTexto === 'inactivo') {
      estado = 'inactivo'
    }

    const areaPrivada = numeroOIndefinido(cruda['Área privada (m²)'])
    if (areaPrivada === 'invalido') errores.push('Área privada debe ser un número.')
    const areaComun = numeroOIndefinido(cruda['Área común (m²)'])
    if (areaComun === 'invalido') errores.push('Área común debe ser un número.')

    const propietarioNombre = String(cruda['Propietario (nombre completo)'] ?? '').trim()
    const propietarioCedula = String(cruda['Propietario (cédula)'] ?? '').trim()
    if (Boolean(propietarioNombre) !== Boolean(propietarioCedula)) {
      errores.push('El propietario necesita nombre Y cédula, o déjalos los dos en blanco.')
    }

    return {
      fila: numeroFila,
      codigo,
      tipoTexto,
      tipoId,
      estado,
      areaPrivada: areaPrivada === 'invalido' ? undefined : areaPrivada,
      areaComun: areaComun === 'invalido' ? undefined : areaComun,
      matriculaInmobiliaria: String(cruda['Matrícula inmobiliaria'] ?? '').trim() || undefined,
      referenciaCatastral: String(cruda['Referencia catastral'] ?? '').trim() || undefined,
      propietarioNombre: propietarioNombre || undefined,
      propietarioCedula: propietarioCedula || undefined,
      propietarioEmail: String(cruda['Propietario (email)'] ?? '').trim() || undefined,
      propietarioTelefono: String(cruda['Propietario (teléfono)'] ?? '').trim() || undefined,
      errores,
    }
  })
}

async function elegirArchivo(evento: Event): Promise<void> {
  const input = evento.target as HTMLInputElement
  const archivo = input.files?.[0] ?? null
  error.value = null
  filas.value = []
  archivoSeleccionado.value = archivo
  if (!archivo) return

  procesando.value = true
  try {
    const XLSX = await import('xlsx')
    const buffer = await archivo.arrayBuffer()
    const libro = XLSX.read(buffer, { type: 'array' })
    const primeraHoja = libro.SheetNames[0]
    const hoja = primeraHoja ? libro.Sheets[primeraHoja] : undefined
    if (!hoja) throw new Error('El archivo no tiene hojas.')
    const filasCrudas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: '' })
    if (filasCrudas.length === 0) {
      error.value = 'El archivo no tiene filas de datos.'
      return
    }
    filas.value = validarFilas(filasCrudas)
  } catch (excepcion) {
    error.value = mensajeError(
      excepcion,
      'No se pudo leer el archivo. Verifica que sea el formato de la plantilla.',
    )
  } finally {
    procesando.value = false
    input.value = ''
  }
}

async function confirmarImportacion(): Promise<void> {
  if (filasValidas.value.length === 0) return
  importando.value = true
  error.value = null
  try {
    const creados = await inmueblesStore.crearInmueblesEnLote(
      props.tenantId,
      filasValidas.value.map((f) => ({
        codigo: f.codigo,
        tipoId: f.tipoId as number,
        estado: f.estado,
        areaPrivada: f.areaPrivada,
        areaComun: f.areaComun,
        matriculaInmobiliaria: f.matriculaInmobiliaria,
        referenciaCatastral: f.referenciaCatastral,
      })),
    )
    const idPorCodigo = new Map(creados.map((i) => [i.codigo, i.id]))

    const conPropietario = filasValidas.value.filter((f) => f.propietarioNombre && f.propietarioCedula)
    let propietarios = 0
    if (conPropietario.length > 0) {
      propietarios = await tercerosStore.asociarPropietariosEnLote({
        tenantId: props.tenantId,
        asociaciones: conPropietario.map((f) => ({
          inmuebleId: idPorCodigo.get(f.codigo) as string,
          nombre: f.propietarioNombre as string,
          numeroDocumento: f.propietarioCedula as string,
          email: f.propietarioEmail,
          telefono: f.propietarioTelefono,
        })),
      })
    }

    toast.add({
      title: `${creados.length} inmueble(s) importado(s).`,
      description: propietarios > 0 ? `${propietarios} con propietario asignado.` : undefined,
      color: 'success',
    })
    emit('importado', creados.length)
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo completar la importación.')
  } finally {
    importando.value = false
  }
}
</script>

<template>
  <UModal
    :open="abierto"
    title="Importar inmuebles desde Excel"
    :ui="{ content: 'max-w-3xl' }"
    @update:open="(v) => { if (!v) emit('cerrar') }"
  >
    <template #body>
      <div class="space-y-4 text-sm">
        <div
          class="flex items-start justify-between gap-4 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3"
        >
          <div>
            <p class="font-medium">1. Descarga la plantilla</p>
            <p class="text-neutral-500">Incluye los tipos de inmueble válidos de esta copropiedad.</p>
          </div>
          <UButton
            size="sm"
            variant="soft"
            icon="i-lucide-download"
            :loading="cargandoTipos"
            @click="descargarPlantilla"
          >
            Descargar plantilla
          </UButton>
        </div>

        <div class="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
          <p class="font-medium mb-2">2. Sube el archivo diligenciado</p>
          <div class="flex items-center gap-3">
            <div class="text-xl text-neutral-400">⇧</div>
            <div class="flex-1 min-w-0">
              <p class="truncate">
                {{ archivoSeleccionado ? archivoSeleccionado.name : 'Selecciona el archivo .xlsx' }}
              </p>
              <span class="text-xs text-neutral-500">Mismo formato de la plantilla</span>
            </div>
            <UInput type="file" accept=".xlsx" class="max-w-[220px]" @change="elegirArchivo" />
          </div>
        </div>

        <UAlert v-if="error" color="error" variant="soft" :title="error" />

        <div v-if="procesando" class="space-y-2">
          <USkeleton class="h-8 w-full" />
          <USkeleton class="h-8 w-full" />
        </div>

        <div v-else-if="hayFilas" class="space-y-2">
          <p class="text-neutral-500">
            {{ filasValidas.length }} de {{ filas.length }} fila(s) lista(s) para importar.
          </p>
          <div class="max-h-64 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table class="w-full text-xs">
              <thead class="bg-neutral-50 dark:bg-neutral-900 sticky top-0">
                <tr>
                  <th class="text-left p-2">Fila</th>
                  <th class="text-left p-2">Código</th>
                  <th class="text-left p-2">Tipo</th>
                  <th class="text-left p-2">Estado</th>
                  <th class="text-left p-2">Propietario</th>
                  <th class="text-left p-2">Problema</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in filas" :key="f.fila" :class="f.errores.length > 0 ? 'bg-error/5' : ''">
                  <td class="p-2">{{ f.fila }}</td>
                  <td class="p-2">{{ f.codigo || '—' }}</td>
                  <td class="p-2">{{ f.tipoTexto || '—' }}</td>
                  <td class="p-2">{{ ETIQUETA_ESTADO[f.estado] }}</td>
                  <td class="p-2">{{ f.propietarioNombre || '—' }}</td>
                  <td class="p-2">
                    <span v-if="f.errores.length === 0" class="text-success">Listo</span>
                    <span v-else class="text-error">{{ f.errores.join(' ') }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="importando" :disabled="filasValidas.length === 0" @click="confirmarImportacion">
          Importar{{ filasValidas.length > 0 ? ` (${filasValidas.length})` : '' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
