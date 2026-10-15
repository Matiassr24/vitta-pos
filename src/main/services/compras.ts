import { getDb } from '../db'
import { obtenerAbierta as obtenerCajaAbierta } from './caja'
import { idUsuarioActivo } from '../sesion'
import type { CompraInput, CompraResumen, ProductoAReponer } from '../../shared/types'

interface FilaProductoStock {
  stock: number
}

// Registra la compra, actualiza stock y costo de cada producto, y si se
// pagó en efectivo del cajón, descuenta la caja — sin tocar el gasto del
// día: reponer stock es un cambio de forma, no un gasto (ver CLAUDE.md).
export function registrar(input: CompraInput): number {
  const db = getDb()

  if (input.items.length === 0) throw new Error('La compra no tiene productos.')

  const total = input.items.reduce((acc, item) => acc + item.subtotal, 0)

  let cajaId: number | null = null
  let medioPagoId: number | null = null

  if (input.pagadaEnEfectivo) {
    const caja = obtenerCajaAbierta()
    if (!caja) throw new Error('No hay una caja abierta para descontar el pago en efectivo.')
    cajaId = caja.id

    const efectivo = db.prepare("SELECT id FROM medios_pago WHERE nombre = 'Efectivo'").get() as
      | { id: number }
      | undefined
    medioPagoId = efectivo?.id ?? null
  }

  const registrarTx = db.transaction((): number => {
    const infoCompra = db
      .prepare(
        `INSERT INTO compras (proveedor_id, numero_comprobante, total, medio_pago_id, caja_sesion_id, notas)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(input.proveedor_id, input.numero_comprobante, total, medioPagoId, cajaId, input.notas)
    const compraId = Number(infoCompra.lastInsertRowid)

    for (const item of input.items) {
      db.prepare(
        `INSERT INTO compra_items (compra_id, producto_id, cantidad, costo_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?)`
      ).run(compraId, item.producto_id, item.cantidad, item.costo_unitario, item.subtotal)

      const producto = db
        .prepare('SELECT stock FROM productos WHERE id = ?')
        .get(item.producto_id) as FilaProductoStock | undefined

      if (producto) {
        const nuevoStock = producto.stock + item.cantidad
        // El costo del producto se actualiza con lo que se pagó ahora;
        // el precio de venta NO se toca acá — eso lo decide una persona
        // (va a quedar resaltado en Productos si difiere del sugerido).
        db.prepare('UPDATE productos SET stock = ?, precio_costo = ? WHERE id = ?').run(
          nuevoStock,
          item.costo_unitario,
          item.producto_id
        )
        db.prepare(
          `INSERT INTO movimientos_stock
             (producto_id, tipo, cantidad, stock_resultante, referencia_tabla, referencia_id, usuario_id)
           VALUES (?, 'COMPRA', ?, ?, 'compras', ?, ?)`
        ).run(item.producto_id, item.cantidad, nuevoStock, compraId, idUsuarioActivo())
      }
    }

    if (cajaId && medioPagoId) {
      db.prepare(
        `INSERT INTO movimientos_caja
           (caja_sesion_id, tipo, concepto, monto, afecta_efectivo, medio_pago_id,
            referencia_tabla, referencia_id, usuario_id)
         VALUES (?, 'EGRESO', 'COMPRA_STOCK', ?, 1, ?, 'compras', ?, ?)`
      ).run(cajaId, total, medioPagoId, compraId, idUsuarioActivo())
    }

    return compraId
  })

  return registrarTx()
}

export function listarRecientes(limite = 20): CompraResumen[] {
  const db = getDb()
  return db
    .prepare(
      `SELECT c.id, c.fecha, c.total, c.numero_comprobante, pr.nombre AS proveedor_nombre
       FROM compras c
       LEFT JOIN proveedores pr ON pr.id = c.proveedor_id
       ORDER BY c.id DESC
       LIMIT ?`
    )
    .all(limite) as CompraResumen[]
}

export function listarAReponer(): ProductoAReponer[] {
  const db = getDb()
  return db.prepare('SELECT * FROM v_reponer').all() as ProductoAReponer[]
}
