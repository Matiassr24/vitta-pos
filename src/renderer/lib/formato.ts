import type { UnidadProducto } from '../../shared/types'
import { aCantidadChica, unidadChica } from './unidades'

export function formatearPesos(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(valor)
}

// Unidad grande (kg / litro): para stock, compras y el ABM de
// productos, que es como se compra y como se piensa el inventario.
export function formatearCantidad(cantidad: number, unidad: UnidadProducto): string {
  if (unidad === 'UNIDAD') return String(Math.round(cantidad))
  return `${cantidad.toLocaleString('es-AR', { maximumFractionDigits: 3 })} ${unidad.toLowerCase()}`
}

// Unidad chica (g / ml): para todo lo que pasa en el mostrador, donde
// el cliente pide "200 de queso" y nadie habla de 0,2 kg.
export function formatearCantidadVenta(cantidad: number, unidad: UnidadProducto): string {
  if (unidad === 'UNIDAD') return String(Math.round(cantidad))
  return `${aCantidadChica(cantidad, unidad).toLocaleString('es-AR')} ${unidadChica(unidad)}`
}

// Verde si la ganancia quedó a favor, rojo si el día (o el período) dio
// pérdida. Un número negativo se puede pasar por alto leyendo rápido; el
// color rojo no. Devuelve la clase modificadora de `.tarjeta`.
// En cero se queda neutra a propósito: un día todavía sin ventas no es
// una buena noticia, y pintarlo de verde diría lo contrario.
export function claseGanancia(ganancia: number): string {
  if (ganancia < 0) return 'tarjeta--perdida'
  if (ganancia > 0) return 'tarjeta--exito'
  return ''
}

// Las fechas de la base vienen como "YYYY-MM-DD HH:MM:SS" (hora local
// ya resuelta en SQLite) — el espacio en vez de "T" hace que
// `new Date(...)` las interprete mal en algunos navegadores, por eso
// se normaliza antes de parsear.
export function formatearHora(fecha: string): string {
  return new Date(fecha.replace(' ', 'T')).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatearFechaHora(fecha: string): string {
  const fechaDate = new Date(fecha.replace(' ', 'T'))
  return fechaDate.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
