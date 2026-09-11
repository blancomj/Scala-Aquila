// EXT-02 §3.4 · "Mis solicitudes" — listado con insignia de estado, detalle al tocar (incluye
// triage_motivo_rechazo cuando aplica) y botón de cancelar visible solo mientras el estado sigue en
// recibida_externa (§3.2: fuera de ese estado la Edge Function ya responde
// SOLICITUD_CANCELACION_FUERA_DE_PLAZO, este chequeo en UI solo evita el viaje inútil).
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Button, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import {
  cancelarSolicitud,
  listarMisVinculos,
  listarSolicitudes,
  obtenerDetalleSolicitud,
  type SolicitudDetalle,
  type SolicitudResumen,
  type Vinculo,
} from '../api/solicitudes'
import { etiquetaEstado } from './estadoSolicitud'

type Vista = 'cargando' | 'elegir_vinculo' | 'lista' | 'detalle'

export function MisSolicitudesScreen(): JSX.Element {
  const [vista, setVista] = useState<Vista>('cargando')
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [vinculo, setVinculo] = useState<Vinculo | null>(null)
  const [solicitudes, setSolicitudes] = useState<SolicitudResumen[]>([])
  const [detalle, setDetalle] = useState<SolicitudDetalle | null>(null)
  const [detalleId, setDetalleId] = useState<string | null>(null)
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
    await recargarLista(seleccionado)
  }

  async function recargarLista(v: Vinculo): Promise<void> {
    setCargando(true)
    setError(null)
    try {
      const lista = await listarSolicitudes(v.vinculo_id)
      setSolicitudes(lista)
      setVista('lista')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar tus solicitudes.')
    } finally {
      setCargando(false)
    }
  }

  async function abrirDetalle(id: string): Promise<void> {
    if (!vinculo) return
    setDetalleId(id)
    setCargando(true)
    setError(null)
    try {
      const datos = await obtenerDetalleSolicitud(vinculo.vinculo_id, id)
      setDetalle(datos)
      setVista('detalle')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el detalle.')
    } finally {
      setCargando(false)
    }
  }

  function confirmarCancelar(): void {
    if (!vinculo || !detalleId) return
    Alert.alert('Cancelar solicitud', '¿Seguro que quieres cancelar esta solicitud?', [
      { text: 'No', style: 'cancel' },
      { text: 'Sí, cancelar', style: 'destructive', onPress: () => void cancelar() },
    ])
  }

  async function cancelar(): Promise<void> {
    if (!vinculo || !detalleId) return
    setCargando(true)
    setError(null)
    try {
      await cancelarSolicitud(vinculo.vinculo_id, detalleId)
      await recargarLista(vinculo)
      setDetalle(null)
      setDetalleId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cancelar la solicitud.')
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
        <Text style={{ fontSize: 18, fontWeight: '600' }}>¿De cuál inmueble quieres ver las solicitudes?</Text>
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

  if (vista === 'detalle' && detalle) {
    const etiqueta = etiquetaEstado(detalle.estado)
    return (
      <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
        <Button title="< Volver" onPress={() => setVista('lista')} />
        <Text style={{ fontSize: 20, fontWeight: '600' }}>
          Solicitud #{detalle.numero}-{detalle.anio}
        </Text>
        <Text style={{ color: etiqueta.color, fontWeight: '600' }}>{etiqueta.texto}</Text>
        <Text style={{ fontWeight: '600' }}>{detalle.asunto}</Text>
        {detalle.descripcion ? <Text>{detalle.descripcion}</Text> : null}
        {detalle.triage_motivo_rechazo ? (
          <View style={{ borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', borderRadius: 8, padding: 12 }}>
            <Text style={{ fontWeight: '600', color: '#b91c1c' }}>Motivo</Text>
            <Text style={{ color: '#b91c1c' }}>{detalle.triage_motivo_rechazo}</Text>
          </View>
        ) : null}
        {detalle.estado === 'recibida_externa' ? (
          <Button title="Cancelar solicitud" color="#b91c1c" onPress={confirmarCancelar} disabled={cargando} />
        ) : null}
        {cargando ? <ActivityIndicator /> : null}
        {error ? <Text style={{ color: '#b91c1c' }}>{error}</Text> : null}
      </ScrollView>
    )
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 24, gap: 12 }}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => vinculo && void recargarLista(vinculo)} />}
    >
      <Text style={{ fontSize: 20, fontWeight: '600' }}>Mis solicitudes</Text>
      {vinculo ? <Text style={{ color: '#6b7280' }}>{vinculo.tenant_nombre}</Text> : null}
      {solicitudes.length === 0 ? <Text>Todavía no has enviado ninguna solicitud.</Text> : null}
      {solicitudes.map((s) => {
        const etiqueta = etiquetaEstado(s.estado)
        return (
          <TouchableOpacity
            key={s.id}
            onPress={() => void abrirDetalle(s.id)}
            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, gap: 4 }}
          >
            <Text style={{ fontWeight: '600' }}>
              #{s.numero}-{s.anio} — {s.asunto}
            </Text>
            <Text style={{ color: etiqueta.color, fontWeight: '600' }}>{etiqueta.texto}</Text>
          </TouchableOpacity>
        )
      })}
      {error ? <Text style={{ color: '#b91c1c' }}>{error}</Text> : null}
    </ScrollView>
  )
}
