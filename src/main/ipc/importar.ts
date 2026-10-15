import { BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFileSync } from 'fs'
import * as importarService from '../services/importarProductos'
import type { FilaImportada } from '../../shared/types'

export function registrarIpcImportar(): void {
  ipcMain.handle('importar:descargarPlantilla', async (evento) => {
    const libro = importarService.generarPlantilla()

    const ventana = BrowserWindow.fromWebContents(evento.sender) ?? undefined
    const resultado = await dialog.showSaveDialog(ventana as BrowserWindow, {
      title: 'Guardar la plantilla de productos',
      defaultPath: 'vitta-productos.xlsx',
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (resultado.canceled || !resultado.filePath) return null

    writeFileSync(resultado.filePath, libro)
    return resultado.filePath
  })

  ipcMain.handle('importar:elegirArchivo', async (evento) => {
    const ventana = BrowserWindow.fromWebContents(evento.sender) ?? undefined
    const resultado = await dialog.showOpenDialog(ventana as BrowserWindow, {
      title: 'Elegir la planilla de productos',
      properties: ['openFile'],
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }]
    })
    if (resultado.canceled || resultado.filePaths.length === 0) return null

    const ruta = resultado.filePaths[0]
    return { ruta, resumen: importarService.analizar(ruta) }
  })

  ipcMain.handle('importar:confirmar', (_evento, filas: FilaImportada[]) =>
    importarService.importar(filas)
  )
}
