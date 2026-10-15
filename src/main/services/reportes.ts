import { getDb } from '../db'
import { calcularReposicion } from './reposicion'
import type {
  AgrupacionReporte,
  OrdenRankingProductos,
  ProductoMasVendido,
  ProductoParado,
  ResumenReposicion,
  VentaPorPeriodo
} from '../../shared/types'

export function reposicionPorCategoria(desde: string, hasta: string): ResumenReposicion {
  return calcularReposicion(getDb(), desde, hasta)
}

// Agrupa por día, por semana (etiquetada con el lunes de esa semana) o
// por mes. Se arma como texto SQL porque better-sqlite3 no permite
// parametrizar la expresión del GROUP BY, solo los valores.
function expresionPeriodo(agrupacion: AgrupacionReporte, columna: string): string {
  switch (agrupacion) {
    case 'dia':
      return `date(${columna})`
    case 'semana':
      return `date(${columna}, '-' || ((CAST(strftime('%w', ${columna}) AS INTEGER) + 6) % 7) || ' days')`
    case 'mes':
      return `strftime('%Y-%m', ${columna})`
  }
}

export function ventasPorPeriodo(
  desde: string,
  hasta: string,
  agrupacion: AgrupacionReporte
): VentaPorPeriodo[] {
  const db = getDb()
  const periodoVentas = expresionPeriodo(agrupacion, 'fecha')
  const periodoGastos = expresionPeriodo(agrupacion, 'mc.fecha')

  const filas = db
    .prepare(
      `SELECT ${periodoVentas} AS periodo,
              COUNT(*) AS cantidad_ventas,
              SUM(total) AS facturacion,
              SUM(costo_total) AS costo,
              SUM(total) - SUM(costo_total) AS ganancia_bruta
       FROM ventas
       WHERE estado = 'COMPLETADA' AND date(fecha) BETWEEN ? AND ?
       GROUP BY periodo
       ORDER BY periodo`
    )
    .all(desde, hasta) as {
    periodo: string
    cantidad_ventas: number
    facturacion: number
    costo: number
    ganancia_bruta: number
  }[]

  const gastosFilas = db
    .prepare(
      `SELECT ${periodoGastos} AS periodo, SUM(monto) AS gastos
       FROM movimientos_caja mc
       WHERE concepto = 'GASTO' AND date(mc.fecha) BETWEEN ? AND ?
       GROUP BY periodo`
    )
    .all(desde, hasta) as { periodo: string; gastos: number }[]

  const gastosPorPeriodo = new Map(gastosFilas.map((g) => [g.periodo, g.gastos]))

  return filas.map((f) => {
    const gastos = gastosPorPeriodo.get(f.periodo) ?? 0
    return {
      periodo: f.periodo,
      cantidad_ventas: f.cantidad_ventas,
      facturacion: f.facturacion,
      costo: f.costo,
      ganancia_bruta: f.ganancia_bruta,
      gastos,
      ganancia_neta: f.ganancia_bruta - gastos
    }
  })
}

export function productosMasVendidos(
  desde: string,
  hasta: string,
  orden: OrdenRankingProductos = 'unidades',
  limite = 15
): ProductoMasVendido[] {
  const db = getDb()
  const columnaOrden = orden === 'ganancia' ? 'ganancia' : 'unidades'
  return db
    .prepare(
      `SELECT vi.producto_id, vi.nombre,
              SUM(vi.cantidad) AS unidades,
              SUM(vi.subtotal) AS facturacion,
              SUM(vi.subtotal - vi.costo_unitario * vi.cantidad) AS ganancia
       FROM venta_items vi
       JOIN ventas v ON v.id = vi.venta_id
       WHERE v.estado = 'COMPLETADA' AND date(v.fecha) BETWEEN ? AND ?
       GROUP BY vi.producto_id, vi.nombre
       ORDER BY ${columnaOrden} DESC
       LIMIT ?`
    )
    .all(desde, hasta, limite) as ProductoMasVendido[]
}

// Plata dormida en el estante: productos con stock que no se vendieron
// en los últimos N días (o nunca se vendieron).
export function productosParados(diasSinVenta = 30): ProductoParado[] {
  const db = getDb()
  return db
    .prepare(
      `SELECT p.id, p.nombre, p.stock, p.stock * p.precio_costo AS valor_stock,
              ultima.fecha AS ultima_venta,
              CASE WHEN ultima.fecha IS NULL THEN NULL
                   ELSE CAST(julianday('now','localtime') - julianday(ultima.fecha) AS INTEGER)
              END AS dias_sin_venta
       FROM productos p
       LEFT JOIN (
         SELECT vi.producto_id, MAX(v.fecha) AS fecha
         FROM venta_items vi
         JOIN ventas v ON v.id = vi.venta_id
         WHERE v.estado = 'COMPLETADA'
         GROUP BY vi.producto_id
       ) ultima ON ultima.producto_id = p.id
       WHERE p.activo = 1
         AND p.stock > 0
         AND (ultima.fecha IS NULL OR julianday('now','localtime') - julianday(ultima.fecha) >= ?)
       ORDER BY valor_stock DESC`
    )
    .all(diasSinVenta) as ProductoParado[]
}
