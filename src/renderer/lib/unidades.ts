import type { UnidadProducto } from '../../shared/types'

// Los pesables se GUARDAN en su unidad grande (kilos, litros), porque
// ahí es donde vive el precio: el proveedor factura $/kg y la dueña
// piensa "el queso está a 13 lucas el kilo".
//
// Pero en el mostrador se pide en gramos ("dame 200 de queso"), y
// tipear 0,2 es incómodo y fácil de errar. Por eso la unidad chica
// (g / ml) es SOLO de pantalla y tecleo: se convierte al entrar y al
// salir del campo, y el precio nunca se divide por mil.
//
// Esto último es la razón de fondo, no un detalle: si guardáramos el
// precio por gramo, el pan a $1.800/kg daría $1,80 el gramo, que no es
// un peso entero. Redondeado a $2, medio kilo de pan saldría $1.000 en
// vez de $900 — un 11% de más, en todo producto cuyo precio por kilo no
// sea múltiplo de 1000, o sea casi todos.
const FACTOR = 1000

export function esPesable(unidad: UnidadProducto): boolean {
  return unidad !== 'UNIDAD'
}

// Cómo se nombra la unidad chica, la que ve y teclea la cajera.
export function unidadChica(unidad: UnidadProducto): string {
  if (unidad === 'KG') return 'g'
  if (unidad === 'LITRO') return 'ml'
  return ''
}

// Cómo se nombra la unidad grande: la del precio, la compra y el stock.
export function unidadGrande(unidad: UnidadProducto): string {
  if (unidad === 'KG') return 'kg'
  if (unidad === 'LITRO') return 'L'
  return ''
}

// De lo que se teclea (200 g) a lo que se guarda (0,2 kg).
export function aCantidadGuardada(valorChico: number, unidad: UnidadProducto): number {
  return esPesable(unidad) ? valorChico / FACTOR : valorChico
}

// De lo guardado (0,2 kg) a lo que se muestra en el campo (200 g).
// Se redondea porque un 0,2 en punto flotante puede venir como
// 0,20000000000000004, y "200,00000000000003 g" en el mostrador es
// inaceptable.
export function aCantidadChica(cantidad: number, unidad: UnidadProducto): number {
  return esPesable(unidad) ? Math.round(cantidad * FACTOR) : cantidad
}

// Cuánto arranca un pesable recién agregado al ticket: 100 g / 100 ml.
// El campo queda seleccionado para que la cajera tipee lo que marca la
// balanza encima, así que este valor casi nunca se cobra tal cual — es
// a propósito el pedido más típico de fiambrería, para que un descuido
// cueste poco (a diferencia de arrancar en 1 kg).
export const CANTIDAD_INICIAL_PESABLE = 0.1
