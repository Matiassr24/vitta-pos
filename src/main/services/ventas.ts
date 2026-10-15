import { getDb } from '../db'
import { obtenerAbierta as obtenerCajaAbierta } from './caja'
import { idUsuarioActivo } from '../sesion'
import type { VentaInput, VentaRegistrada, VentaResumen } from '../../shared/types'

interface FilaProductoStock {
  stock: number
}

interface FilaMedioPago {
  afecta_caja_efectivo: number
  es_fiado: number
}

// Registra una venta completa en una sola transacción: si algo falla en
// el medio, no queda stock descontado sin venta, ni venta sin pagos.
// Devuelve el id real y el número corto dentro de la caja (#1, #2...),
// que es el que se muestra en pantalla y en el ticket.
export function registrar(datos: VentaInput): VentaRegistrada {
  const db = getDb()

  const caja = obtenerCajaAbierta()
  if (!caja) throw new Error('No hay una caja abierta. Abrí la caja antes de vender.')
  if (datos.items.length === 0) throw new Error('El ticket está vacío.')

  const subtotal = datos.items.reduce((acc, item) => acc + item.subtotal, 0)
  const costoTotal = datos.items.reduce((acc, item) => acc + item.costo_unitario * item.cantidad, 0)
  const totalPagos = datos.pagos.reduce((acc, pago) => acc + pago.monto, 0)

  if (totalPagos !== subtotal) {
    throw new Error('Los pagos no cubren el total de la venta.')
  }

  const mediosPorId = new Map<number, FilaMedioPago>()
  for (const pago of datos.pagos) {
    if (mediosPorId.has(pago.medio_pago_id)) continue
    const medio = db
      .prepare('SELECT afecta_caja_efectivo, es_fiado FROM medios_pago WHERE id = ?')
      .get(pago.medio_pago_id) as FilaMedioPago | undefined
    if (medio) mediosPorId.set(pago.medio_pago_id, medio)
  }

  const hayFiado = datos.pagos.some((p) => mediosPorId.get(p.medio_pago_id)?.es_fiado)
  if (hayFiado && !datos.cliente_id) {
    throw new Error('Para fiar hay que elegir un cliente.')
  }

  const registrarTx = db.transaction((): VentaRegistrada => {
    const infoVenta = db
      .prepare(
        `INSERT INTO ventas (caja_sesion_id, cliente_id, subtotal, descuento, total, costo_total, usuario_id)
         VALUES (?, ?, ?, 0, ?, ?, ?)`
      )
      .run(caja.id, datos.cliente_id, subtotal, subtotal, costoTotal, idUsuarioActivo())
    const ventaId = Number(infoVenta.lastInsertRowid)

    for (const item of datos.items) {
      db.prepare(
        `INSERT INTO venta_items
           (venta_id, producto_id, nombre, cantidad, precio_unitario, costo_unitario, subtotal,
            promocion_id, promocion_nombre)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        ventaId,
        item.producto_id,
        item.nombre,
        item.cantidad,
        item.precio_unitario,
        item.costo_unitario,
        item.subtotal,
        item.promocion_id ?? null,
        item.promocion_nombre ?? null
      )

      const producto = db
        .prepare('SELECT stock FROM productos WHERE id = ?')
        .get(item.producto_id) as FilaProductoStock | undefined

      if (producto) {
        const nuevoStock = producto.stock - item.cantidad
        db.prepare('UPDATE productos SET stock = ? WHERE id = ?').run(nuevoStock, item.producto_id)
        db.prepare(
          `INSERT INTO movimientos_stock
             (producto_id, tipo, cantidad, stock_resultante, referencia_tabla, referencia_id, usuario_id)
           VALUES (?, 'VENTA', ?, ?, 'ventas', ?, ?)`
        ).run(item.producto_id, -item.cantidad, nuevoStock, ventaId, idUsuarioActivo())
      }
    }

    for (const pago of datos.pagos) {
      db.prepare('INSERT INTO venta_pagos (venta_id, medio_pago_id, monto) VALUES (?, ?, ?)').run(
        ventaId,
        pago.medio_pago_id,
        pago.monto
      )

      const medio = mediosPorId.get(pago.medio_pago_id)

      if (medio && !medio.es_fiado) {
        // Medio normal: la plata entra (o no) a la caja física según
        // corresponda, pero siempre es un ingreso ya cobrado.
        db.prepare(
          `INSERT INTO movimientos_caja
             (caja_sesion_id, tipo, concepto, monto, afecta_efectivo, medio_pago_id,
              referencia_tabla, referencia_id, usuario_id)
           VALUES (?, 'INGRESO', 'VENTA', ?, ?, ?, 'ventas', ?, ?)`
        ).run(
          caja.id,
          pago.monto,
          medio.afecta_caja_efectivo,
          pago.medio_pago_id,
          ventaId,
          idUsuarioActivo()
        )
      } else if (medio && medio.es_fiado && datos.cliente_id) {
        // Fiado: no entra plata a ninguna caja, queda como deuda del
        // cliente — un CARGO en su cuenta corriente.
        const cliente = db.prepare('SELECT saldo FROM clientes WHERE id = ?').get(datos.cliente_id) as
          | { saldo: number }
          | undefined
        if (cliente) {
          const nuevoSaldo = cliente.saldo + pago.monto
          db.prepare('UPDATE clientes SET saldo = ? WHERE id = ?').run(nuevoSaldo, datos.cliente_id)
          db.prepare(
            `INSERT INTO cuenta_corriente (cliente_id, tipo, monto, venta_id, saldo_resultante)
             VALUES (?, 'CARGO', ?, ?, ?)`
          ).run(datos.cliente_id, pago.monto, ventaId, nuevoSaldo)
        }
      }
    }

    const numeroCaja = (
      db
        .prepare('SELECT COUNT(*) AS numero FROM ventas WHERE caja_sesion_id = ? AND id <= ?')
        .get(caja.id, ventaId) as { numero: number }
    ).numero

    return { id: ventaId, numero_caja: numeroCaja }
  })

  return registrarTx()
}

// Nunca se borra una venta: se marca ANULADA y se generan movimientos
// inversos de stock y de caja.
export function anular(id: number, motivo: string): void {
  const db = getDb()

  const anularTx = db.transaction(() => {
    const venta = db
      .prepare('SELECT id, estado, caja_sesion_id, cliente_id FROM ventas WHERE id = ?')
      .get(id) as
      | { id: number; estado: string; caja_sesion_id: number; cliente_id: number | null }
      | undefined
    if (!venta) throw new Error('La venta no existe.')
    if (venta.estado === 'ANULADA') throw new Error('Esa venta ya está anulada.')

    // En pantalla las ventas se numeran dentro de la caja del día (#1,
    // #2...), no por su id histórico — la descripción de la anulación
    // tiene que hablar el mismo idioma para que se entienda a cuál se
    // refiere sin tener que buscarla.
    const numeroEnCaja = (
      db
        .prepare(
          `SELECT COUNT(*) AS numero FROM ventas
           WHERE caja_sesion_id = ? AND id <= ?`
        )
        .get(venta.caja_sesion_id, id) as { numero: number }
    ).numero

    db.prepare(
      `UPDATE ventas
       SET estado = 'ANULADA', anulada_en = datetime('now','localtime'), motivo_anulacion = ?
       WHERE id = ?`
    ).run(motivo, id)

    const items = db
      .prepare('SELECT producto_id, cantidad FROM venta_items WHERE venta_id = ?')
      .all(id) as { producto_id: number; cantidad: number }[]

    for (const item of items) {
      const producto = db
        .prepare('SELECT stock FROM productos WHERE id = ?')
        .get(item.producto_id) as FilaProductoStock | undefined

      if (producto) {
        const nuevoStock = producto.stock + item.cantidad
        db.prepare('UPDATE productos SET stock = ? WHERE id = ?').run(nuevoStock, item.producto_id)
        db.prepare(
          `INSERT INTO movimientos_stock
             (producto_id, tipo, cantidad, stock_resultante, referencia_tabla, referencia_id, motivo, usuario_id)
           VALUES (?, 'ANULACION', ?, ?, 'ventas', ?, ?, ?)`
        ).run(item.producto_id, item.cantidad, nuevoStock, id, motivo, idUsuarioActivo())
      }
    }

    const pagos = db
      .prepare(
        `SELECT vp.medio_pago_id, vp.monto, mp.afecta_caja_efectivo, mp.es_fiado
         FROM venta_pagos vp
         JOIN medios_pago mp ON mp.id = vp.medio_pago_id
         WHERE vp.venta_id = ?`
      )
      .all(id) as {
      medio_pago_id: number
      monto: number
      afecta_caja_efectivo: number
      es_fiado: number
    }[]

    for (const pago of pagos) {
      if (!pago.es_fiado) {
        db.prepare(
          `INSERT INTO movimientos_caja
             (caja_sesion_id, tipo, concepto, monto, afecta_efectivo, medio_pago_id,
              referencia_tabla, referencia_id, descripcion, usuario_id)
           VALUES (?, 'EGRESO', 'AJUSTE', ?, ?, ?, 'ventas', ?, ?, ?)`
        ).run(
          venta.caja_sesion_id,
          pago.monto,
          pago.afecta_caja_efectivo,
          pago.medio_pago_id,
          id,
          `Anulación de venta #${numeroEnCaja}: ${motivo}`,
          idUsuarioActivo()
        )
      } else if (venta.cliente_id) {
        // La deuda que había generado esta venta se cancela, igual que
        // se revierte el stock — queda registrado como un PAGO en la
        // cuenta corriente, aclarando en la nota que es una anulación.
        const cliente = db.prepare('SELECT saldo FROM clientes WHERE id = ?').get(venta.cliente_id) as
          | { saldo: number }
          | undefined
        if (cliente) {
          const nuevoSaldo = cliente.saldo - pago.monto
          db.prepare('UPDATE clientes SET saldo = ? WHERE id = ?').run(nuevoSaldo, venta.cliente_id)
          db.prepare(
            `INSERT INTO cuenta_corriente (cliente_id, tipo, monto, venta_id, saldo_resultante, notas)
             VALUES (?, 'PAGO', ?, ?, ?, ?)`
          ).run(
            venta.cliente_id,
            pago.monto,
            id,
            nuevoSaldo,
            `Anulación de venta #${numeroEnCaja}: ${motivo}`
          )
        }
      }
    }
  })

  anularTx()
}

// numero_caja: la primera venta de esta caja es la #1, sin importar su
// id histórico — es el número que se muestra en pantalla y el que usan
// las descripciones de anulación (ver anular()).
export function listarRecientes(cajaSesionId: number, limite = 20): VentaResumen[] {
  const db = getDb()
  return db
    .prepare(
      `SELECT * FROM (
         SELECT id, fecha, total, estado,
                ROW_NUMBER() OVER (ORDER BY id) AS numero_caja
         FROM ventas
         WHERE caja_sesion_id = ?
       )
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(cajaSesionId, limite) as VentaResumen[]
}
