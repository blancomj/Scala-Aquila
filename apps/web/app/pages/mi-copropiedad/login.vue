<script setup lang="ts">
// EXT-01 §3.2 — portal de identidad para actores externos (propietarios/tenedores/inquilinos),
// independiente de apps/mobile (hoy solo scaffolding sin compilar). Flujo de 2 pasos: pedir un
// OTP por correo, confirmarlo para obtener una sesión real — nunca una membership (AD-37). Solo
// canal email en este corte (decisión del Plan); el Edge Function ya soporta sms.
//
// EXT-05 (reubicación desde portal-externo/index.vue): sigue en 'blank', a propósito NO usa
// 'mi-copropiedad' como el resto de esta superficie — antes de autenticarse no hay vínculo que
// mostrar en el header ni sentido en ofrecer Finanzas/Solicitudes en la barra inferior (esas
// rutas exigirían sesión de todas formas). Es la única página de esta carpeta que se queda con
// el layout viejo, deliberadamente.
definePageMeta({ layout: 'blank', publico: true })

const etapa = ref<'contacto' | 'codigo'>('contacto')
const contacto = ref('')
const codigo = ref('')
const cargando = ref(false)
const error = ref<string | null>(null)

async function pedirCodigo(): Promise<void> {
  error.value = null
  cargando.value = true
  try {
    await solicitarOtpActorExterno(contacto.value.trim())
    // Mismo paso siempre, exista o no el contacto — la Edge Function nunca revela su
    // existencia (EXT-01 §5.1.2).
    etapa.value = 'codigo'
  } catch (err) {
    error.value = mensajeError(err, 'No se pudo procesar la solicitud.')
  } finally {
    cargando.value = false
  }
}

async function confirmar(): Promise<void> {
  error.value = null
  cargando.value = true
  try {
    const resultado = await confirmarOtpActorExterno(contacto.value.trim(), codigo.value.trim())
    await establecerSesionActorExterno(resultado.hashed_token)
    // Recarga completa, no navigateTo() — misma ventana de carrera ya documentada en
    // login.vue: justo después de establecer la sesión hay un momento en que el ref
    // reactivo ya está listo pero el resto del cliente (la RPC de la landing) todavía no.
    window.location.href = '/mi-copropiedad/vinculos'
  } catch (err) {
    error.value = mensajeError(err, 'Código inválido o vencido.')
    cargando.value = false
  }
}

function usarOtroCorreo(): void {
  etapa.value = 'contacto'
  codigo.value = ''
  error.value = null
}
</script>

<template>
  <div class="pagina">
    <main class="hoja">
      <h1 class="titulo">Acceso para propietarios y tenedores</h1>

      <template v-if="etapa === 'contacto'">
        <p class="ayuda">Escribe el correo que tienes registrado con tu copropiedad.</p>
        <form class="formulario" @submit.prevent="pedirCodigo">
          <label class="campo">
            <span>Correo electrónico</span>
            <input
              v-model="contacto"
              type="email"
              required
              autocomplete="email"
              placeholder="tu@correo.com"
            >
          </label>
          <p v-if="error" class="error">{{ error }}</p>
          <button type="submit" class="boton" :disabled="cargando || contacto.trim().length === 0">
            {{ cargando ? 'Enviando…' : 'Enviar código' }}
          </button>
        </form>
      </template>

      <template v-else>
        <p class="ayuda">Si el correo está registrado, recibiste un código. Escríbelo aquí.</p>
        <form class="formulario" @submit.prevent="confirmar">
          <label class="campo">
            <span>Código de verificación</span>
            <input
              v-model="codigo"
              type="text"
              inputmode="numeric"
              maxlength="6"
              required
              placeholder="123456"
              autocomplete="one-time-code"
            >
          </label>
          <p v-if="error" class="error">{{ error }}</p>
          <button type="submit" class="boton" :disabled="cargando || codigo.trim().length !== 6">
            {{ cargando ? 'Verificando…' : 'Confirmar' }}
          </button>
          <button type="button" class="enlace" :disabled="cargando" @click="usarOtroCorreo">
            Usar otro correo
          </button>
        </form>
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
  margin: 0 0 12px;
  color: var(--color-brand-900);
}
.ayuda { font-size: 13px; color: var(--color-neutral-600); margin: 0 0 20px; }
.formulario { display: flex; flex-direction: column; gap: 16px; }
.campo { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; color: var(--color-neutral-700); }
.campo input {
  font: inherit; font-size: 15px; font-weight: 400; padding: 9px 12px;
  border: 1px solid var(--color-neutral-200); border-radius: var(--radius-sm); color: var(--color-neutral-900);
}
.campo input:focus { outline: 2px solid var(--color-brand-500); outline-offset: 1px; }
.error { font-size: 12px; color: var(--ui-color-error-600); margin: 0; }
.boton {
  font: inherit; font-size: 14px; font-weight: 600; color: var(--color-neutral-50);
  background: var(--color-brand-700); border: none; padding: 10px 14px; border-radius: var(--radius-sm);
  cursor: pointer;
}
.boton:disabled { opacity: 0.5; cursor: not-allowed; }
.enlace {
  font: inherit; font-size: 13px; color: var(--color-brand-700); background: none; border: none;
  cursor: pointer; padding: 0; text-align: center;
}
.enlace:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
