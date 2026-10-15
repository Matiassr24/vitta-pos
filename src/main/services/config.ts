import { getDb } from '../db'

export function obtener(clave: string): string | null {
  const db = getDb()
  const fila = db.prepare('SELECT valor FROM config WHERE clave = ?').get(clave) as
    | { valor: string | null }
    | undefined
  return fila?.valor ?? null
}

export function guardar(clave: string, valor: string | null): void {
  const db = getDb()
  db.prepare('INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = ?').run(
    clave,
    valor,
    valor
  )
}
