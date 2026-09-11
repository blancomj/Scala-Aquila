// EXT-02 §3.4 · "Nueva solicitud" — selector de inmueble (si hay más de un vínculo), tipo y
// categoría de catálogo (spec §3.1: "la app los muestra como selección, no como campo abierto"),
// asunto, descripción y confirmación explícita antes de enviar (Alert.alert, sin dependencia
// nueva). Sin librería de navegación en el proyecto todavía (ver App.tsx) — pantalla autónoma con
// callback `onCreada`, mismo patrón que VerificarOtpScreen/EstablecerPasswordScreen (EXT-01).
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Button, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import {
  crearSolicitud,
  listarMisVinculos,
  obtenerCatalogo,
  type Catalogo,
  type ItemCatalogo,
  type Solicitud,
  type Vinculo,
} from '../api/solicitudes'

interface Props {
  onCreada: (solicitud: Solicitud) => void
}

type Etapa = 'cargando_vinculos' | 'elegir_vinculo' | 'formulario' | 'enviando'

export function NuevaSolicitudScreen({ onCreada }: Props): JSX.Element {
  const [etapa, setEtapa] = useState<Etapa>('cargando_vinculos')
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [vinculo, setVinculo] = useState<Vinculo | null>(null)
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null)
  const [tipo, setTipo] = useState<ItemCatalogo | null>(null)
  const [categoria, setCategoria] = useState<ItemCatalogo | null>(null)
  const [asunto, setAsunto] = useState('')
  const [descripcion, setDescripcion] = useState('')
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
      const datosCatalogo = await obtenerCatalogo(seleccionado.vinculo_id)
      setCatalogo(datosCatalogo)
      setEtapa('formulario')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el catálogo de tipo/categoría.')
    }
  }

  function confirmarEnvio(): void {
    if (!vinculo || !tipo || !categoria || !asunto.trim()) return
    Alert.alert(
      'Enviar solicitud',
      `¿Confirmas enviar "${asunto.trim()}" (${tipo.nombre} / ${categoria.nombre})?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Enviar', onPress: () => void enviar() },
      ],
    )
  }

  async function enviar(): Promise<void> {
    if (!vinculo || !tipo || !categoria) return
    setEtapa('enviando')
    setError(null)
    try {
      const creada = await crearSolicitud({
        vinculoId: vinculo.vinculo_id,
        tipoId: tipo.id,
        categoriaId: categoria.id,
        asunto: asunto.trim(),
        descripcion: descripcion.trim() || undefined,
      })
      onCreada(creada)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud.')
      setEtapa('formulario')
    }
  }

  if (etapa === 'cargando_vinculos') {
    return (
      <View style={{ padding: 24 }}>
        <ActivityIndicator />
      </View>
    )
  }

  if (etapa === 'elegir_vinculo') {
    return (
      <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: '600' }}>¿Para cuál inmueble es la solicitud?</Text>
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
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: '600' }}>Nueva solicitud</Text>
      {vinculo ? <Text style={{ color: '#6b7280' }}>{vinculo.tenant_nombre}</Text> : null}

      <View>
        <Text style={{ fontWeight: '600', marginBottom: 8 }}>Tipo</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(catalogo?.tipos ?? []).map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => setTipo(item)}
              style={{
                borderWidth: 1,
                borderColor: tipo?.id === item.id ? '#1d4ed8' : '#ccc',
                backgroundColor: tipo?.id === item.id ? '#dbeafe' : undefined,
                borderRadius: 8,
                paddingVertical: 8,
                paddingHorizontal: 12,
              }}
            >
              <Text>{item.nombre}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View>
        <Text style={{ fontWeight: '600', marginBottom: 8 }}>Categoría</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(catalogo?.categorias ?? []).map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => setCategoria(item)}
              style={{
                borderWidth: 1,
                borderColor: categoria?.id === item.id ? '#1d4ed8' : '#ccc',
                backgroundColor: categoria?.id === item.id ? '#dbeafe' : undefined,
                borderRadius: 8,
                paddingVertical: 8,
                paddingHorizontal: 12,
              }}
            >
              <Text>{item.nombre}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View>
        <Text style={{ fontWeight: '600', marginBottom: 8 }}>Asunto</Text>
        <TextInput
          value={asunto}
          onChangeText={setAsunto}
          placeholder="Resumen breve"
          style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 }}
        />
      </View>

      <View>
        <Text style={{ fontWeight: '600', marginBottom: 8 }}>Descripción (opcional)</Text>
        <TextInput
          value={descripcion}
          onChangeText={setDescripcion}
          placeholder="Detalles adicionales"
          multiline
          numberOfLines={4}
          style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, minHeight: 96, textAlignVertical: 'top' }}
        />
      </View>

      <Button
        title="Enviar solicitud"
        onPress={confirmarEnvio}
        disabled={etapa === 'enviando' || !tipo || !categoria || asunto.trim().length === 0}
      />
      {etapa === 'enviando' ? <ActivityIndicator /> : null}
      {error ? <Text style={{ color: '#b91c1c' }}>{error}</Text> : null}
    </ScrollView>
  )
}
