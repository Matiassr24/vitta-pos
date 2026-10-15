import Database from 'better-sqlite3'
import { getDb } from '../db'
import { obtenerAbierta as obtenerCajaAbierta } from './caja'
import { idUsuarioActivo } from '../sesion'
import type { Cliente, ClienteInput, MovimientoCuentaCorriente, PagoFiadoInput } from '../../shared/types'

function conMensajeAmigable<T>(accion: () => T): T {
  try {
    return accion()
  } catch (error) {
    if (error instanceof Database.SqliteError && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('Ya existe otro cliente con esos datos.')
    }
    throw error
  }
}

export function obtenerPorId(id: number): Cliente | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM clientes WHERE id = ?').get(id) as Cliente | undefined
}

export function listar(soloActivos = true): Cliente[] {
  const db = getDb()
  const where = soloActivos ? 'WHERE activo = 1' : ''
  return db.prepare(`SELECT * FROM clientes ${where} ORDER BY nombre`).all() as Cliente[]
}

export function buscar(texto: string, soloActivos = true): Cliente[] {
  const db = getDb()
  const like = `%${texto.trim()}%`
  const filtroActivo = soloActivos ? 'activo = 1 AND' : ''
  return db
    .prepare(
      `SELECT * FROM clientes WHERE ${filtroActivo} nombre LIKE ? ORDER BY nombre LIMIT 200`
    )
    .all(like) as Cliente[]
}

export function crear(input: ClienteInput): Cliente {
  const db = getDb()
  const info = conMensajeAmigable(() =>
    db
      .prepare(
        `INSERT INTO clientes (nombre, telefono, direccion, limite_credito, notas)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        input.nombre.trim(),
        input.telefono || null,
        input.direccion || null,
        input.limite_credito,
        input.notas || null
      )
  )
  return obtenerPorId(Number(info.lastInsertRowid))!
}

export function actualizar(id: number, input: ClienteInput): Cliente {
  const db = getDb()
  conMensajeAmigable(() =>
    db
      .prepare(
        `UPDATE clientes SET nombre = ?, telefono = ?, direccion = ?, limite_credito = ?, notas = ?
         WHERE id = ?`
      )
      .run(
        input.nombre.trim(),
        input.telefono || null,
        input.direccion || null,
        input.limite_credito,
        input.notas || null,
        id
      )
  )
  return obtenerPorId(id)!
}

export function cambiarActivo(id: number, activo: boolean): void {
  const db = getDb()
  db.prepare('UPDATE clientes SET activo = ? WHERE id = ?').run(activo ? 1 : 0, id)
}

export function listarMovimientos(clienteId: number): MovimientoCuentaCorriente[] {
  const db = getDb()
  return db
    .prepare(
      `SELECT cc.*,
              (SELECT GROUP_CONCAT(
                        vi.nombre || CASE WHEN vi.cantidad <> 1 THEN
                          ' x' || (CASE WHEN vi.cantidad = CAST(vi.cantidad AS INTEGER)
                                        THEN CAST(vi.cantidad AS INTEGER)
                                        ELSE vi.cantidad END)
                        ELSE '' END,
                        ', '
                      )
               FROM venta_items vi
               WHERE vi.venta_id = cc.venta_id) AS detalle_venta
       FROM cuenta_corriente cc
       WHERE cc.cliente_id = ?
       ORDER BY cc.id DESC
       LIMIT 50`
    )
    .all(clienteId) as MovimientoCuentaCorriente[]
}

// Cuando el cliente viene a pagar lo que debe. Si paga en efectivo del
// cajón, entra a la caja con concepto COBRO_FIADO (no es una venta
// nueva, pero sí plata real entrando al cajón).
export function registrarPago(input: PagoFiadoInput): void {
  const db = getDb()

  if (!(input.monto > 0)) throw new Error('El monto tiene que ser mayor a cero.')

  const cliente = db.prepare('SELECT saldo FROM clientes WHERE id = ?').get(input.cliente_id) as
    | { saldo: number }
    | undefined
  if (!cliente) throw new Error('El cliente no existe.')

  let cajaId: number | null = null
  if (input.pagadaEnEfectivo) {
    const caja = obtenerCajaAbierta()
    if (!caja) throw new Error('No hay una caja abierta para registrar el cobro en efectivo.')
    cajaId = caja.id
  }

  const registrarTx = db.transaction((): void => {
    const nuevoSaldo = cliente.saldo - input.monto

    db.prepare('UPDATE clientes SET saldo = ? WHERE id = ?').run(nuevoSaldo, input.cliente_id)

    db.prepare(
      `INSERT INTO cuenta_corriente (cliente_id, tipo, monto, saldo_resultante, notas)
       VALUES (?, 'PAGO', ?, ?, ?)`
    ).run(input.cliente_id, input.monto, nuevoSaldo, input.notas)

    if (cajaId) {
      const efectivo = db.prepare("SELECT id FROM medios_pago WHERE nombre = 'Efectivo'").get() as
        | { id: number }
        | undefined
      db.prepare(
        `INSERT INTO movimientos_caja
           (caja_sesion_id, tipo, concepto, monto, afecta_efectivo, medio_pago_id,
            referencia_tabla, referencia_id, usuario_id)
         VALUES (?, 'INGRESO', 'COBRO_FIADO', ?, 1, ?, 'clientes', ?, ?)`
      ).run(cajaId, input.monto, efectivo?.id ?? null, input.cliente_id, idUsuarioActivo())
    }
  })

  registrarTx()
}
