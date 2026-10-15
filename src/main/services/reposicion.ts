import type Database from 'better-sqlite3'
import type {
  ReposicionCategoria,
  ReposicionItem,
  ResumenReposicion
} from '../../shared/types'

// Recibe la base por parámetro (en vez de pedirla con getDb) para poder
// probar el cálculo contra una copia de la base real sin levantar
// Electron — mismo criterio que aplicarMigraciones.
export function calcularReposicion(
  db: Database.Database,
  desde: string,
  hasta: string
): ResumenReposicion {
  // Se agrupa por producto actual (no por el nombre congelado en la
  // venta): un producto renombrado después de venderse tiene que seguir
  // sumando en una sola fila. LEFT JOIN a categorías para que un
  // producto sin categoría aparezca como "Sin categoría" en vez de
  // desaparecer del total sin avisar.
  const filas = db
    .prepare(
      `SELECT COALESCE(c.nombre, 'Sin categoría') AS categoria,
              p.id AS producto_id, p.nombre, p.unidad, p.stock, p.stock_minimo,
              p.controla_stock, p.precio_costo,
              SUM(vi.cantidad) AS cantidad,
              SUM(vi.subtotal) AS facturacion
       FROM venta_items vi
       JOIN ventas v ON v.id = vi.venta_id
       JOIN productos p ON p.id = vi.producto_id
       LEFT JOIN categorias c ON c.id = p.categoria_id
       WHERE v.estado = 'COMPLETADA' AND date(v.fecha) BETWEEN ? AND ?
       GROUP BY p.id
       ORDER BY categoria, p.nombre`
    )
    .all(desde, hasta) as (Omit<ReposicionItem, 'costo_reposicion'> & { categoria: string })[]

  const porCategoria = new Map<string, ReposicionCategoria>()
  let productosSinCosto = 0

  for (const fila of filas) {
    const { categoria, ...resto } = fila
    // Pesos enteros: se redondea por producto, no al final, para que el
    // total de la categoría sea exactamente la suma de lo que se ve.
    const item: ReposicionItem = {
      ...resto,
      costo_reposicion: Math.round(resto.cantidad * resto.precio_costo)
    }
    if (item.precio_costo <= 0) productosSinCosto++

    let grupo = porCategoria.get(categoria)
    if (!grupo) {
      grupo = { categoria, items: [], costo_reposicion: 0, facturacion: 0 }
      porCategoria.set(categoria, grupo)
    }
    grupo.items.push(item)
    grupo.costo_reposicion += item.costo_reposicion
    grupo.facturacion += item.facturacion
  }

  // Alfabético, con "Sin categoría" al final: es el cajón de los
  // pendientes de clasificar, no una categoría más.
  const categorias = [...porCategoria.values()].sort((a, b) => {
    if (a.categoria === 'Sin categoría') return 1
    if (b.categoria === 'Sin categoría') return -1
    return a.categoria.localeCompare(b.categoria, 'es')
  })

  return {
    categorias,
    costo_reposicion_total: categorias.reduce((acc, c) => acc + c.costo_reposicion, 0),
    facturacion_total: categorias.reduce((acc, c) => acc + c.facturacion, 0),
    productos_sin_costo: productosSinCosto
  }
}
