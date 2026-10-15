import { useCallback, useEffect, useState } from 'react'
import type {
  AgrupacionReporte,
  ProductoMasVendido,
  ProductoParado,
  ResumenReposicion,
  VentaPorPeriodo
} from '../../shared/types'
import { claseGanancia, formatearPesos } from '../lib/formato'
import { hoyISO, lunesDeEstaSemana, primerDiaDelMes } from '../lib/fechas'
import { mensajeDeError } from '../lib/errores'
import { ReposicionReporte } from '../components/ReposicionReporte'
import './Reportes.css'

type Vista = 'resumen' | 'reposicion'

// Atajos de rango, iguales en las dos vistas: todos terminan hoy.
const ATAJOS = [
  { id: 'hoy', etiqueta: 'Hoy', desde: () => hoyISO() },
  { id: 'semana', etiqueta: 'Esta semana', desde: () => lunesDeEstaSemana() },
  { id: 'mes', etiqueta: 'Este mes', desde: () => primerDiaDelMes() }
] as const

const ETIQUETAS_AGRUPACION: Record<AgrupacionReporte, string> = {
  dia: 'Día',
  semana: 'Semana',
  mes: 'Mes'
}

export function ReportesPage() {
  const [vista, setVista] = useState<Vista>('resumen')
  const [desde, setDesde] = useState(primerDiaDelMes())
  const [hasta, setHasta] = useState(hoyISO())
  const [agrupacion, setAgrupacion] = useState<AgrupacionReporte>('dia')
  const [ventas, setVentas] = useState<VentaPorPeriodo[]>([])
  const [masVendidosPorUnidades, setMasVendidosPorUnidades] = useState<ProductoMasVendido[]>([])
  const [masRentables, setMasRentables] = useState<ProductoMasVendido[]>([])

  // La reposición lleva su propio rango (arranca en "Hoy", que es lo que
  // se mira a diario) separado del resumen (arranca en el mes): cambiar de
  // vista no mueve las fechas de la otra.
  const [desdeRep, setDesdeRep] = useState(hoyISO())
  const [hastaRep, setHastaRep] = useState(hoyISO())
  const [reposicion, setReposicion] = useState<ResumenReposicion | null>(null)
  const [cargandoRep, setCargandoRep] = useState(false)

  const [diasSinVenta, setDiasSinVenta] = useState('30')
  const [parados, setParados] = useState<ProductoParado[]>([])

  const [cargando, setCargando] = useState(true)
  const [exportando, setExportando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargarVentas = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [ventasNuevas, porUnidadesNuevos, porGananciaNuevos] = await Promise.all([
        window.api.reportes.ventasPorPeriodo(desde, hasta, agrupacion),
        window.api.reportes.productosMasVendidos(desde, hasta, 'unidades'),
        window.api.reportes.productosMasVendidos(desde, hasta, 'ganancia')
      ])
      setVentas(ventasNuevas)
      setMasVendidosPorUnidades(porUnidadesNuevos)
      setMasRentables(porGananciaNuevos)
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cargar el reporte.'))
    } finally {
      setCargando(false)
    }
  }, [desde, hasta, agrupacion])

  const cargarParados = useCallback(async () => {
    const dias = Number(diasSinVenta) || 0
    setParados(await window.api.reportes.productosParados(dias))
  }, [diasSinVenta])

  useEffect(() => {
    cargarVentas()
  }, [cargarVentas])

  useEffect(() => {
    cargarParados()
  }, [cargarParados])

  // Solo se consulta cuando la vista está abierta: no tiene sentido
  // calcular la reposición mientras se mira el resumen.
  useEffect(() => {
    if (vista !== 'reposicion') return
    let vigente = true
    setCargandoRep(true)
    setError(null)
    window.api.reportes
      .reposicionPorCategoria(desdeRep, hastaRep)
      .then((r) => vigente && setReposicion(r))
      .catch((err) => vigente && setError(mensajeDeError(err, 'No se pudo cargar el resumen de reposición.')))
      .finally(() => vigente && setCargandoRep(false))
    // Si se cambia el rango (o de vista) antes de que vuelva la respuesta,
    // la vieja no debe pisar a la nueva.
    return () => {
      vigente = false
    }
  }, [vista, desdeRep, hastaRep])

  const totales = ventas.reduce(
    (acc, f) => ({
      cantidad_ventas: acc.cantidad_ventas + f.cantidad_ventas,
      facturacion: acc.facturacion + f.facturacion,
      ganancia_neta: acc.ganancia_neta + f.ganancia_neta
    }),
    { cantidad_ventas: 0, facturacion: 0, ganancia_neta: 0 }
  )

  async function exportar(): Promise<void> {
    setExportando(true)
    setMensaje(null)
    setError(null)
    try {
      const ruta =
        vista === 'reposicion'
          ? await window.api.reportes.exportarReposicion(desdeRep, hastaRep)
          : await window.api.reportes.exportarExcel(desde, hasta, agrupacion)
      setMensaje(ruta ? `Guardado en ${ruta}` : 'Exportación cancelada.')
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo exportar el reporte.'))
    } finally {
      setExportando(false)
      setTimeout(() => setMensaje(null), 5000)
    }
  }

  // Los controles de la barra son los mismos en las dos vistas y apuntan
  // al rango de la que esté abierta.
  const rangoDesde = vista === 'reposicion' ? desdeRep : desde
  const rangoHasta = vista === 'reposicion' ? hastaRep : hasta
  const cambiarDesde = vista === 'reposicion' ? setDesdeRep : setDesde
  const cambiarHasta = vista === 'reposicion' ? setHastaRep : setHasta

  function cambiarVista(nueva: Vista): void {
    setVista(nueva)
    // Un aviso o error de la otra vista no tiene que quedar colgado acá.
    setMensaje(null)
    setError(null)
  }

  return (
    <div className="reportes">
      <header className="reportes__barra">
        <h1>Reportes</h1>
        <div className="reportes__vistas">
          <button
            type="button"
            className={`reportes__vista ${vista === 'resumen' ? 'reportes__vista--activa' : ''}`}
            onClick={() => cambiarVista('resumen')}
          >
            Resumen
          </button>
          <button
            type="button"
            className={`reportes__vista ${vista === 'reposicion' ? 'reportes__vista--activa' : ''}`}
            onClick={() => cambiarVista('reposicion')}
          >
            Reposición
          </button>
        </div>
      </header>

      {/* Una sola barra para las dos vistas, siempre en el mismo lugar y
          con los mismos controles en el mismo orden (el selector de arriba
          no se mueve al cambiar): lo único propio del resumen es "Agrupar
          por". Exportar queda siempre pegado a la derecha. */}
      <div className="reportes__filtros">
        <div className="reportes__atajos">
          {ATAJOS.map((a) => {
            const activo = rangoDesde === a.desde() && rangoHasta === hoyISO()
            return (
              <button
                key={a.id}
                type="button"
                className={`reportes__atajo ${activo ? 'reportes__atajo--activo' : ''}`}
                onClick={() => {
                  cambiarDesde(a.desde())
                  cambiarHasta(hoyISO())
                }}
              >
                {a.etiqueta}
              </button>
            )
          })}
        </div>
        <label className="campo campo--chico">
          Desde
          <input type="date" value={rangoDesde} onChange={(e) => cambiarDesde(e.target.value)} />
        </label>
        <label className="campo campo--chico">
          Hasta
          <input type="date" value={rangoHasta} onChange={(e) => cambiarHasta(e.target.value)} />
        </label>
        {vista === 'resumen' && (
          <label className="campo campo--chico">
            Agrupar por
            <select value={agrupacion} onChange={(e) => setAgrupacion(e.target.value as AgrupacionReporte)}>
              <option value="dia">Día</option>
              <option value="semana">Semana</option>
              <option value="mes">Mes</option>
            </select>
          </label>
        )}
        <button
          className="boton boton--primario reportes__exportar"
          disabled={exportando || (vista === 'reposicion' && !reposicion?.categorias.length)}
          onClick={exportar}
        >
          {exportando ? 'Exportando...' : 'Exportar a Excel'}
        </button>
      </div>

      {mensaje && <div className="reportes__aviso">{mensaje}</div>}
      {error && <div className="reportes__error">{error}</div>}

      {vista === 'reposicion' && <ReposicionReporte resumen={reposicion} cargando={cargandoRep} />}

      {vista === 'resumen' && (
        <>
          <div className="reportes__tarjetas">
            <div className="tarjeta">
              <span className="tarjeta__etiqueta">Ventas en el período</span>
              <span className="tarjeta__valor">{totales.cantidad_ventas}</span>
            </div>
            <div className="tarjeta tarjeta--acento">
              <span className="tarjeta__etiqueta">Facturación total</span>
              <span className="tarjeta__valor">{formatearPesos(totales.facturacion)}</span>
            </div>
            {/* En rojo si el período dio pérdida: un signo menos se pasa por
                alto leyendo rápido, el color no. */}
            <div className={`tarjeta ${claseGanancia(totales.ganancia_neta)}`}>
              <span className="tarjeta__etiqueta">Ganancia neta total</span>
              <span className="tarjeta__valor">{formatearPesos(totales.ganancia_neta)}</span>
            </div>
          </div>

          <section className="reportes__seccion reportes__seccion--ventas">
            <h2>Ventas por {ETIQUETAS_AGRUPACION[agrupacion].toLowerCase()}</h2>
            <div className="reportes__tabla-contenedor">
              <table className="reportes__tabla">
                <thead>
                  <tr>
                    <th>Período</th>
                    <th>Ventas</th>
                    <th>Facturación</th>
                    <th>Ganancia bruta</th>
                    <th>Gastos</th>
                    <th>Ganancia neta</th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.map((f) => (
                    <tr key={f.periodo}>
                      <td>{f.periodo}</td>
                      <td>{f.cantidad_ventas}</td>
                      <td>{formatearPesos(f.facturacion)}</td>
                      <td>{formatearPesos(f.ganancia_bruta)}</td>
                      <td>{formatearPesos(f.gastos)}</td>
                      <td>{formatearPesos(f.ganancia_neta)}</td>
                    </tr>
                  ))}
                  {!cargando && ventas.length === 0 && (
                    <tr>
                      <td colSpan={6} className="reportes__vacio">
                        No hay ventas en este período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="reportes__columnas">
            <section className="reportes__seccion">
              <h2>Más vendidos (por unidades)</h2>
              <div className="reportes__tabla-contenedor">
                <table className="reportes__tabla">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Unidades</th>
                      <th>Facturación</th>
                      <th>Ganancia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {masVendidosPorUnidades.map((p) => (
                      <tr key={p.producto_id}>
                        <td>{p.nombre}</td>
                        <td>{p.unidades}</td>
                        <td>{formatearPesos(p.facturacion)}</td>
                        <td>{formatearPesos(p.ganancia)}</td>
                      </tr>
                    ))}
                    {!cargando && masVendidosPorUnidades.length === 0 && (
                      <tr>
                        <td colSpan={4} className="reportes__vacio">
                          No hay ventas en este período.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="reportes__seccion">
              <h2>Más rentables (por ganancia)</h2>
              <div className="reportes__tabla-contenedor">
                <table className="reportes__tabla">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Ganancia</th>
                      <th>Unidades</th>
                      <th>Facturación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {masRentables.map((p) => (
                      <tr key={p.producto_id}>
                        <td>{p.nombre}</td>
                        <td>{formatearPesos(p.ganancia)}</td>
                        <td>{p.unidades}</td>
                        <td>{formatearPesos(p.facturacion)}</td>
                      </tr>
                    ))}
                    {!cargando && masRentables.length === 0 && (
                      <tr>
                        <td colSpan={4} className="reportes__vacio">
                          No hay ventas en este período.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="reportes__seccion">
            <div className="reportes__seccion-titulo">
              <h2>Productos parados (plata dormida en el estante)</h2>
              <label className="campo campo--chico">
                Sin vender hace más de
                <div className="reportes__dias-input">
                  <input
                    type="number"
                    min="1"
                    value={diasSinVenta}
                    onChange={(e) => setDiasSinVenta(e.target.value)}
                  />
                  días
                </div>
              </label>
            </div>
            <div className="reportes__tabla-contenedor">
              <table className="reportes__tabla">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Stock</th>
                    <th>Valor inmovilizado</th>
                    <th>Última venta</th>
                  </tr>
                </thead>
                <tbody>
                  {parados.map((p) => (
                    <tr key={p.id}>
                      <td>{p.nombre}</td>
                      <td>{p.stock}</td>
                      <td>{formatearPesos(p.valor_stock)}</td>
                      <td>{p.ultima_venta ? `Hace ${p.dias_sin_venta} días` : 'Nunca se vendió'}</td>
                    </tr>
                  ))}
                  {parados.length === 0 && (
                    <tr>
                      <td colSpan={4} className="reportes__vacio">
                        No hay productos parados con ese criterio.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
