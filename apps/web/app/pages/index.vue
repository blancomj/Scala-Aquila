<script setup lang="ts">
definePageMeta({ publico: true })

const usuario = useSupabaseUser()

if (usuario.value) {
  await navigateTo('/dashboard')
} else {
  await navigateTo('/login')
}
</script>

<template>
  <div />
</template>
