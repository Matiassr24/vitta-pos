import Database from 'better-sqlite3'
import { getDb } from '../db'
import { idUsuarioActivo } from '../sesion'
import type { Producto, ProductoInput } from '../../shared/types'

const SELECT_BASE = `
  SELECT p.*, c.nombre AS categoria_nombre, pr.nombre AS proveedor_nombre
  FROM productos p
  LEFT JOIN categorias c ON c.id = p.categoria_id
  LEFT JOIN proveedores pr ON pr.id = p.proveedor_id
`

function comoFilaProducto(datos: ProductoInput): Record<string, unknown> {
  return {
    codigo_barras: datos.codigo_barras || null,
    nombre: datos.nombre.trim(),
    descripcion: datos.descripcion || null,
    categoria_id: datos.categoria_id || null,
    proveedor_id: datos.proveedor_id || null,
    unidad: datos.unidad,
    precio_costo: datos.precio_costo,
    margen: datos.margen,
    precio_venta: datos.precio_venta,
    unidades_por_bulto: datos.unidades_por_bulto,
    costo_bulto: datos.costo_bulto ?? null,
    stock: datos.stock,
    stock_minimo: datos.stock_minimo,
    controla_stock: datos.controla_stock ? 1 : 0
  }
}

// Traduce errores crípticos de SQLite a algo que se entienda en el mostrador.
function conMensajeAmigable<T>(accion: () => T): T {
  try {
    return accion()
  } catch (error) {
    if (error instanceof Database.SqliteError && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('Ya existe otro producto con ese código de barras.')
    }
    throw error
  }
}

export function obtenerPorId(id: number): Producto | undefined {
  const db = getDb()
  return db.prepare(`${SELECT_BASE} WHERE p.id = ?`).get(id) as Producto | undefined
}

export function listar(soloActivos = true): Producto[] {
  const db = getDb()
  const where = soloActivos ? 'WHERE p.activo = 1' : ''
  return db.prepare(`${SELECT_BASE} ${where} ORDER BY p.nombre`).all() as Producto[]
}

export function buscar(texto: string, soloActivos = true): Producto[] {
  const db = getDb()
  const like = `%${texto.trim()}%`
  const filtroActivo = soloActivos ? 'p.activo = 1 AND' : ''
  return db
    .prepare(
      `${SELECT_BASE}
       WHERE ${filtroActivo} (p.nombre LIKE ? OR p.codigo_barras LIKE ?)
       ORDER BY p.nombre
       LIMIT 200`
    )
    .all(like, like) as Producto[]
}

export function buscarPorCodigo(codigo: string): Producto | undefined {
  const db = getDb()
  return db.prepare(`${SELECT_BASE} WHERE p.codigo_barras = ?`).get(codigo) as Producto | undefined
}

export function crear(datos: ProductoInput): Producto {
  const db = getDb()

  const crearTx = db.transaction((datos: ProductoInput): number => {
    const fila = comoFilaProducto(datos)

    const info = db
      .prepare(
        `INSERT INTO productos
           (codigo_barras, nombre, descripcion, categoria_id, proveedor_id, unidad,
            precio_costo, margen, precio_venta, unidades_por_bulto, costo_bulto,
            stock, stock_minimo, controla_stock)
         VALUES
           (@codigo_barras, @nombre, @descripcion, @categoria_id, @proveedor_id, @unidad,
            @precio_costo, @margen, @precio_venta, @unidades_por_bulto, @costo_bulto,
            @stock, @stock_minimo, @controla_stock)`
      )
      .run(fila)

    const id = Number(info.lastInsertRowid)

    if (datos.stock !== 0) {
      db.prepare(
        `INSERT INTO movimientos_stock (producto_id, tipo, cantidad, stock_resultante, motivo, usuario_id)
         VALUES (?, 'INICIAL', ?, ?, 'Alta de producto', ?)`
      ).run(id, datos.stock, datos.stock, idUsuarioActivo())
    }

    return id
  })

  const id = conMensajeAmigable(() => crearTx(datos))
  return obtenerPorId(id)!
}

export function actualizar(id: number, datos: ProductoInput): Producto {
  const db = getDb()

  const actualizarTx = db.transaction((id: number, datos: ProductoInput): void => {
    const anterior = db.prepare('SELECT stock FROM productos WHERE id = ?').get(id) as
      | { stock: number }
      | undefined
    if (!anterior) throw new Error('El producto no existe.')

    const fila = { ...comoFilaProducto(datos), id }

    db.prepare(
      `UPDATE productos SET
         codigo_barras = @codigo_barras,
         nombre = @nombre,
         descripcion = @descripcion,
         categoria_id = @categoria_id,
         proveedor_id = @proveedor_id,
         unidad = @unidad,
         precio_costo = @precio_costo,
         margen = @margen,
         precio_venta = @precio_venta,
         unidades_por_bulto = @unidades_por_bulto,
         costo_bulto = @costo_bulto,
         stock = @stock,
         stock_minimo = @stock_minimo,
         controla_stock = @controla_stock
       WHERE id = @id`
    ).run(fila)

    // El stock nunca se pisa en silencio: si cambió, queda la fila del ajuste.
    const diferencia = datos.stock - anterior.stock
    if (diferencia !== 0) {
      db.prepare(
        `INSERT INTO movimientos_stock (producto_id, tipo, cantidad, stock_resultante, motivo, usuario_id)
         VALUES (?, 'AJUSTE', ?, ?, 'Ajuste manual desde ABM de productos', ?)`
      ).run(id, diferencia, datos.stock, idUsuarioActivo())
    }
  })

  conMensajeAmigable(() => actualizarTx(id, datos))
  return obtenerPorId(id)!
}

// Atajo pensado para el freno de "sin stock" en Venta: en vez de
// mandar a la cajera a Productos a llenar todo el formulario, corrige
// solo el stock ahí mismo. Usa el mismo mecanismo que actualizar()
// (nunca se pisa productos.stock sin dejar rastro en movimientos_stock)
// pero con un motivo propio, para distinguirlo de un ajuste común del ABM.
export function ajustarStockRapido(id: number, nuevoStock: number, motivo: string): Producto {
  const db = getDb()
  if (!(nuevoStock >= 0)) throw new Error('El stock no puede ser negativo.')

  const ajustarTx = db.transaction((): void => {
    const anterior = db.prepare('SELECT stock FROM productos WHERE id = ?').get(id) as
      | { stock: number }
      | undefined
    if (!anterior) throw new Error('El producto no existe.')

    db.prepare('UPDATE productos SET stock = ? WHERE id = ?').run(nuevoStock, id)

    const diferencia = nuevoStock - anterior.stock
    if (diferencia !== 0) {
      db.prepare(
        `INSERT INTO movimientos_stock (producto_id, tipo, cantidad, stock_resultante, motivo, usuario_id)
         VALUES (?, 'AJUSTE', ?, ?, ?, ?)`
      ).run(id, diferencia, nuevoStock, motivo, idUsuarioActivo())
    }
  })

  ajustarTx()
  return obtenerPorId(id)!
}

export function cambiarActivo(id: number, activo: boolean): void {
  const db = getDb()
  db.prepare('UPDATE productos SET activo = ? WHERE id = ?').run(activo ? 1 : 0, id)
}

// Borrado real, solo para productos sin ningún rastro todavía (nunca
// se vendieron, compraron, ni tuvieron un ajuste de stock). Si tiene
// historial, se mantiene la regla del resto del sistema: no se borra,
// se desactiva — perder ese rastro sería peor que el producto quedando
// inactivo en la lista.
export function eliminar(id: number): void {
  const db = getDb()

  const tieneMovimientos = db
    .prepare('SELECT 1 FROM movimientos_stock WHERE producto_id = ? LIMIT 1')
    .get(id)
  const tieneVentas = db.prepare('SELECT 1 FROM venta_items WHERE producto_id = ? LIMIT 1').get(id)
  const tieneCompras = db.prepare('SELECT 1 FROM compra_items WHERE producto_id = ? LIMIT 1').get(id)

  if (tieneMovimientos || tieneVentas || tieneCompras) {
    throw new Error(
      'No se puede borrar: el producto ya tiene movimientos de stock, ventas o compras asociadas. Desactivalo en su lugar.'
    )
  }

  const info = db.prepare('DELETE FROM productos WHERE id = ?').run(id)
  if (info.changes === 0) throw new Error('El producto no existe.')
}
