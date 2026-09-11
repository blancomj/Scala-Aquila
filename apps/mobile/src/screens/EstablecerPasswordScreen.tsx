// EXT-01 entregable 6 — "solo en el primer ingreso, la app pide establecer una contraseña"
// (spec §3.2), YA con sesión abierta (viene después de VerificarOtpScreen). De ahí en adelante
// el ingreso es correo + contraseña, con "olvidé mi contraseña" resuelto por el flujo nativo de
// Supabase Auth (EXT_APP_MOVIL_PROMPT_MAESTRO.md §5.1) — nunca uno propio.
import { useState } from 'react'
import { ActivityIndicator, Button, Text, TextInput, View } from 'react-native'
import { supabase } from '../session/cliente'

interface Props {
  onListo: () => void
}

export function EstablecerPasswordScreen({ onListo }: Props): JSX.Element {
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(): Promise<void> {
    setCargando(true)
    setError(null)
    const { error: errorActualizar } = await supabase.auth.updateUser({ password })
    setCargando(false)
    if (errorActualizar) {
      setError(errorActualizar.message)
      return
    }
    onListo()
  }

  return (
    <View style={{ padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: '600' }}>Crea tu contraseña</Text>
      <Text>La usarás para volver a entrar sin pedir un código cada vez.</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Contraseña"
        style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 }}
      />
      <Button title="Guardar" onPress={() => void guardar()} disabled={cargando || password.length < 8} />
      {cargando ? <ActivityIndicator /> : null}
      {error ? <Text style={{ color: '#b91c1c' }}>{error}</Text> : null}
    </View>
  )
}
