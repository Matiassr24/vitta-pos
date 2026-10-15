import { ipcMain } from 'electron'
import * as clientesService from '../services/clientes'
import type { ClienteInput, PagoFiadoInput } from '../../shared/types'

export function registrarIpcClientes(): void {
  ipcMain.handle('clientes:listar', (_evento, soloActivos?: boolean) =>
    clientesService.listar(soloActivos ?? true)
  )

  ipcMain.handle('clientes:buscar', (_evento, texto: string, soloActivos?: boolean) =>
    clientesService.buscar(texto, soloActivos ?? true)
  )

  ipcMain.handle('clientes:crear', (_evento, input: ClienteInput) => clientesService.crear(input))

  ipcMain.handle('clientes:actualizar', (_evento, id: number, input: ClienteInput) =>
    clientesService.actualizar(id, input)
  )

  ipcMain.handle('clientes:cambiarActivo', (_evento, id: number, activo: boolean) =>
    clientesService.cambiarActivo(id, activo)
  )

  ipcMain.handle('clientes:listarMovimientos', (_evento, clienteId: number) =>
    clientesService.listarMovimientos(clienteId)
  )

  ipcMain.handle('clientes:registrarPago', (_evento, input: PagoFiadoInput) =>
    clientesService.registrarPago(input)
  )
}
