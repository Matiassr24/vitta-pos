import { ipcMain } from 'electron'
import * as mediosPagoService from '../services/mediosPago'

export function registrarIpcMediosPago(): void {
  ipcMain.handle('mediosPago:listar', () => mediosPagoService.listarActivos())
}
