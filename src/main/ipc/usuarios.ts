import { ipcMain } from 'electron'
import * as usuariosService from '../services/usuarios'
import type { UsuarioInput } from '../../shared/types'

export function registrarIpcUsuarios(): void {
  ipcMain.handle('usuarios:listar', (_evento, soloActivos = true) => usuariosService.listar(soloActivos))

  ipcMain.handle('usuarios:crear', (_evento, input: UsuarioInput) => usuariosService.crear(input))

  ipcMain.handle('usuarios:actualizar', (_evento, id: number, input: UsuarioInput) =>
    usuariosService.actualizar(id, input)
  )

  ipcMain.handle('usuarios:cambiarActivo', (_evento, id: number, activo: boolean) =>
    usuariosService.cambiarActivo(id, activo)
  )

  ipcMain.handle('usuarios:iniciarSesion', (_evento, usuarioId: number, pin: string | null) =>
    usuariosService.iniciarSesion(usuarioId, pin)
  )

  ipcMain.handle('usuarios:cerrarSesion', () => usuariosService.cerrarSesion())

  ipcMain.handle('usuarios:usuarioActivo', () => usuariosService.obtenerUsuarioActivo())
}
