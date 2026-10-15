import { ipcMain } from 'electron'
import * as cajaService from '../services/caja'
import type { MovimientoManualInput } from '../../shared/types'

export function registrarIpcCaja(): void {
  ipcMain.handle('caja:obtenerAbierta', () => cajaService.obtenerAbierta())

  ipcMain.handle('caja:abrir', (_evento, montoInicial: number) => cajaService.abrir(montoInicial))

  ipcMain.handle('caja:registrarMovimiento', (_evento, input: MovimientoManualInput) =>
    cajaService.registrarMovimiento(input)
  )

  ipcMain.handle('caja:listarMovimientos', (_evento, cajaSesionId: number) =>
    cajaService.listarMovimientos(cajaSesionId)
  )

  ipcMain.handle('caja:obtenerResumen', (_evento, cajaSesionId: number) =>
    cajaService.obtenerResumen(cajaSesionId)
  )

  ipcMain.handle(
    'caja:cerrar',
    (_evento, cajaSesionId: number, montoDeclarado: number, notas: string | null) =>
      cajaService.cerrar(cajaSesionId, montoDeclarado, notas)
  )
}
