<script setup lang="ts">
// EXT-02 §3.1/§3.4 — "Hacer una solicitud" desde el portal externo, agregado como prueba junto a
// login+landing (fuera del alcance original del corte, aprobado por el usuario en el mismo hilo).
// Mismo flujo que apps/mobile/src/screens/NuevaSolicitudScreen.tsx: elegir vínculo (si hay más de
// uno) → catálogo real de tipo/categoría del tenant → asunto/descripción → confirmar. Las dos
// Edge Functions (external-solicitudes-catalogo/-crear) ya resuelven inmueble_id/tenant_id del
// lado del servidor vía fn_actor_externo_mis_vinculos — nunca confían en lo que mande el cliente.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'blank', publico: true })

type Vinculo = Database['public']['Functions']['fn_actor_externo_mis_vinculos']['Returns'][number]

interface ItemCatalogo {
  id: number
  tipo: string
  codigo: string
  nombre: string
}

type Etapa = 'cargando' | 'elegir_vinculo' | 'formulario' | 'enviando' | 'enviada'

const cliente = useSupabaseClient<Database>()
const etapa = ref<Etapa>('cargando')
const error = ref<string | null>(null)

const vinculos = ref<Vinculo[]>([])
const vinculo = ref<Vinculo | null>(null)
const tipos = ref<ItemCatalogo[]>([])
const categorias = ref<ItemCatalogo[]>([])
const tipoId = ref<number | null>(null)
const categoriaId = ref<number | null>(null)
const asunto = ref('')
const descripcion = ref('')
const solicitudCreada = ref<{ numero: number; anio: number } | null>(null)

onMounted(async () => {
  const {
    data: { user: usuario },
  } = await cliente.auth.getUser()
  if (!usuario) {
    await navigateTo('/portal-externo')
    return
  }

  try {
    const { data, error: errorRpc } = await cliente.rpc('fn_actor_externo_mis_vinculos', {
      p_auth_user_id: usuario.id,
    })
    if (errorRpc) throw errorRpc
    vinculos.value = data ?? []
    if (vinculos.value.length === 0) {
      error.value = 'No encontramos ningún rol vigente asociado a tu cuenta.'
      etapa.value = 'formulario'
      return
    }
    if (vinculos.value.length === 1) {
      await elegirVinculo(vinculos.value[0]!)
    } else {
      etapa.value = 'elegir_vinculo'
    }
  } catch (err) {
    error.value = mensajeError(err, 'No se pudieron cargar tus vínculos.')
    etapa.value = 'formulario'
  }
})

async function elegirVinculo(seleccionado: Vinculo): Promise<void> {
  vinculo.value = seleccionado
  error.value = null
  try {
    const catalogo = await obtenerCatalogoSolicitud(seleccionado.vinculo_id)
    tipos.value = catalogo.tipos
    categorias.value = catalogo.categorias
    etapa.value = 'formulario'
  } catch (err) {
    error.value = mensajeError(err, 'No se pudo cargar el catálogo de tipo/categoría.')
  }
}

async function enviar(): Promise<void> {
  if (!vinculo.value || tipoId.value === null || categoriaId.value === null || !asunto.value.trim()) return
  error.value = null
  etapa.value = 'enviando'
  try {
    const creada = await crearSolicitudExterna({
      vinculoId: vinculo.value.vinculo_id,
      tipoId: tipoId.value,
      categoriaId: categoriaId.value,
      asunto: asunto.value.trim(),
      descripcion: descripcion.value.trim() || undefined,
    })
    solicitudCreada.value = { numero: creada.numero, anio: creada.anio }
    etapa.value = 'enviada'
  } catch (err) {
    error.value = mensajeError(err, 'No se pudo enviar la solicitud.')
    etapa.value = 'formulario'
  }
}
</script>

<template>
  <div class="pagina">
    <main class="hoja">
      <h1 class="titulo">Hacer una solicitud</h1>

      <template v-if="etapa === 'cargando'">
        <p class="mensaje">Cargando…</p>
      </template>

      <template v-else-if="etapa === 'elegir_vinculo'">
        <p class="ayuda">¿Para cuál inmueble es la solicitud?</p>
        <ul class="lista-vinculos">
          <li v-for="v in vinculos" :key="v.vinculo_id">
            <button type="button" class="tarjeta-vinculo" @click="elegirVinculo(v)">
              <span class="tenant">{{ v.tenant_nombre }}</span>
              <span class="rol">{{ v.rol_codigo }}</span>
            </button>
          </li>
        </ul>
        <p v-if="error" class="error-texto">{{ error }}</p>
      </template>

      <template v-else-if="etapa === 'enviada'">
        <p class="ayuda">
          Solicitud #{{ solicitudCreada?.numero }}/{{ solicitudCreada?.anio }} recibida. El equipo
          de la copropiedad la revisará pronto.
        </p>
        <NuxtLink to="/portal-externo/mis-vinculos" class="boton">Volver</NuxtLink>
      </template>

      <template v-else>
        <p v-if="vinculo" class="ayuda">{{ vinculo.tenant_nombre }}</p>

        <template v-if="tipos.length > 0 || categorias.length > 0">
          <div class="campo-grupo">
            <span class="etiqueta">Tipo</span>
            <div class="chips">
              <button
                v-for="item in tipos" :key="item.id" type="button"
                class="chip" :class="{ activo: tipoId === item.id }"
                @click="tipoId = item.id"
              >{{ item.nombre }}</button>
            </div>
          </div>

          <div class="campo-grupo">
            <span class="etiqueta">Categoría</span>
            <div class="chips">
              <button
                v-for="item in categorias" :key="item.id" type="button"
                class="chip" :class="{ activo: categoriaId === item.id }"
                @click="categoriaId = item.id"
              >{{ item.nombre }}</button>
            </div>
          </div>

          <label class="campo">
            <span>Asunto</span>
            <input v-model="asunto" type="text" required placeholder="Resumen breve">
          </label>

          <label class="campo">
            <span>Descripción (opcional)</span>
            <textarea v-model="descripcion" rows="4" placeholder="Detalles adicionales" />
          </label>

          <p v-if="error" class="error-texto">{{ error }}</p>

          <button
            type="button" class="boton" style="border:none;width:100%;cursor:pointer"
            :disabled="etapa === 'enviando' || tipoId === null || categoriaId === null || asunto.trim().length === 0"
            @click="enviar"
          >
            {{ etapa === 'enviando' ? 'Enviando…' : 'Enviar solicitud' }}
          </button>
        </template>
        <p v-else-if="error" class="error-texto">{{ error }}</p>
        <p v-else class="vacio">
          Esta copropiedad todavía no tiene un catálogo de tipos/categorías de solicitud
          configurado — pídele al staff que lo active antes de radicar una solicitud aquí.
        </p>

        <NuxtLink to="/portal-externo/mis-vinculos" class="enlace">Volver a mis vínculos</NuxtLink>
      </template>
    </main>
  </div>
</template>

<style scoped>
.pagina {
  font-family: var(--font-sans);
  color: var(--color-neutral-900);
  background: var(--color-neutral-100);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
}
.hoja {
  width: 100%;
  max-width: 460px;
  background: var(--color-neutral-50);
  border-radius: var(--radius-xl);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  padding: 32px 34px;
}
.titulo {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 12px;
  color: var(--color-brand-900);
}
.mensaje { font-size: 13px; color: var(--color-neutral-500); }
.ayuda { font-size: 13px; color: var(--color-neutral-600); margin: 0 0 16px; }
.vacio { font-size: 13px; color: var(--color-neutral-500); margin: 0 0 16px; }
.error-texto { font-size: 12px; color: var(--ui-color-error-600); margin: 4px 0 12px; }
.lista-vinculos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.tarjeta-vinculo {
  width: 100%; text-align: left; display: flex; flex-direction: column; gap: 2px;
  border: 1px solid var(--color-neutral-200); border-radius: var(--radius-sm); padding: 10px 12px;
  background: none; cursor: pointer; font: inherit;
}
.tarjeta-vinculo .tenant { font-weight: 600; font-size: 14px; }
.tarjeta-vinculo .rol { font-size: 12px; color: var(--color-neutral-500); }
.campo-grupo { margin-bottom: 16px; }
.etiqueta { display: block; font-size: 13px; font-weight: 600; color: var(--color-neutral-700); margin-bottom: 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  font: inherit; font-size: 13px; padding: 6px 12px; border-radius: var(--radius-md);
  border: 1px solid var(--color-neutral-200); background: var(--color-neutral-50); cursor: pointer;
  color: var(--color-neutral-700);
}
.chip.activo { border-color: var(--color-brand-600); background: var(--color-brand-100); color: var(--color-brand-800); }
.campo {
  display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600;
  color: var(--color-neutral-700); margin-bottom: 16px;
}
.campo input, .campo textarea {
  font: inherit; font-size: 14px; font-weight: 400; padding: 9px 12px; resize: vertical;
  border: 1px solid var(--color-neutral-200); border-radius: var(--radius-sm); color: var(--color-neutral-900);
}
.campo input:focus, .campo textarea:focus { outline: 2px solid var(--color-brand-500); outline-offset: 1px; }
.boton {
  display: block; text-align: center; text-decoration: none;
  font-size: 14px; font-weight: 600; color: var(--color-neutral-50);
  background: var(--color-brand-700); padding: 10px 14px; border-radius: var(--radius-sm);
  margin: 4px 0 16px;
}
.boton:disabled { opacity: 0.5; cursor: not-allowed; }
.enlace {
  display: block; text-align: center;
  font: inherit; font-size: 13px; color: var(--color-brand-700); background: none; border: none;
  cursor: pointer; padding: 0; text-decoration: none;
}
</style>
