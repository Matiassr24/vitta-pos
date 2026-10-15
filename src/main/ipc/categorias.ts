import { ipcMain } from 'electron'
import * as categoriasService from '../services/categorias'

export function registrarIpcCategorias(): void {
  ipcMain.handle('categorias:listar', () => categoriasService.listar())
}
