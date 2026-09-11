<script setup lang="ts">
// EXT-01 §3.3 — landing tras autenticarse: los vínculos vigentes del actor externo (tenant,
// inmueble, rol). fn_actor_externo_mis_vinculos ya es `security definer` y sin `revoke` (fix de
// EXT-02, 20260932840000) — cero Edge Function/SQL nuevo para esta pantalla.
import type { Database } from '@aquila/shared'

definePageMeta({ layout: 'blank', publico: true })

type Vinculo = Database['public']['Functions']['fn_actor_externo_mis_vinculos']['Returns'][number]

const ROL_ETIQUETA: Record<string, string> = {
  copropietario: 'Copropietario',
  arrendatario: 'Arrendatario',
  inquilino: 'Inquilino',
  locatario: 'Locatario',
  usufructuario: 'Usufructuario',
}

const cliente = useSupabaseClient<Database>()
const cargando = ref(true)
const error = ref<string | null>(null)
const vinculos = ref<Vinculo[]>([])

onMounted(async () => {
  // useSupabaseUser().value puede llegar sin `id` en el primer tick tras la recarga completa
  // que hace portal-externo/index.vue — auth.getUser() siempre valida contra Supabase (mismo
  // criterio que stores/auth.ts::cargarPerfil).
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
  } catch (err) {
    error.value = mensajeError(err, 'No se pudieron cargar tus vínculos.')
  } finally {
    cargando.value = false
  }
})

async function cerrarSesion(): Promise<void> {
  await cliente.auth.signOut()
  window.location.href = '/portal-externo'
}
</script>

<template>
  <div class="pagina">
    <main class="hoja">
      <h1 class="titulo">Tus vínculos</h1>

      <template v-if="cargando">
        <p class="mensaje">Cargando…</p>
      </template>
      <template v-else-if="error">
        <p class="mensaje error-texto">{{ error }}</p>
      </template>
      <template v-else-if="vinculos.length === 0">
        <p class="vacio">No encontramos ningún rol vigente asociado a tu cuenta.</p>
      </template>
      <template v-else>
        <ul class="lista">
          <li v-for="v in vinculos" :key="v.vinculo_id">
            <span class="tenant">{{ v.tenant_nombre }}</span>
            <span class="rol-tag">{{ ROL_ETIQUETA[v.rol_codigo] ?? v.rol_codigo }}</span>
          </li>
        </ul>
        <NuxtLink to="/portal-externo/nueva-solicitud" class="boton">Hacer una solicitud</NuxtLink>
      </template>

      <button type="button" class="enlace" @click="cerrarSesion">Cerrar sesión</button>
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
  max-width: 420px;
  background: var(--color-neutral-50);
  border-radius: var(--radius-xl);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  padding: 32px 34px;
}
.titulo {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 20px;
  color: var(--color-brand-900);
}
.mensaje { font-size: 13px; color: var(--color-neutral-500); }
.error-texto { color: var(--ui-color-error-600); }
.vacio { font-size: 13px; color: var(--color-neutral-500); }
.lista { list-style: none; margin: 0 0 20px; padding: 0; font-size: 14px; }
.lista li {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 10px 0; border-bottom: 1px solid var(--color-neutral-200);
}
.lista li:last-child { border-bottom: none; }
.tenant { font-weight: 500; }
.rol-tag {
  font-size: 11px; color: var(--color-brand-800); background: var(--color-brand-100);
  padding: 2px 8px; border-radius: var(--radius-xs); white-space: nowrap;
}
.boton {
  display: block; text-align: center; text-decoration: none;
  font-size: 14px; font-weight: 600; color: var(--color-neutral-50);
  background: var(--color-brand-700); padding: 10px 14px; border-radius: var(--radius-sm);
  margin: 4px 0 20px;
}
.enlace {
  font: inherit; font-size: 13px; color: var(--color-brand-700); background: none; border: none;
  cursor: pointer; padding: 0;
}
</style>
