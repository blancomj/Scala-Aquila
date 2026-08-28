import { describe, expect, it } from 'vitest'
import {
  esAccionAltoImpacto,
  resolverDestinatarios,
  type RelacionInmueblePersona,
} from './cartera-destinatarios.js'

const CORTE = '2026-08-28'

function rel(over: Partial<RelacionInmueblePersona> & { terceroId: string }): RelacionInmueblePersona {
  return {
    rolCodigo: 'copropietario',
    porcentaje: 100,
    esPagador: false,
    recibeNotificaciones: true,
    vigenteDesde: '2020-01-01',
    vigenteHasta: null,
    email: 'a@example.test',
    telefono: '3001234567',
    direccion: 'Calle 100 # 15-20',
    municipio: 'Barranquilla',
    direccionVerificadaAt: '2026-01-15T10:00:00Z',
    ...over,
  }
}

describe('esAccionAltoImpacto', () => {
  it('marca las acciones con efecto legal frente al deudor', () => {
    expect(esAccionAltoImpacto('requerimiento_formal')).toBe(true)
    expect(esAccionAltoImpacto('aviso_prejuridico')).toBe(true)
    expect(esAccionAltoImpacto('remision_juridica')).toBe(true)
  })

  it('no marca la gestión ordinaria ni la propuesta de acuerdo', () => {
    expect(esAccionAltoImpacto('email')).toBe(false)
    expect(esAccionAltoImpacto('llamada')).toBe(false)
    // Una propuesta de acuerdo es una oferta, no un cobro: va a quien paga.
    expect(esAccionAltoImpacto('propuesta_acuerdo')).toBe(false)
  })
})

describe('resolverDestinatarios — R1: el obligado es el copropietario', () => {
  it('dirige el requerimiento formal al copropietario aunque el pagador sea el arrendatario', () => {
    const res = resolverDestinatarios({
      relaciones: [
        rel({ terceroId: 'prop-1' }),
        rel({ terceroId: 'arr-1', rolCodigo: 'arrendatario', porcentaje: null, esPagador: true }),
      ],
      tipoAccion: 'requerimiento_formal',
      canal: 'email',
      fechaCorte: CORTE,
    })

    expect(res.tipo).toBe('resuelto')
    if (res.tipo !== 'resuelto') return
    const obligados = res.destinatarios.filter((d) => d.motivo === 'obligado_legal')
    expect(obligados).toHaveLength(1)
    expect(obligados[0]?.terceroId).toBe('prop-1')
    // El arrendatario se entera, pero no como obligado.
    expect(res.destinatarios.find((d) => d.terceroId === 'arr-1')?.motivo).toBe('copia_informativa')
  })

  it('en gestión ordinaria sí le habla al pagador', () => {
    const res = resolverDestinatarios({
      relaciones: [
        rel({ terceroId: 'prop-1' }),
        rel({ terceroId: 'arr-1', rolCodigo: 'arrendatario', porcentaje: null, esPagador: true }),
      ],
      tipoAccion: 'email',
      canal: 'email',
      fechaCorte: CORTE,
    })

    expect(res.tipo).toBe('resuelto')
    if (res.tipo !== 'resuelto') return
    expect(res.destinatarios).toHaveLength(1)
    expect(res.destinatarios[0]?.terceroId).toBe('arr-1')
    expect(res.destinatarios[0]?.motivo).toBe('pagador_designado')
  })

  it('rechaza escalar un inmueble sin copropietario vigente', () => {
    const res = resolverDestinatarios({
      relaciones: [rel({ terceroId: 'arr-1', rolCodigo: 'arrendatario', porcentaje: null })],
      tipoAccion: 'aviso_prejuridico',
      canal: 'email',
      fechaCorte: CORTE,
    })

    expect(res.tipo).toBe('sin_destinatario')
    if (res.tipo !== 'sin_destinatario') return
    expect(res.motivo).toContain('art. 29')
  })
})

describe('resolverDestinatarios — R2: solidaridad, uno por uno', () => {
  it('notifica a todos los copropietarios vigentes, con su porcentaje', () => {
    const res = resolverDestinatarios({
      relaciones: [
        rel({ terceroId: 'prop-1', porcentaje: 60 }),
        rel({ terceroId: 'prop-2', porcentaje: 40 }),
      ],
      tipoAccion: 'requerimiento_formal',
      canal: 'email',
      fechaCorte: CORTE,
    })

    expect(res.tipo).toBe('resuelto')
    if (res.tipo !== 'resuelto') return
    expect(res.destinatarios).toHaveLength(2)
    expect(res.destinatarios.map((d) => d.porcentaje)).toEqual([60, 40])
    expect(res.destinatarios.every((d) => d.motivo === 'obligado_legal')).toBe(true)
  })

  it('excluye al copropietario cuya relación ya terminó', () => {
    const res = resolverDestinatarios({
      relaciones: [
        rel({ terceroId: 'prop-actual' }),
        rel({ terceroId: 'prop-anterior', vigenteHasta: '2026-06-30' }),
      ],
      tipoAccion: 'requerimiento_formal',
      canal: 'email',
      fechaCorte: CORTE,
    })

    expect(res.tipo).toBe('resuelto')
    if (res.tipo !== 'resuelto') return
    expect(res.destinatarios.map((d) => d.terceroId)).toEqual(['prop-actual'])
  })

  it('excluye la relación que todavía no empieza', () => {
    const res = resolverDestinatarios({
      relaciones: [rel({ terceroId: 'prop-futuro', vigenteDesde: '2026-12-01' })],
      tipoAccion: 'email',
      canal: 'email',
      fechaCorte: CORTE,
    })

    expect(res.tipo).toBe('sin_destinatario')
  })
})

describe('resolverDestinatarios — R3: el opt-out no bloquea lo obligatorio', () => {
  it('respeta recibe_notificaciones en gestión ordinaria', () => {
    const res = resolverDestinatarios({
      relaciones: [rel({ terceroId: 'prop-1', recibeNotificaciones: false })],
      tipoAccion: 'email',
      canal: 'email',
      fechaCorte: CORTE,
    })

    expect(res.tipo).toBe('sin_destinatario')
  })

  it('lo ignora en alto impacto y deja constancia de que lo ignoró', () => {
    const res = resolverDestinatarios({
      relaciones: [rel({ terceroId: 'prop-1', recibeNotificaciones: false })],
      tipoAccion: 'requerimiento_formal',
      canal: 'email',
      fechaCorte: CORTE,
    })

    expect(res.tipo).toBe('resuelto')
    if (res.tipo !== 'resuelto') return
    expect(res.destinatarios).toHaveLength(1)
    expect(res.destinatarios[0]?.ignoroPreferencia).toBe(true)
  })

  it('no marca ignoroPreferencia cuando la persona sí acepta notificaciones', () => {
    const res = resolverDestinatarios({
      relaciones: [rel({ terceroId: 'prop-1' })],
      tipoAccion: 'requerimiento_formal',
      canal: 'email',
      fechaCorte: CORTE,
    })

    expect(res.tipo).toBe('resuelto')
    if (res.tipo !== 'resuelto') return
    expect(res.destinatarios[0]?.ignoroPreferencia).toBe(false)
  })
})

describe('resolverDestinatarios — R4: el apoderado acompaña', () => {
  it('añade al apoderado sin quitar al titular', () => {
    const res = resolverDestinatarios({
      relaciones: [
        rel({ terceroId: 'prop-1' }),
        rel({ terceroId: 'apo-1', rolCodigo: 'apoderado', porcentaje: null }),
      ],
      tipoAccion: 'remision_juridica',
      canal: 'email',
      fechaCorte: CORTE,
    })

    expect(res.tipo).toBe('resuelto')
    if (res.tipo !== 'resuelto') return
    expect(res.destinatarios).toHaveLength(2)
    expect(res.destinatarios[0]?.motivo).toBe('obligado_legal')
    expect(res.destinatarios[1]?.motivo).toBe('apoderado')
  })
})

describe('resolverDestinatarios — contacto y canal', () => {
  it('usa el teléfono para SMS y el correo para email', () => {
    const relaciones = [rel({ terceroId: 'prop-1', email: 'x@y.test', telefono: '3009998877' })]

    const porSms = resolverDestinatarios({
      relaciones, tipoAccion: 'sms', canal: 'sms', fechaCorte: CORTE,
    })
    const porEmail = resolverDestinatarios({
      relaciones, tipoAccion: 'email', canal: 'email', fechaCorte: CORTE,
    })

    expect(porSms.tipo === 'resuelto' && porSms.destinatarios[0]?.contacto).toBe('3009998877')
    expect(porEmail.tipo === 'resuelto' && porEmail.destinatarios[0]?.contacto).toBe('x@y.test')
  })

  it('no degrada el canal en silencio cuando falta el contacto', () => {
    const res = resolverDestinatarios({
      relaciones: [rel({ terceroId: 'prop-1', email: null })],
      tipoAccion: 'requerimiento_formal',
      canal: 'email',
      fechaCorte: CORTE,
    })

    expect(res.tipo).toBe('contacto_faltante')
    if (res.tipo !== 'contacto_faltante') return
    expect(res.terceroIds).toEqual(['prop-1'])
  })

  it('compone dirección y municipio para el canal físico', () => {
    const res = resolverDestinatarios({
      relaciones: [rel({ terceroId: 'prop-1' })],
      tipoAccion: 'requerimiento_formal',
      canal: 'fisico',
      fechaCorte: CORTE,
    })

    expect(res.tipo).toBe('resuelto')
    if (res.tipo !== 'resuelto') return
    expect(res.destinatarios[0]?.contacto).toBe('Calle 100 # 15-20, Barranquilla')
    expect(res.destinatarios[0]?.direccionNoVerificada).toBe(false)
  })

  it('rechaza el canal físico cuando falta el municipio: la guía no es despachable', () => {
    const res = resolverDestinatarios({
      relaciones: [rel({ terceroId: 'prop-1', municipio: null })],
      tipoAccion: 'requerimiento_formal',
      canal: 'fisico',
      fechaCorte: CORTE,
    })

    expect(res.tipo).toBe('contacto_faltante')
    if (res.tipo !== 'contacto_faltante') return
    expect(res.motivo).toContain('GAP-CAR-012')
  })

  it('despacha a dirección no verificada, pero lo deja marcado', () => {
    const res = resolverDestinatarios({
      relaciones: [rel({ terceroId: 'prop-1', direccionVerificadaAt: null })],
      tipoAccion: 'requerimiento_formal',
      canal: 'fisico',
      fechaCorte: CORTE,
    })

    expect(res.tipo).toBe('resuelto')
    if (res.tipo !== 'resuelto') return
    expect(res.destinatarios[0]?.direccionNoVerificada).toBe(true)
  })

  it('no marca direccionNoVerificada en canales que no son físicos', () => {
    const res = resolverDestinatarios({
      relaciones: [rel({ terceroId: 'prop-1', direccionVerificadaAt: null })],
      tipoAccion: 'requerimiento_formal',
      canal: 'email',
      fechaCorte: CORTE,
    })

    expect(res.tipo).toBe('resuelto')
    if (res.tipo !== 'resuelto') return
    expect(res.destinatarios[0]?.direccionNoVerificada).toBe(false)
  })

  it('sigue notificando a quien sí tiene contacto, sin arrastrar a los demás', () => {
    const res = resolverDestinatarios({
      relaciones: [
        rel({ terceroId: 'prop-1', email: 'uno@y.test' }),
        rel({ terceroId: 'prop-2', email: null }),
      ],
      tipoAccion: 'requerimiento_formal',
      canal: 'email',
      fechaCorte: CORTE,
    })

    expect(res.tipo).toBe('resuelto')
    if (res.tipo !== 'resuelto') return
    expect(res.destinatarios.map((d) => d.terceroId)).toEqual(['prop-1'])
  })
})

describe('resolverDestinatarios — acciones que no van a un tercero', () => {
  it('no resuelve destinatario para acciones internas', () => {
    for (const tipo of ['asignacion_abogado', 'revision_manual'] as const) {
      const res = resolverDestinatarios({
        relaciones: [rel({ terceroId: 'prop-1' })],
        tipoAccion: tipo,
        canal: 'interno',
        fechaCorte: CORTE,
      })
      expect(res.tipo).toBe('no_aplica')
    }
  })

  it('no resuelve destinatario cuando el canal es interno', () => {
    const res = resolverDestinatarios({
      relaciones: [rel({ terceroId: 'prop-1' })],
      tipoAccion: 'email',
      canal: 'interno',
      fechaCorte: CORTE,
    })
    expect(res.tipo).toBe('no_aplica')
  })
})
