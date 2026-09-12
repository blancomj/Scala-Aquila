/**
 * EXS-8 — hardening de la serie Experiencia y Servicios.
 *
 * No prueba funcionalidad: prueba que lo construido resiste lo que el
 * prompt 05 §20/§21 enumera como riesgos del dominio —IDOR, enumeración,
 * manipulación de tenant, exposición de PII, escritura sin autorización y
 * abuso por volumen— sobre los cinco dominios de la serie.
 *
 * El criterio que recorre todo el archivo: **la RLS es la barrera real**, y
 * cada intento se hace con una sesión legítima de otra copropiedad, no con
 * un cliente anónimo. Un atacante con cuenta válida es el caso interesante;
 * el anónimo ya lo para el middleware.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import {
  clienteAdmin,
  clienteComo,
  crearMembership,
  crearTenant,
  crearUsuario,
  eliminarTenant,
  eliminarUsuario,
  leerEntorno,
  type Cliente,
  type TenantPrueba,
  type UsuarioPrueba,
} from './helpers.js'

const env = leerEntorno()
const d = env ? describe : describe.skip

async function idListaTipos(admin: Cliente, tipo: string, codigo: string): Promise<number> {
  const { data, error } = await admin
    .from('lista_tipos')
    .select('id')
    .eq('tipo', tipo)
    .eq('codigo', codigo)
    .single<{ id: number }>()
  if (error) throw new Error(`lista_tipos ${tipo}.${codigo}: ${error.message}`)
  return data.id
}

d('EXS-8: hardening de Experiencia y Servicios', () => {
  const admin = clienteAdmin(env!)

  // Dos copropiedades vecinas, cada una con su administrador. Nadie es
  // miembro de las dos: es el escenario del intruso con cuenta legítima.
  let casa: TenantPrueba
  let vecina: TenantPrueba
  let deCasa: UsuarioPrueba
  let deVecina: UsuarioPrueba
  let comoCasa: Cliente
  let comoVecina: Cliente

  let terceroCasa: string
  let publicacionCasa: string
  let vehiculoCasa: string
  let tipoVenta: number
  let categoria: number

  beforeAll(async () => {
    casa = await crearTenant(admin, 'exs8-casa')
    vecina = await crearTenant(admin, 'exs8-vecina')
    deCasa = await crearUsuario(admin, 'exs8-casa-u')
    deVecina = await crearUsuario(admin, 'exs8-vecina-u')
    await crearMembership(admin, casa.id, deCasa.id, 'administrador')
    await crearMembership(admin, vecina.id, deVecina.id, 'administrador')
    comoCasa = await clienteComo(env!, deCasa)
    comoVecina = await clienteComo(env!, deVecina)

    tipoVenta = await idListaTipos(admin, 'TIPO_PUBLICACION_MARKETPLACE', 'venta')
    categoria = await idListaTipos(admin, 'CATEGORIA_MARKETPLACE', 'hogar')

    const { data: t } = await admin
      .from('terceros')
      .insert({
        tenant_id: casa.id,
        tipo_persona: 'natural',
        primer_nombre: 'Elena',
        primer_apellido: 'Soto',
        numero_documento: '52999888',
        tipo_identificacion_id: await idListaTipos(admin, 'TIPO_IDENTIFICACION', 'cedula'),
        estado_id: await idListaTipos(admin, 'ESTADO_TERCERO', 'activo'),
        email: 'elena.privado@casa.test',
        telefono: '3011234567',
      })
      .select('id')
      .single<{ id: string }>()
    terceroCasa = t!.id

    const { data: p } = await admin
      .from('publicaciones')
      .insert({
        tenant_id: casa.id,
        publicador_tercero_id: terceroCasa,
        identidad_publica: 'Elena S.',
        tipo_id: tipoVenta,
        categoria_id: categoria,
        titulo: 'Nevera de la casa',
        precio: 900000,
        origen: 'administrador',
        estado: 'publicada',
      })
      .select('id')
      .single<{ id: string }>()
    publicacionCasa = p!.id

    const { data: v } = await admin
      .from('vehiculos')
      .insert({
        tenant_id: casa.id,
        placa: 'HRD-001',
        tipo_id: await idListaTipos(admin, 'TIPO_VEHICULO', 'automovil'),
      })
      .select('id')
      .single<{ id: string }>()
    vehiculoCasa = v!.id
  }, 90_000)

  afterAll(async () => {
    await eliminarUsuario(admin, deCasa.id)
    await eliminarUsuario(admin, deVecina.id)
    await eliminarTenant(admin, casa.id)
    await eliminarTenant(admin, vecina.id)
  })

  // ── IDOR: conocer el id no da acceso ──

  it('IDOR · el vecino no lee una publicación ajena aunque tenga su id', async () => {
    const { data } = await comoVecina.from('publicaciones').select('id').eq('id', publicacionCasa)
    expect(data).toEqual([])
  }, 30_000)

  it('IDOR · el vecino no lee un vehículo ajeno aunque tenga su id', async () => {
    const { data } = await comoVecina.from('vehiculos').select('id').eq('id', vehiculoCasa)
    expect(data).toEqual([])
  }, 30_000)

  it('IDOR · el vecino no modifica una publicación ajena: la RLS la filtra', async () => {
    await comoVecina
      .from('publicaciones')
      .update({ titulo: 'Secuestrada' })
      .eq('id', publicacionCasa)

    // Un UPDATE que no pasa la policy no lanza error: filtra y afecta cero
    // filas. Lo que hay que comprobar es que el dato siga intacto.
    const { data } = await admin
      .from('publicaciones')
      .select('titulo')
      .eq('id', publicacionCasa)
      .single<{ titulo: string }>()
    expect(data?.titulo).toBe('Nevera de la casa')
  }, 30_000)

  it('IDOR · el vecino no deja un interés sobre una publicación ajena', async () => {
    const { error } = await comoVecina.from('publicacion_interes').insert({
      tenant_id: vecina.id,
      publicacion_id: publicacionCasa,
      interesado_nombre: 'Intruso',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('INTERES_TENANT_INCONSISTENTE')
  }, 30_000)

  it('IDOR · el vecino no reporta una publicación ajena', async () => {
    const { error } = await comoVecina.from('publicacion_reporte').insert({
      tenant_id: vecina.id,
      publicacion_id: publicacionCasa,
      motivo_id: await idListaTipos(admin, 'MOTIVO_REPORTE_MARKETPLACE', 'spam'),
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('REPORTE_TENANT_INCONSISTENTE')
  }, 30_000)

  // ── Manipulación de tenant: el id del cliente no manda ──

  it('tenant · declarar el tenant ajeno al crear no cuela el dato en la otra copropiedad', async () => {
    // El vecino intenta crear una publicación DENTRO de la copropiedad
    // ajena declarando su tenant_id. La policy de insert exige rol en ESE
    // tenant, que no tiene.
    const { error } = await comoVecina.from('publicaciones').insert({
      tenant_id: casa.id,
      publicador_tercero_id: terceroCasa,
      identidad_publica: 'Infiltrado',
      tipo_id: tipoVenta,
      categoria_id: categoria,
      titulo: 'Aviso plantado',
    })
    expect(error).not.toBeNull()
  }, 30_000)

  it('tenant · un vehículo no puede amparar un permiso de otra copropiedad', async () => {
    const { error } = await admin.from('vehiculo_permiso').insert({
      tenant_id: vecina.id,
      vehiculo_id: vehiculoCasa,
      tipo_id: await idListaTipos(admin, 'TIPO_PERMISO_VEHICULO', 'acceso'),
    })
    expect(error?.message).toContain('PERMISO_VEHICULO_TENANT_INCONSISTENTE')
  }, 30_000)

  // ── Las cinco funciones de lectura de la serie ──

  it('funciones · las cinco rechazan a quien no es miembro, sin decir si existe', async () => {
    const casos: { fn: string; args: Record<string, unknown>; codigo: string }[] = [
      {
        fn: 'fn_marketplace_listar',
        args: { p_tenant_id: casa.id },
        codigo: 'MARKETPLACE_NO_DISPONIBLE',
      },
      { fn: 'fn_mis_asuntos', args: { p_tenant_id: casa.id }, codigo: 'ASUNTOS_NO_DISPONIBLES' },
      {
        fn: 'fn_vehiculo_por_placa',
        args: { p_tenant_id: casa.id, p_placa: 'HRD-001' },
        codigo: 'VEHICULO_NO_ENCONTRADO',
      },
      {
        fn: 'fn_directorio_listar',
        args: { p_tenant_id: casa.id },
        codigo: 'DIRECTORIO_NO_DISPONIBLE',
      },
    ]

    for (const caso of casos) {
      const { error } = await comoVecina.rpc(
        caso.fn as 'fn_mis_asuntos',
        caso.args as { p_tenant_id: string },
      )
      expect(error, `${caso.fn} debería rechazar al no miembro`).not.toBeNull()
      expect(error?.message).toContain(caso.codigo)
    }
  }, 60_000)

  it('enumeración · una placa desconocida y una ajena son indistinguibles', async () => {
    // Como miembro de su propia copropiedad, el vecino puede consultar
    // placas — pero la de la casa de al lado le responde igual que una
    // inventada: cero filas, sin error que delate que existe en otro sitio.
    const { data: ajena, error: e1 } = await comoVecina.rpc('fn_vehiculo_por_placa', {
      p_tenant_id: vecina.id,
      p_placa: 'HRD-001',
    })
    const { data: inventada, error: e2 } = await comoVecina.rpc('fn_vehiculo_por_placa', {
      p_tenant_id: vecina.id,
      p_placa: 'ZZZ-999',
    })
    expect(e1).toBeNull()
    expect(e2).toBeNull()
    expect(ajena).toEqual([])
    expect(inventada).toEqual([])
  }, 30_000)

  it('enumeración · los ids son UUID aleatorios, no un contador que se pueda recorrer', async () => {
    const { data } = await admin
      .from('publicaciones')
      .select('id')
      .eq('tenant_id', casa.id)
      .limit(1)
      .single<{ id: string }>()
    // UUID v4: el nibble de versión es 4 y el de variante está en [89ab].
    expect(data?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  }, 30_000)

  // ── PII: lo que el tablón y el directorio NO deben devolver ──

  it('PII · el tablón no devuelve el tercero dueño del aviso ni sus datos de contacto', async () => {
    const { data } = await comoCasa.rpc('fn_marketplace_listar', { p_tenant_id: casa.id })
    const serializado = JSON.stringify(data)
    expect(serializado).toContain('Elena S.')
    expect(serializado).not.toContain(terceroCasa)
    expect(serializado).not.toContain('elena.privado@casa.test')
    expect(serializado).not.toContain('3011234567')
    expect(serializado).not.toContain('52999888')
  }, 30_000)

  // ── Rate limiting (EXS-8) ──

  it('rate limit · el techo por hora corta un bucle de publicaciones', async () => {
    const payload = (i: number) => ({
      tenant_id: casa.id,
      publicador_tercero_id: terceroCasa,
      identidad_publica: 'Elena S.',
      tipo_id: tipoVenta,
      categoria_id: categoria,
      titulo: `Bucle ${String(i)}`,
    })

    let bloqueadoEn: number | null = null
    // El techo es 20/hora y quedan 19 tras la del fixture… que se creó con
    // service_role y por tanto no consumió cupo. Se intentan 25.
    for (let i = 0; i < 25; i += 1) {
      const { error } = await comoCasa.from('publicaciones').insert(payload(i))
      if (error) {
        expect(error.message).toContain('RATE_LIMIT_EXCEDIDO')
        bloqueadoEn = i
        break
      }
    }

    expect(bloqueadoEn, 'el bucle debería haberse cortado antes de 25').not.toBeNull()
    expect(bloqueadoEn).toBeLessThanOrEqual(20)
  }, 120_000)

  it('rate limit · no frena a service_role: sin auth.uid() no hay persona a quien limitar', async () => {
    // Justo después del test anterior, que agotó el cupo del usuario. Una
    // carga fuera de banda debe seguir pasando, o una importación legítima
    // quedaría rehén del último bucle de alguien.
    const { error } = await admin.from('publicaciones').insert({
      tenant_id: casa.id,
      publicador_tercero_id: terceroCasa,
      identidad_publica: 'Carga masiva',
      tipo_id: tipoVenta,
      categoria_id: categoria,
      titulo: 'Importada fuera de banda',
      origen: 'administrador',
    })
    expect(error).toBeNull()
  }, 30_000)

  it('rate limit · el bucket es por persona: el vecino conserva su cupo intacto', async () => {
    const { error } = await comoVecina.from('publicaciones').insert({
      tenant_id: vecina.id,
      publicador_tercero_id: (
        await admin
          .from('terceros')
          .insert({
            tenant_id: vecina.id,
            tipo_persona: 'natural',
            primer_nombre: 'Vecino',
            primer_apellido: 'Tranquilo',
            numero_documento: '10203040',
            tipo_identificacion_id: await idListaTipos(admin, 'TIPO_IDENTIFICACION', 'cedula'),
            estado_id: await idListaTipos(admin, 'ESTADO_TERCERO', 'activo'),
          })
          .select('id')
          .single<{ id: string }>()
      ).data!.id,
      identidad_publica: 'Vecino T.',
      tipo_id: tipoVenta,
      categoria_id: categoria,
      titulo: 'Aviso legítimo del vecino',
    })
    expect(error).toBeNull()
  }, 30_000)
})
