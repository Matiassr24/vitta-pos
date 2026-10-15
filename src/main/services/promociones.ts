import { getDb } from '../db'
import type { Promocion, PromocionInput, PromocionItem } from '../../shared/types'

interface FilaPromocion {
  id: number
  nombre: string
  precio_promocional: number
  activo: number
  creado_en: string
}

function itemsDe(promocionId: number): PromocionItem[] {
  const db = getDb()
  return db
    .prepare(
      `SELECT pi.producto_id, p.nombre AS producto_nombre, p.unidad AS producto_unidad,
              pi.cantidad, p.precio_venta
       FROM promocion_items pi
       JOIN productos p ON p.id = pi.producto_id
       WHERE pi.promocion_id = ?
       ORDER BY pi.id`
    )
    .all(promocionId) as PromocionItem[]
}

function comoPromocion(fila: FilaPromocion): Promocion {
  return { ...fila, items: itemsDe(fila.id) }
}

export function listar(soloActivas = true): Promocion[] {
  const db = getDb()
  const where = soloActivas ? 'WHERE activo = 1' : ''
  const filas = db
    .prepare(`SELECT * FROM promociones ${where} ORDER BY nombre`)
    .all() as FilaPromocion[]
  return filas.map(comoPromocion)
}

// Una promo tiene que ser una combinación de 2+ productos ("Fernet +
// Coca"), o de un solo producto pero por una cantidad mayor a 1
// ("2 cervezas a $7.000", "2kg de milanesa a $X") — llevando de a uno
// no hay combo, es solo el precio de lista del producto.
function validar(input: PromocionInput): void {
  if (!input.nombre.trim()) throw new Error('El nombre es obligatorio.')
  if (!(input.precio_promocional >= 0)) throw new Error('El precio no puede ser negativo.')
  if (input.items.length === 0) {
    throw new Error('Agregá al menos un producto.')
  }
  if (input.items.some((it) => !(it.cantidad > 0))) {
    throw new Error('La cantidad de cada producto tiene que ser mayor a cero.')
  }
  if (input.items.length === 1 && input.items[0].cantidad <= 1) {
    throw new Error(
      'Con un solo producto, la promo tiene que ser por más de una unidad (ej: 2 cervezas a $7.000). Para un producto suelto, cambiá el precio directamente en Productos.'
    )
  }
}

export function crear(input: PromocionInput): Promocion {
  const db = getDb()
  validar(input)

  const crearTx = db.transaction((): number => {
    const info = db
      .prepare('INSERT INTO promociones (nombre, precio_promocional) VALUES (?, ?)')
      .run(input.nombre.trim(), input.precio_promocional)
    const id = Number(info.lastInsertRowid)

    for (const item of input.items) {
      db.prepare(
        'INSERT INTO promocion_items (promocion_id, producto_id, cantidad) VALUES (?, ?, ?)'
      ).run(id, item.producto_id, item.cantidad)
    }
    return id
  })

  const id = crearTx()
  return comoPromocion(
    db.prepare('SELECT * FROM promociones WHERE id = ?').get(id) as FilaPromocion
  )
}

export function actualizar(id: number, input: PromocionInput): Promocion {
  const db = getDb()
  validar(input)

  const actualizarTx = db.transaction((): void => {
    const info = db
      .prepare('UPDATE promociones SET nombre = ?, precio_promocional = ? WHERE id = ?')
      .run(input.nombre.trim(), input.precio_promocional, id)
    if (info.changes === 0) throw new Error('La promoción no existe.')

    // Reemplazar los items es más simple y seguro que calcular un diff
    // (agregar/quitar/modificar cantidades): una promo tiene pocos
    // productos, así que no hay costo real en rehacerlos enteros.
    db.prepare('DELETE FROM promocion_items WHERE promocion_id = ?').run(id)
    for (const item of input.items) {
      db.prepare(
        'INSERT INTO promocion_items (promocion_id, producto_id, cantidad) VALUES (?, ?, ?)'
      ).run(id, item.producto_id, item.cantidad)
    }
  })

  actualizarTx()
  return comoPromocion(
    db.prepare('SELECT * FROM promociones WHERE id = ?').get(id) as FilaPromocion
  )
}

export function cambiarActivo(id: number, activo: boolean): void {
  const db = getDb()
  db.prepare('UPDATE promociones SET activo = ? WHERE id = ?').run(activo ? 1 : 0, id)
}
