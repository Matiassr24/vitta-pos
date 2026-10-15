// Singleton del usuario que está usando el sistema en este momento. Vive
// en el proceso principal (como db.ts) para que cualquier service pueda
// preguntar "quién está logueado" sin tener que pasar usuario_id a mano
// por cada llamada IPC.
import type { RolUsuario } from '../shared/types'

export interface UsuarioSesion {
  id: number
  nombre: string
  rol: RolUsuario
}

let usuarioActivo: UsuarioSesion | null = null

export function iniciarSesion(usuario: UsuarioSesion): void {
  usuarioActivo = usuario
}

export function cerrarSesion(): void {
  usuarioActivo = null
}

export function obtenerUsuarioActivo(): UsuarioSesion | null {
  return usuarioActivo
}

// Atajo para las inserciones: siempre INTEGER o null, nunca undefined.
export function idUsuarioActivo(): number | null {
  return usuarioActivo?.id ?? null
}
