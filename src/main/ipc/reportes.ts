import { BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFileSync } from 'fs'
import * as reportesService from '../services/reportes'
import { armarLibroReposicion, armarLibroVentas } from '../services/exportarExcel'
import type { AgrupacionReporte, OrdenRankingProductos } from '../../shared/types'

export function registrarIpcReportes(): void {
  ipcMain.handle(
    'reportes:ventasPorPeriodo',
    (_evento, desde: string, hasta: string, agrupacion: AgrupacionReporte) =>
      reportesService.ventasPorPeriodo(desde, hasta, agrupacion)
  )
  ipcMain.handle(
    'reportes:productosMasVendidos',
    (_evento, desde: string, hasta: string, orden?: OrdenRankingProductos, limite?: number) =>
      reportesService.productosMasVendidos(desde, hasta, orden, limite)
  )
  ipcMain.handle('reportes:productosParados', (_evento, diasSinVenta?: number) =>
    reportesService.productosParados(diasSinVenta)
  )
  ipcMain.handle('reportes:reposicionPorCategoria', (_evento, desde: string, hasta: string) =>
    reportesService.reposicionPorCategoria(desde, hasta)
  )
  ipcMain.handle(
    'reportes:exportarReposicion',
    async (evento, desde: string, hasta: string) => {
      const libro = armarLibroReposicion(reportesService.reposicionPorCategoria(desde, hasta), desde, hasta)

      const ventana = BrowserWindow.fromWebContents(evento.sender) ?? undefined
      const resultado = await dialog.showSaveDialog(ventana as BrowserWindow, {
        title: 'Exportar reposición a Excel',
        defaultPath: `vitta-reposicion-${desde}-a-${hasta}.xlsx`,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }]
      })
      if (resultado.canceled || !resultado.filePath) return null

      writeFileSync(resultado.filePath, libro)
      return resultado.filePath
    }
  )
  ipcMain.handle(
    'reportes:exportarExcel',
    async (evento, desde: string, hasta: string, agrupacion: AgrupacionReporte) => {
      const ventas = reportesService.ventasPorPeriodo(desde, hasta, agrupacion)
      const masVendidos = reportesService.productosMasVendidos(desde, hasta)
      const parados = reportesService.productosParados()
      const libro = armarLibroVentas(ventas, masVendidos, parados)

      const ventana = BrowserWindow.fromWebContents(evento.sender) ?? undefined
      const resultado = await dialog.showSaveDialog(ventana as BrowserWindow, {
        title: 'Exportar reporte a Excel',
        defaultPath: `vitta-reporte-${desde}-a-${hasta}.xlsx`,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }]
      })
      if (resultado.canceled || !resultado.filePath) return null

      writeFileSync(resultado.filePath, libro)
      return resultado.filePath
    }
  )
}
