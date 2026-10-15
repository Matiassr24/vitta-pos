import { BrowserWindow, dialog, ipcMain } from 'electron'
import * as configService from '../services/config'
import { CLAVE_CARPETA_BACKUP_EXTRA } from '../db'

export function registrarIpcBackup(): void {
  ipcMain.handle('backup:obtenerCarpeta', () => configService.obtener(CLAVE_CARPETA_BACKUP_EXTRA))

  ipcMain.handle('backup:elegirCarpeta', async (evento) => {
    const ventana = BrowserWindow.fromWebContents(evento.sender) ?? undefined
    const resultado = await dialog.showOpenDialog(ventana as BrowserWindow, {
      title: 'Elegir carpeta para la copia de seguridad extra',
      properties: ['openDirectory']
    })
    if (resultado.canceled || resultado.filePaths.length === 0) {
      return configService.obtener(CLAVE_CARPETA_BACKUP_EXTRA)
    }
    const carpeta = resultado.filePaths[0]
    configService.guardar(CLAVE_CARPETA_BACKUP_EXTRA, carpeta)
    return carpeta
  })

  ipcMain.handle('backup:quitarCarpeta', () => {
    configService.guardar(CLAVE_CARPETA_BACKUP_EXTRA, null)
  })
}
