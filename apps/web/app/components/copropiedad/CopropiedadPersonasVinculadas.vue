<script setup lang="ts">
// Sección "Personas vinculadas" / "Consejo de administración" — genérica
// por familia de rol (`familiaRol`). Extraída de CopropiedadDatosBasicos.vue
// (donde vivía inline, solo para PERSONA_COPROPIEDAD) para reutilizarla
// también en el tab Configuración con ROL_CONCEJO_COPROPIEDAD — mismo
// criterio que UiLibreriaDocumentos.vue (Copropiedad/Inmueble Documentos).
//
// tenant_tercero_rol.rol_id no lleva guard de familia de catálogo
// (20260822090000_tenant_tercero_rol.sql), así que tercerosStore.personasTenant
// trae filas de TODAS las familias mezcladas — el filtro por familia se
// hace acá (fila.rol.tipo), no en el store.
const props = withDefaults(
  defineProps<{
    familiaRol: string
    titulo: string
    subtitulo: string
    notaAyuda: string
    mostrarTarjetaProfesional?: boolean
    textoBotonAgregar?: string
  }>(),
  {
    mostrarTarjetaProfesional: true,
    textoBotonAgregar: 'Agregar persona',
  },
)

const tenantStore = useTenantStore()
const tercerosStore = useTercerosStore()

const modalAbierto = ref(false)

const filas = computed(() =>
  tercerosStore.personasTenant.filter((p) => p.rol.tipo === props.familiaRol),
)

async function alGuardar(): Promise<void> {
  modalAbierto.value = false
}

async function finalizarPersona(id: string): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  await tercerosStore.finalizarRelacionTenant(id, tenantId, new Date().toISOString().slice(0, 10))
}
</script>

<template>
  <div>
    <div class="section-title">
      <div>
        <h2>{{ titulo }}</h2>
        <p class="panel-sub" style="margin-top: 2px">{{ subtitulo }}</p>
      </div>
      <UButton size="sm" @click="modalAbierto = true">{{ textoBotonAgregar }}</UButton>
    </div>
    <UiTabla
      :columnas="[
        { clave: 'tercero', etiqueta: 'Tercero' },
        { clave: 'rol', etiqueta: 'Rol' },
        ...(mostrarTarjetaProfesional ? [{ clave: 'tarjetaProfesional', etiqueta: 'Tarjeta profesional', claseCelda: 'mono' }] : []),
        { clave: 'vigenteDesde', etiqueta: 'Vigente desde', claseCelda: 'mono' },
        { clave: 'notificaciones', etiqueta: 'Notificaciones' },
        { clave: 'acciones', etiqueta: '' },
      ]"
      :filas="filas"
      :clave-fila="(p) => p.id"
      vacio="Sin registros todavía."
    >
      <template #celda-tercero="{ fila }">{{ fila.tercero.nombre_completo }}</template>
      <template #celda-rol="{ fila }"><UBadge color="neutral" variant="subtle">{{ fila.rol.nombre }}</UBadge></template>
      <template #celda-tarjetaProfesional="{ fila }">{{ fila.numero_tarjeta_profesional ?? '—' }}</template>
      <template #celda-vigenteDesde="{ fila }">{{ fila.vigente_desde }}{{ fila.vigente_hasta ? ` → ${fila.vigente_hasta}` : '' }}</template>
      <template #celda-notificaciones="{ fila }">{{ fila.recibe_notificaciones ? 'Sí' : 'No' }}</template>
      <template #celda-acciones="{ fila }">
        <UButton v-if="!fila.vigente_hasta" variant="outline" color="neutral" size="xs" @click="finalizarPersona(fila.id)">
          Finalizar
        </UButton>
        <UBadge v-else color="neutral" variant="subtle">Finalizada</UBadge>
      </template>
    </UiTabla>
    <p class="note">{{ notaAyuda }}</p>

    <CopropiedadPersonaVinculadaForm
      v-if="modalAbierto"
      :familia-rol="familiaRol"
      :titulo="textoBotonAgregar"
      :mostrar-tarjeta-profesional="mostrarTarjetaProfesional"
      @cerrar="modalAbierto = false"
      @guardado="alGuardar"
    />
  </div>
</template>
