import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adaptadorWompi } from './wompi.js'
import { ErrorPasarela } from './errors.js'

function sha256Hex(texto: string): string {
  return createHash('sha256').update(texto).digest('hex')
}

describe('adaptadorWompi — firma de integridad (crearIntencion)', () => {
  it('construye la URL de Web Checkout con la firma esperada', async () => {
    const resultado = await adaptadorWompi.crearIntencion({
      montoCentavos: 2_490_000,
      moneda: 'COP',
      referencia: 'reference',
      metodo: 'pse',
      urlRetorno: 'https://example.test/retorno',
      modo: 'sandbox',
      credenciales: { public_key: 'pub_test_abc', integrity_secret: 'test_integrity_xyz' },
    })

    expect(resultado.tipo).toBe('redirect')
    if (resultado.tipo !== 'redirect') throw new Error('unreachable')

    const url = new URL(resultado.checkoutUrl)
    expect(url.origin + url.pathname).toBe('https://checkout.wompi.co/p/')
    expect(url.searchParams.get('public-key')).toBe('pub_test_abc')
    expect(url.searchParams.get('amount-in-cents')).toBe('2490000')
    expect(url.searchParams.get('currency')).toBe('COP')
    expect(url.searchParams.get('reference')).toBe('reference')
    expect(url.searchParams.get('redirect-url')).toBe('https://example.test/retorno')

    // reference + amount-in-cents + currency + integrity-secret, en ese orden.
    const firmaEsperada = sha256Hex('reference2490000COPtest_integrity_xyz')
    expect(url.searchParams.get('signature:integrity')).toBe(firmaEsperada)
  })

  it('sin integrity_secret lanza ErrorPasarela con código de credencial', async () => {
    await expect(
      adaptadorWompi.crearIntencion({
        montoCentavos: 1000,
        moneda: 'COP',
        referencia: 'ref',
        metodo: 'pse',
        urlRetorno: 'https://example.test',
        modo: 'sandbox',
        credenciales: { public_key: 'pub_test_abc' },
      }),
    ).rejects.toMatchObject({ codigo: 'PASARELA_CREDENCIAL_INVALIDA' })
  })
})

describe('adaptadorWompi — validarFirmaWebhook (§9 del prompt: fixture real pasa, alterado falla)', () => {
  const secreto = 'test_events_secreto'
  const payloadBase = {
    event: 'transaction.updated',
    data: {
      transaction: {
        id: '01-123-456',
        status: 'APPROVED',
        amount_in_cents: 213_517,
        reference: 'ref-abc',
      },
    },
  }

  function firmar(payload: typeof payloadBase, timestamp: number, secretoUsado: string) {
    const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents']
    const concatenado =
      properties
        .map((ruta) => {
          const [raiz, campo] = ruta.split('.') as ['transaction', keyof typeof payload.data.transaction]
          return String(payload.data[raiz][campo])
        })
        .join('') + String(timestamp) + secretoUsado
    return { checksum: sha256Hex(concatenado), properties, timestamp }
  }

  it('una firma válida (fixture real) pasa', () => {
    const timestamp = 1_724_800_000
    const signature = firmar(payloadBase, timestamp, secreto)
    const evento = { ...payloadBase, signature }
    expect(adaptadorWompi.validarFirmaWebhook(evento, signature.checksum, secreto)).toBe(true)
  })

  it('un payload alterado (monto cambiado tras firmar) falla', () => {
    const timestamp = 1_724_800_000
    const signature = firmar(payloadBase, timestamp, secreto)
    const eventoAlterado = {
      ...payloadBase,
      data: { transaction: { ...payloadBase.data.transaction, amount_in_cents: 999_999_999 } },
      signature,
    }
    expect(adaptadorWompi.validarFirmaWebhook(eventoAlterado, signature.checksum, secreto)).toBe(
      false,
    )
  })

  it('la firma de otro tenant (secreto distinto) falla', () => {
    const timestamp = 1_724_800_000
    const signature = firmar(payloadBase, timestamp, secreto)
    const evento = { ...payloadBase, signature }
    expect(
      adaptadorWompi.validarFirmaWebhook(evento, signature.checksum, 'test_events_de_otro_tenant'),
    ).toBe(false)
  })

  it('un payload sin signature.properties o sin timestamp es inválido, no un crash', () => {
    expect(adaptadorWompi.validarFirmaWebhook({ data: {} }, 'x', secreto)).toBe(false)
    expect(adaptadorWompi.validarFirmaWebhook(null, 'x', secreto)).toBe(false)
    expect(adaptadorWompi.validarFirmaWebhook('texto plano', 'x', secreto)).toBe(false)
  })
})

describe('adaptadorWompi — parsearWebhook (normalización al modelo interno)', () => {
  it('normaliza data.transaction a EventoTransaccion', () => {
    const evento = adaptadorWompi.parsearWebhook({
      event: 'transaction.updated',
      data: {
        transaction: {
          id: 'tx-1',
          reference: 'ref-1',
          status: 'APPROVED',
          amount_in_cents: 50_000,
        },
      },
    })
    expect(evento).toEqual({
      transactionId: 'tx-1',
      referencia: 'ref-1',
      estado: 'aprobada',
      montoCentavos: 50_000,
    })
  })

  it.each([
    ['APPROVED', 'aprobada'],
    ['DECLINED', 'rechazada'],
    ['VOIDED', 'anulada'],
    ['PENDING', 'pendiente'],
    ['ERROR', 'rechazada'],
  ] as const)('mapea el estado Wompi %s -> %s', (wompiEstado, esperado) => {
    const evento = adaptadorWompi.parsearWebhook({
      data: { transaction: { id: 't', reference: 'r', status: wompiEstado, amount_in_cents: 1 } },
    })
    expect(evento.estado).toBe(esperado)
  })

  it('un payload sin data.transaction lanza ErrorPasarela en vez de un TypeError', () => {
    expect(() => adaptadorWompi.parsearWebhook({})).toThrow(ErrorPasarela)
  })
})

describe('adaptadorWompi — consultarTransaccion (verificación doble, §6.2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('usa el host de sandbox y la public_key como Bearer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: { id: 'tx-1', status: 'APPROVED', amount_in_cents: 213_517, reference: 'ref-1' },
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const estado = await adaptadorWompi.consultarTransaccion('tx-1', {
      modo: 'sandbox',
      credenciales: { public_key: 'pub_test_abc' },
    })

    expect(estado).toEqual({
      transactionId: 'tx-1',
      estado: 'aprobada',
      montoCentavos: 213_517,
      metodo: null,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sandbox.wompi.co/v1/transactions/tx-1',
      expect.objectContaining({ headers: { Authorization: 'Bearer pub_test_abc' } }),
    )
  })

  it('usa el host de producción cuando modo es produccion', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: { id: 'tx-1', status: 'PENDING', amount_in_cents: 1000, reference: 'ref-1' },
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await adaptadorWompi.consultarTransaccion('tx-1', {
      modo: 'produccion',
      credenciales: { public_key: 'pub_prod_abc' },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://production.wompi.co/v1/transactions/tx-1',
      expect.anything(),
    )
  })

  it('una transacción inexistente (404) lanza PASARELA_TRANSACCION_NO_ENCONTRADA', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await expect(
      adaptadorWompi.consultarTransaccion('tx-inexistente', {
        modo: 'sandbox',
        credenciales: { public_key: 'pub_test_abc' },
      }),
    ).rejects.toMatchObject({ codigo: 'PASARELA_TRANSACCION_NO_ENCONTRADA' })
  })
})
