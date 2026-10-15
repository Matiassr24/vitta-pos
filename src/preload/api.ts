import { ipcRenderer } from 'electron'
import type {
  AgrupacionReporte,
  CajaSesion,
  Categoria,
  Cliente,
  ClienteInput,
  CompraInput,
  CompraResumen,
  FilaImportada,
  MedioPago,
  MovimientoCaja,
  MovimientoCuentaCorriente,
  MovimientoManualInput,
  OrdenRankingProductos,
  PagoFiadoInput,
  Producto,
  Promocion,
  PromocionInput,
  ProductoAReponer,
  ProductoInput,
  ProductoMasVendido,
  ProductoParado,
  Proveedor,
  ProveedorInput,
  ResumenCaja,
  ResumenImportacion,
  ResumenReposicion,
  Usuario,
  UsuarioInput,
  VentaInput,
  VentaPorPeriodo,
  VentaRegistrada,
  VentaResumen
} from '../shared/types'

export const api = {
  productos: {
    listar: (soloActivos = true): Promise<Producto[]> =>
      ipcRenderer.invoke('productos:listar', soloActivos),
    buscar: (texto: string, soloActivos = true): Promise<Producto[]> =>
      ipcRenderer.invoke('productos:buscar', texto, soloActivos),
    buscarPorCodigo: (codigo: string): Promise<Producto | undefined> =>
      ipcRenderer.invoke('productos:buscarPorCodigo', codigo),
    obtenerPorId: (id: number): Promise<Producto | undefined> =>
      ipcRenderer.invoke('productos:obtenerPorId', id),
    crear: (datos: ProductoInput): Promise<Producto> => ipcRenderer.invoke('productos:crear', datos),
    actualizar: (id: number, datos: ProductoInput): Promise<Producto> =>
      ipcRenderer.invoke('productos:actualizar', id, datos),
    cambiarActivo: (id: number, activo: boolean): Promise<void> =>
      ipcRenderer.invoke('productos:cambiarActivo', id, activo),
    ajustarStockRapido: (id: number, nuevoStock: number, motivo: string): Promise<Producto> =>
      ipcRenderer.invoke('productos:ajustarStockRapido', id, nuevoStock, motivo),
    eliminar: (id: number): Promise<void> => ipcRenderer.invoke('productos:eliminar', id)
  },
  categorias: {
    listar: (): Promise<Categoria[]> => ipcRenderer.invoke('categorias:listar')
  },
  caja: {
    obtenerAbierta: (): Promise<CajaSesion | undefined> => ipcRenderer.invoke('caja:obtenerAbierta'),
    abrir: (montoInicial: number): Promise<CajaSesion> => ipcRenderer.invoke('caja:abrir', montoInicial),
    registrarMovimiento: (input: MovimientoManualInput): Promise<void> =>
      ipcRenderer.invoke('caja:registrarMovimiento', input),
    listarMovimientos: (cajaSesionId: number): Promise<MovimientoCaja[]> =>
      ipcRenderer.invoke('caja:listarMovimientos', cajaSesionId),
    obtenerResumen: (cajaSesionId: number): Promise<ResumenCaja> =>
      ipcRenderer.invoke('caja:obtenerResumen', cajaSesionId),
    cerrar: (cajaSesionId: number, montoDeclarado: number, notas: string | null): Promise<CajaSesion> =>
      ipcRenderer.invoke('caja:cerrar', cajaSesionId, montoDeclarado, notas)
  },
  mediosPago: {
    listar: (): Promise<MedioPago[]> => ipcRenderer.invoke('mediosPago:listar')
  },
  ventas: {
    registrar: (datos: VentaInput): Promise<VentaRegistrada> =>
      ipcRenderer.invoke('ventas:registrar', datos),
    anular: (id: number, motivo: string): Promise<void> => ipcRenderer.invoke('ventas:anular', id, motivo),
    listarRecientes: (cajaSesionId: number): Promise<VentaResumen[]> =>
      ipcRenderer.invoke('ventas:listarRecientes', cajaSesionId)
  },
  proveedores: {
    listar: (): Promise<Proveedor[]> => ipcRenderer.invoke('proveedores:listar'),
    crear: (input: ProveedorInput): Promise<Proveedor> => ipcRenderer.invoke('proveedores:crear', input)
  },
  promociones: {
    listar: (soloActivas = true): Promise<Promocion[]> =>
      ipcRenderer.invoke('promociones:listar', soloActivas),
    crear: (input: PromocionInput): Promise<Promocion> =>
      ipcRenderer.invoke('promociones:crear', input),
    actualizar: (id: number, input: PromocionInput): Promise<Promocion> =>
      ipcRenderer.invoke('promociones:actualizar', id, input),
    cambiarActivo: (id: number, activo: boolean): Promise<void> =>
      ipcRenderer.invoke('promociones:cambiarActivo', id, activo)
  },
  compras: {
    registrar: (input: CompraInput): Promise<number> => ipcRenderer.invoke('compras:registrar', input),
    listarRecientes: (): Promise<CompraResumen[]> => ipcRenderer.invoke('compras:listarRecientes'),
    listarAReponer: (): Promise<ProductoAReponer[]> => ipcRenderer.invoke('compras:listarAReponer')
  },
  clientes: {
    listar: (soloActivos = true): Promise<Cliente[]> => ipcRenderer.invoke('clientes:listar', soloActivos),
    buscar: (texto: string, soloActivos = true): Promise<Cliente[]> =>
      ipcRenderer.invoke('clientes:buscar', texto, soloActivos),
    crear: (input: ClienteInput): Promise<Cliente> => ipcRenderer.invoke('clientes:crear', input),
    actualizar: (id: number, input: ClienteInput): Promise<Cliente> =>
      ipcRenderer.invoke('clientes:actualizar', id, input),
    cambiarActivo: (id: number, activo: boolean): Promise<void> =>
      ipcRenderer.invoke('clientes:cambiarActivo', id, activo),
    listarMovimientos: (clienteId: number): Promise<MovimientoCuentaCorriente[]> =>
      ipcRenderer.invoke('clientes:listarMovimientos', clienteId),
    registrarPago: (input: PagoFiadoInput): Promise<void> =>
      ipcRenderer.invoke('clientes:registrarPago', input)
  },
  reportes: {
    ventasPorPeriodo: (desde: string, hasta: string, agrupacion: AgrupacionReporte): Promise<VentaPorPeriodo[]> =>
      ipcRenderer.invoke('reportes:ventasPorPeriodo', desde, hasta, agrupacion),
    productosMasVendidos: (
      desde: string,
      hasta: string,
      orden?: OrdenRankingProductos,
      limite?: number
    ): Promise<ProductoMasVendido[]> =>
      ipcRenderer.invoke('reportes:productosMasVendidos', desde, hasta, orden, limite),
    productosParados: (diasSinVenta?: number): Promise<ProductoParado[]> =>
      ipcRenderer.invoke('reportes:productosParados', diasSinVenta),
    exportarExcel: (desde: string, hasta: string, agrupacion: AgrupacionReporte): Promise<string | null> =>
      ipcRenderer.invoke('reportes:exportarExcel', desde, hasta, agrupacion),
    reposicionPorCategoria: (desde: string, hasta: string): Promise<ResumenReposicion> =>
      ipcRenderer.invoke('reportes:reposicionPorCategoria', desde, hasta),
    exportarReposicion: (desde: string, hasta: string): Promise<string | null> =>
      ipcRenderer.invoke('reportes:exportarReposicion', desde, hasta)
  },
  usuarios: {
    listar: (soloActivos = true): Promise<Usuario[]> => ipcRenderer.invoke('usuarios:listar', soloActivos),
    crear: (input: UsuarioInput): Promise<Usuario> => ipcRenderer.invoke('usuarios:crear', input),
    actualizar: (id: number, input: UsuarioInput): Promise<Usuario> =>
      ipcRenderer.invoke('usuarios:actualizar', id, input),
    cambiarActivo: (id: number, activo: boolean): Promise<void> =>
      ipcRenderer.invoke('usuarios:cambiarActivo', id, activo),
    iniciarSesion: (usuarioId: number, pin: string | null): Promise<Usuario> =>
      ipcRenderer.invoke('usuarios:iniciarSesion', usuarioId, pin),
    cerrarSesion: (): Promise<void> => ipcRenderer.invoke('usuarios:cerrarSesion'),
    usuarioActivo: (): Promise<Usuario | null> => ipcRenderer.invoke('usuarios:usuarioActivo')
  },
  backup: {
    obtenerCarpeta: (): Promise<string | null> => ipcRenderer.invoke('backup:obtenerCarpeta'),
    elegirCarpeta: (): Promise<string | null> => ipcRenderer.invoke('backup:elegirCarpeta'),
    quitarCarpeta: (): Promise<void> => ipcRenderer.invoke('backup:quitarCarpeta')
  },
  importar: {
    descargarPlantilla: (): Promise<string | null> =>
      ipcRenderer.invoke('importar:descargarPlantilla'),
    elegirArchivo: (): Promise<{ ruta: string; resumen: ResumenImportacion } | null> =>
      ipcRenderer.invoke('importar:elegirArchivo'),
    confirmar: (filas: FilaImportada[]): Promise<number> =>
      ipcRenderer.invoke('importar:confirmar', filas)
  }
}

export type Api = typeof api
