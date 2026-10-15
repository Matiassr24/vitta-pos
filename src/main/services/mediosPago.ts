import { getDb } from '../db'
import type { MedioPago } from '../../shared/types'

export function listarActivos(): MedioPago[] {
  const db = getDb()
  return db.prepare('SELECT * FROM medios_pago WHERE activo = 1 ORDER BY orden').all() as MedioPago[]
}
