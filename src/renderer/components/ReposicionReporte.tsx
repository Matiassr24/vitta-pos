import type { ResumenReposicion } from '../../shared/types'
import { formatearCantidad, formatearPesos } from '../lib/formato'
import './ReposicionReporte.css'

interface Props {
  resumen: ResumenReposicion | null
  cargando: boolean
}

// Solo dibuja: el rango, la consulta y la exportación viven en
// Reportes.tsx, así la barra de filtros es una sola y queda en el mismo
// lugar en las dos vistas.
export function ReposicionReporte({ resumen, cargando }: Props) {
  return (
    <>
      {resumen && (
        <>
          <div className="reposicion__tarjetas">
            {/* El número que importa: cuánta plata hay que separar para
                volver a comprar lo que se vendió. La facturación es solo
                contexto, por eso va neutra. */}
            <div className="tarjeta tarjeta--acento">
              <span className="tarjeta__etiqueta">Plata a separar para reponer</span>
              <span className="tarjeta__valor">{formatearPesos(resumen.costo_reposicion_total)}</span>
              <span className="tarjeta__ayuda">Lo vendido en el período, a costo de hoy</span>
            </div>
            <div className="tarjeta">
              <span className="tarjeta__etiqueta">Facturado en el período</span>
              <span className="tarjeta__valor">{formatearPesos(resumen.facturacion_total)}</span>
            </div>
          </div>

          {resumen.productos_sin_costo > 0 && (
            <div className="reposicion__aviso-costo">
              {resumen.productos_sin_costo === 1
                ? '1 producto vendido no tiene costo cargado'
                : `${resumen.productos_sin_costo} productos vendidos no tienen costo cargado`}
              : no suman al total a reponer, así que el monto real es mayor. Cargales el costo en
              Productos.
            </div>
          )}

          {resumen.categorias.map((cat) => (
            <section key={cat.categoria} className="reportes__seccion">
              <div className="reposicion__categoria-titulo">
                <h2>{cat.categoria}</h2>
                <span className="reposicion__categoria-totales">
                  A reponer <strong>{formatearPesos(cat.costo_reposicion)}</strong>
                  <span className="reposicion__separador">·</span>
                  Facturado {formatearPesos(cat.facturacion)}
                </span>
              </div>
              <table className="reportes__tabla reposicion__tabla">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Vendido</th>
                    <th>Stock hoy</th>
                    <th>A reponer</th>
                    <th>Facturado</th>
                  </tr>
                </thead>
                <tbody>
                  {cat.items.map((i) => {
                    const stockBajo = i.controla_stock === 1 && i.stock <= i.stock_minimo
                    return (
                      <tr key={i.producto_id}>
                        <td>
                          {i.nombre}
                          {i.precio_costo <= 0 && (
                            <span className="reposicion__sin-costo">sin costo</span>
                          )}
                        </td>
                        <td>{formatearCantidad(i.cantidad, i.unidad)}</td>
                        <td className={stockBajo ? 'reposicion__stock-bajo' : ''}>
                          {i.controla_stock === 1 ? formatearCantidad(i.stock, i.unidad) : '—'}
                        </td>
                        <td>{formatearPesos(i.costo_reposicion)}</td>
                        <td>{formatearPesos(i.facturacion)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>
          ))}

          {!cargando && resumen.categorias.length === 0 && (
            <div className="reposicion__vacio">No hay ventas en este período.</div>
          )}
        </>
      )}
    </>
  )
}
