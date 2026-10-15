import * as XLSX from 'xlsx'
import { getDb } from '../db'
import { idUsuarioActivo } from '../sesion'
import type { FilaImportada, ResumenImportacion, UnidadProducto } from '../../shared/types'

// Los encabezados son el contrato con la persona que llena el Excel: si
// se cambian acá, hay que cambiarlos también en la plantilla.
const COL = {
  nombre: 'Nombre',
  codigo: 'Codigo de barras',
  categoria: 'Categoria',
  proveedor: 'Proveedor',
  unidad: 'Unidad',
  costo: 'Precio de costo',
  margen: 'Margen (%)',
  venta: 'Precio de venta',
  unidadesBulto: 'Unidades por bulto',
  costoBulto: 'Costo del bulto',
  stock: 'Stock actual',
  stockMinimo: 'Stock minimo'
} as const

const UNIDADES: UnidadProducto[] = ['UNIDAD', 'KG', 'LITRO']

// Genera el archivo que la persona va a completar. Lleva ejemplos reales
// del rubro para que se entienda el formato sin leer instrucciones, y
// una hoja aparte con las reglas.
export function generarPlantilla(): Buffer {
  const libro = XLSX.utils.book_new()

  const ejemplos = [
    {
      [COL.nombre]: 'Coca Cola 1.5L',
      [COL.codigo]: '7790895000997',
      [COL.categoria]: 'Bebidas',
      [COL.proveedor]: 'Carrefour',
      [COL.unidad]: 'UNIDAD',
      [COL.costo]: 1800,
      [COL.margen]: 35,
      [COL.venta]: 2450,
      [COL.unidadesBulto]: 6,
      [COL.costoBulto]: 10800,
      [COL.stock]: 12,
      [COL.stockMinimo]: 3
    },
    {
      [COL.nombre]: 'Jamon cocido',
      [COL.codigo]: '',
      [COL.categoria]: 'Fiambrería',
      [COL.proveedor]: '',
      [COL.unidad]: 'KG',
      [COL.costo]: 8500,
      [COL.margen]: 35,
      [COL.venta]: '',
      [COL.unidadesBulto]: 1,
      [COL.costoBulto]: '',
      [COL.stock]: 2.5,
      [COL.stockMinimo]: 1
    },
    {
      [COL.nombre]: 'Cuaderno Rivadavia 48h',
      [COL.codigo]: '7790040000123',
      [COL.categoria]: 'Papelería',
      [COL.proveedor]: '',
      [COL.unidad]: 'UNIDAD',
      [COL.costo]: 2200,
      [COL.margen]: 50,
      [COL.venta]: '',
      [COL.unidadesBulto]: 1,
      [COL.costoBulto]: '',
      [COL.stock]: 8,
      [COL.stockMinimo]: 2
    }
  ]

  const hoja = XLSX.utils.json_to_sheet(ejemplos)
  hoja['!cols'] = [
    { wch: 30 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 15 },
    { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 14 }
  ]
  XLSX.utils.book_append_sheet(libro, hoja, 'Productos')

  const db = getDb()
  const categorias = db.prepare('SELECT nombre FROM categorias WHERE activo = 1 ORDER BY nombre').all() as {
    nombre: string
  }[]

  const instrucciones = [
    ['CÓMO COMPLETAR LA PLANTILLA'],
    [''],
    ['Las tres filas de ejemplo de la hoja "Productos" se pueden borrar.'],
    ['Lo único obligatorio es el Nombre. El resto se puede dejar vacío.'],
    [''],
    ['COLUMNA', 'QUÉ PONER'],
    [COL.nombre, 'Obligatorio. Si se repite dentro del archivo, se avisa antes de importar.'],
    [COL.codigo, 'El número del código de barras. Vacío si el producto no tiene.'],
    [COL.categoria, 'Ver la lista de abajo. Si se escribe una que no existe, se crea.'],
    [COL.proveedor, 'A quién se le compra. Si no existe, se crea.'],
    [COL.unidad, 'UNIDAD, KG o LITRO. Vacío = UNIDAD.'],
    [COL.costo, 'Lo que cuesta UNA unidad (o un kilo). Sin centavos, sin signo $.'],
    [COL.margen, 'Porcentaje de ganancia. Vacío = 35.'],
    [COL.venta, 'Vacío = se calcula solo con el costo y el margen.'],
    [COL.unidadesBulto, 'Cuántas unidades trae el bulto. Vacío = 1.'],
    [COL.costoBulto, 'Lo que se paga por el bulto entero. Opcional.'],
    [COL.stock, 'Cuánto hay hoy. Para KG se puede poner con coma (2,5).'],
    [COL.stockMinimo, 'Cuando el stock baja de acá, aparece en "Para reponer".'],
    [''],
    ['IMPORTANTE'],
    ['Los precios van en pesos enteros, sin centavos y sin el signo $.'],
    ['Escribir 1800, no $1.800 ni 1800,00.'],
    [''],
    ['Si al escribir un código de barras aparece algo como "7,79E+12" en vez'],
    ['del número, es que Excel lo tomó como una cuenta. Seleccioná esa'],
    ['celda, click derecho > Formato de celdas > Texto, y volvé a escribirlo.'],
    [''],
    ['CATEGORÍAS QUE YA EXISTEN'],
    ...categorias.map((c) => [c.nombre])
  ]

  const hojaInstrucciones = XLSX.utils.aoa_to_sheet(instrucciones)
  hojaInstrucciones['!cols'] = [{ wch: 22 }, { wch: 75 }]
  XLSX.utils.book_append_sheet(libro, hojaInstrucciones, 'Instrucciones')

  // bookSST: sin esto, SheetJS graba los textos como tipo "str" (resultado
  // de fórmula) en vez de tipo "s" (texto real de la tabla de strings
  // compartidos) — y Excel reinterpreta ese tipo con el formato General,
  // mostrando un código de barras largo como "7,79E+12" en vez del
  // número real. Verificado inspeccionando el XML del .xlsx generado.
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx', bookSST: true }) as Buffer
}

function textoDe(valor: unknown): string {
  if (valor == null) return ''
  return String(valor).trim()
}

// Acepta "1.800", "1800", "2,5" y 2.5: la persona va a escribir como
// escribe en Argentina, no como espera JavaScript.
function numeroDe(valor: unknown): number | null {
  if (valor == null || valor === '') return null
  if (typeof valor === 'number') return valor
  const limpio = String(valor)
    .trim()
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}\b)/g, '') // punto de miles
    .replace(',', '.')
  if (limpio === '') return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

/**
 * Lee el archivo y valida fila por fila SIN escribir nada en la base.
 * Devuelve qué entraría y qué está mal, para poder mostrarlo antes de
 * confirmar: una carga masiva que ensucia el catálogo es cara de deshacer.
 */
export function analizar(rutaArchivo: string): ResumenImportacion {
  const db = getDb()
  const libro = XLSX.readFile(rutaArchivo)

  const nombreHoja = libro.SheetNames.includes('Productos') ? 'Productos' : libro.SheetNames[0]
  if (!nombreHoja) throw new Error('El archivo no tiene ninguna hoja.')

  const filasCrudas = XLSX.utils.sheet_to_json<Record<string, unknown>>(libro.Sheets[nombreHoja], {
    defval: ''
  })

  const codigosEnBase = new Set(
    (
      db.prepare('SELECT codigo_barras FROM productos WHERE codigo_barras IS NOT NULL').all() as {
        codigo_barras: string
      }[]
    ).map((p) => p.codigo_barras)
  )
  const nombresEnBase = new Set(
    (db.prepare('SELECT nombre FROM productos').all() as { nombre: string }[]).map((p) =>
      p.nombre.toLowerCase()
    )
  )

  const codigosDelArchivo = new Set<string>()
  const nombresDelArchivo = new Set<string>()
  const filas: FilaImportada[] = []

  filasCrudas.forEach((cruda, i) => {
    // +2: la fila 1 son los encabezados y Excel cuenta desde 1.
    const numeroFila = i + 2
    const errores: string[] = []

    const nombre = textoDe(cruda[COL.nombre])
    const codigo = textoDe(cruda[COL.codigo])
    const categoria = textoDe(cruda[COL.categoria])
    const proveedor = textoDe(cruda[COL.proveedor])
    const unidadTexto = textoDe(cruda[COL.unidad]).toUpperCase()

    // Una fila completamente vacía no es un error, es el final de la carga.
    const vacia = !nombre && !codigo && !categoria && !textoDe(cruda[COL.costo])
    if (vacia) return

    if (!nombre) errores.push('Falta el nombre')

    if (nombre) {
      const clave = nombre.toLowerCase()
      if (nombresDelArchivo.has(clave)) errores.push('El nombre está repetido en el archivo')
      else if (nombresEnBase.has(clave)) errores.push('Ya existe un producto con ese nombre')
      nombresDelArchivo.add(clave)
    }

    if (codigo) {
      if (codigosDelArchivo.has(codigo)) errores.push('El código de barras está repetido en el archivo')
      else if (codigosEnBase.has(codigo)) errores.push('Ese código de barras ya está en el sistema')
      codigosDelArchivo.add(codigo)
    }

    const unidad = (unidadTexto || 'UNIDAD') as UnidadProducto
    if (!UNIDADES.includes(unidad)) errores.push(`Unidad "${unidadTexto}" inválida (UNIDAD, KG o LITRO)`)

    const costo = numeroDe(cruda[COL.costo]) ?? 0
    const margen = numeroDe(cruda[COL.margen]) ?? 35
    const unidadesBulto = numeroDe(cruda[COL.unidadesBulto]) ?? 1
    const costoBulto = numeroDe(cruda[COL.costoBulto])
    const stock = numeroDe(cruda[COL.stock]) ?? 0
    const stockMinimo = numeroDe(cruda[COL.stockMinimo]) ?? 0

    if (costo < 0) errores.push('El precio de costo no puede ser negativo')
    if (margen < 0) errores.push('El margen no puede ser negativo')
    if (unidadesBulto <= 0) errores.push('Las unidades por bulto tienen que ser mayor a cero')

    // El precio de venta lo decide una persona, pero si no lo puso, se
    // usa el sugerido (costo + margen), igual que hace el alta manual.
    const ventaExplicita = numeroDe(cruda[COL.venta])
    const precioVenta = ventaExplicita ?? Math.round(costo * (1 + margen / 100))
    if (precioVenta < 0) errores.push('El precio de venta no puede ser negativo')

    filas.push({
      fila: numeroFila,
      nombre,
      codigo_barras: codigo || null,
      categoria: categoria || null,
      proveedor: proveedor || null,
      unidad,
      precio_costo: Math.round(costo),
      margen,
      precio_venta: Math.round(precioVenta),
      unidades_por_bulto: unidadesBulto,
      costo_bulto: costoBulto != null ? Math.round(costoBulto) : null,
      stock,
      stock_minimo: stockMinimo,
      errores
    })
  })

  const categoriasNuevas = [
    ...new Set(
      filas
        .filter((f) => f.errores.length === 0 && f.categoria)
        .map((f) => f.categoria as string)
        .filter((nombre) => !existePorNombre(db, 'categorias', nombre))
    )
  ]
  const proveedoresNuevos = [
    ...new Set(
      filas
        .filter((f) => f.errores.length === 0 && f.proveedor)
        .map((f) => f.proveedor as string)
        .filter((nombre) => !existePorNombre(db, 'proveedores', nombre))
    )
  ]

  return {
    filas,
    validas: filas.filter((f) => f.errores.length === 0).length,
    conError: filas.filter((f) => f.errores.length > 0).length,
    categoriasNuevas,
    proveedoresNuevos
  }
}

function existePorNombre(db: ReturnType<typeof getDb>, tabla: string, nombre: string): boolean {
  const fila = db
    .prepare(`SELECT id FROM ${tabla} WHERE lower(nombre) = lower(?)`)
    .get(nombre.trim()) as { id: number } | undefined
  return fila != null
}

function idPorNombre(db: ReturnType<typeof getDb>, tabla: string, nombre: string): number {
  const fila = db
    .prepare(`SELECT id FROM ${tabla} WHERE lower(nombre) = lower(?)`)
    .get(nombre.trim()) as { id: number } | undefined
  if (fila) return fila.id
  const info = db.prepare(`INSERT INTO ${tabla} (nombre) VALUES (?)`).run(nombre.trim())
  return Number(info.lastInsertRowid)
}

/**
 * Escribe las filas válidas. Todo en una sola transacción: si falla una,
 * no queda medio catálogo cargado sin saber por dónde iba.
 */
export function importar(filas: FilaImportada[]): number {
  const db = getDb()
  const aImportar = filas.filter((f) => f.errores.length === 0)
  if (aImportar.length === 0) throw new Error('No hay filas válidas para importar.')

  const importarTx = db.transaction((): number => {
    for (const f of aImportar) {
      const categoriaId = f.categoria ? idPorNombre(db, 'categorias', f.categoria) : null
      const proveedorId = f.proveedor ? idPorNombre(db, 'proveedores', f.proveedor) : null

      const info = db
        .prepare(
          `INSERT INTO productos
             (codigo_barras, nombre, categoria_id, proveedor_id, unidad,
              precio_costo, margen, precio_venta, unidades_por_bulto, costo_bulto,
              stock, stock_minimo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          f.codigo_barras,
          f.nombre,
          categoriaId,
          proveedorId,
          f.unidad,
          f.precio_costo,
          f.margen,
          f.precio_venta,
          f.unidades_por_bulto,
          f.costo_bulto,
          f.stock,
          f.stock_minimo
        )

      // Misma regla que el alta manual: el stock nunca aparece sin dejar
      // rastro en movimientos_stock.
      if (f.stock !== 0) {
        db.prepare(
          `INSERT INTO movimientos_stock (producto_id, tipo, cantidad, stock_resultante, motivo, usuario_id)
           VALUES (?, 'INICIAL', ?, ?, 'Importación desde Excel', ?)`
        ).run(Number(info.lastInsertRowid), f.stock, f.stock, idUsuarioActivo())
      }
    }
    return aImportar.length
  })

  return importarTx()
}
