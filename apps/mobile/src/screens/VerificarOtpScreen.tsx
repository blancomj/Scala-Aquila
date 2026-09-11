// EXT-01 entregable 6 — pantalla de verificación por OTP (primer ingreso). Auth Stack §4 de
// EXT_APP_MOVIL_PROMPT_MAESTRO.md: "Verificación de contacto (OTP)".
import { useState } from 'react'
import { ActivityIndicator, Button, Text, TextInput, View } from 'react-native'
import { confirmarOtp, solicitarOtp, type Canal } from '../api/identidad'
import { establecerSesionDesdeOtp } from '../session/cliente'

interface Props {
  onSesionEstablecida: () => void
}

export function VerificarOtpScreen({ onSesionEstablecida }: Props): JSX.Element {
  const [canal] = useState<Canal>('email')
  const [contacto, setContacto] = useState('')
  const [codigo, setCodigo] = useState('')
  const [etapa, setEtapa] = useState<'contacto' | 'codigo'>('contacto')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pedirCodigo(): Promise<void> {
    setCargando(true)
    setError(null)
    try {
      await solicitarOtp(canal, contacto)
      // Mismo mensaje siempre, exista o no el contacto — nunca revela existencia.
      setEtapa('codigo')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo procesar la solicitud.')
    } finally {
      setCargando(false)
    }
  }

  async function confirmar(): Promise<void> {
    setCargando(true)
    setError(null)
    try {
      const resultado = await confirmarOtp(canal, contacto, codigo)
      await establecerSesionDesdeOtp(resultado.email, resultado.hashed_token)
      onSesionEstablecida()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido o vencido.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <View style={{ padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: '600' }}>Aquila External</Text>
      {etapa === 'contacto' ? (
        <>
          <Text>Escribe el correo que crees tener registrado.</Text>
          <TextInput
            value={contacto}
            onChangeText={setContacto}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="tu@correo.com"
            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 }}
          />
          <Button title="Enviar código" onPress={() => void pedirCodigo()} disabled={cargando || contacto.length === 0} />
        </>
      ) : (
        <>
          <Text>Si el contacto está registrado, recibiste un código. Escríbelo aquí.</Text>
          <TextInput
            value={codigo}
            onChangeText={setCodigo}
            keyboardType="number-pad"
            placeholder="123456"
            maxLength={6}
            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 }}
          />
          <Button title="Confirmar" onPress={() => void confirmar()} disabled={cargando || codigo.length !== 6} />
        </>
      )}
      {cargando ? <ActivityIndicator /> : null}
      {error ? <Text style={{ color: '#b91c1c' }}>{error}</Text> : null}
    </View>
  )
}
