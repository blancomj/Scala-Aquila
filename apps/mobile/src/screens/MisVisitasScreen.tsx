// EXT-04 §3.4 · "Mis visitas" — historial con estado e ingreso_at cuando ya fue usada (spec §5
// prueba 6, leído del registro de acceso real vía fn_autorizacion_visita_mis_autorizaciones_
// externas, no un campo propio de este corte). Revocar solo mientras estado='vigente' — el guard
// (AUTORIZACION_ESTADO_INMUTABLE) rechaza cualquier otro estado. Mismo patrón que MisReservasScreen.
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { listarMisVinculos, listarVisitas, revocarVisita, type AutorizacionResumen, type Vinculo } from '../api/visitas'
import { etiquetaEstadoVisita } from './estadoVisita'

type Vista = 'cargando' | 'elegir_vinculo' | 'lista'

export function MisVisitasScreen(): JSX.Element {
  const [vista, setVista] = useState<Vista>('cargando')
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [vinculo, setVinculo] = useState<Vinculo | null>(null)
  const [visitas, setVisitas] = useState<AutorizacionResumen[]>([])
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
      const lista = await listarVisitas(v.vinculo_id)
      setVisitas(lista)
      setVista('lista')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar tus visitas.')
    } finally {
      setCargando(false)
    }
  }

  function confirmarRevocar(autorizacionId: string): void {
    Alert.alert('Revocar autorización', '¿Seguro que quieres revocar esta autorización de visita?', [
      { text: 'No', style: 'cancel' },
      { text: 'Sí, revocar', style: 'destructive', onPress: () => void revocar(autorizacionId) },
    ])
  }

  async function revocar(autorizacionId: string): Promise<void> {
    if (!vinculo) return
    setCargando(true)
    setError(null)
    try {
      await revocarVisita(vinculo.vinculo_id, autorizacionId)
      await recargar(vinculo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo revocar la autorización.')
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
        <Text style={{ fontSize: 18, fontWeight: '600' }}>¿De cuál inmueble quieres ver las visitas?</Text>
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
      <Text style={{ fontSize: 20, fontWeight: '600' }}>Mis visitas</Text>
      {vinculo ? <Text style={{ color: '#6b7280' }}>{vinculo.tenant_nombre}</Text> : null}
      {visitas.length === 0 ? <Text>Todavía no has autorizado ninguna visita.</Text> : null}
      {visitas.map((v) => {
        const etiqueta = etiquetaEstadoVisita(v.estado)
        const puedeRevocar = v.estado === 'vigente'
        return (
          <View key={v.id} style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, gap: 4 }}>
            <Text style={{ fontWeight: '600' }}>
              {v.visitante_nombre}{v.visitante_documento ? ` — ${v.visitante_documento}` : ''}
            </Text>
            <Text style={{ color: '#6b7280' }}>{v.fecha_prevista}</Text>
            <Text style={{ color: etiqueta.color, fontWeight: '600' }}>{etiqueta.texto}</Text>
            {v.ingreso_at ? (
              <Text style={{ color: '#15803d' }}>Ingresó: {new Date(v.ingreso_at).toLocaleString()}</Text>
            ) : null}
            {v.egreso_at ? (
              <Text style={{ color: '#6b7280' }}>Salió: {new Date(v.egreso_at).toLocaleString()}</Text>
            ) : null}
            {puedeRevocar ? (
              <TouchableOpacity onPress={() => confirmarRevocar(v.id)}>
                <Text style={{ color: '#b91c1c', fontWeight: '600' }}>Revocar</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )
      })}
      {error ? <Text style={{ color: '#b91c1c' }}>{error}</Text> : null}
    </ScrollView>
  )
}
