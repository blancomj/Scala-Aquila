// EXT-03 §3.5 · "Mis reservas" — listado con estado y opción de cancelar mientras aplique (solo
// mientras estado esté en solicitada/aprobada — guard_mant_reserva, extendido por EXT-03, rechaza
// cualquier otra transición con RESERVA_TRANSICION_INVALIDA). Mismo patrón que
// MisSolicitudesScreen (EXT-02), sin pantalla de detalle separada — cada fila ya trae su estado
// completo (a diferencia de solicitudes, el spec de EXT-03 no define un endpoint de detalle).
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { cancelarReserva, listarMisVinculos, listarReservas, type ReservaResumen, type Vinculo } from '../api/reservas'
import { etiquetaEstadoReserva } from './estadoReserva'

type Vista = 'cargando' | 'elegir_vinculo' | 'lista'

export function MisReservasScreen(): JSX.Element {
  const [vista, setVista] = useState<Vista>('cargando')
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [vinculo, setVinculo] = useState<Vinculo | null>(null)
  const [reservas, setReservas] = useState<ReservaResumen[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listarMisVinculos()
      .then((lista) => {
        setVinculos(lista)
        if (lista.length === 1) {
          void seleccionarVinculo(lista[0]!)
        } else {
          setVista('elegir_vinculo')
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar tus inmuebles vinculados.')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function seleccionarVinculo(seleccionado: Vinculo): Promise<void> {
    setVinculo(seleccionado)
    await recargar(seleccionado)
  }

  async function recargar(v: Vinculo): Promise<void> {
    setCargando(true)
    setError(null)
    try {
      const lista = await listarReservas(v.vinculo_id)
      setReservas(lista)
      setVista('lista')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar tus reservas.')
    } finally {
      setCargando(false)
    }
  }

  function confirmarCancelar(reservaId: string): void {
    Alert.alert('Cancelar reserva', '¿Seguro que quieres cancelar esta reserva?', [
      { text: 'No', style: 'cancel' },
      { text: 'Sí, cancelar', style: 'destructive', onPress: () => void cancelar(reservaId) },
    ])
  }

  async function cancelar(reservaId: string): Promise<void> {
    if (!vinculo) return
    setCargando(true)
    setError(null)
    try {
      await cancelarReserva(vinculo.vinculo_id, reservaId)
      await recargar(vinculo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cancelar la reserva.')
    } finally {
      setCargando(false)
    }
  }

  if (vista === 'cargando') {
    return (
      <View style={{ padding: 24 }}>
        <ActivityIndicator />
      </View>
    )
  }

  if (vista === 'elegir_vinculo') {
    return (
      <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: '600' }}>¿De cuál inmueble quieres ver las reservas?</Text>
        {vinculos.map((v) => (
          <TouchableOpacity
            key={v.vinculo_id}
            onPress={() => void seleccionarVinculo(v)}
            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 }}
          >
            <Text style={{ fontWeight: '600' }}>{v.tenant_nombre}</Text>
            <Text style={{ color: '#6b7280' }}>{v.rol_codigo}</Text>
          </TouchableOpacity>
        ))}
        {error ? <Text style={{ color: '#b91c1c' }}>{error}</Text> : null}
      </ScrollView>
    )
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 24, gap: 12 }}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => vinculo && void recargar(vinculo)} />}
    >
      <Text style={{ fontSize: 20, fontWeight: '600' }}>Mis reservas</Text>
      {vinculo ? <Text style={{ color: '#6b7280' }}>{vinculo.tenant_nombre}</Text> : null}
      {reservas.length === 0 ? <Text>Todavía no has hecho ninguna reserva.</Text> : null}
      {reservas.map((r) => {
        const etiqueta = etiquetaEstadoReserva(r.estado)
        const puedeCancelar = r.estado === 'solicitada' || r.estado === 'aprobada'
        return (
          <View key={r.id} style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, gap: 4 }}>
            <Text style={{ fontWeight: '600' }}>
              {r.fecha} — {r.hora_inicio.slice(0, 5)} a {r.hora_fin.slice(0, 5)}
            </Text>
            <Text style={{ color: etiqueta.color, fontWeight: '600' }}>
              {etiqueta.texto}{r.penalizada ? ' (con penalidad)' : ''}
            </Text>
            {puedeCancelar ? (
              <TouchableOpacity onPress={() => confirmarCancelar(r.id)}>
                <Text style={{ color: '#b91c1c', fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )
      })}
      {error ? <Text style={{ color: '#b91c1c' }}>{error}</Text> : null}
    </ScrollView>
  )
}
