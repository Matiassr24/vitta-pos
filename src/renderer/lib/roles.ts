import type { RolUsuario } from '../../shared/types'

// El valor en la base sigue siendo VENDEDOR (no hace falta migrar nada),
// pero en pantalla se muestra como "Cajera/o", que es como lo piensa el negocio.
export function etiquetaRol(rol: RolUsuario): string {
  return rol === 'ADMIN' ? 'Administrador' : 'Cajera/o'
}
