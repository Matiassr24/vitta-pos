import { Fragment } from 'react'
import type { UnidadProducto } from '../../shared/types'
import { formatearCantidadVenta, formatearFechaHora, formatearPesos } from '../lib/formato'
import './TicketImpresion.css'

export interface DatosTicket {
  id: number
  fecha: string
  items: {
    nombre: string
    cantidad: number
    // Para que el comprobante diga "200 g x $13.000" y no "0,2 x
    // $13.000", que es lo que el cliente ve y no entiende. Las líneas
    // agrupadas de una promo viajan como UNIDAD: son "1 promo".
    unidad: UnidadProducto
    precio_unitario: number
    subtotal: number
  }[]
  pagos: { nombre: string; monto: number }[]
  total: number
}

interface Props {
  venta: DatosTicket | null
}

// Se imprime con el diálogo del sistema operativo (window.print), no con
// un protocolo de impresora térmica: así el mismo comprobante sirve para
// una impresora común hoy y para una térmica el día que se compre una,
// sin tener que mantener dos caminos de código distintos.
export function TicketImpresion({ venta }: Props) {
  if (!venta) return null

  return (
    <div className="zona-impresion">
      <div className="ticket-impresion">
        <p className="ticket-impresion__negocio">Polirubro Vitta</p>
        <p className="ticket-impresion__meta">
          Venta #{venta.id} — {formatearFechaHora(venta.fecha)}
        </p>
        <p className="ticket-impresion__disclaimer">Comprobante interno, no válido como factura</p>

        <table className="ticket-impresion__items">
          <tbody>
            {venta.items.map((item, i) => (
              <Fragment key={i}>
                <tr>
                  <td colSpan={2}>{item.nombre}</td>
                </tr>
                <tr className="ticket-impresion__fila-cantidad">
                  <td>
                    {formatearCantidadVenta(item.cantidad, item.unidad)} x{' '}
                    {formatearPesos(item.precio_unitario)}
                  </td>
                  <td className="ticket-impresion__num">{formatearPesos(item.subtotal)}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>

        <div className="ticket-impresion__total">
          <span>Total</span>
          <span>{formatearPesos(venta.total)}</span>
        </div>

        <div className="ticket-impresion__pagos">
          {venta.pagos.map((p, i) => (
            <div key={i}>
              <span>{p.nombre}</span>
              <span>{formatearPesos(p.monto)}</span>
            </div>
          ))}
        </div>

        <p className="ticket-impresion__gracias">Gracias por su compra</p>
      </div>
    </div>
  )
}
