// Cuando un handler de ipcMain tira un error, Electron lo envuelve con
// un prefijo técnico antes de que llegue a la promesa del renderer:
// "Error invoking remote method 'productos:crear': Error: <mensaje real>"
// Esto lo saca para mostrar solo el mensaje que escribimos nosotros.
export function mensajeDeError(error: unknown, mensajePorDefecto: string): string {
  if (!(error instanceof Error)) return mensajePorDefecto
  const limpio = error.message.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '')
  return limpio || mensajePorDefecto
}
