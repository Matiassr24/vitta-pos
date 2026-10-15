import { getDb } from '../db'
import type { Categoria } from '../../shared/types'

export function listar(): Categoria[] {
  const db = getDb()
  return db
    .prepare('SELECT id, nombre, activo FROM categorias WHERE activo = 1 ORDER BY nombre')
    .all() as Categoria[]
}
