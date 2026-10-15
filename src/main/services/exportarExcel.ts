import * as XLSX from 'xlsx'
import type {
  ProductoMasVendido,
  ProductoParado,
  ResumenReposicion,
  VentaPorPeriodo
} from '../../shared/types'

// En reposición la cantidad se expresa en la unidad grande (kg / L): es
// como se compra al proveedor, igual que en la pantalla de Compras.
const ETIQUETA_UNIDAD = { UNIDAD: 'u.', KG: 'kg', LITRO: 'L' } as const

export function armarLibroReposicion(resumen: ResumenReposicion, desde: string, hasta: string): Buffer {
  const libro = XLSX.utils.book_new()

  // Hoja 1: una fila por categoría, con el total a separar al final. Es
  // la que responde "cuánta plata separo para reponer".
  const filasResumen: (string | number)[][] = [
    ['Reposición', `${desde} a ${hasta}`],
    [],
    ['Categoría', 'Productos', 'A reponer ($)', 'Facturado ($)']
  ]
  for (const c of resumen.categorias) {
    filasResumen.push([c.categoria, c.items.length, c.costo_reposicion, c.facturacion])
  }
  filasResumen.push([
    'TOTAL',
    resumen.categorias.reduce((acc, c) => acc + c.items.length, 0),
    resumen.costo_reposicion_total,
    resumen.facturacion_total
  ])
  if (resumen.productos_sin_costo > 0) {
    filasResumen.push([])
    filasResumen.push([
      `Ojo: ${resumen.productos_sin_costo} producto(s) vendido(s) no tienen costo cargado y no suman al total a reponer.`
    ])
  }
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filasResumen), 'Por categoría')

  // Hoja 2: el detalle producto por producto, plano (sin filas de
  // subtotal intercaladas) para que se pueda filtrar y ordenar en Excel.
  const hojaDetalle = XLSX.utils.json_to_sheet(
    resumen.categorias.flatMap((c) =>
      c.items.map((i) => ({
        Categoría: c.categoria,
        Producto: i.nombre,
        Vendido: i.cantidad,
        Unidad: ETIQUETA_UNIDAD[i.unidad],
        'Stock actual': i.controla_stock ? i.stock : '',
        'Costo unitario ($)': i.precio_costo,
        'A reponer ($)': i.costo_reposicion,
        'Facturado ($)': i.facturacion
      }))
    )
  )
  XLSX.utils.book_append_sheet(libro, hojaDetalle, 'Detalle')

  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx', bookSST: true }) as Buffer
}

// Separado del resto de reportes.ts para que el armado del archivo se
// pueda probar con datos de prueba sin tocar la base ni Electron.
export function armarLibroVentas(
  ventas: VentaPorPeriodo[],
  masVendidos: ProductoMasVendido[],
  parados: ProductoParado[]
): Buffer {
  const libro = XLSX.utils.book_new()

  const hojaVentas = XLSX.utils.json_to_sheet(
    ventas.map((f) => ({
      Período: f.periodo,
      'Cant. ventas': f.cantidad_ventas,
      Facturación: f.facturacion,
      Costo: f.costo,
      'Ganancia bruta': f.ganancia_bruta,
      Gastos: f.gastos,
      'Ganancia neta': f.ganancia_neta
    }))
  )
  XLSX.utils.book_append_sheet(libro, hojaVentas, 'Ventas por período')

  const hojaMasVendidos = XLSX.utils.json_to_sheet(
    masVendidos.map((p) => ({
      Producto: p.nombre,
      Unidades: p.unidades,
      Facturación: p.facturacion,
      Ganancia: p.ganancia
    }))
  )
  XLSX.utils.book_append_sheet(libro, hojaMasVendidos, 'Más vendidos')

  const hojaParados = XLSX.utils.json_to_sheet(
    parados.map((p) => ({
      Producto: p.nombre,
      Stock: p.stock,
      'Valor inmovilizado': p.valor_stock,
      'Última venta': p.ultima_venta ?? 'Nunca',
      'Días sin venta': p.dias_sin_venta ?? ''
    }))
  )
  XLSX.utils.book_append_sheet(libro, hojaParados, 'Productos parados')

  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
