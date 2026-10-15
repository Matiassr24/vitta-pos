export type UnidadProducto = 'UNIDAD' | 'KG' | 'LITRO'

export type RolUsuario = 'ADMIN' | 'VENDEDOR'

export interface Usuario {
  id: number
  nombre: string
  rol: RolUsuario
  activo: number
  // Derivado de pin_hash en el service: nunca se manda el hash al renderer.
  tiene_pin: boolean
}

export interface UsuarioInput {
  nombre: string
  rol: RolUsuario
  // Solo se manda al crear o al cambiar el PIN explícitamente. null = no tocar.
  pin: string | null
}

export interface Categoria {
  id: number
  nombre: string
  activo: number
}

export interface Producto {
  id: number
  codigo_barras: string | null
  nombre: string
  descripcion: string | null
  categoria_id: number | null
  categoria_nombre: string | null
  proveedor_id: number | null
  proveedor_nombre: string | null
  unidad: UnidadProducto
  precio_costo: number
  margen: number
  precio_venta: number
  precio_sugerido: number
  unidades_por_bulto: number
  costo_bulto: number | null
  stock: number
  stock_minimo: number
  controla_stock: number
  activo: number
  creado_en: string
  actualizado_en: string
}

export interface ProductoInput {
  codigo_barras: string | null
  nombre: string
  descripcion: string | null
  categoria_id: number | null
  proveedor_id: number | null
  unidad: UnidadProducto
  precio_costo: number
  margen: number
  precio_venta: number
  unidades_por_bulto: number
  costo_bulto: number | null
  stock: number
  stock_minimo: number
  controla_stock: boolean
}

// Una fila del Excel ya interpretada y validada, antes de escribirse.
// Los nombres de categoría y proveedor viajan como texto (no como id)
// porque quien llena la planilla escribe nombres, no números.
export interface FilaImportada {
  fila: number
  nombre: string
  codigo_barras: string | null
  categoria: string | null
  proveedor: string | null
  unidad: UnidadProducto
  precio_costo: number
  margen: number
  precio_venta: number
  unidades_por_bulto: number
  costo_bulto: number | null
  stock: number
  stock_minimo: number
  errores: string[]
}

export interface ResumenImportacion {
  filas: FilaImportada[]
  validas: number
  conError: number
  // Las que se van a crear al confirmar: se muestran antes para que no
  // aparezcan categorías o proveedores nuevos por un error de tipeo.
  categoriasNuevas: string[]
  proveedoresNuevos: string[]
}

// Una promo combina productos que ya existen (Fernet + Coca) a un
// precio de conjunto — no es un producto nuevo ni tiene stock propio.
// Al venderse, se descuenta el stock real de cada producto componente.
export interface PromocionItem {
  producto_id: number
  producto_nombre: string
  producto_unidad: UnidadProducto
  // Cuánto de este producto lleva UNA unidad de la promo (0.2 = 200g).
  cantidad: number
  // Precio de venta ACTUAL del producto (no un snapshot): sirve para
  // calcular "cuánto ahorra" contra la suma de precios sueltos.
  precio_venta: number
}

export interface Promocion {
  id: number
  nombre: string
  precio_promocional: number
  activo: number
  creado_en: string
  items: PromocionItem[]
}

export interface PromocionInput {
  nombre: string
  precio_promocional: number
  items: { producto_id: number; cantidad: number }[]
}

export interface MedioPago {
  id: number
  nombre: string
  afecta_caja_efectivo: number
  es_fiado: number
  orden: number
  activo: number
}

export interface CajaSesion {
  id: number
  fecha_apertura: string
  monto_inicial: number
  fecha_cierre: string | null
  monto_declarado: number | null
  monto_esperado: number | null
  diferencia: number | null
  usuario_id: number | null
  notas: string | null
  estado: 'ABIERTA' | 'CERRADA'
}

export interface VentaItemInput {
  producto_id: number
  nombre: string
  cantidad: number
  precio_unitario: number
  costo_unitario: number
  subtotal: number
  // Si esta línea viene de una promo, queda marcada acá — ver Promocion.
  promocion_id?: number | null
  promocion_nombre?: string | null
}

export interface VentaPagoInput {
  medio_pago_id: number
  monto: number
}

export interface VentaInput {
  items: VentaItemInput[]
  pagos: VentaPagoInput[]
  cliente_id: number | null
}

export interface VentaRegistrada {
  id: number
  numero_caja: number
}

export interface VentaResumen {
  id: number
  fecha: string
  total: number
  estado: 'COMPLETADA' | 'ANULADA'
  // Numeración corta dentro de la caja del día: la primera venta es la
  // #1. Es lo que se muestra en pantalla, no el id histórico.
  numero_caja: number
}

export type TipoMovimientoManual = 'RETIRO' | 'APORTE' | 'GASTO'

export interface MovimientoCaja {
  id: number
  caja_sesion_id: number
  fecha: string
  tipo: 'INGRESO' | 'EGRESO'
  concepto: 'VENTA' | 'COBRO_FIADO' | 'APORTE' | 'COMPRA_STOCK' | 'GASTO' | 'RETIRO' | 'AJUSTE'
  monto: number
  afecta_efectivo: number
  medio_pago_id: number | null
  descripcion: string | null
  referencia_tabla: string | null
  referencia_id: number | null
  // Nombre del medio de pago ('Efectivo', 'Transferencia...'), para no
  // tener que cruzar la tabla en el renderer.
  medio_pago_nombre: string | null
  // Numeración corta dentro de esta caja: la primera venta del día es
  // la #1, sin importar el id histórico de la tabla ventas.
  numero_venta_caja: number | null
  // Productos de la venta, separados por coma.
  detalle_venta: string | null
  // 1 en las filas de fiado, que NO son movimientos de caja reales (no
  // entró plata a ningún lado) — se listan igual para que el día quede
  // completo, pero se muestran distinto.
  es_fiado: number
  cliente_nombre: string | null
}

export interface MovimientoManualInput {
  tipo: TipoMovimientoManual
  monto: number
  descripcion: string | null
}

export interface VentaPorMedio {
  medio_pago_id: number
  nombre: string
  total: number
}

export interface ResumenCaja {
  caja_sesion_id: number
  fecha_apertura: string
  monto_inicial: number
  efectivo_esperado: number
  ingresos_efectivo: number
  egresos_efectivo: number
  facturacion_total: number
  costo_mercaderia: number
  ganancia_bruta: number
  gastos: number
  retiros: number
  aportes: number
  ganancia_neta: number
  cantidad_ventas: number
  ventas_por_medio: VentaPorMedio[]
  compras_hoy: number
}

export interface Proveedor {
  id: number
  nombre: string
  telefono: string | null
  email: string | null
  notas: string | null
  activo: number
}

export interface ProveedorInput {
  nombre: string
  telefono: string | null
  email: string | null
  notas: string | null
}

export interface CompraItemInput {
  producto_id: number
  cantidad: number
  costo_unitario: number
  subtotal: number
}

export interface CompraInput {
  proveedor_id: number | null
  numero_comprobante: string | null
  pagadaEnEfectivo: boolean
  notas: string | null
  items: CompraItemInput[]
}

export interface CompraResumen {
  id: number
  fecha: string
  proveedor_nombre: string | null
  total: number
  numero_comprobante: string | null
}

export interface ProductoAReponer {
  id: number
  nombre: string
  stock: number
  stock_minimo: number
  faltante: number
  proveedor: string | null
}

export interface Cliente {
  id: number
  nombre: string
  telefono: string | null
  direccion: string | null
  // Positivo = el cliente debe plata.
  saldo: number
  // 0 = todavía no se configuró un límite para este cliente (no avisar).
  limite_credito: number
  notas: string | null
  activo: number
  creado_en: string
}

export interface ClienteInput {
  nombre: string
  telefono: string | null
  direccion: string | null
  limite_credito: number
  notas: string | null
}

export interface MovimientoCuentaCorriente {
  id: number
  cliente_id: number
  fecha: string
  tipo: 'CARGO' | 'PAGO'
  monto: number
  venta_id: number | null
  saldo_resultante: number
  notas: string | null
  // Lista de productos de la venta que generó el CARGO (separados por
  // coma), solo para mostrar contexto en el historial. Null en los PAGO.
  detalle_venta: string | null
}

export interface PagoFiadoInput {
  cliente_id: number
  monto: number
  pagadaEnEfectivo: boolean
  notas: string | null
}

export type AgrupacionReporte = 'dia' | 'semana' | 'mes'

// Dos lecturas distintas de "lo más vendido": lo que más se mueve en
// cantidad (útil para reposición) no siempre es lo que más plata deja
// (útil para precios/promociones) — a veces ni se parecen.
export type OrdenRankingProductos = 'unidades' | 'ganancia'

export interface VentaPorPeriodo {
  periodo: string
  cantidad_ventas: number
  facturacion: number
  costo: number
  ganancia_bruta: number
  gastos: number
  ganancia_neta: number
}

export interface ProductoMasVendido {
  producto_id: number
  nombre: string
  unidades: number
  facturacion: number
  ganancia: number
}

export interface ProductoParado {
  id: number
  nombre: string
  stock: number
  valor_stock: number
  ultima_venta: string | null
  dias_sin_venta: number | null
}

// Resumen de reposición: lo vendido en un período, por categoría, con lo
// que costaría volver a comprarlo. `costo_reposicion` es cantidad vendida
// × costo ACTUAL del producto (no el costo congelado en la venta): la
// pregunta es "cuánta plata separo para reponer hoy", no cuánto costó
// lo que se vendió.
export interface ReposicionItem {
  producto_id: number
  nombre: string
  unidad: UnidadProducto
  cantidad: number
  stock: number
  stock_minimo: number
  controla_stock: number
  precio_costo: number
  costo_reposicion: number
  facturacion: number
}

export interface ReposicionCategoria {
  categoria: string
  items: ReposicionItem[]
  costo_reposicion: number
  facturacion: number
}

export interface ResumenReposicion {
  categorias: ReposicionCategoria[]
  costo_reposicion_total: number
  facturacion_total: number
  // Productos vendidos cuyo costo está en $0 (se desconoce): no aportan
  // al monto a reponer, así que el total queda corto. Se avisa en pantalla.
  productos_sin_costo: number
}
