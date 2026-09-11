// EXT-04 §3.4 · "Nueva visita" — formulario de autorización (documento opcional, minimizar lo que
// se pide — MANT-11 §4.5) seguido de la pantalla de QR grande con cuenta regresiva de expiración.
// Fecha/horas como texto simple, sin librería de calendario (mismo criterio que
// NuevaReservaScreen/NuevaSolicitudScreen). Sin librería de render de QR en el proyecto — el token
// se muestra como texto grande/monoespaciado, no como imagen escaneable (misma limitación de
// "sin nueva dependencia" que el resto de esta app mínima; documentado en EXT_04_INFORME.md).
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Button, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import {
  crearVisita,
  listarMisVinculos,
  listarTiposVisita,
  type Autorizacion,
  type TipoVisita,
  type Vinculo,
} from '../api/visitas'

type Etapa = 'cargando' | 'elegir_vinculo' | 'formulario' | 'enviando' | 'qr'

function formatearCuentaRegresiva(msRestantes: number): string {
  if (msRestantes <= 0) return 'Expirado'
  const totalMinutos = Math.floor(msRestantes / 60_000)
  const dias = Math.floor(totalMinutos / (60 * 24))
  const horas = Math.floor((totalMinutos % (60 * 24)) / 60)
  const minutos = totalMinutos % 60
  if (dias > 0) return `${dias}d ${horas}h`
  if (horas > 0) return `${horas}h ${minutos}min`
  return `${minutos}min`
}

export function NuevaVisitaScreen(): JSX.Element {
  const [etapa, setEtapa] = useState<Etapa>('cargando')
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [vinculo, setVinculo] = useState<Vinculo | null>(null)
  const [tipos, setTipos] = useState<TipoVisita[]>([])
  const [tipoId, setTipoId] = useState<number | null>(null)
  const [visitanteNombre, setVisitanteNombre] = useState('')
  const [visitanteDocumento, setVisitanteDocumento] = useState('')
  const [fechaPrevista, setFechaPrevista] = useState('')
  const [horaDesde, setHoraDesde] = useState('')
  const [horaHasta, setHoraHasta] = useState('')
  const [creada, setCreada] = useState<Autorizacion | null>(null)
  const [cuentaRegresiva, setCuentaRegresiva] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listarMisVinculos(), listarTiposVisita()])
      .then(([listaVinculos, listaTipos]) => {
        setVinculos(listaVinculos)
        setTipos(listaTipos)
        if (listaVinculos.length === 1) {
          setVinculo(listaVinculos[0]!)
          setEtapa('formulario')
        } else {
          setEtapa('elegir_vinculo')
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar tus inmuebles vinculados.')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (etapa !== 'qr' || !creada?.qr_expira_at) return
    const expiraAt = new Date(creada.qr_expira_at).getTime()
    const actualizar = (): void => setCuentaRegresiva(formatearCuentaRegresiva(expiraAt - Date.now()))
    actualizar()
    const intervalo = setInterval(actualizar, 30_000)
    return () => clearInterval(intervalo)
  }, [etapa, creada])

  function seleccionarVinculo(seleccionado: Vinculo): void {
    setVinculo(seleccionado)
    setEtapa('formulario')
  }

  function confirmarEnvio(): void {
    if (!vinculo || !visitanteNombre.trim() || !fechaPrevista.trim()) return
    Alert.alert(
      'Confirmar autorización',
      `Autorizar a "${visitanteNombre.trim()}" para el ${fechaPrevista.trim()}${horaDesde.trim() ? ` de ${horaDesde.trim()} a ${horaHasta.trim() || '?'}` : ''}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: () => void enviar() },
      ],
    )
  }

  async function enviar(): Promise<void> {
    if (!vinculo) return
    setEtapa('enviando')
    setError(null)
    try {
      const nueva = await crearVisita({
        vinculoId: vinculo.vinculo_id,
        visitanteNombre: visitanteNombre.trim(),
        visitanteDocumento: visitanteDocumento.trim() || undefined,
        tipoId: tipoId ?? undefined,
        fechaPrevista: fechaPrevista.trim(),
        horaDesde: horaDesde.trim() || undefined,
        horaHasta: horaHasta.trim() || undefined,
      })
      setCreada(nueva)
      setEtapa('qr')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la autorización.')
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
        <Text style={{ fontSize: 18, fontWeight: '600' }}>¿Para cuál inmueble es la visita?</Text>
        {vinculos.map((v) => (
          <TouchableOpacity
            key={v.vinculo_id}
            onPress={() => seleccionarVinculo(v)}
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

  if (etapa === 'qr' && creada) {
    return (
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16, alignItems: 'center' }}>
        <Text style={{ fontSize: 20, fontWeight: '600' }}>Visita autorizada</Text>
        <Text style={{ color: '#6b7280' }}>{creada.visitante_nombre}</Text>
        <View
          style={{
            borderWidth: 2, borderColor: '#1d4ed8', borderRadius: 12, padding: 20,
            backgroundColor: '#eff6ff', width: '100%',
          }}
        >
          <Text style={{ fontFamily: 'monospace', fontSize: 14, textAlign: 'center' }} selectable>
            {creada.qr_token}
          </Text>
        </View>
        <Text style={{ fontSize: 16 }}>
          Expira en: <Text style={{ fontWeight: '600' }}>{cuentaRegresiva}</Text>
        </Text>
        <Text style={{ color: '#6b7280', textAlign: 'center' }}>
          Muestra este código en la puerta o compártelo con el visitante.
        </Text>
        <Button
          title="Autorizar otra visita"
          onPress={() => {
            setCreada(null)
            setVisitanteNombre('')
            setVisitanteDocumento('')
            setFechaPrevista('')
            setHoraDesde('')
            setHoraHasta('')
            setTipoId(null)
            setEtapa('formulario')
          }}
        />
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: '600' }}>Nueva visita</Text>
      {vinculo ? <Text style={{ color: '#6b7280' }}>{vinculo.tenant_nombre}</Text> : null}

      <View>
        <Text style={{ fontWeight: '600', marginBottom: 8 }}>Nombre del visitante</Text>
        <TextInput
          value={visitanteNombre}
          onChangeText={setVisitanteNombre}
          placeholder="Juan Pérez"
          style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 }}
        />
      </View>

      <View>
        <Text style={{ fontWeight: '600', marginBottom: 8 }}>Documento (opcional)</Text>
        <TextInput
          value={visitanteDocumento}
          onChangeText={setVisitanteDocumento}
          placeholder="CC 123456789"
          style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 }}
        />
      </View>

      {tipos.length > 0 ? (
        <View>
          <Text style={{ fontWeight: '600', marginBottom: 8 }}>Tipo de visita (opcional)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {tipos.map((t) => (
              <TouchableOpacity
                key={t.id}
                onPress={() => setTipoId(tipoId === t.id ? null : t.id)}
                style={{
                  borderWidth: 1, borderColor: tipoId === t.id ? '#1d4ed8' : '#ccc',
                  backgroundColor: tipoId === t.id ? '#eff6ff' : 'transparent',
                  borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12,
                }}
              >
                <Text style={{ color: tipoId === t.id ? '#1d4ed8' : '#000' }}>{t.nombre}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      <View>
        <Text style={{ fontWeight: '600', marginBottom: 8 }}>Fecha prevista (YYYY-MM-DD)</Text>
        <TextInput
          value={fechaPrevista}
          onChangeText={setFechaPrevista}
          placeholder="2027-03-15"
          style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 }}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '600', marginBottom: 8 }}>Desde (HH:MM, opcional)</Text>
          <TextInput
            value={horaDesde}
            onChangeText={setHoraDesde}
            placeholder="10:00"
            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '600', marginBottom: 8 }}>Hasta (HH:MM, opcional)</Text>
          <TextInput
            value={horaHasta}
            onChangeText={setHoraHasta}
            placeholder="18:00"
            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 }}
          />
        </View>
      </View>

      <Button
        title="Autorizar visita"
        onPress={confirmarEnvio}
        disabled={etapa === 'enviando' || !visitanteNombre.trim() || !fechaPrevista.trim()}
      />
      {etapa === 'enviando' ? <ActivityIndicator /> : null}
      {error ? <Text style={{ color: '#b91c1c' }}>{error}</Text> : null}
    </ScrollView>
  )
}
