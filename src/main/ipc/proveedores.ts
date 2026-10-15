import { ipcMain } from 'electron'
import * as proveedoresService from '../services/proveedores'
import type { ProveedorInput } from '../../shared/types'

export function registrarIpcProveedores(): void {
  ipcMain.handle('proveedores:listar', () => proveedoresService.listar())
  ipcMain.handle('proveedores:crear', (_evento, input: ProveedorInput) => proveedoresService.crear(input))
}
