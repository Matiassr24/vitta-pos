import type { FocusEvent } from 'react'

// En un <input type="number"> el click no selecciona el contenido como
// en un input de texto: si el campo ya tiene un valor (ej. el "0" o un
// monto sugerido), tipear encima lo concatena en vez de reemplazarlo.
// Seleccionar todo al enfocar hace que cualquier tecleo lo reemplace limpio.
export function seleccionarTodoAlEnfocar(evento: FocusEvent<HTMLInputElement>): void {
  evento.target.select()
}

// En Argentina el separador decimal es la coma, no el punto. Un
// <input type="number"> depende de la configuración regional del
// navegador/Electron para aceptar coma, y eso puede variar según la
// máquina — por eso los campos de peso (kg/litro) son <input type="text">
// libres, y esta función interpreta "0,5" y "0.5" por igual sin
// depender de ningún locale.
export function aNumero(texto: string): number {
  return Number(texto.trim().replace(',', '.'))
}

// Inversa de aNumero: para mostrar de vuelta con coma (0.5 -> "0,5")
// después de confirmar un valor, en vez de que salte al punto de
// JavaScript y desentone con lo que la persona tipeó.
export function aTexto(numero: number): string {
  return String(numero).replace('.', ',')
}

// Los buscadores de Venta, Compras y Productos son de doble uso: se
// escanea un código o se escribe un nombre. Si lo tipeado no existe y
// hay que dar de alta el producto, esto decide en qué campo del alta
// rápida cae: los códigos de barras reales (EAN-13, EAN-8, UPC) son
// siempre numéricos, así que cualquier cosa con letras es un nombre.
// El campo queda editable igual, así que un nombre raro que sea puro
// número (ej. "555") se corrige a mano sin drama.
export function pareceCodigoBarras(texto: string): boolean {
  return /^\d+$/.test(texto.trim())
}
