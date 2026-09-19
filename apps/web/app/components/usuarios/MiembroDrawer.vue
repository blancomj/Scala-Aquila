<script setup lang="ts">
// Drawer crear/editar miembro — mismo criterio que TerceroModal.vue
// (esCreacion = !membresiaId, no un prop aparte). A diferencia de
// TerceroModal, los dos modos muestran campos DISTINTOS, no la misma forma
// con menos datos precargados: crear = invitación (correo + rol, el
// profile del invitado no existe todavía); editar = correo de solo lectura
// + nombre/teléfono/estado/rol de un miembro que ya existe.
//
// Las reglas .drawer-*/.form-grid/.field de ficha-inmueble.css están
// scopeadas bajo el selector ".ficha-inmueble" (incluida la posición fixed
// del backdrop y las variables --sheet/--ink/etc.) — sin ese ancestro, el
// drawer se renderiza sin ningún estilo (bug real, visto en producción:
// "la edición y creación no aparece en un drawer"). usuarios/index.vue es
// una página Tailwind que no envuelve en .ficha-inmueble, así que este
// componente envuelve SU PROPIO contenido en un <div class="ficha-inmueble">
// (mismo patrón que TerceroModal.vue) en vez de tocar la página entera o el
// CSS compartido.
const props = defineProps<{ membresiaId?: string }>()
const emit = defineEmits<{ cerrar: []; guardado: [] }>()

const tenantStore = useTenantStore()
const membersStore = useMembersStore()
const invitationsStore = useInvitationsStore()

const esCreacion = computed(() => !props.membresiaId)

const email = ref('')
const role = ref<'auxiliar' | 'auditor'>('auditor')
const rolOriginal = ref<'auxiliar' | 'auditor'>('auditor')
const correoActual = ref('')
const fullName = ref('')
const phone = ref('')
const status = ref<'active' | 'suspended'>('active')

const guardando = ref(false)
const error = ref<string | null>(null)

// Roles funcionales (20260830120000) — solo tiene sentido en edición: la
// membresía todavía no existe mientras la invitación esté pendiente.
const rolesFuncionalesAsignados = ref<Set<number>>(new Set())
const guardandoRolFuncional = ref<number | null>(null)

function precargar(): void {
  const miembro = membersStore.miembros.find((m) => m.id === props.membresiaId)
  if (!miembro) return
  correoActual.value = miembro.profile?.email ?? ''
  fullName.value = miembro.profile?.full_name ?? ''
  phone.value = miembro.profile?.phone ?? ''
  status.value = miembro.profile?.status ?? 'active'
  role.value = miembro.role as 'auxiliar' | 'auditor'
  rolOriginal.value = role.value
  rolesFuncionalesAsignados.value = new Set(
    miembro.roles_funcionales.map((rf) => rf.rol_funcional?.id).filter((id) => id != null),
  )
}

watchEffect(() => {
  if (props.membresiaId) precargar()
})

onMounted(() => {
  membersStore.cargarCatalogoRolesFuncionales(tenantStore.activeTenant?.id)
})

async function alternarRolFuncional(rolFuncionalId: number): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId || !props.membresiaId) return
  guardandoRolFuncional.value = rolFuncionalId
  try {
    if (rolesFuncionalesAsignados.value.has(rolFuncionalId)) {
      await membersStore.revocarRolFuncional(props.membresiaId, rolFuncionalId, tenantId)
    } else {
      await membersStore.asignarRolFuncional(props.membresiaId, rolFuncionalId, tenantId)
    }
    precargar()
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo actualizar el rol funcional.')
  } finally {
    guardandoRolFuncional.value = null
  }
}

function validar(): string | null {
  if (esCreacion.value) {
    if (!email.value.trim()) return 'El correo es obligatorio.'
  } else if (!fullName.value.trim()) {
    return 'El nombre es obligatorio.'
  }
  return null
}

async function guardar(): Promise<void> {
  const tenantId = tenantStore.activeTenant?.id
  if (!tenantId) return
  const mensajeValidacion = validar()
  if (mensajeValidacion) {
    error.value = mensajeValidacion
    return
  }
  error.value = null
  guardando.value = true
  try {
    if (esCreacion.value) {
      await invitationsStore.invitar(tenantId, email.value.trim(), role.value)
    } else if (props.membresiaId) {
      await membersStore.actualizarPerfil(
        props.membresiaId,
        { fullName: fullName.value.trim(), phone: phone.value.trim(), status: status.value },
        tenantId,
      )
      if (role.value !== rolOriginal.value) {
        await membersStore.cambiarRol(props.membresiaId, role.value, tenantId)
      }
    }
    emit('guardado')
  } catch (excepcion) {
    error.value = mensajeError(excepcion, 'No se pudo guardar.')
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="ficha-inmueble">
    <UiDrawer
      :abierto="true"
      :titulo="esCreacion ? 'Invitar usuario' : 'Editar miembro'"
      :subtitulo="esCreacion ? 'Se le envía un correo con el enlace de invitación' : 'Nombre, teléfono, rol y estado'"
      @cerrar="emit('cerrar')"
    >
      <div class="space-y-4 text-sm">
        <template v-if="esCreacion">
          <UFormField
            label="Correo electrónico"
            name="email"
            help="El nombre y el teléfono los completa el usuario al aceptar la invitación."
          >
            <UInput v-model="email" type="email" placeholder="correo@ejemplo.com" class="w-full" />
          </UFormField>
        </template>

        <template v-else>
          <UFormField label="Correo electrónico" name="correo">
            <UInput :model-value="correoActual" type="text" readonly class="w-full" />
          </UFormField>
          <UFormField label="Nombre" name="nombre">
            <UInput v-model="fullName" type="text" placeholder="Nombre completo" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Teléfono" name="telefono">
              <UInput v-model="phone" type="text" placeholder="Teléfono" class="w-full" />
            </UFormField>
            <UFormField label="Estado" name="estado">
              <USelect
                v-model="status"
                :items="[
                  { label: 'Activo', value: 'active' },
                  { label: 'Inactivo', value: 'suspended' },
                ]"
                value-key="value"
                class="w-full"
              />
            </UFormField>
          </div>
        </template>

        <UFormField label="Rol" name="rol">
          <USelect
            v-model="role"
            :items="[
              { label: 'Auxiliar', value: 'auxiliar' },
              { label: 'Auditor', value: 'auditor' },
            ]"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField
          v-if="!esCreacion"
          label="Roles funcionales"
          name="roles_funcionales"
          help="Sin ninguno marcado, ve todo lo que su rol permite. Con al menos uno, queda limitado a los módulos que esos roles cubren."
        >
          <div class="flex flex-wrap gap-4 mt-1">
            <UCheckbox
              v-for="rf in membersStore.rolesFuncionalesCatalogo"
              :key="rf.id"
              :model-value="rolesFuncionalesAsignados.has(rf.id)"
              :disabled="guardandoRolFuncional === rf.id"
              :label="rf.nombre"
              @update:model-value="alternarRolFuncional(rf.id)"
            />
          </div>
        </UFormField>
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" class="mt-4" />

      <template #foot>
        <UButton variant="ghost" @click="emit('cerrar')">Cancelar</UButton>
        <UButton :loading="guardando" @click="guardar">
          {{ esCreacion ? 'Invitar' : 'Guardar' }}
        </UButton>
      </template>
    </UiDrawer>
  </div>
</template>
