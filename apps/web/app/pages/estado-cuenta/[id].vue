<script setup lang="ts">
// Visor público del estado de cuenta — PLAN_DATOS_REALES.md §3.3. Sin
// sesión (AD-26: el propietario/residente no tiene auth.users) — por eso
// `publico: true` (auth.global.ts lo exime) y layout 'blank' (sin
// selector de tenant ni "Cerrar sesión", que no aplican a un visitante
// anónimo). Los datos llegan de la Edge Function ver-estado-cuenta, que es
// la única forma de leer estados_cuenta_generados sin membresía — la
// barrera es que el id de la ruta es un uuid v4 no adivinable.
definePageMeta({ layout: 'blank', publico: true })

const route = useRoute()
const id = route.params.id as string

const cliente = useSupabaseClient()

const {
  data: datos,
  error: errorCarga,
  pending,
} = await useAsyncData(`estado-cuenta-${id}`, async () => {
  const { data, error: errorFuncion } = await cliente.functions.invoke<EstadoCuentaDatos>(
    'ver-estado-cuenta',
    { body: { id } },
  )
  if (errorFuncion) throw await extraerErrorFuncion(errorFuncion)
  if (!data) throw new Error('No se encontró el estado de cuenta.')
  return data
})

function formatoMoneda(valor: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(valor)
}

function formatoFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO')
}

function imprimir(): void {
  window.print()
}
</script>

<template>
  <div class="estado-cuenta">
    <div class="sheet">
      <template v-if="pending">
        <p class="mensaje">Cargando…</p>
      </template>
      <template v-else-if="errorCarga || !datos">
        <p class="mensaje">
          {{ errorCarga instanceof Error ? errorCarga.message : 'No se pudo cargar el estado de cuenta.' }}
        </p>
      </template>
      <template v-else>
        <h1>{{ datos.tenant_nombre }}</h1>
        <p class="sub">
          NIT {{ datos.tenant_nit ?? '—' }} · Estado de cuenta — Inmueble
          {{ datos.inmueble_codigo }} · Generado el {{ formatoFecha(datos.generado_en) }}
        </p>

        <div class="acciones">
          <button type="button" class="btn-imprimir" @click="imprimir">
            Imprimir / Descargar PDF
          </button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Descripción</th>
              <th>Cargo</th>
              <th>Abono</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(m, i) in datos.movimientos" :key="i">
              <td>{{ formatoFecha(m.fecha) }}</td>
              <td>{{ m.descripcion }}</td>
              <td class="num">{{ m.cargo !== null ? formatoMoneda(m.cargo) : '' }}</td>
              <td class="num">{{ m.abono !== null ? formatoMoneda(m.abono) : '' }}</td>
              <td class="num">{{ formatoMoneda(m.saldo) }}</td>
            </tr>
          </tbody>
        </table>

        <p class="total">Saldo pendiente: {{ formatoMoneda(datos.saldo_final) }}</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.estado-cuenta {
  font-family: Helvetica, Arial, sans-serif;
  color: #1c2320;
  display: flex;
  justify-content: center;
  padding: 32px 16px;
}
.sheet {
  width: 100%;
  max-width: 720px;
}
.mensaje {
  color: #585b52;
  font-size: 14px;
}
h1 {
  font-size: 19px;
  margin: 0 0 4px;
}
.sub {
  color: #585b52;
  font-size: 12px;
  margin: 0 0 20px;
}
.acciones {
  margin-bottom: 20px;
}
.btn-imprimir {
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 9px 16px;
  border-radius: 3px;
  border: 1px solid #1f5c4e;
  background: #1f5c4e;
  color: #fff;
  cursor: pointer;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  font-size: 13px;
}
th {
  text-align: left;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #96988c;
  border-bottom: 1px solid #1c2320;
  padding: 6px 8px;
}
td {
  padding: 6px 8px;
  border-bottom: 1px solid #e2dfd1;
}
td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.total {
  font-weight: bold;
  font-size: 14px;
  margin-top: 16px;
  text-align: right;
}
@media print {
  .acciones {
    display: none;
  }
}
</style>
