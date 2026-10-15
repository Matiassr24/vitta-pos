let contexto: AudioContext | null = null

function obtenerContexto(): AudioContext {
  if (!contexto) contexto = new AudioContext()
  return contexto
}

function tono(frecuencia: number, duracionMs: number): void {
  const ctx = obtenerContexto()
  const oscilador = ctx.createOscillator()
  const ganancia = ctx.createGain()

  oscilador.type = 'sine'
  oscilador.frequency.value = frecuencia
  ganancia.gain.value = 0.15

  oscilador.connect(ganancia)
  ganancia.connect(ctx.destination)

  oscilador.start()
  oscilador.stop(ctx.currentTime + duracionMs / 1000)
}

// Agudo y corto: el producto se encontró.
export function beepOk(): void {
  tono(880, 120)
}

// Grave y más largo: código desconocido, código no encontrado.
export function beepError(): void {
  tono(220, 250)
}
