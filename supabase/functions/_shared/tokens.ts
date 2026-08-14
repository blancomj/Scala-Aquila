// AD-04: el token en claro solo existe en el email — se genera aquí, se
// hashea aquí, y solo el hash (`token_hash`) viaja a la base de datos.

function aHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function generarToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return aHex(bytes)
}

// Hashea la representación hex del token (no los bytes crudos) — invite-user
// y accept-invitation deben hashear exactamente lo mismo para que el
// token_hash coincida; hashear el string es más simple que decodificar hex
// de vuelta a bytes en el lado de accept-invitation.
export async function hashToken(token: string): Promise<string> {
  const datos = new TextEncoder().encode(token)
  const buffer = await crypto.subtle.digest('SHA-256', datos)
  return aHex(new Uint8Array(buffer))
}
