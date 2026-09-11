// EXT-01 entregable 6 — flujo mínimo, no la app completa (esa es
// Casos de uso/Aplicacion Movil/CLAUDE/EXT_APP_MOVIL_PROMPT_MAESTRO.md, un entregable aparte que
// depende también de EXT-02/03/04). Solo el Auth Stack de identidad: OTP -> sesión -> contraseña.
import { useState } from 'react'
import { SafeAreaView } from 'react-native'
import { EstablecerPasswordScreen } from './src/screens/EstablecerPasswordScreen'
import { VerificarOtpScreen } from './src/screens/VerificarOtpScreen'

type Paso = 'otp' | 'password' | 'listo'

export default function App(): JSX.Element {
  const [paso, setPaso] = useState<Paso>('otp')

  return (
    <SafeAreaView style={{ flex: 1 }}>
      {paso === 'otp' ? <VerificarOtpScreen onSesionEstablecida={() => setPaso('password')} /> : null}
      {paso === 'password' ? <EstablecerPasswordScreen onListo={() => setPaso('listo')} /> : null}
    </SafeAreaView>
  )
}
