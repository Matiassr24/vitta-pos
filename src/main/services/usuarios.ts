import Database from 'better-sqlite3'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { getDb } from '../db'
import * as sesion from '../sesion'
import type { Usuario, UsuarioInput } from '../../shared/types'

interface FilaUsuario {
  id: number
  nombre: string
  pin_hash: string | null
  rol: 'ADMIN' | 'VENDEDOR'
  activo: number
}

function comoUsuario(fila: FilaUsuario): Usuario {
  return {
    id: fila.id,
    nombre: fila.nombre,
    rol: fila.rol,
    activo: fila.activo,
    tiene_pin: fila.pin_hash !== null
  }
}

// scrypt con salt propio por usuario, guardado como "saltHex:hashHex".
// No se agrega bcrypt/argon2 como dependencia nueva: crypto ya viene con Node.
function hashearPin(pin: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(pin, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

function pinCoincide(pin: string, pinHash: string): boolean {
  const [saltHex, hashHex] = pinHash.split(':')
  const hashGuardado = Buffer.from(hashHex, 'hex')
  const hashIngresado = scryptSync(pin, Buffer.from(saltHex, 'hex'), 64)
  return hashGuardado.length === hashIngresado.length && timingSafeEqual(hashGuardado, hashIngresado)
}

function conMensajeAmigable<T>(accion: () => T): T {
  try {
    return accion()
  } catch (error) {
    if (error instanceof Database.SqliteError && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('Ya existe otro usuario con ese nombre.')
    }
    throw error
  }
}

export function listar(soloActivos = true): Usuario[] {
  const db = getDb()
  const where = soloActivos ? 'WHERE activo = 1' : ''
  const filas = db.prepare(`SELECT * FROM usuarios ${where} ORDER BY nombre`).all() as FilaUsuario[]
  return filas.map(comoUsuario)
}

export function crear(input: UsuarioInput): Usuario {
  const db = getDb()
  if (!input.pin || input.pin.trim().length < 4) {
    throw new Error('El PIN tiene que tener al menos 4 dígitos.')
  }

  const pinHash = hashearPin(input.pin.trim())
  const info = conMensajeAmigable(() =>
    db
      .prepare('INSERT INTO usuarios (nombre, pin_hash, rol) VALUES (?, ?, ?)')
      .run(input.nombre.trim(), pinHash, input.rol)
  )

  const fila = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(info.lastInsertRowid) as FilaUsuario
  return comoUsuario(fila)
}

export function actualizar(id: number, input: UsuarioInput): Usuario {
  const db = getDb()

  conMensajeAmigable(() => {
    if (input.pin && input.pin.trim().length > 0) {
      if (input.pin.trim().length < 4) throw new Error('El PIN tiene que tener al menos 4 dígitos.')
      const pinHash = hashearPin(input.pin.trim())
      db.prepare('UPDATE usuarios SET nombre = ?, rol = ?, pin_hash = ? WHERE id = ?').run(
        input.nombre.trim(),
        input.rol,
        pinHash,
        id
      )
    } else {
      db.prepare('UPDATE usuarios SET nombre = ?, rol = ? WHERE id = ?').run(
        input.nombre.trim(),
        input.rol,
        id
      )
    }
  })

  const fila = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id) as FilaUsuario | undefined
  if (!fila) throw new Error('El usuario no existe.')
  return comoUsuario(fila)
}

export function cambiarActivo(id: number, activo: boolean): void {
  const db = getDb()

  if (!activo) {
    const cantidadAdminsActivos = db
      .prepare("SELECT COUNT(*) as cantidad FROM usuarios WHERE rol = 'ADMIN' AND activo = 1")
      .get() as { cantidad: number }
    const esteEsAdmin = db.prepare('SELECT rol FROM usuarios WHERE id = ?').get(id) as
      | { rol: string }
      | undefined
    if (esteEsAdmin?.rol === 'ADMIN' && cantidadAdminsActivos.cantidad <= 1) {
      throw new Error('No se puede desactivar el único administrador.')
    }
  }

  db.prepare('UPDATE usuarios SET activo = ? WHERE id = ?').run(activo ? 1 : 0, id)
}

// Login: si el usuario todavía no tiene PIN configurado (el Administrador
// semilla arranca así), entra directo. Si ya tiene, hay que acertarlo.
export function iniciarSesion(usuarioId: number, pin: string | null): Usuario {
  const db = getDb()
  const fila = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(usuarioId) as
    | FilaUsuario
    | undefined
  if (!fila) throw new Error('El usuario no existe.')
  if (!fila.activo) throw new Error('Ese usuario está desactivado.')

  if (fila.pin_hash !== null) {
    if (!pin || !pinCoincide(pin, fila.pin_hash)) {
      throw new Error('PIN incorrecto.')
    }
  }

  sesion.iniciarSesion({ id: fila.id, nombre: fila.nombre, rol: fila.rol })
  return comoUsuario(fila)
}

export function cerrarSesion(): void {
  sesion.cerrarSesion()
}

export function obtenerUsuarioActivo(): Usuario | null {
  const activo = sesion.obtenerUsuarioActivo()
  if (!activo) return null
  const db = getDb()
  const fila = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(activo.id) as
    | FilaUsuario
    | undefined
  return fila ? comoUsuario(fila) : null
}
