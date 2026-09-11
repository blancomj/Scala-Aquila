// EXT-03 §3.5 · "Nueva reserva" — selector de inmueble (si hay más de un vínculo) y de zona,
// franjas ocupadas + regla de la zona visibles ANTES de confirmar, confirmación explícita
// (Alert.alert, sin dependencia nueva) — mismo patrón que NuevaSolicitudScreen (EXT-02). Sin
// librería de calendario en el proyecto — fecha/horas como texto simple (YYYY-MM-DD / HH:MM),
// consistente con el resto de esta app mínima (EXT-01/EXT-02, sin navegación todavía).
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Button, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import {
  crearReserva,
  listarMisVinculos,
  listarZonasReservables,
  obtenerDisponibilidad,
  type Disponibilidad,
  type Reserva,
  type Vinculo,
  type ZonaComun,
} from '../api/reservas'

interface Props {
  onCreada: (reserva: Reserva) => void
}

type Etapa = 'cargando' | 'elegir_vinculo' | 'elegir_zona' | 'formulario' | 'enviando'

export function NuevaReservaScreen({ onCreada }: Props): JSX.Element {
  const [etapa, setEtapa] = useState<Etapa>('cargando')
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [vinculo, setVinculo] = useState<Vinculo | null>(null)
  const [zonas, setZonas] = useState<ZonaComun[]>([])
  const [zona, setZona] = useState<ZonaComun | null>(null)
  const [fecha, setFecha] = useState('')
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFin, setHoraFin] = useState('')
  const [disponibilidad, setDisponibilidad] = useState<Disponibilidad | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listarMisVinculos()
      .then((lista) => {
        setVinculos(lista)
        if (lista.length === 1) {
          void seleccionarVinculo(lista[0]!)
        } else {
          setEtapa('elegir_vinculo')
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar tus inmuebles vinculados.')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function seleccionarVinculo(seleccionado: Vinculo): Promise<void> {
    setVinculo(seleccionado)
    setError(null)
    try {
      const lista = await listarZonasReservables(seleccionado.vinculo_id)
      setZonas(lista)
      if (lista.length === 1) {
        setZona(lista[0]!)
        setEtapa('formulario')
      } else {
        setEtapa('elegir_zona')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las zonas reservables.')
    }
  }

  function seleccionarZona(seleccionada: ZonaComun): void {
    setZona(seleccionada)
    setEtapa('formulario')
  }

  async function consultarDisponibilidad(): Promise<void> {
    if (!vinculo || !zona || fecha.trim().length === 0) return
    setError(null)
    try {
      const datos = await obtenerDisponibilidad(vinculo.vinculo_id, zona.id, fecha.trim())
      setDisponibilidad(datos)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo consultar la disponibilidad.')
    }
  }

  function confirmarEnvio(): void {
    if (!vinculo || !zona || !fecha.trim() || !horaInicio.trim() || !horaFin.trim()) return
    const costo = disponibilidad?.regla?.genera_cargo
      ? ` — tiene costo${disponibilidad.regla.monto ? ` de ${String(disponibilidad.regla.monto)}` : ''}`
      : ''
    const aprobacion = disponibilidad?.regla?.requiere_aprobacion
      ? 'Queda pendiente de aprobación del staff.'
      : 'Queda aprobada de inmediato.'
    Alert.alert(
      'Confirmar reserva',
      `${zona.nombre}, ${fecha.trim()} de ${horaInicio.trim()} a ${horaFin.trim()}${costo}. ${aprobacion}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: () => void enviar() },
      ],
    )
  }

  async function enviar(): Promise<void> {
    if (!vinculo || !zona) return
    setEtapa('enviando')
    setError(null)
    try {
      const creada = await crearReserva({
        vinculoId: vinculo.vinculo_id, zonaComunId: zona.id, fecha: fecha.trim(),
        horaInicio: horaInicio.trim(), horaFin: horaFin.trim(),
      })
      onCreada(creada)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la reserva.')
      setEtapa('formulario')
    }
  }

  if (etapa === 'cargando') {
    return (
      <View style={{ padding: 24 }}>
        <ActivityIndicator />
      </View>
    )
  }

  if (etapa === 'elegir_vinculo') {
    return (
      <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: '600' }}>¿Para cuál inmueble es la reserva?</Text>
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

  if (etapa === 'elegir_zona') {
    return (
      <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: '600' }}>¿Cuál zona quieres reservar?</Text>
        {zonas.length === 0 ? <Text>No hay zonas disponibles para reservar en este momento.</Text> : null}
        {zonas.map((z) => (
          <TouchableOpacity
            key={z.id}
            onPress={() => seleccionarZona(z)}
            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 }}
          >
            <Text style={{ fontWeight: '600' }}>{z.nombre}</Text>
          </TouchableOpacity>
        ))}
        {error ? <Text style={{ color: '#b91c1c' }}>{error}</Text> : null}
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: '600' }}>Nueva reserva</Text>
      {zona ? <Text style={{ color: '#6b7280' }}>{zona.nombre}</Text> : null}

      <View>
        <Text style={{ fontWeight: '600', marginBottom: 8 }}>Fecha (YYYY-MM-DD)</Text>
        <TextInput
          value={fecha}
          onChangeText={(v) => {
            setFecha(v)
            setDisponibilidad(null)
          }}
          placeholder="2027-03-15"
          style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 }}
        />
        <Button title="Ver disponibilidad" onPress={() => void consultarDisponibilidad()} disabled={fecha.trim().length === 0} />
      </View>

      {disponibilidad ? (
        <View style={{ gap: 8 }}>
          {disponibilidad.regla ? (
            <View style={{ borderWidth: 1, borderColor: '#dbeafe', backgroundColor: '#eff6ff', borderRadius: 8, padding: 12, gap: 4 }}>
              <Text>{disponibilidad.regla.requiere_aprobacion ? 'Requiere aprobación del staff.' : 'Se aprueba de inmediato.'}</Text>
              {disponibilidad.regla.duracion_maxima_minutos ? (
                <Text>Duración máxima: {disponibilidad.regla.duracion_maxima_minutos} minutos.</Text>
              ) : null}
              {disponibilidad.regla.genera_cargo ? (
                <Text>Tiene costo{disponibilidad.regla.monto ? `: ${String(disponibilidad.regla.monto)}` : ''}.</Text>
              ) : (
                <Text>Sin costo.</Text>
              )}
            </View>
          ) : (
            <Text style={{ color: '#b91c1c' }}>Esta zona no admite reservas para esa fecha.</Text>
          )}
          {disponibilidad.ocupadas.length > 0 ? (
            <View>
              <Text style={{ fontWeight: '600' }}>Franjas ya ocupadas:</Text>
              {disponibilidad.ocupadas.map((o, i) => (
                <Text key={i}>{o.hora_inicio.slice(0, 5)} - {o.hora_fin.slice(0, 5)}</Text>
              ))}
            </View>
          ) : (
            <Text>Sin franjas ocupadas ese día.</Text>
          )}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '600', marginBottom: 8 }}>Hora inicio (HH:MM)</Text>
          <TextInput
            value={horaInicio}
            onChangeText={setHoraInicio}
            placeholder="10:00"
            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '600', marginBottom: 8 }}>Hora fin (HH:MM)</Text>
          <TextInput
            value={horaFin}
            onChangeText={setHoraFin}
            placeholder="11:00"
            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 }}
          />
        </View>
      </View>

      <Button
        title="Reservar"
        onPress={confirmarEnvio}
        disabled={etapa === 'enviando' || !fecha.trim() || !horaInicio.trim() || !horaFin.trim()}
      />
      {etapa === 'enviando' ? <ActivityIndicator /> : null}
      {error ? <Text style={{ color: '#b91c1c' }}>{error}</Text> : null}
    </ScrollView>
  )
}
