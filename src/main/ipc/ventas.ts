import { ipcMain } from 'electron'
import * as ventasService from '../services/ventas'
import type { VentaInput } from '../../shared/types'

export function registrarIpcVentas(): void {
  ipcMain.handle('ventas:registrar', (_evento, datos: VentaInput) => ventasService.registrar(datos))

  ipcMain.handle('ventas:anular', (_evento, id: number, motivo: string) =>
    ventasService.anular(id, motivo)
  )

  ipcMain.handle('ventas:listarRecientes', (_evento, cajaSesionId: number) =>
    ventasService.listarRecientes(cajaSesionId)
  )
}
