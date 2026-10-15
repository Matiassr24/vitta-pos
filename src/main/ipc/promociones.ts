import { ipcMain } from 'electron'
import * as promocionesService from '../services/promociones'
import type { PromocionInput } from '../../shared/types'

export function registrarIpcPromociones(): void {
  ipcMain.handle('promociones:listar', (_evento, soloActivas?: boolean) =>
    promocionesService.listar(soloActivas ?? true)
  )

  ipcMain.handle('promociones:crear', (_evento, input: PromocionInput) =>
    promocionesService.crear(input)
  )

  ipcMain.handle('promociones:actualizar', (_evento, id: number, input: PromocionInput) =>
    promocionesService.actualizar(id, input)
  )

  ipcMain.handle('promociones:cambiarActivo', (_evento, id: number, activo: boolean) =>
    promocionesService.cambiarActivo(id, activo)
  )
}
