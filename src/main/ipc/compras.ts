import { ipcMain } from 'electron'
import * as comprasService from '../services/compras'
import type { CompraInput } from '../../shared/types'

export function registrarIpcCompras(): void {
  ipcMain.handle('compras:registrar', (_evento, input: CompraInput) => comprasService.registrar(input))
  ipcMain.handle('compras:listarRecientes', () => comprasService.listarRecientes())
  ipcMain.handle('compras:listarAReponer', () => comprasService.listarAReponer())
}
