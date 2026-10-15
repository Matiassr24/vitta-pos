import { ipcMain } from 'electron'
import * as productosService from '../services/productos'
import type { ProductoInput } from '../../shared/types'

export function registrarIpcProductos(): void {
  ipcMain.handle('productos:listar', (_evento, soloActivos?: boolean) =>
    productosService.listar(soloActivos ?? true)
  )

  ipcMain.handle('productos:buscar', (_evento, texto: string, soloActivos?: boolean) =>
    productosService.buscar(texto, soloActivos ?? true)
  )

  ipcMain.handle('productos:buscarPorCodigo', (_evento, codigo: string) =>
    productosService.buscarPorCodigo(codigo)
  )

  ipcMain.handle('productos:obtenerPorId', (_evento, id: number) => productosService.obtenerPorId(id))

  ipcMain.handle('productos:crear', (_evento, datos: ProductoInput) => productosService.crear(datos))

  ipcMain.handle('productos:actualizar', (_evento, id: number, datos: ProductoInput) =>
    productosService.actualizar(id, datos)
  )

  ipcMain.handle('productos:cambiarActivo', (_evento, id: number, activo: boolean) =>
    productosService.cambiarActivo(id, activo)
  )

  ipcMain.handle(
    'productos:ajustarStockRapido',
    (_evento, id: number, nuevoStock: number, motivo: string) =>
      productosService.ajustarStockRapido(id, nuevoStock, motivo)
  )

  ipcMain.handle('productos:eliminar', (_evento, id: number) => productosService.eliminar(id))
}
