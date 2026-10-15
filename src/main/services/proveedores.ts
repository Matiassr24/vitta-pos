import { getDb } from '../db'
import type { Proveedor, ProveedorInput } from '../../shared/types'

export function listar(): Proveedor[] {
  const db = getDb()
  return db.prepare('SELECT * FROM proveedores WHERE activo = 1 ORDER BY nombre').all() as Proveedor[]
}

export function crear(input: ProveedorInput): Proveedor {
  const db = getDb()
  const info = db
    .prepare('INSERT INTO proveedores (nombre, telefono, email, notas) VALUES (?, ?, ?, ?)')
    .run(input.nombre.trim(), input.telefono || null, input.email || null, input.notas || null)
  return db.prepare('SELECT * FROM proveedores WHERE id = ?').get(info.lastInsertRowid) as Proveedor
}
