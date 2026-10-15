import { getDb } from '../db'
import { idUsuarioActivo } from '../sesion'
import type {
  CajaSesion,
  MovimientoCaja,
  MovimientoManualInput,
  ResumenCaja,
  VentaPorMedio
} from '../../shared/types'

export function obtenerAbierta(): CajaSesion | undefined {
  const db = getDb()
  return db.prepare("SELECT * FROM caja_sesiones WHERE estado = 'ABIERTA'").get() as
    | CajaSesion
    | undefined
}

export function abrir(montoInicial: number): CajaSesion {
  const db = getDb()

  if (obtenerAbierta()) {
    throw new Error('Ya hay una caja abierta.')
  }

  const info = db
    .prepare("INSERT INTO caja_sesiones (monto_inicial, estado, usuario_id) VALUES (?, 'ABIERTA', ?)")
    .run(montoInicial, idUsuarioActivo())

  return db.prepare('SELECT * FROM caja_sesiones WHERE id = ?').get(info.lastInsertRowid) as CajaSesion
}

// Retiro, aporte y gasto son siempre en efectivo físico del cajón (no
// hay "retiro por transferencia" en este negocio), por eso no piden
// medio de pago y siempre van con afecta_efectivo = 1.
export function registrarMovimiento(input: MovimientoManualInput): void {
  const db = getDb()

  const caja = obtenerAbierta()
  if (!caja) throw new Error('No hay una caja abierta.')
  if (!(input.monto > 0)) throw new Error('El monto tiene que ser mayor a cero.')

  const tipo = input.tipo === 'APORTE' ? 'INGRESO' : 'EGRESO'

  db.prepare(
    `INSERT INTO movimientos_caja
       (caja_sesion_id, tipo, concepto, monto, afecta_efectivo, descripcion, usuario_id)
     VALUES (?, ?, ?, ?, 1, ?, ?)`
  ).run(caja.id, tipo, input.tipo, input.monto, input.descripcion, idUsuarioActivo())
}

// Además de los movimientos de caja reales, se listan las ventas
// fiadas: no mueven plata (por eso no generan movimientos_caja), pero
// sin ellas la lista del día queda incompleta y da la impresión de que
// esas ventas no existieron. Se marcan con es_fiado para mostrarlas
// distinto y no confundirlas con plata que entró.
export function listarMovimientos(cajaSesionId: number): MovimientoCaja[] {
  const db = getDb()

  const detalleVenta = `
    SELECT GROUP_CONCAT(
             vi.nombre || CASE WHEN vi.cantidad <> 1 THEN
               ' x' || (CASE WHEN vi.cantidad = CAST(vi.cantidad AS INTEGER)
                             THEN CAST(vi.cantidad AS INTEGER)
                             ELSE vi.cantidad END)
             ELSE '' END,
             ', '
           )
    FROM venta_items vi
    WHERE vi.venta_id = `

  return db
    .prepare(
      `WITH numeros AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS numero_caja
         FROM ventas
         WHERE caja_sesion_id = ?
       )
       SELECT mc.id AS id, mc.caja_sesion_id AS caja_sesion_id, mc.fecha AS fecha,
              mc.tipo AS tipo, mc.concepto AS concepto, mc.monto AS monto,
              mc.afecta_efectivo AS afecta_efectivo, mc.medio_pago_id AS medio_pago_id,
              mc.descripcion AS descripcion,
              mc.referencia_tabla AS referencia_tabla, mc.referencia_id AS referencia_id,
              mp.nombre AS medio_pago_nombre,
              n.numero_caja AS numero_venta_caja,
              CASE WHEN mc.referencia_tabla = 'ventas'
                   THEN (${detalleVenta} mc.referencia_id)
                   ELSE NULL END AS detalle_venta,
              0 AS es_fiado,
              NULL AS cliente_nombre
       FROM movimientos_caja mc
       LEFT JOIN medios_pago mp ON mp.id = mc.medio_pago_id
       LEFT JOIN numeros n
              ON mc.referencia_tabla = 'ventas' AND n.id = mc.referencia_id
       WHERE mc.caja_sesion_id = ?

       UNION ALL

       SELECT cc.id, ? AS caja_sesion_id, cc.fecha,
              'INGRESO' AS tipo, 'VENTA' AS concepto, cc.monto,
              0 AS afecta_efectivo, NULL AS medio_pago_id,
              NULL AS descripcion, 'ventas' AS referencia_tabla, cc.venta_id AS referencia_id,
              'Fiado' AS medio_pago_nombre,
              n.numero_caja AS numero_venta_caja,
              (${detalleVenta} cc.venta_id) AS detalle_venta,
              1 AS es_fiado,
              cl.nombre AS cliente_nombre
       FROM cuenta_corriente cc
       JOIN numeros n ON n.id = cc.venta_id
       LEFT JOIN clientes cl ON cl.id = cc.cliente_id
       WHERE cc.tipo = 'CARGO'

       ORDER BY fecha DESC, id DESC`
    )
    .all(cajaSesionId, cajaSesionId, cajaSesionId) as MovimientoCaja[]
}

// Las fórmulas son las que ya quedaron documentadas en
// docs/operacion-y-hardware.md: no se inventa nada acá.
export function obtenerResumen(cajaSesionId: number): ResumenCaja {
  const db = getDb()

  const sesion = db.prepare('SELECT * FROM caja_sesiones WHERE id = ?').get(cajaSesionId) as
    | CajaSesion
    | undefined
  if (!sesion) throw new Error('La caja no existe.')

  const arqueo = db
    .prepare('SELECT * FROM v_arqueo_caja WHERE caja_sesion_id = ?')
    .get(cajaSesionId) as
    | { efectivo_esperado: number; ingresos_efectivo: number; egresos_efectivo: number }
    | undefined

  const ventasAgregado = db
    .prepare(
      `SELECT COUNT(*) as cantidad, COALESCE(SUM(total),0) as facturacion, COALESCE(SUM(costo_total),0) as costo
       FROM ventas
       WHERE caja_sesion_id = ? AND estado = 'COMPLETADA'`
    )
    .get(cajaSesionId) as { cantidad: number; facturacion: number; costo: number }

  const ventasPorMedio = db
    .prepare(
      `SELECT mp.id as medio_pago_id, mp.nombre, COALESCE(SUM(vp.monto),0) as total
       FROM venta_pagos vp
       JOIN ventas v ON v.id = vp.venta_id
       JOIN medios_pago mp ON mp.id = vp.medio_pago_id
       WHERE v.caja_sesion_id = ? AND v.estado = 'COMPLETADA'
       GROUP BY mp.id, mp.nombre
       ORDER BY mp.orden`
    )
    .all(cajaSesionId) as VentaPorMedio[]

  const sumaPorConcepto = (concepto: string): number => {
    const fila = db
      .prepare(
        `SELECT COALESCE(SUM(monto),0) as total FROM movimientos_caja
         WHERE caja_sesion_id = ? AND concepto = ?`
      )
      .get(cajaSesionId, concepto) as { total: number }
    return fila.total
  }

  const gastos = sumaPorConcepto('GASTO')
  const retiros = sumaPorConcepto('RETIRO')
  const aportes = sumaPorConcepto('APORTE')
  const gananciaBruta = ventasAgregado.facturacion - ventasAgregado.costo

  // Todo lo comprado hoy, sea cual sea el medio de pago — para que se
  // vea que la plata gastada en reponer no desaparece del sistema,
  // aunque no reste de la ganancia (ver CLAUDE.md: reponer stock no es
  // un gasto).
  const comprasHoy = db
    .prepare(
      `SELECT COALESCE(SUM(total),0) as total FROM compras WHERE date(fecha) = date('now','localtime')`
    )
    .get() as { total: number }

  return {
    caja_sesion_id: cajaSesionId,
    fecha_apertura: sesion.fecha_apertura,
    monto_inicial: sesion.monto_inicial,
    efectivo_esperado: arqueo?.efectivo_esperado ?? sesion.monto_inicial,
    ingresos_efectivo: arqueo?.ingresos_efectivo ?? 0,
    egresos_efectivo: arqueo?.egresos_efectivo ?? 0,
    facturacion_total: ventasAgregado.facturacion,
    costo_mercaderia: ventasAgregado.costo,
    ganancia_bruta: gananciaBruta,
    gastos,
    retiros,
    aportes,
    ganancia_neta: gananciaBruta - gastos,
    cantidad_ventas: ventasAgregado.cantidad,
    ventas_por_medio: ventasPorMedio,
    compras_hoy: comprasHoy.total
  }
}

export function cerrar(cajaSesionId: number, montoDeclarado: number, notas: string | null): CajaSesion {
  const db = getDb()

  const cerrarTx = db.transaction((): void => {
    const sesion = db.prepare('SELECT * FROM caja_sesiones WHERE id = ?').get(cajaSesionId) as
      | CajaSesion
      | undefined
    if (!sesion) throw new Error('La caja no existe.')
    if (sesion.estado === 'CERRADA') throw new Error('Esa caja ya está cerrada.')

    const arqueo = db
      .prepare('SELECT efectivo_esperado FROM v_arqueo_caja WHERE caja_sesion_id = ?')
      .get(cajaSesionId) as { efectivo_esperado: number } | undefined
    const montoEsperado = arqueo?.efectivo_esperado ?? sesion.monto_inicial
    const diferencia = montoDeclarado - montoEsperado

    db.prepare(
      `UPDATE caja_sesiones SET
         fecha_cierre = datetime('now','localtime'),
         monto_declarado = ?,
         monto_esperado = ?,
         diferencia = ?,
         notas = ?,
         estado = 'CERRADA'
       WHERE id = ?`
    ).run(montoDeclarado, montoEsperado, diferencia, notas, cajaSesionId)
  })

  cerrarTx()
  return db.prepare('SELECT * FROM caja_sesiones WHERE id = ?').get(cajaSesionId) as CajaSesion
}
